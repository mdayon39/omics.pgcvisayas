export const EMAIL_MONITOR_CATEGORIES = [
  "Inquiry received",
  "Quotation available",
  "Charge slip",
  "Chat received",
  "Update regarding your inquiry",
  "Service report available",
  "Service report received",
  "Project approval and next steps",
  "Password recovery",
  "Client broadcast",
] as const;

export type EmailMonitorCategory = (typeof EMAIL_MONITOR_CATEGORIES)[number];

export type EmailMonitorEvent = {
  id: string;
  category: EmailMonitorCategory;
  recipient: string;
  sourceId: string;
  triggeredAt: Date;
  triggeredByEmail?: string;
  queueStatus: "queueing" | "queued" | "failed";
  mailDocumentId?: string;
  error?: string;
};
