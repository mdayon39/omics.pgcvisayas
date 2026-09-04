"use client";

// Client Portal — Two-Panel Layout
// Left pane (1/4): Projects navigation sidebar
// Right pane (3/4): Selected project details + team member management

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useAuth from "@/hooks/useAuth";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  deleteDoc,
  Timestamp,
  or,
  limit,
  arrayUnion,
} from "firebase/firestore";
import { clientFormSchema, ClientFormData } from "@/schemas/clientSchema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getNextCid } from "@/services/clientService";
import {
  saveMemberApproval,
  submitForApproval,
  getMemberApproval,
} from "@/services/memberApprovalService";
import {
  getProjectRequestById,
  saveProjectRequest,
  submitProjectForApproval,
  subscribeToProjectRequestsByInquiry,
  ProjectRequest,
} from "@/services/projectRequestService";
import {
  saveClientRequest,
  getClientRequestsByInquiry,
  submitClientRequestsForApproval,
  subscribeToClientRequests,
  ClientRequest,
} from "@/services/clientRequestService";
import { getQuotationsByInquiryId } from "@/services/quotationService";
import {
  cancelInquiryByClient,
  subscribeToInquiryById,
} from "@/services/inquiryService";
import { Inquiry } from "@/types/Inquiry";
import { getChargeSlipsByProjectId } from "@/services/chargeSlipService";
import { getSampleFormsByProjectId } from "@/services/sampleFormService";
import {
  getServiceReportsByProjectId,
  markServiceReportReceived,
} from "@/services/serviceReportService";
import {
  getConfigurationSettings,
  DEFAULT_PORTAL_FEATURES,
} from "@/services/configurationSettingsService";
import { QuotationRecord } from "@/types/Quotation";
import FloatingChatWidget from "@/components/chat/FloatingChatWidget";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import { SampleFormSummary } from "@/types/SampleForm";
import { ApprovalStatus } from "@/types/MemberApproval";
import { ConfigurationSettings } from "@/types/ConfigurationSettings";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import ConfirmationModalLayout from "@/components/modal/ConfirmationModalLayout";
import { useApprovalStatus } from "@/hooks/useApprovalStatus";
import {
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
  Calendar,
  Building2,
  User,
  Users,
  Save,
  Trash2,
  Clock,
  ShieldCheck,
  XCircle,
  Send,
  PartyPopper,
  Sparkles,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  FileText,
  Receipt,
  Settings,
  Key,
  Info,
  Mail,
  Smartphone,
  MapPin,
  Briefcase,
  FlaskConical,
  FileSpreadsheet,
  ShieldEllipsis,
  Stamp,
  ArrowRight,
  Download,
  Eye,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import ClientConformeModal from "@/components/forms/ClientConformeModal";
import UploadReceipt from "@/components/client/UploadReceipt";
import DownloadForms from "@/components/client/DownloadForms";

// ────────────────────────────────────────────────────────────────
//  Formatting Helpers
// ────────────────────────────────────────────────────────────────

// Format service type for display
const formatServiceType = (type: string | null | undefined): string => {
  if (!type) return "—";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

// Format a Firestore Timestamp or Date to "MMM dd, yyyy"
const formatCreatedAt = (val: Date | any): string => {
  if (!val) return "";
  try {
    const date = val?.toDate
      ? val.toDate()
      : val instanceof Date
        ? val
        : new Date(val);
    return isNaN(date.getTime()) ? "" : format(date, "MMM dd, yyyy");
  } catch {
    return "";
  }
};

// Format workflow type for display
const formatWorkflowType = (type: string | null | undefined): string => {
  if (!type) return "—";
  if (type === "complete-bioinfo")
    return "Complete molecular workflow with Bioinformatics Analysis";
  if (type === "complete")
    return "Complete Molecular workflow only (DNA Extraction to Sequencing)";
  if (type === "individual") return "Individual Assay";
  return type
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatBioinfoOption = (option: string): string => {
  switch (option) {
    case "whole-genome-assembly":
      return "Whole Genome Assembly";
    case "metabarcoding-downstream":
      return "Metabarcoding with Downstream Analysis";
    case "metabarcoding-preprocessing":
      return "Metabarcoding with Pre-processing Only";
    case "transcriptomics":
      return "Transcriptomics (QC to Annotation)";
    case "phylogenetics":
      return "Phylogenetics (1 Marker)";
    case "whole-genome-assembly-annotation":
      return "Whole Genome Assembly and Annotation";
    case "dna-extraction":
      return "DNA Extraction";
    case "quantification":
      return "Quantification";
    case "library-preparation":
      return "Library Preparation";
    case "sequencing":
      return "Sequencing";
    case "bioinformatics-analysis":
      return "Bioinformatics Analysis";
    case "genome-assembly":
      return "Whole Genome Assembly";
    case "metabarcoding":
      return "Metabarcoding with Downstream Analysis";
    case "pre-processing":
      return "Metabarcoding with Pre-processing Only";
    case "assembly-annotation":
      return "Whole Genome Assembly and Annotation";
    default:
      return option;
  }
};

const flattenBioinformaticsDetails = (
  input: Record<string, any> | null | undefined,
  prefix = "",
): Array<{ key: string; value: string }> => {
  if (!input) return [];

  const rows: Array<{ key: string; value: string }> = [];
  Object.entries(input).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      if (value.length > 0) rows.push({ key: path, value: value.join(", ") });
      return;
    }

    if (typeof value === "object") {
      rows.push(
        ...flattenBioinformaticsDetails(value as Record<string, any>, path),
      );
      return;
    }

    rows.push({ key: path, value: String(value) });
  });

  return rows;
};

// ────────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────────

interface ClientMember {
  id: string;
  cid: string;
  formData: {
    name: string;
    email: string;
    affiliation: string;
    designation: string;
    sex: "M" | "F" | "Other" | "";
    phoneNumber: string;
    affiliationAddress: string;
  };
  initialData?: {
    name: string;
    email: string;
    affiliation: string;
    designation: string;
    sex: "M" | "F" | "Other" | "";
    phoneNumber: string;
    affiliationAddress: string;
  };
  errors: Partial<Record<keyof ClientFormData, string>>;
  isSubmitted: boolean;
  isPrimary: boolean;
  isDraft?: boolean;
  status?: string;
}

interface ProjectDetails {
  pid: string;
  title: string;
  lead: string;
  startDate: Date | string;
  createdAt?: any; // Firestore Timestamp or Date — used as primary sort key
  sendingInstitution: string;
  fundingInstitution: string;
  status: string;
  inquiryId: string;
  isDraft?: boolean; // Flag for draft project requests
  originalRequestId?: string;
}

// ────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────

/**
 * Normalise the sex value coming from Firestore.
 * Firestore may store "M", "F", "O" or "Other" (legacy data uses "O").
 * The Select component expects exactly "M", "F", or "Other".
 */
function normalizeSex(val?: string): "M" | "F" | "Other" | "" {
  if (!val) return "";
  const v = val.trim();
  if (v === "M" || v === "F" || v === "Other" || v === "") return v as any;
  const u = v.toUpperCase();
  if (u === "M" || u === "MALE") return "M";
  if (u === "F" || u === "FEMALE") return "F";
  if (u === "O" || u === "OTHER") return "Other";
  return "";
}

// ────────────────────────────────────────────────────────────────
//  Component
// ────────────────────────────────────────────────────────────────

const SENDING_INSTITUTIONS = [
  "UP System",
  "SUC/HEI",
  "Government",
  "Private/Local",
  "International",
  "N/A",
] as const;

