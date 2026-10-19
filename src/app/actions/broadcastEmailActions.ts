"use server";

import admin from "firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase-admin";
import type { UserRole } from "@/types/Permissions";
import { hasAdminEmailOperationsAccess } from "@/constants/adminEmailAccess";

const MAX_FIRESTORE_COMMIT_WRITES = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class BroadcastActionError extends Error {}

type QueueBroadcastResult =
  | {
      success: true;
      broadcastId?: string;
      queuedCount: number;
      excludedOptOutCount: number;
    }
  | {
      success: false;
      error: string;
      queuedCount?: number;
      totalCount?: number;
      queuedRecipients?: string[];
      excludedOptOutCount?: number;
    };

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
): Promise<{
  uid: string;
  email: string;
  senderName?: string;
  role: UserRole;
}> {
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
      name?: { stringValue?: string };
      displayName?: { stringValue?: string };
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

  const isNamedEmailOperator = hasAdminEmailOperationsAccess(email);
  if (
    adminRole !== "superadmin" &&
    (!isNamedEmailOperator || adminRole !== "admin")
  ) {
    throw new BroadcastActionError(
      "You do not have permission to use client email broadcast.",
    );
  }

  return {
    uid: decodedToken.uid,
    email: tokenEmail,
    senderName:
      adminRecord.fields?.name?.stringValue?.trim() ||
      adminRecord.fields?.displayName?.stringValue?.trim() ||
      (typeof decodedToken.name === "string" ? decodedToken.name.trim() : "") ||
      undefined,
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
      subject,
      "",
      "Dear Client,",
      "",
      body,
      "",
      "----------------------------------------",
      "Yours in utilizing OMICS for a better Philippines,",
      "Philippine Genome Center Visayas",
      "",
      "If you no longer wish to receive email broadcasts from PGC Visayas, you may disable Receive Email Broadcasts under Settings in your client portal.",
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
              <td style="height:3px;background-color:#166fb5;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-bottom:1px solid #e2e8f0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                  <tr>
                    <td valign="middle" style="width:132px;padding-right:16px;">
                      <img src="https://omics.pgcvisayas.upv.edu.ph/assets/pgc-logo.png" width="120" alt="Philippine Genome Center Visayas logo" style="display:block;width:120px;max-width:100%;height:auto;border:0;" />
                    </td>
                    <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;">
                      <p style="margin:0 0 4px;color:#1769b0;font-size:14px;font-weight:700;letter-spacing:0.65px;line-height:1.3;">PHILIPPINE GENOME CENTER VISAYAS</p>
                      <p style="margin:0;color:#64748b;font-size:10px;letter-spacing:0.15px;line-height:1.4;">UNIVERSITY OF THE PHILIPPINES VISAYAS, MIAGAO, ILOILO</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 12px;">
                <h1 style="margin:0;color:#0f172a;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;line-height:1.3;">${escapedSubject}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 36px 28px;">
                <p style="margin:0 0 18px;color:#334155;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;">Dear Client,</p>
                ${bodyParagraphs}
                <div style="margin-top:24px;padding-top:16px;border-top:1px solid #dbe3ed;">
                  <p style="margin:0;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;">Yours in utilizing OMICS for a better Philippines,</p>
                  <p style="margin:0;color:#475569;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:1.5;">Philippine Genome Center Visayas</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 36px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">This announcement was sent by Philippine Genome Center Visayas regarding its services and operations.</p>
                <p style="margin:8px 0 0;color:#64748b;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;">If you no longer wish to receive email broadcasts from PGC Visayas, you may disable <strong>Receive Email Broadcasts</strong> under <strong>Settings</strong> in your client portal.</p>
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

type FirestoreWrite = ReturnType<typeof firestoreDocument>;

async function getOptedOutRecipientEmails(
  idToken: string,
  recipientEmails: string[],
): Promise<Set<string>> {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new BroadcastActionError(
      "Firebase project ID is not configured on the server.",
    );
  }

  const optedOutEmails = new Set<string>();
  const recipientEmailSet = new Set(recipientEmails);
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
  let response: Response;
  try {
    response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "emailBroadcastPreferences" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "broadcastEmailEnabled" },
              op: "EQUAL",
              value: { booleanValue: false },
            },
          },
          select: {
            fields: [{ fieldPath: "email" }],
          },
        },
      }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Could not read client email broadcast preferences:", {
      errorCode: getErrorCode(error) || "unknown",
      errorName:
        error && typeof error === "object" && "name" in error
          ? String(error.name)
          : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new BroadcastActionError(
      "Could not connect to Firestore to check client email preferences. Please try again.",
    );
  }

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    const firestoreCode =
      typeof responseBody?.error?.status === "string"
        ? responseBody.error.status
        : `HTTP ${response.status}`;
    const firestoreMessage =
      typeof responseBody?.error?.message === "string"
        ? responseBody.error.message
        : "Firestore rejected the preference query.";
    console.error("Firestore rejected broadcast preference lookup:", {
      code: firestoreCode,
      message: firestoreMessage,
    });
    throw new BroadcastActionError(
      `Could not check client email preferences (${firestoreCode}). Verify Firestore rules allow authorized broadcast admins to read opt-out preferences.`,
    );
  }

  const queryResults = (await response.json().catch((error: unknown) => {
    console.error("Could not parse Firestore broadcast preference results:", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new BroadcastActionError(
      "Firestore returned an invalid response while checking client email preferences.",
    );
  })) as unknown;
  if (!Array.isArray(queryResults)) {
    throw new BroadcastActionError(
      "Firestore returned an invalid response while checking client email preferences.",
    );
  }

  const preferences = queryResults as Array<{
    document?: {
      fields?: {
        email?: { stringValue?: string };
      };
    };
  }>;
  preferences.forEach((result) => {
    // runQuery can return metadata-only entries without a document.
    if (!result.document) return;

    const emailValue = result.document.fields?.email?.stringValue;
    if (typeof emailValue !== "string") {
      throw new BroadcastActionError(
        "Firestore returned an incomplete client email preference record. No broadcast was queued.",
      );
    }
    const email = normalizeEmail(emailValue);
    if (!email) {
      throw new BroadcastActionError(
        "Firestore returned an incomplete client email preference record. No broadcast was queued.",
      );
    }
    if (recipientEmailSet.has(email)) optedOutEmails.add(email);
  });
  return optedOutEmails;
}

