"use client";

/**
 * Pie chart showing the distribution of projects by funding category.
 */

import { BasePieChart } from "./BasePieChart";
import { Project } from "@/types/Project";
import { DASHBOARD_COLORS } from "./dashboardColors";

// Match exactly with Project interface's fundingCategory type
const FUNDING_CATEGORIES: readonly ("External" | "In-House")[] = [
  "In-House",
  "External"
] as const;

type FundingCategory = typeof FUNDING_CATEGORIES[number];

// Colors for each category in the pie chart
const CATEGORY_COLORS: Record<FundingCategory, string> = {
  ...DASHBOARD_COLORS.fundingCategory,
};

export function FundingCategoryChart({ projects }: { projects: Project[] }) {
  // Count projects for each funding category
  const fundingCounts = FUNDING_CATEGORIES.reduce((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {} as Record<FundingCategory, number>);

  projects.forEach((project) => {
    const category = project.fundingCategory;
    if (category && FUNDING_CATEGORIES.includes(category)) {
      fundingCounts[category] += 1;
    }
  });

  // Prepare data for the pie chart
  const data = FUNDING_CATEGORIES.map((category) => ({
    name: category,
    value: fundingCounts[category],
  }));

  return (
    <BasePieChart
      title="Funding Category"
      categories={FUNDING_CATEGORIES}
      colors={CATEGORY_COLORS}
      data={data}
      emptyMessage="No data available"
    />
  );
}