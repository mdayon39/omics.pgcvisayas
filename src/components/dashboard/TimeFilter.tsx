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
import { TimeFilterProps, TimeRange, CustomRange } from "@/types/TimeFilter";


export function TimeFilter({ onFilterChange }: TimeFilterProps) {
  // State for selected time range and custom range values
  const [timeRange, setTimeRange] = React.useState<TimeRange>("custom");
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = React.useState(0);
  const [endMonth, setEndMonth] = React.useState(11);

  // Month names for dropdowns
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Labels for each time range option
  const timeRangeLabels: Record<TimeRange, string> = {
    all: "All Time",
    today: "Today",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
    custom: "Custom"
  };

  // Effect: Apply filter on mount and when custom range changes
  React.useEffect(() => {
    if (timeRange === "custom") {
      onFilterChange({ year, startMonth, endMonth });
    }
  }, [year, startMonth, endMonth, timeRange, onFilterChange]);

  // Helper to trigger filter change for custom range
  const handleRangeChange = () => {
    onFilterChange({ year, startMonth, endMonth });
  };

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
    handleRangeChange();
  };

  // Handle selection of start month in custom range
  const handleStartMonthSelect = (month: number) => {
    setStartMonth(month);
    if (month > endMonth) setEndMonth(month);
    handleRangeChange();
  };

  // Handle selection of end month in custom range
  const handleEndMonthSelect = (month: number) => {
    setEndMonth(month);
    if (month < startMonth) setStartMonth(month);
    handleRangeChange();
  };

  return (
    <div className="w-full flex justify-end">
      <div className="flex flex-col sm:flex-row items-end gap-2 w-full">
        {/* Time range dropdown (non-custom) */}
        {timeRange !== "custom" ? (
          <div className="w-full sm:w-[160px]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full px-4 py-2 rounded border bg-white text-center">
                  Timeline: {timeRangeLabels[timeRange]}
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
                    {timeRange === value && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          // Custom range dropdowns
          <div className="flex flex-wrap md:flex-nowrap gap-2 w-full">
            {/* Timeline Dropdown */}
            <div className="w-full sm:w-[160px]">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full text-left truncate">
                    Timeline: Custom
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
                      {timeRange === value && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Year Picker */}
            <div className="w-full sm:w-[160px]">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full text-left truncate">
                    Year: {year}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[160px]" align="end">
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i)
                    .filter((y) => y !== 2017 && y !== 2018)
                    .map((y) => (
                    <DropdownMenuItem
                      key={y}
                      className="flex justify-between"
                      onClick={() => handleYearSelect(y)}
                    >
                      <span>{y}</span>
                      {year === y && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Start Month Picker */}
            <div className="w-full sm:w-[160px]">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full text-left truncate">
                    From: {months[startMonth]}
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
                      {startMonth === index && <Check className="h-4 w-4 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* End Month Picker */}
            <div className="w-full sm:w-[160px]">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full text-left truncate">
                    To: {months[endMonth]}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[160px]" align="end">
                  {months.map((month, index) => (
                    <DropdownMenuItem
                      key={month}
                      className={`flex justify-between ${index < startMonth ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => index >= startMonth && handleEndMonthSelect(index)}
                    >
                      <span>{month}</span>
                      {endMonth === index && <Check className="h-4 w-4 text-primary" />}
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