"use client";

import { useEffect, useState } from "react";
import {
    BarChart3, MessageSquare, Users, FolderKanban, TrendingUp,
    CheckCircle, Clock, AlertCircle, Plus, Briefcase, Calendar,
    X, ChevronRight, ArrowLeft, Zap, FileText
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { useNotifications } from "@/context/NotificationContext";
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, LineChart, Line, ResponsiveContainer
} from 'recharts';
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import {
  useNotifSubscription,
  requestNotificationPermission
} from "@/hooks/useNotifications";

export default function HeadPMDashboard() {
    const router = useRouter();

    // ── Notification system ──
    const { addNotification } = useNotifications();
    const [userProfile, setUserProfile] = useState(null);

    // ── Core state ──
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState("Dashboard");
    const [projects, setProjects] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [projectMembers, setProjectMembers] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);

    useNotifSubscription(user?.id, null);

    useEffect(() => {
        requestNotificationPermission();
    }, []);

    // ── Chat / notifications ──
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifGranted, setNotifGranted] = useState(false);

    // ── Project modal ──
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [newProject, setNewProject] = useState({
        name: "", description: "", start_date: "", end_date: "",
        status: "active", progress: 0, assigned_to: ""
    });

    // ── Task modal ──
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [sessionTasks, setSessionTasks] = useState([]);
    const [newTask, setNewTask] = useState({
        name: "", projectId: "", assignedToId: "", deadline: "", priority: "Medium",
    });

    // ── AI state ──
    const [aiReport, setAiReport] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);
    const [notification, setNotification] = useState(null);

    // ===== FETCH ALL DATA =====
    const fetchAllData = async (currentUser) => {
        try {
            const { data: projectsData, error: projectsError } = await supabase
                .from("projects").select("*").order("created_at", { ascending: false });
            if (projectsError) throw projectsError;
            setProjects(projectsData || []);

            const { data: profilesData, error: profilesError } = await supabase
                .from("profiles").select("id, email, full_name, role")
                .in("role", ["employee", "headpm"]);
            if (profilesError) throw profilesError;
            setEmployees((profilesData || []).map(p => ({
                id: p.id, full_name: p.full_name || p.email, email: p.email, role: p.role,
            })));

            const { data: membersData, error: membersError } = await supabase
                .from("project_members").select("project_id, user_id");
            if (membersError) console.error("members fetch error:", membersError);
            setProjectMembers(membersData || []);

            const { data: activitiesData, error: activitiesError } = await supabase
                .from("activity_logs").select("*").order("created_at", { ascending: false }).limit(50);
            if (activitiesError) setActivities([]);
            else setActivities(activitiesData || []);

            const { data: userTasks, error: userTasksError } = await supabase
                .from("tasks")
                .select("id, title, priority, deadline, status, assigned_user_id, project_id, created_at")
                .eq("created_by", currentUser?.id || null)
                .order("created_at", { ascending: false })
                .limit(50);
            if (!userTasksError) setSessionTasks(userTasks || []);

        } catch (err) {
            console.error("fetchAllData error:", err);
            setMessage({ type: "error", text: "Failed to load data from server." });
        }
    };

    // ===== BACKFILL ACTIVITY LOGS FOR PRE-EXISTING DATA =====
    // Runs once on init — creates activity log entries for projects/assignments
    // that were created before activity logging was implemented.
    const backfillActivityLogs = async (currentUser, projectsData, membersData, profilesData) => {
        try {
            // Check how many logs already exist
            const { data: existingLogs } = await supabase
                .from("activity_logs")
                .select("project_id, action")
                .limit(200);

            const loggedProjectCreations = new Set(
                (existingLogs || [])
                    .filter(l => l.action?.includes("Created project"))
                    .map(l => l.project_id)
            );
            const loggedAssignments = new Set(
                (existingLogs || [])
                    .filter(l => l.action?.includes("Assigned project"))
                    .map(l => l.project_id)
            );

            const logsToInsert = [];

            for (const project of (projectsData || [])) {
                // Backfill project creation log if missing
                if (!loggedProjectCreations.has(project.id)) {
                    logsToInsert.push({
                        user_id: project.created_by || currentUser.id,
                        project_id: project.id,
                        task_id: null,
                        action: `Created project "${project.name}"`,
                        created_at: project.created_at, // preserve original timestamp
                    });
                }

                // Backfill assignment log if missing
                const member = (membersData || []).find(m => m.project_id === project.id);
                if (member && !loggedAssignments.has(project.id)) {
                    const emp = (profilesData || []).find(p => p.id === member.user_id);
                    const empName = emp?.full_name || emp?.email || "an employee";
                    logsToInsert.push({
                        user_id: project.created_by || currentUser.id,
                        project_id: project.id,
                        task_id: null,
                        action: `Assigned project "${project.name}" to ${empName}`,
                        created_at: project.created_at,
                    });
                }
            }

            // Backfill task logs
            const { data: allTasks } = await supabase
                .from("tasks")
                .select("id, title, priority, deadline, project_id, assigned_user_id, created_by, created_at")
                .order("created_at", { ascending: false })
                .limit(100);

            const loggedTaskIds = new Set(
                (existingLogs || [])
                    .filter(l => l.action?.includes("Created task"))
                    .map(l => l.action?.match(/"(.+?)"/)?.[1])
                    .filter(Boolean)
            );

            for (const task of (allTasks || [])) {
                if (!loggedTaskIds.has(task.title)) {
                    const project = (projectsData || []).find(p => p.id === task.project_id);
                    const emp = (profilesData || []).find(p => p.id === task.assigned_user_id);
                    const empName = emp?.full_name || emp?.email || "an employee";
                    const projectName = project?.name || "Unknown Project";
                    logsToInsert.push({
                        user_id: task.created_by || currentUser.id,
                        project_id: task.project_id,
                        task_id: task.id,
                        action: `Created task "${task.title}" in "${projectName}" and assigned to ${empName} (Priority: ${task.priority}, Due: ${task.deadline})`,
                        created_at: task.created_at,
                    });
                }
            }

            if (logsToInsert.length > 0) {
                // Strip task_id from all entries to avoid schema errors if column doesn't exist
                const safeInserts = logsToInsert.map(({ task_id, ...rest }) => rest);
                const { error: bulkError } = await supabase.from("activity_logs").insert(safeInserts);
                if (bulkError) {
                    console.warn("Backfill insert error:", bulkError.message);
                }
            }
        } catch (err) {
            console.warn("Backfill error (non-critical):", err);
        }
    };

    // ===== INIT =====
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                const { data: sessionData } = await supabase.auth.getSession();
                const currentUser = sessionData?.session?.user || null;
                if (!currentUser) { router.replace("/login"); return; }

                const { data: profile, error: profileError } = await supabase
                    .from("profiles").select("role").eq("id", currentUser.id).single();
                if (profileError || !profile) { router.replace("/login"); return; }
                if (profile.role.toLowerCase() !== "headpm") { router.replace("/dashboard/employee"); return; }

                setUser(currentUser);

                // Fetch raw data first so backfill can use it before setState resolves
                const { data: projectsData } = await supabase
                    .from("projects").select("*").order("created_at", { ascending: false });
                const { data: membersData } = await supabase
                    .from("project_members").select("project_id, user_id");
                const { data: profilesData } = await supabase
                    .from("profiles").select("id, email, full_name, role")
                    .in("role", ["employee", "headpm"]);

                // Backfill logs for any pre-existing data silently
                await backfillActivityLogs(currentUser, projectsData, membersData, profilesData);

                // Now do the full data load (which will pick up backfilled logs too)
                await fetchAllData(currentUser);
            } catch (err) {
                console.error("init error:", err);
            }
            setLoading(false);
        };
        init();
    }, []);

    // ===== NOTIFICATION PERMISSION CHECK =====
    useEffect(() => {
        if (typeof Notification !== "undefined") {
            setNotifGranted(Notification.permission === "granted");
        }
    }, []);

    // ===== REALTIME UNREAD MESSAGE COUNTER =====
    useEffect(() => {
        if (!user) return;
        const channel = supabase
            .channel("unread-msgs")
            .on("postgres_changes", {
                event: "INSERT", schema: "public", table: "messages",
            }, (payload) => {
                if (payload.new.user_id !== user.id) {
                    setUnreadCount(prev => prev + 1);
                    if (Notification.permission === "granted") {
                        new Notification("💬 New Message - ProSynk", {
                            body: payload.new.message, icon: "/favicon.ico",
                        });
                    } else if (Notification.permission === "default") {
                        Notification.requestPermission();
                    }
                }
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [user]);

    // ===== REALTIME ACTIVITY LOG SUBSCRIPTION =====
    useEffect(() => {
        if (!user) return;
        const activityChannel = supabase
            .channel("realtime-activities")
            .on("postgres_changes", {
                event: "INSERT", schema: "public", table: "activity_logs",
            }, (payload) => {
                setActivities(prev => {
                    const alreadyExists = prev.some(a => a.id === payload.new.id);
                    if (alreadyExists) return prev;
                    return [payload.new, ...prev].slice(0, 50);
                });
            })
            .subscribe();
        return () => supabase.removeChannel(activityChannel);
    }, [user]);

    // ===== HELPERS =====
    const getAssignedEmployee = (projectId) => {
        const member = projectMembers.find(m => m.project_id === projectId);
        if (!member) return null;
        const emp = employees.find(e => e.id === member.user_id);
        return emp?.full_name || null;
    };

    const enableNotifications = async () => {
        if (typeof Notification === "undefined") return;
        const result = await Notification.requestPermission();
        setNotifGranted(result === "granted");
        if (result === "granted") {
            new Notification("✅ ProSynk", {
                body: "Notifications enabled! You will be alerted on new messages.",
                icon: "/favicon.ico",
            });
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "active": return "text-blue-400 bg-blue-400/20 border-blue-400/30";
            case "completed": return "text-green-400 bg-green-400/20 border-green-400/30";
            case "on_hold": return "text-yellow-400 bg-yellow-400/20 border-yellow-400/30";
            default: return "text-[#a8c4e0] bg-[#3a5779]/30 border-[#3a5779]/30";
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case "active": return "Active";
            case "completed": return "Completed";
            case "on_hold": return "On Hold";
            default: return status;
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case "High": return "bg-red-500/30 text-red-300";
            case "Medium": return "bg-yellow-500/30 text-yellow-300";
            case "Low": return "bg-green-500/30 text-green-300";
            default: return "bg-slate-500/30 text-slate-300";
        }
    };

    const getActivityIcon = (action) => {
        if (!action) return <Clock className="w-5 h-5 text-slate-400" />;
        const a = action.toLowerCase();
        if (a.includes("deleted") || a.includes("delete")) return <X className="w-5 h-5 text-red-400" />;
        if (a.includes("assigned") || a.includes("unassigned")) return <Users className="w-5 h-5 text-purple-400" />;
        if (a.includes("created") && a.includes("project")) return <FolderKanban className="w-5 h-5 text-green-400" />;
        if (a.includes("created") && a.includes("task")) return <CheckCircle className="w-5 h-5 text-blue-400" />;
        if (a.includes("task")) return <Briefcase className="w-5 h-5 text-blue-400" />;
        if (a.includes("team")) return <Users className="w-5 h-5 text-[#a8c4e0]" />;
        if (a.includes("created")) return <CheckCircle className="w-5 h-5 text-green-400" />;
        return <Clock className="w-5 h-5 text-slate-400" />;
    };

    // ===== LOG ACTIVITY HELPER =====
    const logActivity = async (action, projectId = null, taskId = null) => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData?.user) return;

            // Try inserting with task_id first; if column doesn't exist, retry without it
            const fullPayload = { user_id: userData.user.id, project_id: projectId, action, ...(taskId ? { task_id: taskId } : {}) };
            const { error: insertError } = await supabase.from("activity_logs").insert([fullPayload]);

            if (insertError) {
                // Retry without task_id in case the column doesn't exist in this schema
                const { error: retryError } = await supabase.from("activity_logs").insert([{
                    user_id: userData.user.id, project_id: projectId, action,
                }]);
                if (retryError) { console.warn("activity log retry error:", retryError.message); return; }
            }

            // Immediately refresh the activities feed
            const { data: activitiesData } = await supabase
                .from("activity_logs")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);
            if (activitiesData) setActivities(activitiesData);
        } catch (e) {
            console.warn("activity log error:", e);
        }
    };

    const downloadPDF = () => {
        const loadJsPDF = () => new Promise((resolve, reject) => {
            if (window.jspdf) { resolve(window.jspdf.jsPDF); return; }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => resolve(window.jspdf.jsPDF);
            script.onerror = reject;
            document.head.appendChild(script);
        });

        loadJsPDF().then((jsPDF) => {
            const doc = new jsPDF({ unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const margin = 15;
            const maxW = pageW - margin * 2;
            let y = 20;

            const addText = (text, size = 11, bold = false, color = [30, 30, 30]) => {
                doc.setFontSize(size);
                doc.setFont('helvetica', bold ? 'bold' : 'normal');
                doc.setTextColor(...color);
                const lines = doc.splitTextToSize(String(text || ''), maxW);
                lines.forEach(line => {
                    if (y > 275) { doc.addPage(); y = 20; }
                    doc.text(line, margin, y);
                    y += size * 0.45;
                });
                y += 3;
            };

            const addDivider = () => {
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, y, pageW - margin, y);
                y += 6;
            };

            doc.setFillColor(17, 31, 46);
            doc.rect(0, 0, pageW, 30, 'F');
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(168, 196, 224);
            doc.text('ProSynk', margin, 13);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(180, 180, 180);
            doc.text(aiReport?.reminders ? 'AI Project Insights Report' : 'Technical Audit Report', margin, 21);
            doc.setTextColor(150, 150, 150);
            doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - margin, 21, { align: 'right' });
            y = 40;

            addText(aiReport?.reminders ? 'Executive Summary' : 'Internal Audit Findings', 13, true, [30, 80, 160]);
            addDivider();
            addText(aiReport?.summary || 'No summary available.');
            y += 4;

            if (aiReport?.reminders?.length) {
                addText('Smart Reminders', 13, true, [30, 80, 160]);
                addDivider();
                aiReport.reminders.forEach((item, i) => {
                    addText(`${i + 1}. ${item.task}`, 11, true);
                    addText(`   "${item.reason}"`, 10, false, [100, 100, 100]);
                    y += 2;
                });
                y += 4;
            }

            if (aiReport?.predictions?.length) {
                addText('Risk Assessment', 13, true, [30, 80, 160]);
                addDivider();
                aiReport.predictions.forEach((pred) => {
                    const risk = pred.risk_score || 0;
                    const color = risk > 70 ? [200, 50, 50] : risk > 40 ? [200, 140, 0] : [50, 160, 50];
                    addText(`${pred.project_name}`, 11, true);
                    addText(`Risk Score: ${risk}%`, 10, false, color);
                    y += 2;
                });
                y += 4;
            }

            if (projects.length) {
                addText('Project Snapshot', 13, true, [30, 80, 160]);
                addDivider();
                projects.forEach((p) => {
                    addText(`• ${p.name} — ${p.status?.toUpperCase()} — ${p.progress || 0}% complete`, 10);
                });
                y += 4;
            }

            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(160, 160, 160);
                doc.text(`ProSynk Report  •  Page ${i} of ${totalPages}`, pageW / 2, 290, { align: 'center' });
            }

            doc.save(`ProSynk_Report_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`);
        }).catch(() => {
            setMessage({ type: 'error', text: 'Failed to load PDF library. Check your internet connection.' });
        });
    };

    // ===== AI HANDLERS =====
    const handleGenerateAI = async () => {
        setMessage(null);
        setAiReport(null);
        if (projects.length === 0) {
            setMessage({ type: "error", text: "No projects found!" });
            return;
        }
        setAiLoading(true);
        try {
            const response = await fetch("/api/ai/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projects, tasks: sessionTasks, requestType: "insight" }),
            });
            const data = await response.json();
            if (data.success) {
                const parsedData = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
                setAiReport({ ...parsedData, is_detailed: false });
                setShowAIModal(true);

                if (parsedData?.predictions?.length) {
                    parsedData.predictions.forEach(pred => {
                        const risk = pred.risk_score || 0;
                        if (risk >= 60) {
                            addNotification({
                                type: 'risk',
                                title: `🚨 High Risk: ${pred.project_name}`,
                                body: `Risk score is ${risk}% — immediate attention required.`,
                                href: '/dashboard/headpm',
                            });
                        } else if (risk >= 30) {
                            addNotification({
                                type: 'ai',
                                title: `⚠️ Moderate Risk: ${pred.project_name}`,
                                body: `Risk score is ${risk}% — monitor closely.`,
                                href: '/dashboard/headpm',
                            });
                        }
                    });
                }

                addNotification({
                    type: 'ai',
                    title: '✨ AI Insights Generated',
                    body: parsedData?.summary?.slice(0, 100) + '...' || 'New AI analysis ready.',
                    href: '/dashboard/headpm',
                });

                // ✅ Log AI insight generation
                await logActivity("Generated AI project insights report");
            } else {
                throw new Error(data.error || "Failed to generate insights.");
            }
        } catch (error) {
            console.error("AI error:", error);
            setMessage({ type: "error", text: error.message || "Connection error." });
        } finally {
            setAiLoading(false);
        }
    };

    const handleGenerateDetailedReport = async () => {
        setMessage(null);
        setAiReport(null);
        if (projects.length === 0) {
            setMessage({ type: "error", text: "No projects found!" });
            return;
        }
        setAiLoading(true);
        try {
            const response = await fetch("/api/ai/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projects, tasks: sessionTasks, requestType: "detailed_report" }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error("Server error:", errorText);
                throw new Error(`Server Error: ${response.status}`);
            }
            const data = await response.json();
            if (data.success) {
                const parsedData = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
                setAiReport({ ...parsedData, is_detailed: true });
                setShowAIModal(true);

                addNotification({
                    type: 'ai',
                    title: '📊 Detailed AI Report Ready',
                    body: parsedData?.summary?.slice(0, 100) + '...' || 'Technical audit report generated.',
                    href: '/dashboard/headpm',
                });

                // ✅ Log detailed report generation
                await logActivity("Generated detailed AI technical audit report");
            } else {
                throw new Error(data.error || "Failed to generate report.");
            }
        } catch (error) {
            setMessage({
                type: "error",
                text: "Failed to connect to the AI agent. Please try again.",
            });
        } finally {
            setAiLoading(false);
        }
    };

    const handleSaveReport = async (reportData) => {
        try {
            const { error } = await supabase.from("ai_reports").insert([{
                report_text: reportData.summary,
            }]);
            if (error) { console.error("Supabase Error:", error.message); return; }

            const reportLabel = reportData?.reminders ? "AI Insights" : "Detailed AI Report";
            setNotification(`${reportLabel} saved successfully!`);

            // ✅ Log report saved
            await logActivity(`Saved ${reportLabel} to history`);

            setShowAIModal(false);
            setTimeout(() => setNotification(null), 3000);
        } catch (err) {
            console.error("Unexpected error:", err);
        }
    };

    // ===== CREATE PROJECT =====
    const handleCreateProject = async () => {
        setMessage(null);
        if (!newProject.name || !newProject.description) {
            setMessage({ type: "error", text: "Project name and description are required." });
            return;
        }
        try {
            const { data: userData } = await supabase.auth.getUser();
            const { data, error } = await supabase.from("projects").insert([{
                name: newProject.name,
                description: newProject.description,
                start_date: newProject.start_date || null,
                end_date: newProject.end_date || null,
                status: newProject.status,
                progress: newProject.progress,
                created_by: userData.user.id,
            }]).select().single();
            if (error) throw error;

            // ✅ Close modal and reset form immediately — don't wait for async work
            setShowProjectModal(false);
            setNewProject({ name: "", description: "", start_date: "", end_date: "", status: "active", progress: 0, assigned_to: "" });
            setMessage({ type: "success", text: `Project "${data.name}" created successfully.` });

            // ✅ Log project creation
            await logActivity(`Created project "${data.name}"`, data.id);

            if (newProject.assigned_to) {
                const { error: memberError } = await supabase.from("project_members").insert([{
                    project_id: data.id, user_id: newProject.assigned_to, role: "employee",
                }]);
                if (memberError) {
                    setMessage({ type: "error", text: `Project created but assignment failed: ${memberError.message}` });
                } else {
                    // ✅ Log assignment separately
                    const assignedName = employees.find(e => e.id === newProject.assigned_to)?.full_name || newProject.assigned_to;
                    await logActivity(`Assigned project "${data.name}" to ${assignedName}`, data.id);
                }
            }

            await fetchAllData(userData.user);
        } catch (error) {
            setMessage({ type: "error", text: `Failed to create project: ${error.message}` });
        }
    };

    // ===== ADD TASK =====
    const handleAddTask = async () => {
        setMessage(null);
        if (!newTask.name || !newTask.projectId || !newTask.assignedToId || !newTask.deadline) {
            setMessage({ type: "error", text: "All task fields are required." });
            return;
        }
        try {
            const { data: userData } = await supabase.auth.getUser();
            const { data, error } = await supabase.from("tasks").insert([{
                title: newTask.name, description: null,
                project_id: newTask.projectId, assigned_user_id: newTask.assignedToId,
                deadline: newTask.deadline, priority: newTask.priority,
                status: "Pending", created_by: userData.user.id,
            }]).select().single();
            if (error) throw error;

            const assignedEmployee = employees.find(e => e.id === newTask.assignedToId)?.full_name || newTask.assignedToId;
            const projectName = projects.find(p => p.id === newTask.projectId)?.name || "Unknown Project";

            // ✅ Close modal and reset immediately
            setShowTaskModal(false);
            setNewTask({ name: "", projectId: projects.length > 0 ? projects[0].id : "", assignedToId: employees.length > 0 ? employees[0].id : "", deadline: "", priority: "Medium" });
            setMessage({
                type: "success",
                text: `Task "${data.title}" assigned to ${assignedEmployee} (Priority: ${data.priority}, Due: ${data.deadline}).`,
            });

            // ✅ Log task creation with full details
            await logActivity(
                `Created task "${data.title}" in "${projectName}" and assigned to ${assignedEmployee} (Priority: ${data.priority}, Due: ${data.deadline})`,
                data.project_id,
                data.id
            );

            const { data: userTasks, error: userTasksError } = await supabase
                .from("tasks")
                .select("id, title, priority, deadline, status, assigned_user_id, project_id, created_at")
                .eq("created_by", userData.user.id)
                .order("created_at", { ascending: false }).limit(50);
            if (!userTasksError) setSessionTasks(userTasks || []);
        } catch (error) {
            setMessage({ type: "error", text: "Failed to add task." });
        }
    };

    // ===== DELETE PROJECT =====
    const handleDeleteProject = async (id) => {
        const projectName = projects.find(p => p.id === id)?.name || "Unknown";
        const assignedMember = projectMembers.find(m => m.project_id === id);
        const assignedEmployee = assignedMember
            ? employees.find(e => e.id === assignedMember.user_id)?.full_name || "an employee"
            : null;

        await supabase.from("project_members").delete().eq("project_id", id);
        const { error } = await supabase.from("projects").delete().eq("id", id);

        if (error) {
            setMessage({ type: "error", text: "Failed to delete project." });
        } else {
            setProjects(prev => prev.filter(p => p.id !== id));
            setProjectMembers(prev => prev.filter(m => m.project_id !== id));
            setSelectedProject(null);
            setMessage({ type: "success", text: "Project deleted successfully." });

            // ✅ Log project deletion
            await logActivity(`Deleted project "${projectName}"`);

            // ✅ Log unassignment if there was one
            if (assignedEmployee) {
                await logActivity(`Unassigned "${assignedEmployee}" from project "${projectName}" (project deleted)`);
            }
        }
        setConfirmDeleteId(null);
    };

    // ===== NAV =====
    const navItems = [
        { name: "Dashboard", icon: BarChart3 },
        { name: "Projects", icon: FolderKanban },
        { name: "Teams", icon: Users },
        { name: "Analytics", icon: TrendingUp },
        { name: "Chat", icon: MessageSquare, isLink: true, href: "/chat" },
    ];

    // ===== TAB CONTENT =====
    const DashboardContent = () => (
        <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {[
                    { label: "Total Projects", value: projects.length, icon: FolderKanban, color: "text-[#a8c4e0]", bg: "from-blue-500/20 to-blue-600/10" },
                    { label: "Team Members", value: employees.filter(e => e.role === "employee").length, icon: Users, color: "text-purple-400", bg: "from-purple-500/20 to-purple-600/10" },
                    { label: "Active Projects", value: projects.filter(p => p.status === "active").length, icon: CheckCircle, color: "text-green-400", bg: "from-green-500/20 to-green-600/10" },
                    {
                        label: "Avg Completion",
                        value: projects.length ? `${Math.round(projects.reduce((s, p) => s + (Number(p.progress) || 0), 0) / projects.length)}%` : "0%",
                        icon: TrendingUp, color: "text-yellow-400", bg: "from-yellow-500/20 to-yellow-600/10",
                    },
                ].map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                        <div key={i} className={`p-6 rounded-2xl shadow-xl border border-white/10 bg-gradient-to-br ${stat.bg} backdrop-blur-xl hover:scale-105 transition-transform`}>
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-slate-300 text-sm font-medium">{stat.label}</h3>
                                <div className="p-2 rounded-lg bg-white/10"><Icon className={`w-5 h-5 ${stat.color}`} /></div>
                            </div>
                            <p className={`text-4xl font-bold ${stat.color}`}>{stat.value}</p>
                        </div>
                    );
                })}
            </div>

            {/* ── AI Section ── */}
            <div className="p-6 rounded-2xl shadow-xl border border-indigo-500/30 mb-8"
                style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(58,87,121,0.25) 100%)" }}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold flex items-center gap-2 text-indigo-300">
                            <Zap className="w-6 h-6 text-yellow-400" /> ProSynk Agentic AI
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">Predictive analysis, risk assessment & detailed audit reports</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={handleGenerateAI}
                            disabled={aiLoading}
                            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 shadow-lg ${aiLoading ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                                : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                                }`}
                        >
                            {aiLoading ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <Zap className="w-4 h-4 text-yellow-400" />}
                            {aiLoading ? "Analyzing..." : "AI Insights"}
                        </button>
                        <button
                            onClick={handleGenerateDetailedReport}
                            disabled={aiLoading}
                            className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 shadow-lg ${aiLoading ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                                : "bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white"
                                }`}
                        >
                            {aiLoading ? <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                            {aiLoading ? "Generating..." : "Detailed Report"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Projects Overview */}
            <div className="p-6 backdrop-blur-xl rounded-2xl shadow-xl border border-white/10 mb-6" style={{ backgroundColor: "rgba(58,87,121,0.25)" }}>
                <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                    <FolderKanban className="w-6 h-6 text-[#a8c4e0]" /> Active Projects
                </h2>
                {projects.length === 0 ? (
                    <div className="text-center py-12">
                        <FolderKanban className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No projects yet. Click "Create Project" to get started.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {projects.map((project) => {
                            const assignedName = getAssignedEmployee(project.id);
                            return (
                                <div key={project.id} className="p-5 rounded-xl border border-white/10 hover:border-[#3a5779] transition-all group" style={{ backgroundColor: "rgba(58,87,121,0.15)" }}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(project.status)}`}>
                                                    {getStatusLabel(project.status)}
                                                </span>
                                            </div>
                                            {project.description && <p className="text-sm text-slate-400 mb-2">{project.description}</p>}
                                            <div className="flex items-center gap-3 flex-wrap">
                                                {assignedName ? (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#3a5779]/50 text-[#a8c4e0] text-xs">
                                                        <Users className="w-3 h-3" /> Assigned to <span className="font-semibold ml-0.5">{assignedName}</span>
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-400 text-xs">
                                                        <Users className="w-3 h-3" /> Unassigned
                                                    </span>
                                                )}
                                                {project.start_date && (
                                                    <span className="flex items-center gap-1 text-slate-500 text-xs">
                                                        <Calendar className="w-3 h-3" /> {project.start_date} → {project.end_date || "TBD"}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button onClick={() => setConfirmDeleteId(project.id)}
                                            className="opacity-0 group-hover:opacity-100 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs font-medium transition-all ml-4">
                                            Delete
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 bg-white/10 rounded-full h-2">
                                            <div className="h-2 rounded-full transition-all"
                                                style={{ background: "linear-gradient(to right, #3a5779, #5a8ab0)", width: `${Number(project.progress) || 0}%` }} />
                                        </div>
                                        <span className="text-xs text-slate-400 w-10 text-right">{Number(project.progress) || 0}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Recent Activities */}
            <div className="p-6 backdrop-blur-xl rounded-2xl shadow-xl border border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.25)" }}>
                <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                    <Clock className="w-6 h-6 text-[#a8c4e0]" /> Recent Activities
                </h2>
                {activities.length === 0 ? (
                    <div className="text-center py-8">
                        <Clock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400 text-sm">No activities yet. Create a project or task to get started.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {activities.map((activity) => (
                            <div key={activity.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors">
                                <div className="mt-0.5 p-1.5 rounded-lg bg-white/10 shrink-0">{getActivityIcon(activity.action)}</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-slate-200 text-sm leading-snug">{activity.action || "Activity"}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{new Date(activity.created_at).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );

    const ProjectsContent = () => {
        if (selectedProject) {
            const assignedName = getAssignedEmployee(selectedProject.id);
            const latestProject = projects.find(p => p.id === selectedProject.id) || selectedProject;
            return (
                <div className="p-6 backdrop-blur-xl rounded-2xl shadow-xl border border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.25)" }}>
                    <button onClick={() => setSelectedProject(null)}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm">
                        <ArrowLeft className="w-4 h-4" /> Back to Projects
                    </button>
                    <div className="flex items-start justify-between mb-8">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-3xl font-bold text-white">{latestProject.name}</h2>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(latestProject.status)}`}>
                                    {getStatusLabel(latestProject.status)}
                                </span>
                            </div>
                            {latestProject.description && <p className="text-slate-400">{latestProject.description}</p>}
                        </div>
                        <button onClick={() => setConfirmDeleteId(latestProject.id)}
                            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            Delete Project
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="p-5 rounded-xl border border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.2)" }}>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Assigned To</p>
                            {assignedName ? (
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-[#3a5779] flex items-center justify-center text-white font-bold text-sm">
                                        {assignedName.charAt(0)}
                                    </div>
                                    <p className="text-white font-semibold">{assignedName}</p>
                                </div>
                            ) : (
                                <p className="text-slate-400">Unassigned</p>
                            )}
                        </div>
                        <div className="p-5 rounded-xl border border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.2)" }}>
                            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Timeline</p>
                            <div className="flex items-center gap-2 text-white">
                                <Calendar className="w-4 h-4 text-[#a8c4e0]" />
                                <span>{latestProject.start_date || "—"}</span>
                                <span className="text-slate-500">→</span>
                                <span>{latestProject.end_date || "TBD"}</span>
                            </div>
                        </div>
                        <div className="p-5 rounded-xl border border-white/10 md:col-span-2" style={{ backgroundColor: "rgba(58,87,121,0.2)" }}>
                            <div className="flex justify-between items-center mb-3">
                                <p className="text-xs text-slate-500 uppercase tracking-wider">Progress</p>
                                <span className="text-2xl font-bold text-white">{Number(latestProject.progress) || 0}%</span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-3">
                                <div className="h-3 rounded-full transition-all"
                                    style={{ background: "linear-gradient(to right, #3a5779, #5a8ab0)", width: `${Number(latestProject.progress) || 0}%` }} />
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">
                        Created by: {employees.find(e => e.id === latestProject.created_by)?.full_name || "HeadPM"}
                    </p>
                </div>
            );
        }

        return (
            <div className="p-6 backdrop-blur-xl rounded-2xl shadow-xl border border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.25)" }}>
                <h2 className="text-3xl font-bold mb-2 text-white flex items-center gap-2">
                    <FolderKanban className="w-7 h-7 text-[#a8c4e0]" /> Projects
                </h2>
                <p className="text-slate-400 text-sm mb-6">Click on a project to view its details</p>
                {projects.length === 0 ? (
                    <p className="text-slate-400">No projects found.</p>
                ) : (
                    <ul className="space-y-2">
                        {projects.map(p => (
                            <li key={p.id} onClick={() => setSelectedProject(p)}
                                className="p-4 rounded-xl border border-white/10 hover:border-[#5a8ab0] hover:bg-[#3a5779]/30 transition-all cursor-pointer flex items-center justify-between group"
                                style={{ backgroundColor: "rgba(58,87,121,0.15)" }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-[#5a8ab0]" />
                                    <span className="font-semibold text-white group-hover:text-[#a8c4e0] transition-colors">{p.name}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(p.status)}`}>
                                        {getStatusLabel(p.status)}
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    };

    const TeamsContent = () => (
        <div className="p-6 backdrop-blur-xl rounded-2xl shadow-xl border border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.25)" }}>
            <h2 className="text-3xl font-bold mb-6 text-white flex items-center gap-2">
                <Users className="w-7 h-7 text-[#a8c4e0]" /> Team Members
            </h2>
            {employees.filter(e => e.role === "employee").length === 0 ? (
                <p className="text-slate-400">No employees found.</p>
            ) : (
                <ul className="space-y-2">
                    {employees.filter(e => e.role === "employee").map(e => {
                        const assignedProjects = projectMembers
                            .filter(m => m.user_id === e.id)
                            .map(m => projects.find(p => p.id === m.project_id)?.name)
                            .filter(Boolean);
                        return (
                            <li key={e.id} className="p-4 rounded-lg border border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.2)" }}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="font-semibold text-white">{e.full_name}</span>
                                        <p className="text-xs text-slate-400">{e.email}</p>
                                        {assignedProjects.length > 0 && (
                                            <p className="text-xs text-[#a8c4e0] mt-1">Projects: {assignedProjects.join(", ")}</p>
                                        )}
                                    </div>
                                    <span className="text-xs text-slate-400 bg-white/10 px-2 py-1 rounded-full capitalize">{e.role}</span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );

    const AnalyticsContent = () => {
        const overallProgress = projects.length
            ? Math.round(projects.reduce((s, p) => s + (Number(p.progress) || 0), 0) / projects.length) : 0;
        const plannedProgress = 50;
        const COLORS = ["#00CFFF", "#00AEEF", "#48CAE4", "#90E0EF", "#5E60CE"];
        const projectChartData = projects.map(p => ({
            name: p.name.length > 12 ? p.name.slice(0, 12) + "..." : p.name,
            Planned: plannedProgress, Actual: Number(p.progress) || 0,
        }));
        const sCurveData = [
            { month: "Jun", Planned: 2, Actual: 1 }, { month: "Jul", Planned: 5, Actual: 3 },
            { month: "Aug", Planned: 10, Actual: 7 }, { month: "Sep", Planned: 18, Actual: overallProgress },
        ];
        const spiTrend = [
            { month: "Jul", SPI: 1 }, { month: "Aug", SPI: 0.98 },
            { month: "Sep", SPI: overallProgress > 0 ? parseFloat((overallProgress / plannedProgress).toFixed(2)) : 0.95 },
        ];
        const taskStatusData = [
            { name: "Active", value: projects.filter(p => p.status === "active").length || 1 },
            { name: "Completed", value: projects.filter(p => p.status === "completed").length || 0 },
        ];
        return (
            <div className="text-white w-full grid grid-cols-2 gap-4">
                <div className="col-span-2 bg-[#163853] p-4 rounded border border-[#1685C4]">
                    <h3 className="font-bold mb-1">Overall Progress</h3>
                    <div className="text-3xl font-bold">{overallProgress}%</div>
                    <div className="text-[#48CAE4]">Against Plan of {plannedProgress}%</div>
                </div>
                <div className="bg-[#163853] p-3 rounded border border-[#1685C4]">
                    <h3 className="font-bold mb-2">Project Plan vs Actual</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={projectChartData}>
                            <CartesianGrid stroke="#1685C4" strokeDasharray="3 3" />
                            <XAxis dataKey="name" stroke="#FFFFFF" height={20} />
                            <YAxis stroke="#FFFFFF" />
                            <Tooltip contentStyle={{ backgroundColor: "#163853", borderColor: "#1685C4" }} />
                            <Legend wrapperStyle={{ color: "#FFFFFF" }} />
                            <Bar dataKey="Planned" fill="#00AEEF" />
                            <Bar dataKey="Actual" fill="#48CAE4" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-[#163853] p-3 rounded border border-[#1685C4]">
                    <h3 className="font-bold mb-2">S-Curve</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={sCurveData}>
                            <CartesianGrid stroke="#1685C4" strokeDasharray="3 3" />
                            <XAxis dataKey="month" stroke="#FFFFFF" />
                            <YAxis stroke="#FFFFFF" />
                            <Tooltip contentStyle={{ backgroundColor: "#163853", borderColor: "#1685C4" }} />
                            <Legend wrapperStyle={{ color: "#FFFFFF" }} />
                            <Line type="monotone" dataKey="Planned" stroke="#00CFFF" strokeWidth={3} />
                            <Line type="monotone" dataKey="Actual" stroke="#48CAE4" strokeWidth={3} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-[#163853] p-3 rounded border border-[#1685C4]">
                    <h3 className="font-bold mb-2">SPI Trend</h3>
                    <ResponsiveContainer width="100%" height={170}>
                        <LineChart data={spiTrend}>
                            <CartesianGrid stroke="#1685C4" strokeDasharray="3 3" />
                            <XAxis dataKey="month" stroke="#FFFFFF" />
                            <YAxis stroke="#FFFFFF" />
                            <Tooltip contentStyle={{ backgroundColor: "#163853", borderColor: "#1685C4" }} />
                            <Line type="monotone" dataKey="SPI" stroke="#5E60CE" strokeWidth={3} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-[#163853] p-3 rounded border border-[#1685C4]">
                    <h3 className="font-bold mb-2">Project Status</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                            <Pie data={taskStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label>
                                {taskStatusData.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: "#163853", borderColor: "#1685C4" }} />
                            <Legend wrapperStyle={{ color: "#FFFFFF" }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (loading) return <div className="text-center py-8 text-slate-400">Loading data...</div>;
        switch (activeTab) {
            case "Dashboard": return <DashboardContent />;
            case "Projects": return <ProjectsContent />;
            case "Teams": return <TeamsContent />;
            case "Analytics": return <AnalyticsContent />;
            default: return <DashboardContent />;
        }
    };

    // ===== RENDER =====
    return (
        <div className="flex min-h-screen bg-[#1a2a3a] text-white">

            {/* ── Toast Notification ── */}
            {notification && (
                <div className="fixed top-6 right-6 z-[999] animate-in slide-in-from-right-10 duration-300">
                    <div className="bg-emerald-900/90 border border-emerald-500/50 backdrop-blur-md text-emerald-100 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3">
                        <div className="bg-emerald-500 rounded-full p-1">
                            <svg className="w-4 h-4 text-emerald-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="font-semibold text-sm">{notification}</p>
                    </div>
                </div>
            )}

            {/* ── AI Loading Overlay ── */}
            {aiLoading && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[110] flex flex-col items-center justify-center">
                    <div className="relative">
                        <div className="w-20 h-20 bg-indigo-600/20 rounded-full flex items-center justify-center animate-pulse">
                            <Zap className="w-10 h-10 text-indigo-400" />
                        </div>
                        <div className="absolute inset-0 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                    <h3 className="mt-6 text-xl font-bold text-white">ProSynk AI at work...</h3>
                    <p className="text-slate-400 mt-2 animate-bounce">Analyzing project velocity and risks</p>
                </div>
            )}

            {/* ── Sidebar ── */}
            <div className="w-64 backdrop-blur-xl p-6 shadow-2xl border-r border-white/10 flex flex-col h-screen sticky top-0"
                style={{ backgroundColor: "rgba(30,50,70,0.75)" }}>
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#3a5779" }}>
                        <span className="text-xl font-bold">P</span>
                    </div>
                    <h2 className="text-2xl font-bold">ProSynk</h2>
                </div>

                <nav className="space-y-2 flex-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        if (item.isLink) {
                            return (
                                <button key={item.name}
                                    onClick={() => { setUnreadCount(0); router.push(item.href); }}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-white/10 text-slate-300 relative">
                                    <Icon className="w-5 h-5" />
                                    <span className="font-medium">{item.name}</span>
                                    {unreadCount > 0 && (
                                        <span className="absolute right-3 top-1.5 bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 animate-pulse">
                                            {unreadCount > 99 ? "99+" : unreadCount}
                                        </span>
                                    )}
                                </button>
                            );
                        }
                        return (
                            <button key={item.name}
                                onClick={() => { setActiveTab(item.name); setSelectedProject(null); }}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${activeTab === item.name ? "text-white shadow-lg bg-[#3a5779]/60" : "hover:bg-white/10 text-slate-300"
                                    }`}>
                                <Icon className="w-5 h-5" />
                                <span className="font-medium">{item.name}</span>
                            </button>
                        );
                    })}
                </nav>

                <button onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
                    className="w-full p-3 bg-gradient-to-r from-red-600 to-red-700 rounded-lg hover:from-red-700 hover:to-red-800 transition-all shadow-lg font-medium mt-4">
                    Logout
                </button>
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 p-8 overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold">Head PM Dashboard</h1>
                        <p className="text-slate-400 mt-1">Manage all projects and teams</p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                        <NotificationBell />
                        <button onClick={() => setShowProjectModal(true)}
                            className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 shadow-lg hover:opacity-90"
                            style={{ backgroundColor: "#3a5779" }}>
                            <Plus className="w-5 h-5" /> Create Project
                        </button>

                        {!notifGranted && (
                            <button onClick={enableNotifications}
                                className="px-4 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2 shadow-lg hover:opacity-90"
                                style={{ backgroundColor: "#1685C4" }}>
                                🔔 Enable Alerts
                            </button>
                        )}
                        <div className="backdrop-blur-xl px-5 py-3 rounded-xl shadow-lg border border-white/10" style={{ backgroundColor: "rgba(30,50,70,0.7)" }}>
                            <p className="text-xs text-slate-400">Signed in as</p>
                            <p className="text-[#a8c4e0] font-medium text-sm">{user?.email}</p>
                        </div>
                    </div>
                </div>

                {message && (
                    <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${message.type === "success" ? "bg-green-900/50 border border-green-500 text-green-300" : "bg-red-900/50 border border-red-500 text-red-300"
                        }`}>
                        {message.type === "success" ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <p className="font-medium flex-1">{message.text}</p>
                        <button onClick={() => setMessage(null)}><X className="w-4 h-4" /></button>
                    </div>
                )}

                <main>{renderContent()}</main>
            </div>

            {/* ── Delete Confirm Modal ── */}
            {confirmDeleteId && (
                <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center">
                    <div className="p-6 rounded-xl w-[400px] border border-red-500/30" style={{ backgroundColor: "#1e3247" }}>
                        <h2 className="text-lg font-bold mb-2">Delete Project?</h2>
                        <p className="text-slate-400 text-sm mb-6">This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-sm text-slate-300 rounded-lg" style={{ backgroundColor: "#2a4a64" }}>Cancel</button>
                            <button onClick={() => handleDeleteProject(confirmDeleteId)} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg">Yes, Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create Project Modal ── */}
            {showProjectModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="w-full max-w-2xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden" style={{ backgroundColor: "#111f2e" }}>
                        <div className="px-8 py-6 border-b border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.3)" }}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg" style={{ backgroundColor: "#3a5779" }}>
                                        <Briefcase className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Create New Project</h2>
                                        <p className="text-slate-400 text-sm">Fill in the details to get started</p>
                                    </div>
                                </div>
                                <button onClick={() => { setShowProjectModal(false); setMessage(null); }}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="px-8 py-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Project Name <span className="text-red-400">*</span></label>
                                <input type="text" placeholder="e.g. Website Redesign"
                                    value={newProject.name}
                                    onChange={(e) => setNewProject(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full p-3 rounded-xl text-white placeholder-slate-500 border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                    style={{ backgroundColor: "#1a2f42" }} />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Description <span className="text-red-400">*</span></label>
                                <textarea placeholder="Briefly describe the project goals..."
                                    value={newProject.description} rows={3}
                                    onChange={(e) => setNewProject(prev => ({ ...prev, description: e.target.value }))}
                                    className="w-full p-3 rounded-xl text-white placeholder-slate-500 border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors resize-none"
                                    style={{ backgroundColor: "#1a2f42" }} />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                                    <Calendar className="w-4 h-4" /> Timeline
                                </label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1.5">Start Date</p>
                                        <input type="date" value={newProject.start_date}
                                            onChange={(e) => setNewProject(prev => ({ ...prev, start_date: e.target.value }))}
                                            className="w-full p-3 rounded-xl text-white border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                            style={{ backgroundColor: "#1a2f42" }} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1.5">End Date</p>
                                        <input type="date" value={newProject.end_date}
                                            onChange={(e) => setNewProject(prev => ({ ...prev, end_date: e.target.value }))}
                                            className="w-full p-3 rounded-xl text-white border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                            style={{ backgroundColor: "#1a2f42" }} />
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-300 mb-2">Status</label>
                                    <select value={newProject.status}
                                        onChange={(e) => setNewProject(prev => ({ ...prev, status: e.target.value }))}
                                        className="w-full p-3 rounded-xl text-white border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                        style={{ backgroundColor: "#1a2f42" }}>
                                        <option value="active">🟢 Active</option>
                                        <option value="on_hold">🟡 On Hold</option>
                                        <option value="completed">✅ Completed</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-300 mb-2">
                                        Initial Progress — <span className="text-[#a8c4e0]">{newProject.progress}%</span>
                                    </label>
                                    <input type="range" min="0" max="100" value={newProject.progress}
                                        onChange={(e) => setNewProject(prev => ({ ...prev, progress: parseInt(e.target.value) }))}
                                        className="w-full mt-3 accent-[#5a8ab0]" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Assign to Employee
                                </label>
                                <select value={newProject.assigned_to}
                                    onChange={(e) => setNewProject(prev => ({ ...prev, assigned_to: e.target.value }))}
                                    className="w-full p-3 rounded-xl text-white border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                    style={{ backgroundColor: "#1a2f42" }}>
                                    <option value="">— Select an employee —</option>
                                    {employees.filter(emp => emp.role === "employee").map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="px-8 py-5 border-t border-white/10 flex justify-end gap-3" style={{ backgroundColor: "rgba(58,87,121,0.15)" }}>
                            <button onClick={() => { setShowProjectModal(false); setMessage(null); }}
                                className="px-5 py-2.5 text-sm font-medium text-slate-300 rounded-xl transition-colors hover:bg-white/10">
                                Cancel
                            </button>
                            <button onClick={handleCreateProject}
                                className="px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:opacity-90 shadow-lg"
                                style={{ backgroundColor: "#3a5779" }}>
                                <Plus className="w-4 h-4" /> Create Project
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add Task Modal ── */}
            {showTaskModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                    <div className="w-full max-w-lg rounded-2xl shadow-2xl border border-white/10 overflow-hidden" style={{ backgroundColor: "#111f2e" }}>
                        <div className="px-8 py-6 border-b border-white/10" style={{ backgroundColor: "rgba(58,87,121,0.3)" }}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg" style={{ backgroundColor: "#3a5779" }}>
                                        <Briefcase className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Add New Task</h2>
                                        <p className="text-slate-400 text-sm">Assign a task to a team member</p>
                                    </div>
                                </div>
                                <button onClick={() => { setShowTaskModal(false); setMessage(null); }}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="px-8 py-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Task Name <span className="text-red-400">*</span></label>
                                <input type="text" placeholder="e.g. Design landing page"
                                    value={newTask.name}
                                    onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full p-3 rounded-xl text-white placeholder-slate-500 border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                    style={{ backgroundColor: "#1a2f42" }} />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Project <span className="text-red-400">*</span></label>
                                <select value={newTask.projectId}
                                    onChange={(e) => setNewTask(prev => ({ ...prev, projectId: e.target.value }))}
                                    className="w-full p-3 rounded-xl text-white border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                    style={{ backgroundColor: "#1a2f42" }}>
                                    <option value="">— Select a project —</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-300 mb-2">Assign To <span className="text-red-400">*</span></label>
                                <select value={newTask.assignedToId}
                                    onChange={(e) => setNewTask(prev => ({ ...prev, assignedToId: e.target.value }))}
                                    className="w-full p-3 rounded-xl text-white border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                    style={{ backgroundColor: "#1a2f42" }}>
                                    <option value="">— Select an employee —</option>
                                    {employees.filter(emp => emp.role === "employee").map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-300 mb-2">Deadline <span className="text-red-400">*</span></label>
                                    <input type="date" value={newTask.deadline}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, deadline: e.target.value }))}
                                        className="w-full p-3 rounded-xl text-white border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                        style={{ backgroundColor: "#1a2f42" }} />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-300 mb-2">Priority</label>
                                    <select value={newTask.priority}
                                        onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value }))}
                                        className="w-full p-3 rounded-xl text-white border border-white/10 focus:border-[#5a8ab0] focus:outline-none transition-colors"
                                        style={{ backgroundColor: "#1a2f42" }}>
                                        <option value="Low">🟢 Low</option>
                                        <option value="Medium">🟡 Medium</option>
                                        <option value="High">🔴 High</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="px-8 py-5 border-t border-white/10 flex justify-end gap-3" style={{ backgroundColor: "rgba(58,87,121,0.15)" }}>
                            <button onClick={() => { setShowTaskModal(false); setMessage(null); }}
                                className="px-5 py-2.5 text-sm font-medium text-slate-300 rounded-xl transition-colors hover:bg-white/10">
                                Cancel
                            </button>
                            <button onClick={handleAddTask}
                                className="px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:opacity-90 shadow-lg bg-purple-700 hover:bg-purple-800">
                                <Plus className="w-4 h-4" /> Add Task
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── AI Modal ── */}
            {showAIModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-slate-800 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl animate-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
                                <Zap className="w-6 h-6 text-yellow-400" />
                                {aiReport?.reminders ? "AI Project Insights" : "ProSynk Technical Audit"}
                            </h2>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={downloadPDF}
                                    className="flex items-center gap-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-lg"
                                >
                                    <FileText className="w-4 h-4" />
                                    Download PDF
                                </button>
                                <button onClick={() => setShowAIModal(false)} className="text-slate-400 hover:text-white transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div id="report-content" className="bg-slate-900/50 border border-slate-700 rounded-xl p-5 max-h-[60vh] overflow-y-auto">
                            <div className="space-y-6">
                                <div className={`bg-indigo-900/20 border border-indigo-500/30 p-5 rounded-xl ${!aiReport?.reminders ? "w-full" : ""}`}>
                                    <h3 className="text-indigo-400 font-bold mb-3 flex items-center gap-2 text-xs uppercase tracking-wider">
                                        ✨ {aiReport?.reminders ? "Executive Summary" : "Internal Audit Findings"}
                                    </h3>
                                    <p className="text-slate-200 whitespace-pre-wrap text-sm leading-relaxed">
                                        {aiReport?.summary || "No analysis available."}
                                    </p>
                                </div>

                                {aiReport?.reminders && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <h3 className="text-slate-100 font-bold text-sm">🔔 Smart Reminders</h3>
                                            <div className="space-y-3">
                                                {aiReport.reminders.map((item, index) => (
                                                    <div key={index} className="p-3 bg-slate-800/60 rounded-lg border-l-4 border-yellow-500">
                                                        <div className="font-bold text-white text-[13px]">{item.task}</div>
                                                        <p className="text-[11px] text-slate-400 italic">"{item.reason}"</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="text-slate-100 font-bold text-sm">📈 Risk Assessment</h3>
                                            <div className="space-y-5">
                                                {aiReport.predictions?.map((pred, index) => (
                                                    <div key={index} className="space-y-2 p-3 rounded-lg bg-slate-800/40 border border-slate-700/50">
                                                        <div className="flex justify-between items-end">
                                                            <span className="text-[12px] text-slate-300">{pred.project_name}</span>
                                                            <span className="text-[11px] font-bold text-red-400">{pred.risk_score}% Risk</span>
                                                        </div>
                                                        <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                                                                style={{ width: `${pred.risk_score}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3 border-t border-slate-700 pt-4">
                            <button
                                onClick={() => handleSaveReport(aiReport)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all active:scale-95 shadow-lg"
                            >
                                <CheckCircle className="w-4 h-4" /> Save to History
                            </button>
                            <button
                                onClick={() => setShowAIModal(false)}
                                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-all shadow-md active:scale-95"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}