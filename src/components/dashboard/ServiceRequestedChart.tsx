"use client";

/**
 * Pie chart showing the distribution of requested services for projects.
 * Uses BasePieChart for visualization.
 */

import { BasePieChart } from "./BasePieChart";
import { Project } from "@/types/Project";
import { DASHBOARD_COLORS } from "./dashboardColors";

const SERVICE_CATEGORIES = [
  "Laboratory Services",
  "Equipment Use",
  "Bioinformatics Analysis",
  "Retail Sales",
  "Training",
] as const;

type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

// Colors for each category in the pie chart
const CATEGORY_COLORS: Record<ServiceCategory, string> = {
  ...DASHBOARD_COLORS.serviceRequested,
};

// Type guard to check if a string is a ServiceCategory
function isServiceCategory(service: string): service is ServiceCategory {
  return SERVICE_CATEGORIES.includes(service as ServiceCategory);
}

export function ServiceRequestedChart({ projects }: { projects: Project[] }) {
  // Count projects for each service category
  const serviceCounts = SERVICE_CATEGORIES.reduce((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {} as Record<ServiceCategory, number>);

  projects.forEach((project) => {
    const services = Array.isArray(project.serviceRequested)
      ? project.serviceRequested
      : project.serviceRequested
        ? [project.serviceRequested]
        : [];

    services.forEach((service) => {
      if (service && isServiceCategory(service)) {
        serviceCounts[service] += 1;
      }
    });
  });

  // Prepare data for the pie chart
  const data = SERVICE_CATEGORIES.map((category) => ({
    name: category,
    value: serviceCounts[category],
  }));

  return (
    <BasePieChart
      title="Service Requested"
      categories={SERVICE_CATEGORIES}
      colors={CATEGORY_COLORS}
      data={data}
      emptyMessage="No data available"
    />
  );
}