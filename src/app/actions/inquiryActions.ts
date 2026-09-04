/**
 * Inquiry Actions - Server-side functions for managing inquiries
 *
 * This file contains Next.js server actions that handle CRUD operations
 * for user inquiries. These functions run on the server and interact with
 * Firestore database to create, read, update, and delete inquiry records.
 *
 * Key Features:
 * - Creates inquiries from form submissions
 * - Sends automated emails via Firebase extensions
 * - Handles different service types (laboratory, research, training)
 * - Provides admin functions for inquiry management
 * - Automatic cache revalidation for data consistency
 */

"use server";

import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { adminDb } from "@/lib/firebase-admin";
import { revalidatePath } from "next/cache";
import { InquiryFormData } from "@/schemas/inquirySchema";
import { AdminInquiryData } from "@/schemas/adminInquirySchema";
import { logActivity } from "@/services/activityLogService";
import {
  initializeQuotationThread,
  addThreadMessage,
} from "@/services/quotationThreadService";
import {
  getConfigurationSettings,
  getDefaultConfigurationSettings,
  getInquiryNotificationRecipients,
} from "@/services/configurationSettingsService";

async function addMailDocument(data: Record<string, unknown>) {
  if (adminDb) {
    const ref = await adminDb.collection("mail").add(data);
    return { id: ref.id, path: ref.path, viaAdmin: true as const };
  }

  throw new Error(
    "Firebase Admin is not initialized. Cannot write email documents to mail collection.",
  );
}

function snapshotExists(snap: any): boolean {
  return typeof snap?.exists === "function" ? snap.exists() : !!snap?.exists;
}

function snapshotData<T = Record<string, any>>(snap: any): T | undefined {
  return typeof snap?.data === "function"
    ? (snap.data() as T | undefined)
    : undefined;
}

const BIOINFO_OPTION_LABELS: Record<string, string> = {
  "whole-genome-assembly": "Whole Genome Assembly",
  "metabarcoding-downstream": "Metabarcoding with Downstream Analysis",
  "metabarcoding-preprocessing": "Metabarcoding with Pre-processing Only",
  transcriptomics: "Transcriptomics (QC to Annotation)",
  phylogenetics: "Phylogenetics (1 Marker)",
  "whole-genome-assembly-annotation": "Whole Genome Assembly and Annotation",
  // Legacy support
  "dna-extraction": "DNA Extraction",
  quantification: "Quantification",
  "library-preparation": "Library Preparation",
  sequencing: "Sequencing",
  "bioinformatics-analysis": "Bioinformatics Analysis",
  "genome-assembly": "Whole Genome Assembly",
  metabarcoding: "Metabarcoding with Downstream Analysis",
  "pre-processing": "Metabarcoding with Pre-processing Only",
  "assembly-annotation": "Whole Genome Assembly and Annotation",
};