export default function ClientPortalPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const emailParam = searchParams.get("email");
  const inquiryIdParam = searchParams.get("inquiryId");
  const pidParam = searchParams.get("pid");
  const projectRequestIdParam = searchParams.get("projectRequestId");

  // ── UI state ──────────────────────────────────────────────────
  const [showProjectsList, setShowProjectsList] = useState(true);
  const [showInquiriesList, setShowInquiriesList] = useState(true);
  // Load member expansion state from localStorage for persistence across refreshes
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("expandedMembers");
      console.log("Loading expanded members from localStorage:", saved);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          console.log("Parsed expansion state:", parsed);
          return new Set(parsed);
        } catch (e) {
          console.error("Failed to parse localStorage expandedMembers:", e);
          return new Set();
        }
      }
    }
    console.log("No localStorage data, starting with empty set");
    return new Set(); // Start with all collapsed, let user decide
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [receivingReportId, setReceivingReportId] = useState<string | null>(
    null,
  );
  // Tracks which service report IDs the client has already opened the Google feedback form for.
  // Intentionally session-scoped (not persisted) so the form cannot be trivially bypassed on refresh.
  const [formOpenedReports, setFormOpenedReports] = useState<Set<string>>(
    new Set(),
  );
  const [expandedProjectDocs, setExpandedProjectDocs] = useState<Set<string>>(
    new Set(),
  );
  const [expandedCsIds, setExpandedCsIds] = useState<Set<string>>(new Set());
  const [expandedQuoteIds, setExpandedQuoteIds] = useState<Set<string>>(
    new Set(),
  );
  // Keys are `${pid}:quotations`, `${pid}:sampleForm`, `${pid}:chargeSlips`, `${pid}:serviceReports`
  const [expandedDocSections, setExpandedDocSections] = useState<Set<string>>(
    new Set(),
  );
  const toggleDocSection = (pid: string, section: string) =>
    setExpandedDocSections((prev) => {
      const next = new Set(prev);
      const key = `${pid}:${section}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Active document panel shown in main content (below Team Members)
  const [activeDocPanel, setActiveDocPanel] = useState<string | null>(null);

  const handleSelectDocPanel = (pid: string, section: string) => {
    const key = `${pid}:${section}`;
    setActiveDocPanel((prev) => (prev === key ? null : key));
    // Collapse all expanded member forms
    setExpandedMembers(new Set());
    if (typeof window !== "undefined") {
      localStorage.setItem("expandedMembers", JSON.stringify([]));
    }
  };

  const [configSettings, setConfigSettings] =
    useState<ConfigurationSettings | null>(null);

  const [projectDocuments, setProjectDocuments] = useState<
    Map<
      string,
      {
        quotations: QuotationRecord[];
        chargeSlips: ChargeSlipRecord[];
        sampleForms: SampleFormSummary[];
        serviceReports: any[];
        officialReceipts: any[];
        formSubmissions: number;
        loading: boolean;
      }
    >
  >(new Map());

  // ── Inquiry context state ─────────────────────────────────────
  const [currentInquiry, setCurrentInquiry] = useState<Inquiry | null>(null);
  const [inquiryQuotations, setInquiryQuotations] = useState<QuotationRecord[]>(
    [],
  );
  const [loadingQuotations, setLoadingQuotations] = useState(false);

  // Proceed with Service modal state
  const [showProceedModal, setShowProceedModal] = useState(false);
  const [selectedQuotationRef, setSelectedQuotationRef] = useState<
    string | null
  >(null);
  const [showCancelInquiryModal, setShowCancelInquiryModal] = useState(false);

  // Change Password modal state
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [changePwCurrent, setChangePwCurrent] = useState("");
  const [changePwNew, setChangePwNew] = useState("");
  const [changePwConfirm, setChangePwConfirm] = useState("");
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwError, setChangePwError] = useState<string | null>(null);
  const [changePwSuccess, setChangePwSuccess] = useState(false);
  const [cancelInquiryReason, setCancelInquiryReason] = useState("");
  const [cancelInquirySubmitting, setCancelInquirySubmitting] = useState(false);

  // ── Data state ────────────────────────────────────────────────
  const [members, setMembers] = useState<ClientMember[]>([]);
  const [projects, setProjects] = useState<ProjectDetails[]>([]);

  // Dedicated notification state: charge slips for ALL projects (not just expanded ones)
  // Used for the sidebar red-dot badge
  const [notifChargeSlips, setNotifChargeSlips] = useState<
    Map<string, ChargeSlipRecord[]>
  >(new Map());

  // Initialize expandedProjectDocs when projects list is updated or pidParam changes
  useEffect(() => {
    // Completely removed auto-expansion logic to ensure projects are always collapsed by default
    // Even if pidParam is present, we start with empty set to follow user request
    setExpandedProjectDocs(new Set());
  }, []);

  // Open change-password modal via custom event dispatched from the header burger menu
  useEffect(() => {
    const handleOpenChangePw = () => {
      setChangePwCurrent("");
      setChangePwNew("");
      setChangePwConfirm("");
      setChangePwError(null);
      setChangePwSuccess(false);
      setShowChangePasswordModal(true);
    };
    window.addEventListener("open-change-password", handleOpenChangePw);
    return () =>
      window.removeEventListener("open-change-password", handleOpenChangePw);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadConfig = async () => {
      try {
        const data = await getConfigurationSettings();
        if (isMounted) setConfigSettings(data);
      } catch (error) {
        console.error("Failed to load portal configuration:", error);
      }
    };

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  const portalFeatures =
    configSettings?.portalFeatures ?? DEFAULT_PORTAL_FEATURES;

  const [selectedProjectPid, setSelectedProjectPid] = useState<string | null>(
    null,
  );
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(
    null,
  );
  const [projectRequest, setProjectRequest] = useState<ProjectRequest | null>(
    null,
  );
  const [currentProjectRequestId, setCurrentProjectRequestId] = useState<
    string | null
  >(null);

  // Canonical member scope for clientRequests.projectRequestId.
  // Approved project: selected PID.
  // Draft project: draft request ID context.
  const canonicalMemberScopeId = useMemo(() => {
    const isDraftSelection =
      !!projectDetails?.isDraft || selectedProjectPid === "DRAFT";

    if (!isDraftSelection) {
      return selectedProjectPid && selectedProjectPid.trim().length > 0
        ? selectedProjectPid
        : null;
    }

    const draftScopeCandidates = [
      currentProjectRequestId,
      projectDetails?.originalRequestId,
      projectRequest?.id,
      selectedProjectPid && selectedProjectPid !== "DRAFT"
        ? selectedProjectPid
        : null,
    ];

    return (
      draftScopeCandidates.find(
        (id): id is string => !!id && id.trim().length > 0,
      ) ?? null
    );
  }, [
    selectedProjectPid,
    projectDetails?.isDraft,
    projectDetails?.originalRequestId,
    currentProjectRequestId,
    projectRequest?.id,
  ]);

  const getMemberScopeOrToast = useCallback(
    (actionName: string): string | null => {
      if (canonicalMemberScopeId) return canonicalMemberScopeId;

      console.warn(`[client-info] Missing member scope for ${actionName}`, {
        selectedProjectPid,
        currentProjectRequestId,
        projectDetails,
        projectRequestId: projectRequest?.id,
      });
      toast.error(
        "Unable to determine project scope. Please reselect the project and try again.",
      );
      return null;
    },
    [
      canonicalMemberScopeId,
      selectedProjectPid,
      currentProjectRequestId,
      projectDetails,
      projectRequest?.id,
    ],
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeSavingId, setActiveSavingId] = useState<string | null>(null);
  const savingDraftIdsRef = useRef<Set<string>>(new Set());
  // Tracks whether the clients Firestore subscription has fired at least once.
  // Used to prevent falling back to draft data while clients are still loading.
  const clientsLoadedRef = useRef(false);
  // When the user explicitly navigates to the workspace view (by clicking a pending
  // inquiry item), block auto-project-selection until they actively pick a project.
  const userWantsWorkspaceRef = useRef(false);
  // Prevent auto-redirect from overriding manual inquiry selection.
  const userSelectedInquiryRef = useRef(false);
  // Ensure we only apply the default inquiry redirect once after login.
  const autoInquiryRedirectHandledRef = useRef(false);
  // Ensure the pid-based inquiry correction only fires once per load.
  const pidInquiryCorrectedRef = useRef(false);
  // Tracks whether the "Pending" inquiry auto-init (show workspace, collapse projects)
  // has already been applied for the current inquiry ID, so it only fires once per load.
  const pendingInitHandledRef = useRef<string | null>(null);

  // ── Modal state ───────────────────────────────────────────────
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  // Real-time data containers
  const [fetchedDraftProjects, setFetchedDraftProjects] = useState<
    ProjectDetails[]
  >([]);
  const [fetchedApprovedProjects, setFetchedApprovedProjects] = useState<
    ProjectDetails[]
  >([]);
  const [fetchedPreviousProjects, setFetchedPreviousProjects] = useState<
    ProjectDetails[]
  >([]);
  const [showPreviousProjectsList, setShowPreviousProjectsList] =
    useState(false);
  const [isProjectInfoExpanded, setIsProjectInfoExpanded] = useState(false);
  const [isProjectInfoEditing, setIsProjectInfoEditing] = useState(false);
  const [projectInfoForm, setProjectInfoForm] = useState({
    title: "",
    lead: "",
    startDate: "",
    sendingInstitution: "",
    fundingInstitution: "",
  });
  const [isSavingProjectInfo, setIsSavingProjectInfo] = useState(false);
  // All submitted inquiries for this email (for sidebar history)
  const [allInquiries, setAllInquiries] = useState<
    {
      id: string;
      status: string;
      serviceType?: string;
      name?: string;
      createdAt?: Date | any;
    }[]
  >([]);

  const [fetchedClientRequests, setFetchedClientRequests] = useState<
    ClientRequest[]
  >([]);
  const [fetchedClients, setFetchedClients] = useState<any[]>([]); // Using any for raw client doc data for now
  // Clients fetched specifically for the currently selected project (handles previous-inquiry projects)
  const [fetchedSelectedProjectClients, setFetchedSelectedProjectClients] =
    useState<any[]>([]);
  const [fetchedMemberApprovals, setFetchedMemberApprovals] = useState<any[]>(
    [],
  );

  const [showSubmitForApprovalModal, setShowSubmitForApprovalModal] =
    useState(false);
  const [showSubmitProjectModal, setShowSubmitProjectModal] = useState(false);

  // Client Conforme modal — shown before final submission
  const [showConformeModal, setShowConformeModal] = useState(false);
  const [conformePendingAction, setConformePendingAction] = useState<
    "draft" | "team" | null
  >(null);

  // ── Approval state ────────────────────────────────────────────
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(
    null,
  );
  const [showApprovalCelebration, setShowApprovalCelebration] = useState(false);
  const [previousApprovalStatus, setPreviousApprovalStatus] =
    useState<ApprovalStatus | null>(null);

  const approvalStatusData = useApprovalStatus(
    inquiryIdParam,
    selectedProjectPid,
  );

  // ────────────────────────────────────────────────────────────────
  //  Authentication Check
  // ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) {
      console.log("🚫 No authenticated user, redirecting to login");
      router.replace("/login");
      return;
    }
  }, [user, authLoading, router]);

  // ────────────────────────────────────────────────────────────────
  //  Data Subscriptions
  // ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!emailParam || !inquiryIdParam) {
      router.replace("/portal");
      return;
    }

    // Wait for authentication before loading data
    if (authLoading || !user) {
      return;
    }

    // Initialize projectRequestId from URL if provided
    if (projectRequestIdParam) {
      setCurrentProjectRequestId(projectRequestIdParam);
    } else {
      setCurrentProjectRequestId(null);
    }

    // 1. Subscribe to Project Request for the current inquiry
    const unsubDraftProjects = subscribeToProjectRequestsByInquiry(
      inquiryIdParam,
      (requests) => {
        // Update selected project request object if needed
        if (currentProjectRequestId) {
          const match = requests.find((r) => r.id === currentProjectRequestId);
          if (match) {
            setProjectRequest(match);
          } else if (requests.length === 0) {
            setProjectRequest(null);
          }
        } else if (requests.length > 0) {
          // Default to first usually
          setProjectRequest(requests[0]);
        } else {
          setProjectRequest(null);
        }
      },
    );

    // 2. Subscribe to Approved Projects
    const projectsQ = query(
      collection(db, "projects"),
      or(
        where("iid", "==", inquiryIdParam),
        where("iid", "array-contains", inquiryIdParam),
      ),
    );
    const unsubApprovedProjects = onSnapshot(projectsQ, (snapshot) => {
      const approved = snapshot.docs.map((projectDoc) => {
        const projectData = projectDoc.data();
        return {
          pid: projectData.pid || projectDoc.id,
          title: projectData.title || "Untitled Project",
          lead: projectData.lead || "Not specified",
          startDate:
            projectData.startDate?.toDate?.() ||
            projectData.startDate ||
            new Date(),
          createdAt: projectData.createdAt,
          sendingInstitution: projectData.sendingInstitution || "Not specified",
          fundingInstitution: projectData.fundingInstitution || "Not specified",
          status: projectData.status || "Pending",
          inquiryId: projectData.iid || inquiryIdParam || "",
        } as ProjectDetails;
      });
      setFetchedApprovedProjects(approved);
    });

    // 3. Subscribe to Client Requests (Draft Members)
    const unsubClientRequests = subscribeToClientRequests(
      inquiryIdParam,
      (requests) => {
        setFetchedClientRequests(requests);
      },
    );

    // 4. Subscribe to Clients (Approved Members)
    const normalizedEmail = emailParam.trim().toLowerCase();
    const clientsQ = query(
      collection(db, "clients"),
      where("inquiryId", "==", inquiryIdParam),
      where("email", "==", normalizedEmail),
    );
    const unsubClients = onSnapshot(
      clientsQ,
      (snapshot) => {
        const clients = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        clientsLoadedRef.current = true;
        setFetchedClients(clients);
        setLoading(false); // Data loaded successfully (or empty result)
      },
      (error) => {
        console.error("Failed to subscribe to clients:", error);
        clientsLoadedRef.current = true;
        setFetchedClients([]);
        setLoading(false); // Prevent infinite spinner on permission/query errors
      },
    );

    return () => {
      unsubDraftProjects();
      unsubApprovedProjects();
      unsubClientRequests();
      unsubClients();
    };
  }, [
    emailParam,
    inquiryIdParam,
    projectRequestIdParam,
    router,
    authLoading,
    user,
  ]);

  // 1.1a. Subscribe to draft/pending/rejected project requests for all inquiries (by email)
  useEffect(() => {
    if (!emailParam || authLoading || !user) return;

    const draftQuery = query(
      collection(db, "projectRequests"),
      where("requestedBy", "==", emailParam),
    );

    const unsub = onSnapshot(draftQuery, (snapshot) => {
      const drafts = snapshot.docs
        .map((docSnap) => {
          const draftProjectRequest = docSnap.data() as ProjectRequest;
          if (
            !["draft", "pending", "rejected"].includes(
              draftProjectRequest.status,
            )
          )
            return null;
          const statusLabel =
            draftProjectRequest.status === "draft"
              ? "Draft"
              : draftProjectRequest.status === "pending"
                ? "Pending Approval"
                : "Rejected";
          return {
            pid:
              draftProjectRequest.id ||
              docSnap.id ||
              draftProjectRequest.inquiryId,
            title: draftProjectRequest.title || "Draft Project",
            lead: draftProjectRequest.projectLead || "Not specified",
            startDate: draftProjectRequest.startDate?.toDate?.() || new Date(),
            createdAt: draftProjectRequest.createdAt,
            sendingInstitution:
              draftProjectRequest.sendingInstitution || "Not specified",
            fundingInstitution:
              draftProjectRequest.fundingInstitution || "Not specified",
            status: statusLabel,
            inquiryId: draftProjectRequest.inquiryId || docSnap.id,
            isDraft: true,
            originalRequestId: docSnap.id,
          } as ProjectDetails;
        })
        .filter((project): project is ProjectDetails => !!project);

      setFetchedDraftProjects(drafts);
    });

    return () => unsub();
  }, [emailParam, authLoading, user]);

  // 1.1c. Subscribe to clients for the selected project (needed for previous-inquiry projects)
  //  so members correctly show "Complete" instead of "Draft" when they have real client IDs.
  useEffect(() => {
    if (
      !selectedProjectPid ||
      selectedProjectPid.startsWith("inquiry-") ||
      selectedProjectPid === "DRAFT"
    ) {
      setFetchedSelectedProjectClients([]);
      return;
    }
    const q = query(
      collection(db, "clients"),
      where("pid", "array-contains", selectedProjectPid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setFetchedSelectedProjectClients(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      );
    });
    return () => unsub();
  }, [selectedProjectPid]);

  // 1.1b. Load projects from previous inquiries for the same email
  useEffect(() => {
    if (!emailParam || !inquiryIdParam || authLoading || !user) return;
    let cancelled = false;
    let unsubPrev: (() => void) | null = null;

    // Real-time listener for all inquiries by this email so that a newly submitted
    // inquiry appears in the sidebar immediately without a page reload.
    const unsubInquiriesList = onSnapshot(
      query(collection(db, "inquiries"), where("email", "==", emailParam)),
      (inquiriesSnap) => {
        if (cancelled) return;

        const inquiries = inquiriesSnap.docs.map((d) => ({
          id: d.id,
          status: d.data().status || "Pending",
          serviceType: d.data().serviceType || d.data().service || undefined,
          name: d.data().name || undefined,
          createdAt: d.data().createdAt || undefined,
        }));
        const getTime = (val: Date | any): number => {
          if (!val) return 0;
          const date = val?.toDate
            ? val.toDate()
            : val instanceof Date
              ? val
              : new Date(val);
          return isNaN(date.getTime()) ? 0 : date.getTime();
        };
        const sortedInquiries = inquiries.sort(
          (a, b) => getTime(b.createdAt) - getTime(a.createdAt),
        );
        setAllInquiries(sortedInquiries);

        const otherIds = inquiriesSnap.docs
          .map((d) => d.id)
          .filter((id) => id !== inquiryIdParam);

        // Re-subscribe to the previous projects query whenever the inquiry ID list changes
        unsubPrev?.();
        if (otherIds.length === 0) {
          setFetchedPreviousProjects([]);
          unsubPrev = null;
          return;
        }
        // Firestore `in` / `array-contains-any` each support up to 30 values
        const chunkIds = otherIds.slice(0, 30);
        // Handle both string and array-stored iid fields (mirrors current-projects subscription)
        const prevQ = query(
          collection(db, "projects"),
          or(
            where("iid", "in", chunkIds),
            where("iid", "array-contains-any", chunkIds),
          ),
        );
        unsubPrev = onSnapshot(prevQ, (snap) => {
          if (cancelled) return;
          // De-duplicate in case both clauses match the same project
          const seen = new Set<string>();
          const previous: ProjectDetails[] = [];
          for (const d of snap.docs) {
            const pid = d.data().pid || d.id;
            if (seen.has(pid)) continue;
            seen.add(pid);
            const data = d.data();
            // Resolve inquiryId: pick matching id from chunkIds when iid is an array
            const rawIid = data.iid;
            const resolvedIid = Array.isArray(rawIid)
              ? (rawIid.find((id: string) => chunkIds.includes(id)) ??
                rawIid[0] ??
                "")
              : rawIid || "";
            previous.push({
              pid,
              title: data.title || "Untitled Project",
              lead: data.lead || "Not specified",
              startDate: data.startDate?.toDate?.() || new Date(),
              createdAt: data.createdAt,
              sendingInstitution: data.sendingInstitution || "Not specified",
              fundingInstitution: data.fundingInstitution || "Not specified",
              status: data.status || "Pending",
              inquiryId: resolvedIid,
            } as ProjectDetails);
          }
          setFetchedPreviousProjects(previous);
        });
      },
      (err) => {
        console.warn("Could not load previous inquiries:", err);
      },
    );

    return () => {
      cancelled = true;
      unsubPrev?.();
      unsubInquiriesList();
    };
  }, [emailParam, inquiryIdParam, authLoading, user]);

  // Default to the latest active inquiry on initial login
  useEffect(() => {
    if (autoInquiryRedirectHandledRef.current) return;
    if (allInquiries.length < 2) return;
    if (userSelectedInquiryRef.current) return;
    // A pid in the URL means the user (or a previous redirect) explicitly targeted a
    // specific project — don't override the inquiry that owns that project.
    if (pidParam) {
      autoInquiryRedirectHandledRef.current = true;
      return;
    }

    const preferredStatuses = new Set([
      "Pending",
      "Ongoing Quotation",
      "In Progress",
    ]);
    const preferredInquiry = allInquiries.find((inq) =>
      preferredStatuses.has(inq.status),
    );

    if (!preferredInquiry) {
      autoInquiryRedirectHandledRef.current = true;
      return;
    }

    if (preferredInquiry.id === inquiryIdParam) {
      autoInquiryRedirectHandledRef.current = true;
      return;
    }

    const params = new URLSearchParams();
    if (emailParam) params.set("email", emailParam);
    params.set("inquiryId", preferredInquiry.id);
    autoInquiryRedirectHandledRef.current = true;
    router.replace(`/client/client-info?${params.toString()}`);
  }, [allInquiries, emailParam, inquiryIdParam, pidParam, router]);

  // Corrective redirect: if a pid is in the URL but inquiryId doesn't match the
  // project's actual inquiry (e.g. stale URL), silently fix the URL so the correct
  // inquiry's member/document data is loaded.
  useEffect(() => {
    if (pidInquiryCorrectedRef.current) return;
    if (!pidParam || !emailParam || projects.length === 0) return;

    const targetProject = projects.find((p) => p.pid === pidParam);
    if (!targetProject) return; // not loaded yet — wait for next render

    pidInquiryCorrectedRef.current = true;

    if (targetProject.inquiryId && targetProject.inquiryId !== inquiryIdParam) {
      const params = new URLSearchParams();
      params.set("email", emailParam);
      params.set("inquiryId", targetProject.inquiryId);
      params.set("pid", pidParam);
      userSelectedInquiryRef.current = true;
      autoInquiryRedirectHandledRef.current = true;
      router.replace(`/client/client-info?${params.toString()}`);
    }
  }, [projects, pidParam, inquiryIdParam, emailParam, router]);

  // Auto-init: when a Pending inquiry is first detected, show workspace.
  useEffect(() => {
    if (
      currentInquiry?.status === "Pending" &&
      inquiryIdParam &&
      pendingInitHandledRef.current !== inquiryIdParam
    ) {
      pendingInitHandledRef.current = inquiryIdParam;
      userWantsWorkspaceRef.current = true;
      setSelectedProjectPid(null);
      setProjectDetails(null);
    }
  }, [currentInquiry?.status, inquiryIdParam]);

  // 1.2. Subscribe to Inquiry and Quotations
  useEffect(() => {
    if (!inquiryIdParam) return;

    // Fetch Inquiry details
    const unsubInquiry = subscribeToInquiryById(inquiryIdParam, (inquiry) => {
      setCurrentInquiry(inquiry);
    });

    // Fetch Quotations for this inquiry
    const fetchInquiryQuotations = async () => {
      setLoadingQuotations(true);
      try {
        const docs = await getQuotationsByInquiryId(inquiryIdParam);
        setInquiryQuotations(docs);
      } catch (err) {
        console.error("Error fetching inquiry quotations:", err);
      } finally {
        setLoadingQuotations(false);
      }
    };

    fetchInquiryQuotations();

    return () => {
      unsubInquiry();
    };
  }, [inquiryIdParam]);

  // 1.5. Subscribe to Member Approvals for the selected project
  useEffect(() => {
    if (
      !inquiryIdParam ||
      !selectedProjectPid ||
      selectedProjectPid.startsWith("inquiry-") ||
      projectDetails?.isDraft
    ) {
      setFetchedMemberApprovals([]);
      return;
    }

    const docId = `${inquiryIdParam}_${selectedProjectPid}`;
    const unsub = onSnapshot(
      doc(db, "memberApprovals", docId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setFetchedMemberApprovals(data.members || []);

          // Also sync approval status while we are at it
          if (data.status) {
            setApprovalStatus(data.status);
          }
        } else {
          setFetchedMemberApprovals([]);
        }
      },
      (error) => {
        console.error("Error listening to member approvals:", error);
      },
    );

    return () => unsub();
  }, [inquiryIdParam, selectedProjectPid, projectDetails?.isDraft]);

  // ────────────────────────────────────────────────────────────────
  //  Data merging & processing
  // ────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Combine projects and sort newest first for the sidebar list
    const combinedProjects = [
      ...fetchedDraftProjects,
      ...fetchedApprovedProjects,
      ...fetchedPreviousProjects,
    ];

    const byPid = new Map<string, ProjectDetails>();
    for (const project of combinedProjects) {
      if (!project?.pid) continue;
      const existing = byPid.get(project.pid);
      if (!existing || (existing.isDraft && !project.isDraft)) {
        byPid.set(project.pid, project);
      }
    }

    const toMs = (raw: any): number => {
      if (!raw) return 0;
      const date =
        raw instanceof Date ? raw : raw?.toDate ? raw.toDate() : new Date(raw);
      return isNaN(date.getTime()) ? 0 : date.getTime();
    };

    const getProjectTime = (project: ProjectDetails): number => {
      // Prefer createdAt (when the project was actually created/submitted)
      // so newly created projects always sort to the top.
      const byCreated = toMs(project.createdAt);
      if (byCreated > 0) return byCreated;
      return toMs(project.startDate);
    };

    const allProjects = Array.from(byPid.values()).sort(
      (a, b) => getProjectTime(b) - getProjectTime(a),
    );
    setProjects(allProjects);

    // Determine currently selected project details
    let selectedDetails: ProjectDetails | null = null;

    // 1. Priority to existing state selection (from sidebar click)
    if (selectedProjectPid) {
      selectedDetails =
        allProjects.find((p) => p.pid === selectedProjectPid) || null;
    }

    // 2. Next Priority to PID from URL Param — skip if user explicitly chose an inquiry
    if (!selectedDetails && pidParam && !userWantsWorkspaceRef.current) {
      selectedDetails = allProjects.find((p) => p.pid === pidParam) || null;
    }

    // 3. Next Priority to Current Project Request ID — skip if user explicitly chose an inquiry
    if (
      !selectedDetails &&
      currentProjectRequestId &&
      !userWantsWorkspaceRef.current
    ) {
      selectedDetails =
        allProjects.find(
          (p) =>
            (p as any).originalRequestId === currentProjectRequestId ||
            p.pid === currentProjectRequestId,
        ) || null;
    }

    if (selectedDetails) {
      // Sync project details but avoid infinite loops with deep comparison checks
      if (
        !projectDetails ||
        projectDetails.pid !== selectedDetails.pid ||
        projectDetails.status !== selectedDetails.status
      ) {
        setProjectDetails(selectedDetails);
        // Also expand project docs by default when selecting a project
        setExpandedProjectDocs((prev) => {
          const next = new Set(prev);
          if (selectedDetails) next.add(selectedDetails.pid);
          return next;
        });
      }

      if (selectedProjectPid !== selectedDetails.pid) {
        setSelectedProjectPid(selectedDetails.pid);
      }
    } else if (projectDetails || selectedProjectPid) {
      setProjectDetails(null);
      if (selectedProjectPid) setSelectedProjectPid(null);
    }

    // Process Members
    // 0. Merge base clients (current inquiry) with project-specific clients (previous inquiries)
    //    Deduplicate by doc ID so the same client never appears twice.
    const allApprovedClients = [
      ...fetchedClients,
      ...fetchedSelectedProjectClients.filter(
        (sc: any) => !fetchedClients.some((c: any) => c.id === sc.id),
      ),
    ];

    const approvedEmailsForSelectedProject = new Set(
      allApprovedClients
        .filter((c: any) => {
          if (!c.email || c.email.toLowerCase() === emailParam?.toLowerCase())
            return false;
          if (selectedDetails) {
            const memberPids = Array.isArray(c.pid)
              ? c.pid
              : c.pid
                ? [c.pid]
                : [];
            return memberPids.includes(selectedDetails.pid);
          }
          return true;
        })
        .map((c: any) => c.email.toLowerCase()),
    );

    // 1. Find Primary Member
    let primaryMember: ClientMember | null = null;

    // Log for debugging
    console.log(
      "Merging members logic - clientsLoadedRef:",
      clientsLoadedRef.current,
      "fetchedClients count:",
      fetchedClients.length,
    );

    // Check approved clients FIRST for primary.
    // Try PID-specific match first; fall back to any approved doc with this email
    // so that a PID mismatch (race condition / new project context) never drops
    // a "Complete" member back to Draft.
    const primaryClientDocByPid = allApprovedClients.find((c: any) => {
      const email = c.email?.toLowerCase();
      if (email !== emailParam?.toLowerCase()) return false;
      if (selectedDetails) {
        const memberPids = Array.isArray(c.pid) ? c.pid : c.pid ? [c.pid] : [];
        return memberPids.includes(selectedDetails.pid);
      }
      return true;
    });
    // Email-only fallback: pre-fills the form from an existing client doc but keeps
    // it editable when the current project isn't in their pid array yet (new project context).
    const primaryClientDocByEmail = !primaryClientDocByPid
      ? allApprovedClients.find(
          (c: any) => c.email?.toLowerCase() === emailParam?.toLowerCase(),
        )
      : null;
    const primaryClientDoc = primaryClientDocByPid ?? primaryClientDocByEmail;

    if (primaryClientDoc) {
      console.log(
        "Found primary from approved clients docs:",
        primaryClientDoc.id,
      );
      primaryMember = {
        id: "primary",
        cid: primaryClientDoc.id,
        formData: {
          name: primaryClientDoc.name || "",
          email: primaryClientDoc.email || emailParam || "",
          affiliation: primaryClientDoc.affiliation || "",
          designation: primaryClientDoc.designation || "",
          sex: normalizeSex(primaryClientDoc.sex),
          phoneNumber: primaryClientDoc.phoneNumber || "",
          affiliationAddress: primaryClientDoc.affiliationAddress || "",
        },
        initialData: {
          name: primaryClientDoc.name || "",
          email: primaryClientDoc.email || emailParam || "",
          affiliation: primaryClientDoc.affiliation || "",
          designation: primaryClientDoc.designation || "",
          sex: normalizeSex(primaryClientDoc.sex),
          phoneNumber: primaryClientDoc.phoneNumber || "",
          affiliationAddress: primaryClientDoc.affiliationAddress || "",
        },
        errors: {},
        // PID-specific match: respect haveSubmitted (locked when confirmed).
        // Email-only fallback (new project context): always editable so the
        // client can save their info for this project too.
        isSubmitted: primaryClientDocByPid
          ? !!primaryClientDoc.haveSubmitted
          : false,
        isPrimary: true,
        isDraft: false,
      };
    } else if (clientsLoadedRef.current || fetchedClients.length > 0) {
      // Only check drafts once the clients subscription has fired (even if empty) OR if we already have clients.
      // This prevents briefly showing Draft/empty-sex while fetchedClients is still loading.
      // Prioritize draft for the current project if we have an ID
      const primaryDraftRequest = fetchedClientRequests.find((r) => {
        const emailMatch = r.email.toLowerCase() === emailParam?.toLowerCase();
        if (!emailMatch) return false;

        // If we have current project request ID, match it
        if (
          currentProjectRequestId &&
          r.projectRequestId === currentProjectRequestId
        ) {
          return true;
        }

        // If we have a selected project PID (for approved projects but still in request phase)
        if (selectedProjectPid && r.projectRequestId === selectedProjectPid) {
          return true;
        }

        // Fallback to inquiry match if no specific project link found
        return true;
      });

      if (primaryDraftRequest) {
        console.log(
          "Fallback: Found primary from draft requests:",
          primaryDraftRequest.id,
        );
        primaryMember = {
          id: primaryDraftRequest.id || "primary",
          cid: "draft",
          formData: {
            name: primaryDraftRequest.name || "",
            email: primaryDraftRequest.email || emailParam || "",
            affiliation: primaryDraftRequest.affiliation || "",
            designation: primaryDraftRequest.designation || "",
            sex: normalizeSex(primaryDraftRequest.sex),
            phoneNumber: primaryDraftRequest.phoneNumber || "",
            affiliationAddress: primaryDraftRequest.affiliationAddress || "",
          },
          initialData: {
            name: primaryDraftRequest.name || "",
            email: primaryDraftRequest.email || emailParam || "",
            affiliation: primaryDraftRequest.affiliation || "",
            designation: primaryDraftRequest.designation || "",
            sex: normalizeSex(primaryDraftRequest.sex),
            phoneNumber: primaryDraftRequest.phoneNumber || "",
            affiliationAddress: primaryDraftRequest.affiliationAddress || "",
          },
          errors: {},
          isSubmitted: !!primaryDraftRequest.isValidated,
          isPrimary: true,
          isDraft: true,
          status: primaryDraftRequest.status, // Injecting real status from Firestore
        };
      }
    }

    if (!primaryMember && emailParam && clientsLoadedRef.current) {
      console.log(
        "No primary found after loading clients, creating default pending primary",
      );
      primaryMember = {
        id: "primary",
        cid: "pending",
        formData: {
          name: "",
          email: emailParam,
          affiliation: "",
          designation: "",
          sex: "" as any,
          phoneNumber: "",
          affiliationAddress: "",
        },
        initialData: {
          name: "",
          email: emailParam,
          affiliation: "",
          designation: "",
          sex: "" as any,
          phoneNumber: "",
          affiliationAddress: "",
        },
        errors: {},
        isSubmitted: false,
        isPrimary: true,
      };
    }

    // 2. Process Additional Members
    // 2a. Draft members from ClientRequests (usually for draft projects)
    const additionalDraftMembers: ClientMember[] = fetchedClientRequests
      .filter((r) => {
        const email = r.email?.toLowerCase();
        const name = r.name?.trim();

        // Skip if completely empty and not just added
        if (!email && !name) return false;

        // Approved project view: strict exact projectRequestId match only.
        // Never allow unscoped docs to appear under approved projects.
        if (
          selectedDetails?.pid &&
          !selectedDetails.isDraft &&
          selectedDetails.pid !== "DRAFT"
        ) {
          if (r.projectRequestId !== selectedDetails.pid) return false;
        }

        // Draft context: keep backward compatibility by allowing legacy unscoped docs,
        // but filter out records explicitly scoped to a different draft/project.
        if (selectedDetails?.isDraft && canonicalMemberScopeId) {
          if (
            r.projectRequestId &&
            r.projectRequestId !== canonicalMemberScopeId
          )
            return false;
        }

        return (
          email !== emailParam?.toLowerCase() &&
          (!email || !approvedEmailsForSelectedProject.has(email)) &&
          (r.status === "draft" ||
            r.status === "pending" ||
            r.status === "rejected")
        );
      })
      .map((r, index) => ({
        id: r.id || `draft-member-${index + 1}`,
        cid: "draft",
        formData: {
          name: r.name || "",
          email: r.email?.includes("@temp.pgc") ? "" : r.email || "",
          affiliation: r.affiliation || "",
          designation: r.designation || "",
          sex: normalizeSex(r.sex),
          phoneNumber: r.phoneNumber || "",
          affiliationAddress: r.affiliationAddress || "",
        },
        initialData: {
          name: r.name || "",
          email: r.email?.includes("@temp.pgc") ? "" : r.email || "",
          affiliation: r.affiliation || "",
          designation: r.designation || "",
          sex: normalizeSex(r.sex),
          phoneNumber: r.phoneNumber || "",
          affiliationAddress: r.affiliationAddress || "",
        },
        errors: {},
        isSubmitted: !!r.isValidated,
        isPrimary: false,
        isDraft: true,
      }));

    // 2b. Pending members from MemberApprovals (for existing projects)
    const pendingProjectMembers: ClientMember[] = fetchedMemberApprovals
      .filter((m) => {
        if (m.isPrimary) return false;
        // Also filter out if already approved
        const email = m.formData?.email?.toLowerCase();
        return email && !approvedEmailsForSelectedProject.has(email);
      })
      .map((m, index) => ({
        id: m.tempId || `pending-member-${index + 1}`,
        cid: "pending",
        formData: m.formData || {
          name: "",
          email: "",
          affiliation: "",
          designation: "",
          sex: "" as any,
          phoneNumber: "",
          affiliationAddress: "",
        },
        initialData: { ...(m.formData || {}) },
        errors: {},
        isSubmitted: !!m.isValidated,
        isPrimary: false,
        isDraft: true,
      }));

    // 2c. Approved members from Clients collection
    const approvedMembers: ClientMember[] = allApprovedClients
      .filter((c: any) => {
        if (!c.email || c.email.toLowerCase() === emailParam?.toLowerCase())
          return false;

        // Only show members belonging to the currently selected project
        if (selectedDetails) {
          const memberPids = Array.isArray(c.pid)
            ? c.pid
            : c.pid
              ? [c.pid]
              : [];
          return memberPids.includes(selectedDetails.pid);
        }
        return true;
      })
      .map((data: any, index) => ({
        id: data.id || `member-${index + 1}`,
        cid: data.id,
        formData: {
          name: data.name || "",
          email: data.email || "",
          affiliation: data.affiliation || "",
          designation: data.designation || "",
          sex: normalizeSex(data.sex),
          phoneNumber: data.phoneNumber || "",
          affiliationAddress: data.affiliationAddress || "",
        },
        initialData: {
          name: data.name || "",
          email: data.email || "",
          affiliation: data.affiliation || "",
          designation: data.designation || "",
          sex: normalizeSex(data.sex),
          phoneNumber: data.phoneNumber || "",
          affiliationAddress: data.affiliationAddress || "",
        },
        errors: {},
        isSubmitted: !!data.haveSubmitted,
        isPrimary: false,
        isDraft: false,
      }));

    const allMembers = [
      primaryMember,
      ...additionalDraftMembers,
      ...pendingProjectMembers,
      ...approvedMembers,
    ].filter((m): m is ClientMember => m !== null);

    // Deduplicate by email to prevent "other member double" bug during submission transition
    const seenEmails = new Set<string>();
    const uniqueMembers = allMembers.filter((member) => {
      const email = member.formData?.email?.toLowerCase()?.trim();
      if (!email) return true;
      if (seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    });

    setMembers(uniqueMembers);
    // Don't automatically expand primary member - respect user's saved preference from localStorage
  }, [
    fetchedDraftProjects,
    fetchedApprovedProjects,
    fetchedPreviousProjects,
    fetchedClientRequests,
    fetchedClients,
    fetchedSelectedProjectClients,
    fetchedMemberApprovals,
    allInquiries,
    emailParam,
    currentProjectRequestId,
    pidParam,
    selectedProjectPid,
    canonicalMemberScopeId,
  ]);

  // ────────────────────────────────────────────────────────────────
  //  Approval-status watcher
  // ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!approvalStatusData.status) return;

    setApprovalStatus(approvalStatusData.status);

    if (
      approvalStatusData.status === "approved" &&
      previousApprovalStatus !== "approved" &&
      previousApprovalStatus !== null
    ) {
      setShowApprovalCelebration(true);
      toast.success("✅ Project and team members approved and registered!", {
        duration: 5000,
      });

      setTimeout(() => setShowApprovalCelebration(false), 10000);
    }

    setPreviousApprovalStatus(approvalStatusData.status);
  }, [
    approvalStatusData,
    previousApprovalStatus,
    selectedProjectPid,
    inquiryIdParam,
    emailParam,
  ]);

  // ────────────────────────────────────────────────────────────────
  //  Handlers
  // ────────────────────────────────────────────────────────────────

  const handleAddMember = async () => {
    if (!selectedProjectPid || !inquiryIdParam) {
      toast.error("Please select a project first");
      return;
    }
    if (approvalStatus === "pending") {
      toast.error("Cannot add members while approval is pending");
      return;
    }

    // Check for any unsaved member (Primary must be submitted, Team Drafts must be saved)
    const unsavedMember = members.find(
      (m) =>
        (m.isPrimary && !m.isSubmitted) ||
        (!m.isPrimary &&
          m.isDraft &&
          (m.id.startsWith("draft-") || !m.formData.name || !m.formData.email)),
    );

    if (unsavedMember) {
      toast.error(
        unsavedMember.isPrimary
          ? "Please complete and save your information as Primary Member first before adding new team members."
          : "Please finish and save the member details you just added before adding a new one.",
      );
      setExpandedMembers((prev) => {
        const newSet = new Set([...prev, unsavedMember.id]);
        // Persist when auto-expanding to show validation error
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "expandedMembers",
            JSON.stringify(Array.from(newSet)),
          );
        }
        return newSet;
      });
      return;
    }

    const memberScopeId = getMemberScopeOrToast("add member");
    if (!memberScopeId) return;

    const uniqueDraftId = `draft-${Date.now()}`;
    const dummyEmail = `${uniqueDraftId}@temp.pgc`;

    const newMemberData = {
      inquiryId: inquiryIdParam,
      requestedBy: emailParam || "",
      requestedByName: members.find((m) => m.isPrimary)?.formData.name || "",
      name: "",
      email: dummyEmail,
      affiliation: "",
      designation: "",
      sex: "" as any,
      phoneNumber: "",
      affiliationAddress: "",
      isPrimary: false,
      isValidated: false,
      status: "draft" as const,
      projectRequestId: memberScopeId,
    };

    try {
      const savedDocId = await saveClientRequest(newMemberData);

      const newMember: ClientMember = {
        id: savedDocId,
        cid: "",
        formData: {
          name: "",
          email: "", // UI is empty
          affiliation: "",
          designation: "",
          sex: "" as any,
          phoneNumber: "",
          affiliationAddress: "",
        },
        initialData: {
          name: "",
          email: "",
          affiliation: "",
          designation: "",
          sex: "" as any,
          phoneNumber: "",
          affiliationAddress: "",
        },
        errors: {},
        isSubmitted: false,
        isPrimary: false,
        isDraft: true,
      };

      // Don't auto-expand new members - let user decide when to open them
      // toast.success("New member slot added. Please fill in their details.");

      // UPDATE: Auto-expand ONLY the new member (collapse primary/others)
      setExpandedMembers(() => {
        const next = new Set([savedDocId]);
        // Persist to localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "expandedMembers",
            JSON.stringify(Array.from(next)),
          );
        }
        return next;
      });

      toast.success("New member slot added");
    } catch (error) {
      console.error("Error adding draft member:", error);
      toast.error("Failed to add new member draft");
    }
  };

  const handleRemoveMember = (memberId: string) => {
    if (projectDetails?.status === "Completed") {
      toast.error("Cannot remove members from a completed project");
      return;
    }
    setMemberToDelete(memberId);
    setShowDeleteModal(true);
  };

  const confirmRemoveMember = async () => {
    if (!memberToDelete) return;
    const member = members.find((m) => m.id === memberToDelete);
    if (!member) return;

    try {
      if (!member.isDraft && member.cid) {
        await deleteDoc(doc(db, "clients", member.cid));
      }

      // If it's a draft member, also try to delete from clientRequests collection
      if (
        member.isDraft &&
        member.id &&
        !member.id.startsWith("draft-") &&
        !member.id.startsWith("request-")
      ) {
        await deleteDoc(doc(db, "clientRequests", member.id));
        console.log("Deleted draft member from clientRequests:", member.id);
      }

      const updatedMembers = members.filter((m) => m.id !== memberToDelete);
      setMembers(updatedMembers);

      // Update memberApprovals if draft member removed
      if (
        member.isDraft &&
        selectedProjectPid &&
        inquiryIdParam &&
        selectedProjectPid !== "DRAFT"
      ) {
        const remainingDrafts = updatedMembers.filter(
          (m) => m.isDraft && !m.isPrimary,
        );

        const approvalId = `${inquiryIdParam}_${selectedProjectPid}`;
        if (remainingDrafts.length > 0) {
          await saveMemberApproval({
            inquiryId: inquiryIdParam,
            projectPid: selectedProjectPid,
            projectTitle: projectDetails?.title || "",
            submittedBy: emailParam || "",
            submittedByName:
              members.find((m) => m.isPrimary)?.formData.name || "",
            status:
              approvalStatus === "rejected"
                ? "draft"
                : approvalStatus || "draft",
            members: remainingDrafts.map((m) => ({
              tempId: m.id,
              isPrimary: false,
              isValidated: m.isSubmitted,
              formData: m.formData,
            })),
          });
        } else {
          // If no more drafts for this specific project's approval request, delete the approval record
          await deleteDoc(doc(db, "memberApprovals", approvalId));
        }
      }

      // Collapse deleted member and persist to localStorage
      setExpandedMembers((prev) => {
        const next = new Set(prev);
        next.delete(memberToDelete);
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "expandedMembers",
            JSON.stringify(Array.from(next)),
          );
        }
        return next;
      });

      toast.success(
        member.isDraft
          ? "Draft member removed"
          : "Member removed and deleted from database",
      );
    } catch (error) {
      console.error("Error removing member:", error);
      toast.error("Failed to remove member");
    } finally {
      setShowDeleteModal(false);
      setMemberToDelete(null);
    }
  };

  const handleChange = (
    memberId: string,
    field: keyof ClientFormData,
    value: string,
  ) => {
    setMembers((prev) =>
      prev.map((member) =>
        member.id === memberId
          ? {
              ...member,
              formData: { ...member.formData, [field]: value },
              isSubmitted: false,
              errors: (({ [field]: _removed, ...rest }) => rest)(member.errors),
            }
          : member,
      ),
    );
  };

  const handleSubmitMember = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    const result = clientFormSchema.safeParse(member.formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ClientFormData, string>> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof ClientFormData;
        fieldErrors[field] = err.message;
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId ? { ...m, errors: fieldErrors } : m,
        ),
      );
      toast.error("Please fix validation errors");
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, errors: {} } : m)),
      );
      setPendingMemberId(memberId);
      setShowConfirmModal(true);
    }
  };

  const handleConfirmSave = async () => {
    if (!pendingMemberId) return;
    const member = members.find((m) => m.id === pendingMemberId);
    if (!member) return;

    // Start loading and set as saving to disable the background button
    setSubmitting(true);
    savingDraftIdsRef.current.add(pendingMemberId);
    setActiveSavingId(pendingMemberId);

    try {
      const result = clientFormSchema.safeParse(member.formData);
      if (!result.success) {
        toast.error("Invalid data");
        setSubmitting(false);
        return;
      }

      // Check if this is a draft project
      const isDraftProject =
        projectDetails?.isDraft || projectDetails?.pid === "DRAFT";

      if (isDraftProject && inquiryIdParam) {
        const memberScopeId = getMemberScopeOrToast(
          "save draft project member",
        );
        if (!memberScopeId) return;

        // For draft projects, save ALL members to clientRequests collection
        // Primary member: if an existing clientRequests doc exists (member.id), update it instead of creating a new doc
        let savedId: string;
        if (
          member.isPrimary &&
          pendingMemberId &&
          pendingMemberId !== "primary" &&
          !pendingMemberId.startsWith("draft-") &&
          !pendingMemberId.startsWith("request-")
        ) {
          // Update existing clientRequests document
          const docRef = doc(db, "clientRequests", pendingMemberId);
          await setDoc(
            docRef,
            {
              inquiryId: inquiryIdParam,
              requestedBy: emailParam || "",
              requestedByName:
                members.find((m) => m.isPrimary)?.formData.name ||
                result.data.name,
              name: result.data.name,
              email: result.data.email,
              affiliation: result.data.affiliation,
              designation: result.data.designation,
              sex: result.data.sex,
              phoneNumber: result.data.phoneNumber,
              affiliationAddress: result.data.affiliationAddress,
              isPrimary: member.isPrimary,
              isValidated: true,
              status: "draft",
              projectRequestId: memberScopeId,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
          savedId = pendingMemberId;
        } else {
          // Create or update via saveClientRequest (uses inquiryId + email-based ID)
          savedId = await saveClientRequest({
            inquiryId: inquiryIdParam,
            requestedBy: emailParam || "",
            requestedByName:
              members.find((m) => m.isPrimary)?.formData.name ||
              result.data.name,
            name: result.data.name,
            email: result.data.email,
            affiliation: result.data.affiliation,
            designation: result.data.designation,
            sex: result.data.sex,
            phoneNumber: result.data.phoneNumber,
            affiliationAddress: result.data.affiliationAddress,
            isPrimary: member.isPrimary,
            isValidated: true,
            status: member.isPrimary || isDraftProject ? "draft" : "pending",
            projectRequestId: memberScopeId,
          });

          // Delete old draft if ID changed (e.g. from dummy email to real email)
          if (
            pendingMemberId &&
            pendingMemberId !== savedId &&
            !pendingMemberId.startsWith("draft-") &&
            !pendingMemberId.startsWith("request-")
          ) {
            try {
              await deleteDoc(doc(db, "clientRequests", pendingMemberId));
              console.log("Deleted old member draft record:", pendingMemberId);
            } catch (delError) {
              console.warn(
                "Failed to delete old draft document (might not exist):",
                delError,
              );
            }
          }
        }

        setMembers((prev) =>
          prev.map((m) =>
            m.id === pendingMemberId
              ? {
                  ...m,
                  id: savedId,
                  isSubmitted: true,
                  isDraft: true,
                  cid: "draft",
                  initialData: { ...m.formData },
                }
              : m,
          ),
        );
        toast.success(
          `${member.isPrimary ? "Primary member" : "Team member"} details confirmed and saved successfully.`,
        );
      } else {
        // For approved projects
        if (member.isPrimary) {
          // Primary member: save to clients collection with CID
          let pids: string[] = projects
            .map((p) => p.pid)
            .filter((pid) => pid !== "DRAFT");
          if (pids.length === 0 && pidParam) pids = [pidParam];

          let cidToUse = member.cid;
          if (!cidToUse || cidToUse === "pending" || cidToUse === "draft") {
            // Preserve existing CID if this client already has one from a previous inquiry
            const existingSnap = await getDocs(
              query(
                collection(db, "clients"),
                where("email", "==", result.data.email),
                limit(1),
              ),
            );
            if (!existingSnap.empty) {
              const existingDoc = existingSnap.docs[0];
              cidToUse = existingDoc.data().cid || existingDoc.id;
            } else {
              const year = new Date().getFullYear();
              cidToUse = await getNextCid(year);
            }
          }

          if (!cidToUse)
            throw new Error("Could not generate a valid Client ID");

          await setDoc(
            doc(db, "clients", cidToUse),
            {
              ...result.data,
              cid: cidToUse,
              pid: arrayUnion(...pids),
              inquiryId: inquiryIdParam,
              isContactPerson: true,
              haveSubmitted: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );

          // Update project's clientNames array
          const currentPid = selectedProjectPid || pidParam;
          if (currentPid && currentPid !== "DRAFT") {
            const projectDocRef = doc(db, "projects", currentPid);
            const projectSnap = await getDoc(projectDocRef);
            if (projectSnap.exists()) {
              const clientNames = projectSnap.data().clientNames || [];
              if (!clientNames.includes(result.data.name)) {
                await setDoc(
                  projectDocRef,
                  { clientNames: [...clientNames, result.data.name] },
                  { merge: true },
                );
              }
            }
          }

          setMembers((prev) =>
            prev.map((m) =>
              m.id === pendingMemberId
                ? {
                    ...m,
                    cid: cidToUse,
                    isSubmitted: true,
                    initialData: { ...m.formData },
                  }
                : m,
            ),
          );
          toast.success("Your information saved successfully!");
        } else {
          const memberScopeId = getMemberScopeOrToast(
            "save team member for approved project",
          );
          if (!memberScopeId) return;

          // Other members: save as validated draft in clientRequests (needs admin approval)
          const savedId = await saveClientRequest({
            inquiryId: inquiryIdParam!,
            requestedBy: emailParam || "",
            requestedByName:
              members.find((m) => m.isPrimary)?.formData.name ||
              result.data.name,
            name: result.data.name,
            email: result.data.email,
            affiliation: result.data.affiliation,
            designation: result.data.designation,
            sex: result.data.sex,
            phoneNumber: result.data.phoneNumber,
            affiliationAddress: result.data.affiliationAddress,
            isPrimary: false,
            isValidated: true,
            status: "pending",
            projectRequestId: memberScopeId,
          });

          // Delete old draft if ID changed
          if (
            pendingMemberId &&
            pendingMemberId !== savedId &&
            !pendingMemberId.startsWith("draft-") &&
            !pendingMemberId.startsWith("request-")
          ) {
            try {
              await deleteDoc(doc(db, "clientRequests", pendingMemberId));
              console.log("Deleted old member draft record:", pendingMemberId);
            } catch (delError) {
              console.warn(
                "Failed to delete old draft document (might not exist):",
                delError,
              );
            }
          }

          setMembers((prev) =>
            prev.map((m) =>
              m.id === pendingMemberId
                ? {
                    ...m,
                    id: savedId,
                    isSubmitted: true,
                    isDraft: true,
                    cid: "draft",
                    initialData: { ...m.formData },
                  }
                : m,
            ),
          );
          toast.success(
            "Team member information saved! Submit for admin approval when ready.",
          );
        }
      }
    } catch (error) {
      console.error("Submission error:", error);
      const msg =
        error instanceof Error ? error.message : "Failed to save information";
      toast.error(msg);
    } finally {
      setShowConfirmModal(false);
      setSubmitting(false);
      savingDraftIdsRef.current.delete(pendingMemberId);
      setActiveSavingId(null);
      setPendingMemberId(null);
    }
  };

  const handleSaveDraft = async (memberId: string) => {
    if (savingDraftIdsRef.current.has(memberId)) return;

    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    if (!member.formData.name || !member.formData.email) {
      toast.error("Please provide at least Name and Email to save a draft.");
      return;
    }

    const isChanged =
      JSON.stringify(member.formData) !== JSON.stringify(member.initialData);
    if (!isChanged) {
      toast.info("No changes have been made");
      return;
    }

    savingDraftIdsRef.current.add(memberId);
    setSubmitting(true);
    setActiveSavingId(memberId);

    try {
      const isDraftProject =
        projectDetails?.isDraft || projectDetails?.pid === "DRAFT";

      // ── Primary member on APPROVED project ──────────────────────────
      // Save/update directly in `clients` with haveSubmitted: false so the
      // form remains editable after refresh/re-login.
      if (member.isPrimary && !isDraftProject) {
        let pids: string[] = projects
          .map((p) => p.pid)
          .filter((pid) => pid !== "DRAFT");
        if (pids.length === 0 && pidParam) pids = [pidParam];

        let cidToUse = member.cid;
        if (!cidToUse || cidToUse === "pending" || cidToUse === "draft") {
          const existingSnap = await getDocs(
            query(
              collection(db, "clients"),
              where("email", "==", member.formData.email),
              limit(1),
            ),
          );
          if (!existingSnap.empty) {
            const existingDoc = existingSnap.docs[0];
            cidToUse = existingDoc.data().cid || existingDoc.id;
          } else {
            cidToUse = await getNextCid(new Date().getFullYear());
          }
        }
        if (!cidToUse) throw new Error("Could not generate a valid Client ID");

        await setDoc(
          doc(db, "clients", cidToUse),
          {
            ...member.formData,
            cid: cidToUse,
            pid: arrayUnion(...pids),
            inquiryId: inquiryIdParam,
            isContactPerson: true,
            haveSubmitted: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        setMembers((prev) =>
          prev.map((m) =>
            m.id === memberId
              ? {
                  ...m,
                  cid: cidToUse,
                  isSubmitted: false,
                  initialData: { ...m.formData },
                }
              : m,
          ),
        );
        toast.success(
          "Draft saved. You can continue editing and confirm when ready.",
        );
        return;
      }

      // ── All other cases (clientRequests as draft) ────────────────────
      // Covers: primary on draft project, other members on any project type.
      if (!inquiryIdParam) {
        toast.error("Missing inquiry ID. Please reload the page.");
        return;
      }
      const memberScopeId = getMemberScopeOrToast("save member draft");
      if (!memberScopeId) return;

      let savedId: string;

      // Primary member with an existing doc: update in-place
      if (
        member.isPrimary &&
        memberId &&
        memberId !== "primary" &&
        !memberId.startsWith("draft-") &&
        !memberId.startsWith("request-")
      ) {
        const docRef = doc(db, "clientRequests", memberId);
        await setDoc(
          docRef,
          {
            inquiryId: inquiryIdParam,
            requestedBy: emailParam || "",
            requestedByName:
              members.find((m) => m.isPrimary)?.formData.name ||
              member.formData.name ||
              "",
            name: member.formData.name,
            email: member.formData.email,
            affiliation: member.formData.affiliation,
            designation: member.formData.designation,
            sex: member.formData.sex,
            phoneNumber: member.formData.phoneNumber,
            affiliationAddress: member.formData.affiliationAddress,
            isPrimary: member.isPrimary,
            isValidated: false,
            status: "draft",
            projectRequestId: memberScopeId,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        savedId = memberId;
      } else {
        // Create/update via saveClientRequest (uses inquiryId + email-based ID)
        savedId = await saveClientRequest({
          inquiryId: inquiryIdParam,
          requestedBy: emailParam || "",
          requestedByName:
            members.find((m) => m.isPrimary)?.formData.name ||
            member.formData.name ||
            "",
          name: member.formData.name,
          email: member.formData.email,
          affiliation: member.formData.affiliation,
          designation: member.formData.designation,
          sex: member.formData.sex,
          phoneNumber: member.formData.phoneNumber,
          affiliationAddress: member.formData.affiliationAddress,
          isPrimary: member.isPrimary,
          isValidated: false,
          status: "draft",
          projectRequestId: memberScopeId,
        });

        // Delete stale doc when email changed and document ID shifted
        if (
          memberId &&
          memberId !== savedId &&
          !memberId.startsWith("draft-") &&
          !memberId.startsWith("request-")
        ) {
          try {
            await deleteDoc(doc(db, "clientRequests", memberId));
          } catch (delError) {
            console.warn(
              "Failed to delete old draft (might not exist):",
              delError,
            );
          }
        }
      }

      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? {
                ...m,
                id: savedId,
                isDraft: true,
                cid: "draft",
                isSubmitted: false, // keep form editable after refresh
                initialData: { ...m.formData },
              }
            : m,
        ),
      );
      toast.success(
        "Draft saved. You can continue editing and confirm when ready.",
      );
    } catch (error) {
      console.error("Draft save error:", error);
      toast.error("Failed to save draft");
    } finally {
      savingDraftIdsRef.current.delete(memberId);
      setSubmitting(false);
      setActiveSavingId(null);
    }
  };

  // Called after client confirms the Client Conforme
  const handleConformeConfirm = () => {
    setShowConformeModal(false);
    if (conformePendingAction === "draft") {
      handleSubmitProjectForApproval();
    } else if (conformePendingAction === "team") {
      setShowSubmitForApprovalModal(true);
    }
    setConformePendingAction(null);
  };

  // Helper function to update conforme status
  const updateConformeStatus = async (status: "completed" | "abandoned") => {
    try {
      const conformeId = localStorage.getItem("currentConformeId");
      if (conformeId) {
        const { updateDoc, doc } = await import("firebase/firestore");
        await updateDoc(doc(db, "clientConformes", conformeId), {
          "data.status": status,
          "data.lastUpdated": serverTimestamp(),
          "data.completionTimestamp":
            status === "completed" ? serverTimestamp() : null,
        });
        console.log(`✅ Conforme status updated to: ${status}`);

        // Clear the stored ID after completion
        if (status === "completed") {
          localStorage.removeItem("currentConformeId");
        }
      }
    } catch (error) {
      console.error("Error updating conforme status:", error);
    }
  };

  const handleFinalSubmit = () => {
    // Check if all members are validated
    const unsavedCount = members.filter((m) => !m.isSubmitted).length;
    if (unsavedCount > 0) {
      toast.error(
        `Please finalize and save all ${unsavedCount} member details before submitting for approval`,
      );
      return;
    }

    // Check if this is a draft project
    if (projectDetails?.isDraft) {
      // Validate primary member before showing conforme
      const primaryCheck = members.find((m) => m.isPrimary);
      if (!primaryCheck?.isSubmitted) {
        toast.error(
          "Please complete and save your primary member details first",
        );
        return;
      }
      // Show Client Conforme before proceeding
      setConformePendingAction("draft");
      setShowConformeModal(true);
      return;
    }

    // For approved projects, submit additional team members
    const primary = members.find((m) => m.isPrimary);
    if (primary && !primary.isSubmitted) {
      toast.error("Please complete and save your primary member details first");
      return;
    }

    const draftMembers = members.filter((m) => m.isDraft && !m.isPrimary);
    if (draftMembers.length === 0) {
      toast.error("Please add at least one team member");
      return;
    }

    const allDraftsValidated = draftMembers.every((m) => m.isSubmitted);
    if (!allDraftsValidated) {
      toast.error(
        "Please complete and save all member forms before submitting",
      );
      return;
    }

    // Show Client Conforme before proceeding
    setConformePendingAction("team");
    setShowConformeModal(true);
  };

  const handleConfirmSubmitForApproval = async () => {
    setShowSubmitForApprovalModal(false);
    setSubmitting(true);

    // Show Step 3 progress
    const toastId = toast.loading("🔄 Step 3 of 3: Processing submission...", {
      description: "Submitting team members for administrator review",
      duration: Infinity,
    });

    try {
      if (!selectedProjectPid || !inquiryIdParam) {
        toast.error("Missing project context", { id: toastId });
        return;
      }

      const draftMembers = members.filter((m) => m.isDraft && !m.isPrimary);

      // Update conforme status to completed since submission is proceeding
      await updateConformeStatus("completed");

      // ... rest of the existing function

      await submitForApproval(
        inquiryIdParam,
        selectedProjectPid,
        projectDetails?.title || "",
        emailParam || "",
        members.find((m) => m.isPrimary)?.formData.name || "",
        members
          // Keep primary member context + only pending/draft additions to avoid resubmitting already approved members.
          .filter((m) => m.isPrimary || m.isDraft)
          .map((m) => ({
            tempId: m.id,
            cid: m.cid,
            isPrimary: m.isPrimary,
            isValidated: m.isSubmitted,
            formData: m.formData,
          })),
      );

      setApprovalStatus("pending");
      toast.success(
        "✅ Team members successfully submitted for administrator review",
        { id: toastId, duration: 4000 },
      );
    } catch (error) {
      console.error("Submit for approval error:", error);
      toast.error("Failed to submit for approval", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Project Submission (Project + Primary Member)
  // ────────────────────────────────────────────────────────────────

  const handleSubmitProjectForApproval = async () => {
    // Validate primary member data
    const primaryMember = members.find((m) => m.isPrimary);
    if (!primaryMember) {
      toast.error("Primary member not found");
      return;
    }

    if (!primaryMember.isSubmitted) {
      toast.error("Please complete and save your primary member details first");
      return;
    }

    const result = clientFormSchema.safeParse(primaryMember.formData);
    if (!result.success) {
      toast.error("Please complete all required fields for the primary member");
      const fieldErrors: Partial<Record<keyof ClientFormData, string>> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof ClientFormData;
        fieldErrors[field] = err.message;
      });
      setMembers((prev) =>
        prev.map((m) => (m.isPrimary ? { ...m, errors: fieldErrors } : m)),
      );
      return;
    }

    // If projectRequest was cleared by a prior navigation to a non-draft project,
    // restore it from the draft project details before checking.
    let resolvedProjectRequest = projectRequest;
    if (!resolvedProjectRequest && canonicalMemberScopeId) {
      try {
        resolvedProjectRequest = await getProjectRequestById(
          canonicalMemberScopeId,
        );
        if (resolvedProjectRequest) setProjectRequest(resolvedProjectRequest);
      } catch {
        // ignore — handled by the null check below
      }
    }

    if (!resolvedProjectRequest) {
      toast.error("No draft project found");
      return;
    }

    setShowSubmitProjectModal(true);
  };

  const handleConfirmSubmitProject = async () => {
    setShowSubmitProjectModal(false);
    setSubmitting(true);

    // Show Step 3 progress
    const toastId = toast.loading("🔄 Step 3 of 3: Processing submission...", {
      description:
        "Submitting project and primary member for administrator review",
      duration: Infinity,
    });

    try {
      if (!inquiryIdParam || !emailParam || !projectRequest) {
        toast.error("Missing required information", { id: toastId });
        return;
      }

      // Update conforme status to completed since submission is proceeding
      await updateConformeStatus("completed");

      const primaryMember = members.find((m) => m.isPrimary);
      if (!primaryMember) {
        toast.error("Primary member not found", { id: toastId });
        return;
      }

      console.log("Submitting project for approval:", {
        inquiryId: inquiryIdParam,
        email: emailParam,
        title: projectRequest.title,
      });

      // Submit all client requests for approval (both primary and team members)
      await submitClientRequestsForApproval(inquiryIdParam);
      console.log("Client requests submitted for approval");

      // Submit project for approval (without primary member in project data since it's now in clientRequests)
      await submitProjectForApproval(
        inquiryIdParam,
        emailParam,
        primaryMember.formData.name || emailParam,
        {
          title: projectRequest.title,
          projectLead: projectRequest.projectLead,
          startDate: projectRequest.startDate.toDate(),
          sendingInstitution: projectRequest.sendingInstitution,
          fundingInstitution: projectRequest.fundingInstitution,
        },
        primaryMember.formData,
      );
      console.log("Project request submitted for approval");

      toast.success(
        "✅ Project and team members successfully submitted for administrator review",
        { id: toastId, duration: 4000 },
      );

      // Update local state to reflect pending status
      setProjectDetails((prev) =>
        prev ? { ...prev, status: "Pending Approval", isDraft: false } : prev,
      );

      // Update approval status to pending
      setApprovalStatus("pending");

      // Update all members to show pending status
      setMembers((prev) =>
        prev.map((m) => ({
          ...m,
          isSubmitted: true,
          isDraft: false,
          cid: m.cid === "draft" ? "pending" : m.cid,
        })),
      );

      // Refresh project request to get updated status
      if (currentProjectRequestId) {
        const updatedProjectRequest = await getProjectRequestById(
          currentProjectRequestId,
        );
        if (updatedProjectRequest) {
          setProjectRequest(updatedProjectRequest);
        }
      }
    } catch (error) {
      console.error("Submit project error:", error);
      toast.error("Failed to submit project for approval", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEditProjectInfo = () => {
    if (!projectDetails) return;
    let dateStr = "";
    try {
      const d =
        projectDetails.startDate instanceof Date
          ? projectDetails.startDate
          : new Date(projectDetails.startDate as string);
      if (!isNaN(d.getTime())) dateStr = format(d, "yyyy-MM-dd");
    } catch {
      /* ignore */
    }
    setProjectInfoForm({
      title: projectDetails.title || "",
      lead: projectDetails.lead || "",
      startDate: dateStr,
      sendingInstitution: projectDetails.sendingInstitution || "",
      fundingInstitution: projectDetails.fundingInstitution || "",
    });
    setIsProjectInfoEditing(true);
  };

  const handleSaveProjectInfo = async () => {
    if (!projectDetails || !user) return;
    setIsSavingProjectInfo(true);
    try {
      const docRef = doc(db, "projectRequests", projectDetails.inquiryId);
      const startDateTimestamp = projectInfoForm.startDate
        ? Timestamp.fromDate(new Date(projectInfoForm.startDate))
        : (projectRequest?.startDate ?? Timestamp.now());
      await updateDoc(docRef, {
        title: projectInfoForm.title.trim(),
        projectLead: projectInfoForm.lead.trim(),
        startDate: startDateTimestamp,
        sendingInstitution: projectInfoForm.sendingInstitution,
        fundingInstitution: projectInfoForm.fundingInstitution.trim(),
        // Reset rejected projects back to draft so they can be resubmitted
        status:
          projectRequest?.status === "rejected"
            ? "draft"
            : (projectRequest?.status ?? "draft"),
        updatedAt: serverTimestamp(),
      });
      toast.success("Project information saved.");
      setIsProjectInfoEditing(false);
      // Optimistically update local state so the card reflects changes immediately
      // without waiting for the Firestore subscription to propagate.
      const newStartDate = projectInfoForm.startDate
        ? new Date(projectInfoForm.startDate)
        : projectDetails.startDate instanceof Date
          ? projectDetails.startDate
          : new Date(projectDetails.startDate as string);
      setProjectDetails((prev) =>
        prev
          ? {
              ...prev,
              title: projectInfoForm.title.trim(),
              lead: projectInfoForm.lead.trim(),
              startDate: newStartDate,
              sendingInstitution: projectInfoForm.sendingInstitution,
              fundingInstitution: projectInfoForm.fundingInstitution.trim(),
            }
          : prev,
      );
      setProjects((prev) =>
        prev.map((p) =>
          p.inquiryId === projectDetails.inquiryId
            ? {
                ...p,
                title: projectInfoForm.title.trim(),
                lead: projectInfoForm.lead.trim(),
                startDate: newStartDate,
                sendingInstitution: projectInfoForm.sendingInstitution,
                fundingInstitution: projectInfoForm.fundingInstitution.trim(),
              }
            : p,
        ),
      );
    } catch (err) {
      console.error("Failed to save project info:", err);
      toast.error("Failed to save project information.");
    } finally {
      setIsSavingProjectInfo(false);
    }
  };

  const handleSelectProject = (project: ProjectDetails) => {
    if (!emailParam || !inquiryIdParam) {
      toast.error("Missing required parameters.");
      return;
    }

    if (!project) {
      toast.error("Invalid project selected.");
      return;
    }

    console.log("Selecting project:", project.pid);

    // User explicitly picked a project — clear the workspace lock
    userWantsWorkspaceRef.current = false;

    // Simply update selection state - the useEffect will handle merging all state
    setSelectedProjectPid(project.pid || "");
    setProjectDetails(project);

    // Reset secondary states that are project-specific
    // projectRequest and approvalStatus will be updated by their respective effects/subscriptions
    if (!project.isDraft) {
      setProjectRequest(null);
    } else {
      // Switching back to a draft project: the Firestore subscription won't re-fire
      // unless the document actually changes, so projectRequest may still be null
      // from a previous navigation to a non-draft project. Restore it eagerly.
      const draftRequestId = (project as any).originalRequestId || project.pid;
      if (draftRequestId && draftRequestId !== "DRAFT") {
        getProjectRequestById(draftRequestId)
          .then((req) => {
            if (req) setProjectRequest(req);
          })
          .catch((err) => {
            console.warn("Could not restore draft project request:", err);
          });
      }
    }

    // Preserve current expanded members state - don't force primary to expand
    // setExpandedMembers(new Set(["primary"])); // Removed - let user control expansion state

    // Close mobile sidebar if open
    setMobileSidebarOpen(false);

    // If this project belongs to a different inquiry, update the URL so the
    // correct inquiry is selected in "My Inquiries" and all data re-scopes.
    const projectInquiryId = project.inquiryId;
    if (projectInquiryId && projectInquiryId !== inquiryIdParam) {
      userSelectedInquiryRef.current = true;
      const params = new URLSearchParams();
      if (emailParam) params.set("email", emailParam);
      params.set("inquiryId", projectInquiryId);
      if (project.pid) params.set("pid", project.pid);
      router.replace(`/client/client-info?${params.toString()}`);
    }
  };

  const handleCreateNewProject = () => {
    if (!emailParam || !inquiryIdParam) {
      toast.error("Missing required parameters to create a new project.");
      return;
    }

    const params = new URLSearchParams({
      email: emailParam,
      inquiryId: inquiryIdParam,
      new: "true",
    });
    router.push(`/client/project-info?${params.toString()}`);
  };

  const handleProceedWithService = (quotationRef: string) => {
    setSelectedQuotationRef(quotationRef);
    setShowProceedModal(true);
  };

  const handleConfirmProceedWithService = () => {
    setShowProceedModal(false);
    if (!emailParam || !inquiryIdParam || !selectedQuotationRef) {
      toast.error("Missing required parameters to proceed.");
      return;
    }

    // Store the selected quotation reference in sessionStorage for later status update
    sessionStorage.setItem("selectedQuotationRef", selectedQuotationRef);

    const params = new URLSearchParams({
      email: emailParam,
      inquiryId: inquiryIdParam,
      quotationRef: selectedQuotationRef,
      new: "true",
    });
    router.push(`/client/project-info?${params.toString()}`);
  };

  const handleConfirmCancelInquiry = async () => {
    if (!inquiryIdParam) {
      toast.error("Missing inquiry ID.");
      return;
    }

    setCancelInquirySubmitting(true);
    try {
      const trimmedReason = cancelInquiryReason.trim();
      await cancelInquiryByClient(
        inquiryIdParam,
        trimmedReason.length > 0 ? trimmedReason : null,
      );
      toast.success("Request updated to Quotation Only.");
      setShowCancelInquiryModal(false);
      setCancelInquiryReason("");
    } catch (error) {
      console.error("Failed to update inquiry status:", error);
      toast.error("Failed to update the request. Please try again.");
    } finally {
      setCancelInquirySubmitting(false);
    }
  };

  const loadProjectDocuments = useCallback(
    async (project: ProjectDetails) => {
      const pid = project.pid;
      if (!pid || projectDocuments.has(pid)) return;

      setProjectDocuments((prev) =>
        new Map(prev).set(pid, {
          quotations: [],
          chargeSlips: [],
          sampleForms: [],
          serviceReports: [],
          officialReceipts: [],
          formSubmissions: 0,
          loading: true,
        }),
      );

      try {
        const quotations = await getQuotationsByInquiryId(project.inquiryId);

        const chargeSlips =
          project.pid !== "DRAFT" && !project.pid.startsWith("PENDING-")
            ? await getChargeSlipsByProjectId(project.pid)
            : [];

        const sampleForms =
          portalFeatures.sampleForms &&
          project.pid !== "DRAFT" &&
          !project.pid.startsWith("PENDING-")
            ? await getSampleFormsByProjectId(project.pid)
            : [];

        const formSubmissionsSnapshot =
          project.pid &&
          project.pid !== "DRAFT" &&
          !project.pid.startsWith("PENDING-")
            ? await getDocs(
                query(
                  collection(db, "clientFormSubmissions"),
                  where("projectId", "==", project.pid),
                ),
              )
            : null;
        const formSubmissions = formSubmissionsSnapshot
          ? formSubmissionsSnapshot.size
          : 0;

        let officialReceipts: any[] = [];
        if (portalFeatures.officialReceipts) {
          try {
            if (
              project.pid &&
              project.pid !== "DRAFT" &&
              !project.pid.startsWith("PENDING-")
            ) {
              const receiptsSnapshot = await getDocs(
                collection(db, "projects", project.pid, "officialReceipts"),
              );
              officialReceipts = receiptsSnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }));
            }
          } catch (fetchReceiptError) {
            console.warn(
              `Failed to load official receipts for project ${project.pid}:`,
              fetchReceiptError,
            );
            officialReceipts = [];
          }
        }

        const serviceReports =
          portalFeatures.serviceReports &&
          project.pid !== "DRAFT" &&
          !project.pid.startsWith("PENDING-")
            ? await getServiceReportsByProjectId(project.pid).catch(() => [])
            : [];

        setProjectDocuments((prev) =>
          new Map(prev).set(pid, {
            quotations,
            chargeSlips,
            sampleForms,
            serviceReports,
            officialReceipts,
            formSubmissions,
            loading: false,
          }),
        );
      } catch (error) {
        console.error("Error fetching project documents:", error);
        toast.error("Failed to load documents");
        setProjectDocuments((prev) =>
          new Map(prev).set(pid, {
            quotations: [],
            chargeSlips: [],
            sampleForms: [],
            serviceReports: [],
            officialReceipts: [],
            formSubmissions: 0,
            loading: false,
          }),
        );
      }
    },
    [
      portalFeatures.officialReceipts,
      portalFeatures.sampleForms,
      projectDocuments,
    ],
  );

  // Real-time charge slip listener for all expanded projects
  // When a charge slip's status changes (e.g. "pending" after OR upload), the UI updates instantly
  useEffect(() => {
    const expandedPids = [...expandedProjectDocs].filter(
      (pid) => pid && pid !== "DRAFT" && !pid.startsWith("PENDING-"),
    );
    if (expandedPids.length === 0) return;

    const unsubscribers = expandedPids.map((pid) => {
      const q = query(
        collection(db, "chargeSlips"),
        where("projectId", "==", pid),
      );
      return onSnapshot(q, (snapshot) => {
        const chargeSlips = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as ChargeSlipRecord,
        );
        setProjectDocuments((prev) => {
          const existing = prev.get(pid);
          if (!existing || existing.loading) return prev;
          return new Map(prev).set(pid, { ...existing, chargeSlips });
        });
      });
    });

    return () => unsubscribers.forEach((u) => u());
  }, [expandedProjectDocs]);

  // Notification-only charge slip listener — subscribes to ALL project pids
  // so the sidebar red dot appears even before the user expands/opens that project
  useEffect(() => {
    const pids = projects
      .map((p) => p.pid)
      .filter(
        (pid): pid is string =>
          !!pid && pid !== "DRAFT" && !pid.startsWith("PENDING-"),
      );
    if (pids.length === 0) return;

    const unsubscribers = pids.map((pid) => {
      const q = query(
        collection(db, "chargeSlips"),
        where("projectId", "==", pid),
      );
      return onSnapshot(q, (snapshot) => {
        const slips = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as ChargeSlipRecord,
        );
        setNotifChargeSlips((prev) => {
          const next = new Map(prev);
          next.set(pid, slips);
          return next;
        });
      });
    });

    return () => unsubscribers.forEach((u) => u());
  }, [projects]);

  // Real-time service report listener — updates sidebar notification badge live
  useEffect(() => {
    const expandedPids = [...expandedProjectDocs].filter(
      (pid) => pid && pid !== "DRAFT" && !pid.startsWith("PENDING-"),
    );
    if (expandedPids.length === 0) return;

    const unsubscribers = expandedPids.map((pid) => {
      const q = query(collection(db, "projects", pid, "serviceReports"));
      return onSnapshot(q, (snapshot) => {
        const serviceReports = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setProjectDocuments((prev) => {
          const existing = prev.get(pid);
          if (!existing || existing.loading) return prev;
          return new Map(prev).set(pid, { ...existing, serviceReports });
        });
      });
    });

    return () => unsubscribers.forEach((u) => u());
  }, [expandedProjectDocs]);

  const handleReceiveServiceReport = useCallback(
    async (pid: string, report: any) => {
      const reportKey = `${pid}:${report.id}`;
      setReceivingReportId(reportKey);
      try {
        await markServiceReportReceived(
          pid,
          report.id,
          user?.email || "",
          user?.displayName || user?.email || "Client",
        );
        setProjectDocuments((prev) => {
          const next = new Map(prev);
          const existing = next.get(pid);
          if (existing) {
            next.set(pid, {
              ...existing,
              serviceReports: existing.serviceReports.map((r: any) =>
                r.id === report.id
                  ? {
                      ...r,
                      status: "received",
                      receivedAt: { toDate: () => new Date() },
                    }
                  : r,
              ),
            });
          }
          return next;
        });
        toast.success(`"${report.fileName}" marked as received.`);

        // Auto-open PDF in new tab
        if (report.fileUrl) {
          window.open(report.fileUrl, "_blank", "noopener,noreferrer");
        }
      } catch (err) {
        console.error("Failed to mark service report as received:", err);
        toast.error("Failed to mark as received. Please try again.");
      } finally {
        setReceivingReportId(null);
      }
    },
    [user],
  );

  const toggleProjectDocs = async (project: ProjectDetails) => {
    const pid = project.pid;
    const isExpanding = !expandedProjectDocs.has(pid);

    setExpandedProjectDocs((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        next.add(pid);
      }
      return next;
    });

    // Fetch documents if expanding and not already loaded
    if (isExpanding) {
      await loadProjectDocuments(project);
    }
  };

  useEffect(() => {
    if (!projectDetails?.pid) return;
    if (
      projectDetails.pid === "DRAFT" ||
      projectDetails.pid.startsWith("PENDING-")
    )
      return;
    if (!projectDocuments.has(projectDetails.pid)) {
      loadProjectDocuments(projectDetails);
    }
  }, [projectDetails?.pid, projectDocuments, loadProjectDocuments]);

  // ────────────────────────────────────────────────────────────────
  //  Helpers
  // ────────────────────────────────────────────────────────────────

  const getMemberStatus = (member: ClientMember) => {
    // 1. Explicit Firestore status from member model (set during merging)
    if (member.status === "pending" || member.status === "Pending Approval") {
      return {
        label: "Pending Approval",
        color: "bg-blue-500",
      };
    }

    // 2. Global project or specific approval status
    if (
      (projectDetails?.status === "Pending Approval" ||
        approvalStatus === "pending") &&
      member.isDraft
    ) {
      return {
        label: "Pending Approval",
        color: "bg-blue-500",
      };
    }

    if (member.isDraft && approvalStatus === "pending")
      return {
        label: "Pending Approval",
        color: "bg-orange-500",
      };
    if (member.isDraft && approvalStatus === "rejected")
      return { label: "Rejected", color: "bg-red-500" };
    if (member.isSubmitted)
      return {
        label: member.isDraft ? "Ready" : "Complete",
        color: member.isDraft ? "bg-blue-500" : "bg-green-500",
      };
    if (Object.values(member.errors).some(Boolean))
      return { label: "Needs Attention", color: "bg-red-500" };
    return { label: "Draft", color: "bg-yellow-500" };
  };

  const toggleMemberExpand = (memberId: string) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      // Persist to localStorage so state is remembered across page refreshes
      if (typeof window !== "undefined") {
        console.log(
          "Saving expanded members to localStorage:",
          Array.from(next),
        );
        localStorage.setItem(
          "expandedMembers",
          JSON.stringify(Array.from(next)),
        );
      }
      return next;
    });
  };

  const formatDate = (date: Date | string) => {
    try {
      if (!date) return "—";
      const d = typeof date === "string" ? new Date(date) : date;
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const statusColors: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-700 border-slate-200",
    "Pending Approval": "bg-blue-600 text-white shadow-sm",
    Rejected: "bg-red-100 text-red-700 border-red-200",
    Pending: "bg-blue-100 text-blue-700 border-blue-200",
    Ongoing: "bg-green-100 text-green-700 border-green-200",
    Completed: "bg-gray-100 text-gray-700 border-gray-200",
    Cancelled: "bg-red-100 text-red-700 border-red-200",
  };

  const timelineSteps = useMemo(() => {
    const docs = selectedProjectPid
      ? projectDocuments.get(selectedProjectPid)
      : undefined;
    const hasInquiry = !!currentInquiry;
    const hasQuotation = inquiryQuotations.length > 0;
    const isApprovalComplete =
      approvalStatus === "approved" ||
      projectDetails?.status === "Ongoing" ||
      projectDetails?.status === "Completed";
    const isApprovalPending =
      approvalStatus === "pending" ||
      projectDetails?.status === "Pending Approval";
    const hasChargeSlip = (docs?.chargeSlips?.length ?? 0) > 0;
    const hasSampleForms = (docs?.sampleForms?.length ?? 0) > 0;
    const hasOfficialReceipts = (docs?.officialReceipts?.length ?? 0) > 0;
    const hasServiceReports = (docs?.serviceReports?.length ?? 0) > 0;

    const steps = [
      {
        key: "inquiry",
        label: "Inquiry Submission",
        complete: hasInquiry,
        detail: currentInquiry?.createdAt
          ? `Submitted ${formatDate(currentInquiry.createdAt)}`
          : "Submitted",
      },
      {
        key: "quotation",
        label: "Quotation",
        complete: hasQuotation,
        detail: hasQuotation
          ? `${inquiryQuotations.length} quotation${inquiryQuotations.length > 1 ? "s" : ""} issued`
          : "Awaiting quotation",
      },
      {
        key: "approval",
        label: "Project and Member Approval",
        complete: isApprovalComplete,
        inProgress: isApprovalPending,
        detail: isApprovalComplete
          ? "Approved"
          : isApprovalPending
            ? "Under review"
            : "Not submitted",
      },
      {
        key: "charge-slip",
        label: "Charge Slip",
        complete: hasChargeSlip,
        detail: hasChargeSlip
          ? `${docs?.chargeSlips?.length ?? 0} issued`
          : "Not issued yet",
      },
      portalFeatures.sampleForms
        ? {
            key: "sample-forms",
            label: "Sample Forms",
            complete: hasSampleForms,
            detail: hasSampleForms
              ? `${docs?.sampleForms?.length ?? 0} submitted`
              : "Awaiting sample form submission",
          }
        : null,
      portalFeatures.officialReceipts
        ? {
            key: "official-receipt",
            label: "Official Receipt",
            complete: hasOfficialReceipts,
            detail: hasOfficialReceipts
              ? `${docs?.officialReceipts?.length ?? 0} uploaded`
              : "Awaiting official receipt",
          }
        : null,
      portalFeatures.serviceReports
        ? {
            key: "service-report",
            label: "Service Report",
            complete: hasServiceReports,
            detail: hasServiceReports
              ? `${docs?.serviceReports?.length ?? 0} released`
              : "Pending service report",
          }
        : null,
    ].filter(Boolean) as Array<{
      key: string;
      label: string;
      complete: boolean;
      inProgress?: boolean;
      detail: string;
    }>;

    const firstIncompleteIndex = steps.findIndex((step) => !step.complete);

    return steps.map((step, index) => ({
      ...step,
      state: step.complete
        ? "complete"
        : step.inProgress || index === firstIncompleteIndex
          ? "current"
          : "upcoming",
    }));
  }, [
    approvalStatus,
    currentInquiry,
    inquiryQuotations,
    portalFeatures.officialReceipts,
    portalFeatures.sampleForms,
    portalFeatures.serviceReports,
    projectDetails?.status,
    projectDocuments,
    selectedProjectPid,
  ]);

  // ────────────────────────────────────────────────────────────────
  //  Early returns (loading / error)
  // ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50/50 to-blue-50/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#166FB5] mb-2" />
          <p className="text-slate-600">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (!emailParam || !inquiryIdParam) return null;

  if (!loading && members.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50/50 to-blue-50/30 p-6">
        <div className="max-w-md bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">
            Unable to Load Portal
          </h2>
          <p className="text-slate-600 mb-4">
            Failed to initialize. Please check browser console.
          </p>
          <Button
            onClick={() => router.push("/portal")}
            className="bg-[#166FB5] hover:bg-[#166FB5]/90"
          >
            Return to Verification
          </Button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────
  //  Render helpers
  // ────────────────────────────────────────────────────────────────

  const primaryMember = members.find((m) => m.isPrimary);
  const otherMembers = members.filter((m) => !m.isPrimary);

  /** Renders the full member form (used inside expandable cards) */
  const renderMemberForm = (member: ClientMember) => {
    const isProjectLocked =
      projectDetails?.status === "Completed" ||
      projectDetails?.status === "Pending Approval";
    const isFormLocked = member.isSubmitted || isProjectLocked;

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmitMember(member.id);
        }}
        className="space-y-4 pt-3"
      >
        {/* ── Lock banner ── */}
        {member.isSubmitted && (
          <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-green-600 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-xs font-medium text-green-700">
              Information confirmed and locked. Contact the administrator if you
              need to make changes.
            </p>
          </div>
        )}

        {/* ── All form fields wrapped in a fieldset so the browser natively disables every input/button inside ── */}
        <fieldset disabled={isFormLocked} className="contents">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div className="md:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 mb-1 block">
                Full Name <span className="text-[#B9273A]">*</span>
              </Label>
              <Input
                value={member.formData.name}
                onChange={(e) =>
                  handleChange(member.id, "name", e.target.value)
                }
                placeholder="Enter full name"
                disabled={
                  (!member.isDraft && member.isSubmitted) ||
                  projectDetails?.status === "Completed" ||
                  projectDetails?.status === "Pending Approval"
                }
                className="bg-white border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-10 disabled:opacity-70"
              />
              {member.errors.name && (
                <p className="text-[#B9273A] text-xs mt-1">
                  {member.errors.name}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="md:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 mb-1 block">
                Email Address <span className="text-[#B9273A]">*</span>
                {member.isPrimary && (
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    (Verified)
                  </span>
                )}
              </Label>
              <Input
                value={member.formData.email}
                onChange={(e) =>
                  handleChange(member.id, "email", e.target.value)
                }
                placeholder={
                  member.isPrimary
                    ? "Your verified email"
                    : "Enter team member email"
                }
                disabled={
                  member.isPrimary ||
                  (!member.isDraft && member.isSubmitted) ||
                  projectDetails?.status === "Completed" ||
                  projectDetails?.status === "Pending Approval"
                }
                className="bg-white border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-10 disabled:bg-slate-50 disabled:opacity-70"
              />
              {member.errors.email && (
                <p className="text-[#B9273A] text-xs mt-1">
                  {member.errors.email}
                </p>
              )}
            </div>

            {/* Affiliation */}
            <div className="md:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 mb-1 block">
                Affiliation (Department & Institution){" "}
                <span className="text-[#B9273A]">*</span>
              </Label>
              <Input
                value={member.formData.affiliation}
                onChange={(e) =>
                  handleChange(member.id, "affiliation", e.target.value)
                }
                placeholder="e.g. Division of Biological Sciences - UPV CAS"
                disabled={
                  (!member.isDraft && member.isSubmitted) ||
                  projectDetails?.status === "Completed" ||
                  projectDetails?.status === "Pending Approval"
                }
                className="bg-white border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-10 disabled:opacity-70"
              />
              {member.errors.affiliation && (
                <p className="text-[#B9273A] text-xs mt-1">
                  {member.errors.affiliation}
                </p>
              )}
            </div>

            {/* Designation */}
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-1 block">
                Designation <span className="text-[#B9273A]">*</span>
              </Label>
              <Input
                value={member.formData.designation}
                onChange={(e) =>
                  handleChange(member.id, "designation", e.target.value)
                }
                placeholder="e.g. Research Assistant, Professor"
                disabled={
                  (!member.isDraft && member.isSubmitted) ||
                  projectDetails?.status === "Completed" ||
                  projectDetails?.status === "Pending Approval"
                }
                className="bg-white border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-10 disabled:opacity-70"
              />
              {member.errors.designation && (
                <p className="text-[#B9273A] text-xs mt-1">
                  {member.errors.designation}
                </p>
              )}
            </div>

            {/* Sex */}
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-1 block">
                Assigned sex at birth <span className="text-[#B9273A]">*</span>
              </Label>
              <Select
                value={member.formData.sex}
                onValueChange={(val) => handleChange(member.id, "sex", val)}
                disabled={
                  (!member.isDraft && member.isSubmitted) ||
                  projectDetails?.status === "Completed" ||
                  projectDetails?.status === "Pending Approval"
                }
              >
                <SelectTrigger className="bg-white border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-10 disabled:opacity-70">
                  <SelectValue placeholder="Select Sex at Birth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Male</SelectItem>
                  <SelectItem value="F">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {member.errors.sex && (
                <p className="text-xs text-red-500 mt-1">{member.errors.sex}</p>
              )}
            </div>

            {/* Phone Number */}
            <div className="md:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 mb-1 block">
                Mobile Number <span className="text-[#B9273A]">*</span>
              </Label>
              <Input
                value={member.formData.phoneNumber}
                onChange={(e) =>
                  handleChange(member.id, "phoneNumber", e.target.value)
                }
                placeholder="e.g. 09091234567"
                disabled={
                  (!member.isDraft && member.isSubmitted) ||
                  projectDetails?.status === "Completed" ||
                  projectDetails?.status === "Pending Approval"
                }
                className="bg-white border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-10 disabled:opacity-70"
              />
              {member.errors.phoneNumber && (
                <p className="text-[#B9273A] text-xs mt-1">
                  {member.errors.phoneNumber}
                </p>
              )}
            </div>

            {/* Affiliation Address */}
            <div className="md:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 mb-1 block">
                Affiliation Address <span className="text-[#B9273A]">*</span>
              </Label>
              <Textarea
                value={member.formData.affiliationAddress}
                onChange={(e) =>
                  handleChange(member.id, "affiliationAddress", e.target.value)
                }
                placeholder="Enter complete address of your institution/organization"
                disabled={
                  (!member.isDraft && member.isSubmitted) ||
                  projectDetails?.status === "Completed" ||
                  projectDetails?.status === "Pending Approval"
                }
                className="bg-white border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 min-h-[80px] resize-none disabled:opacity-70"
              />
              {member.errors.affiliationAddress && (
                <p className="text-[#B9273A] text-xs mt-1">
                  {member.errors.affiliationAddress}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-3 border-t border-slate-100">
            <Button
              type="button"
              onClick={() => handleSaveDraft(member.id)}
              disabled={
                activeSavingId === member.id ||
                submitting ||
                projectDetails?.status === "Completed" ||
                projectDetails?.status === "Pending Approval"
              }
              variant="outline"
              className="h-10 px-6 border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-50"
            >
              {activeSavingId === member.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </>
              )}
            </Button>
            <Button
              type="submit"
              disabled={
                (!member.isDraft && member.isSubmitted) ||
                submitting ||
                projectDetails?.status === "Completed" ||
                projectDetails?.status === "Pending Approval"
              }
              className="h-10 px-6 bg-gradient-to-r from-[#166FB5] to-[#4038AF] hover:from-[#166FB5]/90 hover:to-[#4038AF]/90 text-white font-semibold shadow-md disabled:opacity-50"
            >
              {member.isSubmitted ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Saved
                </>
              ) : submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                `${member.isPrimary ? "Save & Confirm My Details" : "Save & Confirm Member Details"}`
              )}
            </Button>
          </div>
        </fieldset>
      </form>
    );
  };

  /** Renders a single member card (expandable) */
  const renderMemberCard = (member: ClientMember) => {
    const status = getMemberStatus(member);
    const isExpanded = expandedMembers.has(member.id);

    return (
      <Card
        key={member.id}
        className={cn(
          "border transition-all duration-200",
          isExpanded ? "shadow-md border-slate-200" : "hover:shadow-sm",
        )}
      >
        {/* Card Header – always visible */}
        <button
          type="button"
          onClick={() => toggleMemberExpand(member.id)}
          className="w-full flex items-center justify-between p-3 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className={cn(
                "p-1.5 rounded-lg flex-shrink-0",
                member.isPrimary ? "bg-[#166FB5]/10" : "bg-slate-100",
              )}
            >
              <User
                className={cn(
                  "h-3.5 w-3.5",
                  member.isPrimary ? "text-[#166FB5]" : "text-slate-500",
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-slate-800 truncate">
                  {member.formData.name ||
                    (member.isPrimary ? "Primary Member" : "Unnamed Member")}
                </span>
                {member.isPrimary && (
                  <Badge className="bg-[#166FB5]/10 text-[#166FB5] border-[#166FB5]/20 text-[10px] h-5 px-1.5">
                    Primary
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {member.cid &&
                  member.cid !== "pending" &&
                  member.cid !== "draft" && (
                    <span className="text-[11px] font-mono text-[#166FB5]/70 bg-blue-50/50 px-1.5 rounded border border-blue-100/30">
                      Client ID: {member.cid}
                    </span>
                  )}
                {member.formData.email && (
                  <span className="text-[11px] text-slate-400 truncate">
                    {member.formData.email}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <Badge
              className={cn(
                status.color,
                "text-white border-0 text-[10px] h-5 px-2",
              )}
            >
              {status.label}
            </Badge>
            <div className="p-1 hover:bg-slate-100 rounded-full transition-colors">
              <ChevronRight
                className={cn(
                  "h-6 w-6 text-[#166FB5] transition-transform duration-200",
                  isExpanded && "rotate-90",
                )}
              />
            </div>
          </div>
        </button>

        {/* Card Body – expanded form */}
        {isExpanded && (
          <CardContent className="px-3 pb-3 pt-0 border-t border-slate-100">
            {/* Remove button for non-primary draft members */}
            {!member.isPrimary &&
              projectDetails?.status !== "Completed" &&
              projectDetails?.status !== "Pending Approval" &&
              member.isDraft && (
                <div className="flex justify-end mb-1.5">
                  <Button
                    onClick={() => handleRemoveMember(member.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove Member
                  </Button>
                </div>
              )}
            {renderMemberForm(member)}
          </CardContent>
        )}
      </Card>
    );
  };

  // ────────────────────────────────────────────────────────────────
  //  Sidebar content (shared between desktop & mobile)
  // ────────────────────────────────────────────────────────────────

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Header - CLIENT PORTAL + User Identity Card */}
      <div className="px-5 py-6 border-b border-slate-100 relative">
        <div className="flex justify-between items-center mb-4 pl-1">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Client Portal
          </h2>
          {/* Mobile Close Button */}
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* User Identity Card - Simple & Professional */}
        <div className="flex items-center gap-3 p-1">
          <div className="relative">
            <div className="w-10 h-10 bg-[#166FB5] rounded-full flex items-center justify-center flex-shrink-0 text-white shadow-sm ring-2 ring-white">
              <span className="font-bold text-sm">
                {user?.displayName ? (
                  user.displayName.charAt(0).toUpperCase()
                ) : (
                  <User className="w-5 h-5" />
                )}
              </span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white"></div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-800 text-sm truncate">
              {user?.displayName || "Merlito Dayon Jr."}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {user?.email || emailParam || "merlito.dayon@gmail.com"}
            </div>
            <button
              onClick={() => {
                setChangePwCurrent("");
                setChangePwNew("");
                setChangePwConfirm("");
                setChangePwError(null);
                setChangePwSuccess(false);
                setShowChangePasswordModal(true);
              }}
              className="mt-1 text-xs text-[#166FB5] hover:underline flex items-center gap-1"
            >
              <Key className="h-3 w-3" />
              Change Password
            </button>
          </div>
        </div>
      </div>

      {/* Projects Section */}
      <div className="flex-1 overflow-y-auto px-3 py-6">
        {/* My Inquiries — collapsible, visible when there are any inquiries */}
        {allInquiries.length > 0 && (
          <div className="mb-3">
            <div
              className="mb-2 px-3 flex items-center justify-between group cursor-pointer"
              onClick={() => setShowInquiriesList(!showInquiriesList)}
            >
              <div className="flex items-center gap-2 text-slate-600 group-hover:text-[#166FB5] transition-colors">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-bold">My Inquiries</span>
              </div>
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-slate-400 transition-transform",
                  showInquiriesList && "rotate-180",
                )}
              />
            </div>

            {showInquiriesList && (
              <div className="ml-6 mt-1 space-y-1">
                {allInquiries.map((inq) => {
                  const isActive = inq.id === inquiryIdParam;
                  return (
                    <button
                      key={inq.id}
                      onClick={() => {
                        if (inq.id === inquiryIdParam) return;
                        userSelectedInquiryRef.current = true;
                        userWantsWorkspaceRef.current = true;
                        setSelectedProjectPid(null);
                        setProjectDetails(null);
                        const params = new URLSearchParams();
                        if (emailParam) params.set("email", emailParam);
                        params.set("inquiryId", inq.id);
                        router.push(`/client/client-info?${params.toString()}`);
                        setMobileSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-start px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-left",
                        isActive
                          ? "bg-amber-50 text-amber-800 border border-amber-100"
                          : "text-slate-600 hover:bg-slate-100 hover:text-[#166FB5]",
                      )}
                    >
                      <span className="capitalize truncate flex-1">
                        {formatServiceType(inq.serviceType)}
                        {inq.createdAt && (
                          <span className="ml-1 font-normal">
                            {formatCreatedAt(inq.createdAt)}
                          </span>
                        )}
                        <span
                          className={cn(
                            "ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold",
                            isActive
                              ? "bg-amber-100 text-amber-800"
                              : "bg-amber-50 text-amber-600",
                          )}
                        >
                          {inq.status}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div
          className="mb-2 px-3 flex items-center justify-between group cursor-pointer"
          onClick={() => setShowProjectsList(!showProjectsList)}
        >
          <div className="flex items-center gap-2 text-slate-600 group-hover:text-[#166FB5] transition-colors">
            <FolderOpen className="h-4 w-4" />
            <span className="text-sm font-bold">My Projects</span>
          </div>
          <ChevronDown
            className={cn(
              "h-3 w-3 text-slate-400 transition-transform",
              showProjectsList && "rotate-180",
            )}
          />
        </div>

        {showProjectsList && (
          <div className="space-y-3 mt-3 ml-6">
            {projects.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-100 border-dashed mx-2">
                <p className="text-xs text-slate-400">No projects found</p>
              </div>
            ) : (
              projects.map((project) => {
                if (!project || !project.pid) return null;
                const isSelected = selectedProjectPid === project.pid;
                // Highlight (but don't select) projects linked to the currently viewed inquiry
                const isLinkedToCurrentInquiry =
                  !isSelected &&
                  !!inquiryIdParam &&
                  project.inquiryId === inquiryIdParam;
                const isDocsExpanded = expandedProjectDocs.has(project.pid);
                const docs = projectDocuments.get(project.pid);
                const quotationCount = docs?.quotations.length || 0;
                const chargeSlipCount = docs?.chargeSlips.length || 0;
                const sampleFormCount = docs?.sampleForms?.length || 0;
                const formSubmissionCount = docs?.formSubmissions || 0;
                const serviceReportCount = docs?.serviceReports?.length || 0;
                const officialReceiptCount =
                  docs?.officialReceipts?.length || 0;
                const sampleFormParams = new URLSearchParams();
                if (emailParam) sampleFormParams.set("email", emailParam);
                // Use project's own inquiryId so previous-inquiry projects link correctly
                sampleFormParams.set(
                  "inquiryId",
                  project.inquiryId || inquiryIdParam || "",
                );
                if (project.pid) sampleFormParams.set("pid", project.pid);
                if (project.title)
                  sampleFormParams.set("projectTitle", project.title);
                if (primaryMember?.formData?.name) {
                  sampleFormParams.set("name", primaryMember.formData.name);
                }
                if (primaryMember?.cid) {
                  sampleFormParams.set("clientId", primaryMember.cid);
                }
                const sampleFormBaseHref = `/client/sample-form?${sampleFormParams.toString()}`;

                const handleProjectItemClick = () => {
                  handleSelectProject(project);
                  void toggleProjectDocs(project);
                };

                return (
                  <div
                    key={project.pid}
                    className={cn(
                      "rounded-xl border transition-all duration-200 overflow-hidden group",
                      isSelected
                        ? "bg-blue-50/50 border-[#166FB5] shadow-sm"
                        : isLinkedToCurrentInquiry
                          ? "bg-amber-50/60 border-amber-300 shadow-sm"
                          : "bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm",
                    )}
                  >
                    {/* Project Header */}
                    <div
                      className="flex items-center bg-white hover:bg-slate-50 cursor-pointer"
                      onClick={handleProjectItemClick}
                    >
                      {/* Main project content - clickable */}
                      <div className="flex-1 min-w-0 p-3">
                        <div className="flex flex-col gap-1">
                          <p
                            className="text-sm text-slate-700 font-medium truncate leading-tight"
                            title={project.title || "Untitled Project"}
                          >
                            {project.title || "Untitled Project"}
                          </p>
                        </div>
                      </div>

                      {/* Documents toggle button - Chevron on the right */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectProject(project);
                          void toggleProjectDocs(project);
                        }}
                        className={cn(
                          "flex-shrink-0 px-3 py-4 hover:bg-slate-100 transition-colors border-l border-slate-200 group/chevron h-full",
                          isDocsExpanded && "bg-blue-50",
                        )}
                        title={
                          isDocsExpanded
                            ? "Hide the documents"
                            : "View documents"
                        }
                        aria-label="Toggle documents"
                      >
                        <ChevronRight
                          className={cn(
                            "h-5 w-5 text-[#166FB5] transition-all duration-200 group-hover/chevron:translate-x-0.5",
                            isDocsExpanded && "rotate-90",
                          )}
                        />
                      </button>
                    </div>

                    {/* Documents sub-panel */}
                    {isDocsExpanded && (
                      <div className="bg-slate-50 border-t">
                        {docs?.loading ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Loading…</span>
                          </div>
                        ) : (
                          <div className="p-3 pl-6 space-y-1">
                            {/* Quotations */}
                            <div>
                              <button
                                type="button"
                                disabled={quotationCount === 0}
                                className={cn(
                                  "flex items-center gap-2 px-2 py-1.5 w-full text-left rounded-lg transition-colors",
                                  activeDocPanel === `${project.pid}:quotations`
                                    ? "bg-purple-50"
                                    : quotationCount === 0
                                      ? "opacity-40 cursor-not-allowed"
                                      : "hover:bg-slate-50",
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (quotationCount > 0)
                                    handleSelectDocPanel(
                                      project.pid!,
                                      "quotations",
                                    );
                                }}
                              >
                                <FileText
                                  className={cn(
                                    "h-3 w-3 flex-shrink-0",
                                    activeDocPanel ===
                                      `${project.pid}:quotations`
                                      ? "text-purple-600"
                                      : "text-purple-500",
                                  )}
                                />
                                <span
                                  className={cn(
                                    "text-sm font-semibold flex-1",
                                    activeDocPanel ===
                                      `${project.pid}:quotations`
                                      ? "text-purple-700"
                                      : "text-slate-700",
                                  )}
                                >
                                  Quotations
                                </span>
                                <span className="text-[10px] text-slate-500 mr-1">
                                  ({quotationCount})
                                </span>
                                <ChevronRight
                                  className={cn(
                                    "h-3 w-3 flex-shrink-0 transition-transform",
                                    activeDocPanel ===
                                      `${project.pid}:quotations`
                                      ? "text-purple-500 rotate-90"
                                      : "text-slate-400",
                                  )}
                                />
                              </button>
                            </div>

                            {/* Sample Submission Form */}
                            <div>
                              {(() => {
                                const isSampleFormDisabled =
                                  currentInquiry?.status === "In Progress";
                                const isActive =
                                  activeDocPanel ===
                                  `${project.pid}:sampleForm`;
                                return (
                                  <button
                                    type="button"
                                    disabled={isSampleFormDisabled}
                                    className={cn(
                                      "flex items-center gap-2 px-2 py-1.5 w-full text-left rounded-lg transition-colors",
                                      isActive
                                        ? "bg-orange-50"
                                        : isSampleFormDisabled
                                          ? "opacity-40 cursor-not-allowed"
                                          : "hover:bg-slate-50",
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isSampleFormDisabled)
                                        handleSelectDocPanel(
                                          project.pid!,
                                          "sampleForm",
                                        );
                                    }}
                                  >
                                    <FileText
                                      className={cn(
                                        "h-3 w-3 flex-shrink-0",
                                        isActive
                                          ? "text-orange-600"
                                          : "text-orange-500",
                                      )}
                                    />
                                    <span
                                      className={cn(
                                        "text-sm font-semibold flex-1",
                                        isActive
                                          ? "text-orange-700"
                                          : "text-slate-700",
                                      )}
                                    >
                                      Sample Submission Form
                                    </span>
                                    <span className="text-[10px] text-slate-500 mr-1">
                                      ({formSubmissionCount})
                                    </span>
                                    <ChevronRight
                                      className={cn(
                                        "h-3 w-3 flex-shrink-0 transition-transform",
                                        isActive
                                          ? "text-orange-500 rotate-90"
                                          : "text-slate-400",
                                      )}
                                    />
                                  </button>
                                );
                              })()}
                            </div>

                            {/* Charge Slips */}
                            <div>
                              {(() => {
                                const isChargeSlipsDisabled =
                                  chargeSlipCount === 0;
                                const isActive =
                                  activeDocPanel ===
                                  `${project.pid}:chargeSlips`;
                                return (
                                  <button
                                    type="button"
                                    disabled={isChargeSlipsDisabled}
                                    className={cn(
                                      "flex items-center gap-2 px-2 py-1.5 w-full text-left rounded-lg transition-colors",
                                      isActive
                                        ? "bg-green-50"
                                        : isChargeSlipsDisabled
                                          ? "opacity-40 cursor-not-allowed"
                                          : "hover:bg-slate-50",
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isChargeSlipsDisabled)
                                        handleSelectDocPanel(
                                          project.pid!,
                                          "chargeSlips",
                                        );
                                    }}
                                  >
                                    <div className="flex items-center justify-center w-3 h-3 flex-shrink-0">
                                      <span
                                        className={cn(
                                          "text-[13px] font-bold leading-none",
                                          isActive
                                            ? "text-green-600"
                                            : "text-green-500",
                                        )}
                                      >
                                        ₱
                                      </span>
                                    </div>
                                    <span
                                      className={cn(
                                        "text-sm font-semibold flex-1",
                                        isActive
                                          ? "text-green-700"
                                          : "text-slate-700",
                                      )}
                                    >
                                      Charge Slips
                                    </span>
                                    {(() => {
                                      const slips =
                                        notifChargeSlips.get(project.pid!) ||
                                        [];
                                      const hasUnsettled = slips.some(
                                        (cs: any) =>
                                          cs.status !== "paid" &&
                                          cs.status !== "waived" &&
                                          cs.status !== "cancelled",
                                      );
                                      return slips.length > 0 &&
                                        hasUnsettled ? (
                                        <TooltipProvider delayDuration={100}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="relative flex h-2 w-2 mr-1 cursor-default">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="right">
                                              <p className="text-xs">
                                                Billing Available
                                              </p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      ) : null;
                                    })()}
                                    <span className="text-[10px] text-slate-500 mr-1">
                                      ({chargeSlipCount})
                                    </span>
                                    <ChevronRight
                                      className={cn(
                                        "h-3 w-3 flex-shrink-0 transition-transform",
                                        isActive
                                          ? "text-green-500 rotate-90"
                                          : "text-slate-400",
                                      )}
                                    />
                                  </button>
                                );
                              })()}
                            </div>

                            {portalFeatures.serviceReports && (
                              <div>
                                {(() => {
                                  const hasServiceReports =
                                    (docs?.serviceReports?.length || 0) > 0;
                                  const isServiceReportSectionDisabled =
                                    !hasServiceReports;
                                  const isActive =
                                    activeDocPanel ===
                                    `${project.pid}:serviceReports`;
                                  return (
                                    <button
                                      type="button"
                                      disabled={isServiceReportSectionDisabled}
                                      className={cn(
                                        "flex items-center gap-2 px-2 py-1.5 w-full text-left rounded-lg transition-colors",
                                        isActive
                                          ? "bg-blue-50"
                                          : isServiceReportSectionDisabled
                                            ? "opacity-40 cursor-not-allowed"
                                            : "hover:bg-slate-50",
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isServiceReportSectionDisabled)
                                          handleSelectDocPanel(
                                            project.pid!,
                                            "serviceReports",
                                          );
                                      }}
                                    >
                                      <ShieldEllipsis
                                        className={cn(
                                          "h-3 w-3 flex-shrink-0",
                                          isActive
                                            ? "text-blue-600"
                                            : "text-blue-500",
                                        )}
                                      />
                                      <span
                                        className={cn(
                                          "text-sm font-semibold flex-1",
                                          isActive
                                            ? "text-blue-700"
                                            : "text-slate-700",
                                        )}
                                      >
                                        Service Reports
                                      </span>
                                      {(() => {
                                        const hasUnread = (
                                          docs?.serviceReports || []
                                        ).some(
                                          (r: any) => r.status !== "received",
                                        );
                                        return hasUnread ? (
                                          <TooltipProvider delayDuration={100}>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="relative flex h-2 w-2 mr-1 cursor-default">
                                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent side="right">
                                                <p className="text-xs">
                                                  Service Report Available
                                                </p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        ) : null;
                                      })()}
                                      <span className="text-[10px] text-slate-500 mr-1">
                                        ({serviceReportCount})
                                      </span>
                                      <ChevronRight
                                        className={cn(
                                          "h-3 w-3 flex-shrink-0 transition-transform",
                                          isActive
                                            ? "text-blue-500 rotate-90"
                                            : "text-slate-400",
                                        )}
                                      />
                                    </button>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Footer deleted as requested */}
      {/* New Inquiry CTA — disabled while any inquiry is Pending or Ongoing Quotation */}
      {(() => {
        const DISABLED_STATUSES = new Set<string>([
          "Pending",
          "Ongoing Quotation",
        ]);
        const blockingInquiry = allInquiries.find((inq) =>
          DISABLED_STATUSES.has(inq.status),
        );
        const isNewInquiryDisabled = Boolean(blockingInquiry);
        return (
          <div className="px-4 py-4 border-t border-slate-100 bg-slate-50/60">
            <button
              disabled={isNewInquiryDisabled}
              onClick={() => {
                if (isNewInquiryDisabled) return;
                const params = new URLSearchParams();
                if (emailParam) params.set("email", emailParam);
                // Pass the original inquiry ID so login password stays unchanged after redirect
                if (inquiryIdParam)
                  params.set("returnInquiryId", inquiryIdParam);
                params.set("returnToPortal", "true");
                router.push(`/client/inquiry-request?${params.toString()}`);
              }}
              title={
                isNewInquiryDisabled
                  ? `Cannot create a new inquiry while an inquiry is still "${blockingInquiry?.status}"`
                  : "Submit a new inquiry"
              }
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed text-sm font-semibold transition-all ${
                isNewInquiryDisabled
                  ? "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"
                  : "border-[#166FB5]/50 text-[#166FB5] hover:bg-[#166FB5]/5 hover:border-[#166FB5] cursor-pointer"
              }`}
            >
              <Plus className="h-4 w-4" />
              New Inquiry
            </button>
            {isNewInquiryDisabled && (
              <p className="mt-1.5 text-center text-xs text-slate-400">
                Unavailable while an inquiry is{" "}
                <span className="font-medium">{blockingInquiry?.status}</span>
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  //  Loading states
  // ────────────────────────────────────────────────────────────────

  // Show loading while authentication is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return null; // This will be handled by the useEffect redirect
  }

  // ────────────────────────────────────────────────────────────────
  //  Main render
  // ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex h-[calc(100vh-73px)]">
        {/* ═════ LEFT SIDEBAR — Desktop ═════ */}
        <aside className="hidden lg:flex w-[400px] min-w-[340px] bg-white border-r border-slate-200 flex-shrink-0 flex-col">
          {sidebarContent}
        </aside>

        {/* ═════ LEFT SIDEBAR — Mobile overlay ═════ */}
        {mobileSidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <aside className="fixed left-0 top-0 bottom-0 w-[400px] bg-white z-50 lg:hidden shadow-2xl flex flex-col">
              {sidebarContent}
            </aside>
          </>
        )}

        {/* ═════ RIGHT CONTENT ═════ */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50/50 to-blue-50/30">
          {projectDetails ? (
            <div className="p-3 lg:p-4 max-w-5xl mx-auto space-y-3">
              {/* Draft/Pending/Approved status banner */}
              {(projectDetails?.isDraft ||
                projectDetails?.status === "Ongoing" ||
                projectDetails?.status === "Pending Approval" ||
                projectDetails?.status === "Rejected" ||
                projectDetails?.status === "Returned for Revision") && (
                <div
                  className={`rounded-lg p-3 border ${
                    projectDetails.status === "Draft"
                      ? "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200"
                      : projectDetails.status === "Pending Approval"
                        ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200"
                        : projectDetails.status === "Ongoing"
                          ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
                          : "bg-gradient-to-r from-red-50 to-pink-50 border-red-200"
                  }`}
                >
                  <div className="flex items-start">
                    <div className="flex-1 space-y-1">
                      {projectDetails.status === "Draft" ? (
                        <>
                          <p className="text-xs font-semibold text-orange-900 leading-none">
                            Action Required: Complete Project Submission
                          </p>
                          <p className="text-xs text-orange-700 leading-relaxed">
                            {members.some(
                              (m) => m.isPrimary && !m.isSubmitted,
                            ) ? (
                              <>
                                Please provide your details as the{" "}
                                <strong>Primary Member</strong>.{" "}
                              </>
                            ) : (
                              <>
                                If you have additional team members, please add
                                them now.{" "}
                              </>
                            )}
                            Once finished, scroll to the bottom and click "
                            <strong>Submit Project & Team for Approval</strong>"
                            to send your application for admin review. After
                            approval, you will be assigned a{" "}
                            <strong>Project ID</strong> and{" "}
                            <strong>Client ID</strong>.
                          </p>
                        </>
                      ) : projectDetails.status === "Pending Approval" ? (
                        <>
                          <p className="text-xs font-semibold text-blue-900 leading-none">
                            Application Submitted & Under Review
                          </p>
                          <p className="text-xs text-blue-700 leading-relaxed">
                            Your project and team details have been successfully
                            submitted. Our team is currently reviewing your
                            application. Please check this portal dashboard for
                            your <strong>Project ID</strong>,{" "}
                            <strong>Client ID</strong>, and approval
                            notification.{" "}
                            <strong>
                              No further action is required at this time.
                            </strong>
                          </p>
                        </>
                      ) : projectDetails.status === "Ongoing" ? (
                        <>
                          <p className="text-xs font-semibold text-green-900 leading-none">
                            Project Approved
                          </p>
                          <p className="text-xs text-green-700 leading-relaxed">
                            Your project has been approved and is now active.
                            You can now view your unique{" "}
                            <strong>Project ID</strong> and{" "}
                            <strong>Client IDs</strong>, and access all project
                            documents below.
                          </p>
                        </>
                      ) : projectDetails.status === "Returned for Revision" ? (
                        <>
                          <p className="text-xs font-semibold text-red-900 leading-none">
                            Project Cancelled
                          </p>
                          <p className="text-xs text-red-700 leading-relaxed">
                            Your project submission was not approved for the
                            following reason:{" "}
                            <strong>
                              &ldquo;
                              {projectRequest?.rejectionReason ||
                                "No reason provided. Please contact the administrator for details."}
                              &rdquo;
                            </strong>{" "}
                            Please update your information and resubmit.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-red-900 leading-none">
                            Project Rejected
                          </p>
                          <p className="text-xs text-red-700 leading-relaxed">
                            Your project submission was not approved. Please
                            check your email or the feedback section for details
                            on necessary corrections before resubmitting.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Project Header ────────────────────────── */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"></div>

              {/* ── Project Information (collapsible) ────────────── */}
              {(() => {
                const canEditProjectInfo =
                  !!projectDetails?.isDraft &&
                  (projectDetails?.status === "Draft" ||
                    projectDetails?.status === "Rejected");
                return (
                  <div className="border border-slate-100 rounded-2xl bg-white shadow-sm overflow-hidden">
                    {/* Header row — use a div to allow an Edit button alongside the toggle */}
                    <div
                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer select-none"
                      onClick={() => setIsProjectInfoExpanded((prev) => !prev)}
                      role="button"
                      aria-expanded={isProjectInfoExpanded}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderOpen className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold text-slate-800 truncate">
                            {projectDetails.title || "Project Information"}
                          </span>
                          {projectDetails.pid &&
                            projectDetails.status !== "Draft" &&
                            projectDetails.status !== "Pending Approval" && (
                              <span className="text-[11px] font-mono text-[#166FB5]/70 bg-blue-50/50 px-1.5 rounded border border-blue-100/30 w-fit">
                                Project ID: {projectDetails.pid}
                              </span>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {canEditProjectInfo &&
                          isProjectInfoExpanded &&
                          !isProjectInfoEditing && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditProjectInfo();
                              }}
                              className="p-1 rounded hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600"
                              title="Edit project information"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-slate-400 transition-transform duration-200",
                            isProjectInfoExpanded && "rotate-180",
                          )}
                        />
                      </div>
                    </div>

                    {isProjectInfoExpanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-slate-100">
                        {isProjectInfoEditing ? (
                          /* ── Edit mode ─────────────────────────── */
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                Project Title
                              </Label>
                              <Input
                                value={projectInfoForm.title}
                                onChange={(e) =>
                                  setProjectInfoForm((prev) => ({
                                    ...prev,
                                    title: e.target.value,
                                  }))
                                }
                                className="h-8 text-xs"
                                placeholder="Enter project title"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                Project Lead
                              </Label>
                              <Input
                                value={projectInfoForm.lead}
                                onChange={(e) =>
                                  setProjectInfoForm((prev) => ({
                                    ...prev,
                                    lead: e.target.value,
                                  }))
                                }
                                className="h-8 text-xs"
                                placeholder="Enter project lead name"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                Start Date
                              </Label>
                              <Input
                                type="date"
                                value={projectInfoForm.startDate}
                                onChange={(e) =>
                                  setProjectInfoForm((prev) => ({
                                    ...prev,
                                    startDate: e.target.value,
                                  }))
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                Sending Institution
                              </Label>
                              <Select
                                value={projectInfoForm.sendingInstitution}
                                onValueChange={(val) =>
                                  setProjectInfoForm((prev) => ({
                                    ...prev,
                                    sendingInstitution: val,
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select sending institution" />
                                </SelectTrigger>
                                <SelectContent>
                                  {SENDING_INSTITUTIONS.map((inst) => (
                                    <SelectItem
                                      key={inst}
                                      value={inst}
                                      className="text-xs"
                                    >
                                      {inst}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                Funding Institution
                              </Label>
                              <Input
                                value={projectInfoForm.fundingInstitution}
                                onChange={(e) =>
                                  setProjectInfoForm((prev) => ({
                                    ...prev,
                                    fundingInstitution: e.target.value,
                                  }))
                                }
                                className="h-8 text-xs"
                                placeholder="Enter funding institution"
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                size="sm"
                                onClick={handleSaveProjectInfo}
                                disabled={isSavingProjectInfo}
                                className="h-7 text-xs gap-1"
                              >
                                {isSavingProjectInfo ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3" />
                                )}
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setIsProjectInfoEditing(false)}
                                disabled={isSavingProjectInfo}
                                className="h-7 text-xs"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* ── Read-only view ──────────────────────── */
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                            <div className="flex items-start gap-2">
                              <User className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                  Project Lead
                                </p>
                                <p className="text-xs text-slate-700 font-medium">
                                  {projectDetails.lead || "—"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <ShieldCheck className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                  Status
                                </p>
                                <p className="text-xs text-slate-700 font-medium">
                                  {projectDetails.status || "—"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Calendar className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                  Start Date
                                </p>
                                <p className="text-xs text-slate-700 font-medium">
                                  {projectDetails.startDate
                                    ? (() => {
                                        try {
                                          const d =
                                            projectDetails.startDate instanceof
                                            Date
                                              ? projectDetails.startDate
                                              : new Date(
                                                  projectDetails.startDate as string,
                                                );
                                          return isNaN(d.getTime())
                                            ? "—"
                                            : format(d, "MMM d, yyyy");
                                        } catch {
                                          return "—";
                                        }
                                      })()
                                    : "—"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Building2 className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                  Sending Institution
                                </p>
                                <p className="text-xs text-slate-700 font-medium">
                                  {projectDetails.sendingInstitution || "—"}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Briefcase className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                  Funding Institution
                                </p>
                                <p className="text-xs text-slate-700 font-medium">
                                  {projectDetails.fundingInstitution || "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Request Progress Timeline ──────────────────── */}
              {portalFeatures.requestProgressTimeline && (
                <Card className="border border-slate-100 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Request Progress
                        </p>
                        <p className="text-xs text-slate-500">
                          Track the current stage of your request from inquiry
                          to delivery.
                        </p>
                      </div>
                      {selectedProjectPid &&
                        projectDocuments.get(selectedProjectPid)?.loading && (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Loading documents</span>
                          </div>
                        )}
                    </div>

                    <div className="mt-4 space-y-3">
                      {timelineSteps.map((step) => (
                        <div key={step.key} className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {step.state === "complete" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : step.state === "current" ? (
                              <Clock className="h-4 w-4 text-blue-500" />
                            ) : (
                              <span className="h-4 w-4 rounded-full border border-slate-300 block" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-700">
                                {step.label}
                              </p>
                              {step.state === "current" && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                  In progress
                                </span>
                              )}
                              {step.state === "complete" && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  Completed
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="space-y-2">
                {/* Section header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-[#166FB5]/10 rounded-lg">
                      <Users className="h-4 w-4 text-[#166FB5]" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-800 leading-tight">
                        Team Members
                      </h2>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                        <strong>
                          {members.filter((m) => m.isSubmitted).length}
                        </strong>{" "}
                        / <strong>{members.length}</strong> Saved
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Add Member button (for all projects) */}
                    <Button
                      onClick={handleAddMember}
                      variant="outline"
                      size="sm"
                      disabled={
                        projectDetails?.status === "Completed" ||
                        approvalStatus === "pending" ||
                        projectDetails?.status === "Pending Approval"
                      }
                      className="border-[#166FB5] text-[#166FB5] hover:bg-[#166FB5] hover:text-white disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      New Member
                    </Button>
                  </div>
                </div>

                {/* Primary member */}
                {primaryMember && (
                  <div className="space-y-1.5">
                    <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                      Primary Member
                    </h3>
                    {renderMemberCard(primaryMember)}
                  </div>
                )}

                {/* Other members */}
                {otherMembers.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                      Other Members ({otherMembers.length})
                    </h3>
                    <div className="space-y-1.5">
                      {otherMembers.map((member) => renderMemberCard(member))}
                    </div>
                  </div>
                )}

                {/* ── Approval Banners (REMOVED) ────────────────────── */}

                {approvalStatus === "rejected" && (
                  <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-100 rounded-lg">
                        <XCircle className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-red-800">
                          Submission Rejected
                        </h4>
                        <p className="text-sm text-red-700 mt-1">
                          Please review and update the member information, then
                          resubmit.
                        </p>
                        {approvalStatusData.reviewNotes && (
                          <div className="bg-white/70 rounded-lg p-3 mt-2 border border-red-200">
                            <p className="text-sm font-semibold text-red-800 mb-1">
                              Reason for Rejection:
                            </p>
                            <p className="text-sm text-red-700">
                              {approvalStatusData.reviewNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Submit for Approval Button ─────────── */}
                {projectDetails?.status !== "Completed" &&
                  projectDetails?.status !== "Pending Approval" && // Hide if main project is pending
                  approvalStatus !== "pending" &&
                  (projectDetails?.isDraft ||
                    members.some((m) => m.isDraft && !m.isPrimary)) && (
                    <div className="pt-6 border-t-2 border-slate-200">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="text-sm text-slate-500">
                          {members.some((m) => !m.isSubmitted) ? (
                            <span className="text-[#B9273A] font-semibold flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4" />
                              Complete and save all member details to proceed
                            </span>
                          ) : projectDetails?.isDraft ? (
                            <span className="flex items-center gap-1.5 text-blue-600 font-medium">
                              <CheckCircle2 className="h-4 w-4" />
                              Ready to submit project and team details
                            </span>
                          ) : (
                            "Submit your team members for admin review"
                          )}
                        </div>
                        <Button
                          onClick={handleFinalSubmit}
                          disabled={
                            submitting || members.some((m) => !m.isSubmitted)
                          }
                          className="h-12 px-8 bg-gradient-to-r from-[#166FB5] to-[#4038AF] hover:from-[#166FB5]/90 hover:to-[#4038AF]/90 text-white font-bold shadow-xl hover:shadow-2xl disabled:opacity-50 whitespace-nowrap"
                        >
                          <Send className="h-5 w-5 mr-2" />
                          {projectDetails?.isDraft
                            ? "Submit Project & Team for Approval"
                            : "Submit Team Members for Approval"}
                        </Button>
                      </div>
                    </div>
                  )}
              </div>

              {/* ── Document Panel (shown below Team Members when a doc section is selected) ── */}
              {selectedProjectPid &&
                activeDocPanel &&
                activeDocPanel.startsWith(selectedProjectPid + ":") &&
                (() => {
                  const panelSection = activeDocPanel
                    .split(":")
                    .slice(1)
                    .join(":");
                  const panelDocs = projectDocuments.get(selectedProjectPid);
                  const panelChargeSlipCount =
                    panelDocs?.chargeSlips.length || 0;
                  const allChargeSlipsSettled =
                    panelChargeSlipCount > 0 &&
                    (panelDocs?.chargeSlips?.some(
                      (cs) => cs.status === "paid" || cs.status === "waived",
                    ) ??
                      false);
                  const sfParams = new URLSearchParams();
                  if (emailParam) sfParams.set("email", emailParam);
                  if (inquiryIdParam) sfParams.set("inquiryId", inquiryIdParam);
                  sfParams.set("pid", selectedProjectPid);
                  if (projectDetails?.title)
                    sfParams.set("projectTitle", projectDetails.title);
                  if (primaryMember?.formData?.name)
                    sfParams.set("name", primaryMember.formData.name);
                  if (primaryMember?.cid)
                    sfParams.set("clientId", primaryMember.cid);
                  const sfBaseHref = `/client/sample-form?${sfParams.toString()}`;

                  const PANEL_META: Record<
                    string,
                    {
                      icon: React.ReactNode;
                      label: string;
                      accent: string;
                      iconBg: string;
                    }
                  > = {
                    quotations: {
                      icon: <FileText className="h-4 w-4 text-purple-600" />,
                      label: "Quotations",
                      accent: "text-purple-700",
                      iconBg: "bg-purple-50",
                    },
                    sampleForm: {
                      icon: <FileText className="h-4 w-4 text-orange-600" />,
                      label: "Sample Submission Form",
                      accent: "text-orange-700",
                      iconBg: "bg-orange-50",
                    },
                    chargeSlips: {
                      icon: (
                        <span className="text-sm font-bold text-green-600">
                          ₱
                        </span>
                      ),
                      label: "Charge Slips",
                      accent: "text-green-700",
                      iconBg: "bg-green-50",
                    },
                    serviceReports: {
                      icon: (
                        <ShieldEllipsis className="h-4 w-4 text-blue-600" />
                      ),
                      label: "Service Reports",
                      accent: "text-blue-700",
                      iconBg: "bg-blue-50",
                    },
                  };
                  const meta = PANEL_META[panelSection];
                  if (!meta) return null;

                  return (
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-4">
                      {/* Panel header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-1.5 rounded-lg", meta.iconBg)}>
                            {meta.icon}
                          </div>
                          <div>
                            <h2
                              className={cn(
                                "text-base font-bold leading-tight",
                                meta.accent,
                              )}
                            >
                              {meta.label}
                            </h2>
                            <p className="text-xs text-slate-400">
                              Project:{" "}
                              {projectDetails?.pid || selectedProjectPid}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveDocPanel(null)}
                          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Close panel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Quotations panel */}
                      {panelSection === "quotations" && (
                        <div className="space-y-2">
                          {panelDocs?.loading ? (
                            <div className="flex items-center gap-2 py-6 justify-center text-slate-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">
                                Loading quotations…
                              </span>
                            </div>
                          ) : (panelDocs?.quotations.length || 0) === 0 ? (
                            <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                              <p className="text-sm text-slate-400 italic">
                                No quotations issued for this project yet.
                              </p>
                            </div>
                          ) : (
                            panelDocs?.quotations.map((quotation) => {
                              const qCancelled =
                                quotation.status === "cancelled";
                              const qTotal =
                                typeof quotation.total === "number"
                                  ? quotation.total
                                  : 0;
                              const qRawDate = quotation.dateIssued;
                              const qIssuedDate = qRawDate
                                ? (qRawDate as any)?.toDate
                                  ? formatDate((qRawDate as any).toDate())
                                  : formatDate(qRawDate as string)
                                : null;
                              return (
                                <div
                                  key={quotation.id}
                                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex items-center justify-between gap-3 flex-wrap hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                                    <a
                                      href={`/client/view-document?type=quotation&ref=${quotation.referenceNumber}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] font-bold text-purple-700 border border-purple-200 bg-white rounded-md px-2 py-0.5 hover:bg-purple-50 transition-colors"
                                    >
                                      {quotation.referenceNumber}
                                    </a>
                                    <span className="text-xs text-slate-500">
                                      Total:{" "}
                                      <span className="font-semibold text-slate-700">
                                        ₱
                                        {qTotal.toLocaleString("en-US", {
                                          minimumFractionDigits: 2,
                                        })}
                                      </span>
                                    </span>
                                    {qIssuedDate && (
                                      <span className="text-xs text-slate-500">
                                        Issued:{" "}
                                        <span className="font-medium text-slate-600">
                                          {qIssuedDate}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex-shrink-0">
                                    {qCancelled ? (
                                      <span className="inline-flex text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                                        Cancelled
                                      </span>
                                    ) : quotation.status === "selected" ||
                                      quotation.selectedForProject ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                        <CheckCircle2 className="h-3 w-3" />{" "}
                                        Selected
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* Sample Submission Form panel */}
                      {panelSection === "sampleForm" && (
                        <div className="space-y-4">
                          <DownloadForms projectId={selectedProjectPid} />
                          {portalFeatures.sampleForms && (
                            <>
                              <div className="pt-2 border-t border-slate-100">
                                <a
                                  href={sfBaseHref}
                                  className="inline-flex items-center gap-2 text-sm text-[#166FB5] hover:underline font-semibold"
                                >
                                  <Plus className="h-4 w-4" /> Fill out Sample
                                  Submission Form
                                </a>
                              </div>
                              {(panelDocs?.sampleForms?.length || 0) > 0 && (
                                <div className="space-y-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Submitted Forms
                                  </p>
                                  {panelDocs?.sampleForms.map((item) => (
                                    <a
                                      key={item.id}
                                      href={`${sfBaseHref}&formId=${item.id}`}
                                      className="flex items-center gap-2 text-sm text-slate-600 hover:text-orange-600 hover:underline py-1.5 px-3 rounded-lg hover:bg-orange-50 transition-colors"
                                    >
                                      <FileSpreadsheet className="h-4 w-4 text-orange-500 flex-shrink-0" />
                                      {item.id} —{" "}
                                      {item.totalNumberOfSamples || 0} samples
                                    </a>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Charge Slips panel */}
                      {panelSection === "chargeSlips" && (
                        <div className="space-y-3">
                          {panelDocs?.loading ? (
                            <div className="flex items-center gap-2 py-6 justify-center text-slate-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">
                                Loading charge slips…
                              </span>
                            </div>
                          ) : (panelDocs?.chargeSlips.length || 0) === 0 ? (
                            <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              <Receipt className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                              <p className="text-sm text-slate-400 italic">
                                No charge slips issued for this project yet.
                              </p>
                            </div>
                          ) : (
                            panelDocs?.chargeSlips.map((chargeSlip) => {
                              const csPaid = chargeSlip.status === "paid";
                              const csCancelled =
                                chargeSlip.status === "cancelled";
                              const csPending = chargeSlip.status === "pending";
                              const csWaived = chargeSlip.status === "waived";
                              const csTotal =
                                typeof chargeSlip.total === "number"
                                  ? chargeSlip.total
                                  : 0;
                              const csRawDate = chargeSlip.dateIssued;
                              const csIssuedDate = csRawDate
                                ? (csRawDate as any)?.toDate
                                  ? formatDate((csRawDate as any).toDate())
                                  : formatDate(csRawDate as string)
                                : null;
                              return (
                                <div
                                  key={chargeSlip.id}
                                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3 hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                      <a
                                        href={`/client/view-document?type=charge-slip&ref=${chargeSlip.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-white hover:bg-green-700 hover:text-white border border-green-600 rounded-full px-2.5 py-0.5 transition-all shadow-sm"
                                      >
                                        {chargeSlip.chargeSlipNumber}
                                      </a>
                                      <span className="text-xs text-slate-500">
                                        Total:{" "}
                                        <span className="font-semibold text-slate-700">
                                          ₱
                                          {csTotal.toLocaleString("en-US", {
                                            minimumFractionDigits: 2,
                                          })}
                                        </span>
                                      </span>
                                      {csIssuedDate && (
                                        <span className="text-xs text-slate-500">
                                          Issued:{" "}
                                          <span className="font-medium text-slate-600">
                                            {csIssuedDate}
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                    <div>
                                      {csPaid ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-0.5">
                                          <CheckCircle2 className="h-3 w-3" />{" "}
                                          Paid
                                        </span>
                                      ) : csCancelled ? (
                                        <span className="inline-flex text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-0.5">
                                          Cancelled
                                        </span>
                                      ) : csWaived ? (
                                        <span className="inline-flex text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-3 py-0.5">
                                          Waived
                                        </span>
                                      ) : csPending ? (
                                        <span className="inline-flex text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-0.5 animate-pulse">
                                          Pending Validation
                                        </span>
                                      ) : (
                                        <span className="inline-flex text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-3 py-0.5">
                                          Processing
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <UploadReceipt
                                    projectId={selectedProjectPid}
                                    hasChargeSlip={true}
                                    chargeSlipNumber={
                                      chargeSlip.chargeSlipNumber
                                    }
                                    uploadAllowed={!csPaid && !csCancelled}
                                  />
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* Service Reports panel */}
                      {panelSection === "serviceReports" &&
                        portalFeatures.serviceReports &&
                        (() => {
                          const hasServiceReports =
                            (panelDocs?.serviceReports?.length || 0) > 0;
                          return (
                            <div className="space-y-2">
                              {panelDocs?.loading ? (
                                <div className="flex items-center gap-2 py-6 justify-center text-slate-400">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm">
                                    Loading service reports…
                                  </span>
                                </div>
                              ) : !hasServiceReports ? (
                                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                  <ShieldEllipsis className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                  <p className="text-sm text-slate-400 italic">
                                    No service reports available yet.
                                  </p>
                                </div>
                              ) : (
                                panelDocs?.serviceReports.map((item: any) => {
                                  const isReceived = item.status === "received";
                                  const receivedDate = item.receivedAt?.toDate
                                    ? format(
                                        item.receivedAt.toDate(),
                                        "MMM d, yyyy h:mm a",
                                      )
                                    : "";
                                  const uploadedDate = item.uploadedAt?.toDate
                                    ? format(
                                        item.uploadedAt.toDate(),
                                        "MMM d, yyyy h:mm a",
                                      )
                                    : "";
                                  const reportKey = `${selectedProjectPid}:${item.id}`;
                                  const isReceiving =
                                    receivingReportId === reportKey;
                                  const isExceptionReport = Boolean(
                                    item.exceptionEnabled ||
                                      item.documentationRemark ||
                                      item.uploadedByEmail ||
                                      (projectDetails as any)
                                        ?.allowServiceReportWithoutQuotation,
                                  );
                                  return (
                                    <div
                                      key={item.id}
                                      className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col gap-2 hover:bg-slate-50 transition-colors"
                                    >
                                      {/* File meta row */}
                                      <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                        <div className="min-w-0">
                                          {isReceived ? (
                                            <a
                                              href={item.fileUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-sm text-blue-700 hover:underline truncate block"
                                            >
                                              {item.fileName || item.id}
                                            </a>
                                          ) : (
                                            <span className="text-sm text-slate-600 truncate block">
                                              {item.fileName || item.id}
                                            </span>
                                          )}
                                          {uploadedDate && (
                                            <span className="text-[10px] text-slate-400 font-medium">
                                              Uploaded: {uploadedDate}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Action row */}
                                      <div className="flex items-center justify-end">
                                        {isReceived ? (
                                          <Badge
                                            variant="outline"
                                            className="text-xs text-green-700 border-green-200 bg-green-50 gap-1 h-6 shrink-0"
                                          >
                                            <CheckCircle2 className="h-3 w-3" />
                                            Received
                                            {receivedDate && (
                                              <span className="font-normal text-green-600 opacity-80">
                                                · {receivedDate}
                                              </span>
                                            )}
                                          </Badge>
                                        ) : isExceptionReport ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs px-3 gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                                            disabled={isReceiving}
                                            onClick={() =>
                                              handleReceiveServiceReport(
                                                selectedProjectPid,
                                                item,
                                              )
                                            }
                                          >
                                            {isReceiving ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <Download className="h-3 w-3" />
                                            )}
                                            Receive
                                          </Button>
                                        ) : !allChargeSlipsSettled ? (
                                          <TooltipProvider delayDuration={100}>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span>
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 text-xs px-3 gap-1 text-slate-400 border-slate-200 cursor-not-allowed pointer-events-none"
                                                    disabled
                                                  >
                                                    <Download className="h-3 w-3" />{" "}
                                                    Receive
                                                  </Button>
                                                </span>
                                              </TooltipTrigger>
                                              <TooltipContent
                                                side="left"
                                                className="max-w-[200px] text-xs text-center"
                                              >
                                                Please settle all outstanding
                                                charge slips first.
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        ) : formOpenedReports.has(item.id) ? (
                                          /* Step 2 — confirm form was submitted then unlock PDF */
                                          <div className="flex items-center gap-2">
                                            <span className="text-[13px] text-slate-500 italic">
                                              Form opened — confirm to access
                                              the file.
                                            </span>
                                            <Button
                                              size="sm"
                                              className="h-8 text-xs px-3 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                              disabled={isReceiving}
                                              onClick={() =>
                                                handleReceiveServiceReport(
                                                  selectedProjectPid,
                                                  item,
                                                )
                                              }
                                            >
                                              {isReceiving ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : (
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                              )}
                                              Confirm & Access Report
                                            </Button>
                                          </div>
                                        ) : (
                                          /* Step 1 — prompt client to fill the Google feedback form first */
                                          <div className="flex items-center gap-2">
                                            <div className="flex flex-col items-end gap-0.5">
                                              <span className="text-[13px] text-amber-700 font-medium">
                                                Please complete the feedback
                                                form to access this file.
                                              </span>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs px-3 gap-1 border-amber-400 text-amber-700 hover:bg-amber-50"
                                                onClick={() => {
                                                  window.open(
                                                    "https://docs.google.com/forms/d/e/1FAIpQLSfSI8p9Bo1DvHVxA7efSsKuBzXyQ7Wi4Lxl-2jKL5SN4zkDkw/viewform",
                                                    "_blank",
                                                    "noopener,noreferrer",
                                                  );
                                                  setFormOpenedReports((prev) =>
                                                    new Set(prev).add(item.id),
                                                  );
                                                }}
                                              >
                                                <ArrowRight className="h-3.5 w-3.5" />
                                                Open Feedback Form
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          );
                        })()}
                    </div>
                  );
                })()}
            </div>
          ) : (
            /* ── Dashboard Overview (no project selected) ─────── */
            <div className="h-full overflow-y-auto bg-slate-50/30 p-4 lg:p-6">
              <div className="max-w-4xl mx-auto space-y-6">
                {/* ── Request Progress Timeline ──────────────────── */}
                {portalFeatures.requestProgressTimeline && (
                  <Card className="border border-slate-100 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            Request Progress
                          </p>
                          <p className="text-xs text-slate-500">
                            Track the current stage of your request from inquiry
                            to delivery.
                          </p>
                        </div>
                        {selectedProjectPid &&
                          projectDocuments.get(selectedProjectPid)?.loading && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Loading documents</span>
                            </div>
                          )}
                      </div>

                      <div className="mt-4 overflow-x-auto">
                        <div className="flex items-start gap-6 min-w-max pb-1">
                          {timelineSteps.map((step, index) => (
                            <div
                              key={step.key}
                              className="flex items-center gap-4"
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5">
                                  {step.state === "complete" ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  ) : step.state === "current" ? (
                                    <Clock className="h-4 w-4 text-blue-500" />
                                  ) : (
                                    <span className="h-4 w-4 rounded-full border border-slate-300 block" />
                                  )}
                                </div>
                                <div className="min-w-[160px]">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-slate-700">
                                      {step.label}
                                    </p>
                                    {step.state === "current" && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                        In progress
                                      </span>
                                    )}
                                    {step.state === "complete" && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                                        Completed
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {step.detail}
                                  </p>
                                </div>
                              </div>
                              {index < timelineSteps.length - 1 && (
                                <span
                                  className="h-px w-8 bg-slate-200"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Welcome & Status Header */}
                <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-bl-full -mr-8 -mt-8 opacity-50"></div>
                  <div className="relative">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <h2 className="text-base font-bold bg-gradient-to-r from-[#166FB5] to-[#4038AF] bg-clip-text text-transparent">
                          Welcome to your Workspace
                        </h2>
                        <p className="text-slate-500 text-xs whitespace-nowrap">
                          Review your official quotations and manage your
                          research projects here.
                        </p>
                      </div>

                      {currentInquiry && (
                        <div className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-100 flex items-center gap-3 min-w-[200px]">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center shadow-sm",
                              currentInquiry.status === "Approved Client"
                                ? "bg-green-100 text-green-600"
                                : currentInquiry.status === "Quotation Only"
                                  ? "bg-blue-100 text-blue-600"
                                  : currentInquiry.status === "Cancelled"
                                    ? "bg-red-100 text-red-500"
                                    : "bg-amber-100 text-amber-600",
                            )}
                          >
                            {currentInquiry.status === "Approved Client" ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : currentInquiry.status === "Quotation Only" ? (
                              <FileText className="h-5 w-5" />
                            ) : currentInquiry.status === "Cancelled" ? (
                              <XCircle className="h-5 w-5" />
                            ) : (
                              <Clock className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              Inquiry Status
                            </p>
                            <p className="font-bold text-slate-700 text-sm">
                              {currentInquiry.status}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Documents FIRST, then Summary */}
                  <div className="space-y-6">
                    {/* Official Documents (Quotations) - MOVED UP */}
                    <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-slate-100">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-indigo-500" />
                          Official Documents
                        </h3>
                      </div>

                      {loadingQuotations ? (
                        <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-2">
                          <Loader2 className="h-6 w-6 animate-spin" />
                          <p className="text-xs font-medium">
                            Fetching documents...
                          </p>
                        </div>
                      ) : inquiryQuotations.length === 0 ? (
                        currentInquiry?.status === "Pending" ? (
                          <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-6 text-center space-y-2">
                            <div className="flex justify-center">
                              <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-600">
                                <Clock className="h-6 w-6" />
                              </span>
                            </div>
                            <p className="text-sm font-bold text-amber-900">
                              Awaiting Quotation from Admin
                            </p>
                            <p className="text-xs text-amber-700 leading-relaxed">
                              Your inquiry has been submitted and is currently
                              under review. An official quotation will appear
                              here once the admin has processed your request.
                            </p>
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-xs text-slate-500 italic">
                              No official quotations found for this inquiry yet.
                            </p>
                          </div>
                        )
                      ) : (
                        <div className="space-y-2">
                          {inquiryQuotations.map((quote) => {
                            const qCancelled = quote.status === "cancelled";
                            const isSelected =
                              quote.status === "selected" ||
                              quote.selectedForProject;
                            return (
                              <div
                                key={quote.id}
                                className="rounded-xl border border-slate-100 bg-white shadow-sm p-2.5"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  {/* Left: clickable name + totals */}
                                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                    <a
                                      href={`/client/view-document?type=quotation&ref=${quote.referenceNumber}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-full px-2.5 py-0.5 transition-colors"
                                    >
                                      {quote.referenceNumber}
                                    </a>
                                    <span className="text-[10px] text-slate-500">
                                      Total:{" "}
                                      <span className="font-semibold text-slate-800">
                                        {new Intl.NumberFormat("en-PH", {
                                          style: "currency",
                                          currency: "PHP",
                                        }).format(quote.total)}
                                      </span>
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      Issued:{" "}
                                      <span className="font-medium text-slate-600">
                                        {new Date(
                                          quote.dateIssued,
                                        ).toLocaleDateString("en-US", {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                        })}
                                      </span>
                                    </span>
                                  </div>
                                  {/* Right: status badge + action buttons */}
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {qCancelled ? (
                                      <span className="inline-flex text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                                        Cancelled
                                      </span>
                                    ) : isSelected ? (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                                        <CheckCircle2 className="h-2.5 w-2.5" />{" "}
                                        Selected
                                      </span>
                                    ) : null}
                                    {!qCancelled &&
                                      !isSelected &&
                                      fetchedApprovedProjects.length === 0 &&
                                      currentInquiry?.status !== "Cancelled" &&
                                      currentInquiry?.status !==
                                        "Quotation Only" && (
                                        <Button
                                          size="sm"
                                          onClick={() =>
                                            handleProceedWithService(
                                              quote.referenceNumber,
                                            )
                                          }
                                          className="bg-gradient-to-r from-[#166FB5] to-[#4038AF] text-white hover:opacity-90 font-bold h-8 text-xs"
                                        >
                                          <ArrowRight className="h-3 w-3 mr-1" />
                                          Proceed with Service
                                        </Button>
                                      )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Messages / Communications (Floating) — rendered globally below */}

                    {/* Quotation Request Details (previously Inquiry Details Summary) */}
                    {currentInquiry && (
                      <div className="bg-amber-50/70 border border-amber-100 rounded-xl px-4 py-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <h4 className="text-xs font-bold text-amber-900">
                              Not proceeding with the service?
                            </h4>
                            <p className="text-[11px] text-amber-800">
                              Update this request to "Quotation Only" if you
                              decide to stop.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => setShowCancelInquiryModal(true)}
                            disabled={
                              currentInquiry.status === "Cancelled" ||
                              currentInquiry.status === "Quotation Only" ||
                              currentInquiry.status === "Approved Client" ||
                              cancelInquirySubmitting
                            }
                            className="border-amber-200 text-amber-900 hover:bg-amber-100 font-bold text-xs h-7 shrink-0"
                          >
                            Do Not Proceed
                          </Button>
                        </div>
                        {(currentInquiry.status === "Cancelled" ||
                          currentInquiry.status === "Quotation Only" ||
                          currentInquiry.status === "Approved Client") && (
                          <p className="text-[11px] text-amber-700 mt-1.5">
                            This request is already marked as{" "}
                            {currentInquiry.status}.
                          </p>
                        )}
                      </div>
                    )}

                    {currentInquiry && (
                      <div className="bg-white rounded-2xl px-4 py-4 shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                            <div className="w-2 h-2 bg-gradient-to-r from-[#912ABD] to-[#6E308E] rounded-full"></div>
                            Quotation Request Details
                          </h3>
                        </div>

                        <div className="space-y-5">
                          {/* Laboratory Service Details */}
                          {currentInquiry.serviceType === "laboratory" ? (
                            <div className="space-y-4 animate-in fade-in duration-500">
                              {/* Quick stats row */}
                              <div className="grid grid-cols-3 gap-4 pb-4 border-b border-slate-100">
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                    Service Type
                                  </span>
                                  <p className="text-sm font-semibold text-slate-900">
                                    Laboratory
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                    Species
                                  </span>
                                  <p className="text-sm font-semibold text-slate-900 capitalize italic">
                                    {currentInquiry.species
                                      ? currentInquiry.otherSpecies
                                        ? `${currentInquiry.species}: ${currentInquiry.otherSpecies}`
                                        : currentInquiry.species
                                      : "—"}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                    Sample Count
                                  </span>
                                  <p className="text-sm font-semibold text-slate-900">
                                    {currentInquiry.sampleCount || "—"}
                                  </p>
                                </div>
                              </div>

                              {/* Workflow */}
                              <div className="space-y-1">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                  Workflow / Analysis Strategy
                                </span>
                                <p className="text-sm font-semibold text-slate-900">
                                  {formatWorkflowType(
                                    currentInquiry.workflowType,
                                  ) || "—"}
                                </p>
                              </div>

                              {/* Bioinformatics Analysis badges removed as requested */}

                              {/* complete-bioinfo: full bioinformaticsDetails breakdown */}
                              {currentInquiry.workflowType ===
                                "complete-bioinfo" &&
                                currentInquiry.bioinformaticsDetails && (
                                  <div className="space-y-4 pt-1">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block">
                                      Configure Bioinformatics Analysis
                                    </span>

                                    {/* Service Types */}
                                    <div className="space-y-2">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Type of Bioinformatics Service
                                      </span>
                                      <div className="flex flex-wrap gap-2">
                                        {(Array.isArray(
                                          currentInquiry.bioinformaticsDetails
                                            ?.serviceTypes,
                                        )
                                          ? currentInquiry.bioinformaticsDetails
                                              .serviceTypes
                                          : []
                                        ).length > 0 ? (
                                          (
                                            currentInquiry.bioinformaticsDetails
                                              .serviceTypes as string[]
                                          ).map((serviceType) => {
                                            const labels: Record<
                                              string,
                                              string
                                            > = {
                                              phylogenetic:
                                                "Phylogenetic Analysis",
                                              metabarcoding:
                                                "Metabarcoding/Metagenomics",
                                              transcriptomics:
                                                "Transcriptomics",
                                              "whole-genome-assembly":
                                                "Whole Genome Assembly",
                                              others: "Others",
                                            };
                                            return (
                                              <span
                                                key={serviceType}
                                                className="inline-block text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-2.5 py-1"
                                              >
                                                {labels[serviceType] ||
                                                  serviceType}
                                              </span>
                                            );
                                          })
                                        ) : (
                                          <p className="text-sm text-slate-400 italic">
                                            None selected
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Phylogenetic Analysis */}
                                    {(
                                      (currentInquiry.bioinformaticsDetails
                                        ?.serviceTypes as
                                        | string[]
                                        | undefined) || []
                                    ).includes("phylogenetic") && (
                                      <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                                        <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                          Phylogenetic Analysis Details
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div className="flex flex-col">
                                            <span className="text-xs text-slate-500">
                                              No. of markers
                                            </span>
                                            <span className="text-sm font-medium text-slate-800 mt-0.5">
                                              {currentInquiry
                                                .bioinformaticsDetails
                                                ?.phylogenetic?.markerCount ??
                                                "—"}
                                            </span>
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs text-slate-500">
                                              Marker(s)
                                            </span>
                                            <span className="text-sm font-medium text-slate-800 mt-0.5">
                                              {currentInquiry
                                                .bioinformaticsDetails
                                                ?.phylogenetic?.markers || "—"}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Metabarcoding / Metagenomics */}
                                    {(
                                      (currentInquiry.bioinformaticsDetails
                                        ?.serviceTypes as
                                        | string[]
                                        | undefined) || []
                                    ).includes("metabarcoding") && (
                                      <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                                        <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                          Metabarcoding / Metagenomics Details
                                        </h4>
                                        <div>
                                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            Study Structure
                                          </span>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                            {(
                                              [
                                                {
                                                  label: "Sample type",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.sampleType,
                                                },
                                                {
                                                  label: "No. of samples",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.sampleCount,
                                                },
                                                {
                                                  label:
                                                    "No. of groups / treatments to study",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.groupCount,
                                                },
                                                {
                                                  label:
                                                    "No. of replicates per sample",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.replicatesPerSample,
                                                },
                                                {
                                                  label: "Target gene / marker",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.targetGene,
                                                },
                                                {
                                                  label: "Target region",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.targetRegion,
                                                },
                                                {
                                                  label: "Primer set used",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.primerSet,
                                                },
                                                {
                                                  label:
                                                    "Expected amplicon size",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.ampliconSize,
                                                },
                                                {
                                                  label:
                                                    "Sequencing type and platform",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.metabarcoding?.study
                                                    ?.sequencingPlatform,
                                                },
                                              ] as { label: string; val: any }[]
                                            ).map(({ label, val }) =>
                                              val != null && val !== "" ? (
                                                <div
                                                  key={label}
                                                  className="flex flex-col"
                                                >
                                                  <span className="text-xs text-slate-500">
                                                    {label}
                                                  </span>
                                                  <span className="text-sm font-medium text-slate-800 mt-0.5">
                                                    {val}
                                                  </span>
                                                </div>
                                              ) : null,
                                            )}
                                          </div>
                                        </div>
                                        {currentInquiry.bioinformaticsDetails
                                          ?.metabarcoding?.analysisType && (
                                          <div className="flex flex-col">
                                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                              Analysis Type
                                            </span>
                                            <span className="text-sm font-medium text-slate-800 mt-1">
                                              {currentInquiry
                                                .bioinformaticsDetails
                                                .metabarcoding.analysisType ===
                                              "general-pipeline"
                                                ? "General Pipeline"
                                                : currentInquiry
                                                      .bioinformaticsDetails
                                                      .metabarcoding
                                                      .analysisType ===
                                                    "general-pipeline-downstream"
                                                  ? "General Pipeline with Downstream Analysis"
                                                  : currentInquiry
                                                        .bioinformaticsDetails
                                                        .metabarcoding
                                                        .analysisType ===
                                                      "unsure"
                                                    ? "Unsure"
                                                    : currentInquiry
                                                        .bioinformaticsDetails
                                                        .metabarcoding
                                                        .analysisType}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Transcriptomics */}
                                    {(
                                      (currentInquiry.bioinformaticsDetails
                                        ?.serviceTypes as
                                        | string[]
                                        | undefined) || []
                                    ).includes("transcriptomics") && (
                                      <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                                        <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                          Transcriptomics Details
                                        </h4>
                                        <div>
                                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            Study Structure
                                          </span>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                            {(
                                              [
                                                {
                                                  label: "Sample type",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.transcriptomics?.study
                                                    ?.sampleType,
                                                },
                                                {
                                                  label: "No. of samples",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.transcriptomics?.study
                                                    ?.sampleCount,
                                                },
                                                {
                                                  label:
                                                    "No. of groups / treatments / conditions",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.transcriptomics?.study
                                                    ?.groupCount,
                                                },
                                                {
                                                  label:
                                                    "No. of biological replicates per group",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.transcriptomics?.study
                                                    ?.biologicalReplicates,
                                                },
                                                {
                                                  label:
                                                    "Sequencing type and platform",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.transcriptomics?.study
                                                    ?.sequencingPlatform,
                                                },
                                                {
                                                  label:
                                                    "Estimated sequencing depth per sample",
                                                  val: currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.transcriptomics?.study
                                                    ?.depth,
                                                },
                                              ] as { label: string; val: any }[]
                                            ).map(({ label, val }) =>
                                              val != null && val !== "" ? (
                                                <div
                                                  key={label}
                                                  className="flex flex-col"
                                                >
                                                  <span className="text-xs text-slate-500">
                                                    {label}
                                                  </span>
                                                  <span className="text-sm font-medium text-slate-800 mt-0.5">
                                                    {val}
                                                  </span>
                                                </div>
                                              ) : null,
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            Selected Analyses
                                          </span>
                                          <div className="mt-2 flex flex-wrap gap-1.5">
                                            {(
                                              [
                                                {
                                                  key: "preProcessing",
                                                  label: "Pre-processing",
                                                },
                                                {
                                                  key: "deNovoAssembly",
                                                  label:
                                                    "De novo transcriptome assembly & evaluation",
                                                },
                                                {
                                                  key: "referenceBased",
                                                  label:
                                                    "Reference-based assembly pipeline",
                                                },
                                                {
                                                  key: "orfPrediction",
                                                  label:
                                                    "Open-reading frame prediction",
                                                },
                                                {
                                                  key: "functionalAnnotation",
                                                  label:
                                                    "Functional Annotation",
                                                },
                                              ] as {
                                                key: string;
                                                label: string;
                                              }[]
                                            )
                                              .filter(
                                                ({ key }) =>
                                                  currentInquiry
                                                    .bioinformaticsDetails
                                                    ?.transcriptomics
                                                    ?.analysis?.[key],
                                              )
                                              .map(({ label }) => (
                                                <span
                                                  key={label}
                                                  className="inline-block text-xs font-medium text-purple-700 bg-purple-50 border border-purple-100 rounded px-2.5 py-1"
                                                >
                                                  {label}
                                                </span>
                                              ))}
                                            {currentInquiry
                                              .bioinformaticsDetails
                                              ?.transcriptomics?.unsure && (
                                              <span className="inline-block text-xs font-medium text-slate-600 bg-gray-100 border border-gray-200 rounded px-2.5 py-1">
                                                Unsure
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {/* Whole Genome Assembly */}
                                    {(
                                      (currentInquiry.bioinformaticsDetails
                                        ?.serviceTypes as
                                        | string[]
                                        | undefined) || []
                                    ).includes("whole-genome-assembly") && (
                                      <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                                        <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                          Whole Genome Assembly Details
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3">
                                          {currentInquiry.bioinformaticsDetails
                                            ?.wholeGenomeAssembly
                                            ?.sampleTaxonomy && (
                                            <div className="flex flex-col">
                                              <span className="text-xs text-slate-500">
                                                Sample Taxonomy
                                              </span>
                                              <span className="text-sm font-medium text-slate-800 mt-0.5">
                                                {
                                                  currentInquiry
                                                    .bioinformaticsDetails
                                                    .wholeGenomeAssembly
                                                    .sampleTaxonomy
                                                }
                                              </span>
                                            </div>
                                          )}
                                          {currentInquiry.bioinformaticsDetails
                                            ?.wholeGenomeAssembly
                                            ?.sampleCount && (
                                            <div className="flex flex-col">
                                              <span className="text-xs text-slate-500">
                                                No. of samples
                                              </span>
                                              <span className="text-sm font-medium text-slate-800 mt-0.5">
                                                {
                                                  currentInquiry
                                                    .bioinformaticsDetails
                                                    .wholeGenomeAssembly
                                                    .sampleCount
                                                }
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            Selected Analyses
                                          </span>
                                          <div className="mt-2 flex flex-wrap gap-1.5">
                                            {currentInquiry
                                              .bioinformaticsDetails
                                              ?.wholeGenomeAssembly?.analysis
                                              ?.assembly && (
                                              <span className="inline-block text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1">
                                                Whole Genome Assembly
                                              </span>
                                            )}
                                            {currentInquiry
                                              .bioinformaticsDetails
                                              ?.wholeGenomeAssembly?.analysis
                                              ?.assemblyAnnotation && (
                                              <span className="inline-block text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1">
                                                Whole Genome Assembly and
                                                Annotation
                                              </span>
                                            )}
                                            {currentInquiry
                                              .bioinformaticsDetails
                                              ?.wholeGenomeAssembly?.unsure && (
                                              <span className="inline-block text-xs font-medium text-slate-600 bg-gray-100 border border-gray-200 rounded px-2.5 py-1">
                                                Unsure
                                              </span>
                                            )}
                                          </div>
                                          {currentInquiry.bioinformaticsDetails
                                            ?.wholeGenomeAssembly?.analysis
                                            ?.additionalDownstream && (
                                            <div className="mt-2 flex flex-col">
                                              <span className="text-xs text-slate-500">
                                                Additional Downstream Analysis
                                              </span>
                                              <span className="text-sm font-medium text-slate-800 mt-0.5">
                                                {
                                                  currentInquiry
                                                    .bioinformaticsDetails
                                                    .wholeGenomeAssembly
                                                    .analysis
                                                    .additionalDownstream
                                                }
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Others – Specify */}
                                    {(
                                      (currentInquiry.bioinformaticsDetails
                                        ?.serviceTypes as
                                        | string[]
                                        | undefined) || []
                                    ).includes("others") &&
                                      currentInquiry.bioinformaticsDetails
                                        ?.othersSpecify && (
                                        <div className="space-y-1.5">
                                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                            Others – Specify
                                          </span>
                                          <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap">
                                            {
                                              currentInquiry
                                                .bioinformaticsDetails
                                                .othersSpecify
                                            }
                                          </p>
                                        </div>
                                      )}

                                    {/* Data Section */}
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-1">
                                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                          Provide Own Data
                                        </span>
                                        <p className="text-sm font-semibold text-slate-900">
                                          {currentInquiry.bioinformaticsDetails
                                            ?.dataProvideOwnData
                                            ? "Yes"
                                            : "No"}
                                        </p>
                                      </div>
                                      <div className="space-y-1">
                                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                          Data Generated by PGC Visayas
                                        </span>
                                        <p className="text-sm font-semibold text-slate-900">
                                          {currentInquiry.bioinformaticsDetails
                                            ?.dataProvidedByPgc
                                            ? "Yes"
                                            : "No"}
                                        </p>
                                      </div>
                                    </div>

                                    {currentInquiry.bioinformaticsDetails
                                      ?.dataProvideOwnData && (
                                      <div className="space-y-1.5">
                                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                          Data Details
                                        </span>
                                        <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 text-sm text-slate-700 leading-6 space-y-1">
                                          <p>
                                            <span className="font-medium text-slate-500">
                                              File formats:
                                            </span>{" "}
                                            {Array.isArray(
                                              currentInquiry
                                                .bioinformaticsDetails
                                                ?.dataFileFormats,
                                            ) &&
                                            currentInquiry.bioinformaticsDetails
                                              ?.dataFileFormats.length > 0
                                              ? currentInquiry.bioinformaticsDetails.dataFileFormats.join(
                                                  ", ",
                                                )
                                              : "—"}
                                          </p>
                                          {currentInquiry.bioinformaticsDetails
                                            ?.dataOtherFormat && (
                                            <p>
                                              <span className="font-medium text-slate-500">
                                                Other format:
                                              </span>{" "}
                                              {
                                                currentInquiry
                                                  .bioinformaticsDetails
                                                  .dataOtherFormat
                                              }
                                            </p>
                                          )}
                                          {currentInquiry.bioinformaticsDetails
                                            ?.dataFileSizePerSample && (
                                            <p>
                                              <span className="font-medium text-slate-500">
                                                File size per sample:
                                              </span>{" "}
                                              {
                                                currentInquiry
                                                  .bioinformaticsDetails
                                                  .dataFileSizePerSample
                                              }
                                            </p>
                                          )}
                                          {currentInquiry.bioinformaticsDetails
                                            ?.dataTransferMode && (
                                            <p>
                                              <span className="font-medium text-slate-500">
                                                Transfer mode:
                                              </span>{" "}
                                              {
                                                currentInquiry
                                                  .bioinformaticsDetails
                                                  .dataTransferMode
                                              }
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Overview of Research and Objectives */}
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Overview of Research and Objectives
                                      </span>
                                      <p className="text-sm text-slate-700 leading-6 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 whitespace-pre-wrap">
                                        {currentInquiry.bioinformaticsDetails
                                          ?.overviewObjectives || "—"}
                                      </p>
                                    </div>
                                  </div>
                                )}

                              {/* Individual Assay Details */}
                              {currentInquiry.individualAssayDetails && (
                                <div className="space-y-1.5">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                    Individual Assay Details
                                  </span>
                                  <p className="text-sm text-slate-700 leading-6 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 whitespace-pre-wrap">
                                    {currentInquiry.individualAssayDetails}
                                  </p>
                                </div>
                              )}

                              {/* Research Overview */}
                              <div className="space-y-1.5">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                  Research Overview
                                </span>
                                <p className="text-sm text-slate-700 leading-6 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                                  {currentInquiry.researchOverview || "—"}
                                </p>
                              </div>

                              {/* Methodology File */}
                              {currentInquiry.methodologyFileUrl && (
                                <div className="space-y-1.5">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                    Methodology / Concept Note
                                  </span>
                                  <a
                                    href={currentInquiry.methodologyFileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#166FB5] bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
                                  >
                                    View Uploaded Methodology
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Other Services (Research, Training, Retail, etc.) */
                            <div className="space-y-4 animate-in fade-in duration-500">
                              {/* Top Section: Quick Stats */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-slate-100">
                                {/* Service Type */}
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                    Service Type
                                  </span>
                                  <p className="text-sm font-semibold text-slate-900 capitalize">
                                    {formatServiceType(
                                      currentInquiry.serviceType,
                                    )}
                                  </p>
                                </div>

                                {/* Sample Count */}
                                {currentInquiry.sampleCount && (
                                  <div className="space-y-1">
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                      Quantity
                                    </span>
                                    <p className="text-sm font-semibold text-slate-900">
                                      {currentInquiry.sampleCount} samples
                                    </p>
                                  </div>
                                )}

                                {/* Retail Sales Details Section */}
                                {currentInquiry.serviceType === "retail" &&
                                  currentInquiry.retailItems &&
                                  currentInquiry.retailItems.length > 0 && (
                                    <div className="space-y-2 sm:col-span-3">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Requested Items
                                      </span>
                                      <div className="grid grid-cols-1 gap-2">
                                        {currentInquiry.retailItems.map(
                                          (item, idx) => (
                                            <div
                                              key={`${item}-${idx}`}
                                              className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-100"
                                            >
                                              <span className="text-sm font-medium text-slate-800">
                                                {item}
                                              </span>
                                              {currentInquiry
                                                .retailItemDetails?.[item] && (
                                                <span className="text-sm text-[#166FB5] font-semibold">
                                                  {
                                                    currentInquiry
                                                      .retailItemDetails[item]
                                                  }
                                                </span>
                                              )}
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  )}
                              </div>

                              {currentInquiry.serviceType ===
                                "bioinformatics" && (
                                <div className="space-y-4">
                                  {/* Service Types */}
                                  <div className="space-y-2">
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                      Type of Bioinformatics Service
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                      {(Array.isArray(
                                        currentInquiry.bioinformaticsDetails
                                          ?.serviceTypes,
                                      )
                                        ? currentInquiry.bioinformaticsDetails
                                            ?.serviceTypes
                                        : []
                                      ).length > 0 ? (
                                        (
                                          currentInquiry.bioinformaticsDetails
                                            ?.serviceTypes as string[]
                                        ).map((serviceType) => {
                                          const labels: Record<string, string> =
                                            {
                                              phylogenetic:
                                                "Phylogenetic Analysis",
                                              metabarcoding:
                                                "Metabarcoding/Metagenomics",
                                              transcriptomics:
                                                "Transcriptomics",
                                              "whole-genome-assembly":
                                                "Whole Genome Assembly",
                                              others: "Others",
                                            };
                                          return (
                                            <span
                                              key={serviceType}
                                              className="inline-block text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-2.5 py-1"
                                            >
                                              {labels[serviceType] ||
                                                serviceType}
                                            </span>
                                          );
                                        })
                                      ) : (
                                        <p className="text-sm text-slate-400 italic">
                                          None selected
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Phylogenetic Analysis */}
                                  {(
                                    (currentInquiry.bioinformaticsDetails
                                      ?.serviceTypes as string[] | undefined) ||
                                    []
                                  ).includes("phylogenetic") && (
                                    <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                                      <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                        Phylogenetic Analysis Details
                                      </h4>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col">
                                          <span className="text-xs text-slate-500">
                                            No. of markers
                                          </span>
                                          <span className="text-sm font-medium text-slate-800 mt-0.5">
                                            {currentInquiry
                                              .bioinformaticsDetails
                                              ?.phylogenetic?.markerCount ??
                                              "—"}
                                          </span>
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-xs text-slate-500">
                                            Marker(s)
                                          </span>
                                          <span className="text-sm font-medium text-slate-800 mt-0.5">
                                            {currentInquiry
                                              .bioinformaticsDetails
                                              ?.phylogenetic?.markers || "—"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Metabarcoding / Metagenomics */}
                                  {(
                                    (currentInquiry.bioinformaticsDetails
                                      ?.serviceTypes as string[] | undefined) ||
                                    []
                                  ).includes("metabarcoding") && (
                                    <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                                      <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                        Metabarcoding / Metagenomics Details
                                      </h4>
                                      <div>
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                          Study Structure
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                          {(
                                            [
                                              {
                                                label: "Sample type",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.sampleType,
                                              },
                                              {
                                                label: "No. of samples",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.sampleCount,
                                              },
                                              {
                                                label:
                                                  "No. of groups / treatments to study",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.groupCount,
                                              },
                                              {
                                                label:
                                                  "No. of replicates per sample",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.replicatesPerSample,
                                              },
                                              {
                                                label: "Target gene / marker",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.targetGene,
                                              },
                                              {
                                                label: "Target region",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.targetRegion,
                                              },
                                              {
                                                label: "Primer set used",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.primerSet,
                                              },
                                              {
                                                label: "Expected amplicon size",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.ampliconSize,
                                              },
                                              {
                                                label:
                                                  "Sequencing type and platform",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.metabarcoding?.study
                                                  ?.sequencingPlatform,
                                              },
                                            ] as { label: string; val: any }[]
                                          ).map(({ label, val }) =>
                                            val != null && val !== "" ? (
                                              <div
                                                key={label}
                                                className="flex flex-col"
                                              >
                                                <span className="text-xs text-slate-500">
                                                  {label}
                                                </span>
                                                <span className="text-sm font-medium text-slate-800 mt-0.5">
                                                  {val}
                                                </span>
                                              </div>
                                            ) : null,
                                          )}
                                        </div>
                                      </div>
                                      {currentInquiry.bioinformaticsDetails
                                        ?.metabarcoding?.analysisType && (
                                        <div className="flex flex-col">
                                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            Analysis Type
                                          </span>
                                          <span className="text-sm font-medium text-slate-800 mt-1">
                                            {currentInquiry
                                              .bioinformaticsDetails
                                              .metabarcoding.analysisType ===
                                            "general-pipeline"
                                              ? "General Pipeline"
                                              : currentInquiry
                                                    .bioinformaticsDetails
                                                    .metabarcoding
                                                    .analysisType ===
                                                  "general-pipeline-downstream"
                                                ? "General Pipeline with Downstream Analysis"
                                                : currentInquiry
                                                      .bioinformaticsDetails
                                                      .metabarcoding
                                                      .analysisType === "unsure"
                                                  ? "Unsure"
                                                  : currentInquiry
                                                      .bioinformaticsDetails
                                                      .metabarcoding
                                                      .analysisType}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Transcriptomics */}
                                  {(
                                    (currentInquiry.bioinformaticsDetails
                                      ?.serviceTypes as string[] | undefined) ||
                                    []
                                  ).includes("transcriptomics") && (
                                    <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                                      <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                        Transcriptomics Details
                                      </h4>
                                      <div>
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                          Study Structure
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                          {(
                                            [
                                              {
                                                label: "Sample type",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.transcriptomics?.study
                                                  ?.sampleType,
                                              },
                                              {
                                                label: "No. of samples",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.transcriptomics?.study
                                                  ?.sampleCount,
                                              },
                                              {
                                                label:
                                                  "No. of groups / treatments / conditions",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.transcriptomics?.study
                                                  ?.groupCount,
                                              },
                                              {
                                                label:
                                                  "No. of biological replicates per group",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.transcriptomics?.study
                                                  ?.biologicalReplicates,
                                              },
                                              {
                                                label:
                                                  "Sequencing type and platform",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.transcriptomics?.study
                                                  ?.sequencingPlatform,
                                              },
                                              {
                                                label:
                                                  "Estimated sequencing depth per sample",
                                                val: currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.transcriptomics?.study
                                                  ?.depth,
                                              },
                                            ] as { label: string; val: any }[]
                                          ).map(({ label, val }) =>
                                            val != null && val !== "" ? (
                                              <div
                                                key={label}
                                                className="flex flex-col"
                                              >
                                                <span className="text-xs text-slate-500">
                                                  {label}
                                                </span>
                                                <span className="text-sm font-medium text-slate-800 mt-0.5">
                                                  {val}
                                                </span>
                                              </div>
                                            ) : null,
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                          Selected Analyses
                                        </span>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {(
                                            [
                                              {
                                                key: "preProcessing",
                                                label: "Pre-processing",
                                              },
                                              {
                                                key: "deNovoAssembly",
                                                label:
                                                  "De novo transcriptome assembly & evaluation",
                                              },
                                              {
                                                key: "referenceBased",
                                                label:
                                                  "Reference-based assembly pipeline",
                                              },
                                              {
                                                key: "orfPrediction",
                                                label:
                                                  "Open-reading frame prediction",
                                              },
                                              {
                                                key: "functionalAnnotation",
                                                label: "Functional Annotation",
                                              },
                                            ] as {
                                              key: string;
                                              label: string;
                                            }[]
                                          )
                                            .filter(
                                              ({ key }) =>
                                                currentInquiry
                                                  .bioinformaticsDetails
                                                  ?.transcriptomics?.analysis?.[
                                                  key
                                                ],
                                            )
                                            .map(({ label }) => (
                                              <span
                                                key={label}
                                                className="inline-block text-xs font-medium text-purple-700 bg-purple-50 border border-purple-100 rounded px-2.5 py-1"
                                              >
                                                {label}
                                              </span>
                                            ))}
                                          {currentInquiry.bioinformaticsDetails
                                            ?.transcriptomics?.unsure && (
                                            <span className="inline-block text-xs font-medium text-slate-600 bg-gray-100 border border-gray-200 rounded px-2.5 py-1">
                                              Unsure
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Whole Genome Assembly */}
                                  {(
                                    (currentInquiry.bioinformaticsDetails
                                      ?.serviceTypes as string[] | undefined) ||
                                    []
                                  ).includes("whole-genome-assembly") && (
                                    <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                                      <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                                        Whole Genome Assembly Details
                                      </h4>
                                      <div className="grid grid-cols-2 gap-3">
                                        {currentInquiry.bioinformaticsDetails
                                          ?.wholeGenomeAssembly
                                          ?.sampleTaxonomy && (
                                          <div className="flex flex-col">
                                            <span className="text-xs text-slate-500">
                                              Sample Taxonomy
                                            </span>
                                            <span className="text-sm font-medium text-slate-800 mt-0.5">
                                              {
                                                currentInquiry
                                                  .bioinformaticsDetails
                                                  .wholeGenomeAssembly
                                                  .sampleTaxonomy
                                              }
                                            </span>
                                          </div>
                                        )}
                                        {currentInquiry.bioinformaticsDetails
                                          ?.wholeGenomeAssembly
                                          ?.sampleCount && (
                                          <div className="flex flex-col">
                                            <span className="text-xs text-slate-500">
                                              No. of samples
                                            </span>
                                            <span className="text-sm font-medium text-slate-800 mt-0.5">
                                              {
                                                currentInquiry
                                                  .bioinformaticsDetails
                                                  .wholeGenomeAssembly
                                                  .sampleCount
                                              }
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                          Selected Analyses
                                        </span>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {currentInquiry.bioinformaticsDetails
                                            ?.wholeGenomeAssembly?.analysis
                                            ?.assembly && (
                                            <span className="inline-block text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1">
                                              Whole Genome Assembly
                                            </span>
                                          )}
                                          {currentInquiry.bioinformaticsDetails
                                            ?.wholeGenomeAssembly?.analysis
                                            ?.assemblyAnnotation && (
                                            <span className="inline-block text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1">
                                              Whole Genome Assembly and
                                              Annotation
                                            </span>
                                          )}
                                          {currentInquiry.bioinformaticsDetails
                                            ?.wholeGenomeAssembly?.unsure && (
                                            <span className="inline-block text-xs font-medium text-slate-600 bg-gray-100 border border-gray-200 rounded px-2.5 py-1">
                                              Unsure
                                            </span>
                                          )}
                                        </div>
                                        {currentInquiry.bioinformaticsDetails
                                          ?.wholeGenomeAssembly?.analysis
                                          ?.additionalDownstream && (
                                          <div className="mt-2 flex flex-col">
                                            <span className="text-xs text-slate-500">
                                              Additional Downstream Analysis
                                            </span>
                                            <span className="text-sm font-medium text-slate-800 mt-0.5">
                                              {
                                                currentInquiry
                                                  .bioinformaticsDetails
                                                  .wholeGenomeAssembly.analysis
                                                  .additionalDownstream
                                              }
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Others – Specify */}
                                  {(
                                    (currentInquiry.bioinformaticsDetails
                                      ?.serviceTypes as string[] | undefined) ||
                                    []
                                  ).includes("others") &&
                                    currentInquiry.bioinformaticsDetails
                                      ?.othersSpecify && (
                                      <div className="space-y-1.5">
                                        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                          Others – Specify
                                        </span>
                                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap">
                                          {
                                            currentInquiry.bioinformaticsDetails
                                              .othersSpecify
                                          }
                                        </p>
                                      </div>
                                    )}

                                  {/* Data Section */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Provide Own Data
                                      </span>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {currentInquiry.bioinformaticsDetails
                                          ?.dataProvideOwnData
                                          ? "Yes"
                                          : "No"}
                                      </p>
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Data Generated by PGC Visayas
                                      </span>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {currentInquiry.bioinformaticsDetails
                                          ?.dataProvidedByPgc
                                          ? "Yes"
                                          : "No"}
                                      </p>
                                    </div>
                                  </div>

                                  {currentInquiry.bioinformaticsDetails
                                    ?.dataProvideOwnData && (
                                    <div className="space-y-1.5">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Data Details
                                      </span>
                                      <div className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 text-sm text-slate-700 leading-6 space-y-1">
                                        <p>
                                          <span className="font-medium text-slate-500">
                                            File formats:
                                          </span>{" "}
                                          {Array.isArray(
                                            currentInquiry.bioinformaticsDetails
                                              ?.dataFileFormats,
                                          ) &&
                                          currentInquiry.bioinformaticsDetails
                                            ?.dataFileFormats.length > 0
                                            ? currentInquiry.bioinformaticsDetails.dataFileFormats.join(
                                                ", ",
                                              )
                                            : "—"}
                                        </p>
                                        {currentInquiry.bioinformaticsDetails
                                          ?.dataOtherFormat && (
                                          <p>
                                            <span className="font-medium text-slate-500">
                                              Other format:
                                            </span>{" "}
                                            {
                                              currentInquiry
                                                .bioinformaticsDetails
                                                .dataOtherFormat
                                            }
                                          </p>
                                        )}
                                        {currentInquiry.bioinformaticsDetails
                                          ?.dataFileSizePerSample && (
                                          <p>
                                            <span className="font-medium text-slate-500">
                                              File size per sample:
                                            </span>{" "}
                                            {
                                              currentInquiry
                                                .bioinformaticsDetails
                                                .dataFileSizePerSample
                                            }
                                          </p>
                                        )}
                                        {currentInquiry.bioinformaticsDetails
                                          ?.dataTransferMode && (
                                          <p>
                                            <span className="font-medium text-slate-500">
                                              Transfer mode:
                                            </span>{" "}
                                            {
                                              currentInquiry
                                                .bioinformaticsDetails
                                                .dataTransferMode
                                            }
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Overview of Research and Objectives */}
                                  <div className="space-y-1.5">
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                      Overview of Research and Objectives
                                    </span>
                                    <p className="text-sm text-slate-700 leading-6 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 whitespace-pre-wrap">
                                      {currentInquiry.bioinformaticsDetails
                                        ?.overviewObjectives || "—"}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* Technical Block */}
                              {(currentInquiry.species ||
                                currentInquiry.workflowType) && (
                                <div className="grid grid-cols-2 gap-4">
                                  {currentInquiry.species && (
                                    <div className="space-y-1">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Species / Organism
                                      </span>
                                      <p className="text-sm font-semibold text-slate-900 capitalize">
                                        {currentInquiry.otherSpecies
                                          ? `${currentInquiry.species}: ${currentInquiry.otherSpecies}`
                                          : currentInquiry.species}
                                      </p>
                                    </div>
                                  )}

                                  {currentInquiry.workflowType && (
                                    <div className="space-y-1">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Analysis Strategy
                                      </span>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {formatWorkflowType(
                                          currentInquiry.workflowType,
                                        )}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Bioinformatics Options */}
                              {currentInquiry.workflowType ===
                                "complete-bioinfo" &&
                                currentInquiry.bioinfoOptions &&
                                currentInquiry.bioinfoOptions.length > 0 && (
                                  <div className="space-y-2">
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                      Selected Bioinformatics Analysis
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                      {currentInquiry.bioinfoOptions.map(
                                        (option) => (
                                          <span
                                            key={option}
                                            className="inline-block text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-2.5 py-1"
                                          >
                                            {formatBioinfoOption(option)}
                                          </span>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}

                          {/* Specific Needs & Assays (Common for all) */}
                          {currentInquiry.individualAssayDetails && (
                            <div className="space-y-1.5">
                              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                Selected Assays
                              </span>
                              <p className="text-sm text-slate-700 leading-6 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                                {currentInquiry.individualAssayDetails}
                              </p>
                            </div>
                          )}

                          {/* Research Narrative (Only for non-research, non-laboratory services) */}
                          {currentInquiry.serviceType !== "research" &&
                            currentInquiry.serviceType !== "laboratory" &&
                            currentInquiry.researchOverview && (
                              <div className="space-y-1.5">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                  Objectives & Brief Overview
                                </span>
                                <p className="text-sm text-slate-700 leading-6 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                                  {currentInquiry.researchOverview}
                                </p>
                              </div>
                            )}

                          {/* Research & Collaboration Details */}
                          {currentInquiry.serviceType === "research" &&
                            (currentInquiry.researchOverview ||
                              currentInquiry.projectBackground ||
                              currentInquiry.molecularServicesBudget ||
                              currentInquiry.plannedSampleCount) && (
                              <div className="space-y-4 border-t border-slate-100 pt-4">
                                {(currentInquiry.researchOverview ||
                                  currentInquiry.projectBackground) && (
                                  <div className="space-y-1.5">
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                      Overview of Research, Objectives & Scope
                                    </span>
                                    <p className="text-sm text-slate-700 leading-6 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 whitespace-pre-wrap">
                                      {currentInquiry.researchOverview ||
                                        currentInquiry.projectBackground}
                                    </p>
                                  </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {currentInquiry.molecularServicesBudget && (
                                    <div className="space-y-1">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Molecular Services Budget
                                      </span>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {currentInquiry.molecularServicesBudget}
                                      </p>
                                    </div>
                                  )}
                                  {currentInquiry.plannedSampleCount && (
                                    <div className="space-y-1">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Planned Sample Count
                                      </span>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {currentInquiry.plannedSampleCount}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                          {/* Training Details */}
                          {currentInquiry.serviceType === "training" &&
                            ((currentInquiry.trainingPrograms &&
                              currentInquiry.trainingPrograms.length > 0) ||
                              currentInquiry.specificTrainingNeed ||
                              currentInquiry.targetTrainingDate ||
                              currentInquiry.numberOfParticipants) && (
                              <div className="space-y-4 border-t border-slate-100 pt-4">
                                {currentInquiry.trainingPrograms &&
                                  currentInquiry.trainingPrograms.length >
                                    0 && (
                                    <div className="space-y-2">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Training Programs
                                      </span>
                                      <div className="flex flex-wrap gap-2">
                                        {currentInquiry.trainingPrograms.map(
                                          (program, index) => (
                                            <span
                                              key={`${program}-${index}`}
                                              className="inline-block text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded px-2.5 py-1"
                                            >
                                              {program === "others-customized"
                                                ? "Others / Customized Training Program"
                                                : program}
                                            </span>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  )}

                                <div className="grid grid-cols-2 gap-4">
                                  {currentInquiry.targetTrainingDate && (
                                    <div className="space-y-1">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Requested Date
                                      </span>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {new Date(
                                          currentInquiry.targetTrainingDate,
                                        ).toLocaleDateString("en-US", {
                                          year: "numeric",
                                          month: "long",
                                          day: "numeric",
                                        })}
                                      </p>
                                    </div>
                                  )}
                                  {currentInquiry.numberOfParticipants && (
                                    <div className="space-y-1">
                                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                        Attendance
                                      </span>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {currentInquiry.numberOfParticipants}{" "}
                                        pax
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {currentInquiry.specificTrainingNeed && (
                                  <div className="space-y-1.5">
                                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide block">
                                      Customized Training Details
                                    </span>
                                    <p className="text-sm text-slate-700 leading-6 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 whitespace-pre-wrap">
                                      {currentInquiry.specificTrainingNeed}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                          {/* Submission Footer */}
                          <div className="pt-3 flex items-center justify-between gap-3 border-t border-slate-100">
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              <span className="text-xs">
                                Submitted{" "}
                                {currentInquiry.createdAt
                                  ? new Date(
                                      currentInquiry.createdAt,
                                    ).toLocaleDateString("en-US", {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="truncate max-w-[200px] font-medium">
                                {currentInquiry.affiliation}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Personal Information of Submitter */}
                    {currentInquiry && (
                      <div className="bg-white rounded-2xl px-4 py-4 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-2 h-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"></div>
                          <h3 className="text-base font-semibold text-slate-800">
                            Personal Information
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Full Name */}
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                              <User className="h-3 w-3" />
                              Full Name
                            </span>
                            <p className="text-sm font-semibold text-slate-900">
                              {currentInquiry.name || "—"}
                            </p>
                          </div>

                          {/* Email */}
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                              <Mail className="h-3 w-3" />
                              Email Address
                            </span>
                            <p className="text-sm font-semibold text-slate-900 break-all">
                              {currentInquiry.email || "—"}
                            </p>
                          </div>

                          {/* Designation */}
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                              <Briefcase className="h-3 w-3" />
                              Designation / Title
                            </span>
                            <p className="text-sm font-semibold text-slate-900">
                              {currentInquiry.designation || "—"}
                            </p>
                          </div>

                          {/* Affiliation */}
                          <div className="space-y-1">
                            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                              <Building2 className="h-3 w-3" />
                              Institution / Affiliation
                            </span>
                            <p className="text-sm font-semibold text-slate-900">
                              {currentInquiry.affiliation || "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Global Chat Widget (persists across all inquiry selections) ── */}
      {allInquiries.length > 0 && (
        <FloatingChatWidget
          inquiryId={currentInquiry?.id ?? allInquiries[0]?.id ?? ""}
          role="client"
          allInquiries={allInquiries}
          onThreadSwitch={(threadId) => {
            if (threadId === inquiryIdParam) return;
            userSelectedInquiryRef.current = true;
            userWantsWorkspaceRef.current = true;
            setSelectedProjectPid(null);
            setProjectDetails(null);
            const params = new URLSearchParams();
            if (emailParam) params.set("email", emailParam);
            params.set("inquiryId", threadId);
            router.push(`/client/client-info?${params.toString()}`);
          }}
        />
      )}

      {/* ═════ MODALS ═════ */}

      {/* Confirm save modal */}
      <ConfirmationModalLayout
        open={showConfirmModal}
        onConfirm={handleConfirmSave}
        onCancel={() => {
          setShowConfirmModal(false);
          setPendingMemberId(null);
          // Re-enable draft button for this member if it was disabled
          if (pendingMemberId) {
            savingDraftIdsRef.current.delete(pendingMemberId);
          }
          setActiveSavingId(null);
        }}
        loading={submitting}
        title="Confirm Member Information"
        description="Review the details below carefully. Once confirmed, the form will be locked and can no longer be edited directly."
        confirmLabel="Yes, Confirm & Lock"
        cancelLabel="Not Yet — Go Back"
        className="max-w-2xl"
      >
        {pendingMemberId &&
          (() => {
            const member = members.find((m) => m.id === pendingMemberId);
            if (!member) return null;
            return (
              <div className="space-y-4">
                {/* Profile Header Card - Compact */}
                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#166FB5] to-[#4038AF] flex items-center justify-center shadow-md flex-shrink-0">
                    <User className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div>
                      <h3 className="font-bold text-base text-slate-800 truncate">
                        {member.formData.name || "Unnamed Member"}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">
                          {member.formData.email || "No email provided"}
                        </span>
                      </div>
                    </div>
                    {member.isPrimary && (
                      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 text-[10px] px-2 py-0.5 h-auto self-start sm:self-center">
                        Primary Contact
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Details Grid - 3 Columns for wider layout */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  {/* Affiliation */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                      <Building2 className="h-3 w-3" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        Affiliation
                      </span>
                    </div>
                    <p
                      className="font-medium text-slate-700 truncate text-xs sm:text-sm"
                      title={member.formData.affiliation}
                    >
                      {member.formData.affiliation || "—"}
                    </p>
                  </div>

                  {/* Designation */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                      <Briefcase className="h-3 w-3" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        Designation
                      </span>
                    </div>
                    <p
                      className="font-medium text-slate-700 truncate text-xs sm:text-sm"
                      title={member.formData.designation}
                    >
                      {member.formData.designation || "—"}
                    </p>
                  </div>

                  {/* Mobile Number */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                      <Smartphone className="h-3 w-3" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        Mobile
                      </span>
                    </div>
                    <p className="font-medium text-slate-700 font-mono text-xs sm:text-sm">
                      {member.formData.phoneNumber || "—"}
                    </p>
                  </div>

                  {/* Sex */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                      <User className="h-3 w-3" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        Sex
                      </span>
                    </div>
                    <p className="font-medium text-slate-700 text-xs sm:text-sm">
                      {member.formData.sex === "M"
                        ? "Male"
                        : member.formData.sex === "F"
                          ? "Female"
                          : member.formData.sex || "—"}
                    </p>
                  </div>

                  {/* Address - Spans 2 cols */}
                  <div className="sm:col-span-2 bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
                      <MapPin className="h-3 w-3" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        Affiliation Address
                      </span>
                    </div>
                    <p
                      className="font-medium text-slate-700 truncate text-xs sm:text-sm"
                      title={member.formData.affiliationAddress}
                    >
                      {member.formData.affiliationAddress || "—"}
                    </p>
                  </div>
                </div>

                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 flex items-start gap-2.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 text-amber-500 mt-0.5 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-amber-700 leading-snug">
                      This action will lock the form.
                    </p>
                    <p className="text-[11px] text-amber-600 leading-snug">
                      Once confirmed, all fields will be read-only and cannot be
                      edited. If you&apos;re not yet sure, click{" "}
                      <span className="font-semibold">
                        &quot;Not Yet — Go Back&quot;
                      </span>{" "}
                      and use the{" "}
                      <span className="font-semibold">
                        &quot;Save Draft&quot;
                      </span>{" "}
                      button instead to save your progress without locking.
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
      </ConfirmationModalLayout>

      {/* Delete confirmation modal */}
      <ConfirmationModalLayout
        open={showDeleteModal}
        onConfirm={confirmRemoveMember}
        onCancel={() => {
          setShowDeleteModal(false);
          setMemberToDelete(null);
        }}
        loading={false}
        title="Remove Member"
        description="Are you sure you want to remove this team member from the project?"
        confirmLabel="Remove Member"
        cancelLabel="Cancel"
        className="max-w-xl"
      >
        {memberToDelete &&
          (() => {
            const member = members.find((m) => m.id === memberToDelete);
            if (!member) return null;
            return (
              <div className="space-y-4">
                {/* Profile Header Card - Compact */}
                <div className="flex items-center gap-4 bg-red-50 p-3 rounded-xl border border-red-100">
                  <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shadow-sm flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-base text-slate-800 truncate">
                      {member.formData.name || "Unnamed Member"}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">
                        {member.formData.email || "No email provided"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Warning Message */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p className="text-sm text-slate-600">
                    This will remove{" "}
                    <strong>{member.formData.name || "this member"}</strong>{" "}
                    from the current list.
                    {member.isDraft
                      ? " Since this is a draft, the data will be permanently deleted."
                      : " If this member has already been submitted, this request will need approval."}
                  </p>
                </div>
              </div>
            );
          })()}
      </ConfirmationModalLayout>

      {/* Submit for approval confirmation modal */}
      <ConfirmationModalLayout
        open={showSubmitForApprovalModal}
        onConfirm={handleConfirmSubmitForApproval}
        onCancel={() => {
          setShowSubmitForApprovalModal(false);
        }}
        loading={submitting}
        title="📋 Final Review & Confirmation"
        description="Please review the team members below before final submission. This is the last step before administrator review."
        confirmLabel="Submit to Administrator"
        cancelLabel="Go Back"
      >
        <div className="space-y-4">
          {/* Progress Indicator */}
          <div className="flex items-center gap-2 mb-3">
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-800 flex items-center gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />
              Step 2 of 3
            </Badge>
            <span className="text-xs text-slate-500">Review Team Members</span>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-bold mb-3 border-b border-blue-100 pb-1">
              Other Member/s:
            </p>
            <div className="space-y-4">
              {members
                .filter((m) => m.isDraft && !m.isPrimary)
                .map((m) => (
                  <div key={m.id} className="text-sm text-blue-700 space-y-1">
                    <div>
                      <strong className="text-blue-900">Name:</strong>{" "}
                      {m.formData.name || "—"}
                    </div>
                    <div>
                      <strong className="text-blue-900">Email:</strong>{" "}
                      {m.formData.email || "—"}
                    </div>
                    <div>
                      <strong className="text-blue-900">Affiliation:</strong>{" "}
                      {m.formData.affiliation || "—"}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </ConfirmationModalLayout>

      {/* Submit project for approval confirmation modal */}
      <ConfirmationModalLayout
        open={showSubmitProjectModal}
        onConfirm={handleConfirmSubmitProject}
        onCancel={() => {
          setShowSubmitProjectModal(false);
        }}
        loading={submitting}
        title="📋 Final Review & Confirmation"
        description="Please review your project and member information below before final submission to administrators."
        confirmLabel="Submit to Administrator"
        cancelLabel="Go Back"
      >
        <div className="space-y-4">
          {/* Progress Indicator */}
          <div className="flex items-center gap-2 mb-3">
            <Badge
              variant="secondary"
              className="bg-blue-100 text-blue-800 flex items-center gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />
              Step 2 of 3
            </Badge>
            <span className="text-xs text-slate-500">
              Review Project Details
            </span>
          </div>

          {projectRequest && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-900 mb-2">
                Project Details:
              </p>
              <div className="space-y-1 text-xs text-blue-800">
                <div>
                  <strong>Title:</strong> {projectRequest.title}
                </div>
                <div>
                  <strong>Lead:</strong> {projectRequest.projectLead}
                </div>
                <div>
                  <strong>Sending Institution:</strong>{" "}
                  {projectRequest.sendingInstitution}
                </div>
                <div>
                  <strong>Funding Institution:</strong>{" "}
                  {projectRequest.fundingInstitution}
                </div>
              </div>
            </div>
          )}
          {primaryMember && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-green-900 mb-2">
                Primary Member:
              </p>
              <div className="space-y-1 text-xs text-green-800">
                <div>
                  <strong>Name:</strong> {primaryMember.formData.name}
                </div>
                <div>
                  <strong>Email:</strong> {primaryMember.formData.email}
                </div>
                <div>
                  <strong>Affiliation:</strong>{" "}
                  {primaryMember.formData.affiliation}
                </div>
              </div>
            </div>
          )}

          {members.filter((m) => !m.isPrimary && m.isDraft).length > 0 && (
            <div className="bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1">
                Other Member/s:
              </p>
              <div className="space-y-4">
                {members
                  .filter((m) => !m.isDraft || !m.isPrimary) // Adjusted filter to be more reliable
                  .filter((m) => !m.isPrimary && m.isDraft) // Keeping existing logic for clarity
                  .map((m) => (
                    <div
                      key={m.id}
                      className="space-y-1 text-xs text-slate-700"
                    >
                      <div>
                        <strong className="text-slate-900">Name:</strong>{" "}
                        {m.formData.name || "—"}
                      </div>
                      <div>
                        <strong className="text-slate-900">Email:</strong>{" "}
                        {m.formData.email || "—"}
                      </div>
                      <div>
                        <strong className="text-slate-900">Affiliation:</strong>{" "}
                        {m.formData.affiliation || "—"}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </ConfirmationModalLayout>

      {/* Client Conforme — must be agreed before final submission */}
      <ClientConformeModal
        open={showConformeModal}
        onConfirm={handleConformeConfirm}
        onCancel={() => {
          setShowConformeModal(false);
          setConformePendingAction(null);
          // Mark as abandoned if user cancels after agreeing
          updateConformeStatus("abandoned");
        }}
        loading={submitting}
        clientName={members.find((m) => m.isPrimary)?.formData.name ?? ""}
        designation={
          members.find((m) => m.isPrimary)?.formData.designation ?? ""
        }
        affiliation={
          members.find((m) => m.isPrimary)?.formData.affiliation ?? ""
        }
        projectTitle={projectRequest?.title ?? projectDetails?.title ?? ""}
        fundingAgency={
          projectRequest?.fundingInstitution ??
          projectDetails?.fundingInstitution ??
          ""
        }
        inquiryId={inquiryIdParam ?? ""}
        clientEmail={user?.email ?? ""}
        clientUid={user?.uid ?? undefined}
        projectPid={selectedProjectPid ?? undefined}
        projectRequestId={currentProjectRequestId ?? undefined}
      />

      {/* Proceed with Service Confirmation Modal */}
      <AlertDialog open={showProceedModal} onOpenChange={setShowProceedModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Proceed with Service?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to proceed with the service using{" "}
              <strong>Quotation: {selectedQuotationRef}</strong>?
              <br />
              <br />
              You will be redirected to the Project Information Form to create
              your project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowProceedModal(false);
                setSelectedQuotationRef(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmProceedWithService}>
              Yes, Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Do Not Proceed Confirmation Modal */}
      <AlertDialog
        open={showCancelInquiryModal}
        onOpenChange={setShowCancelInquiryModal}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change to "Quotation Only"?</AlertDialogTitle>
            <AlertDialogDescription>
              Select this if you only need the quotation for reference and do
              not wish to proceed with the service at this time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-xs text-slate-600">
              Reason (optional)
            </Label>
            <Textarea
              id="cancel-reason"
              value={cancelInquiryReason}
              onChange={(event) => setCancelInquiryReason(event.target.value)}
              rows={3}
              placeholder="e.g., Budgeting purposes, project deferred, etc."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowCancelInquiryModal(false);
                setCancelInquiryReason("");
              }}
            >
              Go Back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancelInquiry}
              className="bg-[#166FB5] hover:bg-[#166FB5]/90"
              disabled={cancelInquirySubmitting}
            >
              Confirm Quotation Only
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Password Modal */}
      <AlertDialog
        open={showChangePasswordModal}
        onOpenChange={(open) => {
          if (!open && !changePwLoading) {
            setShowChangePasswordModal(false);
            setChangePwCurrent("");
            setChangePwNew("");
            setChangePwConfirm("");
            setChangePwError(null);
            setChangePwSuccess(false);
          }
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {changePwSuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Password
                  Updated Successfully
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 text-[#166FB5]" /> Change Password
                </>
              )}
            </AlertDialogTitle>
            {!changePwSuccess && (
              <AlertDialogDescription>
                Must be 8–40 characters with at least one uppercase letter, one
                number, and one special character.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>

          {changePwSuccess ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm font-medium text-slate-800">
                Your password has been updated.
              </p>
              <p className="text-xs text-slate-500">
                Use your new password the next time you log in.
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {changePwError && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{changePwError}</span>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="cp-current" className="text-xs text-slate-600">
                  Current Password
                </Label>
                <Input
                  id="cp-current"
                  type="password"
                  autoComplete="current-password"
                  value={changePwCurrent}
                  onChange={(e) => setChangePwCurrent(e.target.value)}
                  placeholder="Your current password"
                  disabled={changePwLoading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-new" className="text-xs text-slate-600">
                  New Password
                </Label>
                <Input
                  id="cp-new"
                  type="password"
                  autoComplete="new-password"
                  value={changePwNew}
                  onChange={(e) => setChangePwNew(e.target.value)}
                  placeholder="Min 8 chars, upper, number, special"
                  disabled={changePwLoading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-confirm" className="text-xs text-slate-600">
                  Confirm New Password
                </Label>
                <Input
                  id="cp-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={changePwConfirm}
                  onChange={(e) => setChangePwConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  disabled={changePwLoading}
                />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            {changePwSuccess ? (
              <Button
                className="bg-[#166FB5] hover:bg-[#166FB5]/90 text-white"
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setChangePwCurrent("");
                  setChangePwNew("");
                  setChangePwConfirm("");
                  setChangePwError(null);
                  setChangePwSuccess(false);
                }}
              >
                Done
              </Button>
            ) : (
              <>
                <AlertDialogCancel disabled={changePwLoading}>
                  Cancel
                </AlertDialogCancel>
                <Button
                  disabled={changePwLoading}
                  className="bg-[#166FB5] hover:bg-[#166FB5]/90 text-white"
                  onClick={async () => {
                    setChangePwError(null);

                    const current = changePwCurrent.trim();
                    const next = changePwNew.trim();
                    const confirm = changePwConfirm.trim();

                    if (!current || !next || !confirm) {
                      setChangePwError("All fields are required.");
                      return;
                    }
                    if (next !== confirm) {
                      setChangePwError("New passwords do not match.");
                      return;
                    }
                    if (
                      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,40}$/.test(
                        next,
                      )
                    ) {
                      setChangePwError(
                        "Password must be 8–40 characters and include at least one uppercase letter, one number, and one special character.",
                      );
                      return;
                    }

                    setChangePwLoading(true);
                    try {
                      const res = await fetch("/api/portal/change-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          currentPassword: current,
                          newPassword: next,
                          googleEmail: user?.email || emailParam,
                        }),
                      });
                      const data = (await res.json()) as {
                        ok?: boolean;
                        error?: string;
                      };
                      if (!res.ok || !data.ok) {
                        setChangePwError(
                          data.error ||
                            "Failed to change password. Please try again.",
                        );
                      } else {
                        setChangePwSuccess(true);
                      }
                    } catch {
                      setChangePwError(
                        "Network error. Please check your connection and try again.",
                      );
                    } finally {
                      setChangePwLoading(false);
                    }
                  }}
                >
                  {changePwLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating…
                    </span>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
