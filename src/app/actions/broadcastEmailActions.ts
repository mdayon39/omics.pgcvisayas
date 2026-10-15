"use server";

import admin from "firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase-admin";
import type { UserRole } from "@/types/Permissions";

const TEST_RECIPIENT_EMAIL = "dayonmerlitojr@gmail.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BroadcastRecipient = {
  id: string;
  name: string;
  email: string;
};

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

function readRecipients(
  documents: FirebaseFirestore.DocumentSnapshot[],
): BroadcastRecipient[] {
  const recipientsByEmail = new Map<string, BroadcastRecipient>();
  for (const document of documents) {
    const data = document.data();
    if (!data) continue;
    const email = normalizeEmail(data.email);
    if (
      email !== TEST_RECIPIENT_EMAIL ||
      !EMAIL_PATTERN.test(email) ||
      recipientsByEmail.has(email)
    ) {
      continue;
    }
    recipientsByEmail.set(email, {
      id: document.id,
      name:
        typeof data.name === "string" && data.name.trim()
          ? data.name.trim()
          : "Valued Client",
      email,
    });
  }
  return [...recipientsByEmail.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function getBroadcastRecipients(
  idToken: string,
): Promise<BroadcastRecipient[]> {
  await authorizeBroadcast(idToken);
  const snapshot = await adminDb!.collection("inquiries").get();
  return readRecipients(snapshot.docs);
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
  input: { inquiryIds: string[]; subject: string; body: string },
): Promise<{ broadcastId: string; queuedCount: number }> {
  const sender = await authorizeBroadcast(idToken);
  if (!adminDb) throw new Error("Email broadcast is unavailable.");

  const subject = typeof input?.subject === "string" ? input.subject.trim() : "";
  const body =
    typeof input?.body === "string"
      ? input.body.trim().replace(/\r\n?/g, "\n")
      : "";
  const inquiryIds = Array.isArray(input?.inquiryIds)
    ? [...new Set(input.inquiryIds.filter((id) => typeof id === "string"))]
    : [];

  if (!subject || subject.length > 200) {
    throw new Error("Enter a subject of 1 to 200 characters.");
  }
  if (!body || body.length > 10_000) {
    throw new Error("Enter a message of 1 to 10,000 characters.");
  }
  if (inquiryIds.length !== 1) {
    throw new Error("Select the test inquiry email to send a broadcast.");
  }
  if (inquiryIds.some((id) => !id || id.length > 1_500 || id.includes("/"))) {
    throw new Error("The selected inquiry list is invalid. Refresh it and try again.");
  }

  const inquiryReferences = inquiryIds.map((id) =>
    adminDb!.collection("inquiries").doc(id),
  );
  const inquirySnapshots = await adminDb.getAll(...inquiryReferences);
  if (inquirySnapshots.some((snapshot) => !snapshot.exists)) {
    throw new Error("The inquiry list changed. Refresh it and try again.");
  }
  const recipients = readRecipients(inquirySnapshots);
  if (
    recipients.length !== 1 ||
    recipients[0].email !== TEST_RECIPIENT_EMAIL
  ) {
    throw new Error(
      `Only ${TEST_RECIPIENT_EMAIL} can receive test broadcasts. Refresh the inquiry list.`,
    );
  }

  const broadcastId = adminDb.collection("emailBroadcasts").doc().id;
  const batch = adminDb.batch();
  batch.set(adminDb.collection("emailBroadcasts").doc(broadcastId), {
    subject,
    recipientCount: recipients.length,
    createdByUid: sender.uid,
    createdByEmail: sender.email,
    createdAt: new Date(),
  });

  for (const recipient of recipients) {
    const mailReference = adminDb.collection("mail").doc();
    const eventReference = adminDb.collection("emailMonitoringEvents").doc();
    const safeName = escapeHtml(recipient.name);
    const safeBody = escapeHtml(body).replace(/\n/g, "<br />");

    batch.set(mailReference, {
      to: [recipient.email],
      message: {
        subject,
        text: `Dear ${recipient.name},\n\n${body}`,
        html: `<div><p>Dear ${safeName},</p><p>${safeBody}</p></div>`,
      },
      broadcastId,
    });
    batch.set(eventReference, {
      category: "Client broadcast",
      recipient: recipient.email,
      sourceId: broadcastId,
      triggeredByUid: sender.uid,
      triggeredAt: new Date(),
      queueStatus: "queued",
      mailDocumentId: mailReference.id,
    });
  }

  await batch.commit();
  return { broadcastId, queuedCount: recipients.length };
}
