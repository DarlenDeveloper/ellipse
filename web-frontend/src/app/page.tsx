import { Sidebar } from "@/components/layout/Sidebar";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { Statistics } from "@/components/dashboard/Statistics";
import { PendingApprovals } from "@/components/dashboard/PendingApprovals";
import { RecentThreads } from "@/components/dashboard/RecentThreads";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#dcdcdc] p-4">
      <div className="flex bg-white rounded-[32px] overflow-hidden shadow-2xl min-h-[calc(100vh-2rem)]">
        <Sidebar />
        <main className="flex-1 bg-[#f7f7f8] p-7 space-y-6 overflow-auto">
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
      </div>
    </div>
  );
}
