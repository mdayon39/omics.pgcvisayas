// Types for the Member Approval workflow
// Draft members are stored in `memberApprovals` collection until approved by an admin.

import { ClientFormData } from "@/schemas/clientSchema";

export interface DraftMember {
  tempId: string;
  cid?: string;
  isPrimary: boolean;
  isValidated: boolean;
  formData: {
    name: string;
    email: string;
    affiliation: string;
    designation: string;
    sex: "M" | "F" | "Other" | "";
    phoneNumber: string;
    affiliationAddress: string;
  };
}

export type ApprovalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface MemberApproval {
  id?: string; // Firestore doc ID (auto or composite)
  inquiryId: string;
  uuid?: string | null;
  projectPid: string;
  projectTitle: string;
  submittedBy: string; // Email of submitter
  submittedByName: string;
  submittedAt?: Date | string;
  status: ApprovalStatus;
  reviewedBy?: string; // Admin email
  reviewedByName?: string;
  reviewedAt?: Date | string;
  reviewNotes?: string;
  members: DraftMember[];
  createdAt: Date | string;
  updatedAt?: Date | string;
}
