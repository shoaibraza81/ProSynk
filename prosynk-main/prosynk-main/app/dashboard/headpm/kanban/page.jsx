"use client";

import { useState, useEffect, useMemo } from "react";
// Imported Search, Filter, Plus, X, Edit2, Trash2, Calendar, User icons
import { Plus, X, Edit2, Trash2, Calendar, User, Search, Filter } from "lucide-react"; 

// --- Configuration for Kanban Columns ---
const columnsFromBackend = {
  todo: { title: "To Do", color: "bg-red-500", lightColor: "bg-red-500/10", borderColor: "border-red-500/30" },
  inprogress: { title: "In Progress", color: "bg-yellow-500", lightColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30" },
  review: { title: "Review", color: "bg-blue-500", lightColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  done: { title: "Done", color: "bg-green-500", lightColor: "bg-green-500/10", borderColor: "border-green-500/30" }
};

// --- Main Kanban Board Component ---
export default function KanbanBoard() {
  const [tasks, setTasks] = useState([]);
  const [draggedTask, setDraggedTask] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  
  // State for Search and Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); 

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    assignedTo: "",
    dueDate: "",
    priority: "medium"
  });

  // Mock data loading on component mount
  useEffect(() => {
    const mockTasks = [
      { id: "1", title: "Design Landing Page", description: "Create wireframes and mockups for the new feature.", status: "todo", assignedTo: "Sarah Chen", dueDate: "2025-11-25", priority: "high" },
      { id: "2", title: "Setup Database", description: "Configure Supabase tables and initial schema.", status: "todo", assignedTo: "John Smith", dueDate: "2025-11-23", priority: "high" },
      { id: "3", title: "API Integration", description: "Connect frontend components to backend API endpoints.", status: "inprogress", assignedTo: "Emily Davis", dueDate: "2025-11-28", priority: "medium" },
      { id: "4", title: "User Authentication", description: "Implement secure login/signup flow using OAuth.", status: "inprogress", assignedTo: "Michael Brown", dueDate: "2025-11-30", priority: "high" },
      { id: "5", title: "Dashboard UI", description: "Review and refine the admin dashboard layout and user experience.", status: "review", assignedTo: "Sarah Chen", dueDate: "2025-11-22", priority: "medium" },
      { id: "6", title: "Testing Phase 1", description: "Conduct unit and integration tests for core features.", status: "done", assignedTo: "John Smith", dueDate: "2025-11-20", priority: "low" },
    ];
    setTasks(mockTasks);
  }, []);

  // --- FILTERED TASKS LOGIC (useMemo for performance) ---
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // 1. Apply Search Filter (Title or Description)
      const matchesSearch = searchTerm.toLowerCase() === '' || 
                            task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            task.description.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Apply Priority Filter
      const matchesFilter = filterStatus === 'all' || task.priority === filterStatus;
      
      return matchesSearch && matchesFilter;
    });
  }, [tasks, searchTerm, filterStatus]);
  // ----------------------------------------------------

  // --- Drag & Drop Handlers ---

  const handleDragStart = (task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (status) => {
    if (!draggedTask) return;
    const updatedTasks = tasks.map(task =>
      task.id === draggedTask.id ? { ...task, status } : task
    );
    setTasks(updatedTasks);
    setDraggedTask(null);
  };

  // --- CRUD Handlers ---

  const handleAddTask = () => {
    if (!newTask.title.trim()) return;

    const task = {
      id: Date.now().toString(),
      ...newTask,
      status: selectedColumn || "todo" // Uses the column selected, or 'todo' if added from the main button
    };
    setTasks([...tasks, task]);
    setShowAddModal(false);
    // Reset form
    setNewTask({ title: "", description: "", assignedTo: "", dueDate: "", priority: "medium" });
  };

  const handleEditTask = () => {
    if (!editingTask || !editingTask.title.trim()) return;

    const updatedTasks = tasks.map(task =>
      task.id === editingTask.id ? editingTask : task
    );
    setTasks(updatedTasks);
    setShowEditModal(false);
    setEditingTask(null);
  };

  const handleDeleteTask = (taskId) => {
    setTasks(tasks.filter(task => task.id !== taskId));
  };

  // --- Utility Functions ---

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "high": return "text-red-400 bg-red-500/20";
      case "medium": return "text-yellow-400 bg-yellow-500/20";
      case "low": return "text-green-400 bg-green-500/20";
      default: return "text-slate-400 bg-slate-500/20";
    }
  };

  // --- Render Component ---

  return (
    <div className="p-8 bg-gradient-to-br from-[#163853] via-[#1e4a63] to-[#163853] min-h-screen text-white">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Kanban Board</h1>
          <p className="text-slate-300">Drag and drop tasks to update their status</p>
        </div>

        {/* --- Search and Filter Bar --- */}
        <div className="flex items-center gap-4 mb-8 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/20">
            {/* Search Input */}
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

            {/* Filter Dropdown */}
            <div className="relative">
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="appearance-none bg-white/10 border border-white/10 text-white py-2 pl-9 pr-4 rounded-lg focus:outline-none focus:border-white/40 cursor-pointer text-sm"
                >
                    <option value="all">All Tasks</option>
                    <option value="high">Priority: High</option>
                    <option value="medium">Priority: Medium</option>
                    <option value="low">Priority: Low</option>
                </select>
                <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            {/* Add Task Button (Global) */}
             <button
                onClick={() => {
                  setSelectedColumn("todo"); // Default to 'todo' for the main Add Task button
                  setShowAddModal(true);
                }}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 p-2 rounded-lg font-medium transition-colors whitespace-nowrap"
            >
                <Plus className="w-5 h-5" />
                Add Task
            </button>
        </div>
        {/* ------------------------------------------- */}

        {/* Kanban Columns Grid  */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Object.entries(columnsFromBackend).map(([status, col]) => (
            <div
              key={status}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(status)}
              className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 border border-white/20 min-h-[600px] flex flex-col"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${col.color}`}></div>
                  <h2 className="text-lg font-semibold">{col.title}</h2>
                  <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                    {/* Count should reflect the visible/filtered tasks */}
                    {filteredTasks.filter(task => task.status === status).length}
                  </span>
                </div>
                {/* Add Task Button (Per Column) */}
                <button
                  onClick={() => {
                    setSelectedColumn(status);
                    setShowAddModal(true);
                  }}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Tasks Container */}
              <div className="space-y-3 overflow-y-auto custom-scrollbar flex-grow">
                {/* Iterate over filteredTasks and check status */}
                {filteredTasks
                  .filter(task => task.status === status)
                  .map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task)}
                      className={`p-4 bg-[#1a4259]/60 backdrop-blur-sm rounded-xl border ${col.borderColor} cursor-move hover:bg-[#1a4259]/80 transition-all group shadow-lg`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-white pr-2">{task.title}</h3>
                        {/* Task Action Buttons */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTask(task);
                              setShowEditModal(true);
                            }}
                            className="p-1 hover:bg-white/20 rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(task.id);
                            }}
                            className="p-1 hover:bg-red-500/20 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-sm text-slate-300 mb-3">{task.description}</p>
                      
                      {/* Task Metadata */}
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
                  
                  {/* Message for No Tasks */}
                  {filteredTasks.filter(task => task.status === status).length === 0 && (
                      <div className="text-slate-400 text-sm p-4 text-center rounded-lg border border-dashed border-white/20">
                          No tasks in this column match the filters.
                      </div>
                  )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Add Task Modal --- */}
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

      {/* --- Edit Task Modal --- */}
      {showEditModal && editingTask && (
        <TaskModal
          title="Edit Task"
          task={editingTask}
          setTask={setEditingTask}
          onSave={handleEditTask}
          onClose={() => {
            setShowEditModal(false);
            setEditingTask(null);
          }}
          saveText="Save Changes"
        />
      )}
    </div>
  );
}

// --- Task Modal Sub-Component (Add/Edit) ---
const TaskModal = ({ title, task, setTask, onSave, onClose, saveText }) => {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#1a4259] p-6 rounded-2xl border border-white/20 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4">
          
          {/* Title Input */}
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
          
          {/* Description Textarea */}
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
          
          {/* Assigned To Input */}
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
          
          {/* Date and Priority Selects */}
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
          
          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onSave}
              disabled={!task.title.trim()}
              className={`flex-1 ${!task.title.trim() ? 'bg-white/10 text-slate-500 cursor-not-allowed' : 'bg-white/20 hover:bg-white/30'} p-2 rounded-lg font-medium transition-colors`}
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
};