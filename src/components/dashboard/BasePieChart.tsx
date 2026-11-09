"use client";

/**
 * Template for components that uses pie charts.
 */

import * as React from "react";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface BasePieChartProps<T extends string> {
  title: string;
  categories: readonly T[];
  colors: Record<T, string>;
  data: { name: T; value: number }[];
  emptyMessage: string;
}

export function BasePieChart<T extends string>({
  title,
  categories,
  colors,
  data,
  emptyMessage,
}: BasePieChartProps<T>) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const [activeCategory, setActiveCategory] = React.useState<T | null>(null);
  const activeItem = data.find((item) => item.name === activeCategory);

  return (
    <Card className="flex min-w-0 flex-col rounded-xl border-[#E4E7EC] bg-white shadow-sm">
      <CardHeader className="px-5 pb-0 pt-5">
        <CardTitle className="text-[15px] font-semibold text-[#1B2330]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-5 pb-4 pt-2">
        <div className="relative mx-auto h-[210px] w-full max-w-[240px] shrink-0">
          <div
            className="absolute inset-[25px] rounded-full border-[18px] border-[#EEF0F3]"
            aria-hidden="true"
          />
          {total > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={data.filter((item) => item.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={66}
                  outerRadius={88}
                  paddingAngle={1}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data
                    .filter((item) => item.value > 0)
                    .map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={colors[entry.name]}
                        opacity={
                          activeCategory && activeCategory !== entry.name
                            ? 0.28
                            : 1
                        }
                      />
                    ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    border: "1px solid #E4E7EC",
                    borderRadius: "8px",
                    backgroundColor: "#FFFFFF",
                    boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)",
                    fontSize: "13px",
                    padding: "8px 10px",
                  }}
                  formatter={(value: number, name: T) => [value, name]}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          )}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
            <span className="max-w-full truncate text-[30px] font-semibold leading-tight tracking-tight tabular-nums text-[#1B2330]">
              {activeItem?.value ?? total}
            </span>
            <span className="mt-1 max-w-full text-xs leading-4 text-[#667085]">
              {activeItem?.name ?? (total > 0 ? "Total" : emptyMessage)}
            </span>
          </div>
        </div>

        <ul className="mt-3 border-t border-[#E4E7EC]">
          {categories.map((category) => {
            const item = data.find((entry) => entry.name === category);
            const value = item?.value ?? 0;
            const percentage =
              total > 0 ? Math.round((value / total) * 100) : 0;
            const isZero = value === 0;

            return (
              <li
                key={category}
                className="border-b border-[#E4E7EC] last:border-0"
              >
                <button
                  type="button"
                  className={`grid w-full grid-cols-[12px_minmax(0,1fr)_auto_42px] items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] transition-colors hover:bg-[#F6F7F9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1B2330] ${
                    isZero ? "text-[#98A2B3]" : "text-[#1B2330]"
                  }`}
                  onMouseEnter={() => setActiveCategory(category)}
                  onMouseLeave={() => setActiveCategory(null)}
                  onFocus={() => setActiveCategory(category)}
                  onBlur={() => setActiveCategory(null)}
                  aria-label={`${category}: ${value}, ${percentage}%`}
                >
                  <span
                    className={`h-3 w-3 rounded-[3px] ${isZero ? "opacity-45" : ""}`}
                    style={{ backgroundColor: colors[category] }}
                    aria-hidden="true"
                  />
                  <span className="truncate" title={category}>
                    {category}
                  </span>
                  <span className="min-w-6 text-right font-semibold tabular-nums">
                    {value}
                  </span>
                  <span className="text-right text-xs tabular-nums text-[#667085]">
                    {percentage}%
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
