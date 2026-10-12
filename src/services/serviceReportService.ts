import {
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  runTransaction,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export interface ServiceReport {
  id: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  uploadedAt: Timestamp | null;
  uploadedBy: string;
  uploadedByName: string;
  uploadedByEmail?: string | null;
  skipChargeSlipRequirement?: boolean;
  documentationRemark?: string | null;
  exceptionEnabled?: boolean;
  clientAccessEnabled?: boolean;
  projectId: string;
  status?: "pending" | "received";
  receivedAt?: Timestamp | null;
  receivedBy?: string;
  receivedByName?: string;
  projectTitle?: string;
  uploadedByFirstName?: string;
  adminNotificationQueued?: boolean;
}

const subCollection = (pid: string) =>
  collection(db, "projects", pid, "serviceReports");

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

export async function getServiceReportsByProjectId(
  pid: string,
): Promise<ServiceReport[]> {
  const snap = await getDocs(
    query(subCollection(pid), orderBy("uploadedAt", "desc")),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceReport);
}

export async function addServiceReport(
  pid: string,
  data: Omit<ServiceReport, "id" | "uploadedAt">,
): Promise<string> {
  const ref = await addDoc(subCollection(pid), {
    ...data,
    uploadedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteServiceReport(
  pid: string,
  reportId: string,
): Promise<void> {
  await deleteDoc(doc(db, "projects", pid, "serviceReports", reportId));
}

export async function markServiceReportReceived(
  pid: string,
  reportId: string,
): Promise<{ adminEmailNotificationSent: boolean }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Please sign in again to confirm receipt.");
  }

  const reportRef = doc(db, "projects", pid, "serviceReports", reportId);
  const projectRef = doc(db, "projects", pid);
  const clientEmail = currentUser.email?.trim().toLowerCase() || "";
  let clientName = currentUser.displayName?.trim() || clientEmail || "Client";
  if (clientEmail) {
    try {
      const clientSnapshot = await getDocs(
        query(
          collection(db, "clients"),
          where("email", "==", clientEmail),
        ),
      );
      const profileName = clientSnapshot.docs
        .map((clientDoc) => clientDoc.data().name)
        .find((name): name is string => typeof name === "string" && !!name.trim());
      if (profileName) clientName = profileName.trim();
    } catch (error) {
      console.error(
        `Could not load the full client name for service report ${reportId}:`,
        error,
      );
    }
  }
  const receivedAt = Timestamp.now();

  const receiptResult = await runTransaction(db, async (transaction) => {
    const [reportSnapshot, projectSnapshot] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(projectRef),
    ]);
    if (!reportSnapshot.exists()) {
      throw new Error("This service report could not be found.");
    }

    const report = reportSnapshot.data() as ServiceReport;
    if (report.clientAccessEnabled === false) {
      throw new Error("This service report is not available to the client.");
    }
    const uploader = report.uploadedByEmail || report.uploadedBy || "";
    const recipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(uploader)
      ? uploader
      : "";
    if (report.status !== "received") {
      transaction.update(reportRef, {
        status: "received",
        receivedAt,
        receivedBy: clientEmail || currentUser.uid,
        receivedByName: clientName,
        adminNotificationQueued: false,
      });
    }

    const projectData = projectSnapshot.data();
    return {
      shouldNotify:
        (report.receivedBy === (clientEmail || currentUser.uid) ||
          report.status !== "received") &&
        report.adminNotificationQueued !== true,
      recipient,
      recipientName: report.uploadedByFirstName || "Admin",
      reportName: report.fileName || "Service report",
      reportUrl: report.fileUrl,
      projectName:
        (typeof projectData?.title === "string" && projectData.title.trim()
          ? projectData.title.trim()
          : "") ||
        (report.projectTitle && report.projectTitle !== pid
          ? report.projectTitle
          : "Project name unavailable"),
      effectiveReceivedAt:
        report.status === "received" && report.receivedAt
          ? report.receivedAt
          : receivedAt,
    };
  });

  if (!receiptResult.shouldNotify || !receiptResult.recipient) {
    return { adminEmailNotificationSent: false };
  }

  try {
    return await runTransaction(db, async (transaction) => {
      const reportSnapshot = await transaction.get(reportRef);
      if (!reportSnapshot.exists()) {
        throw new Error("This service report could not be found.");
      }

      const report = reportSnapshot.data() as ServiceReport;
      if (
        report.status !== "received" ||
        report.receivedBy !== (clientEmail || currentUser.uid) ||
        report.adminNotificationQueued === true ||
        (report.uploadedByEmail || report.uploadedBy || "") !== receiptResult.recipient
      ) {
        return { adminEmailNotificationSent: false };
      }

      const receivedTime = receiptResult.effectiveReceivedAt
        .toDate()
        .toLocaleString("en-PH", { timeZone: "Asia/Manila" });
      const subject = `Client confirmed service report receipt: ${pid}`;
      transaction.update(reportRef, { adminNotificationQueued: true });

      const recipientName =
        report.uploadedByFirstName || receiptResult.recipientName;
      const safeReportUrl = escapeHtml(receiptResult.reportUrl);
      const safeReportName = escapeHtml(receiptResult.reportName);
      const safeProjectId = escapeHtml(pid);
      const safeProjectName = escapeHtml(receiptResult.projectName);
      const safeClientName = escapeHtml(clientName);
      const safeClientEmail = escapeHtml(clientEmail);
      const safeReceivedTime = escapeHtml(receivedTime);
      const textMessage = `Dear ${recipientName},

The client has confirmed receipt of the service report.

PROJECT
Project ID: ${pid}
Project name: ${receiptResult.projectName}

SERVICE REPORT
File: ${receiptResult.reportName}
Open report: ${receiptResult.reportUrl}

RECEIPT
Received by: ${clientName}${clientEmail ? ` (${clientEmail})` : ""}
Date and time: ${receivedTime} (Philippine time)

No further action is required unless follow-up is needed.

Regards,
Philippine Genome Center Visayas

Automated notification — please do not reply to this email.`;
      const htmlMessage = `<div style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;border-collapse:separate;">
    <tr>
      <td style="padding:24px 28px;background-color:#166fb5;border-radius:8px 8px 0 0;">
        <p style="margin:0 0 6px;color:#dbeafe;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Service report update</p>
        <h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.3;font-weight:600;">Receipt confirmed</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <p style="margin:0 0 14px;font-size:16px;line-height:1.5;">Dear ${escapeHtml(recipientName)},</p>
        <p style="margin:0 0 22px;color:#475569;font-size:14px;line-height:1.6;"><strong>${safeClientName}</strong> has confirmed receipt of the service report. The confirmation details are below.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f8fafc;border:1px solid #e2e8f0;">
          <tr>
            <td colspan="2" style="padding:13px 16px;border-bottom:1px solid #e2e8f0;color:#166fb5;font-size:12px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase;">Project</td>
          </tr>
          <tr>
            <td width="135" style="padding:11px 16px;color:#64748b;font-size:13px;vertical-align:top;">Project ID</td>
            <td style="padding:11px 16px;color:#1e293b;font-size:14px;font-weight:600;vertical-align:top;">${safeProjectId}</td>
          </tr>
          <tr>
            <td width="135" style="padding:11px 16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;vertical-align:top;">Project name</td>
            <td style="padding:11px 16px;border-top:1px solid #e2e8f0;color:#1e293b;font-size:14px;vertical-align:top;">${safeProjectName}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:13px 16px;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;color:#166fb5;font-size:12px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase;">Receipt</td>
          </tr>
          <tr>
            <td width="135" style="padding:11px 16px;color:#64748b;font-size:13px;vertical-align:top;">Received by</td>
            <td style="padding:11px 16px;color:#1e293b;font-size:14px;vertical-align:top;"><strong>${safeClientName}</strong>${clientEmail ? `<br><span style="color:#64748b;font-size:12px;">${safeClientEmail}</span>` : ""}</td>
          </tr>
          <tr>
            <td width="135" style="padding:11px 16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;vertical-align:top;">Date and time</td>
            <td style="padding:11px 16px;border-top:1px solid #e2e8f0;color:#1e293b;font-size:14px;vertical-align:top;">${safeReceivedTime}<br><span style="color:#64748b;font-size:12px;">Philippine time</span></td>
          </tr>
        </table>
        <div style="margin:22px 0;padding:16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
          <p style="margin:0 0 12px;color:#64748b;font-size:12px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase;">Service report</p>
          <p style="margin:0 0 16px;color:#1e293b;font-size:14px;line-height:1.5;word-break:break-word;">${safeReportName}</p>
          <a href="${safeReportUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:11px 18px;background-color:#166fb5;border-radius:4px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Open service report</a>
        </div>
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">No further action is required unless follow-up is needed.</p>
        <p style="margin:22px 0 0;color:#1e293b;font-size:14px;line-height:1.6;">Regards,<br><strong>Philippine Genome Center Visayas</strong></p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 8px 8px;color:#64748b;font-size:12px;line-height:1.5;">This is an automated notification. Please do not reply to this email.</td>
    </tr>
  </table>
</div>`;
      const mailRef = doc(collection(db, "mail"));
      transaction.set(mailRef, {
        to: [receiptResult.recipient],
        clientName,
        recipientName,
        recipientType: "admin",
        projectId: pid,
        serviceReportId: reportId,
        createdAt: receiptResult.effectiveReceivedAt,
        message: {
          subject,
          text: textMessage,
          html: htmlMessage,
        },
      });

      return { adminEmailNotificationSent: true };
    });
  } catch (error) {
    console.error(
      `Receipt saved for service report ${reportId}, but the admin email could not be queued:`,
      error,
    );
    return { adminEmailNotificationSent: false };
  }
}