const formatBioinfoOption = (option: string): string => {
  return (
    BIOINFO_OPTION_LABELS[option] ||
    option
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
};

const formatWorkflowType = (workflowType?: string): string => {
  if (!workflowType) return "";
  if (workflowType === "complete-bioinfo") {
    return "Complete molecular workflow with Bioinformatics Analysis";
  }
  if (workflowType === "complete") {
    return "Complete Molecular workflow only (DNA Extraction to Sequencing)";
  }
  if (workflowType === "individual") {
    return "Individual Assay";
  }
  return workflowType
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatServiceType = (serviceType: string): string => {
  return serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
};

async function resolveInquiryUuid(
  email?: string | null,
): Promise<string | null> {
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) return null;

  if (!adminDb) return null;

  try {
    const userSnapshot = await adminDb
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (!userSnapshot.empty) {
      const userData = userSnapshot.docs[0].data() as { uid?: string };
      if (typeof userData?.uid === "string" && userData.uid) {
        return userData.uid;
      }
      return null;
    }

    // Fallback for legacy records where email casing was not normalized.
    const allUsersSnapshot = await adminDb.collection("users").get();
    for (const userDoc of allUsersSnapshot.docs) {
      const userData = userDoc.data() as { email?: string; uid?: string };
      const storedEmail =
        typeof userData?.email === "string"
          ? userData.email.trim().toLowerCase()
          : "";

      if (storedEmail !== normalizedEmail) continue;

      if (typeof userData?.uid === "string" && userData.uid) {
        return userData.uid;
      }

      return null;
    }
  } catch (fallbackError) {
    console.warn(
      `Unable to resolve Firestore user UID for inquiry email ${normalizedEmail}:`,
      fallbackError,
    );
  }

  return null;
}

const formatSpecies = (species?: string, otherSpecies?: string): string => {
  if (!species) return "";
  const speciesLabel = species
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return otherSpecies ? `${speciesLabel} (${otherSpecies})` : speciesLabel;
};

const formatTrainingProgram = (program: string): string => {
  if (program === "others-customized") {
    return "Others / Customized Training Program";
  }
  return program;
};

const formatBioinformaticsDetailsHtml = (
  details: Record<string, any> | undefined,
): string => {
  if (!details) return "";

  const serviceTypes: string[] = Array.isArray(details.serviceTypes)
    ? details.serviceTypes
    : [];
  const ST_LABELS: Record<string, string> = {
    phylogenetic: "Phylogenetic Analysis",
    metabarcoding: "Metabarcoding/Metagenomics",
    transcriptomics: "Transcriptomics",
    "whole-genome-assembly": "Whole Genome Assembly",
    others: "Others",
  };
  const fileFormats = Array.isArray(details.dataFileFormats)
    ? details.dataFileFormats.join(", ")
    : "";

  const row = (label: string, value: unknown) => {
    if (value == null || value === "") return "";
    return (
      '<tr><td style="padding:4px 8px 4px 0;color:#64748b;vertical-align:top;width:230px;">' +
      label +
      ':</td><td style="padding:4px 0;">' +
      value +
      "</td></tr>"
    );
  };

  const subhead = (title: string) =>
    '<tr><td colspan="2" style="padding:10px 0 4px 0;color:#166FB5;font-weight:600;font-size:13px;border-top:1px solid #e2e8f0;">' +
    title +
    "</td></tr>";

  let html = "";

  if (serviceTypes.length > 0) {
    html += row(
      "Types of bioinformatics service",
      serviceTypes.map((t) => ST_LABELS[t] || t).join(", "),
    );
  }

  if (serviceTypes.includes("phylogenetic") && details.phylogenetic) {
    html += subhead("Phylogenetic Analysis");
    html += row("No. of markers", details.phylogenetic.markerCount);
    html += row("Marker(s)", details.phylogenetic.markers);
  }

  if (serviceTypes.includes("metabarcoding") && details.metabarcoding) {
    html += subhead("Metabarcoding / Metagenomics");
    const study = details.metabarcoding.study || {};
    html += row("Sample type", study.sampleType);
    html += row("No. of samples", study.sampleCount);
    html += row("No. of groups / treatments to study", study.groupCount);
    html += row("No. of replicates per sample", study.replicatesPerSample);
    html += row("Target gene / marker", study.targetGene);
    html += row("Target region", study.targetRegion);
    html += row("Primer set used", study.primerSet);
    html += row("Expected amplicon size", study.ampliconSize);
    html += row("Sequencing type and platform", study.sequencingPlatform);
    const analysisLabels: Record<string, string> = {
      "general-pipeline": "General Pipeline",
      "general-pipeline-downstream":
        "General Pipeline with Downstream Analysis",
      unsure: "Unsure",
    };
    if (details.metabarcoding.analysisType) {
      html += row(
        "Analysis type",
        analysisLabels[details.metabarcoding.analysisType] ||
          details.metabarcoding.analysisType,
      );
    }
  }

  if (serviceTypes.includes("transcriptomics") && details.transcriptomics) {
    html += subhead("Transcriptomics");
    const study = details.transcriptomics.study || {};
    html += row("Sample type", study.sampleType);
    html += row("No. of samples", study.sampleCount);
    html += row("No. of groups / treatments / conditions", study.groupCount);
    html += row(
      "No. of biological replicates per group",
      study.biologicalReplicates,
    );
    html += row("Sequencing type and platform", study.sequencingPlatform);
    html += row("Estimated sequencing depth per sample", study.depth);
    const analysis = details.transcriptomics.analysis || {};
    const selectedAnalyses = [
      analysis.preProcessing ? "Pre-processing" : null,
      analysis.deNovoAssembly
        ? "De novo transcriptome assembly & evaluation"
        : null,
      analysis.referenceBased ? "Reference-based assembly pipeline" : null,
      analysis.orfPrediction ? "Open-reading frame prediction" : null,
      analysis.functionalAnnotation ? "Functional Annotation" : null,
      details.transcriptomics.unsure ? "Unsure" : null,
    ].filter(Boolean);
    if (selectedAnalyses.length > 0)
      html += row("Selected analyses", selectedAnalyses.join(", "));
  }

  if (
    serviceTypes.includes("whole-genome-assembly") &&
    details.wholeGenomeAssembly
  ) {
    html += subhead("Whole Genome Assembly");
    html += row("Sample taxonomy", details.wholeGenomeAssembly.sampleTaxonomy);
    html += row("No. of samples", details.wholeGenomeAssembly.sampleCount);
    const wgaAnalysis = details.wholeGenomeAssembly.analysis || {};
    const wgaSelected = [
      wgaAnalysis.assembly ? "Whole Genome Assembly" : null,
      wgaAnalysis.assemblyAnnotation
        ? "Whole Genome Assembly and Annotation"
        : null,
      details.wholeGenomeAssembly.unsure ? "Unsure" : null,
    ].filter(Boolean);
    if (wgaSelected.length > 0)
      html += row("Selected analyses", wgaSelected.join(", "));
    html += row(
      "Additional downstream analysis",
      wgaAnalysis.additionalDownstream,
    );
  }

  if (serviceTypes.includes("others") && details.othersSpecify) {
    html += subhead("Others");
    html += row("Specify", details.othersSpecify);
  }

  html += subhead("Data");
  html += row("Provide own data", details.dataProvideOwnData ? "Yes" : "No");
  if (details.dataProvideOwnData) {
    const fmt =
      (fileFormats || "\u2014") +
      (details.dataOtherFormat ? "; Others: " + details.dataOtherFormat : "");
    html += row("File format", fmt);
    html += row(
      "File size per sample",
      details.dataFileSizePerSample || "\u2014",
    );
    html += row(
      "Preferred mode of file transfer",
      details.dataTransferMode || "\u2014",
    );
  }
  html += row(
    "Data generated by PGC sequencing service",
    details.dataProvidedByPgc ? "Yes" : "No",
  );

  if (details.overviewObjectives) {
    html +=
      '<tr><td colspan="2" style="padding-top:10px;"><strong>Overview of Research and Objectives:</strong><br/><span style="white-space:pre-wrap;">' +
      details.overviewObjectives +
      "</span></td></tr>";
  }

  return html;
};

const formatBioinformaticsDetailsText = (
  details: Record<string, any> | undefined,
): string => {
  if (!details) return "";

  const serviceTypes: string[] = Array.isArray(details.serviceTypes)
    ? details.serviceTypes
    : [];
  const ST_LABELS: Record<string, string> = {
    phylogenetic: "Phylogenetic Analysis",
    metabarcoding: "Metabarcoding/Metagenomics",
    transcriptomics: "Transcriptomics",
    "whole-genome-assembly": "Whole Genome Assembly",
    others: "Others",
  };
  const fileFormats = Array.isArray(details.dataFileFormats)
    ? details.dataFileFormats.join(", ")
    : "";
  const lines: string[] = [];

  if (serviceTypes.length > 0) {
    lines.push(
      "Types of bioinformatics service: " +
        serviceTypes.map((t) => ST_LABELS[t] || t).join(", "),
    );
  }

  if (serviceTypes.includes("phylogenetic") && details.phylogenetic) {
    lines.push("-- Phylogenetic Analysis --");
    if (details.phylogenetic.markerCount)
      lines.push("  No. of markers: " + details.phylogenetic.markerCount);
    if (details.phylogenetic.markers)
      lines.push("  Marker(s): " + details.phylogenetic.markers);
  }

  if (serviceTypes.includes("metabarcoding") && details.metabarcoding) {
    lines.push("-- Metabarcoding / Metagenomics --");
    const study = details.metabarcoding.study || {};
    if (study.sampleType) lines.push("  Sample type: " + study.sampleType);
    if (study.sampleCount) lines.push("  No. of samples: " + study.sampleCount);
    if (study.groupCount)
      lines.push("  No. of groups/treatments: " + study.groupCount);
    if (study.replicatesPerSample)
      lines.push(
        "  No. of replicates per sample: " + study.replicatesPerSample,
      );
    if (study.targetGene)
      lines.push("  Target gene/marker: " + study.targetGene);
    if (study.targetRegion)
      lines.push("  Target region: " + study.targetRegion);
    if (study.primerSet) lines.push("  Primer set: " + study.primerSet);
    if (study.ampliconSize)
      lines.push("  Amplicon size: " + study.ampliconSize);
    if (study.sequencingPlatform)
      lines.push("  Sequencing platform: " + study.sequencingPlatform);
    const analysisLabels: Record<string, string> = {
      "general-pipeline": "General Pipeline",
      "general-pipeline-downstream":
        "General Pipeline with Downstream Analysis",
      unsure: "Unsure",
    };
    if (details.metabarcoding.analysisType)
      lines.push(
        "  Analysis type: " +
          (analysisLabels[details.metabarcoding.analysisType] ||
            details.metabarcoding.analysisType),
      );
  }

  if (serviceTypes.includes("transcriptomics") && details.transcriptomics) {
    lines.push("-- Transcriptomics --");
    const study = details.transcriptomics.study || {};
    if (study.sampleType) lines.push("  Sample type: " + study.sampleType);
    if (study.sampleCount) lines.push("  No. of samples: " + study.sampleCount);
    if (study.groupCount)
      lines.push("  No. of groups/treatments/conditions: " + study.groupCount);
    if (study.biologicalReplicates)
      lines.push(
        "  Biological replicates per group: " + study.biologicalReplicates,
      );
    if (study.sequencingPlatform)
      lines.push("  Sequencing platform: " + study.sequencingPlatform);
    if (study.depth) lines.push("  Sequencing depth: " + study.depth);
    const analysis = details.transcriptomics.analysis || {};
    const selectedAnalyses = [
      analysis.preProcessing ? "Pre-processing" : null,
      analysis.deNovoAssembly ? "De novo transcriptome assembly" : null,
      analysis.referenceBased ? "Reference-based assembly" : null,
      analysis.orfPrediction ? "ORF prediction" : null,
      analysis.functionalAnnotation ? "Functional Annotation" : null,
      details.transcriptomics.unsure ? "Unsure" : null,
    ].filter(Boolean);
    if (selectedAnalyses.length > 0)
      lines.push("  Selected analyses: " + selectedAnalyses.join(", "));
  }

  if (
    serviceTypes.includes("whole-genome-assembly") &&
    details.wholeGenomeAssembly
  ) {
    lines.push("-- Whole Genome Assembly --");
    if (details.wholeGenomeAssembly.sampleTaxonomy)
      lines.push(
        "  Sample taxonomy: " + details.wholeGenomeAssembly.sampleTaxonomy,
      );
    if (details.wholeGenomeAssembly.sampleCount)
      lines.push(
        "  No. of samples: " + details.wholeGenomeAssembly.sampleCount,
      );
    const wgaAnalysis = details.wholeGenomeAssembly.analysis || {};
    const wgaSelected = [
      wgaAnalysis.assembly ? "Whole Genome Assembly" : null,
      wgaAnalysis.assemblyAnnotation
        ? "Whole Genome Assembly and Annotation"
        : null,
      details.wholeGenomeAssembly.unsure ? "Unsure" : null,
    ].filter(Boolean);
    if (wgaSelected.length > 0)
      lines.push("  Selected analyses: " + wgaSelected.join(", "));
    if (wgaAnalysis.additionalDownstream)
      lines.push(
        "  Additional downstream: " + wgaAnalysis.additionalDownstream,
      );
  }

  if (serviceTypes.includes("others") && details.othersSpecify) {
    lines.push("-- Others --");
    lines.push("  Specify: " + details.othersSpecify);
  }

  lines.push("-- Data --");
  lines.push(
    "Provide own data: " + (details.dataProvideOwnData ? "Yes" : "No"),
  );
  if (details.dataProvideOwnData) {
    lines.push(
      "File format: " +
        (fileFormats || "\u2014") +
        (details.dataOtherFormat ? "; Others: " + details.dataOtherFormat : ""),
    );
    lines.push(
      "File size per sample: " + (details.dataFileSizePerSample || "\u2014"),
    );
    lines.push(
      "Preferred mode of file transfer: " +
        (details.dataTransferMode || "\u2014"),
    );
  }
  lines.push(
    "Data generated by PGC sequencing service: " +
      (details.dataProvidedByPgc ? "Yes" : "No"),
  );

  if (details.overviewObjectives) {
    lines.push(
      "Overview of Research and Objectives: " + details.overviewObjectives,
    );
  }

  return lines.filter(Boolean).join("\n");
};
/**
 * Test function to validate email system configuration
 * This function helps diagnose email delivery issues by creating a simple test email
 */
export async function testEmailSystem() {
  try {
    console.log("=== EMAIL TEST: Starting email system test ===");

    // Check Firebase connection
    console.log("EMAIL TEST: Firebase DB:", db ? "Connected" : "Disconnected");

    // Create test email with both simple and template formats
    const testInquiryId = "TEST-" + Date.now();
    const testEmailData = {
      to: ["merlito.dayon@gmail.com"],
      inquiryId: testInquiryId, // Add at root level for easy searching
      message: {
        subject: "PGC Email System Test",
        text: "This is a test email from the PGC email system.",
        html: "<p><strong>PGC Email System Test</strong></p><p>This is a test email to verify email functionality.</p>",
      },
      template: {
        name: "inquiry-laboratory", // Using existing template
        data: {
          inquiryId: testInquiryId,
          name: "Test User",
          affiliation: "Test Institution",
          designation: "Test Role",
          email: "test@example.com",
          service: "laboratory",
          workflows: "DNA extraction",
          additionalInfo: "This is a test email to verify email functionality",
        },
      },
    };

    console.log("EMAIL TEST: Test email structure:", {
      recipient: testEmailData.to,
      inquiryId: testEmailData.inquiryId,
      hasSubject: !!testEmailData.message.subject,
      hasTemplate: !!testEmailData.template,
      templateName: testEmailData.template.name,
      dataKeys: Object.keys(testEmailData.template.data),
    });

    console.log("EMAIL TEST: Creating test email document...");

    console.log("EMAIL TEST: Mail collection reference created");

    const emailDocRef = await addMailDocument(
      testEmailData as Record<string, unknown>,
    );

    console.log("âœ… EMAIL TEST SUCCESS: Test email document created!");
    console.log("Test Email Document ID:", emailDocRef.id);
    console.log("Test Email Document Path:", emailDocRef.path);

    // Immediately verify the document exists in Firestore
    try {
      const verifyDoc = emailDocRef.viaAdmin
        ? await adminDb!.collection("mail").doc(emailDocRef.id).get()
        : await getDoc(doc(db, "mail", emailDocRef.id));
      if (snapshotExists(verifyDoc)) {
        const docData = snapshotData(verifyDoc);
        if (!docData) {
          console.error(
            "❌ VERIFICATION FAILED: Snapshot exists but data is undefined",
          );
        } else {
          console.log("âœ… VERIFICATION: Document confirmed in Firestore!");
          console.log("Document data keys:", Object.keys(docData));
          console.log("Document inquiryId:", docData.inquiryId);
          console.log("Document to:", docData.to);
        }
      } else {
        console.error(
          "âŒ VERIFICATION FAILED: Document not found in Firestore immediately after creation!",
        );
      }
    } catch (verifyError) {
      console.error("âŒ VERIFICATION ERROR:", verifyError);
    }

    return {
      success: true,
      emailDocId: emailDocRef.id,
      message:
        "Test email successfully created in Firestore 'mail' collection. Check Firebase Console for processing status.",
    };
  } catch (error) {
    console.error("âŒ EMAIL TEST FAILED:", error);
    console.error("Test error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code || "No code",
      stack: error instanceof Error ? error.stack : "No stack trace",
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      message:
        "Email system test failed. Check Firebase configuration, extensions, and console logs for details.",
    };
  }
}

/**
 * Creates a new inquiry from user form submission
 *
 * This function processes form data, transforms it for database storage,
 * saves it to Firestore, and triggers automated email notifications.
 */
export async function createInquiryAction(
  inquiryData: InquiryFormData & {
    id?: string;
    returnToPortal?: boolean;
    userUid?: string;
  },
) {
  try {
    // Check Firebase configuration first
    if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      console.error("Firebase project ID not found in environment variables");
      throw new Error("Firebase configuration error");
    }

    // Transform the form data to match the expected database structure
    // This ensures all required fields are present with proper defaults
    const currentDate = new Date();
    const resolvedUuid =
      inquiryData.userUid || (await resolveInquiryUuid(inquiryData.email));
    const transformedData = {
      // Core inquiry information
      name: inquiryData.name,
      affiliation: inquiryData.affiliation,
      designation: inquiryData.designation,
      email: inquiryData.email,

      // New Service Selection Fields
      species: inquiryData.species || null,
      otherSpecies: inquiryData.otherSpecies || null,
      researchOverview: inquiryData.researchOverview || null,
      methodologyFileUrl: inquiryData.methodologyFileUrl || null,
      sampleCount: inquiryData.sampleCount || null,
      workflowType: inquiryData.workflowType || null,
      bioinformaticsDetails: inquiryData.bioinformaticsDetails || null,
      bioinfoOptions: inquiryData.bioinfoOptions || [],
      individualAssayDetails: inquiryData.individualAssayDetails || null,

      // Retail Sales specific fields
      retailItems: inquiryData.retailItems || [],
      retailItemDetails: inquiryData.retailItemDetails || {},

      // Service-specific fields (legacy - will be null for non-applicable services)
      // Laboratory Service fields
      workflows: inquiryData.workflows || [],
      additionalInfo: inquiryData.additionalInfo || null,
      // Research service specific fields
      projectBackground: inquiryData.projectBackground || null,
      projectBudget: inquiryData.projectBudget || null,
      molecularServicesBudget: inquiryData.molecularServicesBudget || null,
      plannedSampleCount: inquiryData.plannedSampleCount || null,
      // Training service specific fields
      specificTrainingNeed: inquiryData.specificTrainingNeed || null,
      trainingPrograms: inquiryData.trainingPrograms || [],
      targetTrainingDate: inquiryData.targetTrainingDate || null,
      numberOfParticipants: inquiryData.numberOfParticipants || null,

      // System fields with defaults
      createdAt: serverTimestamp(), // Firestore server timestamp
      status: "Pending", // Default status for new inquiries
      isApproved: false, // Default approval status
      serviceType: inquiryData.service, // Store the service type for reference
      haveSubmitted: false, // Track if user has submitted client-project form
      uuid: resolvedUuid ?? null,
    };

    // Add the inquiry document to the Firestore 'inquiries' collection
    let finalInquiryId: string;

    if (inquiryData.id) {
      // Use pre-generated ID if provided
      finalInquiryId = inquiryData.id;
      const docRef = doc(db, "inquiries", finalInquiryId);
      await setDoc(docRef, transformedData);
    } else {
      // Otherwise let Firestore generate a new ID
      const docRef = await addDoc(collection(db, "inquiries"), transformedData);
      finalInquiryId = docRef.id;
    }

    if (resolvedUuid) {
      await setDoc(
        doc(db, "inquiries", finalInquiryId),
        { uuid: resolvedUuid },
        { merge: true },
      );
    }

    // Log activity as best-effort only (must not block inquiry submission).
    try {
      await logActivity({
        userId: inquiryData.email || "anonymous",
        userEmail: inquiryData.email || "anonymous",
        userName: inquiryData.name,
        userRole: "client",
        action: "CREATE",
        entityType: "inquiry",
        entityId: finalInquiryId,
        entityName: inquiryData.name,
        description: `New inquiry request submitted by ${inquiryData.name} (${inquiryData.service})`,
        changesAfter: transformedData,
      });
    } catch (activityError) {
      console.error(
        "Non-fatal: failed to log inquiry creation activity",
        activityError,
      );
    }

    // Initialize quotation thread for this inquiry and send a welcome message
    try {
      await initializeQuotationThread(finalInquiryId);

      // Send the automated welcome message from PGC Visayas Admin
      // type: "system" is intentional â€” automated messages must NOT count toward adminTextMessageCount
      // so that the first-message email notification fires correctly when a real admin messages next.
      await addThreadMessage({
        threadId: finalInquiryId,
        content:
          "Welcome to PGC Visayas! Your inquiry has been received. You can use this chat to ask questions about your quotation or clarify your research requirements.",
        senderId: "pgc-admin",
        senderName: "PGC Visayas Admin",
        senderRole: "admin",
        type: "system",
        isRead: false,
      });
    } catch (threadError) {
      console.error(
        `âš ï¸ Failed to initialize quotation thread for inquiry ${finalInquiryId}:`,
        threadError,
      );
      // Non-fatal â€” the thread will be auto-created on first message if this fails
    }

    // Preparation for email notification using Firebase Trigger Email extension
    // Template ID corresponds to service type for different email formats
    //NOTE: templates for email can be changed in the 'templates' collection in firebase
    const templateId = `inquiry-${inquiryData.service}`;

    // Create base template data that applies to all service types
    let templateData: Record<string, any> = {
      inquiryId: finalInquiryId,
      name: inquiryData.name,
      affiliation: inquiryData.affiliation,
      designation: inquiryData.designation,
      email: inquiryData.email || "",
      service: inquiryData.service,
    };

    // Add service-specific data to email template based on inquiry type
    if (
      ["laboratory", "bioinformatics", "equipment", "retail"].includes(
        inquiryData.service,
      )
    ) {
      // Laboratory services: include new comprehensive fields
      templateData.species = inquiryData.species || "";
      templateData.otherSpecies = inquiryData.otherSpecies || "";
      templateData.researchOverview = inquiryData.researchOverview || "";
      templateData.methodologyFileUrl = inquiryData.methodologyFileUrl || "";
      templateData.sampleCount = inquiryData.sampleCount?.toString() || "";
      templateData.workflowType =
        formatWorkflowType(inquiryData.workflowType) || "";
      templateData.bioinformaticsDetails =
        inquiryData.bioinformaticsDetails || null;
      templateData.bioinfoOptions = Array.isArray(inquiryData.bioinfoOptions)
        ? inquiryData.bioinfoOptions.map(formatBioinfoOption).join(", ")
        : "";
      templateData.individualAssayDetails =
        inquiryData.individualAssayDetails || "";
      // Retail items formatting for template
      if (
        inquiryData.service === "retail" &&
        inquiryData.retailItems &&
        inquiryData.retailItems.length > 0
      ) {
        templateData.retailItemsFormatted = inquiryData.retailItems
          .map((item) => {
            const amount = inquiryData.retailItemDetails?.[item];
            return amount ? `${item} (${amount})` : item;
          })
          .join(", ");
      }
      // Legacy fields for backward compatibility
      templateData.workflows = Array.isArray(inquiryData.workflows)
        ? inquiryData.workflows.join(", ")
        : inquiryData.workflows || "";
      templateData.additionalInfo = inquiryData.additionalInfo || "";
    } else if (inquiryData.service === "research") {
      // Research service: include collaboration overview and planning fields
      templateData.researchOverview = inquiryData.researchOverview || "";
      templateData.molecularServicesBudget =
        inquiryData.molecularServicesBudget || "";
      templateData.plannedSampleCount = inquiryData.plannedSampleCount || "";
      // Legacy fields kept for backward compatibility with old templates
      templateData.projectBackground = inquiryData.projectBackground || "";
      templateData.projectBudget = inquiryData.projectBudget || "";
    } else if (inquiryData.service === "training") {
      // Training service: include training-specific details
      templateData.specificTrainingNeed =
        inquiryData.specificTrainingNeed || "";
      templateData.trainingPrograms = Array.isArray(
        inquiryData.trainingPrograms,
      )
        ? inquiryData.trainingPrograms.map(formatTrainingProgram).join(", ")
        : "";
      templateData.targetTrainingDate = inquiryData.targetTrainingDate || "";
      templateData.numberOfParticipants =
        inquiryData.numberOfParticipants?.toString() || "";
    }

    // === EMAIL NOTIFICATION SYSTEM ===
    // Create email document for Firebase Trigger Email extension
    // This document triggers Firebase extension to send email notifications

    console.log("=== EMAIL DEBUG: Starting email creation process ===");
    console.log("Inquiry ID:", finalInquiryId);
    console.log("Template ID:", templateId);
    console.log("Template Data:", templateData);
    console.log("Firebase DB instance:", db ? "Connected" : "Not Connected");

    const config = await getConfigurationSettings();
    const fallbackConfig = getDefaultConfigurationSettings();
    const baseRecipients = getInquiryNotificationRecipients(
      config.inquiryNotifications.length > 0
        ? config.inquiryNotifications
        : fallbackConfig.inquiryNotifications,
      inquiryData.service,
    );

    // If this is a complete-bioinfo workflow, also notify the bioinformatics workflow recipients
    const bioinfoWorkflowRecipients =
      inquiryData.workflowType === "complete-bioinfo" &&
      inquiryData.bioinformaticsDetails
        ? config.bioinformaticsWorkflowNotifications || []
        : [];

    const requiredAdminRecipients = ["mdayon1@up.edu.ph"];

    const emailRecipients = Array.from(
      new Set([
        ...baseRecipients,
        ...bioinfoWorkflowRecipients,
        ...requiredAdminRecipients,
      ]),
    );

    console.log(
      "EMAIL DEBUG: Creating email for recipients:",
      emailRecipients.join(", "),
    );

    // Create a comprehensive HTML email body
    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.5;">
        <div style="background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #1e40af; margin-top: 0; font-size: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
            New ${formatServiceType(inquiryData.service)} Inquiry
          </h2>
          
          <div style="margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Name:</strong> ${inquiryData.name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${inquiryData.email}</p>
            <p style="margin: 5px 0;"><strong>Affiliation:</strong> ${inquiryData.affiliation}</p>
            <p style="margin: 5px 0;"><strong>Designation:</strong> ${inquiryData.designation}</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; margin: 20px 0;">
            <h3 style="margin-top: 0; font-size: 16px; color: #1e40af;">Service Details</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 4px 0; width: 140px; color: #64748b;">Service Type:</td>
                <td style="padding: 4px 0;">${formatServiceType(inquiryData.service)}</td>
              </tr>
              ${
                inquiryData.service === "training" &&
                inquiryData.trainingPrograms &&
                inquiryData.trainingPrograms.length > 0
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b; vertical-align: top;">Training Programs:</td>
                <td style="padding: 4px 0;">
                  <ul style="margin: 0; padding-left: 18px; color: #334155;">
                    ${inquiryData.trainingPrograms.map((program) => `<li style="margin-bottom: 2px;">${formatTrainingProgram(program)}</li>`).join("")}
                  </ul>
                </td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.service === "training" &&
                inquiryData.targetTrainingDate
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Target Date:</td>
                <td style="padding: 4px 0;">${inquiryData.targetTrainingDate}</td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.service === "training" &&
                inquiryData.numberOfParticipants
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">No. of Participants:</td>
                <td style="padding: 4px 0;">${inquiryData.numberOfParticipants}</td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.service === "training" &&
                inquiryData.specificTrainingNeed
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b; vertical-align: top;">Customized Needs:</td>
                <td style="padding: 4px 0; white-space: pre-wrap;">${inquiryData.specificTrainingNeed}</td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.species
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Species:</td>
                <td style="padding: 4px 0;">${formatSpecies(inquiryData.species, inquiryData.otherSpecies || undefined)}</td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.sampleCount
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Sample Count:</td>
                <td style="padding: 4px 0;">${inquiryData.sampleCount}</td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.workflowType
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Workflow:</td>
                <td style="padding: 4px 0;">${formatWorkflowType(inquiryData.workflowType)}</td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.bioinfoOptions &&
                inquiryData.bioinfoOptions.length > 0
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Bioinformatics Analysis:</td>
                <td style="padding: 4px 0;">${inquiryData.bioinfoOptions.map(formatBioinfoOption).join(", ")}</td>
              </tr>`
                  : ""
              }
              ${inquiryData.workflowType === "complete-bioinfo" && inquiryData.bioinformaticsDetails ? formatBioinformaticsDetailsHtml(inquiryData.bioinformaticsDetails as Record<string, any>) : ""}
              ${
                inquiryData.individualAssayDetails
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Equipment/Workflow:</td>
                <td style="padding: 4px 0;">${inquiryData.individualAssayDetails}</td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.service === "retail" &&
                inquiryData.retailItems &&
                inquiryData.retailItems.length > 0
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Retail Items:</td>
                <td style="padding: 4px 0;">
                  <ul style="margin: 0; padding-left: 20px;">
                    ${inquiryData.retailItems
                      .map((item) => {
                        const amount = inquiryData.retailItemDetails?.[item];
                        return `<li style="margin-bottom: 2px;">${item}${amount ? `: <strong>${amount}</strong>` : ""}</li>`;
                      })
                      .join("")}
                  </ul>
                </td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.service === "research" &&
                inquiryData.molecularServicesBudget
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Budget for Molecular Services:</td>
                <td style="padding: 4px 0;">${inquiryData.molecularServicesBudget}</td>
              </tr>`
                  : ""
              }
              ${
                inquiryData.service === "research" &&
                inquiryData.plannedSampleCount
                  ? `
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Planned Sample Count:</td>
                <td style="padding: 4px 0;">${inquiryData.plannedSampleCount}</td>
              </tr>`
                  : ""
              }
              ${inquiryData.service === "bioinformatics" ? formatBioinformaticsDetailsHtml(inquiryData.bioinformaticsDetails as Record<string, any> | undefined) : ""}
            </table>
            
            ${
              inquiryData.researchOverview
                ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f5f9;">
              <p style="margin: 0; color: #64748b; font-size: 13px;"><strong>Research Overview:</strong></p>
              <p style="margin: 4px 0; font-size: 14px;">${inquiryData.researchOverview}</p>
            </div>`
                : ""
            }

            
            ${
              inquiryData.methodologyFileUrl
                ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #f1f5f9;">
              <p style="margin: 0;"><a href="${inquiryData.methodologyFileUrl}" style="color: #1e40af; text-decoration: underline; font-weight: 600;">View Uploaded Methodology</a></p>
            </div>`
                : ""
            }
          </div>
          
          <div style="margin-top: 20px;">
            <a href="https://omics.pgcvisayas.upv.edu.ph/admin/inquiry" style="background-color: #1e40af; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 600; font-size: 14px;">Review in Admin Panel</a>
          </div>

          <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
            <p style="margin: 2px 0;">Inquiry ID: ${finalInquiryId}</p>
            <p style="margin: 2px 0;">Submitted: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    `;

    // Create email text version
    const emailText = `
New ${formatServiceType(inquiryData.service)} Inquiry

Contact Information:
Name: ${inquiryData.name}
Email: ${inquiryData.email}
Affiliation: ${inquiryData.affiliation}
Designation: ${inquiryData.designation}

Service Type: ${formatServiceType(inquiryData.service)}
${inquiryData.species ? `Species: ${formatSpecies(inquiryData.species, inquiryData.otherSpecies || undefined)}\n` : ""}
${inquiryData.sampleCount ? `Sample Count: ${inquiryData.sampleCount}\n` : ""}
${inquiryData.workflowType ? `Workflow: ${formatWorkflowType(inquiryData.workflowType)}\n` : ""}
${inquiryData.bioinfoOptions && inquiryData.bioinfoOptions.length > 0 ? `Bioinformatics Analysis: ${inquiryData.bioinfoOptions.map(formatBioinfoOption).join(", ")}\n` : ""}
${inquiryData.workflowType === "complete-bioinfo" && inquiryData.bioinformaticsDetails ? `${formatBioinformaticsDetailsText(inquiryData.bioinformaticsDetails as Record<string, any>)}\n` : ""}
${inquiryData.researchOverview ? `Research Overview: ${inquiryData.researchOverview}\n` : ""}
${inquiryData.service === "research" && inquiryData.molecularServicesBudget ? `Budget for Molecular Services: ${inquiryData.molecularServicesBudget}\n` : ""}
${inquiryData.service === "research" && inquiryData.plannedSampleCount ? `Planned Sample Count: ${inquiryData.plannedSampleCount}\n` : ""}
${inquiryData.service === "bioinformatics" ? `${formatBioinformaticsDetailsText(inquiryData.bioinformaticsDetails as Record<string, any> | undefined)}\n` : ""}
${inquiryData.methodologyFileUrl ? `Methodology File: ${inquiryData.methodologyFileUrl}\n` : ""}
${inquiryData.individualAssayDetails ? `Individual Assay Details: ${inquiryData.individualAssayDetails}\n` : ""}
${inquiryData.service === "retail" && inquiryData.retailItems && inquiryData.retailItems.length > 0 ? `Retail Items: \n${inquiryData.retailItems.map((item) => `- ${item}${inquiryData.retailItemDetails?.[item] ? `: ${inquiryData.retailItemDetails?.[item]}` : ""}`).join("\n")}\n` : ""}
${inquiryData.workflows && inquiryData.workflows.length > 0 ? `Workflows: ${Array.isArray(inquiryData.workflows) ? inquiryData.workflows.join(", ") : inquiryData.workflows}\n` : ""}
${inquiryData.additionalInfo ? `Additional Info: ${inquiryData.additionalInfo}\n` : ""}
${inquiryData.projectBackground ? `Project Background: ${inquiryData.projectBackground}\n` : ""}
${inquiryData.projectBudget ? `Project Budget: ${inquiryData.projectBudget}\n` : ""}
${inquiryData.service === "training" && inquiryData.trainingPrograms && inquiryData.trainingPrograms.length > 0 ? `Training Programs: ${inquiryData.trainingPrograms.map(formatTrainingProgram).join(", ")}\n` : ""}
${inquiryData.specificTrainingNeed ? `Training Need: ${inquiryData.specificTrainingNeed}\n` : ""}
${inquiryData.targetTrainingDate ? `Training Date: ${inquiryData.targetTrainingDate}\n` : ""}
${inquiryData.numberOfParticipants ? `Participants: ${inquiryData.numberOfParticipants}\n` : ""}

Inquiry ID: ${finalInquiryId}
Submitted: ${new Date().toLocaleString()}
    `.trim();

    // Create email document with simplified structure for better compatibility
    const emailData = {
      to: emailRecipients,
      inquiryId: finalInquiryId, // Root level for easy searching
      message: {
        subject: `New ${inquiryData.service.charAt(0).toUpperCase() + inquiryData.service.slice(1)} Inquiry from ${inquiryData.name}`,
        text: emailText,
        html: emailHtml,
      },
    };

    console.log("EMAIL DEBUG: Email document structure:", {
      recipients: emailData.to,
      inquiryId: emailData.inquiryId,
      hasSubject: !!emailData.message.subject,
      subjectLength: emailData.message.subject.length,
      htmlLength: emailData.message.html.length,
      textLength: emailData.message.text.length,
    });

    // Attempt to create email documents with isolated error handling.
    // Admin and client notifications should not block each other.
    let emailDocumentCreated = false;
    let clientEmailSent = false;
    let emailDocId = "";
    let adminEmailError: string | null = null;
    let clientEmailError: string | null = null;
    const emailFallbackDocs: Record<string, unknown>[] = [];

    if (emailRecipients.length > 0) {
      try {
        console.log(
          "EMAIL DEBUG: Attempting to create admin email document...",
        );
        console.log("EMAIL DEBUG: Firestore DB check:", {
          isDbDefined: !!db,
          dbType: typeof db,
          hasCollection: typeof collection === "function",
          hasAddDoc: typeof addDoc === "function",
        });

        console.log(
          "EMAIL DEBUG: Email data to be sent:",
          JSON.stringify(
            {
              to: emailData.to,
              inquiryId: emailData.inquiryId,
              hasMessage: !!emailData.message,
              messageKeys: Object.keys(emailData.message),
            },
            null,
            2,
          ),
        );

        console.log(
          "EMAIL DEBUG: Creating email for recipients:",
          emailData.to.join(", "),
        );

        const emailDocRef = await addMailDocument(
          emailData as Record<string, unknown>,
        );
        emailDocumentCreated = true;
        emailDocId = emailDocRef.id;

        console.log("âœ… EMAIL SUCCESS: Admin email document created!");
        console.log("Email Document ID:", emailDocRef.id);
        console.log("Email Document Path:", emailDocRef.path);
        console.log("Email Document Full Path:", `mail/${emailDocRef.id}`);

        // Immediately verify the document exists in Firestore
        console.log("EMAIL DEBUG: Starting immediate verification...");
        try {
          const verifyDoc = emailDocRef.viaAdmin
            ? await adminDb!.collection("mail").doc(emailDocRef.id).get()
            : await getDoc(doc(db, "mail", emailDocRef.id));
          if (snapshotExists(verifyDoc)) {
            const docData = snapshotData(verifyDoc);
            if (!docData) {
              console.error(
                "❌ VERIFICATION FAILED: Email document exists but payload is unavailable",
              );
            } else {
              console.log(
                "âœ… VERIFICATION SUCCESS: Email document confirmed in Firestore!",
              );
              console.log("Verified data:", {
                inquiryId: docData.inquiryId,
                recipients: docData.to,
                hasMessage: !!docData.message,
                subject: docData.message?.subject,
              });
            }
          } else {
            console.error(
              "âŒ VERIFICATION FAILED: Email document not found immediately after creation!",
            );
            console.error("Expected document at:", `mail/${emailDocRef.id}`);
          }
        } catch (verifyError) {
          console.error("âŒ VERIFICATION ERROR:", verifyError);
          console.error("Verify error details:", {
            name: verifyError instanceof Error ? verifyError.name : "Unknown",
            message:
              verifyError instanceof Error
                ? verifyError.message
                : String(verifyError),
          });
        }

        // Enhanced status checking with better error handling
        setTimeout(async () => {
          try {
            console.log(
              "EMAIL DEBUG: Checking email document status after 5 seconds...",
            );
            const emailDoc = await getDoc(doc(db, "mail", emailDocRef.id));

            if (emailDoc.exists()) {
              const emailStatus = emailDoc.data();
              console.log(
                "EMAIL STATUS AFTER 5s:",
                JSON.stringify(emailStatus, null, 2),
              );

              // Check for delivery status
              if (emailStatus.delivery) {
                if (emailStatus.delivery.state === "SUCCESS") {
                  console.log("âœ… EMAIL DELIVERED: Email sent successfully!");
                } else if (emailStatus.delivery.state === "ERROR") {
                  console.error(
                    "âŒ EMAIL DELIVERY FAILED:",
                    emailStatus.delivery.error,
                  );
                } else {
                  console.log(
                    "ðŸ“§ EMAIL PENDING: Email state:",
                    emailStatus.delivery.state,
                  );
                }
              } else {
                console.log(
                  "â³ EMAIL PENDING: No delivery status yet (still processing)",
                );
              }
            } else {
              console.log(
                "âš ï¸ EMAIL WARNING: Email document no longer exists (may have been processed and deleted by extension)",
              );
            }
          } catch (checkError) {
            console.error(
              "EMAIL DEBUG ERROR: Could not check email status:",
              checkError,
            );
          }
        }, 5000);
      } catch (emailError) {
        adminEmailError =
          emailError instanceof Error ? emailError.message : String(emailError);
        emailFallbackDocs.push(emailData as Record<string, unknown>);
        console.error("âŒ EMAIL CREATION FAILED:", emailError);
        console.error("Error type:", typeof emailError);
        console.error("Error constructor:", emailError?.constructor?.name);
        console.error(
          "Full error object:",
          JSON.stringify(emailError, Object.getOwnPropertyNames(emailError)),
        );
        console.error("Error details:", {
          name: emailError instanceof Error ? emailError.name : "Unknown",
          message:
            emailError instanceof Error
              ? emailError.message
              : String(emailError),
          code: (emailError as any)?.code || "No code",
          stack:
            emailError instanceof Error ? emailError.stack : "No stack trace",
        });

        // Log additional debugging information
        console.log("EMAIL DEBUG: Failure context:", {
          hasDB: !!db,
          dbType: typeof db,
          hasCollection: typeof collection === "function",
          hasAddDoc: typeof addDoc === "function",
          emailDataSize: JSON.stringify(emailData).length,
          emailDataKeys: Object.keys(emailData),
          timestamp: new Date().toISOString(),
          inquiryIdExists: !!finalInquiryId,
        });

        console.log(
          "EMAIL DEBUG: Continuing with inquiry creation despite admin email failure",
        );
      }
    } else {
      console.warn(
        "EMAIL DEBUG: No admin notification recipients configured for service:",
        inquiryData.service,
      );
    }

    // === CLIENT CONFIRMATION EMAIL ===
    // Send automated confirmation email to the client even if admin email fails.
    let clientEmailFallbackDoc: Record<string, unknown> | null = null;

    try {
      if (inquiryData.email) {
        console.log(
          "EMAIL DEBUG: Creating client confirmation email for:",
          inquiryData.email,
        );

        const clientEmailHtml = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
            <div style="background-color: #ffffff; padding: 0; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px 20px; text-align: left;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">Inquiry Received - PGC Visayas</h1>
              </div>

              <div style="padding: 32px 24px;">
                <p style="margin: 0 0 20px 0; font-size: 16px;">Dear <strong>${inquiryData.name}</strong>,</p>
                <p style="margin: 0 0 24px 0;">Thank you for reaching out to <strong>PGC Visayas</strong> for your research needs. Our team will be reviewing your inquiry and will get back to you as soon as possible.</p>
                
                <!-- Next Steps Card -->
                <div style="background-color: #f8fafc; padding: 24px; border-radius: 8px; border-left: 4px solid #1e40af; margin: 24px 0;">
                  <h3 style="margin: 0 0 12px 0; color: #1e40af; font-size: 16px; font-weight: 700;">Next Steps</h3>
                  <p style="margin: 0 0 20px 0; font-size: 15px; color: #475569;">Monitor your request status and view quotations via the Client Portal.</p>
                  <p style="margin: 0;"><a href="https://omics.pgcvisayas.upv.edu.ph/portal" style="background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 14px; transition: background-color 0.2s;">Access Client Portal</a></p>
                </div>

                ${
                  !inquiryData.returnToPortal
                    ? `
                <!-- Credentials Info -->
                <div style="margin: 24px 0; padding: 16px 0; border-top: 1px solid #f1f5f9;">
                  <h4 style="margin: 0 0 12px 0; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Access Credentials</h4>
                  <p style="margin: 6px 0; font-size: 15px;"><strong style="color: #475569; width: 80px; display: inline-block;">Email:</strong> <span style="color: #1e40af; text-decoration: none;">${inquiryData.email}</span></p>
                  <p style="margin: 6px 0; font-size: 15px;"><strong style="color: #475569; width: 80px; display: inline-block;">Password:</strong> <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; color: #334155;">${finalInquiryId}</code></p>
                </div>
                `
                    : ""
                }

                <p style="margin: 32px 0 24px 0; font-size: 15px;">One of our researchers will contact you shortly if additional information is needed. In the meantime, if you have any questions, you may reply through the chatbox in the client portal.</p>
                
                <!-- Sign-off -->
                <div style="border-top: 1px solid #f1f5f9; padding-top: 24px; margin-top: 32px;">
                  <p style="margin: 0; color: #64748b; font-size: 14px;">Yours in utilizing OMICS for a better Philippines,</p>
                  <p style="margin: 4px 0 0 0; color: #1e40af; font-weight: 700; font-size: 16px;">Philippine Genome Center Visayas</p>
                </div>
              </div>

              <!-- Footer -->
              <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
                <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated message. Please do not reply directly to this email.</p>
              </div>
            </div>
          </div>
        `;

        const clientEmailData = {
          to: [inquiryData.email],
          inquiryId: finalInquiryId,
          message: {
            subject: "Inquiry Received: PGC Visayas",
            html: clientEmailHtml,
          },
        };

        clientEmailFallbackDoc = clientEmailData as Record<string, unknown>;

        await addMailDocument(clientEmailData as Record<string, unknown>);
        clientEmailSent = true;
        console.log(
          "âœ… EMAIL SUCCESS: Client confirmation email sent to:",
          inquiryData.email,
        );
      } else {
        console.log(
          "âš ï¸ EMAIL WARNING: No client email provided, skipping confirmation email",
        );
      }
    } catch (error) {
      clientEmailError = error instanceof Error ? error.message : String(error);
      if (clientEmailFallbackDoc) {
        emailFallbackDocs.push(clientEmailFallbackDoc);
      }
      console.error("âŒ CLIENT EMAIL FAILED:", error);
      // Continue execution even if client email fails
    }

    console.log("=== EMAIL DEBUG: Email process completed ===");
    console.log("Email document created:", emailDocumentCreated);
    console.log("Client email sent:", clientEmailSent);
    console.log("Email document ID:", emailDocId);

    // Revalidate the admin inquiry page cache to show new data immediately
    // This ensures the admin sees the new inquiry without page refresh
    revalidatePath("/admin/inquiry");

    return {
      success: true,
      inquiryId: finalInquiryId,
      emailSent: emailDocumentCreated || clientEmailSent,
      adminEmailSent: emailDocumentCreated,
      clientEmailSent,
      emailDocId: emailDocId,
      message: emailDocumentCreated
        ? "Inquiry submitted successfully."
        : "Inquiry submitted successfully.",
      ...(adminEmailError || clientEmailError
        ? {
            error:
              [adminEmailError, clientEmailError].filter(Boolean).join(" | ") ||
              undefined,
            emailFallbackDocs:
              emailFallbackDocs.length > 0 ? emailFallbackDocs : undefined,
          }
        : {}),
    };
  } catch (error) {
    console.error("Error creating inquiry:", error);
    // Include the error message in the thrown error for Toast notification
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create inquiry: ${errorMessage}`);
  }
}

/**
 * Creates a new inquiry directly from admin interface
 *
 * This function allows administrators to manually create inquiry records
 * without going through the public form submission process.
 *
 * Note: This creates a minimal inquiry record with default values for
 * service-specific fields since it's created by admin, not user submission.
 */
export async function createAdminInquiryAction(
  data: AdminInquiryData,
  userInfo?: { name: string; email: string },
) {
  try {
    // Transform admin data to database format with defaults for service fields
    const resolvedUuid = await resolveInquiryUuid(data.email);
    const transformedData = {
      // Core fields from admin form
      name: data.name,
      email: data.email,
      affiliation: data.affiliation,
      designation: data.designation,
      status: data.status,
      isApproved: data.status === "Approved Client", // Auto-approve if status is 'Approved Client'
      createdAt: serverTimestamp(),
      haveSubmitted: false,
      uuid: resolvedUuid ?? null,

      // Default values for service-specific fields since this is admin-created
      workflows: [],
      additionalInfo: null,
      projectBackground: null,
      projectBudget: null,
      specificTrainingNeed: null,
      targetTrainingDate: null,
      numberOfParticipants: null,
      serviceType: null,
    };

    // Add the inquiry document to Firestore
    const docRef = await addDoc(collection(db, "inquiries"), transformedData);

    // Log the activity
    await logActivity({
      userId: userInfo?.email || "system",
      userEmail: userInfo?.email || "system@pgc.admin",
      userName: userInfo?.name || "System",
      action: "CREATE",
      entityType: "inquiry",
      entityId: docRef.id,
      entityName: data.name,
      description: `Created inquiry for ${data.name}`,
      changesAfter: transformedData,
    });

    // Revalidate the admin inquiry page to show the new entry
    revalidatePath("/admin/inquiry");

    return { success: true, inquiryId: docRef.id };
  } catch (error) {
    console.error("Error creating inquiry:", error);
    throw new Error("Failed to create inquiry");
  }
}

/**
 * Updates an existing inquiry record
 *
 * This function allows administrators to modify inquiry details,
 * including status changes and approval status updates.
 *
 * Note: Only updates core fields that can be modified by admin.
 * Service-specific fields are preserved from original submission.
 */
export async function updateInquiryAction(
  id: string,
  data: AdminInquiryData,
  userInfo?: { name: string; email: string },
) {
  try {
    // Create reference to the specific inquiry document
    const docRef = doc(db, "inquiries", id);

    // Get old data for logging
    const oldDoc = await getDoc(docRef);
    const oldData = oldDoc.exists() ? oldDoc.data() : null;

    const resolvedUuid = await resolveInquiryUuid(data.email);
    const updateData: any = {
      name: data.name,
      email: data.email,
      affiliation: data.affiliation,
      designation: data.designation,
      status: data.status,
      isApproved: data.status === "Approved Client",
      uuid: resolvedUuid ?? oldData?.uuid ?? null,
    };

    // Update only the editable fields
    await updateDoc(docRef, updateData);

    // If "Service Not Offered" and send email is checked, trigger email via Firestore mail collection
    if (
      data.status === "Service Not Offered" &&
      data.sendStatusEmail !== false
    ) {
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header with Logo -->
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">PGC Visayas</h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">Update Regarding Your Inquiry</p>
          </div>

          <div style="padding: 32px 24px; color: #334155; line-height: 1.6;">
            <p style="margin: 0 0 20px 0; font-size: 16px;">Dear <strong>${data.name}</strong>,</p>
            
            <p style="margin: 0 0 20px 0;">Thank you for submitting your inquiry to <strong>PGC Visayas</strong>.</p>
            
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
              <p style="margin: 0; color: #991b1b; font-weight: 500;">Status: Service Not Offered</p>
              <p style="margin: 8px 0 0 0; color: #b91c1c; font-size: 14px;">
                Unfortunately, the requested services are currently unavailable at our facility, and the project requirements fall outside our specific scope of expertise.
              </p>
            </div>

            ${
              data.remarks
                ? `
            <div style="margin-bottom: 24px;">
              <h3 style="font-size: 14px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; margin: 0 0 8px 0;">Additional Remarks</h3>
              <div style="background-color: #f8fafc; padding: 16px; border: 1px solid #f1f5f9; border-radius: 8px; color: #475569; font-style: italic;">
                "${data.remarks}"
              </div>
            </div>
            `
                : ""
            }

            <p style="margin: 0 0 20px 0;">If you require additional information, kindly review our <strong><a href="https://omics.pgcvisayas.upv.edu.ph/faqs" style="color: #2563eb; text-decoration: none;">FAQs</a></strong>, or you can message us through the <strong><a href="https://omics.pgcvisayas.upv.edu.ph/portal" style="color: #2563eb; text-decoration: none;">client portal chat box</a></strong>.</p>
            
            <p style="margin: 0 0 32px 0;">We appreciate your interest in working with us and wish you the best of luck in finding the right facility to support your research needs.</p>
            
            <div style="border-top: 1px solid #f1f5f9; padding-top: 24px;">
              <p style="margin: 0; color: #64748b; font-size: 14px;">Yours in utilizing OMICS for a better Philippines,</p>
              <p style="margin: 4px 0 0 0; color: #1e40af; font-weight: 700; font-size: 16px;">Philippine Genome Center Visayas</p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated message. Please do not reply directly to this email.</p>
          </div>
        </div>
      `;

      const mailDocRef = doc(collection(db, "mail"));
      await setDoc(mailDocRef, {
        to: data.email,
        message: {
          subject: "Update Regarding Your Inquiry",
          html: emailHtml,
        },
        metadata: {
          inquiryId: id,
          type: "service-not-offered",
          remarks: data.remarks || "",
        },
        createdAt: serverTimestamp(),
      });
    }

    // Log the activity
    await logActivity({
      userId: userInfo?.email || "system",
      userEmail: userInfo?.email || "system@pgc.admin",
      userName: userInfo?.name || "System",
      action: "UPDATE",
      entityType: "inquiry",
      entityId: id,
      entityName: data.name,
      description: `Updated inquiry for ${data.name}${data.status === "Service Not Offered" ? " - Service Not Offered" : ""}`,
      changesBefore: oldData || undefined,
      changesAfter: { ...oldData, ...updateData },
      changedFields: Object.keys(updateData),
    });

    // Revalidate the admin inquiry page to reflect changes
    revalidatePath("/admin/inquiry");

    return { success: true };
  } catch (error) {
    console.error("Error updating inquiry:", error);
    throw new Error("Failed to update inquiry");
  }
}

