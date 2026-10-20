import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  beginEmailMonitorEvent,
  markEmailMonitorFailed,
  markEmailMonitorQueued,
} from "@/services/emailMonitoringAdmin";

const PORTAL_URL = "https://omics.pgcvisayas.upv.edu.ph/portal";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const threadId = String(body?.threadId || "").trim();
    const adminName = String(body?.adminName || "Admin").trim() || "Admin";
    const emailType = String(body?.emailType || "first-admin").trim();

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

    const threadData = threadSnap.data() as {
      clientEmail?: string;
      clientName?: string;
    };

    let clientEmail = threadData.clientEmail?.trim() || "";
    const clientName = threadData.clientName || "Client";
    if (!clientEmail) {
      const inquirySnap = await adminDb
        .collection("inquiries")
        .doc(threadId)
        .get();
      clientEmail = inquirySnap.data()?.email?.trim() || "";
    }

    const isFollowUp = emailType === "follow-up";
    const monitorEventId = await beginEmailMonitorEvent(
      "Chat received",
      clientEmail,
      threadId,
    );
    if (!clientEmail) {
      await markEmailMonitorFailed(
        monitorEventId,
        "No client email address was found for the chat thread.",
      );
      return NextResponse.json(
        { error: "Client email not found" },
        { status: 400 },
      );
    }

    const subject = isFollowUp
      ? "Chat Message Update: PGC Visayas"
      : "Chat Message Received: PGC Visayas";

    const emailText = `Dear ${clientName},

You have received ${isFollowUp ? "a follow-up" : "a new"} message from an Admin (${adminName}) in the chatbox. To view the message, please log in to your Client Portal:
${PORTAL_URL}

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas`;

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px;">
          <h2 style="margin-top: 0; color: #1e40af;">${subject}</h2>
          <p>Dear <strong>${clientName}</strong>,</p>
          <p>You have received ${isFollowUp ? "a follow-up" : "a new"} message from an Admin (${adminName}) in the chatbox. To view the message, please log in to your Client Portal.</p>
          <p style="margin: 16px 0;">
            <a href="${PORTAL_URL}" style="background-color: #1e40af; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Open Client Portal</a>
          </p>
          <p style="margin-top: 24px;">Yours in utilizing OMICS for a better Philippines,<br/>Philippine Genome Center Visayas</p>
        </div>
        <div style="margin-top: 12px; font-size: 12px; color: #94a3b8; text-align: center;">
          This is an automated message. Please do not reply directly to this email.
        </div>
      </div>
    `;

    try {
      const mailDocument = adminDb.collection("mail").doc();
      await adminDb.runTransaction(async (transaction) => {
        transaction.create(mailDocument, {
          to: [clientEmail],
          inquiryId: threadId,
          message: {
            subject,
            text: emailText,
            html: emailHtml,
          },
        });
        transaction.update(
          threadRef,
          isFollowUp
            ? { adminReplyFollowUpEmailSentAt: new Date() }
            : { firstAdminChatEmailSent: true },
        );
      });
      await markEmailMonitorQueued(monitorEventId, mailDocument.id);
    } catch (error) {
      await markEmailMonitorFailed(monitorEventId, error);
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to send chat notification email:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
}
