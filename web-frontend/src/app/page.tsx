import { Sidebar } from "@/components/layout/Sidebar";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { Statistics } from "@/components/dashboard/Statistics";
import { PendingApprovals } from "@/components/dashboard/PendingApprovals";
import { RecentThreads } from "@/components/dashboard/RecentThreads";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Quick Stats */}
        <QuickStats />

        {/* Statistics + Pending Approvals */}
        <div className="grid grid-cols-[1fr_320px] gap-6">
          <Statistics />
          <PendingApprovals />
        </div>

        {/* Recent Threads Table */}
        <RecentThreads />
      </main>
    </div>
  );
}
