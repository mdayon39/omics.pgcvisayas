import { adminDb } from "@/lib/firebase-admin";
import type { EmailMonitorCategory } from "@/types/EmailMonitoring";

export async function beginEmailMonitorEvent(
  category: EmailMonitorCategory,
  recipient: string,
  sourceId: string,
): Promise<string | null> {
  if (!adminDb) return null;

  try {
    const event = await adminDb.collection("emailMonitoringEvents").add({
      category,
      recipient,
      sourceId,
      triggeredAt: new Date(),
      queueStatus: "queueing",
    });
    return event.id;
  } catch (error) {
    console.error("Could not record email monitoring trigger:", error);
    return null;
  }
}

export async function markEmailMonitorQueued(
  eventId: string | null,
  mailDocumentId: string,
): Promise<void> {
  if (!adminDb || !eventId) return;

  try {
    await adminDb.collection("emailMonitoringEvents").doc(eventId).update({
      queueStatus: "queued",
      mailDocumentId,
    });
  } catch (error) {
    console.error("Could not update email monitoring queue status:", error);
  }
}

export async function markEmailMonitorFailed(
  eventId: string | null,
  error: unknown,
): Promise<void> {
  if (!adminDb || !eventId) return;

  const message = error instanceof Error ? error.message : String(error);
  try {
    await adminDb.collection("emailMonitoringEvents").doc(eventId).update({
      queueStatus: "failed",
      error: message,
    });
  } catch (monitorError) {
    console.error("Could not record email monitoring failure:", monitorError);
  }
}
