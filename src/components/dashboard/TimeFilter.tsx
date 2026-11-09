"use client";

/**
 * Dashboard filter component for selecting time range and custom date ranges.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check } from "lucide-react";
import { TimeFilterProps, TimeRange } from "@/types/TimeFilter";

export function TimeFilter({ onFilterChange }: TimeFilterProps) {
  // State for selected time range and custom range values
  const [timeRange, setTimeRange] = React.useState<TimeRange>("custom");
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = React.useState(0);
  const [endMonth, setEndMonth] = React.useState(11);

  // Month names for dropdowns
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
  const timeRangeLabels: Record<TimeRange, string> = {
    all: "All Time",
    today: "Today",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
    custom: "Custom",
  };

  // Effect: Apply filter on mount and when custom range changes
  React.useEffect(() => {
    if (timeRange === "custom") {
      onFilterChange({ year, startMonth, endMonth });
    }
  }, [year, startMonth, endMonth, timeRange, onFilterChange]);

  // Handle selection of a time range
  const handleTimeRangeSelect = (range: TimeRange) => {
    setTimeRange(range);
    if (range !== "custom") {
      onFilterChange(range);
    } else {
      onFilterChange({ year, startMonth, endMonth });
    }
  };

  // Handle selection of year in custom range
  const handleYearSelect = (selectedYear: number) => {
    setYear(selectedYear);
  };

  // Handle selection of start month in custom range
  const handleStartMonthSelect = (month: number) => {
    setStartMonth(month);
    if (month > endMonth) setEndMonth(month);
  };

  // Handle selection of end month in custom range
  const handleEndMonthSelect = (month: number) => {
    setEndMonth(month);
    if (month < startMonth) setStartMonth(month);
  };

  return (
    <div className="flex w-full justify-end">
      <div className="flex w-full flex-wrap items-end justify-end gap-2 sm:gap-3">
        {/* Time range dropdown (non-custom) */}
        {timeRange !== "custom" ? (
          <div className="flex w-full flex-col gap-1 sm:w-[140px]">
            <label className="px-1 text-xs font-medium text-[#667085]">
              Timeline
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-full justify-between rounded-lg border-[#E4E7EC] bg-white px-3 text-left font-normal text-[#1B2330] shadow-none hover:border-[#98A2B3]"
                >
                  {timeRangeLabels[timeRange]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[160px]" align="end">
                {Object.entries(timeRangeLabels).map(([value, label]) => (
                  <DropdownMenuItem
                    key={value}
                    className="flex justify-between"
                    onClick={() => handleTimeRangeSelect(value as TimeRange)}
                  >
                    <span>{label}</span>
                    {timeRange === value && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          // Custom range dropdowns
          <div className="flex w-full flex-wrap justify-end gap-2 sm:gap-3">
            {/* Timeline Dropdown */}
            <div className="flex w-full flex-col gap-1 sm:w-[140px]">
              <label className="px-1 text-xs font-medium text-[#667085]">
                Timeline
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-between rounded-lg border-[#E4E7EC] bg-white px-3 text-left font-normal text-[#1B2330] shadow-none hover:border-[#98A2B3]"
                  >
                    Custom
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[160px]" align="end">
                  {Object.entries(timeRangeLabels).map(([value, label]) => (
                    <DropdownMenuItem
                      key={value}
                      className="flex justify-between"
                      onClick={() => handleTimeRangeSelect(value as TimeRange)}
                    >
                      <span>{label}</span>
                      {timeRange === value && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Year Picker */}
            <div className="flex w-full flex-col gap-1 sm:w-[100px]">
              <label className="px-1 text-xs font-medium text-[#667085]">
                Year
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-between rounded-lg border-[#E4E7EC] bg-white px-3 text-left font-normal text-[#1B2330] shadow-none hover:border-[#98A2B3]"
                  >
                    {year}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[160px]" align="end">
                  {Array.from(
                    { length: 10 },
                    (_, i) => new Date().getFullYear() - i,
                  )
                    .filter((y) => y < 2015 || y > 2017)
                    .map((y) => (
                      <DropdownMenuItem
                        key={y}
                        className="flex justify-between"
                        onClick={() => handleYearSelect(y)}
                      >
                        <span>{y}</span>
                        {year === y && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Start Month Picker */}
            <div className="flex w-full flex-col gap-1 sm:w-[120px]">
              <label className="px-1 text-xs font-medium text-[#667085]">
                From
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-between rounded-lg border-[#E4E7EC] bg-white px-3 text-left font-normal text-[#1B2330] shadow-none hover:border-[#98A2B3]"
                  >
                    {months[startMonth]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[160px]" align="end">
                  {months.map((month, index) => (
                    <DropdownMenuItem
                      key={month}
                      className="flex justify-between"
                      onClick={() => handleStartMonthSelect(index)}
                    >
                      <span>{month}</span>
                      {startMonth === index && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* End Month Picker */}
            <div className="flex w-full flex-col gap-1 sm:w-[120px]">
              <label className="px-1 text-xs font-medium text-[#667085]">
                To
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-between rounded-lg border-[#E4E7EC] bg-white px-3 text-left font-normal text-[#1B2330] shadow-none hover:border-[#98A2B3]"
                  >
                    {months[endMonth]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[160px]" align="end">
                  {months.map((month, index) => (
                    <DropdownMenuItem
                      key={month}
                      className={`flex justify-between ${index < startMonth ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() =>
                        index >= startMonth && handleEndMonthSelect(index)
                      }
                    >
                      <span>{month}</span>
                      {endMonth === index && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
