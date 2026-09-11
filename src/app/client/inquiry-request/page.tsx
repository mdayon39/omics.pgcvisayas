/**
 * Client Inquiry Request Form Page
 *
 * This is the main form page where clients can submit requests for different services offered by the PGC. The form dynamically changes based on the selected service type and includes comprehensive validation.
 *
 * Used in:
 * - Client-facing inquiry submission (/client/inquiry-request)
 *
 * Key Features:
 * - Dynamic form fields based on service type selection
 * - Real-time form validation using Zod schemas
 * - Confirmation modal before submission
 * - Toast notifications for user feedback
 * - Authentication integration for user email
 * - Responsive design with modern UI
 */

"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  inquiryFormSchema,
  type InquiryFormData,
  type WorkflowOption,
} from "@/schemas/inquirySchema";
import { createInquiryAction } from "@/app/actions/inquiryActions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarIcon,
  Paperclip,
  X,
  FileText,
  Loader2,
  Settings2,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { uploadFile, validateFile } from "@/lib/fileUpload";
import { db } from "@/lib/firebase";
import { doc, collection, addDoc } from "firebase/firestore";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";
import ConfirmationModalLayout from "@/components/modal/ConfirmationModalLayout";
import { useRouter, useSearchParams } from "next/navigation";

const TRAINING_PROGRAM_OPTIONS = [
  "Basic Molecular Biology Techniques: Applications in Next Generation Sequencing",
  "Whole Genome Sequencing: Library Preparation and Bioinformatics Analysis",
  "Amplicon Sequencing: Library Preparation and Bioinformatics Analysis",
  "Metagenomics/Metabarcoding Sequencing: Library Preparation and Bioinformatics Analysis",
  "Real-Time PCR Workshop",
  "Bioinformatics Analysis (Customized depending on the needed application)",
  "Others / Customized Training Program",
] as const;

const BIOINFO_SERVICE_TYPE_OPTIONS = [
  { id: "phylogenetic", label: "Phylogenetic Analysis" },
  { id: "metabarcoding", label: "Metabarcoding/Metagenomics" },
  { id: "transcriptomics", label: "Transcriptomics" },
  { id: "whole-genome-assembly", label: "Whole Genome Assembly" },
  { id: "others", label: "Others" },
] as const;

const BIOINFO_DATA_FORMAT_OPTIONS = ["fastq", "fasta", "others"] as const;

/**
 * Main Quotation Request Form Component
 *
 * This component handles the complete inquiry submission flow including
 * form validation, confirmation, and submission to the backend.
 */
