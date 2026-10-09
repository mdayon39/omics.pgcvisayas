export interface Inquiry {
  id: string;
  clientId?: string;
  createdAt: Date;
  name: string;
  isApproved: boolean;
  status:
    | "Pending"
    | "Ongoing Quotation"
    | "Approved Client"
    | "Quotation Only"
    | "Service Not Offered"
    | "Cancelled"
    | "In Progress";
  affiliation: string;
  designation: string;
  email?: string;

  // Service type
  serviceType?:
    | "laboratory"
    | "bioinformatics"
    | "equipment"
    | "retail"
    | "research"
    | "training"
    | null;

  // New Service Selection Fields
  species?:
    | "human"
    | "plant"
    | "animal"
    | "microbe-prokaryote"
    | "microbe-eukaryote"
    | "other"
    | null;
  otherSpecies?: string | null;
  researchOverview?: string | null;
  methodologyFileUrl?: string | null;
  sampleCount?: number | null;
  workflowType?: "complete-bioinfo" | "complete" | "individual" | null;
  bioinformaticsDetails?: Record<string, any> | null;
  bioinfoOptions?:
    | (
        | "dna-extraction"
        | "quantification"
        | "library-preparation"
        | "sequencing"
        | "bioinformatics-analysis"
        | "genome-assembly"
        | "metabarcoding"
        | "pre-processing"
        | "transcriptomics"
        | "phylogenetics"
        | "assembly-annotation"
        | "whole-genome-assembly"
        | "metabarcoding-downstream"
        | "metabarcoding-preprocessing"
        | "whole-genome-assembly-annotation"
      )[]
    | null;
  individualAssayDetails?: string | null;

  // Research and Collaboration - New fields
  molecularServicesBudget?: string | null;
  plannedSampleCount?: string | null;

  // Retail Sales specific fields
  retailItems?: string[] | null;
  retailItemDetails?: Record<string, string> | null;

  // Legacy Service-specific fields
  workflows?: string[];
  additionalInfo?: string | null;
  projectBackground?: string | null;
  projectBudget?: string | null;
  specificTrainingNeed?: string | null;
  trainingPrograms?: string[] | null;
  targetTrainingDate?: string | null;
  numberOfParticipants?: number | null;

  // System fields
  uuid?: string | null;
  haveSubmitted?: boolean;
  hasOpenedQuotation?: boolean;
  hasLoggedIn?: boolean;

  // Cancellation metadata
  cancelledAt?: Date | null;
  cancelledBy?: "client" | "admin" | null;
  cancellationReason?: string | null;

  // Client info for chat/branding
  clientInfo?: {
    logoUrl?: string;
  };

  // Message state — denormalized from threadMessages for efficient table display
  // 'none'       : no messages exist yet
  // 'admin_only' : admin has sent messages but no client reply
  // 'has_unread' : client sent message(s) that admin hasn't read
  // 'all_read'   : all client messages have been read by admin
  messageState?: "none" | "admin_only" | "has_unread" | "all_read";
  unreadMessageCount?: number;
  pinnedByAdmin?: boolean;
}
