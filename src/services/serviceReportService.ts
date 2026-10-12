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
  adminNotificationRecipients?: string[];
  adminNotificationNames?: Record<string, string>;
  adminNotificationQueued?: boolean;
}

const subCollection = (pid: string) =>
  collection(db, "projects", pid, "serviceReports");

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
  const clientEmail = currentUser.email?.trim().toLowerCase() || "";
  const clientName = currentUser.displayName?.trim() || clientEmail || "Client";
  const receivedAt = Timestamp.now();

  const receiptResult = await runTransaction(db, async (transaction) => {
    const reportSnapshot = await transaction.get(reportRef);
    if (!reportSnapshot.exists()) {
      throw new Error("This service report could not be found.");
    }

    const report = reportSnapshot.data() as ServiceReport & {
      adminNotificationRecipients?: string[];
      adminNotificationNames?: Record<string, string>;
      projectTitle?: string;
    };
    if (report.clientAccessEnabled === false) {
      throw new Error("This service report is not available to the client.");
    }
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
      recipients:
        Array.isArray(report.adminNotificationRecipients) &&
        report.adminNotificationRecipients.length > 0
        ? [...new Set(report.adminNotificationRecipients.filter(Boolean))]
        : report.uploadedByEmail
          ? [report.uploadedByEmail]
          : [],
      reportName: report.fileName || "Service report",
      projectTitle: report.projectTitle || pid,
      effectiveReceivedAt:
        report.status === "received" && report.receivedAt
          ? report.receivedAt
          : receivedAt,
    };
  });

  if (!receiptResult.shouldNotify || receiptResult.recipients.length === 0) {
    return { adminEmailNotificationSent: false };
  }

  try {
    return await runTransaction(db, async (transaction) => {
      const reportSnapshot = await transaction.get(reportRef);
      if (!reportSnapshot.exists()) {
        throw new Error("This service report could not be found.");
      }

      const report = reportSnapshot.data() as ServiceReport & {
        adminNotificationRecipients?: string[];
        adminNotificationNames?: Record<string, string>;
        adminNotificationQueued?: boolean;
        receivedBy?: string;
        uploadedByEmail?: string | null;
      };
      if (
        report.status !== "received" ||
        report.receivedBy !== (clientEmail || currentUser.uid) ||
        report.adminNotificationQueued === true
      ) {
        return { adminEmailNotificationSent: false };
      }

      const receivedTime = receiptResult.effectiveReceivedAt
        .toDate()
        .toLocaleString("en-PH", { timeZone: "Asia/Manila" });
      const subject = `Client confirmed service report receipt: ${pid}`;
      transaction.update(reportRef, { adminNotificationQueued: true });

      const recipients =
        Array.isArray(report.adminNotificationRecipients) &&
        report.adminNotificationRecipients.length > 0
        ? [...new Set(report.adminNotificationRecipients.filter(Boolean))]
        : report.uploadedByEmail
          ? [report.uploadedByEmail]
          : [];

      for (const recipient of recipients) {
        const recipientName =
          report.adminNotificationNames?.[recipient] || "Admin";
        const mailRef = doc(collection(db, "mail"));
        transaction.set(mailRef, {
          to: [recipient],
          clientName: recipientName,
          recipientType: "admin",
          projectId: pid,
          serviceReportId: reportId,
          createdAt: receiptResult.effectiveReceivedAt,
          message: {
            subject,
            text: `Dear ${recipientName},

This is to inform you that ${clientName} has confirmed receipt of the service report.

Project: ${receiptResult.projectTitle} (${pid})
Service report: ${receiptResult.reportName}
Received by: ${clientName}${clientEmail ? ` (${clientEmail})` : ""}
Date and time: ${receivedTime} (Philippine time)

No further action is required unless follow-up is needed.

Regards,
Philippine Genome Center Visayas

This is an automated notification.`,
          },
        });
      }

      return { adminEmailNotificationSent: recipients.length > 0 };
    });
  } catch (error) {
    console.error(
      `Receipt saved for service report ${reportId}, but the admin email could not be queued:`,
      error,
    );
    return { adminEmailNotificationSent: false };
  }
}
