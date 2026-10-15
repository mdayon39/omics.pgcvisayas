"use server";

import admin from "firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import { randomUUID } from "node:crypto";
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

  const tokenEmail = decodedToken.email;
  const email = normalizeEmail(tokenEmail);
  if (!tokenEmail || !email || decodedToken.email_verified !== true) {
    throw new BroadcastActionError("A verified admin account is required.");
  }

  stageState.value = "reading the admin access record from Firestore";
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new BroadcastActionError(
      "Firebase project ID is not configured on the server.",
    );
  }

  let adminRecord: {
    fields?: {
      role?: { stringValue?: string };
      status?: { stringValue?: string };
    };
  };
  try {
    const documentUrl = new URL(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/admins/${encodeURIComponent(email)}`,
    );
    const response = await fetch(documentUrl, {
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    });
    if (response.status === 404) {
      throw new BroadcastActionError(
        "Your Firebase account does not have an admin access record.",
      );
    }
    if (!response.ok) {
      throw new Error(`Firestore returned HTTP ${response.status}.`);
    }
    adminRecord = await response.json();
  } catch (error) {
    if (error instanceof BroadcastActionError) throw error;
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
      `The server could not read the admin access record from Firestore${errorCode ? ` (Firebase error ${errorCode})` : ""}. Check the user's Firestore permissions and Firebase project configuration.`,
    );
  }
  const adminRole = adminRecord.fields?.role?.stringValue;
  const adminStatus = adminRecord.fields?.status?.stringValue;
  if (!adminRole || adminStatus === "deactivated") {
    throw new BroadcastActionError(
      "You do not have permission to send client broadcasts.",
    );
  }

  if (adminRole !== "superadmin") {
    throw new BroadcastActionError(
      "Only superadmins can use client email broadcast.",
    );
  }

  return {
    uid: decodedToken.uid,
    email: tokenEmail,
    role: adminRole as UserRole,
  };
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

function createBroadcastMessage(subject: string, body: string) {
  const escapedSubject = escapeHtml(subject);
  const bodyParagraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, "<br />"))
    .map(
      (paragraph) =>
        `<p style="margin:0 0 18px;color:#334155;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;">${paragraph}</p>`,
    )
    .join("");
  const previewText = body.replace(/\s+/g, " ").trim().slice(0, 140);

  return {
    text: [
      "PHILIPPINE GENOME CENTER VISAYAS",
      "CLIENT ANNOUNCEMENT",
      "",
      subject,
      "",
      "Dear Client,",
      "",
      body,
      "",
      "Regards,",
      "Philippine Genome Center Visayas",
      "University of the Philippines Visayas",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapedSubject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="height:6px;background-color:#166fb5;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 36px 22px;border-bottom:1px solid #e2e8f0;">
                <p style="margin:0 0 5px;color:#166fb5;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.2px;line-height:1.4;">PHILIPPINE GENOME CENTER VISAYAS</p>
                <p style="margin:0;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">University of the Philippines Visayas</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 12px;">
                <p style="margin:0 0 10px;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;line-height:1.4;">CLIENT ANNOUNCEMENT</p>
                <h1 style="margin:0;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;line-height:1.3;">${escapedSubject}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 28px;">
                <p style="margin:0 0 18px;color:#334155;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;">Dear Client,</p>
                ${bodyParagraphs}
                <p style="margin:24px 0 0;color:#334155;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;">Regards,<br /><strong>Philippine Genome Center Visayas</strong><br />University of the Philippines Visayas</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">This announcement was sent by Philippine Genome Center Visayas regarding its services and operations.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (value && typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nestedValue]) => [
            key,
            toFirestoreValue(nestedValue),
          ]),
        ),
      },
    };
  }
  return { nullValue: null };
}

function firestoreDocument(
  projectId: string,
  collectionName: string,
  documentId: string,
  fields: Record<string, unknown>,
) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${collectionName}/${documentId}`,
      fields: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
          key,
          toFirestoreValue(value),
        ]),
      ),
    },
  };
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

    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new BroadcastActionError(
        "Firebase project ID is not configured on the server.",
      );
    }

    const broadcastId = randomUUID();
    stageState.value = "Firestore queue preparation";
    const writes = [
      firestoreDocument(projectId, "emailBroadcasts", broadcastId, {
        subject,
        recipientCount: recipientEmails.length,
        createdByUid: sender.uid,
        createdByEmail: sender.email,
        createdAt: new Date(),
      }),
    ];

    for (const email of recipientEmails) {
      const mailId = randomUUID();
      const eventId = randomUUID();
      const message = createBroadcastMessage(subject, body);

      writes.push(
        firestoreDocument(projectId, "mail", mailId, {
          to: [email],
          message: { subject, ...message },
          broadcastId,
        }),
      );
      writes.push(
        firestoreDocument(projectId, "emailMonitoringEvents", eventId, {
          category: "Client broadcast",
          recipient: email,
          sourceId: broadcastId,
          triggeredByUid: sender.uid,
          triggeredAt: new Date(),
          queueStatus: "queued",
          mailDocumentId: mailId,
        }),
      );
    }

    stageState.value = "Firestore queue commit";
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;
    const commitResponse = await fetch(commitUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ writes }),
      cache: "no-store",
    });
    if (!commitResponse.ok) {
      const responseBody = await commitResponse.json().catch(() => null);
      const firestoreCode =
        typeof responseBody?.error?.status === "string"
          ? responseBody.error.status
          : `HTTP ${commitResponse.status}`;
      const firestoreMessage =
        typeof responseBody?.error?.message === "string"
          ? responseBody.error.message
          : "Firestore rejected the write.";
      console.error("Firestore rejected client broadcast queue:", {
        code: firestoreCode,
        message: firestoreMessage,
      });
      throw new BroadcastActionError(
        `Firestore rejected the broadcast queue (${firestoreCode}): ${firestoreMessage}`,
      );
    }
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to queue client email broadcast:", {
      stage: stageState.value,
      errorCode,
      errorMessage,
    });
    return {
      success: false,
      error: `Could not queue the broadcast during ${stageState.value} (error ${errorCode}). Check server logs for details. No success was reported; check Sent Items before retrying.`,
    };
  }
}
