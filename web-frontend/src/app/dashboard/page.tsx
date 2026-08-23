import Link from "next/link";
import { ArrowRight2, DirectInbox, TaskSquare } from "iconsax-react";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { Statistics } from "@/components/dashboard/Statistics";
import { PendingApprovals } from "@/components/dashboard/PendingApprovals";
import { RecentThreads } from "@/components/dashboard/RecentThreads";
import { DashboardDataProvider } from "@/components/dashboard/DashboardData";

export default function DashboardPage() {
  const today = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <DashboardDataProvider>
      <main className="mx-auto min-h-screen max-w-[1680px] p-4 sm:p-6 xl:p-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-gray-400">Workspace overview</p>
            <h1 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.025em] text-gray-950">Everything that needs your attention.</h1>
            <p className="mt-1.5 max-w-2xl text-[13px] font-normal leading-5 text-gray-500">
              Keep conversations moving, review agent work, and monitor activity from one place.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <p className="text-[13px] font-normal text-gray-500 sm:mr-1">{today}</p>
            <Link href="/tasks" className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-[13px] font-medium text-gray-700 shadow-sm">
              <TaskSquare size={16} /> Tasks
            </Link>
            <Link href="/inbox" className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-950 px-4 text-[13px] font-medium text-white shadow-sm">
              <DirectInbox size={16} color="currentColor" /> Open inbox <ArrowRight2 size={14} color="currentColor" />
            </Link>
          </div>
        </header>

        <QuickStats />

        <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
          <div className="xl:col-span-8"><Statistics /></div>
          <div className="xl:col-span-4"><PendingApprovals /></div>
        </div>

        <div className="mt-5"><RecentThreads /></div>
      </main>
    </DashboardDataProvider>
  );
}
