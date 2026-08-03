"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Add, Flag, Calendar1, DirectInbox, CloseCircle } from "iconsax-react";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "todo" | "in_progress" | "blocked" | "done";
type Member = { id: string; name: string; email: string };
type Task = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  due_at?: { toDate: () => Date } | null;
  assignee_uid: string;
  created_by_uid: string;
  source?: string;
  source_conversation_id?: string | null;
  source_channel?: string | null;
  ai_generated?: boolean;
};

const columns: { id: Status; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];
const priorityColors: Record<Priority, string> = {
  urgent: "text-red-600",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-green-500",
};

function mergeTasks(...groups: Task[][]) {
  const map = new Map<string, Task>();
  groups.flat().forEach((task) => map.set(task.id, task));
  return [...map.values()].sort((a, b) => (a.due_at?.toDate?.().getTime() ?? Infinity) - (b.due_at?.toDate?.().getTime() ?? Infinity));
}

export default function TasksPage() {
  const { user } = useAuth();
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [isManager, setIsManager] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      const data = snap.data();
      setEnterpriseId((data?.enterprise_id as string) ?? null);
      setIsManager(data?.role === "owner" || data?.role === "admin");
    });
  }, [user]);

  useEffect(() => {
    if (!enterpriseId || !user) return;
    const unsubMembers = onSnapshot(query(collection(db, "users"), where("enterprise_id", "==", enterpriseId)), (snap) => {
      setMembers(snap.docs.map((item) => ({ id: item.id, name: item.data().display_name || item.data().email || "Member", email: item.data().email || "" })));
    });
    if (isManager) {
      const unsub = onSnapshot(query(collection(db, "tasks"), where("enterprise_id", "==", enterpriseId), orderBy("created_at", "desc"), limit(100)), (snap) => {
        setTasks(mergeTasks(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Task, "id">) }))));
      }, () => setError("Tasks could not be loaded."));
      return () => { unsub(); unsubMembers(); };
    }
    let assigned: Task[] = [];
    let created: Task[] = [];
    const refresh = () => setTasks(mergeTasks(assigned, created));
    const unsubAssigned = onSnapshot(query(collection(db, "tasks"), where("enterprise_id", "==", enterpriseId), where("assignee_uid", "==", user.uid), orderBy("created_at", "desc"), limit(100)), (snap) => {
      assigned = snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Task, "id">) })); refresh();
    });
    const unsubCreated = onSnapshot(query(collection(db, "tasks"), where("enterprise_id", "==", enterpriseId), where("created_by_uid", "==", user.uid), orderBy("created_at", "desc"), limit(100)), (snap) => {
      created = snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Task, "id">) })); refresh();
    });
    return () => { unsubAssigned(); unsubCreated(); unsubMembers(); };
  }, [enterpriseId, isManager, user]);

  const visible = useMemo(() => filter === "all" ? tasks : tasks.filter((task) => task.status === filter), [tasks, filter]);
  const member = (uid: string) => members.find((item) => item.id === uid);

  const updateStatus = async (task: Task, status: Status) => {
    setBusy(true); setError(null);
    try { await httpsCallable(functions, "updateTask")({ id: task.id, status }); }
    catch (e) { setError((e as Error).message || "Task update failed."); }
    finally { setBusy(false); }
  };

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-gray-400 mt-1">Your work from conversations, agents, and manual planning.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800">
          <Add size={18} variant="Linear" color="#ffffff" /> New Task
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mb-4">{error}</p>}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {[{ id: "all", label: "All" }, ...columns].map((item) => (
          <button key={item.id} onClick={() => setFilter(item.id as Status | "all")} className={cn("text-sm font-medium rounded-full px-4 py-2 whitespace-nowrap", filter === item.id ? "bg-black text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50")}>{item.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {columns.map((column) => {
          const columnTasks = visible.filter((task) => task.status === column.id);
          return (
            <section key={column.id} className="min-w-0">
              <div className="flex items-center gap-2 mb-3"><h2 className="text-sm font-bold">{column.label}</h2><span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{columnTasks.length}</span></div>
              <div className="space-y-3">
                {columnTasks.map((task) => {
                  const assignee = member(task.assignee_uid);
                  return (
                    <article key={task.id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-gray-400"><Flag size={13} variant="Bold" className={priorityColors[task.priority]} />{task.priority}</span>
                        {task.ai_generated && <span className="text-[10px] text-purple-700 bg-purple-50 rounded-full px-2 py-1">AI extracted</span>}
                      </div>
                      <h3 className="text-sm font-semibold">{task.title}</h3>
                      {task.description && <p className="text-xs text-gray-500 leading-relaxed mt-1 line-clamp-3">{task.description}</p>}
                      <div className="flex items-center justify-between mt-4 gap-2">
                        <span className="flex items-center gap-1 text-xs text-gray-400"><Calendar1 size={12} />{task.due_at ? task.due_at.toDate().toLocaleDateString([], { month: "short", day: "numeric" }) : "No due date"}</span>
                        <span title={assignee?.email} className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-semibold">{(assignee?.name || "?").charAt(0).toUpperCase()}</span>
                      </div>
                      {task.source_conversation_id && <Link href={`/inbox?conversation=${encodeURIComponent(task.source_conversation_id)}`} className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 mt-3"><DirectInbox size={12} /> Open conversation</Link>}
                      <select value={task.status} disabled={busy} onChange={(event) => updateStatus(task, event.target.value as Status)} className="w-full mt-3 text-xs border border-gray-200 rounded-xl px-3 py-2 bg-white outline-none disabled:opacity-50">
                        {columns.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </article>
                  );
                })}
                {columnTasks.length === 0 && <div className="border border-dashed border-gray-200 rounded-2xl px-4 py-8 text-center text-xs text-gray-400">No tasks</div>}
              </div>
            </section>
          );
        })}
      </div>

      {showCreate && user && <CreateTaskModal members={members} defaultAssignee={user.uid} onClose={() => setShowCreate(false)} onError={setError} />}
    </main>
  );
}

function CreateTaskModal({ members, defaultAssignee, onClose, onError }: { members: Member[]; defaultAssignee: string; onClose: () => void; onError: (value: string | null) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeUid, setAssigneeUid] = useState(defaultAssignee);
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!title.trim()) return;
    setBusy(true); onError(null);
    try {
      await httpsCallable(functions, "createTask")({ title, description, priority, assigneeUid, dueAt: dueAt || null });
      onClose();
    } catch (e) { onError((e as Error).message || "Task creation failed."); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">New task</h2><button onClick={onClose}><CloseCircle size={24} className="text-gray-400" /></button></div>
        <div className="space-y-4 mt-5">
          <label className="block text-xs font-medium text-gray-500">Title<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200" /></label>
          <label className="block text-xs font-medium text-gray-500">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-500">Priority<select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">{(["low", "medium", "high", "urgent"] as const).map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="block text-xs font-medium text-gray-500">Due date<input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" /></label>
          </div>
          <label className="block text-xs font-medium text-gray-500">Assignee<select value={assigneeUid} onChange={(e) => setAssigneeUid(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={onClose} className="text-sm px-4 py-2">Cancel</button><button disabled={!title.trim() || busy} onClick={create} className="bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 disabled:opacity-40">{busy ? "Creating…" : "Create task"}</button></div>
      </div>
    </div>
  );
}
