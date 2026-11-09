"use client";

/**
 * Dashboard page for admin.
 * Displays stat cards, charts, and allows filtering and exporting dashboard data.
 */

import * as React from "react";
import { TimeFilter } from "@/components/dashboard/TimeFilter";
import { useDashboardData } from "@/hooks/dashboardHook";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { PermissionGuard } from "@/components/PermissionGuard";

export default function Dashboard() {
  return (
    <PermissionGuard module="dashboard" action="view">
      <DashboardPage />
    </PermissionGuard>
  );
}

function DashboardPage() {
  // Custom hook to fetch and manage dashboard data and state
  const {
    userName,
    loading,
    isExporting,
    totalProjects,
    filteredProjects,
    filteredClients,
    totalIncome,
    timeRange,
    customRange,
    exportToPDF,
    handleTimeFilterChange,
  } = useDashboardData();

  return (
    <div className="min-h-screen w-full bg-[#F5F6F8]">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Header section with welcome message and time filter */}
        <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight text-[#1B2330] md:text-3xl">
              Welcome, {userName}!
            </h1>
            <p className="text-sm text-[#667085]">
              Here is how clients, projects and income are tracking.
            </p>
          </div>
          <div className="w-full lg:max-w-[680px]">
            {/* Time filter for dashboard data */}
            <TimeFilter onFilterChange={handleTimeFilterChange} />
          </div>
        </div>

        {/* Dashboard content area: stat cards, charts, etc. */}
        <div id="dashboard-content" className="space-y-5">
          {loading ? (
            // Loading spinner and message
            <div className="flex h-64 items-center justify-center rounded-xl border border-[#E4E7EC] bg-white">
              <div className="relative z-10 text-center space-y-4">
                <div className="w-16 h-16 bg-gradient-to-r from-[#F69122] via-[#B9273A] to-[#912ABD] rounded-full flex items-center justify-center mx-auto animate-spin">
                  <div className="w-8 h-8 bg-white rounded-full"></div>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-700">
                    Loading data...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Thank you for your patience!
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // Main dashboard content
            <DashboardContent
              totalProjects={totalProjects}
              filteredProjects={filteredProjects}
              filteredClients={filteredClients}
              totalIncome={totalIncome}
              timeRange={timeRange}
              customRange={customRange}
            />
          )}
        </div>

        {/* Export button for dashboard PDF*/}
        {!loading && (
          <div className="flex justify-end mt-6">
            <ExportButton onClick={exportToPDF} disabled={isExporting} />
          </div>
        )}
      </div>
    </div>
  );
}
