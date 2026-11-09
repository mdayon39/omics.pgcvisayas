// src/components/dashboard/charts/StatBarChart.tsx
"use client";

/**
 * Bar chart that displays statistics for projects and clients.
 */

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { generateChartData } from "@/services/filterGraph";
import { StatisticsBarChartProps } from "@/types/StatBarChart";
import { DASHBOARD_COLORS } from "./dashboardColors";

// Colors for each category in the bar chart
const CATEGORY_COLORS = {
  CLIENTS: DASHBOARD_COLORS.clients,
  PROJECTS: DASHBOARD_COLORS.projects,
} as const;

export function StatBarChart({
  projectsData,
  clientsData,
  timeRange,
  customRange,
}: StatisticsBarChartProps) {
  // Month names for custom range display
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Labels for each time range option
  const chartTitle =
    timeRange === "all"
      ? "Clients and projects by year"
      : timeRange === "today"
        ? "Clients and projects today"
        : timeRange === "weekly" || timeRange === "monthly"
          ? "Clients and projects by day"
          : "Clients and projects by month";
  const chartPeriod =
    timeRange === "custom" && customRange
      ? `${months[customRange.startMonth]}${customRange.startMonth !== customRange.endMonth ? ` – ${months[customRange.endMonth]}` : ""} ${customRange.year}`
      : timeRange === "all"
        ? "All available years (2019 onward)"
        : timeRange === "today"
          ? "Today"
          : timeRange === "weekly"
            ? "Last 7 days"
            : timeRange === "monthly"
              ? "Last 30 days"
              : "Last 12 months";

  // Generate chart data based on selected time range
  const data = generateChartData({
    projectsData,
    clientsData,
    timeRange,
    customRange,
  });

  return (
    <Card className="h-full rounded-xl border-[#E4E7EC] bg-white shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 px-5 pb-0 pt-5">
        <div>
          <CardTitle className="text-[15px] font-semibold text-[#1B2330]">
            {chartTitle}
          </CardTitle>
          <p className="mt-1 text-[13px] text-[#667085]">{chartPeriod}</p>
        </div>
        <div className="flex items-center gap-4 pt-1 text-[13px] text-[#667085]">
          {[
            ["Clients", CATEGORY_COLORS.CLIENTS],
            ["Projects", CATEGORY_COLORS.PROJECTS],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: color }}
              />
              {label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-1 sm:px-5">
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 12, right: 8, left: -20, bottom: 4 }}
            >
              {/* Grid lines */}
              <CartesianGrid vertical={false} stroke="#E2E8F0" />
              {/* X axis for time periods */}
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#64748B" }}
                tickMargin={12}
              />
              {/* Y axis for counts */}
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "#64748B" }}
                tickMargin={12}
              />
              {/* Tooltip for bar details */}
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  fontSize: "14px",
                  fontWeight: 500,
                  padding: "8px 12px",
                }}
                itemStyle={{
                  color: "#1f2937",
                  padding: "2px 0",
                }}
                formatter={(value: number, name: string) => [
                  <span key="combined" className="flex items-center gap-2">
                    <span className="text-gray-600">{name}</span>
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          name === "Clients"
                            ? CATEGORY_COLORS.CLIENTS
                            : CATEGORY_COLORS.PROJECTS,
                      }}
                    >
                      {value}
                    </span>
                  </span>,
                  null,
                ]}
              />
              {/* Bars for each category */}
              <Bar
                dataKey="clients"
                fill={CATEGORY_COLORS.CLIENTS}
                name="Clients"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="projects"
                fill={CATEGORY_COLORS.PROJECTS}
                name="Projects"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
