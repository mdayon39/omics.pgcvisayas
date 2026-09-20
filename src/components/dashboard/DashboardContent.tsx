//src/components/dashboard/DashboardContent.tsx

import { StatCard } from "@/components/dashboard/StatCard";
import { StatBarChart } from "@/components/dashboard/StatBarChart";
import { ServiceRequestedChart } from "@/components/dashboard/ServiceRequestedChart";
import { SendingInstitutionChart } from "@/components/dashboard/SendingInstitutionChart";
import { FundingCategoryChart } from "@/components/dashboard/FundingCategoryChart";
import { DashboardContentProps } from "@/types/DashboardContent";

/**
 * Main dashboard layout for admin.
 * Displays stat cards, bar chart, and pie charts using filtered data.
 */
export function DashboardContent({
  totalProjects,
  filteredProjects,
  filteredClients,
  totalIncome,
  timeRange,
  customRange
}: DashboardContentProps) {
  return (
    <>
      {/* Stat Cards Section */}
      <div className="gap-4 mb-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <StatCard title="Total Approved Clients" value={filteredClients.length} colorIndex={0} />
            <StatCard title="Total Projects (Pending/Ongoing/Completed)" value={totalProjects} colorIndex={1} />
            <StatCard
              title="Total Income"
              value={totalIncome.toLocaleString("en-PH", {
                style: "currency",
                currency: "PHP",
              })}
              colorIndex={3}
            />
          </div>
        </div>
        {/* Bar Chart Section */}
        <div className="h-[400px]">
          <StatBarChart
            projectsData={filteredProjects}
            clientsData={filteredClients}
            timeRange={timeRange}
            customRange={customRange}
          />
        </div>
      </div>

      {/* Pie Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ServiceRequestedChart projects={filteredProjects} />
        <SendingInstitutionChart projects={filteredProjects} />
        <FundingCategoryChart projects={filteredProjects} />
      </div>
    </>
  );
}
