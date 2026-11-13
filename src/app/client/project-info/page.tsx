// This is the Project Information Form page for clients to submit or update project details.
// It includes permission checks, data fetching, and a confirmation modal before final submission.

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from "zod";
import { projectFormSchema, ProjectFormData } from "@/schemas/projectSchema"; 
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp, collection, query, where, getDocs } from "firebase/firestore";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfirmationModalLayout from "@/components/modal/ConfirmationModalLayout";
import { getNextPid } from "@/services/projectsService";
import { saveProjectRequest, getProjectRequest, getProjectRequestById, getProjectRequestsByInquiry } from "@/services/projectRequestService";
import { updateQuotationStatus, markQuotationAsSelected } from "@/services/quotationService";
import { updateInquiryStatus } from "@/app/actions/inquiryActions";
import useAuth from "@/hooks/useAuth";

export default function ProjectForm() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const usesReferenceDesign = [
    "dayonmerlitojr@gmail.com",
    "ping.biason@gmail.com",
  ].includes(user?.email?.trim().toLowerCase() || "");
  // Get inquiry ID and email from URL
  const inquiryId = searchParams.get("inquiryId");
  const email = searchParams.get("email");
  const [isDraft, setIsDraft] = useState(true); // New projects start as drafts

  // Form state
  const [formData, setFormData] = useState<ProjectFormData>({
    title: "",
    projectLead: "",
    startDate: new Date(),
    sendingInstitution: "Government",
    fundingInstitution: "",
  });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<keyof ProjectFormData, string>>>({});
  const [startOpen, setStartOpen] = useState(false);
  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingData, setPendingData] = useState<ProjectFormData | null>(null);
  const [isDraftSaveLocked, setIsDraftSaveLocked] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const initialFormRef = useRef<ProjectFormData | null>(null);

  // Fetch existing project request draft if it exists
  useEffect(() => {
    async function fetchProjectRequest() {
      setLoading(true);
      try {
        if (!inquiryId) {
          setLoading(false);
          return;
        }

        // Check if a draft project request exists
        const existingRequest = await getProjectRequest(inquiryId);

        if (existingRequest && existingRequest.status === "draft") {
          console.log("📝 Loading existing draft project request");
          setFormData({
            title: existingRequest.title || "",
            projectLead: existingRequest.projectLead || "",
            startDate: existingRequest.startDate?.toDate?.() || new Date(),
            sendingInstitution: (existingRequest.sendingInstitution || "Government") as "UP System" | "SUC/HEI" | "Government" | "Private/Local" | "International" | "N/A",
            fundingInstitution: existingRequest.fundingInstitution || "",
          });
          setIsDraft(true);
        } else if (existingRequest && existingRequest.status === "pending") {
          console.log("⏳ Project is pending approval, redirecting to client-info");
          toast.info("Your project is currently pending approval.");
          const params = new URLSearchParams();
          if (email) params.set("email", email);
          if (inquiryId) params.set("inquiryId", inquiryId);
          router.push(`/client/client-info?${params.toString()}`);
          return;
        } else if (existingRequest && existingRequest.status === "approved" && existingRequest.pid) {
          // If already has approved project, redirect to client-info
          console.log("✅ Project already approved, redirecting to client-info");
          const params = new URLSearchParams();
          if (email) params.set("email", email);
          if (inquiryId) params.set("inquiryId", inquiryId);
          if (existingRequest.pid) params.set("pid", existingRequest.pid);
          router.push(`/client/client-info?${params.toString()}`);
          return;
        } else {
          console.log("🆕 New project request");
          setIsDraft(true);
        }
      } catch (error) {
        console.error("Failed to load project request:", error);
        toast.error("Failed to load project data.");
      } finally {
        setLoading(false);
      }
    }
    fetchProjectRequest();
  }, [inquiryId, email, router]);

  // Capture initial form state after load to detect unsaved changes
  useEffect(() => {
    if (!loading && !initialFormRef.current) {
      initialFormRef.current = {
        title: formData.title,
        projectLead: formData.projectLead,
        startDate: formData.startDate,
        sendingInstitution: formData.sendingInstitution,
        fundingInstitution: formData.fundingInstitution,
      };
    }
  }, [loading]);

  // Permission check: Verify email and inquiryId exist and are valid
  useEffect(() => {
    async function checkPermission() {
      // Require email and inquiryId
      if (!email || !inquiryId) {
        toast.error("Missing required parameters. Please verify first.");
        router.replace("/portal");
        return;
      }
      
      // Verify inquiry exists
      const inquiryDocSnap = await getDoc(doc(db, "inquiries", inquiryId));
      if (!inquiryDocSnap.exists()) {
        toast.error("Invalid inquiry ID.");
        router.replace("/portal");
        return;
      }
      
      const inquiry = inquiryDocSnap.data();
      
      // Verify email is associated with this inquiry (contact person or member)
      const emailLower = email.toLowerCase();
      const contactEmailLower = inquiry.email?.toLowerCase() || "";
      const memberEmails = (inquiry.memberEmails || []).map((e: string) => e.toLowerCase());
      
      if (emailLower !== contactEmailLower && !memberEmails.includes(emailLower)) {
        toast.error("You do not have access to this inquiry.");
        router.replace("/portal");
        return;
      }
    }
    checkPermission();
  }, [email, inquiryId, router]);

  // Handle form field changes
  const handleChange = (field: keyof ProjectFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // On form submit, validate and show confirmation modal
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDraftSaveLocked || isSavingDraft) return;

    const result = projectFormSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ProjectFormData, string>> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof ProjectFormData;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsDraftSaveLocked(true);
    setErrors({});
    setPendingData(formData); // Store data for modal
    setShowConfirmModal(true); // Show confirmation modal
  };

  // On confirm in modal, save project request as draft
  const handleConfirmSave = async () => {
    if (isSavingDraft) return;

    setShowConfirmModal(false);
    setIsSavingDraft(true);

    try {
      const result = projectFormSchema.safeParse(pendingData);
      
      if (!result.success) {
        toast.error("Invalid data. Please review your entries.");
        setIsDraftSaveLocked(false);
        return;
      }

      if (!inquiryId || !email) {
        toast.error("Missing required parameters.");
        setIsDraftSaveLocked(false);
        return;
      }

      // Get requester name from inquiry
      let requesterName = email;
      try {
        const inquiryDoc = await getDoc(doc(db, "inquiries", inquiryId));
        if (inquiryDoc.exists()) {
          requesterName = inquiryDoc.data().name || email;
        }
      } catch (error) {
        console.warn("Could not fetch requester name:", error);
      }

      // Save as draft project request (NO PID yet)
      const savedId = await saveProjectRequest({
        inquiryId,
        requestedBy: email,
        requestedByName: requesterName,
        title: result.data.title,
        projectLead: result.data.projectLead,
        startDate: Timestamp.fromDate(result.data.startDate),
        sendingInstitution: result.data.sendingInstitution,
        fundingInstitution: result.data.fundingInstitution,
        status: "draft",
      });

      toast.success("Project draft saved! Now add your information as Primary Member.");
      
      // Update quotation status if user proceeded from a quotation
      const quotationRef = searchParams.get("quotationRef") || sessionStorage.getItem('selectedQuotationRef');
      if (quotationRef) {
        try {
          // Mark quotation as selected for this project/inquiry
          await markQuotationAsSelected(quotationRef, savedId || inquiryId);
          console.log(`✅ Marked quotation ${quotationRef} as selected for project ${savedId || inquiryId}`);
          if (inquiryId) {
            await updateInquiryStatus(inquiryId, "In Progress");
            console.log(`✅ Updated inquiry ${inquiryId} status to In Progress`);
          }
          // Clear from sessionStorage after use
          sessionStorage.removeItem('selectedQuotationRef');
        } catch (error) {
          console.warn("Could not update related statuses:", error);
        }
      }
      
      setTimeout(() => {
        const params = new URLSearchParams();
        if (email) params.set("email", email);
        if (inquiryId) params.set("inquiryId", inquiryId);
        router.push(`/client/client-info?${params.toString()}`);
      }, 1500);
    } catch (error) {
      console.error("Error saving project draft:", error);
      toast.error("Error saving project information. Please try again.");
      setIsDraftSaveLocked(false);
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Cancel confirmation modal
  const handleCancelModal = () => {
    setShowConfirmModal(false);
    setPendingData(null);
    setIsDraftSaveLocked(false);
    setIsSavingDraft(false);
  };

  // Helper to serialize form for dirty check
  const serializeForm = (d: ProjectFormData | null) => {
    if (!d) return "";
    return JSON.stringify({
      title: d.title || "",
      projectLead: d.projectLead || "",
      startDate: d.startDate ? new Date(d.startDate).toISOString() : null,
      sendingInstitution: d.sendingInstitution || "",
      fundingInstitution: d.fundingInstitution || "",
    });
  };

  // Cancel / Go Back button handler
  const handleGoBack = () => {
    const initialSerialized = serializeForm(initialFormRef.current);
    const currentSerialized = serializeForm(formData as ProjectFormData);
    if (initialSerialized !== currentSerialized) {
      const confirmLeave = window.confirm(
        "You have unsaved changes. Are you sure you want to leave? All unsaved changes will be lost."
      );
      if (!confirmLeave) return;
    }

    // Redirect back to Client info with session parameters
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (inquiryId) params.set("inquiryId", inquiryId);
    
    router.push(`/client/client-info?${params.toString()}`);
  };

  // Format date for display
  const formatDate = (date: Date | null) =>
    date?.toLocaleDateString(
      "en-US",
      usesReferenceDesign
        ? { month: "2-digit", day: "2-digit", year: "numeric" }
        : { day: "2-digit", month: "long", year: "numeric" },
    ) || "";

  // Show loading skeleton while fetching project data
  if (loading) {
    return (
      <div className={usesReferenceDesign
        ? "min-h-screen flex items-center justify-center p-6 bg-white"
        : "min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50/50 to-blue-50/30"}>
        <div className={usesReferenceDesign
          ? "w-full max-w-3xl p-8 bg-white"
          : "bg-white/80 p-8 rounded-2xl shadow-xl border border-white/50 backdrop-blur-sm"}>
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-slate-200 rounded w-48" />
            <div className="h-4 bg-slate-100 rounded w-64" />
          </div>
        </div>
      </div>
    );
  }

  // Main form UI
  return (
    <div className={usesReferenceDesign
      ? "min-h-screen bg-white"
      : "min-h-screen p-6 bg-gradient-to-br from-slate-50/50 to-blue-50/30"}>
      <div className={usesReferenceDesign
        ? "mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5"
        : "max-w-2xl mx-auto"}>
        <div className={usesReferenceDesign
          ? "flex-1 bg-white"
          : "p-6 bg-white/80 rounded-2xl shadow-xl border border-white/50 backdrop-blur-sm"}>
          {/* Header and instructions */}
          {usesReferenceDesign ? (
            <>
              <header className="flex items-center justify-between border-b border-slate-200 py-5">
                <div>
                  <h1 className="text-xl font-bold leading-tight text-slate-950">
                    Project Information Form
                  </h1>
                </div>
                {isDraft && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold text-amber-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                    Draft
                  </span>
                )}
              </header>
              <div className="py-5">
                <p className="text-xs leading-5 text-[#18365d]">
                  Thank you for partnering with us. To better understand and support your project,
                  please complete this form.
                </p>
                <ol aria-label="Project setup progress" className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    "Save project draft",
                    "Add yourself as Primary Member",
                    "Submit for admin approval",
                  ].map((step, index) => (
                    <li
                      key={step}
                      aria-current={index === 0 ? "step" : undefined}
                      className={`flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-[10px] leading-tight ${
                        index === 0
                          ? "border-blue-200 bg-blue-50 text-[#15385e]"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        index === 0 ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-700"
                      }`}>
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-[#F69122] to-[#912ABD]" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-[#166FB5] to-[#4038AF] bg-clip-text text-transparent">
                Project Information Form
              </h1>
              {isDraft && (
                <div className="px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-semibold text-orange-600 ml-4">
                  Draft
                </div>
              )}
            </div>
            <div className="p-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50">
              <p className="text-slate-700 leading-relaxed mb-1.5">
                Thank you for partnering with Philippine Genome Center Visayas. To better understand and support your project, please fill out this form.
              </p>
              <p className="text-sm text-slate-600 italic">
                <strong>Note:</strong> This form creates a draft. After saving, you'll add yourself as the Primary Member, then submit for admin approval.
              </p>
            </div>
          </div>
          )}

          {/* Project form fields */}
          <form onSubmit={handleSubmit} className={usesReferenceDesign ? "space-y-4 pb-5" : "space-y-4"}>
            {usesReferenceDesign && (
              <h2 className="text-xs font-bold text-slate-950">
                Project details <span className="float-right font-normal text-slate-500"><span className="text-[#B9273A]">*</span> Required</span>
              </h2>
            )}
            {/* Project Title – full width */}
            <div>
              <Label className={usesReferenceDesign ? "text-xs font-medium text-slate-800" : "text-sm font-medium text-slate-700"}>
                {usesReferenceDesign ? "Project title" : "Project Title"} <span className="text-[#B9273A]">*</span>
              </Label>
              <Input
                value={formData.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("title", e.target.value)}
                placeholder={usesReferenceDesign ? "e.g. Coastal biodiversity genome survey" : "Enter your project title"}
                className={usesReferenceDesign
                  ? "mt-1 h-[34px] rounded-md border-slate-300 bg-white text-xs shadow-none placeholder:text-slate-400"
                  : "mt-1"}
              />
              {errors.title && <p className="text-[#B9273A] text-xs mt-0.5">{errors.title}</p>}
            </div>

            {/* Project Lead + Start Date */}
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${usesReferenceDesign ? "pt-0.5" : ""}`}>
              <div>
                <Label className={usesReferenceDesign ? "text-xs font-medium text-slate-800" : "text-sm font-medium text-slate-700"}>
                  {usesReferenceDesign ? "Project lead" : "Project Lead"} <span className="text-[#B9273A]">*</span>
                </Label>
                <Input
                  value={formData.projectLead}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("projectLead", e.target.value)}
                  placeholder={usesReferenceDesign ? "Full name" : "Enter project lead name"}
                  className={usesReferenceDesign
                    ? "mt-1 h-[34px] rounded-md border-slate-300 bg-white text-xs shadow-none placeholder:text-slate-400"
                    : "mt-1"}
                />
                {errors.projectLead && <p className="text-[#B9273A] text-xs mt-0.5">{errors.projectLead}</p>}
              </div>

              <div>
                <Label className={usesReferenceDesign ? "text-xs font-medium text-slate-800" : "text-sm font-medium text-slate-700"}>
                  {usesReferenceDesign ? "Start date" : "Start Date"} <span className="text-[#B9273A]">*</span>
                </Label>
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative w-full mt-1">
                      <Input
                        value={formatDate(formData.startDate)}
                        readOnly
                        className={usesReferenceDesign
                          ? "h-[34px] rounded-md border-slate-300 bg-white pr-10 text-xs shadow-none"
                          : "pr-10"}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
                      >
                        <CalendarIcon className={usesReferenceDesign ? "size-4 text-slate-700" : "size-4 text-[#166FB5]"} />
                      </Button>
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 border border-slate-200 bg-white/90 backdrop-blur-sm">
                    <Calendar
                      mode="single"
                      selected={formData.startDate}
                      fromYear={2000}
                      toYear={new Date().getFullYear() + 10}
                      onSelect={(date: Date | undefined) => {
                        handleChange("startDate", date);
                        setStartOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
                {errors.startDate && <p className="text-[#B9273A] text-xs mt-0.5">{errors.startDate}</p>}
              </div>
            </div>

            {usesReferenceDesign && <div className="border-t border-slate-200 pt-4">
              <h2 className="mb-2 text-xs font-bold text-slate-950">Institutions</h2>
            </div>}

            {/* Sending Institution + Funding Institution */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className={usesReferenceDesign ? "text-xs font-medium text-slate-800" : "text-sm font-medium text-slate-700"}>
                  {usesReferenceDesign ? "Sending institution type" : "Sending Institution"} <span className="text-[#B9273A]">*</span>
                </Label>
                <Select
                  value={formData.sendingInstitution}
                  onValueChange={(val: string) => handleChange("sendingInstitution", val)}
                >
                  <SelectTrigger className={usesReferenceDesign
                    ? "mt-1 h-[34px] w-full rounded-md border-slate-300 bg-white text-xs shadow-none"
                    : "w-full mt-1"}>
                    <SelectValue placeholder="Select institution type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UP System">UP System</SelectItem>
                    <SelectItem value="SUC/HEI">SUC/HEI</SelectItem>
                    <SelectItem value="Government">Government</SelectItem>
                    <SelectItem value="Private/Local">Private/Local</SelectItem>
                    <SelectItem value="International">International</SelectItem>
                    <SelectItem value="N/A">N/A</SelectItem>
                  </SelectContent>
                </Select>
                {errors.sendingInstitution && <p className="text-[#B9273A] text-xs mt-0.5">{errors.sendingInstitution}</p>}
              </div>

              <div>
                <Label className={usesReferenceDesign ? "text-xs font-medium text-slate-800" : "text-sm font-medium text-slate-700"}>
                  {usesReferenceDesign ? "Funding institution" : "Funding Institution"} <span className="text-[#B9273A]">*</span>
                </Label>
                <Input
                  value={formData.fundingInstitution}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("fundingInstitution", e.target.value)}
                  placeholder={usesReferenceDesign ? "Name of funding body" : "Enter funding institution"}
                  className={usesReferenceDesign
                    ? "mt-1 h-[34px] rounded-md border-slate-300 bg-white text-xs shadow-none placeholder:text-slate-400"
                    : "mt-1"}
                />
                {errors.fundingInstitution && <p className="text-[#B9273A] text-xs mt-0.5">{errors.fundingInstitution}</p>}
                {usesReferenceDesign && (
                  <p className="mt-1 text-[10px] text-slate-600">Enter “None” if self-funded.</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className={usesReferenceDesign
              ? "sticky bottom-0 -mx-5 mt-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3"
              : "flex justify-end gap-3 pt-4 border-t border-slate-100"}>
              <Button
                type="button"
                onClick={handleGoBack}
                className={usesReferenceDesign
                  ? "h-[34px] border border-slate-300 bg-white px-4 text-xs font-medium text-slate-800 hover:bg-slate-100"
                  : "h-9 px-5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition"}
              >
                Go Back
              </Button>
              {usesReferenceDesign && (
                <span className="hidden text-[10px] text-slate-600 sm:inline">You can edit this draft later</span>
              )}
              <Button
                type="submit"
                disabled={isDraftSaveLocked || isSavingDraft}
                className={usesReferenceDesign
                  ? "h-[34px] bg-blue-700 px-4 text-xs font-semibold text-white hover:bg-blue-800"
                  : "h-9 px-6 bg-gradient-to-r from-[#166FB5] to-[#4038AF] hover:from-[#166FB5]/90 hover:to-[#4038AF]/90 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-300"}
              >
                {usesReferenceDesign ? "Save project draft" : "Save Project Draft"}
              </Button>
            </div>
          </form>
        </div>
      </div>
      {/* Confirmation Modal: Review project info before final submit */}
      <ConfirmationModalLayout
        open={showConfirmModal}
        onConfirm={handleConfirmSave}
        onCancel={handleCancelModal}
        loading={isSavingDraft}
        title="Save Project Draft?"
        description="Review your project information below. You can edit this later before submitting for approval."
        confirmLabel="Save Draft"
        cancelLabel="Go Back"
      >
        {pendingData && (
          <div className="space-y-2 text-slate-800 text-sm">
            <div><span className="font-semibold">Project Title:</span> {pendingData.title}</div>
            <div><span className="font-semibold">Project Lead:</span> {pendingData.projectLead}</div>
            <div><span className="font-semibold">Start Date:</span> {formatDate(pendingData.startDate)}</div>
            <div><span className="font-semibold">Sending Institution:</span> {pendingData.sendingInstitution}</div>
            <div><span className="font-semibold">Funding Institution:</span> {pendingData.fundingInstitution}</div>
          </div>
        )}
      </ConfirmationModalLayout>
    </div>
  );
}