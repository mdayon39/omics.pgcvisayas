/**
 * Admin Inquiry Data Table Component
 *
 * Enhanced data table with comprehensive filtering, search, and overview features.
 * Built with TanStack Table (React Table v8) for advanced table functionality.
 *
 * Key Features:
 * - Collapsible Filters & Overview section
 * - Status-based filtering with count cards
 * - Search by name, email, or affiliation
 * - Year and month filtering
 * - Summary card showing total count
 * - Advanced pagination with configurable rows per page
 * - Sticky table header
 * - Column sorting
 */

"use client";

import React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
  ColumnFiltersState,
} from "@tanstack/react-table";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Inquiry } from "@/types/Inquiry";
import { CatalogItem } from "@/types/CatalogSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, X, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function getInquirySearchText(inquiry: Inquiry): string {
  return JSON.stringify(inquiry, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  }).toLowerCase();
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  unreadInquiryIds?: Set<string>;
  statusCatalog?: CatalogItem[];
}

export function DataTable<TData, TValue>({
  columns,
  data,
  unreadInquiryIds = new Set(),
  statusCatalog = [],
}: DataTableProps<TData, TValue>) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState<
    string | undefined
  >(undefined);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
  // Filter order type definition
  type FilterOrderItem = { type: string; value: string };
  const [filterOrder, setFilterOrder] = useState<FilterOrderItem[]>([]);

  const monthNames = [
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

  // Handle row click to navigate to detail page
  const handleRowClick = (inquiry: Inquiry, event: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements inside the row.
    const target = event.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest('[role="button"]') ||
      target.closest("a") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("select") ||
      target.closest("label") ||
      target.closest('[role="textbox"]') ||
      target.closest('[role="combobox"]') ||
      target.closest('[role="dialog"]') ||
      target.closest('[contenteditable="true"]') ||
      target.closest('[data-stop-row-click="true"]')
    ) {
      return;
    }
    router.push(`/admin/inquiry/${inquiry.id}`);
  };

  const fallbackStatuses: CatalogItem[] = [
    {
      id: "fallback-pending",
      value: "Pending",
      color: "#eab308",
      order: 1,
      isActive: true,
    },
    {
      id: "fallback-quotation-only",
      value: "Quotation Only",
      color: "#3b82f6",
      order: 2,
      isActive: true,
    },
    {
      id: "fallback-ongoing",
      value: "Ongoing Quotation",
      color: "#f97316",
      order: 3,
      isActive: true,
    },
    {
      id: "fallback-approved",
      value: "Approved Client",
      color: "#22c55e",
      order: 4,
      isActive: true,
    },
    {
      id: "fallback-in-progress",
      value: "In Progress",
      color: "#0ea5e9",
      order: 5,
      isActive: true,
    },
    {
      id: "fallback-service-not-offered",
      value: "Service Not Offered",
      color: "#94a3b8",
      order: 6,
      isActive: true,
    },
  ];

  const statusOptions = useMemo(() => {
    const source = statusCatalog.length > 0 ? statusCatalog : fallbackStatuses;
    return source
      .filter((item) => item.isActive)
      .sort((a, b) => a.order - b.order);
  }, [statusCatalog]);

  const hexToRgba = (hex: string, alpha: number) => {
    const cleaned = hex.replace("#", "");
    if (cleaned.length !== 6) return "";
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const inquiries = data as unknown as Inquiry[];
    const counts: Record<string, number> = {};
    statusOptions.forEach((status) => {
      counts[status.value] = 0;
    });
    inquiries.forEach((inquiry) => {
      const status = inquiry.status || "Pending";
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [data, statusOptions]);

  // Filter summary label with click order tracking
  const filterSummaryLabel = useMemo(() => {
    const orderedFilters: string[] = [];

    // Add filters in the order they were selected
    filterOrder.forEach((filter: FilterOrderItem) => {
      if (filter.type === "status" && activeStatusFilter) {
        orderedFilters.push(activeStatusFilter);
      } else if (
        filter.type === "year" &&
        selectedYear &&
        selectedYear !== "all"
      ) {
        orderedFilters.push(selectedYear);
      } else if (
        filter.type === "month" &&
        selectedMonth &&
        selectedMonth !== "all"
      ) {
        const monthName = monthNames[parseInt(selectedMonth) - 1];
        if (monthName) orderedFilters.push(monthName);
      }
    });

    // Add Year and Month at the end if not already added via filterOrder
    if (
      selectedYear &&
      selectedYear !== "all" &&
      !filterOrder.some((f: FilterOrderItem) => f.type === "year")
    ) {
      orderedFilters.push(selectedYear);
    }
    if (
      selectedMonth &&
      selectedMonth !== "all" &&
      !filterOrder.some((f: FilterOrderItem) => f.type === "month")
    ) {
      const monthName = monthNames[parseInt(selectedMonth) - 1];
      if (monthName) orderedFilters.push(monthName);
    }

    // Add global filter if present
    if (globalFilter) orderedFilters.push(`"${globalFilter}"`);

    return orderedFilters.length > 0
      ? orderedFilters.join(" + ")
      : "No filters applied";
  }, [
    activeStatusFilter,
    selectedYear,
    selectedMonth,
    globalFilter,
    filterOrder,
    monthNames,
  ]);

  // Get available years from data
  const availableYears = useMemo(() => {
    const inquiries = data as unknown as Inquiry[];
    const years = new Set(
      inquiries.map((i) => new Date(i.createdAt).getFullYear().toString()),
    );
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [data]);

  // Month options
  const monthOptions = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  // Custom filter function for date filtering
  const dateFilter = (row: any) => {
    const inquiry = row.original as Inquiry;
    const date = new Date(inquiry.createdAt);
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString();

    if (selectedYear && year !== selectedYear) return false;
    if (selectedMonth && month !== selectedMonth) return false;
    return true;
  };

  // Sort and Paginate rows manually since we're using a custom sortedAndFilteredRows array
  // We keep this sync'd with the table state via onPaginationChange
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  });

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const inquiry = row.original as Inquiry;
      const searchStr = String(filterValue).trim().toLowerCase();
      if (!searchStr) return true;
      return getInquirySearchText(inquiry).includes(searchStr);
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  });

  // Sort rows: first by unread status, then by the table's internal sorting
  const sortedAndFilteredRows = useMemo(() => {
    // 1. Get filtered & sorted rows from table model
    const tableRows = table.getRowModel().rows;

    // 2. Filter by date and showUnreadOnly
    const filtered = tableRows.filter((row) => {
      if (!dateFilter(row)) return false;
      if (showUnreadOnly) {
        const inquiry = row.original as unknown as { id: string };
        return unreadInquiryIds.has(inquiry.id);
      }
      return true;
    });

    // 3. Move rows with unread messages to the top
    const sorted = [...filtered].sort((a, b) => {
      const aId = (a.original as unknown as { id: string }).id;
      const bId = (b.original as unknown as { id: string }).id;
      const aUnread = unreadInquiryIds.has(aId);
      const bUnread = unreadInquiryIds.has(bId);

      if (aUnread && !bUnread) return -1;
      if (!aUnread && bUnread) return 1;
      return 0; // keep relative order from table's internal sorting
    });

    return sorted;
  }, [
    table.getRowModel().rows,
    selectedYear,
    selectedMonth,
    showUnreadOnly,
    unreadInquiryIds,
  ]);

  const pageCount =
    Math.ceil(sortedAndFilteredRows.length / pagination.pageSize) || 1;

  const setPageIndex = (index: number) => {
    setPagination((prev) => ({
      ...prev,
      pageIndex: Math.max(0, Math.min(index, pageCount - 1)),
    }));
  };

  const setPageSize = (size: number) => {
    setPagination({ pageIndex: 0, pageSize: size });
    // No need to call table.setPageSize(size) here since we manually slice the rows
    // based on our own pagination state.
  };

  const nextPage = () => {
    if (pagination.pageIndex < pageCount - 1) {
      setPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }));
    }
    // No need to call table.nextPage() here
  };

  const previousPage = () => {
    if (pagination.pageIndex > 0) {
      setPagination((prev) => ({ ...prev, pageIndex: prev.pageIndex - 1 }));
    }
    // No need to call table.previousPage() here
  };

  const canNextPage = pagination.pageIndex < pageCount - 1;
  const canPreviousPage = pagination.pageIndex > 0;

  const handleStatusFilter = (status: string | undefined) => {
    setActiveStatusFilter(status);
    table.getColumn("status")?.setFilterValue(status);
    if (status) {
      setFilterOrder((prev: FilterOrderItem[]) => [
        ...prev.filter((f: FilterOrderItem) => f.type !== "status"),
        { type: "status", value: status },
      ]);
    } else {
      setFilterOrder((prev: FilterOrderItem[]) =>
        prev.filter((f: FilterOrderItem) => f.type !== "status"),
      );
    }
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year === "all" ? "" : year);
    if (year === "all") setSelectedMonth("");

    if (year === "all") {
      setFilterOrder((prev: FilterOrderItem[]) =>
        prev.filter((f: FilterOrderItem) => f.type !== "year"),
      );
    } else {
      setFilterOrder((prev: FilterOrderItem[]) => [
        ...prev.filter((f: FilterOrderItem) => f.type !== "year"),
        { type: "year", value: year },
      ]);
    }
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month === "all" ? "" : month);

    if (month === "all") {
      setFilterOrder((prev: FilterOrderItem[]) =>
        prev.filter((f: FilterOrderItem) => f.type !== "month"),
      );
    } else {
      setFilterOrder((prev: FilterOrderItem[]) => [
        ...prev.filter((f: FilterOrderItem) => f.type !== "month"),
        { type: "month", value: month },
      ]);
    }
  };

  const clearAllFilters = () => {
    setActiveStatusFilter(undefined);
    setShowUnreadOnly(false);
    setSelectedYear("");
    setSelectedMonth("");
    setGlobalFilter("");
    setFilterOrder([]);
    table.getColumn("status")?.setFilterValue(undefined);
  };

  const activeFiltersCount = [
    activeStatusFilter,
    selectedYear,
    selectedMonth,
    globalFilter,
    showUnreadOnly ? "unread" : undefined,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Filters & Overview Section */}
      <Card className="overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-2 border-b cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
        >
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-800">
              Filters & Overview
            </h3>
            {activeFiltersCount > 0 && isFiltersCollapsed && (
              <Badge
                variant="secondary"
                className="h-5 px-2 text-[10px] font-semibold bg-blue-100 text-blue-700 hover:bg-blue-100"
              >
                {activeFiltersCount} filter{activeFiltersCount > 1 ? "s" : ""}{" "}
                active
              </Badge>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${isFiltersCollapsed ? "" : "rotate-180"}`}
          />
        </div>

        {!isFiltersCollapsed && (
          <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">
            {/* Primary Content Filters Row */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Processing Status */}
              <div className="space-y-2 lg:col-span-4">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Processing Status
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {statusOptions.map((status) => {
                    const isActive = activeStatusFilter === status.value;
                    const color = status.color;
                    const style = color
                      ? {
                          borderColor: color,
                          color,
                          backgroundColor: isActive
                            ? hexToRgba(color, 0.12)
                            : "",
                        }
                      : undefined;

                    return (
                      <button
                        key={status.id}
                        onClick={() =>
                          handleStatusFilter(
                            isActive ? undefined : status.value,
                          )
                        }
                        style={style}
                        className={`rounded-md border px-2 py-2 text-[9px] font-medium transition-all duration-200 hover:shadow-sm bg-white hover:bg-gray-50 ${
                          isActive ? "font-semibold" : "text-gray-700"
                        }`}
                      >
                        {status.value} ({statusCounts[status.value] || 0})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Search Tools & Summary Row */}
            <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-gray-100">
              {/* Search Tools */}
              <div className="flex items-end gap-3">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-bold uppercase text-muted-foreground ml-1">
                    Search
                  </span>
                  <div className="relative">
                    <Input
                      placeholder="Search all fields..."
                      value={globalFilter ?? ""}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        setGlobalFilter(event.target.value)
                      }
                      className="w-56 pl-3 pr-8 h-8 text-sm"
                    />
                    {globalFilter && (
                      <button
                        onClick={() => setGlobalFilter("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[8px] font-bold uppercase text-muted-foreground ml-1">
                    Year
                  </span>
                  <Select
                    value={selectedYear || "all"}
                    onValueChange={handleYearChange}
                  >
                    <SelectTrigger className="w-24 h-8 text-sm">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {availableYears.map((year: string) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[8px] font-bold uppercase text-muted-foreground ml-1">
                    Month
                  </span>
                  <Select
                    value={selectedMonth || "all"}
                    onValueChange={handleMonthChange}
                  >
                    <SelectTrigger className="w-28 h-8 text-sm">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Months</SelectItem>
                      {monthOptions.map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Summary & Clear Filters */}
              <div className="flex items-center justify-end gap-3">
                <div
                  onClick={activeFiltersCount > 0 ? clearAllFilters : undefined}
                  className={`p-3 rounded-lg border transition-all duration-200 ${
                    activeFiltersCount > 0
                      ? "bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="text-right">
                    <div className="text-xs font-medium text-gray-600 mb-1">
                      {filterSummaryLabel}
                    </div>
                    <div className="text-lg font-bold text-gray-800">
                      {sortedAndFilteredRows.length} records
                    </div>
                    {/* Removed 'Click to clear all filters' label */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Table Header with Record Count and Navigation */}
      <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Showing{" "}
            {sortedAndFilteredRows.length > 0
              ? pagination.pageIndex * pagination.pageSize + 1
              : 0}{" "}
            -{" "}
            {Math.min(
              (pagination.pageIndex + 1) * pagination.pageSize,
              sortedAndFilteredRows.length,
            )}{" "}
            of {sortedAndFilteredRows.length} records
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Rows:
          </span>
          <Select
            value={pagination.pageSize.toString()}
            onValueChange={(value) => setPageSize(Number(value))}
          >
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setPageIndex(0)}
            disabled={!canPreviousPage}
          >
            &laquo;
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => previousPage()}
            disabled={!canPreviousPage}
          >
            Prev
          </Button>
          <div className="flex items-center justify-center min-w-[80px] text-sm font-medium">
            {pagination.pageIndex + 1} / {pageCount}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={() => nextPage()}
            disabled={!canNextPage}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setPageIndex(pageCount - 1)}
            disabled={!canNextPage}
          >
            &raquo;
          </Button>
        </div>
      </div>

      {/* Compact Table with Sticky Header */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden transition-all duration-300">
          <Table className="w-full border-collapse table-fixed">
            <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 border-b shadow-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="hover:bg-transparent border-0"
                >
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort?.();
                    const sortDir = header.column.getIsSorted?.();
                    return (
                      <TableHead
                        key={header.id}
                        onClick={
                          canSort
                            ? header.column.getToggleSortingHandler()
                            : undefined
                        }
                        className={cn(
                          "h-10 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-100 last:border-r-0",
                          canSort
                            ? "cursor-pointer select-none hover:bg-slate-100/50 transition-colors"
                            : "",
                        )}
                        style={{ width: header.column.columnDef.size }}
                      >
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-1.5">
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                            {canSort && (
                              <div className="flex flex-col -gap-0.5 opacity-40">
                                <span
                                  className={cn(
                                    "text-[8px] leading-none",
                                    sortDir === "asc" &&
                                      "text-blue-600 opacity-100",
                                  )}
                                >
                                  ▲
                                </span>
                                <span
                                  className={cn(
                                    "text-[8px] leading-none",
                                    sortDir === "desc" &&
                                      "text-blue-600 opacity-100",
                                  )}
                                >
                                  ▼
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {(() => {
                const startIndex = pagination.pageIndex * pagination.pageSize;
                const paginatedRows = sortedAndFilteredRows.slice(
                  startIndex,
                  startIndex + pagination.pageSize,
                );

                return paginatedRows.length ? (
                  paginatedRows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "group hover:bg-blue-50/30 transition-colors cursor-pointer border-b border-slate-200 last:border-0",
                        unreadInquiryIds.has(
                          (row.original as unknown as { id: string }).id,
                        )
                          ? "bg-blue-50/60"
                          : "",
                      )}
                      data-state={row.getIsSelected() && "selected"}
                      onClick={(e: React.MouseEvent) =>
                        handleRowClick(row.original as Inquiry, e)
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className="py-1.5 px-2 text-[13px] text-slate-600 border-r border-slate-200 last:border-r-0 align-middle truncate"
                          style={{ width: cell.column.columnDef.size }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="text-center h-24 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center gap-2 py-4">
                        <p>No results found for current filters.</p>
                        <Button variant="link" onClick={clearAllFilters}>
                          Clear all filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Bottom Pagination */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Rows:
            </span>
            <Select
              value={pagination.pageSize.toString()}
              onValueChange={(value: string) => setPageSize(Number(value))}
            >
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => previousPage()}
              disabled={!canPreviousPage}
            >
              Prev
            </Button>
            <div className="flex items-center justify-center min-w-[80px] text-sm font-medium">
              {pagination.pageIndex + 1} / {pageCount}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => nextPage()}
              disabled={!canNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
