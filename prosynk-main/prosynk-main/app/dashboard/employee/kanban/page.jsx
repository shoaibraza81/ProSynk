"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, X, Edit2, Trash2, Calendar, User, Search, Filter } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { calculateProjectProgress } from "@/lib/progressUtils";

// --- Configuration for Kanban Columns ---
// Status values must match exactly what's stored in your DB and used in progressUtils
const columnsConfig = {
  "To Do":       { key: "To Do",       title: "To Do",        color: "bg-red-500",    lightColor: "bg-red-500/10",    borderColor: "border-red-500/30"    },
  "In Progress": { key: "In Progress", title: "In Progress",  color: "bg-yellow-500", lightColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30" },
  "Review":      { key: "Review",      title: "Review",       color: "bg-blue-500",   lightColor: "bg-blue-500/10",   borderColor: "border-blue-500/30"   },
  "Done":        { key: "Done",        title: "Done",         color: "bg-green-500",  lightColor: "bg-green-500/10",  borderColor: "border-green-500/30"  },
};

// Stage weights used for the LOCAL progress preview (mirrors progressUtils logic)
const STAGE_WEIGHTS = {
  "To Do":       0,
  "In Progress": 50,
  "Review":      80,
  "Done":        100,
};

// --- Main Kanban Board Component ---
// Props:
//   projectId  – required: the Supabase project ID this board belongs to
//   onProgressUpdate – optional callback(progress: number) so parent dashboards
//                      can react immediately without waiting for a DB re-fetch
export default function KanbanBoard({ projectId, onProgressUpdate }) {
  const [tasks, setTasks]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [draggedTask, setDraggedTask]   = useState(null);
  const [dragOverCol, setDragOverCol]   = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [editingTask, setEditingTask]   = useState(null);
  const [searchTerm, setSearchTerm]     = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [progress, setProgress]         = useState(0); // local progress mirror

  const [newTask, setNewTask] = useState({
    title: "", description: "", assignedTo: "", dueDate: "", priority: "medium",
  });

  // ─── Fetch tasks from Supabase on mount ───────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    fetchTasks();

    // Real-time subscription so HeadPM dashboard also updates live
    const channel = supabase
      .channel(`tasks:project_id=eq.${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` },
        () => fetchTasks() // re-fetch whenever any task changes
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [projectId]);

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setTasks(data);
      updateLocalProgress(data);
    }
    setLoading(false);
  };

  // ─── Local progress calculation (instant UI feedback) ─────────────────────
  // This mirrors the same formula in progressUtils.js so the bar is always
  // in sync even before the DB write confirms.
  const updateLocalProgress = useCallback((taskList) => {
    if (!taskList || taskList.length === 0) {
      setProgress(0);
      onProgressUpdate?.(0);
      return;
    }
    const total = taskList.reduce((sum, t) => sum + (STAGE_WEIGHTS[t.status] ?? 0), 0);
    const pct   = Math.round(total / taskList.length);
    setProgress(pct);
    onProgressUpdate?.(pct); // bubble up to parent dashboard
  }, [onProgressUpdate]);

  // ─── Helper: save status change → DB + recalculate progress ──────────────
  const persistStatusChange = async (taskId, newStatus) => {
    await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    // calculateProjectProgress writes the new % to the projects table,
    // making it visible on BOTH employee and HeadPM dashboards
    await calculateProjectProgress(projectId);
  };

  // ─── Drag & Drop ──────────────────────────────────────────────────────────
  const handleDragStart = (task) => setDraggedTask(task);
  const handleDragOver  = (e, status) => { e.preventDefault(); setDragOverCol(status); };
  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = async (newStatus) => {
    setDragOverCol(null);
    if (!draggedTask || draggedTask.status === newStatus) { setDraggedTask(null); return; }

    // 1. Optimistic UI update (instant)
    const updatedTasks = tasks.map(t =>
      t.id === draggedTask.id ? { ...t, status: newStatus } : t
    );
    setTasks(updatedTasks);
    updateLocalProgress(updatedTasks);
    setDraggedTask(null);

    // 2. Persist to DB + recalculate project progress
    await persistStatusChange(draggedTask.id, newStatus);
  };

  // ─── Add Task ─────────────────────────────────────────────────────────────
  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;

    const taskPayload = {
      ...newTask,
      status:     selectedColumn || "To Do",
      project_id: projectId,
    };

    const { data, error } = await supabase.from("tasks").insert([taskPayload]).select().single();

    if (!error && data) {
      const updatedTasks = [...tasks, data];
      setTasks(updatedTasks);
      updateLocalProgress(updatedTasks);
      await calculateProjectProgress(projectId);
    }

    setShowAddModal(false);
    setNewTask({ title: "", description: "", assignedTo: "", dueDate: "", priority: "medium" });
  };

  // ─── Edit Task ────────────────────────────────────────────────────────────
  const handleEditTask = async () => {
    if (!editingTask?.title.trim()) return;

    const { error } = await supabase
      .from("tasks")
      .update({
        title:      editingTask.title,
        description: editingTask.description,
        assignedTo: editingTask.assignedTo,
        dueDate:    editingTask.dueDate,
        priority:   editingTask.priority,
        status:     editingTask.status,
      })
      .eq("id", editingTask.id);

    if (!error) {
      const updatedTasks = tasks.map(t => t.id === editingTask.id ? editingTask : t);
      setTasks(updatedTasks);
      updateLocalProgress(updatedTasks);
      await calculateProjectProgress(projectId);
    }

    setShowEditModal(false);
    setEditingTask(null);
  };

  // ─── Delete Task ──────────────────────────────────────────────────────────
  const handleDeleteTask = async (taskId) => {
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (!error) {
      const updatedTasks = tasks.filter(t => t.id !== taskId);
      setTasks(updatedTasks);
      updateLocalProgress(updatedTasks);
      await calculateProjectProgress(projectId);
    }
  };

  // ─── Filtered view ────────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch =
        !searchTerm ||
        task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterStatus === "all" || task.priority === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [tasks, searchTerm, filterStatus]);

  // ─── Utilities ────────────────────────────────────────────────────────────
  const getPriorityColor = (priority) => {
    switch (priority) {
      case "high":   return "text-red-400 bg-red-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/20";
      case "low":    return "text-green-400 bg-green-500/20";
      default:       return "text-slate-400 bg-slate-500/20";
    }
  };

  const getProgressColor = (pct) => {
    if (pct >= 80) return "bg-green-500";
    if (pct >= 50) return "bg-yellow-500";
    if (pct >= 20) return "bg-blue-500";
    return "bg-red-500";
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-8 bg-gradient-to-br from-[#163853] via-[#1e4a63] to-[#163853] min-h-screen text-white">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-1">Kanban Board</h1>
          <p className="text-slate-300">Drag and drop tasks to update their status</p>
        </div>

        {/* ── Progress Bar ───────────────────────────────────────────────── */}
        <div className="mb-8 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-200">Project Progress</span>
            <span className="text-sm font-bold text-white">{progress}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-700 ease-out ${getProgressColor(progress)}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Stage legend */}
          <div className="flex gap-4 mt-3 text-xs text-slate-400 flex-wrap">
            {Object.entries(STAGE_WEIGHTS).map(([stage, weight]) => (
              <span key={stage} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full inline-block ${columnsConfig[stage].color}`} />
                {stage} = {weight}%
              </span>
            ))}
            <span className="ml-auto italic">
              Formula: Σ(weight × tasks) / total tasks
            </span>
          </div>
        </div>
        {/* ──────────────────────────────────────────────────────────────── */}

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-4 mb-8 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks by title or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-white/40 placeholder:text-slate-400 text-white"
            />
          </div>
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none bg-white/10 border border-white/10 text-white py-2 pl-9 pr-4 rounded-lg focus:outline-none focus:border-white/40 cursor-pointer text-sm"
            >
              <option value="all">All Priorities</option>
              <option value="high">Priority: High</option>
              <option value="medium">Priority: Medium</option>
              <option value="low">Priority: Low</option>
            </select>
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={() => { setSelectedColumn("To Do"); setShowAddModal(true); }}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
          >
            <Plus className="w-5 h-5" /> Add Task
          </button>
        </div>

        {/* Kanban Columns */}
        {loading ? (
          <div className="text-center py-20 text-slate-400">Loading tasks…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(columnsConfig).map(([status, col]) => (
              <div
                key={status}
                onDragOver={(e) => handleDragOver(e, status)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(status)}
                className={`backdrop-blur-xl rounded-2xl p-4 border min-h-[600px] flex flex-col transition-colors duration-200
                  ${dragOverCol === status
                    ? `${col.lightColor} ${col.borderColor} border-2`
                    : "bg-white/10 border-white/20"
                  }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${col.color}`} />
                    <h2 className="text-lg font-semibold">{col.title}</h2>
                    <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                      {filteredTasks.filter(t => t.status === status).length}
                    </span>
                  </div>
                  <button
                    onClick={() => { setSelectedColumn(status); setShowAddModal(true); }}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Task Cards */}
                <div className="space-y-3 overflow-y-auto flex-grow">
                  {filteredTasks
                    .filter(t => t.status === status)
                    .map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task)}
                        className={`p-4 bg-[#1a4259]/60 backdrop-blur-sm rounded-xl border ${col.borderColor} cursor-move hover:bg-[#1a4259]/80 transition-all group shadow-lg`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-white pr-2">{task.title}</h3>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingTask(task); setShowEditModal(true); }}
                              className="p-1 hover:bg-white/20 rounded"
                              title="Edit"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                              className="p-1 hover:bg-red-500/20 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3 text-red-400" />
                            </button>
                          </div>
                        </div>

                        <p className="text-sm text-slate-300 mb-3">{task.description}</p>

                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 text-slate-400">
                            <User className="w-3 h-3" />
                            <span>{task.assignedTo}</span>
                          </div>
                          <span className={`px-2 py-1 rounded-full capitalize ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>

                        {task.dueDate && (
                          <div className="flex items-center gap-1 text-xs text-slate-400 mt-2">
                            <Calendar className="w-3 h-3" />
                            <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    ))}

                  {filteredTasks.filter(t => t.status === status).length === 0 && (
                    <div className="text-slate-400 text-sm p-4 text-center rounded-lg border border-dashed border-white/20">
                      {searchTerm || filterStatus !== "all"
                        ? "No tasks match the filters."
                        : "Drop tasks here or click + to add."}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <TaskModal
          title="Add New Task"
          task={newTask}
          setTask={setNewTask}
          onSave={handleAddTask}
          onClose={() => setShowAddModal(false)}
          saveText="Add Task"
        />
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <TaskModal
          title="Edit Task"
          task={editingTask}
          setTask={setEditingTask}
          onSave={handleEditTask}
          onClose={() => { setShowEditModal(false); setEditingTask(null); }}
          saveText="Save Changes"
        />
      )}
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
const TaskModal = ({ title, task, setTask, onSave, onClose, saveText }) => (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-[#1a4259] p-6 rounded-2xl border border-white/20 max-w-md w-full mx-4 shadow-2xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">{title}</h2>
        <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={task.title}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40 placeholder:text-slate-400"
            placeholder="Task title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={task.description}
            onChange={(e) => setTask({ ...task, description: e.target.value })}
            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40 resize-none placeholder:text-slate-400"
            rows="3"
            placeholder="Task description"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Assigned To</label>
          <input
            type="text"
            value={task.assignedTo}
            onChange={(e) => setTask({ ...task, assignedTo: e.target.value })}
            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40 placeholder:text-slate-400"
            placeholder="Team member name"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input
              type="date"
              value={task.dueDate}
              onChange={(e) => setTask({ ...task, dueDate: e.target.value })}
              className="w-full p-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select
              value={task.priority}
              onChange={(e) => setTask({ ...task, priority: e.target.value })}
              className="w-full p-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-white/40"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onSave}
            disabled={!task.title.trim()}
            className={`flex-1 ${!task.title.trim() ? "bg-white/10 text-slate-500 cursor-not-allowed" : "bg-white/20 hover:bg-white/30"} p-2 rounded-lg font-medium transition-colors`}
          >
            {saveText}
          </button>
          <button
            onClick={onClose}
            className="px-4 bg-red-500/20 hover:bg-red-500/30 p-2 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
);