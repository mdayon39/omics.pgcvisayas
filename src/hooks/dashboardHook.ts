// src/hooks/useDashboardData.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { Timestamp } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { fetchAllData, fetchFilteredData } from "../services/dashboardUtils";
import { exportDashboardPDF } from "@/services/exportDashboardPDF";
import { TimeRange, CustomRange } from "@/types/TimeFilter";
import { useToast } from "@/hooks/use-toast";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function useDashboardData() {
  const { toast } = useToast();
  const [userName, setUserName] = useState("User");
  const [totalProjects, setTotalProjects] = useState(0);
  const [filteredProjects, setFilteredProjects] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [filteredChargeSlips, setFilteredChargeSlips] = useState<any[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);

  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const [timeRange, setTimeRange] = useState<TimeRange>("custom");
  const [customRange, setCustomRange] = useState<CustomRange | undefined>({
    year: new Date().getFullYear(),
    startMonth: 0,
    endMonth: 11
  });

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.displayName) setUserName(user.displayName);
    });
    return () => unsub();
  }, []);

  const fetchAllDataHandler = async () => {
    await fetchAllData({
      setTotalProjects,
      setFilteredProjects,
      setFilteredClients,
      setFilteredChargeSlips,
      setTotalIncome
    });
  };

  const handleTimeFilterChange = useCallback(async (range: TimeRange | CustomRange) => {
    setLoading(true);

    if (typeof range === "string") {
      setTimeRange(range);
      setCustomRange(undefined);

      if (range === "all") {
        await fetchAllDataHandler();
        setLoading(false);
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let start: Date;

      switch (range) {
        case "today":
          start = today;
          break;
        case "weekly":
          start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "monthly":
          start = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
          break;
        case "yearly":
          start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
          break;
        default:
          start = today;
      }

      const startTS = Timestamp.fromDate(start);
      const endTS = Timestamp.fromDate(new Date());

      await fetchFilteredData(startTS, endTS, { setTotalProjects, setFilteredProjects, setFilteredClients, setFilteredChargeSlips, setTotalIncome });
      setLoading(false);
      return;
    }

    setTimeRange("custom");
    setCustomRange(range);

    const startDate = new Date(range.year, range.startMonth, 1);
    const endDate = new Date(range.year, range.endMonth + 1, 0);
    const startTS = Timestamp.fromDate(startDate);
    const endTS = Timestamp.fromDate(endDate);

      await fetchFilteredData(startTS, endTS, { setTotalProjects, setFilteredProjects, setFilteredClients, setFilteredChargeSlips, setTotalIncome });
    setLoading(false);
  }, []);

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      await exportDashboardPDF({
        elementId: "dashboard-content",
        timeRange,
        customRange,
        monthNames
      });
    } catch (e) {
      console.error("PDF export failed", e);
      toast({
        title: "PDF export failed",
        description: "The dashboard report could not be generated. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return {
    userName,
    loading,
    isExporting,
    totalProjects,
    filteredProjects,
    filteredClients,
    timeRange,
    customRange,
    totalIncome,
    handleTimeFilterChange,
    exportToPDF
  };
}
