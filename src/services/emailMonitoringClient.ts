import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { EmailMonitorCategory } from "@/types/EmailMonitoring";

export async function beginEmailMonitorEvent(
  category: EmailMonitorCategory,
  recipient: string,
  sourceId: string,
): Promise<string | null> {
  try {
    const event = await addDoc(collection(db, "emailMonitoringEvents"), {
      category,
      recipient,
      sourceId,
      triggeredByUid: auth.currentUser?.uid || "",
      triggeredAt: serverTimestamp(),
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
  if (!eventId) return;

  try {
    await updateDoc(doc(db, "emailMonitoringEvents", eventId), {
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
  if (!eventId) return;

  const message = error instanceof Error ? error.message : String(error);
  try {
    await updateDoc(doc(db, "emailMonitoringEvents", eventId), {
      queueStatus: "failed",
      error: message,
    });
  } catch (monitorError) {
    console.error("Could not record email monitoring failure:", monitorError);
  }
}
