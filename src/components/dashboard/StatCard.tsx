"use client";

import * as React from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { DASHBOARD_COLORS } from "./dashboardColors";

interface StatCardProps {
  title: string;
  value: number | string;
  colorIndex?: number; // Optional color index
}

// Colors for each category
const COLORS = [
  DASHBOARD_COLORS.clients,
  DASHBOARD_COLORS.projects,
  DASHBOARD_COLORS.income,
];

export function StatCard({ title, value, colorIndex = 0 }: StatCardProps) {
  const color = COLORS[colorIndex % COLORS.length];

  return (
    <Card
      className="h-full overflow-hidden rounded-xl border border-[#E4E7EC] bg-white shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <CardContent className="flex h-full min-h-[112px] flex-col justify-center px-5 py-4">
        <CardTitle className="text-[13px] font-medium leading-5 text-[#667085]">
          {title}
        </CardTitle>
        <div className="mt-1 text-[30px] font-semibold leading-tight tracking-tight tabular-nums text-[#1B2330]">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
