import { NextRequest, NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const firestore = adminDb;
  if (!firestore) {
    return NextResponse.json(
      { error: "Service report notifications are unavailable." },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!idToken) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.warn("Service report receipt request had an invalid token:", error);
    return NextResponse.json({ error: "Authentication is invalid." }, { status: 401 });
  }

  let body: { projectId?: unknown; reportId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid request body is required." }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
  if (!projectId || !reportId) {
    return NextResponse.json(
      { error: "Project and service report identifiers are required." },
      { status: 400 },
    );
  }

  const projectRef = firestore.collection("projects").doc(projectId);
  const reportRef = projectRef.collection("serviceReports").doc(reportId);
  let failureStage = "loading project and service report";

  try {
    const [projectSnapshot, reportSnapshot] = await Promise.all([
      projectRef.get(),
      reportRef.get(),
    ]);
    if (!projectSnapshot.exists || !reportSnapshot.exists) {
      return NextResponse.json(
        { error: "The project or service report could not be found." },
        { status: 404 },
      );
    }

    const project = projectSnapshot.data() || {};
    const report = reportSnapshot.data() || {};
    const email = normalizeEmail(decodedToken.email);
    const projectOwnedByUser =
      project.uuid === decodedToken.uid ||
      (email !== "" && normalizeEmail(project.email) === email);

    let linkedInquiryOwnedByUser = false;
    const inquiryIds = Array.isArray(project.iid)
      ? project.iid
      : typeof project.iid === "string"
        ? [project.iid]
        : [];
    for (const inquiryId of inquiryIds) {
      if (typeof inquiryId !== "string" || !inquiryId) continue;
      const inquirySnapshot = await firestore.collection("inquiries").doc(inquiryId).get();
      const inquiry = inquirySnapshot.data();
      if (
        inquirySnapshot.exists &&
        (inquiry?.uuid === decodedToken.uid ||
          (email !== "" && normalizeEmail(inquiry?.email) === email))
      ) {
        linkedInquiryOwnedByUser = true;
        break;
      }
    }

    if (!projectOwnedByUser && !linkedInquiryOwnedByUser) {
      return NextResponse.json(
        { error: "You are not authorized to confirm receipt for this project." },
        { status: 403 },
      );
    }

    failureStage = "checking service report client access";
    if (report.clientAccessEnabled === false) {
      return NextResponse.json(
        { error: "This service report is not available to the client." },
        { status: 403 },
      );
    }

    failureStage = "loading active admin email recipients";
    const adminsSnapshot = await firestore.collection("admins").get();
    const recipients = new Map<string, string>();
    adminsSnapshot.docs.forEach((adminDoc) => {
      const adminData = adminDoc.data();
      const role = String(adminData.role || "")
        .toLowerCase()
        .replace(/[\s-]/g, "");
      const recipient = adminData.email || adminDoc.id;
      if (
        adminData.status !== "deactivated" &&
        (role === "admin" || role === "superadmin") &&
        isEmail(recipient)
      ) {
        const normalizedEmail = normalizeEmail(recipient);
        const fullName =
          typeof adminData.name === "string" ? adminData.name.trim() : "";
        const firstName = fullName.split(/\s+/)[0] || "Admin";
        recipients.set(normalizedEmail, firstName);
      }
    });

    if (recipients.size === 0) {
      console.error(`No admin email recipient found for service report ${reportId}.`);
      return NextResponse.json(
        { error: "No active admin email address is available for this service report." },
        { status: 409 },
      );
    }

    const receivedAt = admin.firestore.Timestamp.now();
    const clientName =
      typeof decodedToken.name === "string" && decodedToken.name.trim()
        ? decodedToken.name.trim()
        : email || "The client";
    const projectTitle =
      typeof project.title === "string" && project.title.trim()
        ? project.title.trim()
        : projectId;
    const reportName =
      typeof report.fileName === "string" && report.fileName.trim()
        ? report.fileName.trim()
        : "Service report";
    const receivedTime = receivedAt
      .toDate()
      .toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const subject = `Client confirmed service report receipt: ${projectId}`;
    const emailText = (firstName: string) => `Dear ${firstName},

This is to inform you that ${clientName} has confirmed receipt of the service report.

Project: ${projectTitle} (${projectId})
Service report: ${reportName}
Received by: ${clientName}${email ? ` (${email})` : ""}
Date and time: ${receivedTime} (Philippine time)

No further action is required unless follow-up is needed.

Regards,
Philippine Genome Center Visayas

This is an automated notification.`;

    failureStage = "saving receipt confirmation and admin email";
    const result = await firestore.runTransaction(async (transaction) => {
      const currentReportSnapshot = await transaction.get(reportRef);
      if (!currentReportSnapshot.exists) {
        throw new Error("The service report no longer exists.");
      }
      if (currentReportSnapshot.data()?.status === "received") {
        return { alreadyReceived: true };
      }

      transaction.update(reportRef, {
        status: "received",
        receivedAt,
        receivedBy: email || decodedToken.uid,
        receivedByName: clientName,
      });

      recipients.forEach((firstName, recipient) => {
        const mailRef = firestore.collection("mail").doc();
        transaction.create(mailRef, {
          to: [recipient],
          clientName: firstName,
          recipientType: "admin",
          createdAt: receivedAt,
          message: { subject, text: emailText(firstName) },
        });
      });

      return { alreadyReceived: false };
    });

    return NextResponse.json({
      success: true,
      alreadyReceived: result.alreadyReceived,
    });
  } catch (error) {
    console.error(
      `Failed to confirm service report receipt during ${failureStage}:`,
      error,
    );
    return NextResponse.json(
      {
        error: `Failed while ${failureStage}. Please try again or contact an administrator.`,
      },
      { status: 500 },
    );
  }
}
