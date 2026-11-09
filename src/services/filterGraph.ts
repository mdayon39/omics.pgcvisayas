//src/services/filterBarGraph.ts
import { StatisticsBarChartProps } from "@/types/StatBarChart";

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

export const toDate = (timestamp: any) => {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  return new Date(timestamp);
};

export const generateAllTimePeriods = (period: string, count: number = 12) => {
  const now = new Date();
  const periods: string[] = [];

  if (period === "hour") {
    for (let i = 0; i < 24; i++) {
      periods.push(`${i}:00`);
    }
  } else if (period === "day") {
    for (let i = 0; i < count; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      periods.unshift(date.toLocaleDateString("en-US", { weekday: "short" }));
    }
  } else if (period === "week") {
    for (let i = 0; i < count; i++) {
      periods.unshift(`Week ${i + 1}`);
    }
  } else if (period === "month") {
    for (let i = 0; i < count; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      periods.unshift(date.toLocaleDateString("en-US", { month: "short" }));
    }
  } else if (period === "year") {
    for (let year = now.getFullYear(); year >= 2019; year--) {
      periods.unshift(year.toString());
    }
  }

  return periods;
};

export const countByTimePeriod = (
  items: any[],
  dateKey: string,
  period: string,
) => {
  const counts: Record<string, number> = {};
  const allPeriods = generateAllTimePeriods(period, period === "day" ? 7 : 12);

  allPeriods.forEach((p) => {
    counts[p] = 0;
  });

  items.forEach((item) => {
    const date = toDate(item[dateKey]);
    let periodKey = "";

    switch (period) {
      case "hour":
        periodKey = `${date.getHours()}:00`;
        break;
      case "day":
        periodKey = date.toLocaleDateString("en-US", { weekday: "short" });
        break;
      case "week":
        const weekNum = Math.floor(date.getDate() / 7) + 1;
        periodKey = `Week ${weekNum}`;
        break;
      case "month":
        periodKey = date.toLocaleDateString("en-US", { month: "short" });
        break;
      case "year":
        periodKey = date.getFullYear().toString();
        break;
    }

    if (periodKey in counts) {
      counts[periodKey] += 1;
    }
  });

  return Object.entries(counts).map(([name, count]) => ({ name, count }));
};

export const generateChartData = ({
  projectsData,
  clientsData,
  timeRange,
  customRange,
}: StatisticsBarChartProps) => {
  let filteredProjects = [...projectsData];
  let filteredClients = [...clientsData];

  if (timeRange === "today") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    filteredProjects = filteredProjects.filter(
      (p) => toDate(p.startDate) >= todayStart,
    );
    filteredClients = filteredClients.filter(
      (c) => toDate(c.createdAt) >= todayStart,
    );
  } else if (timeRange === "weekly") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    filteredProjects = filteredProjects.filter(
      (p) => toDate(p.startDate) >= weekAgo,
    );
    filteredClients = filteredClients.filter(
      (c) => toDate(c.createdAt) >= weekAgo,
    );
  } else if (timeRange === "monthly") {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    filteredProjects = filteredProjects.filter(
      (p) => toDate(p.startDate) >= monthAgo,
    );
    filteredClients = filteredClients.filter(
      (c) => toDate(c.createdAt) >= monthAgo,
    );
  } else if (timeRange === "yearly") {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    filteredProjects = filteredProjects.filter(
      (p) => toDate(p.startDate) >= yearAgo,
    );
    filteredClients = filteredClients.filter(
      (c) => toDate(c.createdAt) >= yearAgo,
    );
  } else if (timeRange === "custom" && customRange) {
    filteredProjects = filteredProjects.filter((p) => {
      const date = toDate(p.startDate);
      return (
        date.getFullYear() === customRange.year &&
        date.getMonth() >= customRange.startMonth &&
        date.getMonth() <= customRange.endMonth
      );
    });
    filteredClients = filteredClients.filter((c) => {
      const date = toDate(c.createdAt);
      return (
        date.getFullYear() === customRange.year &&
        date.getMonth() >= customRange.startMonth &&
        date.getMonth() <= customRange.endMonth
      );
    });
  }

  switch (timeRange) {
    case "today":
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      return [
        {
          name: "Today",
          projects: filteredProjects.length,
          clients: filteredClients.length,
        },
      ];

    case "weekly":
      const dailyProjects = countByTimePeriod(
        filteredProjects,
        "startDate",
        "day",
      );
      const dailyClients = countByTimePeriod(
        filteredClients,
        "createdAt",
        "day",
      );
      return dailyProjects.map((day, i) => ({
        name: day.name,
        projects: day.count,
        clients: dailyClients[i]?.count || 0,
      }));

    case "monthly":
      const dailyCounts = [];
      const today = new Date();

      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);

        const dayLabel = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        dailyCounts.push({
          name: dayLabel,
          projects: filteredProjects.filter((p) => {
            const pDate = toDate(p.startDate);
            return pDate.toDateString() === date.toDateString();
          }).length,
          clients: filteredClients.filter((c) => {
            const cDate = toDate(c.createdAt);
            return cDate.toDateString() === date.toDateString();
          }).length,
        });
      }
      return dailyCounts;

    case "yearly":
      const monthlyProjects = countByTimePeriod(
        filteredProjects,
        "startDate",
        "month",
      );
      const monthlyClients = countByTimePeriod(
        filteredClients,
        "createdAt",
        "month",
      );
      return monthlyProjects.map((month, i) => ({
        name: month.name,
        projects: month.count,
        clients: monthlyClients[i]?.count || 0,
      }));

    case "all":
      const yearlyProjects = countByTimePeriod(
        filteredProjects,
        "startDate",
        "year",
      );
      const yearlyClients = countByTimePeriod(
        filteredClients,
        "createdAt",
        "year",
      );
      return yearlyProjects.map((year, i) => ({
        name: year.name,
        projects: year.count,
        clients: yearlyClients[i]?.count || 0,
      }));

    case "custom":
      if (!customRange) return [];
      const customMonths = [];
      for (let i = customRange.startMonth; i <= customRange.endMonth; i++) {
        customMonths.push(months[i]);
      }

      return customMonths.map((month) => ({
        name: month,
        projects: filteredProjects.filter((p) => {
          const date = toDate(p.startDate);
          return (
            date.getFullYear() === customRange.year &&
            months[date.getMonth()] === month
          );
        }).length,
        clients: filteredClients.filter((c) => {
          const date = toDate(c.createdAt);
          return (
            date.getFullYear() === customRange.year &&
            months[date.getMonth()] === month
          );
        }).length,
      }));

    default:
      return [
        {
          name: "Overview",
          projects: filteredProjects.length,
          clients: filteredClients.length,
        },
      ];
  }
};
