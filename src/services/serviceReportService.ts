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
  const clientName = currentUser.displayName?.trim() || clientEmail || "Client";
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
        (typeof projectSnapshot.data()?.title === "string" &&
        projectSnapshot.data()?.title.trim()
          ? projectSnapshot.data()?.title.trim()
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
          text: `Dear ${recipientName},

This is to inform you that ${clientName} has confirmed receipt of the service report.

Project ID: ${pid}
Project name: ${receiptResult.projectName}
Service report: ${receiptResult.reportName}
Received by: ${clientName}${clientEmail ? ` (${clientEmail})` : ""}
Date and time: ${receivedTime} (Philippine time)

No further action is required unless follow-up is needed.

Regards,
Philippine Genome Center Visayas

This is an automated notification.`,
          html: `<p>Dear ${escapeHtml(recipientName)},</p>
<p>This is to inform you that ${escapeHtml(clientName)} has confirmed receipt of the service report.</p>
<p>Project ID: ${escapeHtml(pid)}<br>
Project name: ${escapeHtml(receiptResult.projectName)}<br>
Service report: <a href="${safeReportUrl}" target="_blank" rel="noopener noreferrer">${safeReportName}</a><br>
Received by: ${escapeHtml(clientName)}${clientEmail ? ` (${escapeHtml(clientEmail)})` : ""}<br>
Date and time: ${escapeHtml(receivedTime)} (Philippine time)</p>
<p>No further action is required unless follow-up is needed.</p>
<p>Regards,<br>
Philippine Genome Center Visayas</p>
<p>This is an automated notification.</p>`,
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