/**
 * Updates an inquiry's status directly.
 * Useful for automated status transitions.
 *
 * @param id - The Firestore document ID of the inquiry
 * @param status - The new status to set
 */
export async function updateInquiryStatus(id: string, status: string) {
  try {
    const docRef = doc(db, "inquiries", id);
    await updateDoc(docRef, { status });

    // Log the activity
    await logActivity({
      userId: "system",
      userEmail: "system@pgc.admin",
      userName: "System",
      action: "UPDATE",
      entityType: "inquiry",
      entityId: id,
      description: `Inquiry status automatically updated to: ${status}`,
    });

    // Revalidate the admin inquiry page to reflect changes
    revalidatePath("/admin/inquiry");

    return { success: true };
  } catch (error) {
    console.error("Error updating inquiry status:", error);
    throw error;
  }
}

/**
 * Deletes an inquiry record from the database
 *
 * This function permanently removes an inquiry document from Firestore.
 * Use with caution as this operation cannot be undone.
 *
 */
export async function deleteInquiryAction(
  id: string,
  userInfo?: { name: string; email: string },
) {
  try {
    // Create reference to the specific inquiry document
    const docRef = doc(db, "inquiries", id);

    // Get data before deletion for logging
    const docSnap = await getDoc(docRef);
    const inquiryData = docSnap.exists() ? docSnap.data() : null;

    // Permanently delete the document from Firestore
    await deleteDoc(docRef);

    // Log the activity
    await logActivity({
      userId: userInfo?.email || "system",
      userEmail: userInfo?.email || "system@pgc.admin",
      userName: userInfo?.name || "System",
      action: "DELETE",
      entityType: "inquiry",
      entityId: id,
      entityName: inquiryData?.name || "Unknown",
      description: `Deleted inquiry for ${inquiryData?.name || id}`,
      changesBefore: inquiryData || undefined,
    });

    // Revalidate the admin inquiry page to remove the deleted entry
    revalidatePath("/admin/inquiry");

    return { success: true };
  } catch (error) {
    console.error("Error deleting inquiry:", error);
    throw new Error("Failed to delete inquiry");
  }
}

