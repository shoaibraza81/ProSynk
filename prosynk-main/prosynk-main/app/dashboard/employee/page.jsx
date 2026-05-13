"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, FolderKanban, CheckSquare, Clock, AlertCircle, Award,
  TrendingUp, Loader2, MessageSquare, ArrowLeft, Plus, X, Edit2,
  Trash2, Calendar, Search, Filter
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { calculateProjectProgress } from "../../../lib/progressUtils";
import NotificationBell from "@/components/NotificationBell";
import { useNotifications } from "@/context/NotificationContext";
import { useNotifSubscription } from '@/hooks/useNotifications';

// ===== KANBAN COLUMN CONFIG =====
const COLUMNS = {
  "To Do":       { color: "bg-red-500",    borderColor: "border-red-500/30",    lightColor: "bg-red-500/10"    },
  "In Progress": { color: "bg-yellow-500", borderColor: "border-yellow-500/30", lightColor: "bg-yellow-500/10" },
  "Review":      { color: "bg-blue-500",   borderColor: "border-blue-500/30",   lightColor: "bg-blue-500/10"   },
  "Done":        { color: "bg-green-500",  borderColor: "border-green-500/30",  lightColor: "bg-green-500/10"  },
};

// Stage weights — must match progressUtils.js exactly
const STAGE_WEIGHTS = {
  "To Do":       0,
  "In Progress": 50,
  "Review":      80,
  "Done":        100,
};

