"use server";

import admin from "firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase-admin";
import type { UserRole } from "@/types/Permissions";

const MAX_BROADCAST_RECIPIENTS = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class BroadcastActionError extends Error {}

type QueueBroadcastResult =
  | { success: true; broadcastId: string; queuedCount: number }
  | { success: false; error: string };

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if (!("code" in error)) return undefined;
  const { code } = error;
  return typeof code === "string" || typeof code === "number"
    ? String(code)
    : undefined;
}

async function authorizeBroadcast(
  idToken: string,
  stageState: { value: string },
): Promise<{ uid: string; email: string; role: UserRole }> {
  stageState.value = "checking server Firebase configuration";
  if (!adminDb)
    throw new BroadcastActionError("Email broadcast is unavailable.");
  if (typeof idToken !== "string" || !idToken.trim()) {
    throw new BroadcastActionError(
      "Sign in again before using email broadcast.",
    );
  }

  let decodedToken: DecodedIdToken;
  stageState.value = "verifying Firebase sign-in token";
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch {
    throw new BroadcastActionError(
      "Your sign-in has expired. Sign in again to continue.",
    );
  }

  const email = normalizeEmail(decodedToken.email);
  if (!email || decodedToken.email_verified !== true) {
    throw new BroadcastActionError("A verified admin account is required.");
  }

  stageState.value = "reading the admin access record from Firestore";
  let adminSnapshot: FirebaseFirestore.DocumentSnapshot;
  try {
    adminSnapshot = await adminDb.collection("admins").doc(email).get();
  } catch (error) {
    const errorCode = getErrorCode(error);
    console.error("Could not read the broadcast sender's admin record:", {
      errorCode: errorCode || "unknown",
      errorName:
        error && typeof error === "object" && "name" in error
          ? String(error.name)
          : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new BroadcastActionError(
      `The server could not read the admin access record from Firestore${errorCode ? ` (Firebase error ${errorCode})` : ""}. Check that production has valid Firebase Admin credentials and the runtime service account has Firestore read access.`,
    );
  }
  if (!adminSnapshot.exists || adminSnapshot.data()?.status === "deactivated") {
    throw new BroadcastActionError(
      "You do not have permission to send client broadcasts.",
    );
  }

  const roleValue = adminSnapshot.data()?.role;
  if (roleValue !== "superadmin") {
    throw new BroadcastActionError(
      "Only superadmins can use client email broadcast.",
    );
  }

  return { uid: decodedToken.uid, email, role: roleValue as UserRole };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function queueClientBroadcast(
  idToken: string,
  input: { recipientEmails: string[]; subject: string; body: string },
): Promise<QueueBroadcastResult> {
  const stageState = { value: "starting admin authorization" };
  try {
    const sender = await authorizeBroadcast(idToken, stageState);
    if (!adminDb) {
      throw new BroadcastActionError("Email broadcast is unavailable.");
    }

    stageState.value = "message validation";
    const subject =
      typeof input?.subject === "string" ? input.subject.trim() : "";
    const body =
      typeof input?.body === "string"
        ? input.body.trim().replace(/\r\n?/g, "\n")
        : "";
    const recipientEmails = Array.isArray(input?.recipientEmails)
      ? [
          ...new Set(
            input.recipientEmails
              .filter((email): email is string => typeof email === "string")
              .map(normalizeEmail),
          ),
        ]
      : [];

    if (!subject || subject.length > 200) {
      throw new BroadcastActionError("Enter a subject of 1 to 200 characters.");
    }
    if (!body || body.length > 10_000) {
      throw new BroadcastActionError(
        "Enter a message of 1 to 10,000 characters.",
      );
    }
    if (
      recipientEmails.length === 0 ||
      recipientEmails.length > MAX_BROADCAST_RECIPIENTS
    ) {
      throw new BroadcastActionError(
        `Enter between 1 and ${MAX_BROADCAST_RECIPIENTS} email addresses.`,
      );
    }
    if (recipientEmails.some((email) => !EMAIL_PATTERN.test(email))) {
      throw new BroadcastActionError(
        "Enter a valid email address for every recipient.",
      );
    }

    const broadcastId = adminDb.collection("emailBroadcasts").doc().id;
    const batch = adminDb.batch();
    stageState.value = "Firestore queue preparation";
    batch.set(adminDb.collection("emailBroadcasts").doc(broadcastId), {
      subject,
      recipientCount: recipientEmails.length,
      createdByUid: sender.uid,
      createdByEmail: sender.email,
      createdAt: new Date(),
    });

    for (const email of recipientEmails) {
      const mailReference = adminDb.collection("mail").doc();
      const eventReference = adminDb.collection("emailMonitoringEvents").doc();
      const safeBody = escapeHtml(body).replace(/\n/g, "<br />");

      batch.set(mailReference, {
        to: [email],
        message: {
          subject,
          text: body,
          html: `<div><p>${safeBody}</p></div>`,
        },
        broadcastId,
      });
      batch.set(eventReference, {
        category: "Client broadcast",
        recipient: email,
        sourceId: broadcastId,
        triggeredByUid: sender.uid,
        triggeredAt: new Date(),
        queueStatus: "queued",
        mailDocumentId: mailReference.id,
      });
    }

    stageState.value = "Firestore queue commit";
    await batch.commit();
    return {
      success: true,
      broadcastId,
      queuedCount: recipientEmails.length,
    };
  } catch (error) {
    if (error instanceof BroadcastActionError) {
      return { success: false, error: error.message };
    }
    const errorCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (typeof error.code === "string" || typeof error.code === "number")
        ? String(error.code)
        : "unknown";
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Failed to queue client email broadcast:", {
      stage: stageState.value,
      errorCode,
      errorMessage,
    });
    return {
      success: false,
      error:       `Could not queue the broadcast during ${stageState.value} (error ${errorCode}). Check server logs for details. No success was reported; check Sent Items before retrying.`,
    };
  }
}