/**
 * Send an email to the client when their project submission is cancelled.
 * Matches the style of "Service Not Offered" but with project-specific details.
 */
export async function sendProjectCancellationEmail(
  clientEmail: string,
  clientName: string,
  projectName: string,
  reviewNotes: string,
  inquiryId: string,
) {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <!-- Header with Logo -->
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">PGC Visayas</h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">Update Regarding Your Project Submission</p>
        </div>

        <div style="padding: 32px 24px; color: #334155; line-height: 1.6;">
          <p style="margin: 0 0 20px 0; font-size: 16px;">Dear <strong>${clientName}</strong>,</p>
          
          <p style="margin: 0 0 20px 0;">This is an update regarding your project submission: <strong>${projectName}</strong>.</p>
          
          <p style="margin: 0 0 24px 0;">After careful review of your project details and team member registration, we regret to inform you that your submission has been <strong>cancelled</strong> for the following reason:</p>

          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
            <h3 style="font-size: 14px; text-transform: uppercase; color: #991b1b; letter-spacing: 0.05em; margin: 0 0 8px 0;">Review Notes</h3>
            <div style="color: #b91c1c; font-style: italic;">
              "${reviewNotes}"
            </div>
          </div>

          <p style="margin: 0 0 20px 0;">If you wish to resubmit your project, please address the review notes above and complete the submission process again through the <strong><a href="https://omics.pgcvisayas.upv.edu.ph/portal" style="color: #2563eb; text-decoration: none;">client portal</a></strong>.</p>
          
          <p style="margin: 0 0 20px 0;">If you have any questions or require further clarification, you may message us through the <strong>portal chat box</strong> or review our <a href="https://omics.pgcvisayas.upv.edu.ph/faqs" style="color: #2563eb; text-decoration: none;">FAQs</a>.</p>
          
          <div style="border-top: 1px solid #f1f5f9; padding-top: 24px;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">Yours in utilizing OMICS for a better Philippines,</p>
            <p style="margin: 4px 0 0 0; color: #1e40af; font-weight: 700; font-size: 16px;">Philippine Genome Center Visayas</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated message. Please do not reply directly to this email.</p>
        </div>
      </div>
    `;

    const mailDocRef = doc(collection(db, "mail"));
    await setDoc(mailDocRef, {
      to: clientEmail,
      message: {
        subject: `Update Regarding Your Project Submission: ${projectName}`,
        html: emailHtml,
      },
      metadata: {
        inquiryId: inquiryId,
        type: "project-cancellation",
        projectName: projectName,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending project cancellation email:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error while sending email",
    };
  }
}

/**
 * Send an approval + next-steps email to the client when their project is approved
 * and CIDs have been generated.
 */
export async function sendProjectApprovalEmail(
  clientEmail: string,
  clientName: string,
  projectName: string,
  projectPid: string,
  inquiryId: string,
) {
  try {
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");

    const portalUrl = "https://omics.pgcvisayas.upv.edu.ph/portal";

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">PGC Visayas</h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 8px 0 0 0; font-size: 14px;">Project Approval and Next Steps</p>
        </div>

        <div style="padding: 32px 24px; color: #334155; line-height: 1.6;">
          <p style="margin: 0 0 20px 0; font-size: 16px;">Dear <strong>${clientName}</strong>,</p>

          <p style="margin: 0 0 20px 0;">
            Thank you for confirming your intent to avail of our services. Your project,
            <strong>&ldquo;${projectName}&rdquo;</strong> (Project ID: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${projectPid}</code>),
            has been <strong style="color: #16a34a;">approved</strong>, and we&rsquo;re pleased to have you on board!
          </p>

          <!-- Next Steps Box -->
          <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px; padding: 20px 20px 8px 20px; margin-bottom: 24px;">
            <h3 style="margin: 0 0 14px 0; font-size: 15px; color: #15803d; text-transform: uppercase; letter-spacing: 0.05em;">Next Steps</h3>
            <p style="margin: 0 0 12px 0;">
              To proceed, kindly complete the <strong>Sample Submission Form</strong> directly through your client portal
              for the samples you will be submitting:
            </p>
            <ol style="margin: 0 0 12px 0; padding-left: 20px; line-height: 1.9;">
              <li>Navigate to your approved project under the <strong>&ldquo;My Projects&rdquo;</strong> section.</li>
              <li>Make sure to read the <strong>Sample Submission Requirements</strong>.</li>
              <li>Download the <strong>Sample Submission Form</strong> and fill it out with your sample details.</li>
              <li>Attach the completed sample submission form and click <strong>&ldquo;Upload&rdquo;</strong> to submit.</li>
            </ol>
            <p style="margin: 0 0 12px 0;">
              Once your submission is received, we will coordinate with you regarding the
              physical drop-off or shipping of your samples.
            </p>
          </div>

          <p style="margin: 0 0 20px 0;">
            You may access your client portal here:&nbsp;
            <a href="${portalUrl}" style="color: #2563eb; font-weight: 600; text-decoration: none;">${portalUrl}</a>
          </p>

          <p style="margin: 0 0 20px 0;">
            If you encounter any issues accessing the portal or have questions about the submission
            requirements, please do not hesitate to reach out via the <strong>portal chat box</strong> or
            check our <a href="https://omics.pgcvisayas.upv.edu.ph/faqs" style="color: #2563eb; text-decoration: none;">FAQs</a>.
            We look forward to working with you!
          </p>

          <div style="border-top: 1px solid #f1f5f9; padding-top: 24px;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">Yours in utilizing OMICS for a better Philippines,</p>
            <p style="margin: 4px 0 0 0; color: #1e40af; font-weight: 700; font-size: 16px;">Philippine Genome Center Visayas</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #f1f5f9;">
          <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated message. Please do not reply directly to this email.</p>
        </div>
      </div>
    `;

    const emailText = `Dear ${clientName},

Thank you for confirming your intent to avail of our services. Your project, "${projectName}" (Project ID: ${projectPid}), has been approved, and we're pleased to have you on board!

To proceed, kindly complete the Sample Submission Form directly through your client portal for the samples you will be submitting:

1. Navigate to your approved project under the "My Projects" section.
2. Make sure to read the Sample Submission Requirements.
3. Download the Sample Submission Form and fill it out with your sample details.
4. Attach the completed sample submission form and click "Upload" to submit.

Once your submission is received, we will coordinate with you regarding the physical drop-off or shipping of your samples.

Access your client portal here: ${portalUrl}

If you encounter any issues accessing the portal or have questions about the submission requirements, please do not hesitate to reach out. We look forward to working with you!

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas`.trim();

    const mailDocRef = doc(collection(db, "mail"));
    await setDoc(mailDocRef, {
      to: clientEmail,
      message: {
        subject: `Project Approval and Next Steps: ${projectName}`,
        text: emailText,
        html: emailHtml,
      },
      metadata: {
        inquiryId,
        type: "project-approval",
        projectName,
        projectPid,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending project approval email:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error while sending email",
    };
  }
}