// ===== TASK MODAL =====
const TaskModal = ({ title, task, setTask, onSave, onClose, saveText }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-[#1a4259] p-6 rounded-2xl border border-white/20 max-w-md w-full mx-4 shadow-2xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{title}</h2>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded"><X className="w-5 h-5" /></button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input type="text" value={task.title || ""}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40 placeholder:text-slate-400"
            placeholder="Task title" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={task.description || ""}
            onChange={(e) => setTask({ ...task, description: e.target.value })}
            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40 resize-none placeholder:text-slate-400"
            rows="3" placeholder="Task description" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input type="date" value={task.due_date || ""}
              onChange={(e) => setTask({ ...task, due_date: e.target.value })}
              className="w-full p-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select value={task.priority || "Medium"}
              onChange={(e) => setTask({ ...task, priority: e.target.value })}
              className="w-full p-2 bg-[#0f2337] border border-white/20 rounded-lg focus:outline-none focus:border-white/40">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onSave} disabled={!task.title?.trim()}
            className={`flex-1 ${!task.title?.trim() ? 'bg-white/10 text-slate-500 cursor-not-allowed' : 'bg-white/20 hover:bg-white/30'} p-2 rounded-lg font-medium transition-colors`}>
            {saveText}
          </button>
          <button onClick={onClose} className="px-4 bg-red-500/20 hover:bg-red-500/30 p-2 rounded-lg font-medium transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ===== PROJECT KANBAN BOARD =====
function ProjectKanban({ project, userProfile, onBack, onProgressUpdate }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState("To Do");
  const [editingTask, setEditingTask] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [message, setMessage] = useState(null);
  const [localProgress, setLocalProgress] = useState(Number(project.progress) || 0);

  const [newTask, setNewTask] = useState({
    title: "", description: "", due_date: "", priority: "Medium"
  });

  // ── Fetch tasks ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTasks();

    // Real-time subscription: keeps HeadPM dashboard in sync too
    const channel = supabase
      .channel(`tasks-project-${project.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` },
        () => fetchTasks()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [project.id]);

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks").select("*").eq("project_id", project.id);
    if (error) console.error("Tasks fetch error:", error);
    else {
      const taskList = data || [];
      setTasks(taskList);
      recalcLocalProgress(taskList);
    }
    setLoading(false);
  };

  // ── Local progress recalculation (instant UI, same formula as progressUtils) ──
  const recalcLocalProgress = useCallback((taskList) => {
    if (!taskList || taskList.length === 0) {
      setLocalProgress(0);
      onProgressUpdate?.(project.id, 0);
      return;
    }
    const total = taskList.reduce((sum, t) => sum + (STAGE_WEIGHTS[t.status] ?? 0), 0);
    const pct = Math.round(total / taskList.length);
    setLocalProgress(pct);
    onProgressUpdate?.(project.id, pct); // bubble up → ProjectCard re-renders instantly
  }, [project.id, onProgressUpdate]);

  // ── Helper: DB write + recalculate project progress ──────────────────────
  const syncProgress = async (updatedTasks) => {
    recalcLocalProgress(updatedTasks);
    // This writes the new % to projects table → HeadPM dashboard reads it
    await calculateProjectProgress(project.id);
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const handleDragStart = (task) => setDraggedTask(task);
  const handleDragOver  = (e, status) => { e.preventDefault(); setDragOverCol(status); };
  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = async (newStatus) => {
    setDragOverCol(null);
    if (!draggedTask || draggedTask.status === newStatus) { setDraggedTask(null); return; }

    // 1. Optimistic UI
    const updated = tasks.map(t => t.id === draggedTask.id ? { ...t, status: newStatus } : t);
    setTasks(updated);
    await syncProgress(updated); // instant bar update

    // 2. Persist
    const { error } = await supabase.from("tasks")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", draggedTask.id);

    if (error) {
      console.error("Status update error:", error);
      // Rollback
      const rolled = tasks.map(t => t.id === draggedTask.id ? { ...t, status: draggedTask.status } : t);
      setTasks(rolled);
      await syncProgress(rolled);
    }
    setDraggedTask(null);
  };

  // ── Add Task ─────────────────────────────────────────────────────────────
  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    try {
      const { data, error } = await supabase.from("tasks").insert([{
        title:            newTask.title,
        description:      newTask.description || null,
        project_id:       project.id,
        assigned_user_id: userProfile.id,
        due_date:         newTask.due_date || null,
        priority:         newTask.priority,
        status:           selectedColumn,
        created_by:       userProfile.id,
      }]).select().single();
      if (error) throw error;

      const updated = [...tasks, data];
      setTasks(updated);
      await syncProgress(updated);

      setShowAddModal(false);
      setNewTask({ title: "", description: "", due_date: "", priority: "Medium" });
      showMsg("success", "Task added successfully.");
    } catch (err) {
      console.error("Add task error:", err);
      showMsg("error", "Failed to add task.");
    }
  };

  // ── Edit Task ────────────────────────────────────────────────────────────
  const handleEditTask = async () => {
    if (!editingTask?.title?.trim()) return;
    try {
      const { error } = await supabase.from("tasks")
        .update({
          title:       editingTask.title,
          description: editingTask.description,
          due_date:    editingTask.due_date,
          priority:    editingTask.priority,
          updated_at:  new Date().toISOString(),
        }).eq("id", editingTask.id);
      if (error) throw error;

      const updated = tasks.map(t => t.id === editingTask.id ? editingTask : t);
      setTasks(updated);
      await syncProgress(updated); // status may have changed via edit

      setShowEditModal(false);
      setEditingTask(null);
      showMsg("success", "Task updated.");
    } catch (err) {
      console.error("Edit task error:", err);
      showMsg("error", "Failed to update task.");
    }
  };

  // ── Delete Task ──────────────────────────────────────────────────────────
  const handleDeleteTask = async (taskId) => {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      showMsg("error", "Failed to delete task.");
    } else {
      const updated = tasks.filter(t => t.id !== taskId);
      setTasks(updated);
      await syncProgress(updated);
      showMsg("success", "Task deleted.");
    }
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = searchTerm === "" ||
        task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPriority = filterPriority === "all" || task.priority === filterPriority;
      return matchesSearch && matchesPriority;
    });
  }, [tasks, searchTerm, filterPriority]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "High":   return "text-red-400 bg-red-500/20";
      case "Medium": return "text-yellow-400 bg-yellow-500/20";
      case "Low":    return "text-green-400 bg-green-500/20";
      default:       return "text-slate-400 bg-slate-500/20";
    }
  };

  const getProgressBarColor = (pct) => {
    if (pct >= 80) return "bg-green-400";
    if (pct >= 50) return "bg-blue-400";
    if (pct >= 20) return "bg-yellow-400";
    return "bg-red-400";
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2">
      <Loader2 className="w-6 h-6 animate-spin" /> Loading tasks...
    </div>
  );

  return (
    <div>
      {/* Back + title */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all border border-white/20 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div>
          <h2 className="text-3xl font-bold">{project.name}</h2>
          <p className="text-slate-400 text-sm mt-0.5">Kanban Board · {tasks.length} tasks</p>
        </div>
      </div>

      {/* ── PROGRESS BAR ──────────────────────────────────────────────────── */}
      <div className="mb-6 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-200">Project Progress</span>
          <span className="text-sm font-bold text-white">{localProgress}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-700 ease-out ${getProgressBarColor(localProgress)}`}
            style={{ width: `${localProgress}%` }}
          />
        </div>
        {/* Stage weight legend */}
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400">
          {Object.entries(STAGE_WEIGHTS).map(([stage, weight]) => (
            <span key={stage} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full inline-block ${COLUMNS[stage].color}`} />
              {stage} = {weight}%
            </span>
          ))}
          <span className="ml-auto italic opacity-70">auto-updates both dashboards</span>
        </div>
      </div>
      {/* ──────────────────────────────────────────────────────────────────── */}

      {message && (
        <div className={`p-3 rounded-lg mb-4 flex items-center gap-2 text-sm ${
          message.type === "success"
            ? "bg-green-900/50 border border-green-500 text-green-300"
            : "bg-red-900/50 border border-red-500 text-red-300"
        }`}>
          {message.type === "success" ? <CheckSquare className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex items-center gap-4 mb-6 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search tasks..."
            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/40 placeholder:text-slate-400 text-white text-sm" />
        </div>
        <div className="relative">
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
            className="appearance-none bg-[#0f2337] border border-white/20 text-white py-2 pl-9 pr-4 rounded-lg focus:outline-none text-sm cursor-pointer">
            <option value="all">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={() => { setSelectedColumn("To Do"); setShowAddModal(true); }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-colors text-sm whitespace-nowrap">
          <Plus className="w-4 h-4" /> Add Task
        </button>
      </div>

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(COLUMNS).map(([status, col]) => {
          const colTasks = filteredTasks.filter(t => t.status === status);
          return (
            <div key={status}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(status)}
              className={`rounded-2xl p-4 border min-h-[500px] flex flex-col transition-colors duration-200
                ${dragOverCol === status
                  ? `${col.lightColor} ${col.borderColor} border-2`
                  : "bg-[#132d45] border-[#1e4060]/60"
                }`}>
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${col.color}`} />
                  <h3 className="text-base font-semibold">{status}</h3>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>
                <button onClick={() => { setSelectedColumn(status); setShowAddModal(true); }}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 flex-grow overflow-y-auto">
                {colTasks.length === 0 ? (
                  <div className="text-slate-500 text-sm p-4 text-center rounded-lg border border-dashed border-white/10">
                    {searchTerm || filterPriority !== "all" ? "No tasks match filters." : "No tasks here"}
                  </div>
                ) : colTasks.map(task => (
                  <div key={task.id} draggable onDragStart={() => handleDragStart(task)}
                    className={`p-4 bg-[#0f2337]/80 rounded-xl border ${col.borderColor} cursor-grab active:cursor-grabbing hover:bg-[#0f2337] transition-all group shadow-lg`}>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-white text-sm pr-2">{task.title}</h4>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); setEditingTask(task); setShowEditModal(true); }}
                          className="p-1 hover:bg-white/20 rounded" title="Edit">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                          className="p-1 hover:bg-red-500/20 rounded" title="Delete">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center justify-between text-xs mt-2">
                      <span className={`px-2 py-0.5 rounded-full capitalize ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                      {task.due_date && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Calendar className="w-3 h-3" />
                          {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <TaskModal title={`Add Task — ${selectedColumn}`}
          task={newTask} setTask={setNewTask}
          onSave={handleAddTask}
          onClose={() => { setShowAddModal(false); setNewTask({ title: "", description: "", due_date: "", priority: "Medium" }); }}
          saveText="Add Task" />
      )}
      {showEditModal && editingTask && (
        <TaskModal title="Edit Task"
          task={editingTask} setTask={setEditingTask}
          onSave={handleEditTask}
          onClose={() => { setShowEditModal(false); setEditingTask(null); }}
          saveText="Save Changes" />
      )}
    </div>
  );
}

// ===== MAIN EMPLOYEE DASHBOARD =====
export default function EmployeeDashboard() {
  const router = useRouter();
  const { addNotification } = useNotifications();

  const [userProfile, setUserProfile]     = useState(null);
  useNotifSubscription(userProfile?.id, null);
  const [activeTab, setActiveTab]         = useState("Dashboard");
  const [myProjects, setMyProjects]       = useState([]);
  const [myTasks, setMyTasks]             = useState([]);
  const [activities, setActivities]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [message, setMessage]             = useState(null);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [selectedProject, setSelectedProject] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace("/login"); return; }
      const userId = session.user.id;

      const { data: profile, error: profileError } = await supabase
        .from("profiles").select("*").eq("id", userId).single();
      if (profileError || !profile) { router.replace("/login"); return; }
      if (profile.role?.toLowerCase() !== "employee") { router.replace("/dashboard/headpm"); return; }
      setUserProfile(profile);

      const { data: memberRows, error: memberError } = await supabase
        .from("project_members").select("project_id").eq("user_id", userId);
      if (!memberError && memberRows?.length > 0) {
        const projectIds = memberRows.map(r => r.project_id);
        const { data: assignedProjects, error: projError } = await supabase
          .from("projects").select("*").in("id", projectIds);
        if (!projError) setMyProjects(assignedProjects || []);
      } else {
        setMyProjects([]);
      }

      const { data: assignedTasks, error: taskError } = await supabase
        .from("tasks").select("*").eq("assigned_user_id", userId)
        .order("created_at", { ascending: false });
      if (!taskError) setMyTasks(assignedTasks || []);

      const { data: recentActivities, error: actError } = await supabase
        .from("activity_logs").select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(13);
      if (!actError) setActivities(recentActivities || []);

      setLoading(false);
    };
    fetchData();
  }, [router]);

  // ── Realtime: project progress changes → update project card instantly ──
  useEffect(() => {
    if (!myProjects.length) return;
    const projectIds = myProjects.map(p => p.id);

    const channel = supabase
      .channel("employee-project-progress")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "projects" },
        (payload) => {
          if (projectIds.includes(payload.new.id)) {
            setMyProjects(prev =>
              prev.map(p => p.id === payload.new.id ? { ...p, progress: payload.new.progress } : p)
            );
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [myProjects.length]);

  // ── Callback from ProjectKanban: update progress optimistically in list ──
  const handleProgressUpdate = useCallback((projectId, pct) => {
    setMyProjects(prev =>
      prev.map(p => p.id === projectId ? { ...p, progress: pct } : p)
    );
  }, []);

  // ── Realtime: unread chat ──
  useEffect(() => {
    if (!userProfile) return;
    if (Notification.permission === "default") Notification.requestPermission();
    const channel = supabase.channel("employee-unread-msgs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (payload.new.user_id !== userProfile.id) {
          setUnreadCount(prev => prev + 1);
          if (Notification.permission === "granted") {
            new Notification("💬 New Message - ProSynk", { body: payload.new.message, icon: "/favicon.ico" });
          }
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [userProfile]);

  // ── Realtime: new task assigned ──
  useEffect(() => {
    if (!userProfile) return;
    const taskSub = supabase
      .channel(`employee-new-tasks-${userProfile.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "tasks",
        filter: `assigned_user_id=eq.${userProfile.id}`,
      }, (payload) => {
        setMyTasks(prev => [payload.new, ...prev]);
        addNotification({
          type: "activity",
          title: `📋 New Task Assigned: ${payload.new.title}`,
          body: `Priority: ${payload.new.priority || "Medium"} • Due: ${payload.new.deadline || payload.new.due_date || "No deadline"}`,
          href: "/dashboard/employee",
        });
      }).subscribe();
    return () => supabase.removeChannel(taskSub);
  }, [userProfile, addNotification]);

  // ── Realtime: task status updated ──
  useEffect(() => {
    if (!userProfile) return;
    const taskUpdateSub = supabase
      .channel(`employee-task-updates-${userProfile.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "tasks",
        filter: `assigned_user_id=eq.${userProfile.id}`,
      }, (payload) => {
        setMyTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        if (payload.old?.status !== payload.new.status) {
          addNotification({
            type: "activity",
            title: `🔄 Task Updated: ${payload.new.title}`,
            body: `Status changed to "${payload.new.status}"`,
            href: "/dashboard/employee",
          });
        }
      }).subscribe();
    return () => supabase.removeChannel(taskUpdateSub);
  }, [userProfile, addNotification]);

  // ── Utilities ──────────────────────────────────────────────────────────
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "active":    return "text-blue-300 bg-blue-500/25 border border-blue-400/40";
      case "completed": return "text-green-300 bg-green-500/25 border border-green-400/40";
      case "on_hold":
      case "on hold":   return "text-orange-300 bg-orange-500/25 border border-orange-400/40";
      default:          return "text-slate-300 bg-slate-500/25 border border-slate-400/40";
    }
  };
  const getStatusLabel = (status) => {
    switch (status?.toLowerCase()) {
      case "active":    return "Active";
      case "completed": return "Completed";
      case "on_hold":   return "On Hold";
      default:          return status;
    }
  };
  const getTaskStatusColor = (status) => {
    switch (status) {
      case "Done": case "completed": case "Completed": return "text-green-300 bg-green-500/25 border border-green-400/40";
      case "In Progress": case "in_progress":          return "text-blue-300 bg-blue-500/25 border border-blue-400/40";
      case "To Do": case "pending": case "Pending":    return "text-yellow-300 bg-yellow-500/25 border border-yellow-400/40";
      case "Review":                                   return "text-purple-300 bg-purple-500/25 border border-purple-400/40";
      default:                                         return "text-slate-300 bg-slate-500/25 border border-slate-400/40";
    }
  };
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case "High":   return "text-red-400 bg-red-500/20 border border-red-400/40 px-2 py-0.5 rounded-full text-xs";
      case "Medium": return "text-yellow-400 bg-yellow-500/20 border border-yellow-400/40 px-2 py-0.5 rounded-full text-xs";
      case "Low":    return "text-green-400 bg-green-500/20 border border-green-400/40 px-2 py-0.5 rounded-full text-xs";
      default:       return "text-slate-400 px-2 py-0.5 rounded-full text-xs";
    }
  };
  const getProgressBarColor = (progress) => {
    if (progress >= 75) return "bg-emerald-400";
    if (progress >= 40) return "bg-violet-400";
    return "bg-amber-400";
  };
  const getActivityIcon = (type) => {
    switch (type) {
      case "task":       return <CheckSquare className="w-5 h-5 text-green-400" />;
      case "comment":    return <BarChart3 className="w-5 h-5 text-blue-400" />;
      case "assignment": return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case "milestone":  return <Award className="w-5 h-5 text-purple-400" />;
      default:           return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const navItems = [
    { name: "Dashboard",   icon: BarChart3 },
    { name: "My Projects", icon: FolderKanban },
    { name: "My Tasks",    icon: CheckSquare },
    { name: "Performance", icon: TrendingUp },
    { name: "Chat",        icon: MessageSquare, isLink: true, href: "/chat" },
  ];

  const activeProjects    = myProjects.filter(p => p.status?.toLowerCase() === "active").length;
  const completedProjects = myProjects.filter(p => p.status?.toLowerCase() === "completed").length;
  const pendingTasks      = myTasks.filter(t => !["completed","Completed","Done"].includes(t.status)).length;
  const completedTasks    = myTasks.filter(t => ["completed","Completed","Done"].includes(t.status)).length;

  const statCards = [
    { label: "Active Projects",    value: activeProjects,    icon: FolderKanban, bg: "from-[#1a3a5c] to-[#1e4976]", iconColor: "text-blue-300",   valueColor: "text-white",      border: "border-blue-500/30"   },
    { label: "Completed Projects", value: completedProjects, icon: Award,        bg: "from-[#2d1b69] to-[#3b2080]", iconColor: "text-purple-300", valueColor: "text-purple-300", border: "border-purple-500/30" },
    { label: "Pending Tasks",      value: pendingTasks,      icon: Clock,        bg: "from-[#1a4a2e] to-[#1e5c38]", iconColor: "text-green-300",  valueColor: "text-green-400",  border: "border-green-500/30"  },
    { label: "Completed Tasks",    value: completedTasks,    icon: CheckSquare,  bg: "from-[#4a3000] to-[#5c3c00]", iconColor: "text-yellow-300", valueColor: "text-yellow-400", border: "border-yellow-500/30" },
  ];

  // ── Project Card (shows live progress from myProjects state) ──
  const ProjectCard = ({ project, onClick }) => (
    <div onClick={onClick}
      className={`p-5 bg-[#0f2337]/60 rounded-xl border border-[#1e4060]/40 mb-4 transition-all ${
        onClick ? "cursor-pointer hover:bg-[#0f2337]/90 hover:border-blue-400/40 group" : ""
      }`}>
      <div className="flex justify-between mb-2">
        <div>
          <h3 className={`text-lg font-semibold ${onClick ? "group-hover:text-blue-300 transition-colors" : ""}`}>
            {project.name}
          </h3>
          {onClick && <p className="text-xs text-slate-500 mt-0.5">Click to open Kanban board</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
            {getStatusLabel(project.status)}
          </span>
          {onClick && <span className="text-slate-400 text-sm group-hover:text-white transition-colors">→</span>}
        </div>
      </div>
      {project.description && <p className="text-sm text-slate-400 mb-2">{project.description}</p>}
      {(project.start_date || project.end_date) && (
        <p className="text-xs text-slate-400 mb-3">📅 {project.start_date} → {project.end_date || "TBD"}</p>
      )}
      {/* Progress bar — live from myProjects state */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-400 font-medium">Progress</span>
          <span className="text-xs font-bold text-white">{Number(project.progress) || 0}%</span>
        </div>
        <div className="flex-1 bg-white/5 border border-white/10 rounded-full h-3 overflow-hidden">
          <div
            className={`h-3 rounded-full transition-all duration-700 ease-out ${getProgressBarColor(Number(project.progress) || 0)}`}
            style={{ width: `${Number(project.progress) || 0}%` }}
          />
        </div>
      </div>
    </div>
  );

  const TaskCard = ({ task }) => (
    <div className="p-4 bg-[#0f2337]/60 rounded-lg border border-[#1e4060]/40 mb-3">
      <div className="flex justify-between mb-2">
        <h3 className="text-white font-medium text-sm">{task.title}</h3>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTaskStatusColor(task.status)}`}>
          {task.status}
        </span>
      </div>
      {task.description && <p className="text-xs text-slate-400 mb-2 line-clamp-2">{task.description}</p>}
      <div className="flex justify-between items-center">
        <span className={getPriorityBadge(task.priority)}>{task.priority} Priority</span>
        {task.due_date && <span className="text-xs text-slate-400">Due: {task.due_date}</span>}
      </div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-[#0f2337] text-white gap-2">
      <Loader2 className="w-6 h-6 animate-spin" /> Loading Dashboard...
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#0f2337] text-white">

      {/* SIDEBAR */}
      <div className="w-64 bg-[#132d45] p-6 border-r border-[#1e4060]/60 flex flex-col h-screen sticky top-0">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-[#1e4060] to-[#2a6090] rounded-lg flex items-center justify-center font-bold text-xl">P</div>
          <h2 className="text-2xl font-bold">ProSynk</h2>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            if (item.isLink) return (
              <button key={item.name}
                onClick={() => { setUnreadCount(0); router.push(item.href); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-[#1e4060]/60 text-slate-300 relative">
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
                {unreadCount > 0 && (
                  <span className="absolute right-3 top-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            );
            return (
              <button key={item.name}
                onClick={() => { setActiveTab(item.name); setSelectedProject(null); }}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                  activeTab === item.name
                    ? "bg-[#1e4d7a] text-white border border-blue-400/30 shadow-lg"
                    : "hover:bg-[#1e4060]/60 text-slate-300"
                }`}>
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </button>
            );
          })}
          <button
            onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
            className="w-full p-3 bg-gradient-to-r from-red-600 to-red-700 rounded-lg hover:from-red-700 hover:to-red-800 transition-all shadow-lg font-medium mt-2">
            Logout
          </button>
        </nav>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">{userProfile?.full_name || "User"} Dashboard</h1>
            <p className="text-slate-400 mt-1">Track your assigned projects and tasks</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="bg-[#132d45] px-5 py-3 rounded-xl border border-[#1e4060]/60">
              <p className="text-xs text-slate-400">Signed in as</p>
              <p className="text-white font-medium text-sm">{userProfile?.email}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 flex items-center gap-3 ${
            message.type === "success" ? "bg-green-900/50 border border-green-500 text-green-300" :
            message.type === "loading" ? "bg-blue-900/50 border border-blue-500 text-blue-300" :
            "bg-red-900/50 border border-red-500 text-red-300"
          }`}>
            {message.type === "loading" && <Loader2 className="w-5 h-5 animate-spin" />}
            {message.type === "success" && <CheckSquare className="w-5 h-5" />}
            {message.type === "error"   && <AlertCircle className="w-5 h-5" />}
            <p className="font-medium flex-1">{message.text}</p>
          </div>
        )}

        {/* DASHBOARD TAB */}
        {activeTab === "Dashboard" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              {statCards.map((stat, i) => (
                <div key={i} className={`p-6 bg-gradient-to-br ${stat.bg} rounded-2xl shadow-xl border ${stat.border}`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-slate-300 text-sm font-medium">{stat.label}</h3>
                    <div className="p-2 bg-white/10 rounded-lg"><stat.icon className={`w-5 h-5 ${stat.iconColor}`} /></div>
                  </div>
                  <p className={`text-4xl font-bold ${stat.valueColor}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="p-6 bg-[#132d45] rounded-2xl border border-[#1e4060]/60 mb-6">
              <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
                <FolderKanban className="w-6 h-6 text-blue-300" /> My Assigned Projects
              </h2>
              {myProjects.length === 0
                ? <p className="text-slate-400">No projects assigned to you yet.</p>
                : myProjects.map(project => <ProjectCard key={project.id} project={project} />)
              }
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 bg-[#132d45] rounded-2xl border border-[#1e4060]/60">
                <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
                  <CheckSquare className="w-6 h-6 text-green-300" /> My Tasks
                </h2>
                {myTasks.length === 0
                  ? <p className="text-slate-400">No tasks assigned yet.</p>
                  : myTasks.slice(0, 5).map(task => <TaskCard key={task.id} task={task} />)
                }
              </div>
              <div className="p-6 bg-[#132d45] rounded-2xl border border-[#1e4060]/60">
                <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
                  <Clock className="w-6 h-6 text-yellow-300" /> Recent Activities
                </h2>
                {activities.length === 0
                  ? <p className="text-slate-400">No recent activity.</p>
                  : activities.map(act => (
                    <div key={act.id} className="flex items-start gap-3 mb-4">
                      <div className="mt-0.5">{getActivityIcon(act.type)}</div>
                      <div>
                        <p className="text-sm text-slate-300">{act.description || act.action}</p>
                        <p className="text-xs text-slate-500">{new Date(act.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </>
        )}

        {/* MY PROJECTS TAB */}
        {activeTab === "My Projects" && (
          <div>
            {selectedProject ? (
              <ProjectKanban
                project={selectedProject}
                userProfile={userProfile}
                onBack={() => setSelectedProject(null)}
                onProgressUpdate={handleProgressUpdate}
              />
            ) : (
              <div className="p-6 bg-[#132d45] rounded-2xl border border-[#1e4060]/60">
                <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                  <FolderKanban className="w-7 h-7 text-blue-300" /> My Assigned Projects
                </h2>
                <p className="text-slate-400 text-sm mb-6">Click on a project to open its Kanban board</p>
                {myProjects.length === 0
                  ? <p className="text-slate-400">No projects assigned to you yet.</p>
                  : myProjects.map(project => (
                    <ProjectCard key={project.id} project={project} onClick={() => setSelectedProject(project)} />
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* MY TASKS TAB */}
        {activeTab === "My Tasks" && (
          <div className="p-6 bg-[#132d45] rounded-2xl border border-[#1e4060]/60">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <CheckSquare className="w-7 h-7 text-green-300" /> My Tasks
            </h2>
            {myTasks.length === 0
              ? <p className="text-slate-400">No tasks assigned yet.</p>
              : myTasks.map(task => <TaskCard key={task.id} task={task} />)
            }
          </div>
        )}

        {/* PERFORMANCE TAB */}
        {activeTab === "Performance" && (
          <div className="p-6 bg-[#132d45] rounded-2xl border border-[#1e4060]/60">
            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <TrendingUp className="w-7 h-7 text-purple-300" /> Performance
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: "Tasks Completed",     value: completedTasks,   total: myTasks.length },
                { label: "Projects Active",      value: activeProjects,   total: myProjects.length },
                { label: "Tasks Pending",        value: pendingTasks,     total: myTasks.length },
                { label: "Avg Project Progress", value: Math.round(myProjects.reduce((s, p) => s + (Number(p.progress) || 0), 0) / (myProjects.length || 1)), total: 100, suffix: "%" },
              ].map((metric, i) => (
                <div key={i} className="p-5 bg-[#0f2337]/60 rounded-xl border border-[#1e4060]/40">
                  <h3 className="text-slate-300 text-sm mb-3">{metric.label}</h3>
                  <div className="flex items-end gap-2 mb-3">
                    <span className="text-3xl font-bold">{metric.value}{metric.suffix || ""}</span>
                    {!metric.suffix && <span className="text-slate-400 text-sm mb-1">/ {metric.total}</span>}
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div className="bg-blue-400 h-2 rounded-full"
                      style={{ width: `${Math.min(100, metric.total > 0 ? (metric.value / metric.total) * 100 : 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}