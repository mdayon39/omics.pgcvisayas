/**
 * Quotation Thread Types
 *
 * Manages the communication and quotation lifecycle between admin and client
 */

import { Timestamp } from "firebase/firestore";

export type InquiryStatus =
  | "pending" // Initial state after submission
  | "under_review" // Admin is reviewing
  | "quoted" // First quotation sent
  | "negotiating" // Back-and-forth discussion
  | "approved" // Client approved final quotation
  | "rejected" // Client rejected or inquiry closed
  | "converted"; // Converted to project

export type QuotationStatus =
  | "draft" // Admin is working on it
  | "sent" // Sent to client for review
  | "revised" // Client requested changes
  | "approved" // Client approved this version
  | "rejected" // Client rejected this version
  | "superseded"; // Replaced by newer version

export type MessageSenderRole = "admin" | "client";

export type MessageType =
  | "text" // Regular text message
  | "quotation" // Quotation attachment
  | "revision_request" // Client requesting changes
  | "approval" // Client approval
  | "system" // System-generated message (small pill)
  | "auto_reply"; // Automated availability notice (styled banner)

export interface QuotationItem {
  id: string;
  serviceId?: string; // Link to service catalog
  serviceName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  category?: string; // Laboratory, Bioinformatics, etc.
  notes?: string;
}

export interface QuotationVersion {
  id?: string;
  version: number;
  inquiryId: string;
  quotationNumber: string; // e.g., "QUO-2026-001-V1"

  // Pricing details
  items: QuotationItem[];
  subtotal: number;
  discount?: number;
  discountPercentage?: number;
  tax?: number;
  taxPercentage?: number;
  totalAmount: number;

  // Metadata
  status: QuotationStatus;
  createdBy: string; // Admin email/ID
  createdByName: string;
  sentAt?: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string; // Client email/ID
  rejectedAt?: Timestamp;
  rejectionReason?: string;

  // Notes and terms
  notes?: string;
  termsAndConditions?: string;
  validUntil?: Timestamp;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ThreadMessage {
  id?: string;
  threadId: string; // Same as inquiryId

  // Message details
  type: MessageType;
  content: string;

  // Sender info
  senderId: string; // Email or user ID
  senderName: string;
  senderRole: MessageSenderRole;

  // Related data
  quotationVersion?: number; // If message relates to a quotation
  attachments?: {
    name: string;
    url: string;
    type: string;
  }[];

  // Metadata
  isRead: boolean;
  // Reactions: mapping from emoji string to array of userIds/emails who reacted
  reactions?: Record<string, string[]>;
  readAt?: Timestamp;
  readBy?: string;
  /** Admins who have viewed this message. Only populated for client-sent messages. */
  viewedBy?: { name: string; email: string }[];
  /** Soft-delete: set to true when sender unsends a message. Content is blanked. */
  unsent?: boolean;

  // Timestamps
  createdAt: Timestamp;
}

export interface QuotationThread {
  id: string; // Same as inquiryId for easy linking
  inquiryId: string;

  // Client info (from inquiry)
  clientEmail: string;
  clientName: string;
  clientAffiliation: string;

  // Current status
  status: InquiryStatus;
  currentQuotationVersion?: number;

  // Quotation references
  quotations: QuotationVersion[];

  // Communication
  lastMessageAt?: Timestamp;
  lastMessageBy?: string;
  lastMessageByName?: string;
  lastMessageByRole?: MessageSenderRole;
  unreadCount: {
    admin: number;
    client: number;
  };
  adminTextMessageCount?: number;
  /** Set to true once the one-time first-admin-message email has been sent. */
  firstAdminChatEmailSent?: boolean;

  // Visibility
  dismissedByAdmin?: boolean;

  // Assignment
  assignedTo?: string; // Admin email/ID
  assignedToName?: string;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface QuotationGenerationRequest {
  inquiryId: string;
  items: Omit<QuotationItem, "id" | "subtotal">[];
  discount?: number;
  discountPercentage?: number;
  tax?: number;
  taxPercentage?: number;
  notes?: string;
  termsAndConditions?: string;
  validityDays?: number; // Default 30 days
}
