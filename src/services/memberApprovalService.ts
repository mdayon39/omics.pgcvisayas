// Service for managing member approval requests in Firestore.
// Draft members are stored here until approved, then moved to `clients` collection.

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  deleteDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  MemberApproval,
  DraftMember,
  ApprovalStatus,
} from "@/types/MemberApproval";
import { getNextCid } from "@/services/clientService";
import { resolveClientUuid } from "@/services/clientUuidService";

const COLLECTION = "memberApprovals";

/**
 * Composite document ID for a project's member approval request.
 */
function getDocId(inquiryId: string, projectPid: string): string {
  return `${inquiryId}_${projectPid}`;
}

/**
 * Save or update a draft/pending member approval request.
 */
export async function saveMemberApproval(
  data: Omit<MemberApproval, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const docId = getDocId(data.inquiryId, data.projectPid);
  const docRef = doc(db, COLLECTION, docId);
  const existing = await getDoc(docRef);
  const uuid = await resolveClientUuid(data.inquiryId, data.submittedBy);

  if (existing.exists()) {
    // Update
    await setDoc(
      docRef,
      {
        ...data,
        ...(uuid ? { uuid } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    // Create
    await setDoc(docRef, {
      ...data,
      ...(uuid ? { uuid } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return docId;
}

/**
 * Submit a member approval request for admin review.
 * Changes status from "draft" to "pending".
 */
export async function submitForApproval(
  inquiryId: string,
  projectPid: string,
  projectTitle: string,
  submittedBy: string,
  submittedByName: string,
  members: DraftMember[],
): Promise<string> {
  const docId = getDocId(inquiryId, projectPid);
  const docRef = doc(db, COLLECTION, docId);
  const uuid = await resolveClientUuid(inquiryId, submittedBy);

  await setDoc(
    docRef,
    {
      inquiryId,
      ...(uuid ? { uuid } : {}),
      projectPid,
      projectTitle,
      submittedBy,
      submittedByName,
      status: "pending" as ApprovalStatus,
      members,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return docId;
}

/**
 * Get a member approval request by inquiry and project.
 */
export async function getMemberApproval(
  inquiryId: string,
  projectPid: string,
): Promise<MemberApproval | null> {
  const docId = getDocId(inquiryId, projectPid);
  const docRef = doc(db, COLLECTION, docId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
    updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
    submittedAt: data.submittedAt?.toDate?.() || data.submittedAt,
    reviewedAt: data.reviewedAt?.toDate?.() || data.reviewedAt,
  } as MemberApproval;
}

/**
 * Get all member approval requests, optionally filtered by status.
 */
export async function getAllMemberApprovals(
  status?: ApprovalStatus,
): Promise<MemberApproval[]> {
  let q;
  if (status) {
    q = query(collection(db, COLLECTION), where("status", "==", status));
  } else {
    q = query(collection(db, COLLECTION));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      submittedAt: data.submittedAt?.toDate?.() || data.submittedAt,
      reviewedAt: data.reviewedAt?.toDate?.() || data.reviewedAt,
    } as MemberApproval;
  });
}

/**
 * Approve a member approval request.
 * Generates CIDs and creates client records in the `clients` collection.
 * Returns the generated CIDs.
 */
export async function approveMemberApproval(
  approvalId: string,
  reviewedBy: string,
  reviewedByName: string,
  reviewNotes?: string,
  cidDecisions?: Record<string, "update" | "new">,
): Promise<string[]> {
  const docRef = doc(db, COLLECTION, approvalId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) throw new Error("Approval request not found");

  const approval = snap.data() as MemberApproval;

  if (approval.status !== "pending") {
    throw new Error(`Cannot approve: status is "${approval.status}"`);
  }

  const year = new Date().getFullYear();
  const generatedCids: string[] = [];

  const isExistingCid = (cid?: string) =>
    !!cid && cid !== "draft" && cid !== "pending";

  async function findExistingClientCid(email?: string): Promise<string | null> {
    if (!email) return null;

    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;

    const clientsQ = query(
      collection(db, "clients"),
      where("email", "==", normalized),
    );
    const clientsSnap = await getDocs(clientsQ);

    let fallbackCid: string | null = null;

    for (const clientDoc of clientsSnap.docs) {
      const clientData = clientDoc.data() as {
        cid?: string;
        pid?: string | string[];
      };
      const pidList = Array.isArray(clientData.pid)
        ? clientData.pid
        : clientData.pid
          ? [clientData.pid]
          : [];

      const cid = clientData.cid || clientDoc.id;
      if (!fallbackCid && cid) {
        fallbackCid = cid;
      }

      if (pidList.includes(approval.projectPid) && cid) {
        return cid;
      }
    }

    return fallbackCid;
  }

  // Generate CIDs and create client records for each non-primary member
  for (const member of approval.members) {
    if (member.isPrimary) continue; // Primary member already in clients

    if (isExistingCid(member.cid)) {
      continue;
    }

    const normalizedEmail = member.formData?.email?.trim().toLowerCase() || "";
    const decision = normalizedEmail
      ? cidDecisions?.[normalizedEmail]
      : undefined;

    // Admin chose to always assign a new CID for this member
    if (decision === "new") {
      if (!member.formData?.email || !member.formData?.name) {
        console.warn(
          "Skipping member with incomplete data during approval",
          member,
        );
        continue;
      }
      const newCid = await getNextCid(year);
      generatedCids.push(newCid);
      const uuid = await resolveClientUuid(
        approval.inquiryId,
        member.formData.email,
      );
      await setDoc(doc(db, "clients", newCid), {
        cid: newCid,
        ...member.formData,
        pid: [approval.projectPid],
        inquiryId: approval.inquiryId,
        ...(uuid ? { uuid } : {}),
        isContactPerson: false,
        haveSubmitted: true,
        createdAt: serverTimestamp(),
        approvedAt: serverTimestamp(),
        approvedBy: reviewedBy,
      });
      if (member.formData.email) {
        try {
          const { approveClientRequest } = await import(
            "@/services/clientRequestService"
          );
          await approveClientRequest(
            approval.inquiryId,
            member.formData.email,
            newCid,
            reviewedBy,
          );
          console.log(
            `✅ New CID ${newCid} assigned to ${member.formData.email}`,
          );
        } catch (error) {
          console.warn(
            `Could not update clientRequest for ${member.formData.email}:`,
            error,
          );
        }
      }
      continue;
    }

    const existingCid = await findExistingClientCid(member.formData?.email);
    if (existingCid) {
      const uuid = await resolveClientUuid(
        approval.inquiryId,
        member.formData?.email,
      );
      // Admin chose to update (or default) — update existing client record with submitted data
      if (decision === "update" && member.formData?.name) {
        try {
          await updateDoc(doc(db, "clients", existingCid), {
            name: member.formData.name,
            affiliation: member.formData.affiliation || "",
            designation: member.formData.designation || "",
            sex: member.formData.sex || "",
            phoneNumber: member.formData.phoneNumber || "",
            affiliationAddress: member.formData.affiliationAddress || "",
            pid: arrayUnion(approval.projectPid),
            haveSubmitted: true,
            ...(uuid ? { uuid } : {}),
            updatedAt: serverTimestamp(),
          });
          console.log(
            `✅ Updated existing client record ${existingCid} for ${normalizedEmail}`,
          );
        } catch (error) {
          console.warn(
            `Could not update existing client record ${existingCid}:`,
            error,
          );
        }
      }
      if (member.formData?.email) {
        try {
          const { approveClientRequest } = await import(
            "@/services/clientRequestService"
          );
          await approveClientRequest(
            approval.inquiryId,
            member.formData.email,
            existingCid,
            reviewedBy,
          );
        } catch (error) {
          console.warn(
            `Could not update clientRequest for ${member.formData.email}:`,
            error,
          );
        }
      }
      continue;
    }

    if (!member.formData?.email || !member.formData?.name) {
      console.warn(
        "Skipping member with incomplete data during approval",
        member,
      );
      continue;
    }

    const newCid = await getNextCid(year);
    generatedCids.push(newCid);
    const uuid = await resolveClientUuid(
      approval.inquiryId,
      member.formData.email,
    );

    // Create client record
    await setDoc(doc(db, "clients", newCid), {
      cid: newCid,
      ...member.formData,
      pid: [approval.projectPid],
      inquiryId: approval.inquiryId,
      ...(uuid ? { uuid } : {}),
      isContactPerson: false,
      haveSubmitted: true,
      createdAt: serverTimestamp(),
      approvedAt: serverTimestamp(),
      approvedBy: reviewedBy,
    });

    // Mark the corresponding clientRequest as approved (if it exists)
    if (member.formData.email) {
      try {
        const { approveClientRequest } = await import(
          "@/services/clientRequestService"
        );
        await approveClientRequest(
          approval.inquiryId,
          member.formData.email,
          newCid,
          reviewedBy,
        );
        console.log(
          `✅ Marked clientRequest as approved for ${member.formData.email}`,
        );
      } catch (error) {
        console.warn(
          `Could not update clientRequest for ${member.formData.email}:`,
          error,
        );
        // Don't throw - the client record was created successfully
      }
    }
  }

  // Update approval status
  await setDoc(
    docRef,
    {
      status: "approved" as ApprovalStatus,
      reviewedBy,
      reviewedByName,
      reviewedAt: serverTimestamp(),
      reviewNotes: reviewNotes || "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // Update project status and clientNames array
  try {
    const projectRef = doc(db, "projects", approval.projectPid);
    const projectSnap = await getDoc(projectRef);

    if (projectSnap.exists()) {
      const projectData = projectSnap.data();
      const currentClientNames = projectData.clientNames || [];
      const newNames = approval.members
        .filter((m) => !m.isPrimary && m.formData.name)
        .map((m) => m.formData.name);

      const updatedClientNames = [...currentClientNames];
      newNames.forEach((name) => {
        if (!updatedClientNames.includes(name)) {
          updatedClientNames.push(name);
        }
      });

      const updateData: any = {
        clientNames: updatedClientNames,
        updatedAt: serverTimestamp(),
      };

      // Also update status to Ongoing if it was Pending
      if (projectData.status === "Pending") {
        updateData.status = "Ongoing";
        updateData.statusUpdatedAt = serverTimestamp();
        updateData.statusUpdatedBy = reviewedBy;
        updateData.statusUpdateReason = "Team members approved";
        console.log(
          `✅ Project ${approval.projectPid} status updated to Ongoing`,
        );
      }

      await setDoc(projectRef, updateData, { merge: true });
      console.log(`✅ Updated clientNames for project ${approval.projectPid}`);
    }

    // Update inquiry status to "Approved Client" if it's not already
    if (approval.inquiryId) {
      await updateDoc(doc(db, "inquiries", approval.inquiryId), {
        status: "Approved Client",
        isApproved: true,
        updatedAt: serverTimestamp(),
      });
      console.log(
        `✅ Inquiry ${approval.inquiryId} updated to Approved Client`,
      );
    }
  } catch (error) {
    console.error("Error updating project status:", error);
    // Don't throw - approval was successful, this is a secondary action
  }

  return generatedCids;
}

/**
 * Cancel a member approval request (previously reject).
 */
export async function rejectMemberApproval(
  approvalId: string,
  reviewedBy: string,
  reviewedByName: string,
  reviewNotes?: string,
): Promise<void> {
  const docRef = doc(db, COLLECTION, approvalId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) throw new Error("Approval request not found");

  await setDoc(
    docRef,
    {
      status: "cancelled" as ApprovalStatus,
      reviewedBy,
      reviewedByName,
      reviewedAt: serverTimestamp(),
      reviewNotes: reviewNotes || "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Real-time listener for pending approval count.
 * Used for admin notification badge.
 */
export function onPendingApprovalsCount(
  callback: (count: number) => void,
): () => void {
  const q = query(collection(db, COLLECTION), where("status", "==", "pending"));

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.size);
  });
}

/**
 * Real-time listener for all pending approvals.
 */
export function onPendingApprovals(
  callback: (approvals: MemberApproval[]) => void,
): () => void {
  const q = query(collection(db, COLLECTION), where("status", "==", "pending"));

  return onSnapshot(q, (snapshot) => {
    const approvals = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        submittedAt: data.submittedAt?.toDate?.() || data.submittedAt,
        reviewedAt: data.reviewedAt?.toDate?.() || data.reviewedAt,
      } as MemberApproval;
    });
    callback(approvals);
  });
}
