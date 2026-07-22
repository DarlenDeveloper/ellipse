"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  SearchNormal1,
  Folder2,
  DocumentText,
  Refresh,
  Global,
  CloseCircle,
  DocumentDownload,
} from "iconsax-react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useEnterpriseId } from "@/lib/use-enterprise";
import { cn } from "@/lib/utils";

type Period = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

type ReportFile = {
  name: string;
  url: string;
  type: "docx" | "xlsx";
  size: number;
  onedrive_url?: string;
  onedrive_status?: "pending" | "executed";
};

type Report = {
  id: string;
  agent: string;
  agent_label: string;
  logo?: string;
  period: Period;
  period_key: string;
  period_label?: string;
  title: string;
  summary: string;
  metrics?: Record<string, number>;
  files?: ReportFile[];
  period_start?: { toDate: () => Date };
  created_at?: { toDate: () => Date };
};

const PERIOD_TABS: { id: Period | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "annual", label: "Annual" },
];

function fmtDate(d?: Date) {
  if (!d) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtSize(bytes: number) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function DataPage() {
  const { enterpriseId } = useEnterpriseId();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // agent
  const [period, setPeriod] = useState<Period | "all">("all");
  const [selected, setSelected] = useState<Report | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!enterpriseId) return;
    const q = query(collection(db, "reports"), where("enterprise_id", "==", enterpriseId));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Report, "id">) }))
        .sort(
          (a, b) =>
            (b.period_start?.toDate?.().getTime() ?? 0) - (a.period_start?.toDate?.().getTime() ?? 0)
        );
      setReports(rows);
      setLoading(false);
    });
  }, [enterpriseId]);

  // Folders = agents that have reports
  const folders = useMemo(() => {
    const map = new Map<string, { agent: string; label: string; logo?: string; count: number }>();
    for (const r of reports) {
      const cur = map.get(r.agent) ?? { agent: r.agent, label: r.agent_label, logo: r.logo, count: 0 };
      cur.count++;
      map.set(r.agent, cur);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [reports]);

  const visible = useMemo(() => {
    return reports.filter((r) => {
      if (activeFolder && r.agent !== activeFolder) return false;
      if (period !== "all" && r.period !== period) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!r.title.toLowerCase().includes(s) && !r.summary.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [reports, activeFolder, period, search]);

  const generateNow = async () => {
    if (!enterpriseId || generating) return;
    setGenerating(true);
    try {
      const fn = httpsCallable(functions, "generateReportsNow");
      await fn({ enterpriseId, period: "daily" });
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data</h1>
          <p className="text-gray-400 mt-1">Reports your agents generate — daily, weekly, monthly and beyond.</p>
        </div>
        <button
          onClick={generateNow}
          disabled={generating}
          className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800 disabled:opacity-50"
        >
          <Refresh size={18} variant="Linear" color="#ffffff" />
          {generating ? "Generating…" : "Generate now"}
        </button>
      </div>

      <div className="flex gap-6 items-start">
        {/* Left panel — search + folder tree */}
        <aside className="w-[260px] shrink-0 bg-white rounded-2xl p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="relative mb-4">
            <SearchNormal1 size={16} variant="Linear" color="#9ca3af" className="absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports…"
              className="w-full bg-gray-50 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>

          <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-300 mb-1.5">Folders</p>
          <button
            onClick={() => setActiveFolder(null)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
              activeFolder === null ? "bg-black text-white" : "text-gray-700 hover:bg-gray-50"
            )}
          >
            <span className="flex items-center gap-2">
              <Folder2 size={17} variant="Bold" color={activeFolder === null ? "#ffffff" : "#6b7280"} />
              All Reports
            </span>
            <span className={cn("text-xs", activeFolder === null ? "text-white/60" : "text-gray-400")}>
              {reports.length}
            </span>
          </button>
          <div className="space-y-0.5 mt-0.5">
            {folders.map((f) => {
              const isActive = activeFolder === f.agent;
              return (
                <button
                  key={f.agent}
                  onClick={() => setActiveFolder(f.agent)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive ? "bg-black text-white" : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <AgentIcon logo={f.logo} active={isActive} size={16} />
                    <span className="truncate">{f.label}</span>
                  </span>
                  <span className={cn("text-xs shrink-0", isActive ? "text-white/60" : "text-gray-400")}>{f.count}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Period tabs */}
          <div className="flex items-center gap-1 mb-5 bg-white rounded-full p-1 w-fit shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            {PERIOD_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setPeriod(t.id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                  period === t.id ? "bg-black text-white" : "text-gray-500 hover:text-gray-800"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Folder grid (only in All view) */}
          {activeFolder === null && folders.length > 0 && (
            <>
              <h3 className="text-lg font-bold mb-3">Folders</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                {folders.map((f) => (
                  <button
                    key={f.agent}
                    onClick={() => setActiveFolder(f.agent)}
                    className="group text-left"
                  >
                    <div className="relative aspect-[4/3] rounded-2xl bg-gradient-to-br from-gray-700 to-gray-900 shadow-sm overflow-hidden flex items-end p-4 group-hover:shadow-md transition-shadow">
                      {/* folder tab */}
                      <div className="absolute top-3 left-4 w-10 h-2.5 rounded-t-md bg-white/15" />
                      <div className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/90 flex items-center justify-center">
                        <AgentIcon logo={f.logo} active={false} size={18} />
                      </div>
                      <div className="w-7 h-7 rounded-md bg-white/15 flex items-center justify-center">
                        <Folder2 size={16} variant="Bold" color="#ffffff" />
                      </div>
                    </div>
                    <p className="text-sm font-semibold mt-2.5">{f.label}</p>
                    <p className="text-xs text-gray-400">{f.count} {f.count === 1 ? "report" : "reports"}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Files table */}
          <h3 className="text-lg font-bold mb-3">
            {activeFolder ? folders.find((f) => f.agent === activeFolder)?.label : "Reports"}
          </h3>

          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                <DocumentText size={26} variant="Bold" color="#9ca3af" />
              </div>
              <h4 className="text-base font-semibold">No reports yet</h4>
              <p className="text-sm text-gray-400 mt-1 max-w-sm">
                Each connected agent writes a summary at midnight in your time zone — daily, weekly, monthly, quarterly
                and annually. Use “Generate now” to create today’s reports immediately.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="grid grid-cols-[1fr_120px_140px_120px] gap-4 px-5 py-3 border-b border-gray-50 text-xs font-semibold text-gray-400">
                <div>Name</div>
                <div>Period</div>
                <div>Covers</div>
                <div>Agent</div>
              </div>
              {visible.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="w-full grid grid-cols-[1fr_120px_140px_120px] gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 text-left items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      <DocumentText size={16} variant="Bold" color="#6b7280" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{r.title}</span>
                        {r.files && r.files.length > 0 && (
                          <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
                            {r.files.length} file{r.files.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-gray-400 truncate">{r.summary.slice(0, 70)}</span>
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 capitalize">{r.period}</div>
                  <div className="text-sm text-gray-500">{r.period_label ?? fmtDate(r.period_start?.toDate())}</div>
                  <div className="flex items-center gap-2 min-w-0">
                    <AgentIcon logo={r.logo} active={false} size={16} />
                    <span className="text-sm text-gray-500 truncate">{r.agent_label}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  <AgentIcon logo={selected.logo} active={false} size={20} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold truncate">{selected.title}</h3>
                  <p className="text-xs text-gray-400">
                    {selected.agent_label} · {selected.period_label ?? fmtDate(selected.period_start?.toDate())}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-300 hover:text-gray-700 shrink-0">
                <CloseCircle size={22} variant="Linear" />
              </button>
            </div>

            <div className="px-6 py-5">
              {/* Metrics */}
              {selected.metrics && Object.keys(selected.metrics).length > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {Object.entries(selected.metrics).map(([k, v]) => (
                    <div key={k} className="bg-gray-50 rounded-xl px-4 py-3">
                      <p className="text-xl font-bold">{v}</p>
                      <p className="text-xs text-gray-400 capitalize">{k.replace(/_/g, " ")}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Summary */}
              <div className="prose prose-sm max-w-none">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selected.summary}</p>
              </div>

              {/* Downloadable files */}
              {selected.files && selected.files.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-2">Documents</p>
                  <div className="space-y-2">
                    {selected.files.map((f) => (
                      <a
                        key={f.name}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                      >
                        <span
                          className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0",
                            f.type === "docx" ? "bg-blue-500" : "bg-emerald-600"
                          )}
                        >
                          {f.type === "docx" ? "DOC" : "XLS"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium truncate">{f.name}</span>
                          <span className="flex items-center gap-1.5 text-xs text-gray-400">
                            {fmtSize(f.size)} · Download
                            {f.onedrive_url ? (
                              <span
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open(f.onedrive_url, "_blank", "noopener");
                                }}
                                className="text-blue-500 hover:underline"
                              >
                                · Open in Microsoft 365
                              </span>
                            ) : f.onedrive_status === "pending" ? (
                              <span className="text-amber-500">· Microsoft 365 upload awaiting approval</span>
                            ) : null}
                          </span>
                        </span>
                        <DocumentDownload size={18} variant="Linear" color="#9ca3af" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function AgentIcon({ logo, active, size }: { logo?: string; active: boolean; size: number }) {
  if (logo) {
    return <Image src={logo} alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} />;
  }
  return <Global size={size} variant="Bold" color={active ? "#ffffff" : "#6b7280"} />;
}
