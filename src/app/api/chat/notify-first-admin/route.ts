import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import { createChatMessageEmail } from "@/lib/chatEmail";
import {
  beginEmailMonitorEvent,
  markEmailMonitorFailed,
  markEmailMonitorQueued,
} from "@/services/emailMonitoringAdmin";

export async function POST(request: Request) {
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

    const adminEmail = decodedToken.email?.trim().toLowerCase();
    if (!adminEmail) {
      return NextResponse.json(
        { error: "An authenticated admin account is required" },
        { status: 403 },
      );
    }

    const adminSnap = await adminDb.collection("admins").doc(adminEmail).get();
    if (!adminSnap.exists || adminSnap.data()?.status === "deactivated") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const threadRef = adminDb.collection("quotationThreads").doc(threadId);
    const threadSnap = await threadRef.get();
    if (!threadSnap.exists) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const threadData = threadSnap.data() ?? {};
    const inquirySnap = await adminDb
      .collection("inquiries")
      .doc(threadId)
      .get();
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
    const monitorEventId = await beginEmailMonitorEvent(
      "Chat received",
      clientEmail,
      threadId,
    );
    if (!clientEmail) {
      await markEmailMonitorFailed(
        monitorEventId,
        "No valid client email address was found on the inquiry or chat thread.",
      );
      return NextResponse.json(
        { error: "Client email not found" },
        { status: 400 },
      );
    }

    try {
      const mailDocument = await adminDb.collection("mail").add({
        to: [clientEmail],
        inquiryId: threadId,
        message: createChatMessageEmail(clientName, adminName),
      });
      await markEmailMonitorQueued(monitorEventId, mailDocument.id);
      return NextResponse.json({
        ok: true,
        queued: true,
        recipient: clientEmail,
        mailDocumentId: mailDocument.id,
      });
    } catch (error) {
      await markEmailMonitorFailed(monitorEventId, error);
      throw error;
    }
  } catch (error) {
    console.error("Failed to send chat notification email:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
}
