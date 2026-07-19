import { QuickStats } from "@/components/dashboard/QuickStats";
import { Statistics } from "@/components/dashboard/Statistics";
import { PendingApprovals } from "@/components/dashboard/PendingApprovals";
import { RecentThreads } from "@/components/dashboard/RecentThreads";

export default function DashboardPage() {
  return (
    <main className="p-7 space-y-6">
      {/* Quick Stats */}
      <QuickStats />

      {/* Statistics + Pending Approvals */}
      <div className="grid grid-cols-[1fr_340px] gap-6">
        <Statistics />
        <PendingApprovals />
      </div>

      {/* Manage Threads Table */}
      <RecentThreads />
    </main>
  );
}
