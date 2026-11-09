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
  customRange,
}: DashboardContentProps) {
  return (
    <>
      {/* Stat Cards Section */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total approved clients"
          value={filteredClients.length}
          colorIndex={0}
        />
        <StatCard
          title="Total projects (pending, ongoing, completed)"
          value={totalProjects}
          colorIndex={1}
        />
        <StatCard
          title="Total income"
          value={totalIncome.toLocaleString("en-PH", {
            style: "currency",
            currency: "PHP",
          })}
          colorIndex={2}
        />
      </div>

      {/* Monthly comparison chart */}
      <section aria-label="Client and project trends">
        <div className="h-[400px]">
          <StatBarChart
            projectsData={filteredProjects}
            clientsData={filteredClients}
            timeRange={timeRange}
            customRange={customRange}
          />
        </div>
      </section>

      {/* Pie Charts Section */}
      <section aria-labelledby="dashboard-breakdown-heading">
        <h2
          id="dashboard-breakdown-heading"
          className="mb-3 text-base font-semibold tracking-tight text-[#1B2330]"
        >
          Breakdown
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ServiceRequestedChart projects={filteredProjects} />
          <SendingInstitutionChart projects={filteredProjects} />
          <FundingCategoryChart projects={filteredProjects} />
        </div>
      </section>
    </>
  );
}
