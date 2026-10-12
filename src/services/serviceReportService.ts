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

  const idToken = await currentUser.getIdToken();
  const response = await fetch("/api/service-reports/received", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectId: pid, reportId }),
  });

  const responseData = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseData.error || "Failed to confirm receipt.");
  }
  return {
    adminEmailNotificationSent:
      responseData.adminEmailNotificationSent === true,
  };
}
