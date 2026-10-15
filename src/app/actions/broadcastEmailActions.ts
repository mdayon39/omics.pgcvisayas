"use server";

import admin from "firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase-admin";
import type { UserRole } from "@/types/Permissions";

const MAX_BROADCAST_RECIPIENTS = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function authorizeBroadcast(
  idToken: string,
): Promise<{ uid: string; email: string; role: UserRole }> {
  if (!adminDb) throw new Error("Email broadcast is unavailable.");
  if (typeof idToken !== "string" || !idToken.trim()) {
    throw new Error("Sign in again before using email broadcast.");
  }

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch {
    throw new Error("Your sign-in has expired. Sign in again to continue.");
  }

  const email = normalizeEmail(decodedToken.email);
  if (!email || decodedToken.email_verified !== true) {
    throw new Error("A verified admin account is required.");
  }

  const adminSnapshot = await adminDb.collection("admins").doc(email).get();
  if (!adminSnapshot.exists || adminSnapshot.data()?.status === "deactivated") {
    throw new Error("You do not have permission to send client broadcasts.");
  }

  const roleValue = adminSnapshot.data()?.role;
  if (roleValue !== "superadmin") {
    throw new Error("Only superadmins can use client email broadcast.");
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
): Promise<{ broadcastId: string; queuedCount: number }> {
  const sender = await authorizeBroadcast(idToken);
  if (!adminDb) throw new Error("Email broadcast is unavailable.");

  const subject = typeof input?.subject === "string" ? input.subject.trim() : "";
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
    throw new Error("Enter a subject of 1 to 200 characters.");
  }
  if (!body || body.length > 10_000) {
    throw new Error("Enter a message of 1 to 10,000 characters.");
  }
  if (
    recipientEmails.length === 0 ||
    recipientEmails.length > MAX_BROADCAST_RECIPIENTS
  ) {
    throw new Error(
      `Enter between 1 and ${MAX_BROADCAST_RECIPIENTS} email addresses.`,
    );
  }
  if (recipientEmails.some((email) => !EMAIL_PATTERN.test(email))) {
    throw new Error("Enter a valid email address for every recipient.");
  }

  const broadcastId = adminDb.collection("emailBroadcasts").doc().id;
  const batch = adminDb.batch();
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

  await batch.commit();
  return { broadcastId, queuedCount: recipientEmails.length };
}
