"use client";

// Admin Member Approvals Page
// Allows admins to review, approve, or reject team member submissions from clients.
// Also handles project + member approval requests from the new draft workflow.

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAllMemberApprovals,
  approveMemberApproval,
  rejectMemberApproval,
} from "@/services/memberApprovalService";
import { getProjectRequestsByStatus } from "@/services/projectRequestService";
import {
  getClientRequestsByInquiry,
  ClientRequest,
} from "@/services/clientRequestService";
import { sendProjectApprovalEmail } from "@/app/actions/inquiryActions";
import { ApprovalStatus } from "@/types/MemberApproval";
import useAuth from "@/hooks/useAuth";
import { toast } from "sonner";
import { collection, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { resolveClientUuid } from "@/services/clientUuidService";
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  ShieldCheck,
  AlertCircle,
  Loader2,
  FolderOpen,
  User,
  Mail,
  Building2,
  Phone,
  Briefcase,
  MapPin,
  Filter,
  FileText,
  Calendar,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FilterStatus = "all" | ApprovalStatus;

// Combined approval type for both member approvals and project requests
interface CombinedApproval {
  id: string;
  type: "member" | "project";
  inquiryId: string;
  projectTitle: string;
  projectPid?: string;
  submittedBy: string;
  submittedByName?: string;
  status: ApprovalStatus;
  submittedAt?: any;
  reviewedAt?: any;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewNotes?: string;
  members?: any[];
  // Project-specific fields
  projectData?: {
    title: string;
    projectLead: string;
    startDate: any;
    sendingInstitution: string;
    fundingInstitution: string;
  };
  clientRequests?: ClientRequest[];
}

export default function MemberApprovalsPage() {
  const { user, adminInfo } = useAuth();
  const [approvals, setApprovals] = useState<CombinedApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApproval, setSelectedApproval] =
    useState<CombinedApproval | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "title" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Email → existing Firestore client data (populated when review dialog opens)
  const [existingClientsByEmail, setExistingClientsByEmail] = useState<
    Record<
      string,
      {
        cid: string;
        name: string;
        affiliation: string;
        phoneNumber: string;
        affiliationAddress: string;
      }
    >
  >({});
  // Email → admin decision: 'update' existing CID or assign 'new' CID
  const [memberCidDecisions, setMemberCidDecisions] = useState<
    Record<string, "update" | "new">
  >({});

  const normalizeEmail = (value?: string) => value?.trim().toLowerCase() || "";

  // Fetch existing client records from Firestore for a list of emails
  const fetchExistingClientsByEmails = useCallback(
    async (emails: string[]) => {
      const unique = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
      if (unique.length === 0) return {};
      const result: Record<
        string,
        {
          cid: string;
          name: string;
          affiliation: string;
          phoneNumber: string;
          affiliationAddress: string;
        }
      > = {};
      // Firestore 'in' supports up to 30 values
      const chunks: string[][] = [];
      for (let i = 0; i < unique.length; i += 30)
        chunks.push(unique.slice(i, i + 30));
      for (const chunk of chunks) {
        const snap = await getDocs(
          query(collection(db, "clients"), where("email", "in", chunk)),
        );
        snap.forEach((d) => {
          const data = d.data() as any;
          const email = normalizeEmail(data.email);
          if (email && !result[email]) {
            result[email] = {
              cid: data.cid || d.id,
              name: data.name || "",
              affiliation: data.affiliation || "",
              phoneNumber: data.phoneNumber || "",
              affiliationAddress: data.affiliationAddress || "",
            };
          }
        });
      }
      return result;
    },
    [normalizeEmail],
  );

  const getExistingProjectMemberEmails = useCallback(
    async (projectPid?: string) => {
      if (!projectPid) return new Set<string>();

      const clientsQ = query(
        collection(db, "clients"),
        where("pid", "array-contains", projectPid),
      );
      const clientsSnap = await getDocs(clientsQ);

      const emails = new Set<string>();
      clientsSnap.forEach((docSnap) => {
        const email = normalizeEmail(
          (docSnap.data() as { email?: string }).email,
        );
        if (email) emails.add(email);
      });

      return emails;
    },
    [],
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredApprovals = normalizedSearchQuery
    ? approvals.filter((approval) => {
        const memberFields = (approval.members || []).flatMap((member: any) => [
          member?.formData?.name,
          member?.formData?.email,
          member?.formData?.affiliation,
          member?.formData?.designation,
          member?.formData?.phoneNumber,
          member?.formData?.affiliationAddress,
        ]);

        const clientRequestFields = (approval.clientRequests || []).flatMap(
          (request) => [
            request?.name,
            request?.email,
            request?.affiliation,
            request?.designation,
            request?.phoneNumber,
            request?.affiliationAddress,
          ],
        );

        const combinedText = [
          approval.type,
          approval.status,
          approval.id,
          approval.inquiryId,
          approval.projectTitle,
          approval.projectPid,
          approval.submittedBy,
          approval.submittedByName,
          approval.reviewedBy,
          approval.reviewedByName,
          approval.reviewNotes,
          approval.projectData?.title,
          approval.projectData?.projectLead,
          approval.projectData?.sendingInstitution,
          approval.projectData?.fundingInstitution,
          ...memberFields,
          ...clientRequestFields,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return combinedText.includes(normalizedSearchQuery);
      })
    : approvals;

  const statusOrder: Record<string, number> = {
    pending: 0,
    draft: 1,
    approved: 2,
    cancelled: 3,
    rejected: 3,
  };
  const sortedApprovals = [...filteredApprovals].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "date") {
      const aTime = a.submittedAt
        ? (typeof a.submittedAt.toDate === "function"
            ? a.submittedAt.toDate()
            : new Date(a.submittedAt)
          ).getTime()
        : 0;
      const bTime = b.submittedAt
        ? (typeof b.submittedAt.toDate === "function"
            ? b.submittedAt.toDate()
            : new Date(b.submittedAt)
          ).getTime()
        : 0;
      cmp = aTime - bTime;
    } else if (sortBy === "title") {
      cmp = (a.projectTitle || "").localeCompare(b.projectTitle || "");
    } else if (sortBy === "status") {
      cmp = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch traditional member approvals
      const memberApprovals = await getAllMemberApprovals(
        filterStatus === "all" ? undefined : filterStatus,
      );

      // Fetch project requests filtered by status
      const projectRequests = await getProjectRequestsByStatus(
        filterStatus === "all" ? "all" : filterStatus,
      );
      console.log("Fetched project requests:", projectRequests);

      // For each project request, fetch associated client requests
      const projectApprovalsPromises = projectRequests.map(async (pr) => {
        try {
          // Map UI filter 'cancelled' to clientRequests 'rejected' status
          const clientStatus =
            filterStatus === "all"
              ? undefined
              : filterStatus === "cancelled"
                ? "cancelled"
                : (filterStatus as any);
          // Get client requests matching the project request status (or all if filtering for all)
          const clientRequests = await getClientRequestsByInquiry(
            pr.inquiryId,
            clientStatus,
          );

          return {
            id: pr.id || pr.inquiryId,
            type: "project" as const,
            inquiryId: pr.inquiryId,
            projectTitle: pr.title,
            projectPid: pr.pid || "DRAFT",
            submittedBy: pr.requestedBy,
            submittedByName: pr.requestedByName,
            status: pr.status as ApprovalStatus,
            submittedAt: pr.submittedAt,
            reviewedAt: pr.reviewedAt,
            reviewedBy: pr.reviewedBy,
            reviewNotes: pr.rejectionReason,
            projectData: {
              title: pr.title,
              projectLead: pr.projectLead,
              startDate: pr.startDate,
              sendingInstitution: pr.sendingInstitution,
              fundingInstitution: pr.fundingInstitution,
            },
            clientRequests: clientRequests,
            members: clientRequests.map((cr) => ({
              tempId: cr.id,
              isPrimary: cr.isPrimary,
              isValidated: cr.isValidated,
              formData: {
                name: cr.name,
                email: cr.email,
                affiliation: cr.affiliation,
                designation: cr.designation,
                sex: cr.sex,
                phoneNumber: cr.phoneNumber,
                affiliationAddress: cr.affiliationAddress,
              },
            })),
          };
        } catch (error) {
          console.error(
            `Error fetching client requests for ${pr.inquiryId}:`,
            error,
          );
          // Return a basic approval without client requests if there's an error
          return {
            id: pr.id || pr.inquiryId,
            type: "project" as const,
            inquiryId: pr.inquiryId,
            projectTitle: pr.title,
            projectPid: pr.pid || "DRAFT",
            submittedBy: pr.requestedBy,
            submittedByName: pr.requestedByName,
            status: pr.status as ApprovalStatus,
            submittedAt: pr.submittedAt,
            reviewedAt: pr.reviewedAt,
            reviewedBy: pr.reviewedBy,
            reviewNotes: pr.rejectionReason,
            projectData: {
              title: pr.title,
              projectLead: pr.projectLead,
              startDate: pr.startDate,
              sendingInstitution: pr.sendingInstitution,
              fundingInstitution: pr.fundingInstitution,
            },
            clientRequests: [],
            members: [],
          };
        }
      });

      const projectApprovals = await Promise.all(projectApprovalsPromises);
      console.log("Combined project approvals:", projectApprovals);

      console.log("Fetched approvals:", {
        projectRequests: projectRequests.length,
        projectApprovals: projectApprovals.length,
        memberApprovals: memberApprovals.length,
      });

      // Convert member approvals to combined format
      const memberApprovalsCombined: CombinedApproval[] = memberApprovals.map(
        (ma) => ({
          id: ma.id!,
          type: "member" as const,
          inquiryId: ma.inquiryId,
          projectTitle: ma.projectTitle,
          projectPid: ma.projectPid,
          submittedBy: ma.submittedBy,
          submittedByName: ma.submittedByName,
          status: ma.status,
          submittedAt: ma.submittedAt,
          reviewedAt: ma.reviewedAt,
          reviewedBy: ma.reviewedBy,
          reviewedByName: ma.reviewedByName,
          reviewNotes: ma.reviewNotes,
          members: ma.members,
        }),
      );

      // Combine both types
      const combined = [...projectApprovals, ...memberApprovalsCombined];
      console.log("Total combined approvals:", combined.length, combined);

      // Sort by submittedAt descending
      combined.sort((a, b) => {
        const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bTime - aTime;
      });

      console.log("Setting approvals:", {
        total: combined.length,
        byType: {
          project: combined.filter((a) => a.type === "project").length,
          member: combined.filter((a) => a.type === "member").length,
        },
      });

      setApprovals(combined);
    } catch (error) {
      console.error("Failed to fetch approvals:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to load approval requests: ${errorMessage}`);
      setApprovals([]); // Clear approvals on error
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleApprove = async () => {
    if (!selectedApproval?.id) return;
    setProcessing(true);

    try {
      if (selectedApproval.type === "member") {
        // Traditional member approval — pass admin's per-member CID decisions
        const generatedCids = await approveMemberApproval(
          selectedApproval.id,
          user?.email || "",
          adminInfo?.name || user?.displayName || "",
          reviewNotes,
          memberCidDecisions,
        );
        toast.success(
          `Approved! ${generatedCids.length} client ID(s) generated: ${generatedCids.join(", ")}`,
        );
      } else if (selectedApproval.type === "project") {
        // New project + members approval
        await approveProjectRequest(selectedApproval);
      }

      // Close dialog and reset state first
      setShowReviewDialog(false);
      setSelectedApproval(null);
      setReviewNotes("");

      // Then refresh the list
      await fetchApprovals();
    } catch (error) {
      console.error("Approve error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to approve: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  // Open review dialog and ensure we have up-to-date clientRequests/members
  const handleOpenReview = async (approval: CombinedApproval) => {
    try {
      if (approval.type === "member") {
        const existingEmails = await getExistingProjectMemberEmails(
          approval.projectPid,
        );

        const additionalMembers = (approval.members || []).filter(
          (member: any) => {
            if (member.isPrimary) return false;

            const cid = String(member.cid || "").trim();
            if (cid && cid !== "draft" && cid !== "pending") return false;

            const memberEmail = normalizeEmail(member.formData?.email);
            return memberEmail ? !existingEmails.has(memberEmail) : true;
          },
        );

        // Fetch existing client data for all member emails
        const memberEmails = additionalMembers
          .map((m: any) => m.formData?.email)
          .filter(Boolean);
        const existingData = await fetchExistingClientsByEmails(memberEmails);
        setExistingClientsByEmail(existingData);
        // Default decision for each matched email: 'update'
        const defaults: Record<string, "update" | "new"> = {};
        Object.keys(existingData).forEach((email) => {
          defaults[email] = "update";
        });
        setMemberCidDecisions(defaults);

        setSelectedApproval({
          ...approval,
          members: additionalMembers,
          clientRequests: [],
        });
        setReviewNotes(approval.reviewNotes || "");
        setShowReviewDialog(true);
        return;
      }

      // For cancelled submissions, members are now reset to "draft" (so client can re-edit).
      // Fetch all members regardless of status so admin can still review them.
      const clientStatus = undefined;
      const clientRequests = await getClientRequestsByInquiry(
        approval.inquiryId,
        clientStatus as any,
      );

      // Map clientRequests into members array for display
      const members = clientRequests.map((cr) => ({
        tempId: cr.id,
        isPrimary: cr.isPrimary,
        isValidated: cr.isValidated,
        formData: {
          name: cr.name,
          email: cr.email,
          affiliation: cr.affiliation,
          designation: cr.designation,
          sex: cr.sex,
          phoneNumber: cr.phoneNumber,
          affiliationAddress: cr.affiliationAddress,
        },
      }));

      // Fetch existing client data for project-type members too
      const projectMemberEmails = clientRequests
        .map((cr) => cr.email)
        .filter(Boolean);
      const existingProjectData =
        await fetchExistingClientsByEmails(projectMemberEmails);
      setExistingClientsByEmail(existingProjectData);
      const projectDefaults: Record<string, "update" | "new"> = {};
      Object.keys(existingProjectData).forEach((email) => {
        projectDefaults[email] = "update";
      });
      setMemberCidDecisions(projectDefaults);

      setSelectedApproval({ ...approval, clientRequests, members });
      setReviewNotes(approval.reviewNotes || "");
      setShowReviewDialog(true);
    } catch (error) {
      console.error("Failed to load client requests for review:", error);
      toast.error("Failed to load member details for this submission");
    }
  };

  const approveProjectRequest = async (approval: CombinedApproval) => {
    if (!approval.projectData || !approval.clientRequests) {
      throw new Error("Missing project data or client requests");
    }

    if (!approval.clientRequests || approval.clientRequests.length === 0) {
      throw new Error("No members found for approval");
    }

    // Import required services
    const { getNextPid } = await import("@/services/projectsService");
    const { getNextCid } = await import("@/services/clientService");
    const { updateProjectRequestStatus } = await import(
      "@/services/projectRequestService"
    );
    const { approveClientRequest, approveAllClientRequestsByInquiry } =
      await import("@/services/clientRequestService");
    const { doc, setDoc, updateDoc, serverTimestamp, Timestamp } = await import(
      "firebase/firestore"
    );
    const { db } = await import("@/lib/firebase");

    const year = new Date().getFullYear();

    // Generate PID
    const pid = await getNextPid(year);

    // Convert startDate to proper Timestamp
    let startDate = approval.projectData.startDate;
    if (startDate && typeof startDate.toDate === "function") {
      startDate = Timestamp.fromDate(startDate.toDate());
    }

    // Generate CIDs for all members
    const memberCids: { email: string; cid: string; isPrimary: boolean }[] = [];
    for (const clientReq of approval.clientRequests) {
      if (!clientReq.email || !clientReq.name) {
        throw new Error(`Invalid member data: missing email or name`);
      }

      const normalizedReqEmail = clientReq.email.trim().toLowerCase();
      const existingClient = existingClientsByEmail[normalizedReqEmail];
      const decision = memberCidDecisions[normalizedReqEmail];
      const clientUuid = await resolveClientUuid(
        approval.inquiryId,
        clientReq.email,
      );

      let cid: string;
      if (existingClient && decision !== "new") {
        // Reuse existing CID
        cid = existingClient.cid;
        // Update existing client record with submitted data
        const {
          doc: firestoreDoc,
          updateDoc: firestoreUpdateDoc,
          serverTimestamp: firestoreTimestamp,
          arrayUnion,
        } = await import("firebase/firestore");
        await firestoreUpdateDoc(firestoreDoc(db, "clients", cid), {
          name: clientReq.name,
          affiliation: clientReq.affiliation || "",
          designation: clientReq.designation || "",
          sex: clientReq.sex || "",
          phoneNumber: clientReq.phoneNumber || "",
          affiliationAddress: clientReq.affiliationAddress || "",
          pid: arrayUnion(pid),
          haveSubmitted: true,
          ...(clientUuid ? { uuid: clientUuid } : {}),
          updatedAt: firestoreTimestamp(),
        });
      } else {
        // Generate a fresh CID
        cid = await getNextCid(year);
        // Create client document
        await setDoc(doc(db, "clients", cid), {
          cid,
          pid: [pid],
          inquiryId: approval.inquiryId,
          ...(clientUuid ? { uuid: clientUuid } : {}),
          name: clientReq.name || "",
          email: clientReq.email || "",
          affiliation: clientReq.affiliation || "",
          designation: clientReq.designation || "",
          sex: clientReq.sex || "",
          phoneNumber: clientReq.phoneNumber || "",
          affiliationAddress: clientReq.affiliationAddress || "",
          isContactPerson: clientReq.isPrimary || false,
          haveSubmitted: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      memberCids.push({
        email: clientReq.email,
        cid,
        isPrimary: clientReq.isPrimary || false,
      });

      // Update clientRequest status
      await approveClientRequest(
        approval.inquiryId,
        clientReq.email,
        cid,
        user?.email || "",
      );
    }

    // Resolve project ownership uuid from linked inquiry.
    let projectUuid: string | null = null;
    if (approval.inquiryId) {
      try {
        const inquirySnap = await getDoc(
          doc(db, "inquiries", approval.inquiryId),
        );
        if (inquirySnap.exists()) {
          const inquiryData = inquirySnap.data() as { uuid?: string | null };
          if (
            typeof inquiryData?.uuid === "string" &&
            inquiryData.uuid.trim()
          ) {
            projectUuid = inquiryData.uuid;
          }
        }
      } catch (uuidError) {
        console.error("Error resolving project uuid from inquiry:", uuidError);
      }
    }

    // Create project document
    const clientNames = approval.clientRequests.map(
      (cr) => cr.name || "Unknown",
    );
    await setDoc(doc(db, "projects", pid), {
      pid,
      iid: approval.inquiryId,
      uuid: projectUuid,
      title: approval.projectData.title || "",
      projectLead: approval.projectData.projectLead || "",
      startDate: startDate,
      sendingInstitution: approval.projectData.sendingInstitution || "",
      fundingInstitution: approval.projectData.fundingInstitution || "",
      clientNames,
      status: "Ongoing",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update project request status
    const primaryCid = memberCids.find((m) => m.isPrimary)?.cid;
    await updateProjectRequestStatus(
      approval.inquiryId,
      "approved",
      user?.email || "",
      pid,
      primaryCid,
    );

    // Update inquiry status to "Approved Client"
    try {
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
    } catch (inquiryError) {
      console.error("Error updating inquiry status:", inquiryError);
      // Non-critical error, don't throw
    }

    // Ensure all pending clientRequests for this inquiry are approved
    try {
      if (approval.inquiryId) {
        await approveAllClientRequestsByInquiry(
          approval.inquiryId,
          user?.email || "",
        );
        console.log(
          `✅ clientRequests for inquiry ${approval.inquiryId} updated to approved`,
        );
      }
    } catch (clientReqError) {
      console.error("Error updating clientRequests status:", clientReqError);
      // Non-critical error, don't throw
    }

    // Send approval email to the primary member (project submitter)
    try {
      const { sendProjectApprovalEmail } = await import(
        "@/app/actions/inquiryActions"
      );
      await sendProjectApprovalEmail(
        approval.submittedBy,
        approval.submittedByName || approval.submittedBy,
        approval.projectTitle,
        pid,
        approval.inquiryId,
      );
      console.log("✅ Approval email sent to", approval.submittedBy);
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError);
      // Non-critical — approval itself succeeded; don't block the flow
    }

    // Success message
    const cidList = memberCids.map((m) => m.cid).join(", ");
    toast.success(`Project approved! PID: ${pid} | CIDs: ${cidList}`, {
      duration: 6000,
    });
  };

  const handleReject = async () => {
    if (!selectedApproval?.id) return;
    if (!reviewNotes.trim()) {
      toast.error("Please provide a reason for cancellation");
      return;
    }
    setProcessing(true);

    try {
      if (selectedApproval.type === "member") {
        // Traditional member rejection (now "cancelled")
        await rejectMemberApproval(
          selectedApproval.id,
          user?.email || "",
          adminInfo?.name || user?.displayName || "",
          reviewNotes,
        );
      } else if (selectedApproval.type === "project") {
        // Delete the project request entirely so client re-selects quotation and re-fills project info
        const { deleteProjectRequest } = await import(
          "@/services/projectRequestService"
        );
        await deleteProjectRequest(selectedApproval.inquiryId);

        // Reset client requests to draft (keeps member info so client doesn't re-type everything)
        const { cancelAllClientRequestsByInquiry } = await import(
          "@/services/clientRequestService"
        );
        await cancelAllClientRequestsByInquiry(
          selectedApproval.inquiryId,
          user?.email || "",
          reviewNotes,
        );

        // Remove "selected" status from the associated quotation so client can choose again
        try {
          const { resetSelectedQuotationForInquiry } = await import(
            "@/services/quotationService"
          );
          await resetSelectedQuotationForInquiry(selectedApproval.inquiryId);
        } catch (qError) {
          console.warn("Could not reset quotation selected status:", qError);
        }

        // Revert the inquiry status back to "Ongoing Quotation" so "Proceed with Service" reappears
        try {
          const { updateInquiryStatus } = await import(
            "@/app/actions/inquiryActions"
          );
          await updateInquiryStatus(
            selectedApproval.inquiryId,
            "Ongoing Quotation",
          );
        } catch (iqError) {
          console.warn("Could not reset inquiry status:", iqError);
        }
      }

      // Send cancellation email
      try {
        const { sendProjectCancellationEmail } = await import(
          "@/app/actions/inquiryActions"
        );
        await sendProjectCancellationEmail(
          selectedApproval.submittedBy,
          selectedApproval.submittedByName || selectedApproval.submittedBy,
          selectedApproval.projectTitle,
          reviewNotes,
          selectedApproval.inquiryId,
        );
        console.log(
          "✅ Cancellation email sent to",
          selectedApproval.submittedBy,
        );
      } catch (emailError) {
        console.error("Failed to send cancellation email:", emailError);
        // Don't toast error here, the rejection itself succeeded
      }

      toast.success(
        "Submission cancelled. The client has been notified via email.",
      );
      setShowReviewDialog(false);
      setSelectedApproval(null);
      setReviewNotes("");
      fetchApprovals();
    } catch (error) {
      console.error("Cancel error:", error);
      toast.error("Failed to cancel submission");
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: ApprovalStatus) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200 border">
            <Clock className="h-3 w-3 mr-1" /> Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200 border">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
          </Badge>
        );
      case "rejected":
      case "cancelled":
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 border">
            <XCircle className="h-3 w-3 mr-1" /> Cancelled
          </Badge>
        );
      case "draft":
        return (
          <Badge className="bg-gray-100 text-gray-700 border-gray-200 border">
            <AlertCircle className="h-3 w-3 mr-1" /> Draft
          </Badge>
        );
    }
  };

  const formatDate = (date: Date | string | any | undefined) => {
    if (!date) return "—";
    try {
      // Handle Firestore Timestamp objects
      if (
        date &&
        typeof date === "object" &&
        "toDate" in date &&
        typeof date.toDate === "function"
      ) {
        return date.toDate().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      // Handle Date objects and strings
      const d = typeof date === "string" ? new Date(date) : date;
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      console.error("Error formatting date:", error, date);
      return "—";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#166FB5] to-[#4038AF] rounded-lg">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            Projects Approval
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review and approve project submissions and team member registrations
            from the client portal
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-col gap-3 w-full lg:max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all fields: name, email, project title, PID, institution..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-sm text-slate-500 whitespace-nowrap">
              Sort by:
            </span>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as "date" | "title" | "status")}
            >
              <SelectTrigger className="h-9 w-[140px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date Submitted</SelectItem>
                <SelectItem value="title">Project Title</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
              }
              className="h-9 w-9 p-0 shrink-0 bg-white"
              title={
                sortOrder === "asc"
                  ? "Currently ascending — click for descending"
                  : "Currently descending — click for ascending"
              }
            >
              {sortOrder === "asc" ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {(
            [
              "pending",
              "approved",
              "cancelled",
              "draft",
              "all",
            ] as FilterStatus[]
          ).map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className={
                filterStatus === status
                  ? "bg-[#166FB5] text-white"
                  : "text-slate-600 bg-white"
              }
            >
              {status === "pending" && <Clock className="h-3.5 w-3.5 mr-1.5" />}
              {status === "approved" && (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              {(status === "rejected" || status === "cancelled") && (
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
              )}
              {status === "draft" && (
                <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
              )}
              {status === "all" && <Filter className="h-3.5 w-3.5 mr-1.5" />}
              <span className="capitalize">
                {status === "rejected" ? "Cancelled" : status}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Approval Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#166FB5]" />
          <span className="ml-3 text-slate-600">Loading approvals...</span>
        </div>
      ) : sortedApprovals.length === 0 ? (
        <Card className="border-2 border-dashed border-slate-300">
          <CardContent className="p-12 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-slate-100 rounded-full">
                <ShieldCheck className="h-12 w-12 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">
                {searchQuery.trim()
                  ? "No approval requests match your search"
                  : `No ${filterStatus !== "all" ? filterStatus : ""} approval requests`}
              </h3>
              <p className="text-slate-500 max-w-md">
                {searchQuery.trim()
                  ? "Try a different keyword or clear the search input."
                  : filterStatus === "pending"
                    ? "There are no pending project or member approvals at this time."
                    : "No approval requests match the current filter."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sortedApprovals.map((approval) => (
            <Card
              key={approval.id}
              className="hover:shadow-md transition-shadow border border-slate-200"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {approval.type === "project" && (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 border">
                          <FileText className="h-3 w-3 mr-1" /> New Project
                        </Badge>
                      )}
                      <CardTitle className="text-lg font-bold text-slate-800">
                        {approval.projectTitle}
                      </CardTitle>
                      {getStatusBadge(approval.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1 font-mono text-xs">
                        <FolderOpen className="h-3.5 w-3.5" />
                        {approval.projectPid}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {approval.submittedByName || approval.submittedBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(approval.submittedAt)}
                      </span>
                      {approval.type === "project" && approval.projectData && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Start: {formatDate(approval.projectData.startDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenReview(approval)}
                      className="text-[#166FB5] border-[#166FB5] hover:bg-[#166FB5] hover:text-white"
                    >
                      <Eye className="h-4 w-4 mr-1.5" />
                      Review
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {approval.type === "project" && approval.projectData && (
                  <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Project Lead:</span>{" "}
                        <span className="font-medium text-slate-800">
                          {approval.projectData.projectLead}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">
                          Sending Institution:
                        </span>{" "}
                        <span className="font-medium text-slate-800">
                          {approval.projectData.sendingInstitution}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500">
                          Funding Institution:
                        </span>{" "}
                        <span className="font-medium text-slate-800">
                          {approval.projectData.fundingInstitution}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {(() => {
                  const seenEmails = new Set<string>();
                  const uniqueMembers = (approval.members || []).filter(
                    (member) => {
                      const email = member.formData?.email
                        ?.toLowerCase()
                        ?.trim();
                      if (!email) return true;
                      if (seenEmails.has(email)) return false;
                      seenEmails.add(email);
                      return true;
                    },
                  );

                  // For project type, we want to prioritize validated primary members
                  // If we have both, only keep the validated one
                  let filteredMembers = uniqueMembers;
                  if (approval.type === "project") {
                    const primaryMembers = uniqueMembers.filter(
                      (m) => m.isPrimary,
                    );
                    if (primaryMembers.length > 1) {
                      const validatedPrimary = primaryMembers.find(
                        (m) => m.isValidated,
                      );
                      if (validatedPrimary) {
                        filteredMembers = uniqueMembers.filter(
                          (m) => !m.isPrimary || m === validatedPrimary,
                        );
                      }
                    }
                  }

                  // If member count is still 0 for an approved project, check if we have data in clientRequests
                  const displayMembers =
                    filteredMembers.length > 0
                      ? filteredMembers
                      : (approval.clientRequests || []).map((cr) => ({
                          formData: {
                            name: cr.name || "Unnamed",
                            email: cr.email,
                          },
                        }));

                  return (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users className="h-4 w-4 text-slate-400" />
                      <span className="font-medium">
                        {approval.type === "project"
                          ? `${displayMembers.length || 0} total member(s)`
                          : `${displayMembers.filter((m: any) => !m.isPrimary).length} member(s)`}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span>
                        {approval.type === "project"
                          ? displayMembers
                              .map((m: any) => m.formData.name || "Unnamed")
                              .join(", ")
                          : displayMembers
                              .filter((m: any) => !m.isPrimary)
                              .map((m: any) => m.formData.name || "Unnamed")
                              .join(", ")}
                      </span>
                    </div>
                  );
                })()}
                {approval.reviewedBy && (
                  <div className="mt-2 text-xs text-slate-500">
                    Reviewed by {approval.reviewedByName || approval.reviewedBy}{" "}
                    on {formatDate(approval.reviewedAt)}
                    {approval.reviewNotes && (
                      <span className="block mt-1 italic text-slate-400">
                        &ldquo;{approval.reviewNotes}&rdquo;
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <ShieldCheck className="h-6 w-6 text-[#166FB5]" />
              {selectedApproval?.type === "project"
                ? "Review New Project Submission"
                : "Review Member Submission"}
            </DialogTitle>
            <DialogDescription>
              {selectedApproval?.type === "project" ? (
                <>
                  Review the new project and team members submitted for
                  approval.
                </>
              ) : (
                <>
                  Review the team members submitted for{" "}
                  <span className="font-semibold text-slate-700">
                    {selectedApproval?.projectTitle}
                  </span>{" "}
                  (
                  <span className="font-mono text-xs">
                    {selectedApproval?.projectPid}
                  </span>
                  )
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedApproval && (
            <div className="space-y-4 py-4">
              {/* Project Info for project-type approvals */}
              {selectedApproval.type === "project" &&
                selectedApproval.projectData && (
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4" />
                      Project Details
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="col-span-2">
                        <span className="text-purple-700 font-medium">
                          Title:
                        </span>{" "}
                        <span className="font-semibold text-purple-900">
                          {selectedApproval.projectData.title}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-700 font-medium">
                          Project Lead:
                        </span>{" "}
                        <span className="text-purple-900">
                          {selectedApproval.projectData.projectLead}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-700 font-medium">
                          Start Date:
                        </span>{" "}
                        <span className="text-purple-900">
                          {formatDate(selectedApproval.projectData.startDate)}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-700 font-medium">
                          Sending Institution:
                        </span>{" "}
                        <span className="text-purple-900">
                          {selectedApproval.projectData.sendingInstitution}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-700 font-medium">
                          Funding Institution:
                        </span>{" "}
                        <span className="text-purple-900">
                          {selectedApproval.projectData.fundingInstitution}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

              {/* Submission Info */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500">Submitted by:</span>{" "}
                    <span className="font-medium text-slate-800">
                      {selectedApproval.submittedByName ||
                        selectedApproval.submittedBy}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Email:</span>{" "}
                    <span className="font-medium text-slate-800">
                      {selectedApproval.submittedBy}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Inquiry ID:</span>{" "}
                    <span className="font-mono text-xs text-slate-800">
                      {selectedApproval.inquiryId}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Status:</span>{" "}
                    {getStatusBadge(selectedApproval.status)}
                  </div>
                </div>
              </div>

              {/* Member Cards */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {selectedApproval.type === "project"
                    ? `Team Members (${
                        Array.from(
                          new Map(
                            (selectedApproval.members || []).map((m) => [
                              m.formData?.email?.toLowerCase() ||
                                Math.random().toString(),
                              m,
                            ]),
                          ).values(),
                        ).length
                      })`
                    : `Team Members (${
                        (selectedApproval.members || []).filter(
                          (m) => !m.isPrimary,
                        ).length
                      })`}
                </h3>
                {(() => {
                  const items =
                    selectedApproval.type === "project"
                      ? Array.from(
                          (selectedApproval.members || []).reduce(
                            (acc: Map<string, any>, member: any) => {
                              const email =
                                member.formData?.email?.toLowerCase();
                              if (!email) {
                                acc.set(Math.random().toString(), member);
                                return acc;
                              }

                              const existing = acc.get(email);
                              // Prioritize validated members
                              if (
                                !existing ||
                                (!existing.isValidated && member.isValidated)
                              ) {
                                acc.set(email, member);
                              }
                              return acc;
                            },
                            new Map(),
                          ),
                        ).map((entry: any) => entry[1])
                      : (selectedApproval.members || []).filter(
                          (m: any) => !m.isPrimary,
                        );

                  if (items.length === 0) {
                    return (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                        No additional members pending CID issuance for this
                        submission.
                      </div>
                    );
                  }

                  return (items as any[]).map((member, idx) => {
                    const memberEmail = normalizeEmail(member.formData?.email);
                    const existingClient = memberEmail
                      ? existingClientsByEmail[memberEmail]
                      : undefined;
                    const decision = memberEmail
                      ? (memberCidDecisions[memberEmail] ?? "update")
                      : undefined;

                    return (
                      <Card
                        key={member.tempId || idx}
                        className={
                          existingClient
                            ? "border-2 border-amber-400 bg-amber-50/30"
                            : "border border-slate-200"
                        }
                      >
                        <CardContent className="p-4">
                          {/* Existing client banner */}
                          {existingClient && (
                            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-2">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                                <span className="text-sm font-semibold text-amber-800">
                                  Existing client found —{" "}
                                  <span className="font-mono text-amber-900">
                                    {existingClient.cid}
                                  </span>
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-amber-700 pl-6">
                                <span>
                                  <span className="font-semibold">Name:</span>{" "}
                                  {existingClient.name || "—"}
                                </span>
                                <span>
                                  <span className="font-semibold">
                                    Affiliation:
                                  </span>{" "}
                                  {existingClient.affiliation || "—"}
                                </span>
                                <span>
                                  <span className="font-semibold">Phone:</span>{" "}
                                  {existingClient.phoneNumber || "—"}
                                </span>
                                <span className="col-span-2">
                                  <span className="font-semibold">
                                    Address:
                                  </span>{" "}
                                  {existingClient.affiliationAddress || "—"}
                                </span>
                              </div>
                              {/* Admin decision radio */}
                              <div className="pl-6 flex flex-col gap-1.5 pt-1 border-t border-amber-200">
                                <p className="text-xs font-semibold text-amber-800 mb-0.5">
                                  How should this member be registered?
                                </p>
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`cid-decision-${memberEmail}`}
                                    value="update"
                                    checked={decision === "update"}
                                    onChange={() =>
                                      setMemberCidDecisions((prev) => ({
                                        ...prev,
                                        [memberEmail]: "update",
                                      }))
                                    }
                                    className="mt-0.5 accent-amber-600"
                                  />
                                  <span className="text-xs text-amber-900">
                                    <span className="font-semibold">
                                      Update existing CID ({existingClient.cid})
                                    </span>{" "}
                                    — overwrite name, affiliation, phone &amp;
                                    address with submitted data
                                  </span>
                                </label>
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`cid-decision-${memberEmail}`}
                                    value="new"
                                    checked={decision === "new"}
                                    onChange={() =>
                                      setMemberCidDecisions((prev) => ({
                                        ...prev,
                                        [memberEmail]: "new",
                                      }))
                                    }
                                    className="mt-0.5 accent-amber-600"
                                  />
                                  <span className="text-xs text-amber-900">
                                    <span className="font-semibold">
                                      Assign a new CID
                                    </span>{" "}
                                    — create a separate client record (e.g.
                                    different affiliation or project)
                                  </span>
                                </label>
                              </div>
                            </div>
                          )}

                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
                              <User className="h-4 w-4 text-[#166FB5]" />
                              {member.formData.name || "Unnamed"}
                              {member.isPrimary &&
                                selectedApproval.type === "project" && (
                                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 border ml-2">
                                    Primary Member
                                  </Badge>
                                )}
                            </h4>
                            <Badge
                              className={
                                member.isValidated
                                  ? "bg-blue-100 text-blue-700 border-blue-200 border"
                                  : "bg-yellow-100 text-yellow-700 border-yellow-200 border"
                              }
                            >
                              {member.isValidated ? "Validated" : "Draft"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-700">
                                {member.formData.email || "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-700">
                                {member.formData.phoneNumber || "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-700">
                                {member.formData.affiliation || "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-700">
                                {member.formData.designation || "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 col-span-2">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-700">
                                {member.formData.affiliationAddress || "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-700">
                                Sex: {member.formData.sex || "—"}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  });
                })()}
              </div>

              {/* Review Notes */}
              {selectedApproval.status === "pending" && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Review Notes{" "}
                    <span className="text-slate-400 font-normal">
                      (required for cancellation)
                    </span>
                  </Label>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add notes about why this project is being cancelled..."
                    className="min-h-[80px]"
                  />
                </div>
              )}

              {/* Previous Review Info */}
              {selectedApproval.reviewedBy && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-sm">
                  <span className="text-slate-500">
                    Previously reviewed by{" "}
                    <span className="font-medium text-slate-700">
                      {selectedApproval.reviewedByName ||
                        selectedApproval.reviewedBy}
                    </span>{" "}
                    on {formatDate(selectedApproval.reviewedAt)}
                  </span>
                  {selectedApproval.reviewNotes && (
                    <p className="mt-1 italic text-slate-500">
                      &ldquo;{selectedApproval.reviewNotes}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowReviewDialog(false);
                setSelectedApproval(null);
                setReviewNotes("");
                setExistingClientsByEmail({});
                setMemberCidDecisions({});
              }}
              disabled={processing}
            >
              Close
            </Button>
            {selectedApproval?.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={processing}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Cancel Submission
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={processing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Approve & Generate CIDs
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
