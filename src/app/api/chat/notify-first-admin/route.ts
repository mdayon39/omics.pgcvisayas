import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import { createChatMessageEmail } from "@/lib/chatEmail";
import {
  beginEmailMonitorEvent,
  markEmailMonitorFailed,
  markEmailMonitorQueued,
} from "@/services/emailMonitoringAdmin";

const CLIENT_INACTIVITY_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const CHAT_EMAIL_RESERVATION_TTL_MS = 5 * 60 * 1000;

function timestampToMillis(value: unknown): number | null {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }
  if (value instanceof Date) return value.getTime();
  return null;
}

export async function POST(request: Request) {
  let authenticatedAdmin = false;
  try {
    const body = await request.json();
    const threadId = String(body?.threadId || "").trim();
    const adminName = String(body?.adminName || "Admin").trim() || "Admin";

    if (!threadId) {
      return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
    }

    if (!adminDb) {
      throw new Error("Firebase Admin is unavailable for chat email delivery.");
    }

    const authorization = request.headers.get("authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(tokenMatch[1]);
    } catch {
      return NextResponse.json(
        { error: "Invalid authentication token" },
        { status: 401 },
      );
    }

    const adminEmail = decodedToken.email?.trim();
    if (!adminEmail) {
      return NextResponse.json(
        { error: "An authenticated admin account is required" },
        { status: 403 },
      );
    }

    const adminsCollection = adminDb.collection("admins");
    let adminSnap = await adminsCollection.doc(adminEmail).get();
    if (!adminSnap.exists) {
      adminSnap = await adminsCollection.doc(adminEmail.toLowerCase()).get();
    }
    if (!adminSnap.exists) {
      const adminsSnapshot = await adminsCollection.get();
      const matchingAdmin = adminsSnapshot.docs.find((adminDoc) => {
        const data = adminDoc.data();
        return (
          adminDoc.id.trim().toLowerCase() === adminEmail.toLowerCase() ||
          (typeof data.email === "string" &&
            data.email.trim().toLowerCase() === adminEmail.toLowerCase())
        );
      });
      if (matchingAdmin) adminSnap = matchingAdmin;
    }
    if (!adminSnap.exists || adminSnap.data()?.status === "deactivated") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }
    authenticatedAdmin = true;

    const threadRef = adminDb.collection("quotationThreads").doc(threadId);
    const [threadSnap, inquirySnap] = await Promise.all([
      threadRef.get(),
      adminDb.collection("inquiries").doc(threadId).get(),
    ]);
    if (!threadSnap.exists) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const threadData = threadSnap.data() ?? {};
    const inquiryData = inquirySnap.data() ?? {};
    const inquiryEmail =
      typeof inquiryData.email === "string" ? inquiryData.email.trim() : "";
    const threadEmail =
      typeof threadData.clientEmail === "string"
        ? threadData.clientEmail.trim()
        : "";
    const isValidEmail = (email: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const clientEmail = isValidEmail(inquiryEmail)
      ? inquiryEmail
      : isValidEmail(threadEmail)
        ? threadEmail
        : "";
    const clientName =
      (typeof inquiryData.name === "string" && inquiryData.name.trim()) ||
      (typeof threadData.clientName === "string" && threadData.clientName.trim()) ||
      "Client";
    if (!clientEmail) {
      return NextResponse.json(
        { error: "Client email not found" },
        { status: 400 },
      );
    }

    const presenceRef = adminDb
      .collection("presence")
      .doc(`client_${threadId}`.replace(/[.@#$/[\]]/g, "_"));
    const reservation = await adminDb.runTransaction(async (transaction) => {
      const [currentThreadSnap, presenceSnap] = await Promise.all([
        transaction.get(threadRef),
        transaction.get(presenceRef),
      ]);
      if (!currentThreadSnap.exists) {
        return { shouldSend: false, isFirstMessage: false };
      }

      const currentThread = currentThreadSnap.data() ?? {};
      const presenceData = presenceSnap.exists ? presenceSnap.data() : null;
      const lastSeen = timestampToMillis(presenceData?.lastSeen);
      const lastFollowUpSent = timestampToMillis(
        currentThread.adminReplyFollowUpEmailSentAt,
      );
      const firstEmailQueued =
        timestampToMillis(currentThread.firstAdminChatEmailQueuedAt) !== null;
      const isFirstMessage = !firstEmailQueued;
      const isInactive =
        lastSeen === null ||
        Date.now() - lastSeen >= CLIENT_INACTIVITY_THRESHOLD_MS;
      const followUpAlreadySent =
        lastFollowUpSent !== null &&
        (lastSeen === null || lastFollowUpSent >= lastSeen);
      const reservationAt = timestampToMillis(
        currentThread.chatEmailReservationAt,
      );
      const reservationIsActive =
        reservationAt !== null &&
        Date.now() - reservationAt < CHAT_EMAIL_RESERVATION_TTL_MS;
      const staleLegacyReservation =
        isFirstMessage && currentThread.firstAdminChatEmailSent === true;
      const shouldSend =
        (!reservationIsActive || staleLegacyReservation) &&
        (isFirstMessage || (isInactive && !followUpAlreadySent));

      const update: Record<string, unknown> = {
        adminTextMessageCount:
          (typeof currentThread.adminTextMessageCount === "number"
            ? currentThread.adminTextMessageCount
            : 0) + 1,
      };
      if (shouldSend) {
        update.chatEmailReservationAt =
          admin.firestore.FieldValue.serverTimestamp();
        if (staleLegacyReservation) {
          update.firstAdminChatEmailSent = false;
        }
      }
      transaction.update(threadRef, update);

      return { shouldSend, isFirstMessage };
    });

    if (!reservation.shouldSend) {
      return NextResponse.json({ ok: true, queued: false });
    }

    const monitorEventId = await beginEmailMonitorEvent(
      "Chat received",
      clientEmail,
      threadId,
    );
    try {
      const mailDocument = await adminDb.collection("mail").add({
        to: [clientEmail],
        inquiryId: threadId,
        message: createChatMessageEmail(clientName, adminName),
      });
      await markEmailMonitorQueued(monitorEventId, mailDocument.id);
      try {
        await threadRef.update({
          chatEmailReservationAt: admin.firestore.FieldValue.delete(),
          ...(reservation.isFirstMessage
            ? {
                firstAdminChatEmailSent: true,
                firstAdminChatEmailQueuedAt:
                  admin.firestore.FieldValue.serverTimestamp(),
              }
            : {
                adminReplyFollowUpEmailSentAt:
                  admin.firestore.FieldValue.serverTimestamp(),
              }),
        });
      } catch (stateError) {
        console.error(
          "Chat email was queued but its thread state could not be updated:",
          stateError,
        );
      }
      return NextResponse.json({
        ok: true,
        queued: true,
        recipient: clientEmail,
        mailDocumentId: mailDocument.id,
      });
    } catch (error) {
      await markEmailMonitorFailed(monitorEventId, error);
      try {
        await threadRef.update({
          chatEmailReservationAt: admin.firestore.FieldValue.delete(),
        });
      } catch (releaseError) {
        console.error(
          "Failed to release chat email reservation:",
          releaseError,
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Failed to send chat notification email:", error);
    return NextResponse.json(
      {
        error: "Failed to queue Chat Received email",
        ...(authenticatedAdmin
          ? {
              details:
                error instanceof Error ? error.message : String(error),
            }
          : {}),
      },
      { status: 500 },
    );
  }
}
