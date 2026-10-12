// src/types/ChargeSlipRecord.ts
import { Client } from "./Client";
import { Project } from "./Project";
import { AdminInfo } from "./Admin";
import { SelectedService } from "./SelectedService";
import { Timestamp } from "firebase/firestore";

/**
 * Allowed service categories in charge slips.
 */
export type ValidCategory =
  | "equipment"
  | "retail"
  | "bioinformatics"
  | "laboratory"
  | "training";

/**
 * Constant array of valid service categories (for UI/filtering/validation).
 */
export const VALID_CATEGORIES: ValidCategory[] = [
  "equipment",
  "retail",
  "bioinformatics",
  "laboratory",
  "training",
];

export interface ChargeSlipRecord {
  id?: string; // Firestore document ID

  chargeSlipNumber: string;
  referenceNumber: string;

  cid: string; // For filtering by client
  client: Client;

  projectId: string;
  project: Project;

  services: SelectedService[];
  useInternalPrice: boolean;
  useAffiliationAsClientName?: boolean; // Display affiliation instead of name in PDF

  preparedBy: AdminInfo;
  approvedBy: {
    name: string;
    position: string;
  };

  clientInfo: {
    name: string;
    institution: string;
    designation: string;
    email: string;
    address?: string; // Optional address field
  };
  uuid?: string | null;

  // Firestore-compatible timestamp fields
  dateIssued?: string | Timestamp | null;
  dateOfOR?: string | Timestamp | null;
  createdAt?: string | Timestamp | null;
  datePaid?: string | Timestamp | null;

  dvNumber?: string;
  orNumber?: string;
  notes?: string;

  subtotal: number;
  discount: number;
  total: number;

  categories?: ValidCategory[]; // Now restricted to valid enums only
  status?: string;
  statusChangedTo?: string;
  statusChangedByEmail?: string;
  statusChangedByName?: string;
  statusChangedAt?: Timestamp | null;
  /** Tracks the status of the client-uploaded Official Receipt: "Pending" until admin validates, "Validated" after. */
  orStatus?: "Pending" | "Validated" | null;
  showOfficialReceipts?: boolean; // Toggle visibility of uploaded official receipts
  /** Accumulated OR entries from partial payments, appended on each admin acknowledgment */
  orEntries?: Array<{
    orNumber: string;
    orDate: string;
    acknowledgedAt: Timestamp;
  }>;
  /** Timestamp when an admin manually confirmed the payment as validated */
  paidValidatedAt?: Timestamp | null;
  /** Email of the admin who confirmed payment */
  paidValidatedBy?: string | null;
  /** Display name of the admin who confirmed payment */
  paidValidatedByName?: string | null;
}
