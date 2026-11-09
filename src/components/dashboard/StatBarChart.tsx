// src/components/dashboard/charts/StatBarChart.tsx
"use client";

/**
 * Bar chart that displays statistics for projects and clients.
 */

import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
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
  customRange
}: StatisticsBarChartProps) {
  // Month names for custom range display
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Labels for each time range option
  const timeRangeLabels = {
    all: "All Time",
    today: "Today",
    weekly: "Last 7 Days",
    monthly: "Last 30 Days",
    yearly: "Last 12 Months",
    custom: "Custom Range"
  };

  // Generate chart data based on selected time range
  const data = generateChartData({
    projectsData,
    clientsData,
    timeRange,
    customRange
  });

  return (
    <Card className="h-full">
      {/* Chart header with time range label */}
      <CardHeader className="flex flex-col items-center justify-center p-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {timeRange === "custom" && customRange 
            ? `${months[customRange.startMonth]} - ${months[customRange.endMonth]} ${customRange.year}`
            : timeRangeLabels[timeRange as keyof typeof timeRangeLabels]}
        </CardTitle>
      </CardHeader>
      <CardContent className="">
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ left: -25 }} 
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
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '14px',
                  fontWeight: 500,
                  padding: '8px 12px',
                }}
                itemStyle={{
                  color: '#1f2937',
                  padding: '2px 0',
                }}
                formatter={(value: number, name: string) => [
                  <span key="combined" className="flex items-center gap-2">
                    <span className="text-gray-600">{name}</span>
                    <span 
                      className="font-semibold"
                      style={{ 
                        color: name === 'Clients' ? CATEGORY_COLORS.CLIENTS :
                               CATEGORY_COLORS.PROJECTS
                      }}
                    >
                      {value}
                    </span>
                  </span>,
                  null
                ]}
              />
              {/* Legend for bar colors */}
              <Legend 
                iconSize={12}
                wrapperStyle={{
                  fontSize: '12px',
                  paddingTop: '10px',
                  paddingBottom: '10px',
                  width: '100%',
                  textAlign: 'center',
                }}
                content={({ payload }) => (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '16px',
                    width: '100%',
                    margin: '0 auto',
                  }}>
                    {payload?.map((entry, index) => (
                      <div 
                        key={`legend-item-${index}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <div style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: entry.color,
                          borderRadius: '2px'
                        }} />
                        <span style={{ fontSize: '12px' }}>
                          {entry.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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