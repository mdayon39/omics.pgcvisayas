import html2canvas from "html2canvas";
import type { CustomRange, TimeRange } from "@/types/TimeFilter";

const PAGE_MARGIN = 13;
const HEADER_HEIGHT = 32;
const FOOTER_Y = 203;
const CONTENT_WIDTH = 271;

function getPeriodLabel(
  timeRange: TimeRange,
  customRange: CustomRange | undefined,
  monthNames: string[],
): string {
  if (timeRange === "custom" && customRange) {
    const startMonth = monthNames[customRange.startMonth];
    const endMonth = monthNames[customRange.endMonth];
    const months =
      customRange.startMonth === customRange.endMonth
        ? startMonth
        : `${startMonth} - ${endMonth}`;
    return `${months} ${customRange.year}`;
  }

  const labels: Record<Exclude<TimeRange, "custom">, string> = {
    all: "All time",
    today: "Today",
    weekly: "Last 7 days",
    monthly: "Last 30 days",
    yearly: "Last 12 months",
  };
  return timeRange === "custom" ? "Selected period" : labels[timeRange];
}

async function captureSection(
  element: HTMLElement,
  sectionName: string,
): Promise<string> {
  const canvas = await html2canvas(element, {
    backgroundColor: "#F5F6F8",
    scale: 2,
    useCORS: true,
    logging: false,
    onclone: (clonedDocument) => {
      if (sectionName !== "breakdown") return;

      const breakdown = clonedDocument.querySelector<HTMLElement>(
        '[data-pdf-section="breakdown"]',
      );
      if (!breakdown) {
        throw new Error("Could not prepare the project breakdown for export.");
      }

      breakdown
        .querySelectorAll<HTMLElement>(".pointer-events-none")
        .forEach((center) => {
          center.style.overflow = "visible";
          center.style.paddingLeft = "12px";
          center.style.paddingRight = "12px";

          const value = center.querySelector<HTMLElement>("span:first-child");
          if (value) {
            value.style.maxWidth = "100%";
            value.style.height = "auto";
            value.style.overflow = "visible";
            value.style.textOverflow = "clip";
            value.style.whiteSpace = "nowrap";
            value.style.lineHeight = "1.35";
            value.style.paddingTop = "3px";
            value.style.paddingBottom = "3px";
          }
        });

      breakdown.querySelectorAll<HTMLElement>("button").forEach((button) => {
        button.style.minHeight = "38px";
        button.style.height = "auto";
        button.style.overflow = "visible";
        button.style.lineHeight = "1.4";
        button.style.paddingTop = "8px";
        button.style.paddingBottom = "8px";
      });

      breakdown
        .querySelectorAll<HTMLElement>("button .truncate")
        .forEach((label) => {
          label.style.height = "auto";
          label.style.overflow = "visible";
          label.style.textOverflow = "clip";
          label.style.whiteSpace = "normal";
          label.style.lineHeight = "1.4";
        });
    },
  });
  const image = canvas.toDataURL("image/jpeg", 0.94);
  canvas.width = 0;
  canvas.height = 0;

  if (!image.startsWith("data:image/jpeg")) {
    throw new Error(`Could not render the ${sectionName} section.`);
  }
  return image;
}

function addPageHeader(
  pdf: import("jspdf").jsPDF,
  period: string,
  generatedDate: string,
) {
  pdf.setFillColor(27, 35, 48);
  pdf.rect(0, 0, 297, HEADER_HEIGHT, "F");
  pdf.setFillColor(46, 121, 153);
  pdf.rect(0, HEADER_HEIGHT - 2, 297, 2, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("OMICS Dashboard Report", PAGE_MARGIN, 14);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Reporting period: ${period}`, PAGE_MARGIN, 23);

  pdf.setFontSize(8);
  pdf.setTextColor(222, 228, 235);
  pdf.text(`Generated ${generatedDate}`, 297 - PAGE_MARGIN, 15, {
    align: "right",
  });
}

function addPageFooter(pdf: import("jspdf").jsPDF, page: number, total: number) {
  pdf.setDrawColor(228, 231, 236);
  pdf.line(PAGE_MARGIN, FOOTER_Y - 5, 297 - PAGE_MARGIN, FOOTER_Y - 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(102, 112, 133);
  pdf.text("OMICS | Philippine Genome Center Visayas", PAGE_MARGIN, FOOTER_Y);
  pdf.text(`Page ${page} of ${total}`, 297 - PAGE_MARGIN, FOOTER_Y, {
    align: "right",
  });
}

function addImageContain(
  pdf: import("jspdf").jsPDF,
  image: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const imageProperties = pdf.getImageProperties(image);
  const scale = Math.min(
    maxWidth / imageProperties.width,
    maxHeight / imageProperties.height,
  );
  const width = imageProperties.width * scale;
  const height = imageProperties.height * scale;
  pdf.addImage(image, "JPEG", x + (maxWidth - width) / 2, y, width, height);
}

export async function exportDashboardPDF({
  elementId,
  timeRange,
  customRange,
  monthNames,
}: {
  elementId: string;
  timeRange: TimeRange;
  customRange?: CustomRange;
  monthNames: string[];
}) {
  await document.fonts?.ready;

  const dashboard = document.getElementById(elementId);
  if (!dashboard) {
    throw new Error(`Could not find the dashboard element "${elementId}".`);
  }

  const getSection = (name: string) => {
    const section = dashboard.querySelector<HTMLElement>(
      `[data-pdf-section="${name}"]`,
    );
    if (!section) {
      throw new Error(`Could not find the dashboard ${name} section.`);
    }
    return section;
  };

  const summaryImage = await captureSection(getSection("summary"), "summary");
  const trendsImage = await captureSection(getSection("trends"), "trends");
  const breakdownImage = await captureSection(
    getSection("breakdown"),
    "breakdown",
  );

  const period = getPeriodLabel(timeRange, customRange, monthNames);
  const generatedDate = new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const jsPDF = (await import("jspdf")).default;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  pdf.setProperties({
    title: `OMICS Dashboard Report - ${period}`,
    subject: "Administrative dashboard summary",
    author: "Philippine Genome Center Visayas",
  });

  addPageHeader(pdf, period, generatedDate);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(71, 84, 103);
  pdf.text("KEY PERFORMANCE INDICATORS", PAGE_MARGIN, 41);
  addImageContain(pdf, summaryImage, PAGE_MARGIN, 45, CONTENT_WIDTH, 31);

  pdf.text("CLIENT AND PROJECT TRENDS", PAGE_MARGIN, 84);
  addImageContain(pdf, trendsImage, PAGE_MARGIN, 88, CONTENT_WIDTH, 105);
  addPageFooter(pdf, 1, 2);

  pdf.addPage("a4", "landscape");
  addPageHeader(pdf, period, generatedDate);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(71, 84, 103);
  pdf.text("PROJECT BREAKDOWN", PAGE_MARGIN, 42);
  addImageContain(pdf, breakdownImage, PAGE_MARGIN, 47, CONTENT_WIDTH, 148);
  addPageFooter(pdf, 2, 2);

  const safePeriod = period
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_|_$/g, "");
  const dateSuffix = new Date().toISOString().slice(0, 10);
  pdf.save(`dashboard-report_${safePeriod}_${dateSuffix}.pdf`);
}