export async function queueClientBroadcast(
  idToken: string,
  input: { recipientEmails: string[]; subject: string; body: string },
): Promise<QueueBroadcastResult> {
  const stageState = { value: "starting admin authorization" };
  let broadcastId: string | undefined;
  let totalCount = 0;
  let excludedOptOutCount = 0;
  const queuedRecipients: string[] = [];
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
    totalCount = recipientEmails.length;

    if (!subject || subject.length > 200) {
      throw new BroadcastActionError("Enter a subject of 1 to 200 characters.");
    }
    if (!body || body.length > 10_000) {
      throw new BroadcastActionError(
        "Enter a message of 1 to 10,000 characters.",
      );
    }
    if (recipientEmails.length === 0) {
      throw new BroadcastActionError(
        "Enter at least one email address.",
      );
    }
    if (recipientEmails.some((email) => !EMAIL_PATTERN.test(email))) {
      throw new BroadcastActionError(
        "Enter a valid email address for every recipient.",
      );
    }

    stageState.value = "checking recipient email preferences";
    const optedOutRecipientEmails =
      await getOptedOutRecipientEmails(idToken, recipientEmails);
    excludedOptOutCount = optedOutRecipientEmails.size;
    const eligibleRecipientEmails = recipientEmails.filter(
      (email) => !optedOutRecipientEmails.has(email),
    );
    if (eligibleRecipientEmails.length === 0) {
      return {
        success: true,
        queuedCount: 0,
        excludedOptOutCount,
      };
    }

    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new BroadcastActionError(
        "Firebase project ID is not configured on the server.",
      );
    }

    broadcastId = randomUUID();
    stageState.value = "Firestore queue preparation";
    const firstBatch: FirestoreWrite[] = [
      firestoreDocument(projectId, "emailBroadcasts", broadcastId, {
        subject,
        recipientCount: eligibleRecipientEmails.length,
        createdByUid: sender.uid,
        createdByEmail: sender.email,
        createdAt: new Date(),
      }),
    ];
    const writeBatches: Array<{
      writes: FirestoreWrite[];
      recipients: string[];
    }> = [];
    let currentBatch = { writes: firstBatch, recipients: [] as string[] };

    for (const email of eligibleRecipientEmails) {
      const mailId = randomUUID();
      const eventId = randomUUID();
      const message = createBroadcastMessage(subject, body);

      const recipientWrites = [
        firestoreDocument(projectId, "mail", mailId, {
          to: [email],
          senderEmail: sender.email,
          ...(sender.senderName ? { senderName: sender.senderName } : {}),
          message: { subject, ...message },
          broadcastId,
        }),
        firestoreDocument(projectId, "emailMonitoringEvents", eventId, {
          category: "Client broadcast",
          recipient: email,
          sourceId: broadcastId,
          triggeredByUid: sender.uid,
          triggeredByEmail: sender.email,
          triggeredAt: new Date(),
          queueStatus: "queued",
          mailDocumentId: mailId,
        }),
      ];
      if (
        currentBatch.writes.length + recipientWrites.length >
        MAX_FIRESTORE_COMMIT_WRITES
      ) {
        writeBatches.push(currentBatch);
        currentBatch = { writes: [], recipients: [] };
      }
      currentBatch.writes.push(...recipientWrites);
      currentBatch.recipients.push(email);
    }
    if (currentBatch.writes.length > 0) writeBatches.push(currentBatch);

    for (let batchIndex = 0; batchIndex < writeBatches.length; batchIndex++) {
      stageState.value = `Firestore queue commit ${batchIndex + 1} of ${writeBatches.length}`;
      const batchWrites = writeBatches[batchIndex].writes;
      const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;
      const commitResponse = await fetch(commitUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ writes: batchWrites }),
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
      queuedRecipients.push(...writeBatches[batchIndex].recipients);
    }
    return {
      success: true,
      broadcastId,
      queuedCount: queuedRecipients.length,
      excludedOptOutCount,
    };
  } catch (error) {
    const queuedCount = queuedRecipients.length;
    const partialQueueNotice =
      queuedCount > 0
        ? ` ${queuedCount} of ${totalCount} recipients were queued; check Email Monitoring before retrying.`
        : "";
    const optOutNotice =
      excludedOptOutCount > 0
        ? ` ${excludedOptOutCount} opted-out recipient${excludedOptOutCount === 1 ? " was" : "s were"} excluded.`
        : "";
    if (error instanceof BroadcastActionError) {
      return {
        success: false,
        error: `${error.message}${partialQueueNotice}${optOutNotice}`,
        ...(queuedCount > 0
          ? { queuedCount, totalCount, queuedRecipients }
          : {}),
        ...(excludedOptOutCount > 0 ? { excludedOptOutCount } : {}),
      };
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
      error: `Could not queue the broadcast during ${stageState.value} (error ${errorCode}).${partialQueueNotice || " Check server logs for details. No success was reported; check Sent Items before retrying."}${optOutNotice}`,
      ...(queuedCount > 0
        ? { queuedCount, totalCount, queuedRecipients }
        : {}),
      ...(excludedOptOutCount > 0 ? { excludedOptOutCount } : {}),
    };
  }
}