export default function QuotationRequestForm() {
  // State for managing the currently selected service type
  const [selectedService, setSelectedService] = useState<string>("laboratory");

  // Loading state for form submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal state for confirmation dialog
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Temporary storage for form data before confirmation
  const [pendingData, setPendingData] = useState<InquiryFormData | null>(null);

  // State for training date picker (separate from form state for UI purposes)
  const [trainingDate, setTrainingDate] = useState<Date>();

  // State for methodology file upload (Laboratory service)
  const [methodologyFile, setMethodologyFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // State for the Bioinformatics Analysis configuration modal
  const [showBioinfoModal, setShowBioinfoModal] = useState(false);

  // Get authenticated user information
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToPortal = searchParams.get("returnToPortal") === "true";
  const returnEmail = searchParams.get("email") || user?.email || "";
  // Original inquiry ID to redirect back to (so the client's portal "password" doesn't change)
  const returnInquiryId = searchParams.get("returnInquiryId") || "";

  // Show logged-in email at the top (best practice: clear, non-intrusive, accessible)
  // Only show if user is authenticated
  // Place above the main form
  const [showEmailBanner, setShowEmailBanner] = useState(false);

  // Initialize form with validation schema and default values
  const form = useForm<InquiryFormData>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: {
      email: "",
      name: "",
      affiliation: "",
      designation: "",
      service: "laboratory",
      species: undefined,
      otherSpecies: "",
      researchOverview: "",
      methodologyFileUrl: "",
      sampleCount: undefined,
      workflowType: undefined,
      bioinformaticsDetails: {
        serviceTypes: [],
        dataFileFormats: [],
        dataProvidedByPgc: false,
      },
      bioinfoOptions: [],
      individualAssayDetails: "",
      retailItems: [],
      retailItemDetails: {},
      workflows: [],
      additionalInfo: "",
      projectBackground: "",
      projectBudget: "",
      molecularServicesBudget: "",
      plannedSampleCount: "",
      trainingPrograms: [],
      specificTrainingNeed: "",
      targetTrainingDate: "",
      numberOfParticipants: undefined,
    },
  });

  // Destructure form methods for easier access
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = form;
  const formData = watch(); // Watch all form values for reactive updates

  useEffect(() => {
    const resolvedEmail = user?.email || returnEmail || "";
    if (resolvedEmail) {
      setValue("email", resolvedEmail, {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [returnEmail, setValue, user?.email]);

  /**
   * Handles service type selection and resets service-specific fields
   * When a user changes the service type, clear all the fields
   * that are specific to other service types to prevent data contamination.
   */
  const handleServiceChange = (value: string) => {
    setSelectedService(value);
    setValue(
      "service",
      value as
        | "laboratory"
        | "bioinformatics"
        | "equipment"
        | "retail"
        | "research"
        | "training",
    );

    // Reset service-specific fields when switching to prevent cross-contamination
    setValue("species", undefined);
    setValue("otherSpecies", "");
    setValue("researchOverview", "");
    setValue("methodologyFileUrl", "");
    setValue("sampleCount", undefined);
    setValue("workflowType", undefined);
    setValue("bioinformaticsDetails", {
      serviceTypes: [],
      dataFileFormats: [],
      dataProvidedByPgc: false,
    });
    setValue("bioinfoOptions", []);
    setValue("individualAssayDetails", "");
    setValue("retailItems", []);
    setValue("retailItemDetails", {});
    setValue("workflows", []);
    setValue("additionalInfo", "");
    setValue("projectBackground", "");
    setValue("projectBudget", "");
    setValue("molecularServicesBudget", "");
    setValue("plannedSampleCount", "");
    setValue("trainingPrograms", []);
    setValue("specificTrainingNeed", "");
    setValue("targetTrainingDate", "");
    setValue("numberOfParticipants", undefined);
    setTrainingDate(undefined);
  };

  const handleTrainingProgramChange = (program: string, checked: boolean) => {
    const currentPrograms = formData.trainingPrograms || [];
    const newPrograms = checked
      ? [...currentPrograms, program]
      : currentPrograms.filter((p) => p !== program);

    setValue("trainingPrograms", newPrograms, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (program === "others-customized" && !checked) {
      setValue("specificTrainingNeed", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  /**
   * Handles workflow checkbox changes for laboratory service
   *
   * Updates the workflows array by adding or removing the selected workflow
   * based on whether the checkbox is checked or unchecked.
   */
  const handleWorkflowChange = (workflow: string, checked: boolean) => {
    const currentWorkflows = formData.workflows || [];
    const newWorkflows = checked
      ? [...currentWorkflows, workflow as WorkflowOption]
      : currentWorkflows.filter((w) => w !== workflow);
    setValue("workflows", newWorkflows);
  };

  /**
   * Handles retail item checkbox changes
   */
  const handleRetailItemChange = (item: string, checked: boolean) => {
    const currentItems = formData.retailItems || [];
    const newItems = checked
      ? [...currentItems, item]
      : currentItems.filter((i) => i !== item);
    setValue("retailItems", newItems);

    // Also clear detail if unchecked
    if (!checked) {
      const currentDetails = formData.retailItemDetails || {};
      const { [item]: _, ...newDetails } = currentDetails;
      setValue("retailItemDetails", newDetails);
    }
  };

  /**
   * Handles retail item detail changes
   */
  const handleRetailDetailChange = (item: string, amount: string) => {
    const currentDetails = formData.retailItemDetails || {};
    setValue("retailItemDetails", {
      ...currentDetails,
      [item]: amount,
    });
  };

  /**
   * Handles bioinformatics analysis option changes for the complete-bioinfo workflow.
   */
  const handleBioinfoOptionChange = (optionId: string, checked: boolean) => {
    type BioinfoOption = NonNullable<InquiryFormData["bioinfoOptions"]>[number];
    const typedOptionId = optionId as BioinfoOption;
    const currentOptions = (formData.bioinfoOptions || []) as BioinfoOption[];
    const newOptions: BioinfoOption[] = checked
      ? [...currentOptions, typedOptionId]
      : currentOptions.filter((option) => option !== typedOptionId);
    setValue("bioinfoOptions", newOptions);
  };

  const handleBioinformaticsServiceTypeChange = (
    optionId: string,
    checked: boolean,
  ) => {
    const current = Array.isArray(formData.bioinformaticsDetails?.serviceTypes)
      ? formData.bioinformaticsDetails?.serviceTypes
      : [];
    const next = checked
      ? [...current, optionId]
      : current.filter((item: string) => item !== optionId);

    setValue("bioinformaticsDetails.serviceTypes", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleBioinformaticsDataFormatChange = (
    formatId: string,
    checked: boolean,
  ) => {
    const current = Array.isArray(
      formData.bioinformaticsDetails?.dataFileFormats,
    )
      ? formData.bioinformaticsDetails?.dataFileFormats
      : [];
    const next = checked
      ? [...current, formatId]
      : current.filter((item: string) => item !== formatId);

    setValue("bioinformaticsDetails.dataFileFormats", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  /**
   * Handles date selection for training service
   *
   * Updates both the local state (for UI display) and the form value
   * (for validation and submission). Formats the date as ISO string.
   */
  const handleDateSelect = (date: Date | undefined) => {
    setTrainingDate(date);
    if (date) {
      // Format date as YYYY-MM-DD for form submission
      setValue("targetTrainingDate", format(date, "yyyy-MM-dd"));
    } else {
      setValue("targetTrainingDate", "");
    }
  };

  /**
   * Handles form submission - shows confirmation modal instead of direct submission
   *
   * This provides a two-step submission process where users can review their
   * data before final submission.
   */
  const handleFormSubmit = (data: InquiryFormData) => {
    setPendingData(data); // Store data temporarily
    setShowConfirmModal(true); // Show confirmation modal
  };

  /**
   * Handles the actual form submission after user confirmation
   *
   * This function is called when the user confirms their submission in the modal.
   */
  const handleConfirmSave = async () => {
    if (!pendingData) return;

    setIsSubmitting(true);
    setShowConfirmModal(false);

    // Show loading toast notification
    toast.loading("Submitting your inquiry request...", {
      description:
        "Please wait while we process your request. You will be redirected to the confirmation page shortly.",
      duration: Infinity,
    });

    try {
      // Create a document ID first for better storage organization
      const inquiryRef = doc(collection(db, "inquiries"));
      const inquiryId = inquiryRef.id;

      // Upload methodology file if one was selected
      let methodologyFileUrl = pendingData.methodologyFileUrl || "";
      if (methodologyFile) {
        setIsUploadingFile(true);
        try {
          // Use the pre-generated inquiry ID as the folder name
          methodologyFileUrl = await uploadFile(
            methodologyFile,
            `methodology-files/${inquiryId}`,
          );
        } catch (uploadErr: any) {
          toast.dismiss();
          toast.error("Failed to upload methodology file", {
            description: uploadErr.message,
          });
          setIsSubmitting(false);
          setIsUploadingFile(false);
          return;
        }
        setIsUploadingFile(false);
      }

      // Merge form data with user email and uploaded file URL
      const submissionData = {
        ...pendingData,
        email: pendingData.email || user?.email || returnEmail || "",
        methodologyFileUrl,
        id: inquiryId, // Pass the pre-generated ID
        returnToPortal, // Skip credentials in email for returning clients
        userUid: user?.uid,
      };

      // Submit to server action
      const result = await createInquiryAction(submissionData);

      if (!result) {
        throw new Error("Inquiry submission returned no response.");
      }

      if (result.success) {
        // Fallback mail enqueue: if server-side admin enqueue fails due runtime credentials,
        // enqueue mail docs from the authenticated client session.
        const fallbackDocs = (result as any)?.emailFallbackDocs;
        if (Array.isArray(fallbackDocs) && fallbackDocs.length > 0) {
          try {
            for (const mailDoc of fallbackDocs) {
              await addDoc(collection(db, "mail"), mailDoc);
            }
            console.log("EMAIL FALLBACK: Client-side mail enqueue succeeded");
          } catch (fallbackError) {
            console.error(
              "EMAIL FALLBACK: Client-side mail enqueue failed",
              fallbackError,
            );
          }
        }

        // Dismiss loading toast and show success
        toast.dismiss();

        // Inquiry save succeeded. Email delivery is best-effort and should not
        // change the user-facing success state.
        toast.success("Inquiry submitted successfully!", {
          description: "Thank you for your submission. Redirecting...",
          duration: 4000,
        });

        // Reset form and redirect after brief delay to show success message
        setTimeout(() => {
          reset();
          setSelectedService("laboratory");
          setTrainingDate(undefined);
          setMethodologyFile(null);
          if (returnToPortal && result.inquiryId) {
            // Redirect back to the original inquiry (portal password) when provided
            const portalParams = new URLSearchParams();
            if (returnEmail) portalParams.set("email", returnEmail);
            const targetInquiryId = returnInquiryId || result.inquiryId;
            portalParams.set("inquiryId", targetInquiryId);
            router.push(`/client/client-info?${portalParams.toString()}`);
          } else {
            router.push("/client/inquiry-request/submitted");
          }
        }, 2000);
        return;
      }
    } catch (error: any) {
      console.error("Error submitting form:", error);
      toast.dismiss();
      toast.error("Failed to submit inquiry", {
        description:
          error.message ||
          "There was an error submitting your request. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
      setPendingData(null);
    }
  };

  /**
   * Handles cancellation of the confirmation modal
   * Closes the modal and clears pending data without submitting.
   */
  const handleCancelModal = () => {
    setShowConfirmModal(false);
    setPendingData(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50/50 to-blue-50/30 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/50 p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 bg-gradient-to-r from-[#F69122] to-[#912ABD] rounded-full"></div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#166FB5] to-[#4038AF] bg-clip-text text-transparent">
                Quotation Request Form
              </h1>
            </div>
            {/* Information banner explaining available services */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100 mb-6">
              <p className="text-slate-700 leading-relaxed">
                Thank you for reaching out to PGC Visayas for your research
                needs. We offer a range of services from Equipment Use, DNA
                Extraction, Polymerase Chain Reaction (PCR), Sample
                Purification, Next Generation Sequencing (NGS), Bioinformatics
                Analysis, and Training Services. To assist you better, kindly
                provide us with the following information:
              </p>
            </div>

            {/* User identification banner - for transparency */}
            {user && (
              <div className="flex items-center gap-3 px-5 py-3 mb-8 bg-white border border-slate-100 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-700">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
                  <span className="text-[#166FB5] font-bold text-xs uppercase">
                    {(user.displayName || user.email || "U").charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                    Logged in as
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">
                      {user.displayName || "Client User"}
                    </span>
                    <span className="inline-block w-1 h-1 bg-slate-300 rounded-full"></span>
                    <span className="text-sm font-mono text-[#166FB5] truncate">
                      {user.email}
                    </span>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <div className="px-2 py-1 bg-green-50 text-green-600 text-[10px] font-bold rounded-md border border-green-100 uppercase tracking-tight">
                    Verified Account
                  </div>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
            <input type="hidden" {...register("email")} />
            {/* Personal Information Section */}
            <div className="bg-gradient-to-r from-slate-50 to-blue-50/50 rounded-xl p-6 border border-slate-100">
              <h2 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
                <div className="w-2 h-2 bg-gradient-to-r from-[#166FB5] to-[#4038AF] rounded-full"></div>
                Personal Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name Field */}
                <div className="md:col-span-2">
                  <Label
                    htmlFor="name"
                    className="text-sm font-semibold text-slate-700 mb-2 block"
                  >
                    Full Name <span className="text-[#B9273A]">*</span>
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    {...register("name")}
                    className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-12"
                  />
                  {errors.name && (
                    <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                      <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                      {errors.name.message}
                    </p>
                  )}
                </div>

                {/* Affiliation Field */}
                <div className="md:col-span-2">
                  <Label
                    htmlFor="affiliation"
                    className="text-sm font-semibold text-slate-700 mb-2 block"
                  >
                    Affiliation (Department & Institution Name){" "}
                    <span className="text-[#B9273A]">*</span>
                  </Label>
                  <Input
                    id="affiliation"
                    type="text"
                    placeholder="e.g. Division of Biological Sciences - UPV CAS"
                    {...register("affiliation")}
                    className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-12"
                  />
                  {errors.affiliation && (
                    <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                      <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                      {errors.affiliation.message}
                    </p>
                  )}
                </div>

                {/* Designation Field */}
                <div className="md:col-span-2">
                  <Label
                    htmlFor="designation"
                    className="text-sm font-semibold text-slate-700 mb-2 block"
                  >
                    Designation <span className="text-[#B9273A]">*</span>
                  </Label>
                  <Input
                    id="designation"
                    type="text"
                    placeholder="e.g. Research Assistant, Professor"
                    {...register("designation")}
                    className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-12"
                  />
                  {errors.designation && (
                    <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                      <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                      {errors.designation.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Service Selection Section */}
            <div className="bg-gradient-to-r from-slate-50 to-blue-50/50 rounded-xl p-6 border border-slate-100">
              <h2 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
                <div className="w-2 h-2 bg-gradient-to-r from-[#F69122] to-[#B9273A] rounded-full"></div>
                Service Selection
              </h2>

              <div className="space-y-6">
                {/* Service Type Dropdown */}
                <div>
                  <Label
                    htmlFor="service"
                    className="text-sm font-semibold text-slate-700 mb-2 block"
                  >
                    Select Service Type{" "}
                    <span className="text-[#B9273A]">*</span>
                  </Label>
                  <Select
                    onValueChange={handleServiceChange}
                    defaultValue="laboratory"
                  >
                    <SelectTrigger className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-12">
                      <SelectValue placeholder="Select a service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="laboratory">
                        Laboratory Services
                      </SelectItem>
                      <SelectItem value="bioinformatics">
                        Bioinformatics Analysis
                      </SelectItem>
                      <SelectItem value="equipment">Equipment Use</SelectItem>
                      <SelectItem value="retail">Retail Sales</SelectItem>
                      <SelectItem value="research">
                        Research and Collaboration
                      </SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.service && (
                    <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                      <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                      {errors.service.message}
                    </p>
                  )}
                </div>

                {/* Equipment Use - Replacement Free Text Field */}
                {selectedService === "equipment" && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <Label
                      htmlFor="individualAssayDetails"
                      className="text-sm font-semibold text-slate-700 mb-2 block"
                    >
                      Equipment / Workflow Details{" "}
                      <span className="text-[#B9273A]">*</span>
                    </Label>
                    <Textarea
                      id="individualAssayDetails"
                      placeholder="Please specify the equipment needed or the molecular workflow you intend to perform (e.g., RT-qPCR, DNA extraction, SDS-PAGE, etc.)."
                      {...register("individualAssayDetails")}
                      className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 min-h-[150px] resize-none"
                    />
                    {errors.individualAssayDetails && (
                      <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                        <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                        {errors.individualAssayDetails.message}
                      </p>
                    )}
                  </div>
                )}

                {/* Retail Item Selection - Moved here */}
                {selectedService === "retail" && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <Label className="text-sm font-semibold text-slate-700 mb-4 block">
                      Kindly choose which items you will be availing (Choose 1
                      or more) <span className="text-[#B9273A]">*</span>
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        {
                          label: "Type 1 (Ultrapure) Milli-Q Water",
                          placeholder: "Enter amount in mL or liters",
                        },
                        {
                          label: "Type 2 (Pure/Elix) Distilled Water",
                          placeholder: "Enter amount in mL or liters",
                        },
                        {
                          label: "Liquid Nitrogen",
                          placeholder: "Enter amount in mL or liters",
                        },
                        {
                          label: "Flake Ice",
                          placeholder: "Enter amount in grams or kilograms",
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="flex flex-col space-y-2 p-3 bg-white/50 rounded-lg border border-slate-100 hover:bg-white/70 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              checked={formData.retailItems?.includes(
                                item.label,
                              )}
                              onChange={(e) =>
                                handleRetailItemChange(
                                  item.label,
                                  e.target.checked,
                                )
                              }
                              className="h-4 w-4 rounded border-slate-300 text-[#166FB5] focus:ring-[#166FB5]/20"
                            />
                            <Label className="text-sm text-slate-700 font-medium cursor-pointer">
                              {item.label}
                            </Label>
                          </div>

                          {formData.retailItems?.includes(item.label) && (
                            <div className="pl-7 animate-in fade-in slide-in-from-top-2 duration-300">
                              <Input
                                type="text"
                                placeholder={item.placeholder}
                                value={
                                  formData.retailItemDetails?.[item.label] || ""
                                }
                                onChange={(e) =>
                                  handleRetailDetailChange(
                                    item.label,
                                    e.target.value,
                                  )
                                }
                                className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-9 text-xs"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {errors.retailItems && (
                      <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                        <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                        {errors.retailItems.message}
                      </p>
                    )}
                  </div>
                )}

                {/* Species Selection - Show for Laboratory Services */}
                {selectedService === "laboratory" && (
                  <div>
                    <Label className="text-sm font-semibold text-slate-700 mb-3 block">
                      Species <span className="text-[#B9273A]">*</span>
                      <span className="text-xs font-normal text-slate-500 ml-2">
                        (Choose 1 only)
                      </span>
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        {
                          id: "human",
                          label: "Human",
                          placeholder:
                            "Please specify e.g exosome, whole genome etc.",
                        },
                        {
                          id: "plant",
                          label: "Plant",
                          placeholder:
                            "Please specify plant species and sample type (e.g leaf, fruit, branch etc.)",
                        },
                        {
                          id: "animal",
                          label: "Animal",
                          placeholder:
                            "Please specify animal species and sample type e.g blood, muscle, fins etc.",
                        },
                        {
                          id: "microbe-prokaryote",
                          label: "Microbe (Prokaryote)",
                        },
                        {
                          id: "microbe-eukaryote",
                          label: "Microbe (Eukaryote)",
                        },
                        {
                          id: "other",
                          label: "Other",
                          placeholder: "Please specify species and sample type",
                        },
                      ].map((species) => (
                        <div
                          key={species.id}
                          className="flex flex-col space-y-2"
                        >
                          <div className="flex items-center space-x-3 p-3 bg-white/50 rounded-lg border border-slate-100 hover:bg-white/70 transition-colors">
                            <input
                              type="radio"
                              id={`species-${species.id}`}
                              {...register("species")}
                              value={species.id}
                              className="rounded-full border-slate-300 text-[#166FB5] focus:ring-[#166FB5]/20"
                            />
                            <Label
                              htmlFor={`species-${species.id}`}
                              className="text-sm text-slate-700 font-medium cursor-pointer flex-1"
                            >
                              {species.label}
                            </Label>
                          </div>

                          {/* Species Specific Detail Input */}
                          {formData.species === species.id &&
                            species.placeholder && (
                              <div className="pl-8 pb-2">
                                <Input
                                  placeholder={species.placeholder}
                                  {...register("otherSpecies")}
                                  className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-10 text-sm"
                                />
                                {errors.otherSpecies && (
                                  <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                                    <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                                    {errors.otherSpecies.message}
                                  </p>
                                )}
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                    {errors.species && (
                      <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                        <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                        {errors.species.message}
                      </p>
                    )}
                  </div>
                )}

                {/* Research Overview - Show for Laboratory Services */}
                {selectedService === "laboratory" && (
                  <div>
                    <Label
                      htmlFor="researchOverview"
                      className="text-sm font-semibold text-slate-700 mb-2 block"
                    >
                      Overview of research and objectives. Kindly provide
                      comprehensive details{" "}
                      <span className="text-[#B9273A]">*</span>
                    </Label>
                    <Textarea
                      id="researchOverview"
                      placeholder="Provide a comprehensive description of your research project, objectives, and the specific services you require..."
                      {...register("researchOverview")}
                      className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 min-h-[120px] resize-none"
                      rows={5}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Include details about your research objectives and
                      expected outcomes
                    </p>
                    {errors.researchOverview && (
                      <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                        <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                        {errors.researchOverview.message}
                      </p>
                    )}
                  </div>
                )}

                {/* Methodology/Concept Note Upload - Laboratory only */}
                {selectedService === "laboratory" && (
                  <div>
                    <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                      Upload Methodology/Concept Note
                      <span className="text-xs font-normal text-slate-400 ml-2">
                        (Optional)
                      </span>
                    </Label>

                    {!methodologyFile ? (
                      <label
                        htmlFor="methodology-file"
                        className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer bg-white/50 hover:bg-slate-50 hover:border-[#166FB5]/40 transition-all group"
                      >
                        <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                          <Paperclip className="h-5 w-5 text-slate-400 group-hover:text-[#166FB5] transition-colors" />
                          <p className="text-sm font-medium text-slate-500 group-hover:text-slate-700 transition-colors">
                            Click to attach a file
                          </p>
                          <p className="text-xs text-slate-400">
                            PDF, DOC, DOCX &mdash; up to 10&nbsp;MB
                          </p>
                        </div>
                        <input
                          id="methodology-file"
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              validateFile(file, 10, [
                                "application/pdf",
                                "application/msword",
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                              ]);
                              setMethodologyFile(file);
                            } catch (err: any) {
                              toast.error("Invalid file", {
                                description: err.message,
                              });
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
                        <FileText className="h-5 w-5 text-[#166FB5] shrink-0" />
                        <span className="text-sm font-medium text-slate-700 truncate flex-1">
                          {methodologyFile.name}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">
                          {(methodologyFile.size / 1024 / 1024).toFixed(2)}
                          &nbsp;MB
                        </span>
                        <button
                          type="button"
                          onClick={() => setMethodologyFile(null)}
                          className="p-1 hover:bg-blue-100 rounded-md transition-colors shrink-0"
                          aria-label="Remove file"
                        >
                          <X className="h-4 w-4 text-slate-500" />
                        </button>
                      </div>
                    )}

                    <p className="text-xs text-slate-500 mt-2">
                      Attach your methodology or concept note to help us better
                      understand your research requirements.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Dynamic Fields Section - Changes based on selected service */}
            {selectedService !== "equipment" &&
              selectedService !== "retail" && (
                <div className="bg-gradient-to-r from-slate-50 to-blue-50/50 rounded-xl p-6 border border-slate-100">
                  <h2 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
                    <div className="w-2 h-2 bg-gradient-to-r from-[#912ABD] to-[#4038AF] rounded-full"></div>
                    Service Details
                  </h2>

                  {/* Laboratory Service Fields */}
                  {selectedService === "laboratory" && (
                    <div className="space-y-6">
                      {/* Sample Count */}
                      <div>
                        <Label
                          htmlFor="sampleCount"
                          className="text-sm font-semibold text-slate-700 mb-2 block"
                        >
                          How many samples are you planning to send?{" "}
                          <span className="text-[#B9273A]">*</span>
                        </Label>
                        <Input
                          id="sampleCount"
                          type="number"
                          min="1"
                          placeholder="Enter number of samples"
                          {...register("sampleCount", { valueAsNumber: true })}
                          className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-12"
                        />
                        {errors.sampleCount && (
                          <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                            <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                            {errors.sampleCount.message}
                          </p>
                        )}
                      </div>

                      {/* Workflow Selection */}
                      <div>
                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">
                          Kindly choose which workflow you will be availing{" "}
                          <span className="text-[#B9273A]">*</span>
                        </Label>
                        <div className="space-y-3">
                          {/* Complete Workflow with Bioinfo Option */}
                          <div className="flex items-start space-x-3 p-4 bg-white/50 rounded-lg border border-slate-100 hover:bg-white/70 transition-colors">
                            <input
                              type="radio"
                              id="workflow-complete-bioinfo"
                              {...register("workflowType")}
                              value="complete-bioinfo"
                              className="mt-1 rounded-full border-slate-300 text-[#166FB5] focus:ring-[#166FB5]/20"
                            />
                            <div className="flex-1">
                              <Label
                                htmlFor="workflow-complete-bioinfo"
                                className="text-sm text-slate-700 font-semibold cursor-pointer block"
                              >
                                Complete molecular workflow with Bioinformatics
                                Analysis
                              </Label>

                              {/* Bioinformatics Analysis Modal Trigger - Shown when this option is selected */}
                              {formData.workflowType === "complete-bioinfo" && (
                                <div className="mt-4 space-y-3">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="flex items-center gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 transition-colors"
                                    onClick={() => setShowBioinfoModal(true)}
                                  >
                                    <Settings2 className="h-4 w-4" />
                                    Configure Bioinformatics Analysis
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                  </Button>
                                  {/* Summary of selected bioinformatics services */}
                                  {(() => {
                                    const selectedTypes: string[] =
                                      formData.bioinformaticsDetails
                                        ?.serviceTypes ?? [];
                                    const labels: Record<string, string> = {
                                      phylogenetic: "Phylogenetic Analysis",
                                      metabarcoding:
                                        "Metabarcoding/Metagenomics",
                                      transcriptomics: "Transcriptomics",
                                      "whole-genome-assembly":
                                        "Whole Genome Assembly",
                                      others: "Others",
                                    };
                                    if (selectedTypes.length === 0)
                                      return (
                                        <>
                                          <p className="text-xs text-slate-500 italic">
                                            No analysis configured yet. Click
                                            above to set up.
                                          </p>
                                          {errors.bioinfoOptions && (
                                            <p className="text-[#B9273A] text-sm flex items-center gap-1">
                                              <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                                              {errors.bioinfoOptions.message}
                                            </p>
                                          )}
                                        </>
                                      );
                                    return (
                                      <div className="flex flex-wrap gap-1.5">
                                        {selectedTypes.map((t) => (
                                          <span
                                            key={t}
                                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5"
                                          >
                                            <CheckCircle2 className="h-3 w-3 text-blue-500" />
                                            {labels[t] ?? t}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Complete Workflow Only Option */}
                          <div className="flex items-start space-x-3 p-4 bg-white/50 rounded-lg border border-slate-100 hover:bg-white/70 transition-colors">
                            <input
                              type="radio"
                              id="workflow-complete"
                              {...register("workflowType")}
                              value="complete"
                              className="mt-1 rounded-full border-slate-300 text-[#166FB5] focus:ring-[#166FB5]/20"
                            />
                            <div className="flex-1">
                              <Label
                                htmlFor="workflow-complete"
                                className="text-sm text-slate-700 font-semibold cursor-pointer block"
                              >
                                Complete Molecular workflow only
                              </Label>
                              <p className="text-xs text-slate-600 mt-1">
                                DNA Extraction to Sequencing
                              </p>
                            </div>
                          </div>

                          {/* Individual Assay Option */}
                          <div className="flex items-start space-x-3 p-4 bg-white/50 rounded-lg border border-slate-100 hover:bg-white/70 transition-colors">
                            <input
                              type="radio"
                              id="workflow-individual"
                              {...register("workflowType")}
                              value="individual"
                              className="mt-1 rounded-full border-slate-300 text-[#166FB5] focus:ring-[#166FB5]/20"
                            />
                            <div className="flex-1">
                              <Label
                                htmlFor="workflow-individual"
                                className="text-sm text-slate-700 font-semibold cursor-pointer block"
                              >
                                Individual Assay
                              </Label>
                              <p className="text-xs text-slate-600 mt-1">
                                e.g. DNA Extraction, PCR etc.
                              </p>
                            </div>
                          </div>
                        </div>
                        {errors.workflowType && (
                          <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                            <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                            {errors.workflowType.message}
                          </p>
                        )}

                        {/* Individual Assay Details - Conditional */}
                        {formData.workflowType === "individual" && (
                          <div className="mt-4">
                            <Label
                              htmlFor="individualAssayDetails"
                              className="text-sm font-semibold text-slate-700 mb-2 block"
                            >
                              Please specify e.g. DNA Extraction, PCR etc.{" "}
                              <span className="text-[#B9273A]">*</span>
                            </Label>
                            <Textarea
                              id="individualAssayDetails"
                              {...register("individualAssayDetails")}
                              className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 min-h-[80px] resize-none"
                              rows={3}
                            />
                            {errors.individualAssayDetails && (
                              <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                                <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                                {errors.individualAssayDetails.message}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedService === "bioinformatics" && (
                    <div className="space-y-6">
                      <div>
                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">
                          Type of bioinformatics service{" "}
                          <span className="text-[#B9273A]">*</span>
                        </Label>
                        <div className="space-y-3">
                          {BIOINFO_SERVICE_TYPE_OPTIONS.map((option) => {
                            const selected = (
                              formData.bioinformaticsDetails?.serviceTypes || []
                            ).includes(option.id);
                            return (
                              <details
                                key={option.id}
                                className="rounded-lg border border-slate-200 bg-white/60"
                                open={selected}
                              >
                                <summary className="cursor-pointer list-none px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={(e) =>
                                        handleBioinformaticsServiceTypeChange(
                                          option.id,
                                          e.target.checked,
                                        )
                                      }
                                      className="h-4 w-4 rounded border-slate-300 text-[#166FB5] focus:ring-[#166FB5]/20"
                                    />
                                    <span className="text-sm font-semibold text-slate-700">
                                      {option.label}
                                    </span>
                                  </div>
                                </summary>

                                {option.id === "phylogenetic" && selected && (
                                  <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                                    <div>
                                      <Label className="text-xs font-semibold text-slate-600">
                                        No. of markers
                                      </Label>
                                      <Input
                                        type="number"
                                        min="1"
                                        {...register(
                                          "bioinformaticsDetails.phylogenetic.markerCount",
                                          { valueAsNumber: true },
                                        )}
                                        className="mt-1 h-10"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs font-semibold text-slate-600">
                                        Specify marker(s)
                                      </Label>
                                      <Input
                                        placeholder="e.g., COI"
                                        {...register(
                                          "bioinformaticsDetails.phylogenetic.markers",
                                        )}
                                        className="mt-1 h-10"
                                      />
                                    </div>
                                  </div>
                                )}

                                {option.id === "metabarcoding" && selected && (
                                  <div className="border-t border-slate-100 px-4 py-3 space-y-4">
                                    <details
                                      className="rounded-md border border-slate-100 bg-slate-50/70"
                                      open
                                    >
                                      <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                                        Study Structure
                                      </summary>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-slate-100">
                                        <div>
                                          <Label className="text-xs">
                                            Sample type
                                          </Label>
                                          <Input
                                            placeholder="e.g., soil, water"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.sampleType",
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">
                                            No. of samples
                                          </Label>
                                          <Input
                                            type="number"
                                            min="1"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.sampleCount",
                                              { valueAsNumber: true },
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">
                                            No. of groups/treatments to study
                                          </Label>
                                          <Input
                                            placeholder="NA if not applicable"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.groupCount",
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">
                                            No. of replicates per sample
                                          </Label>
                                          <Input
                                            placeholder="NA if not applicable"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.replicatesPerSample",
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">
                                            Target gene/marker
                                          </Label>
                                          <Input
                                            placeholder="e.g., 16s rRNA, ITS (Fungi)"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.targetGene",
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">
                                            Target region
                                          </Label>
                                          <Input
                                            placeholder="V4"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.targetRegion",
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">
                                            Primer set used
                                          </Label>
                                          <Input
                                            placeholder="e.g., 515F / 806R"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.primerSet",
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">
                                            Expected amplicon size
                                          </Label>
                                          <Input
                                            placeholder="e.g., ~250 bp"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.ampliconSize",
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                        <div className="md:col-span-2">
                                          <Label className="text-xs">
                                            Sequencing type and platform
                                          </Label>
                                          <Input
                                            placeholder="e.g., paired-end Illumina iSeq (2 x 150 bp), Data to be generated by PGC Visayas sequencing service"
                                            {...register(
                                              "bioinformaticsDetails.metabarcoding.study.sequencingPlatform",
                                            )}
                                            className="mt-1 h-9"
                                          />
                                        </div>
                                      </div>
                                    </details>

                                    <details
                                      className="rounded-md border border-slate-100 bg-slate-50/70"
                                      open
                                    >
                                      <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                                        Analysis
                                      </summary>
                                      <div className="space-y-3 p-3 border-t border-slate-100">
                                        <label className="block rounded border border-slate-200 bg-white p-3">
                                          <div className="flex items-start gap-2">
                                            <input
                                              type="radio"
                                              value="general-pipeline"
                                              {...register(
                                                "bioinformaticsDetails.metabarcoding.analysisType",
                                              )}
                                              className="mt-1"
                                            />
                                            <div>
                                              <p className="text-sm font-semibold text-slate-700">
                                                General Pipeline
                                              </p>
                                              <p className="text-xs text-slate-600 mt-1">
                                                Includes FastQC, trimming,
                                                denoising, and generating the
                                                representative sequences, count
                                                table, taxonomic information,
                                                alpha/beta diversity, and
                                                relative abundance plot.
                                              </p>
                                            </div>
                                          </div>
                                        </label>
                                        <label className="block rounded border border-slate-200 bg-white p-3">
                                          <div className="flex items-start gap-2">
                                            <input
                                              type="radio"
                                              value="general-pipeline-downstream"
                                              {...register(
                                                "bioinformaticsDetails.metabarcoding.analysisType",
                                              )}
                                              className="mt-1"
                                            />
                                            <div>
                                              <p className="text-sm font-semibold text-slate-700">
                                                General Pipeline with Downstream
                                                Analysis
                                              </p>
                                              <p className="text-xs text-slate-600 mt-1">
                                                Pre-processing and downstream
                                                analysis results include FastQC,
                                                trimming, denoising, and
                                                generating the representative
                                                sequences, count table,
                                                taxonomic information, and
                                                relative abundance plot; Alpha
                                                diversity indices; Beta
                                                diversity indices; Univariate
                                                and Multivariate Analysis;
                                                Differential Abundance; Function
                                                Prediction.
                                              </p>
                                            </div>
                                          </div>
                                        </label>
                                        <label className="block rounded border border-slate-200 bg-white p-3">
                                          <div className="flex items-start gap-2">
                                            <input
                                              type="radio"
                                              value="unsure"
                                              {...register(
                                                "bioinformaticsDetails.metabarcoding.analysisType",
                                              )}
                                              className="mt-1"
                                            />
                                            <div>
                                              <p className="text-sm font-semibold text-slate-700">
                                                Unsure
                                              </p>
                                              <p className="text-xs text-slate-600 mt-1">
                                                We will try to provide quotation
                                                and/or recommendation based on
                                                your target objective/s.
                                              </p>
                                            </div>
                                          </div>
                                        </label>
                                      </div>
                                    </details>
                                  </div>
                                )}

                                {option.id === "transcriptomics" &&
                                  selected && (
                                    <div className="border-t border-slate-100 px-4 py-3 space-y-4">
                                      <details
                                        className="rounded-md border border-slate-100 bg-slate-50/70"
                                        open
                                      >
                                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                                          Study Structure
                                        </summary>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-slate-100">
                                          <div>
                                            <Label className="text-xs">
                                              Sample type
                                            </Label>
                                            <Input
                                              placeholder="e.g., tissue, organ, organism"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.study.sampleType",
                                              )}
                                              className="mt-1 h-9"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">
                                              No. of samples
                                            </Label>
                                            <Input
                                              type="number"
                                              min="1"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.study.sampleCount",
                                                { valueAsNumber: true },
                                              )}
                                              className="mt-1 h-9"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">
                                              No. of
                                              groups/treatments/conditions
                                            </Label>
                                            <Input
                                              placeholder="e.g., control vs. treatment"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.study.groupCount",
                                              )}
                                              className="mt-1 h-9"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">
                                              No. of biological replicates per
                                              group
                                            </Label>
                                            <Input
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.study.biologicalReplicates",
                                              )}
                                              className="mt-1 h-9"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">
                                              Sequencing type and platform
                                            </Label>
                                            <Input
                                              placeholder="e.g., paired-end Illumina NextSeq (2 x 150 bp)"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.study.sequencingPlatform",
                                              )}
                                              className="mt-1 h-9"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">
                                              Estimated sequencing depth per
                                              sample/library
                                            </Label>
                                            <Input
                                              placeholder="e.g., 20-50 Mbp"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.study.depth",
                                              )}
                                              className="mt-1 h-9"
                                            />
                                          </div>
                                        </div>
                                      </details>

                                      <details
                                        className="rounded-md border border-slate-100 bg-slate-50/70"
                                        open
                                      >
                                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                                          Analysis
                                        </summary>
                                        <div className="space-y-2 p-3 border-t border-slate-100">
                                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                            <input
                                              type="checkbox"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.analysis.preProcessing",
                                              )}
                                              className="mt-1"
                                            />
                                            <span className="text-sm">
                                              Pre-processing{" "}
                                              <span className="block text-xs text-slate-600">
                                                Includes quality control, k-mer
                                                correction, trimming and
                                                filtering, rRNA removal
                                                (optional)
                                              </span>
                                            </span>
                                          </label>
                                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                            <input
                                              type="checkbox"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.analysis.deNovoAssembly",
                                              )}
                                              className="mt-1"
                                            />
                                            <span className="text-sm">
                                              De novo transcriptome assembly
                                              pipeline and assembly evaluation{" "}
                                              <span className="block text-xs text-slate-600">
                                                Includes De novo assembly,
                                                optional filtering, assembly
                                                statistics, alignment rate,
                                                BUSCO, quantification
                                              </span>
                                            </span>
                                          </label>
                                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                            <input
                                              type="checkbox"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.analysis.referenceBased",
                                              )}
                                              className="mt-1"
                                            />
                                            <span className="text-sm">
                                              Reference-based assembly pipeline{" "}
                                              <span className="block text-xs text-slate-600">
                                                Includes reference-based
                                                assembly and quantification.
                                                Client must provide .fa and .gtf
                                                with accession number.
                                              </span>
                                            </span>
                                          </label>
                                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                            <input
                                              type="checkbox"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.analysis.orfPrediction",
                                              )}
                                              className="mt-1"
                                            />
                                            <span className="text-sm">
                                              Open-reading frame prediction{" "}
                                              <span className="block text-xs text-slate-600">
                                                Includes ORF prediction using
                                                TransDecoder
                                              </span>
                                            </span>
                                          </label>
                                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                            <input
                                              type="checkbox"
                                              {...register(
                                                "bioinformaticsDetails.transcriptomics.analysis.functionalAnnotation",
                                              )}
                                              className="mt-1"
                                            />
                                            <span className="text-sm">
                                              Functional Annotation{" "}
                                              <span className="block text-xs text-slate-600">
                                                Trinotate (UniProt/SwissProt,
                                                Pfam, Eggnog, SignalP, TMHMM,
                                                infernal), extracted GO Terms
                                              </span>
                                            </span>
                                          </label>
                                        </div>
                                      </details>

                                      <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                        <input
                                          type="checkbox"
                                          {...register(
                                            "bioinformaticsDetails.transcriptomics.unsure",
                                          )}
                                          className="mt-1"
                                        />
                                        <span className="text-sm">
                                          Unsure{" "}
                                          <span className="block text-xs text-slate-600">
                                            We will try to provide quotation
                                            and/or recommendation based on your
                                            target objective/s.
                                          </span>
                                        </span>
                                      </label>
                                    </div>
                                  )}

                                {option.id === "whole-genome-assembly" &&
                                  selected && (
                                    <div className="border-t border-slate-100 px-4 py-3 space-y-4">
                                      <details
                                        className="rounded-md border border-slate-100 bg-slate-50/70"
                                        open
                                      >
                                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                                          Sample Details
                                        </summary>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-slate-100">
                                          <div>
                                            <Label className="text-xs">
                                              Sample Taxonomy
                                            </Label>
                                            <Input
                                              placeholder="e.g. E. coli, bacteria, eukaryote, unknown"
                                              {...register(
                                                "bioinformaticsDetails.wholeGenomeAssembly.sampleTaxonomy",
                                              )}
                                              className="mt-1 h-9"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">
                                              No. of samples
                                            </Label>
                                            <Input
                                              type="number"
                                              min="1"
                                              {...register(
                                                "bioinformaticsDetails.wholeGenomeAssembly.sampleCount",
                                                { valueAsNumber: true },
                                              )}
                                              className="mt-1 h-9"
                                            />
                                          </div>
                                        </div>
                                      </details>

                                      <details
                                        className="rounded-md border border-slate-100 bg-slate-50/70"
                                        open
                                      >
                                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                                          Analysis
                                        </summary>
                                        <div className="space-y-2 p-3 border-t border-slate-100">
                                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                            <input
                                              type="checkbox"
                                              {...register(
                                                "bioinformaticsDetails.wholeGenomeAssembly.analysis.assembly",
                                              )}
                                              className="mt-1"
                                              disabled={
                                                formData.bioinformaticsDetails
                                                  ?.wholeGenomeAssembly?.unsure
                                              }
                                            />
                                            <span className="text-sm">
                                              Whole Genome Assembly{" "}
                                              <span className="block text-xs text-slate-600">
                                                Includes FastQC, Trimming,
                                                Genome Assembly, and Assembly QC
                                              </span>
                                            </span>
                                          </label>
                                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                            <input
                                              type="checkbox"
                                              {...register(
                                                "bioinformaticsDetails.wholeGenomeAssembly.analysis.assemblyAnnotation",
                                              )}
                                              className="mt-1"
                                              disabled={
                                                formData.bioinformaticsDetails
                                                  ?.wholeGenomeAssembly?.unsure
                                              }
                                            />
                                            <span className="text-sm">
                                              Whole Genome Assembly and
                                              Annotation{" "}
                                              <span className="block text-xs text-slate-600">
                                                Includes FastQC, Trimming,
                                                Genome Assembly, and Assembly QC
                                                and Annotation
                                              </span>
                                            </span>
                                          </label>
                                          <div>
                                            <Label className="text-xs">
                                              Additional Downstream Analysis
                                            </Label>
                                            <Input
                                              placeholder="Please specify"
                                              {...register(
                                                "bioinformaticsDetails.wholeGenomeAssembly.analysis.additionalDownstream",
                                              )}
                                              className="mt-1 h-9"
                                              disabled={
                                                formData.bioinformaticsDetails
                                                  ?.wholeGenomeAssembly?.unsure
                                              }
                                            />
                                          </div>
                                        </div>
                                      </details>

                                      <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                                        <input
                                          type="checkbox"
                                          {...register(
                                            "bioinformaticsDetails.wholeGenomeAssembly.unsure",
                                          )}
                                          className="mt-1"
                                          disabled={
                                            formData.bioinformaticsDetails
                                              ?.wholeGenomeAssembly?.analysis
                                              ?.assembly ||
                                            formData.bioinformaticsDetails
                                              ?.wholeGenomeAssembly?.analysis
                                              ?.assemblyAnnotation ||
                                            !!formData.bioinformaticsDetails
                                              ?.wholeGenomeAssembly?.analysis
                                              ?.additionalDownstream
                                          }
                                        />
                                        <span className="text-sm">
                                          Unsure{" "}
                                          <span className="block text-xs text-slate-600">
                                            We will try to provide quotation
                                            and/or recommendation based on your
                                            target objective/s.
                                          </span>
                                        </span>
                                      </label>
                                    </div>
                                  )}

                                {option.id === "others" && selected && (
                                  <div className="border-t border-slate-100 px-4 py-3">
                                    <Label className="text-xs font-semibold text-slate-600">
                                      Please specify
                                    </Label>
                                    <Textarea
                                      {...register(
                                        "bioinformaticsDetails.othersSpecify",
                                      )}
                                      className="mt-1 min-h-[90px]"
                                    />
                                  </div>
                                )}
                              </details>
                            );
                          })}
                        </div>
                      </div>

                      <details
                        className="rounded-lg border border-slate-200 bg-white/60"
                        open
                      >
                        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                          Data
                        </summary>
                        <div className="space-y-4 border-t border-slate-100 px-4 py-3">
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="radio"
                              name="bioinfo-data-source"
                              checked={
                                !!formData.bioinformaticsDetails
                                  ?.dataProvideOwnData
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setValue(
                                    "bioinformaticsDetails.dataProvideOwnData",
                                    true,
                                  );
                                  setValue(
                                    "bioinformaticsDetails.dataProvidedByPgc",
                                    false,
                                  );
                                }
                              }}
                              className="h-4 w-4"
                            />
                            Provide own data
                          </label>

                          {formData.bioinformaticsDetails
                            ?.dataProvideOwnData && (
                            <div className="rounded-md border border-slate-100 bg-slate-50/70 p-3 space-y-3">
                              <Label className="text-xs font-semibold text-slate-600">
                                File Format
                              </Label>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                {BIOINFO_DATA_FORMAT_OPTIONS.map((formatId) => (
                                  <label
                                    key={formatId}
                                    className="flex items-center gap-2 text-sm text-slate-700"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        formData.bioinformaticsDetails
                                          ?.dataFileFormats || []
                                      ).includes(formatId)}
                                      onChange={(e) =>
                                        handleBioinformaticsDataFormatChange(
                                          formatId,
                                          e.target.checked,
                                        )
                                      }
                                    />
                                    {formatId === "fastq"
                                      ? "Fastq"
                                      : formatId === "fasta"
                                        ? "Fasta"
                                        : "Others"}
                                  </label>
                                ))}
                              </div>
                              {(
                                formData.bioinformaticsDetails
                                  ?.dataFileFormats || []
                              ).includes("others") && (
                                <Input
                                  placeholder="e.g., BAM, GTF"
                                  {...register(
                                    "bioinformaticsDetails.dataOtherFormat",
                                  )}
                                  className="h-9"
                                />
                              )}

                              <div>
                                <Label className="text-xs font-semibold text-slate-600">
                                  Specify file size for each sample
                                </Label>
                                <Input
                                  placeholder="e.g., 1 Mb, 1 Gb"
                                  {...register(
                                    "bioinformaticsDetails.dataFileSizePerSample",
                                  )}
                                  className="mt-1 h-9"
                                />
                              </div>

                              <div>
                                <Label className="text-xs font-semibold text-slate-600">
                                  Preferred mode of file transfer
                                </Label>
                                <Input
                                  placeholder="e.g., Google drive"
                                  {...register(
                                    "bioinformaticsDetails.dataTransferMode",
                                  )}
                                  className="mt-1 h-9"
                                />
                              </div>
                            </div>
                          )}

                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="radio"
                              name="bioinfo-data-source"
                              checked={
                                !!formData.bioinformaticsDetails
                                  ?.dataProvidedByPgc
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setValue(
                                    "bioinformaticsDetails.dataProvideOwnData",
                                    false,
                                  );
                                  setValue(
                                    "bioinformaticsDetails.dataProvidedByPgc",
                                    true,
                                  );
                                }
                              }}
                              className="h-4 w-4"
                            />
                            Data to be generated by PGC Visayas sequencing
                            service
                          </label>
                        </div>
                      </details>

                      <div>
                        <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                          Overview of research and objectives{" "}
                          <span className="text-[#B9273A]">*</span>
                        </Label>
                        <Textarea
                          {...register(
                            "bioinformaticsDetails.overviewObjectives",
                          )}
                          className="min-h-[120px] bg-white/70"
                          placeholder="To help us provide the appropriate bioinformatics analysis, kindly provide comprehensive details of study objectives and/or why you need the service."
                        />
                        {errors.bioinformaticsDetails && (
                          <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                            <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                            {typeof errors.bioinformaticsDetails.message ===
                            "string"
                              ? errors.bioinformaticsDetails.message
                              : "Please complete the bioinformatics details."}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Research Service Fields */}
                  {selectedService === "research" && (
                    <div className="space-y-6">
                      {/* Research Overview - Required for research */}
                      <div>
                        <Label
                          htmlFor="researchOverview"
                          className="text-sm font-semibold text-slate-700 mb-2 block"
                        >
                          Overview of research, objectives, and scope of
                          collaboration with PGC Visayas. Kindly provide
                          comprehensive details.{" "}
                          <span className="text-[#B9273A]">*</span>
                        </Label>
                        <Textarea
                          id="researchOverview"
                          placeholder="Provide comprehensive details about your research, objectives, and scope of collaboration with PGC Visayas..."
                          {...register("researchOverview")}
                          className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 min-h-[140px] resize-none"
                          rows={5}
                        />
                        {errors.researchOverview && (
                          <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                            <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                            {errors.researchOverview.message}
                          </p>
                        )}
                      </div>

                      {/* Research - New specific fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label
                            htmlFor="molecularServicesBudget"
                            className="text-sm font-semibold text-slate-700 mb-2 block"
                          >
                            Budget for molecular services
                          </Label>
                          <Input
                            id="molecularServicesBudget"
                            placeholder="___"
                            {...register("molecularServicesBudget")}
                            className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-12"
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor="plannedSampleCount"
                            className="text-sm font-semibold text-slate-700 mb-2 block"
                          >
                            How many samples are you planning to send?
                          </Label>
                          <Input
                            id="plannedSampleCount"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            placeholder="Enter number of samples"
                            {...register("plannedSampleCount")}
                            className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-12"
                          />
                          {errors.plannedSampleCount && (
                            <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                              <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                              {errors.plannedSampleCount.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Training Service Fields */}
                  {selectedService === "training" && (
                    <div className="space-y-6">
                      <div>
                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">
                          Kindly choose from the following PGC Visayas Training
                          Programs <span className="text-[#B9273A]">*</span>
                        </Label>
                        <div className="space-y-2">
                          {TRAINING_PROGRAM_OPTIONS.map((program) => {
                            const value =
                              program === "Others / Customized Training Program"
                                ? "others-customized"
                                : program;
                            const isChecked = (
                              formData.trainingPrograms || []
                            ).includes(value);
                            return (
                              <label
                                key={value}
                                className="flex items-start gap-3 p-3 bg-white/50 rounded-lg border border-slate-100 hover:bg-white/70 transition-colors cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) =>
                                    handleTrainingProgramChange(
                                      value,
                                      e.target.checked,
                                    )
                                  }
                                  className="h-4 w-4 mt-0.5 rounded border-slate-300 text-[#166FB5] focus:ring-[#166FB5]/20"
                                />
                                <span className="text-sm text-slate-700 font-medium leading-snug">
                                  {program}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {errors.trainingPrograms && (
                          <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                            <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                            {errors.trainingPrograms.message}
                          </p>
                        )}
                      </div>

                      {(formData.trainingPrograms || []).includes(
                        "others-customized",
                      ) && (
                        <div>
                          <Textarea
                            id="specificTrainingNeed"
                            placeholder="Kindly provide specific training needs"
                            {...register("specificTrainingNeed")}
                            className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 min-h-[100px] resize-none"
                            rows={4}
                          />
                          {errors.specificTrainingNeed && (
                            <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                              <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                              {errors.specificTrainingNeed.message}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Target Date for Training with Calendar Picker */}
                      <div>
                        <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                          Target Date for the Training{" "}
                          <span className="text-[#B9273A]">*</span>
                        </Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full h-12 justify-start text-left font-normal bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20",
                                !trainingDate && "text-muted-foreground",
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {trainingDate
                                ? format(trainingDate, "PPP")
                                : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={trainingDate}
                              onSelect={handleDateSelect}
                              disabled={
                                (date) =>
                                  date < new Date() ||
                                  date < new Date("1900-01-01") // Disable past dates
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        {errors.targetTrainingDate && (
                          <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                            <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                            {errors.targetTrainingDate.message}
                          </p>
                        )}
                        {errors.bioinfoOptions &&
                          formData.workflowType === "complete-bioinfo" && (
                            <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                              <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                              {errors.bioinfoOptions.message}
                            </p>
                          )}
                      </div>

                      {/* Number of Participants - Required field with minimum constraint */}
                      <div>
                        <Label
                          htmlFor="numberOfParticipants"
                          className="text-sm font-semibold text-slate-700 mb-2 block"
                        >
                          Number of Participants{" "}
                          <span className="text-[#B9273A]">*</span>
                        </Label>
                        <Input
                          id="numberOfParticipants"
                          type="number"
                          min="1"
                          placeholder="Enter number of participants"
                          {...register("numberOfParticipants", {
                            valueAsNumber: true,
                          })}
                          className="bg-white/70 border-slate-200 focus:border-[#166FB5] focus:ring-[#166FB5]/20 h-12"
                        />
                        {errors.numberOfParticipants && (
                          <p className="text-[#B9273A] text-sm mt-1 flex items-center gap-1">
                            <span className="w-1 h-1 bg-[#B9273A] rounded-full"></span>
                            {errors.numberOfParticipants.message}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* Submit Button */}
            <div className="flex justify-end pt-8 border-t border-slate-100">
              <Button
                type="submit"
                className="h-12 px-8 bg-gradient-to-r from-[#166FB5] to-[#4038AF] hover:from-[#166FB5]/90 hover:to-[#4038AF]/90 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Modal - Shows form data review before final submission */}
      <ConfirmationModalLayout
        open={showConfirmModal}
        onConfirm={handleConfirmSave}
        onCancel={handleCancelModal}
        loading={isSubmitting}
        title="Please double check before saving"
        description="Review your entries below before confirming. This action cannot be undone."
        confirmLabel="Confirm & Submit"
        cancelLabel="Go Back"
      >
        {/* Display all form data for user review */}
        {pendingData && (
          <div className="space-y-2 text-slate-800 text-sm">
            <div>
              <span className="font-semibold">Full Name:</span>{" "}
              {pendingData.name}
            </div>
            <div>
              <span className="font-semibold">Affiliation:</span>{" "}
              {pendingData.affiliation}
            </div>
            <div>
              <span className="font-semibold">Designation:</span>{" "}
              {pendingData.designation}
            </div>
            <div>
              <span className="font-semibold">Service Type:</span>{" "}
              {pendingData.service}
            </div>

            {/* Show service-specific fields based on service type */}
            {pendingData.service === "equipment" &&
              pendingData.individualAssayDetails && (
                <div>
                  <span className="font-semibold block mb-1">
                    Equipment / Workflow Details:
                  </span>
                  <p className="bg-slate-50 p-3 rounded-lg text-slate-700 whitespace-pre-wrap">
                    {pendingData.individualAssayDetails}
                  </p>
                </div>
              )}
            {pendingData.service === "laboratory" && (
              <>
                {pendingData.species && (
                  <div>
                    <span className="font-semibold">Species:</span>{" "}
                    {pendingData.species
                      .replace("-", " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                    {pendingData.otherSpecies
                      ? ` (${pendingData.otherSpecies})`
                      : ""}
                  </div>
                )}
                {pendingData.researchOverview && (
                  <div>
                    <span className="font-semibold">Research Overview:</span>{" "}
                    {pendingData.researchOverview}
                  </div>
                )}
                {pendingData.sampleCount && (
                  <div>
                    <span className="font-semibold">Sample Count:</span>{" "}
                    {pendingData.sampleCount}
                  </div>
                )}
                {pendingData.workflowType && (
                  <div>
                    <span className="font-semibold">Workflow Type:</span>{" "}
                    {pendingData.workflowType === "complete-bioinfo"
                      ? "Complete molecular workflow with Bioinformatics Analysis"
                      : pendingData.workflowType === "complete"
                        ? "Complete Molecular workflow only (DNA Extraction to Sequencing)"
                        : `Individual Assay: ${pendingData.individualAssayDetails || "Not specified"}`}
                  </div>
                )}
                {pendingData.bioinfoOptions &&
                  pendingData.bioinfoOptions.length > 0 && (
                    <div>
                      <span className="font-semibold">
                        Bioinformatics Analysis:
                      </span>{" "}
                      {pendingData.bioinfoOptions
                        .map((opt) => {
                          const labels: Record<string, string> = {
                            "whole-genome-assembly": "Whole Genome Assembly",
                            "metabarcoding-downstream":
                              "Metabarcoding with Downstream Analysis",
                            "metabarcoding-preprocessing":
                              "Metabarcoding with Pre-processing Only",
                            transcriptomics:
                              "Transcriptomics (QC to Annotation)",
                            phylogenetics: "Phylogenetics (1 Marker)",
                            "whole-genome-assembly-annotation":
                              "Whole Genome Assembly and Annotation",
                            // Legacy values
                            "genome-assembly": "Whole Genome Assembly",
                            metabarcoding:
                              "Metabarcoding with Downstream Analysis",
                            "pre-processing":
                              "Metabarcoding with Pre-processing Only",
                            "assembly-annotation":
                              "Whole Genome Assembly and Annotation",
                          };
                          return labels[opt] || opt;
                        })
                        .join(", ")}
                    </div>
                  )}
              </>
            )}
            {pendingData.service === "bioinformatics" && (
              <div className="space-y-3">
                <div>
                  <span className="font-semibold">
                    Type of bioinformatics service:
                  </span>{" "}
                  {Array.isArray(
                    pendingData.bioinformaticsDetails?.serviceTypes,
                  ) &&
                  pendingData.bioinformaticsDetails?.serviceTypes.length > 0
                    ? pendingData.bioinformaticsDetails.serviceTypes.join(", ")
                    : "—"}
                </div>
                <div>
                  <span className="font-semibold">
                    Data (provide own data):
                  </span>{" "}
                  {pendingData.bioinformaticsDetails?.dataProvideOwnData
                    ? "Yes"
                    : "No"}
                </div>
                {pendingData.bioinformaticsDetails?.dataProvideOwnData && (
                  <>
                    <div>
                      <span className="font-semibold">File format:</span>{" "}
                      {Array.isArray(
                        pendingData.bioinformaticsDetails?.dataFileFormats,
                      ) &&
                      pendingData.bioinformaticsDetails?.dataFileFormats
                        .length > 0
                        ? pendingData.bioinformaticsDetails.dataFileFormats.join(
                            ", ",
                          )
                        : "—"}
                    </div>
                    {pendingData.bioinformaticsDetails?.dataOtherFormat && (
                      <div>
                        <span className="font-semibold">
                          Other file format:
                        </span>{" "}
                        {pendingData.bioinformaticsDetails.dataOtherFormat}
                      </div>
                    )}
                    {pendingData.bioinformaticsDetails
                      ?.dataFileSizePerSample && (
                      <div>
                        <span className="font-semibold">
                          File size per sample:
                        </span>{" "}
                        {
                          pendingData.bioinformaticsDetails
                            .dataFileSizePerSample
                        }
                      </div>
                    )}
                    {pendingData.bioinformaticsDetails?.dataTransferMode && (
                      <div>
                        <span className="font-semibold">
                          Preferred file transfer mode:
                        </span>{" "}
                        {pendingData.bioinformaticsDetails.dataTransferMode}
                      </div>
                    )}
                  </>
                )}
                <div>
                  <span className="font-semibold">
                    Data to be generated by PGC Visayas sequencing service:
                  </span>{" "}
                  {pendingData.bioinformaticsDetails?.dataProvidedByPgc
                    ? "Yes"
                    : "No"}
                </div>
                {pendingData.bioinformaticsDetails?.overviewObjectives && (
                  <div>
                    <span className="font-semibold block mb-1">
                      Overview of research and objectives:
                    </span>
                    <p className="bg-slate-50 p-3 rounded-lg text-slate-700 whitespace-pre-wrap">
                      {pendingData.bioinformaticsDetails.overviewObjectives}
                    </p>
                  </div>
                )}
              </div>
            )}
            {pendingData.service === "research" && (
              <div className="space-y-3">
                {pendingData.researchOverview && (
                  <div>
                    <span className="font-semibold block mb-1">
                      Overview of research, objectives, and scope of
                      collaboration:
                    </span>
                    <p className="bg-slate-50 p-3 rounded-lg text-slate-700 whitespace-pre-wrap">
                      {pendingData.researchOverview}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingData.molecularServicesBudget && (
                    <div>
                      <span className="font-semibold">
                        Budget for molecular services:
                      </span>{" "}
                      {pendingData.molecularServicesBudget}
                    </div>
                  )}
                  {pendingData.plannedSampleCount && (
                    <div>
                      <span className="font-semibold">
                        How many samples are you planning to send?
                      </span>{" "}
                      {pendingData.plannedSampleCount}
                    </div>
                  )}
                </div>
              </div>
            )}
            {pendingData.service === "retail" &&
              pendingData.retailItems &&
              pendingData.retailItems.length > 0 && (
                <div>
                  <span className="font-semibold">Retail Items:</span>{" "}
                  {pendingData.retailItems.join(", ")}
                </div>
              )}
            {pendingData.service === "training" && (
              <>
                {pendingData.trainingPrograms &&
                  pendingData.trainingPrograms.length > 0 && (
                    <div>
                      <span className="font-semibold">Training Programs:</span>{" "}
                      {pendingData.trainingPrograms
                        .map((program) =>
                          program === "others-customized"
                            ? "Others / Customized Training Program"
                            : program,
                        )
                        .join(", ")}
                    </div>
                  )}
                {pendingData.specificTrainingNeed && (
                  <div>
                    <span className="font-semibold">
                      Specific Training Needs:
                    </span>{" "}
                    {pendingData.specificTrainingNeed}
                  </div>
                )}
                <div>
                  <span className="font-semibold">Target Training Date:</span>{" "}
                  {pendingData.targetTrainingDate}
                </div>
                <div>
                  <span className="font-semibold">Number of Participants:</span>{" "}
                  {pendingData.numberOfParticipants}
                </div>
              </>
            )}
          </div>
        )}
      </ConfirmationModalLayout>

      {/* ── Bioinformatics Analysis Configuration Modal ── */}
      <Dialog open={showBioinfoModal} onOpenChange={setShowBioinfoModal}>
        <DialogContent className="max-w-3xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-blue-600" />
              Configure Bioinformatics Analysis
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1">
              Select the type(s) of bioinformatics analysis you require as part
              of your complete molecular workflow.
            </p>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Service type checkboxes with expandable detail panels */}
            {BIOINFO_SERVICE_TYPE_OPTIONS.map((option) => {
              const selected = (
                formData.bioinformaticsDetails?.serviceTypes || []
              ).includes(option.id);
              return (
                <details
                  key={option.id}
                  className="rounded-lg border border-slate-200 bg-white/60"
                  open={selected}
                >
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) =>
                          handleBioinformaticsServiceTypeChange(
                            option.id,
                            e.target.checked,
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-[#166FB5] focus:ring-[#166FB5]/20"
                      />
                      <span className="text-sm font-semibold text-slate-700">
                        {option.label}
                      </span>
                    </div>
                  </summary>

                  {option.id === "phylogenetic" && selected && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">
                          No. of markers
                        </Label>
                        <Input
                          type="number"
                          min="1"
                          {...register(
                            "bioinformaticsDetails.phylogenetic.markerCount",
                            { valueAsNumber: true },
                          )}
                          className="mt-1 h-10"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-600">
                          Specify marker(s)
                        </Label>
                        <Input
                          placeholder="e.g., COI"
                          {...register(
                            "bioinformaticsDetails.phylogenetic.markers",
                          )}
                          className="mt-1 h-10"
                        />
                      </div>
                    </div>
                  )}

                  {option.id === "metabarcoding" && selected && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-4">
                      <details
                        className="rounded-md border border-slate-100 bg-slate-50/70"
                        open
                      >
                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                          Study Structure
                        </summary>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-slate-100">
                          <div>
                            <Label className="text-xs">Sample type</Label>
                            <Input
                              placeholder="e.g., soil, water"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.sampleType",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">No. of samples</Label>
                            <Input
                              type="number"
                              min="1"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.sampleCount",
                                { valueAsNumber: true },
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              No. of groups/treatments to study
                            </Label>
                            <Input
                              placeholder="NA if not applicable"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.groupCount",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              No. of replicates per sample
                            </Label>
                            <Input
                              placeholder="NA if not applicable"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.replicatesPerSample",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              Target gene/marker
                            </Label>
                            <Input
                              placeholder="e.g., 16s rRNA, ITS (Fungi)"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.targetGene",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Target region</Label>
                            <Input
                              placeholder="V4"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.targetRegion",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Primer set used</Label>
                            <Input
                              placeholder="e.g., 515F / 806R"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.primerSet",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              Expected amplicon size
                            </Label>
                            <Input
                              placeholder="e.g., ~250 bp"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.ampliconSize",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-xs">
                              Sequencing type and platform
                            </Label>
                            <Input
                              placeholder="e.g., paired-end Illumina iSeq (2 x 150 bp)"
                              {...register(
                                "bioinformaticsDetails.metabarcoding.study.sequencingPlatform",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                        </div>
                      </details>

                      <details
                        className="rounded-md border border-slate-100 bg-slate-50/70"
                        open
                      >
                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                          Analysis
                        </summary>
                        <div className="space-y-3 p-3 border-t border-slate-100">
                          <label className="block rounded border border-slate-200 bg-white p-3">
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                value="general-pipeline"
                                {...register(
                                  "bioinformaticsDetails.metabarcoding.analysisType",
                                )}
                                className="mt-1"
                              />
                              <div>
                                <p className="text-sm font-semibold text-slate-700">
                                  General Pipeline
                                </p>
                                <p className="text-xs text-slate-600 mt-1">
                                  Includes FastQC, trimming, denoising, and
                                  generating the representative sequences, count
                                  table, taxonomic information, alpha/beta
                                  diversity, and relative abundance plot.
                                </p>
                              </div>
                            </div>
                          </label>
                          <label className="block rounded border border-slate-200 bg-white p-3">
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                value="general-pipeline-downstream"
                                {...register(
                                  "bioinformaticsDetails.metabarcoding.analysisType",
                                )}
                                className="mt-1"
                              />
                              <div>
                                <p className="text-sm font-semibold text-slate-700">
                                  General Pipeline with Downstream Analysis
                                </p>
                                <p className="text-xs text-slate-600 mt-1">
                                  Pre-processing and downstream analysis results
                                  include FastQC, trimming, denoising, and
                                  generating the representative sequences, count
                                  table, taxonomic information, and relative
                                  abundance plot; Alpha diversity indices; Beta
                                  diversity indices; Univariate and Multivariate
                                  Analysis; Differential Abundance; Function
                                  Prediction.
                                </p>
                              </div>
                            </div>
                          </label>
                          <label className="block rounded border border-slate-200 bg-white p-3">
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                value="unsure"
                                {...register(
                                  "bioinformaticsDetails.metabarcoding.analysisType",
                                )}
                                className="mt-1"
                              />
                              <div>
                                <p className="text-sm font-semibold text-slate-700">
                                  Unsure
                                </p>
                                <p className="text-xs text-slate-600 mt-1">
                                  We will try to provide quotation and/or
                                  recommendation based on your target
                                  objective/s.
                                </p>
                              </div>
                            </div>
                          </label>
                        </div>
                      </details>
                    </div>
                  )}

                  {option.id === "transcriptomics" && selected && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-4">
                      <details
                        className="rounded-md border border-slate-100 bg-slate-50/70"
                        open
                      >
                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                          Study Structure
                        </summary>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-slate-100">
                          <div>
                            <Label className="text-xs">Sample type</Label>
                            <Input
                              placeholder="e.g., tissue, organ, organism"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.study.sampleType",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">No. of samples</Label>
                            <Input
                              type="number"
                              min="1"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.study.sampleCount",
                                { valueAsNumber: true },
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              No. of groups/treatments/conditions
                            </Label>
                            <Input
                              placeholder="e.g., control vs. treatment"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.study.groupCount",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              No. of biological replicates per group
                            </Label>
                            <Input
                              {...register(
                                "bioinformaticsDetails.transcriptomics.study.biologicalReplicates",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              Sequencing type and platform
                            </Label>
                            <Input
                              placeholder="e.g., paired-end Illumina NextSeq (2 x 150 bp)"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.study.sequencingPlatform",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              Estimated sequencing depth per sample/library
                            </Label>
                            <Input
                              placeholder="e.g., 20-50 Mbp"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.study.depth",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                        </div>
                      </details>

                      <details
                        className="rounded-md border border-slate-100 bg-slate-50/70"
                        open
                      >
                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                          Analysis
                        </summary>
                        <div className="space-y-2 p-3 border-t border-slate-100">
                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                            <input
                              type="checkbox"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.analysis.preProcessing",
                              )}
                              className="mt-1"
                            />
                            <span className="text-sm">
                              Pre-processing{" "}
                              <span className="block text-xs text-slate-600">
                                Includes quality control, k-mer correction,
                                trimming and filtering, rRNA removal (optional)
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                            <input
                              type="checkbox"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.analysis.deNovoAssembly",
                              )}
                              className="mt-1"
                            />
                            <span className="text-sm">
                              De novo transcriptome assembly pipeline and
                              assembly evaluation{" "}
                              <span className="block text-xs text-slate-600">
                                Includes De novo assembly, optional filtering,
                                assembly statistics, alignment rate, BUSCO,
                                quantification
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                            <input
                              type="checkbox"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.analysis.referenceBased",
                              )}
                              className="mt-1"
                            />
                            <span className="text-sm">
                              Reference-based assembly pipeline{" "}
                              <span className="block text-xs text-slate-600">
                                Includes reference-based assembly and
                                quantification. Client must provide .fa and .gtf
                                with accession number.
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                            <input
                              type="checkbox"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.analysis.orfPrediction",
                              )}
                              className="mt-1"
                            />
                            <span className="text-sm">
                              Open-reading frame prediction{" "}
                              <span className="block text-xs text-slate-600">
                                Includes ORF prediction using TransDecoder
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                            <input
                              type="checkbox"
                              {...register(
                                "bioinformaticsDetails.transcriptomics.analysis.functionalAnnotation",
                              )}
                              className="mt-1"
                            />
                            <span className="text-sm">
                              Functional Annotation{" "}
                              <span className="block text-xs text-slate-600">
                                Trinotate (UniProt/SwissProt, Pfam, Eggnog,
                                SignalP, TMHMM, infernal), extracted GO Terms
                              </span>
                            </span>
                          </label>
                        </div>
                      </details>

                      <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                        <input
                          type="checkbox"
                          {...register(
                            "bioinformaticsDetails.transcriptomics.unsure",
                          )}
                          className="mt-1"
                        />
                        <span className="text-sm">
                          Unsure{" "}
                          <span className="block text-xs text-slate-600">
                            We will try to provide quotation and/or
                            recommendation based on your target objective/s.
                          </span>
                        </span>
                      </label>
                    </div>
                  )}

                  {option.id === "whole-genome-assembly" && selected && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-4">
                      <details
                        className="rounded-md border border-slate-100 bg-slate-50/70"
                        open
                      >
                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                          Sample Details
                        </summary>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-slate-100">
                          <div>
                            <Label className="text-xs">Sample Taxonomy</Label>
                            <Input
                              placeholder="e.g. E. coli, bacteria, eukaryote, unknown"
                              {...register(
                                "bioinformaticsDetails.wholeGenomeAssembly.sampleTaxonomy",
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">No. of samples</Label>
                            <Input
                              type="number"
                              min="1"
                              {...register(
                                "bioinformaticsDetails.wholeGenomeAssembly.sampleCount",
                                { valueAsNumber: true },
                              )}
                              className="mt-1 h-9"
                            />
                          </div>
                        </div>
                      </details>

                      <details
                        className="rounded-md border border-slate-100 bg-slate-50/70"
                        open
                      >
                        <summary className="px-3 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                          Analysis
                        </summary>
                        <div className="space-y-2 p-3 border-t border-slate-100">
                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                            <input
                              type="checkbox"
                              {...register(
                                "bioinformaticsDetails.wholeGenomeAssembly.analysis.assembly",
                              )}
                              className="mt-1"
                              disabled={
                                formData.bioinformaticsDetails
                                  ?.wholeGenomeAssembly?.unsure
                              }
                            />
                            <span className="text-sm">
                              Whole Genome Assembly{" "}
                              <span className="block text-xs text-slate-600">
                                Includes FastQC, Trimming, Genome Assembly, and
                                Assembly QC
                              </span>
                            </span>
                          </label>
                          <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                            <input
                              type="checkbox"
                              {...register(
                                "bioinformaticsDetails.wholeGenomeAssembly.analysis.assemblyAnnotation",
                              )}
                              className="mt-1"
                              disabled={
                                formData.bioinformaticsDetails
                                  ?.wholeGenomeAssembly?.unsure
                              }
                            />
                            <span className="text-sm">
                              Whole Genome Assembly and Annotation{" "}
                              <span className="block text-xs text-slate-600">
                                Includes FastQC, Trimming, Genome Assembly,
                                Assembly QC and Annotation
                              </span>
                            </span>
                          </label>
                          <div>
                            <Label className="text-xs">
                              Additional Downstream Analysis
                            </Label>
                            <Input
                              placeholder="Please specify"
                              {...register(
                                "bioinformaticsDetails.wholeGenomeAssembly.analysis.additionalDownstream",
                              )}
                              className="mt-1 h-9"
                              disabled={
                                formData.bioinformaticsDetails
                                  ?.wholeGenomeAssembly?.unsure
                              }
                            />
                          </div>
                        </div>
                      </details>

                      <label className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3">
                        <input
                          type="checkbox"
                          {...register(
                            "bioinformaticsDetails.wholeGenomeAssembly.unsure",
                          )}
                          className="mt-1"
                          disabled={
                            formData.bioinformaticsDetails?.wholeGenomeAssembly
                              ?.analysis?.assembly ||
                            formData.bioinformaticsDetails?.wholeGenomeAssembly
                              ?.analysis?.assemblyAnnotation ||
                            !!formData.bioinformaticsDetails
                              ?.wholeGenomeAssembly?.analysis
                              ?.additionalDownstream
                          }
                        />
                        <span className="text-sm">
                          Unsure{" "}
                          <span className="block text-xs text-slate-600">
                            We will try to provide quotation and/or
                            recommendation based on your target objective/s.
                          </span>
                        </span>
                      </label>
                    </div>
                  )}

                  {option.id === "others" && selected && (
                    <div className="border-t border-slate-100 px-4 py-3">
                      <Label className="text-xs font-semibold text-slate-600">
                        Please specify
                      </Label>
                      <Textarea
                        {...register("bioinformaticsDetails.othersSpecify")}
                        className="mt-1 min-h-[90px]"
                      />
                    </div>
                  )}
                </details>
              );
            })}

            {/* Data Section */}
            <details
              className="rounded-lg border border-slate-200 bg-white/60"
              open
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                Data
              </summary>
              <div className="space-y-4 border-t border-slate-100 px-4 py-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="bioinfo-modal-data-source"
                    checked={
                      !!formData.bioinformaticsDetails?.dataProvideOwnData
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setValue(
                          "bioinformaticsDetails.dataProvideOwnData",
                          true,
                        );
                        setValue(
                          "bioinformaticsDetails.dataProvidedByPgc",
                          false,
                        );
                      }
                    }}
                    className="h-4 w-4"
                  />
                  Provide own data
                </label>

                {formData.bioinformaticsDetails?.dataProvideOwnData && (
                  <div className="rounded-md border border-slate-100 bg-slate-50/70 p-3 space-y-3">
                    <Label className="text-xs font-semibold text-slate-600">
                      File Format
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {BIOINFO_DATA_FORMAT_OPTIONS.map((formatId) => (
                        <label
                          key={formatId}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={(
                              formData.bioinformaticsDetails?.dataFileFormats ||
                              []
                            ).includes(formatId)}
                            onChange={(e) =>
                              handleBioinformaticsDataFormatChange(
                                formatId,
                                e.target.checked,
                              )
                            }
                          />
                          {formatId === "fastq"
                            ? "Fastq"
                            : formatId === "fasta"
                              ? "Fasta"
                              : "Others"}
                        </label>
                      ))}
                    </div>
                    {(
                      formData.bioinformaticsDetails?.dataFileFormats || []
                    ).includes("others") && (
                      <Input
                        placeholder="e.g., BAM, GTF"
                        {...register("bioinformaticsDetails.dataOtherFormat")}
                        className="h-9"
                      />
                    )}

                    <div>
                      <Label className="text-xs font-semibold text-slate-600">
                        Specify file size for each sample
                      </Label>
                      <Input
                        placeholder="e.g., 1 Mb, 1 Gb"
                        {...register(
                          "bioinformaticsDetails.dataFileSizePerSample",
                        )}
                        className="mt-1 h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-600">
                        Preferred mode of file transfer
                      </Label>
                      <Input
                        placeholder="e.g., Google drive"
                        {...register("bioinformaticsDetails.dataTransferMode")}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="bioinfo-modal-data-source"
                    checked={
                      !!formData.bioinformaticsDetails?.dataProvidedByPgc
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setValue(
                          "bioinformaticsDetails.dataProvideOwnData",
                          false,
                        );
                        setValue(
                          "bioinformaticsDetails.dataProvidedByPgc",
                          true,
                        );
                      }
                    }}
                    className="h-4 w-4"
                  />
                  Data to be generated by PGC Visayas sequencing service
                </label>
              </div>
            </details>

            {/* Overview of Research and Objectives */}
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                Overview of research and objectives{" "}
                <span className="text-[#B9273A]">*</span>
              </Label>
              <Textarea
                {...register("bioinformaticsDetails.overviewObjectives")}
                className="min-h-[120px] bg-white/70"
                placeholder="To help us provide the appropriate bioinformatics analysis, kindly provide comprehensive details of study objectives and/or why you need the service."
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-slate-50/70">
            <Button
              type="button"
              onClick={() => setShowBioinfoModal(false)}
              className="bg-[#166FB5] hover:bg-[#145a9b] text-white"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
