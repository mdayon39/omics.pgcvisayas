import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import { createQuotationAvailabilityEmail } from "@/lib/quotationEmail";

const PORTAL_URL = "https://omics.pgcvisayas.upv.edu.ph/portal";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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

export async function POST(request: Request) {
  try {
    if (!adminDb) {
      throw new Error("Firebase Admin is unavailable for notification delivery.");
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

    const adminEmail = normalizeEmail(decodedToken.email);
    if (!adminEmail) {
      return NextResponse.json(
        { error: "An authenticated admin account is required" },
        { status: 403 },
      );
    }

    const adminSnapshot = await adminDb.collection("admins").doc(adminEmail).get();
    const adminData = adminSnapshot.data();
    if (
      !adminSnapshot.exists ||
      adminData?.status === "deactivated" ||
      !["admin", "superadmin"].includes(String(adminData?.role || "").toLowerCase())
    ) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const body = await request.json();
    const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
    if (!eventId) {
      return NextResponse.json({ error: "Missing email event ID" }, { status: 400 });
    }

    const eventRef = adminDb.collection("emailMonitoringEvents").doc(eventId);
    const eventSnapshot = await eventRef.get();
    if (!eventSnapshot.exists) {
      return NextResponse.json({ error: "Email event not found" }, { status: 404 });
    }

    const event = eventSnapshot.data() ?? {};
    const category = event.category;
    const sourceId =
      typeof event.sourceId === "string" ? event.sourceId.trim() : "";
    if (
      (category !== "Chat received" && category !== "Quotation available") ||
      !sourceId
    ) {
      return NextResponse.json(
        { error: "Only chat and quotation notifications can be resent." },
        { status: 400 },
      );
    }

    let recipientEmail = "";
    let clientName = "Client";
    let inquiryId = "";
    let message: { subject: string; text: string; html: string };

    if (category === "Chat received") {
      inquiryId = sourceId;
      const [inquirySnapshot, threadSnapshot] = await Promise.all([
        adminDb.collection("inquiries").doc(sourceId).get(),
        adminDb.collection("quotationThreads").doc(sourceId).get(),
      ]);
      const inquiry = inquirySnapshot.data() ?? {};
      const thread = threadSnapshot.data() ?? {};
      const inquiryEmail = normalizeEmail(inquiry.email);
      const threadEmail = normalizeEmail(thread.clientEmail);
      recipientEmail = EMAIL_PATTERN.test(inquiryEmail)
        ? inquiryEmail
        : EMAIL_PATTERN.test(threadEmail)
          ? threadEmail
          : "";
      clientName =
        (typeof inquiry.name === "string" && inquiry.name.trim()) ||
        (typeof thread.clientName === "string" && thread.clientName.trim()) ||
        "Client";

      const subject = "Chat Message Update: PGC Visayas";
      const escapedName = escapeHtml(clientName);
      const text = `Dear ${clientName},

You have received a new message from an Admin in the chatbox. To view the message, please log in to your Client Portal:
${PORTAL_URL}

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas`;
      const html = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
  <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px;">
    <h2 style="margin-top: 0; color: #1e40af;">${subject}</h2>
    <p>Dear <strong>${escapedName}</strong>,</p>
    <p>You have received a new message from an Admin in the chatbox. To view the message, please log in to your Client Portal.</p>
    <p style="margin: 16px 0;"><a href="${PORTAL_URL}" style="background-color: #1e40af; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Open Client Portal</a></p>
    <p style="margin-top: 24px;">Yours in utilizing OMICS for a better Philippines,<br/>Philippine Genome Center Visayas</p>
  </div>
  <div style="margin-top: 12px; font-size: 12px; color: #94a3b8; text-align: center;">This is an automated message. Please do not reply directly to this email.</div>
</div>`;
      message = { subject, text, html };
    } else {
      const quotationSnapshot = await adminDb
        .collection("quotations")
        .doc(sourceId)
        .get();
      if (!quotationSnapshot.exists) {
        return NextResponse.json(
          { error: "Quotation record not found" },
          { status: 404 },
        );
      }
      const quotation = quotationSnapshot.data() ?? {};
      inquiryId =
        typeof quotation.inquiryId === "string" ? quotation.inquiryId : "";
      let inquiry: FirebaseFirestore.DocumentData | undefined;
      if (inquiryId) {
        const inquirySnapshot = await adminDb
          .collection("inquiries")
          .doc(inquiryId)
          .get();
        inquiry = inquirySnapshot.data();
      }

      const inquiryEmail = normalizeEmail(inquiry?.email);
      const quotationEmail = normalizeEmail(quotation.email);
      recipientEmail = EMAIL_PATTERN.test(inquiryEmail)
        ? inquiryEmail
        : EMAIL_PATTERN.test(quotationEmail)
          ? quotationEmail
          : "";
      clientName =
        (typeof quotation.name === "string" && quotation.name.trim()) ||
        (typeof inquiry?.name === "string" && inquiry.name.trim()) ||
        "Client";
      message = createQuotationAvailabilityEmail(clientName);
    }

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "No valid client email address is available for this notification." },
        { status: 400 },
      );
    }

    const resendEvent = await adminDb.collection("emailMonitoringEvents").add({
      category,
      recipient: recipientEmail,
      sourceId,
      triggeredAt: new Date(),
      triggeredByEmail: adminEmail,
      queueStatus: "queueing",
      resentFromEventId: eventId,
    });

    try {
      const mailDocument = await adminDb.collection("mail").add({
        to: [recipientEmail],
        ...(inquiryId ? { inquiryId } : {}),
        message,
      });
      await resendEvent.update({
        queueStatus: "queued",
        mailDocumentId: mailDocument.id,
      });
      return NextResponse.json({
        ok: true,
        recipient: recipientEmail,
        mailDocumentId: mailDocument.id,
      });
    } catch (error) {
      await resendEvent.update({
        queueStatus: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } catch (error) {
    console.error("Failed to resend client notification email:", error);
    return NextResponse.json(
      { error: "Failed to queue notification email" },
      { status: 500 },
    );
  }
}
