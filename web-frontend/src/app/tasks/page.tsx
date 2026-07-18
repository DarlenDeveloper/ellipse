"use client";

import { useState } from "react";
import { Add, TickCircle, Clock, Flag, More, Calendar1 } from "iconsax-react";
import { cn } from "@/lib/utils";

type Priority = "High" | "Medium" | "Low";
type Status = "To Do" | "In Progress" | "Done";

type Task = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  dueDate: string;
  assignee: string;
  assigneeColor: string;
};

const priorityColors: Record<Priority, string> = {
  High: "text-red-500",
  Medium: "text-amber-500",
  Low: "text-green-500",
};

const statusColors: Record<Status, string> = {
  "To Do": "bg-gray-100 text-gray-600",
  "In Progress": "bg-blue-50 text-blue-700",
  Done: "bg-green-50 text-green-700",
};

const initialTasks: Task[] = [
  { id: "1", title: "Set up WhatsApp Business API", description: "Configure webhook and verify business account", priority: "High", status: "In Progress", dueDate: "Jul 14", assignee: "G", assigneeColor: "bg-black text-white" },
  { id: "2", title: "Draft Gmail agent playbook", description: "Define tone, auto-reply rules, and escalation triggers", priority: "High", status: "To Do", dueDate: "Jul 15", assignee: "S", assigneeColor: "bg-purple-500 text-white" },
  { id: "3", title: "Design analytics dashboard", description: "Wireframe response time and sentiment charts", priority: "Medium", status: "To Do", dueDate: "Jul 16", assignee: "M", assigneeColor: "bg-pink-500 text-white" },
  { id: "4", title: "Connect Zoho CRM sandbox", description: "OAuth flow + contact sync testing", priority: "Medium", status: "In Progress", dueDate: "Jul 14", assignee: "P", assigneeColor: "bg-emerald-500 text-white" },
  { id: "5", title: "Boss Agent escalation logic", description: "Implement cross-channel decision tree", priority: "High", status: "To Do", dueDate: "Jul 17", assignee: "D", assigneeColor: "bg-amber-500 text-white" },
  { id: "6", title: "Landing page copy", description: "Write hero, features, and pricing sections", priority: "Low", status: "Done", dueDate: "Jul 12", assignee: "J", assigneeColor: "bg-blue-500 text-white" },
  { id: "7", title: "Web agent browser sandbox", description: "Set up Puppeteer in Cloud Functions", priority: "Medium", status: "To Do", dueDate: "Jul 18", assignee: "G", assigneeColor: "bg-black text-white" },
  { id: "8", title: "Firestore security rules", description: "Per-org isolation + role-based access", priority: "High", status: "In Progress", dueDate: "Jul 13", assignee: "S", assigneeColor: "bg-purple-500 text-white" },
];

export default function TasksPage() {
  const [tasks] = useState(initialTasks);
  const [filter, setFilter] = useState<Status | "All">("All");

  const filtered = filter === "All" ? tasks : tasks.filter((t) => t.status === filter);

  const columns: Status[] = ["To Do", "In Progress", "Done"];

  return (
    <main className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Task Flow</h1>
          <p className="text-gray-400 mt-1">Track progress across the Ellipse sprint.</p>
        </div>
        <button className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800">
          <Add size={18} variant="Linear" color="#ffffff" />
          New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6">
        {(["All", "To Do", "In Progress", "Done"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "text-sm font-medium rounded-full px-4 py-2 transition-colors",
              filter === s
                ? "bg-black text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-3 gap-6">
        {columns.map((col) => {
          const colTasks = filtered.filter((t) => t.status === col);
          return (
            <div key={col} className="space-y-3">
              {/* Column header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold")}>{col}</span>
                  <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                    {colTasks.length}
                  </span>
                </div>
                <button className="text-gray-300 hover:text-gray-500">
                  <Add size={16} variant="Linear" />
                </button>
              </div>

              {/* Cards */}
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Flag size={14} variant="Bold" className={priorityColors[task.priority]} />
                      <span className="text-[11px] font-medium text-gray-400 uppercase">{task.priority}</span>
                    </div>
                    <button className="text-gray-300 hover:text-gray-500">
                      <More size={16} variant="Bold" />
                    </button>
                  </div>
                  <h4 className="text-sm font-semibold mb-1">{task.title}</h4>
                  <p className="text-xs text-gray-400 leading-relaxed mb-3">{task.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Calendar1 size={12} variant="Linear" />
                      {task.dueDate}
                    </div>
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold", task.assigneeColor)}>
                      {task.assignee}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
