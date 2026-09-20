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
    handleTimeFilterChange
  } = useDashboardData();

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 rounded-lg">
      {/* Header section with welcome message and time filter */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">
          Welcome, {userName}!
        </h1>
        <div className="flex flex-wrap gap-2 w-full">
          {/* Time filter for dashboard data */}
          <TimeFilter onFilterChange={handleTimeFilterChange} />
        </div>
      </div>

      {/* Dashboard content area: stat cards, charts, etc. */}
      <div id="dashboard-content">
        {loading ? (
          // Loading spinner and message
          <div className="flex justify-center items-center h-64">
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
  );
}
