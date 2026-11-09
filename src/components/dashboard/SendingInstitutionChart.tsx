"use client";

/**
 * Pie chart showing the distribution of projects by sending institution type.
 */

import { BasePieChart } from "./BasePieChart";
import { Project } from "@/types/Project";
import { DASHBOARD_COLORS } from "./dashboardColors";

// Match exactly with Project interface's sendingInstitution type
const INSTITUTION_CATEGORIES: readonly ("UP System" | "SUC/HEI" | "Government" | "Private/Local" | "International" | "N/A")[] = [
  "UP System",
  "SUC/HEI",
  "Government",
  "Private/Local",
  "International",
  "N/A"
] as const;

type InstitutionCategory = typeof INSTITUTION_CATEGORIES[number];

// Colors for each category in the pie chart
const CATEGORY_COLORS: Record<InstitutionCategory, string> = {
  ...DASHBOARD_COLORS.sendingInstitution,
};

export function SendingInstitutionChart({ projects }: { projects: Project[] }) {
  // Initialize counts for all categories
  const institutionCounts = INSTITUTION_CATEGORIES.reduce((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {} as Record<InstitutionCategory, number>);

  projects.forEach((project) => {
    const institution = project.sendingInstitution;
    if (institution && INSTITUTION_CATEGORIES.includes(institution)) {
      institutionCounts[institution] += 1;
    }
  });

  // Prepare data for the pie chart
  const data = INSTITUTION_CATEGORIES.map((category) => ({
    name: category,
    value: institutionCounts[category],
  }));

  return (
    <BasePieChart
      title="Sending Institution"
      categories={INSTITUTION_CATEGORIES}
      colors={CATEGORY_COLORS}
      data={data}
      emptyMessage="No data available"
    />
  );
}