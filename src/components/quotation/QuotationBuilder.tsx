// src/components/quotation/QuotationBuilder.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDoc, collection } from "firebase/firestore";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { createQuotationAvailabilityEmail } from "@/lib/quotationEmail";
import { calculateItemTotal } from "@/lib/calculatePrice";
import { sanitizeObject } from "@/lib/sanitizeObject";
import { getServiceCatalog } from "@/services/serviceCatalogService";
import { getInquiryById } from "@/services/inquiryService";
import { saveQuotationAction } from "@/app/actions/quotationActions";

import { QuotationRecord } from "@/types/Quotation";
import { SelectedService as StrictSelectedService } from "@/types/SelectedService";
import { ServiceItem } from "@/types/ServiceItem";
import { Inquiry } from "@/types/Inquiry";

import { Badge } from "@/components/ui/badge";
import { FlaskConical, Calendar, Loader2 } from "lucide-react";

import { saveQuotationToFirestore, generateNextReferenceNumber } from "@/services/quotationService";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { PDFViewer } from "@react-pdf/renderer";
import { QuotationPDF } from "./QuotationPDF";
import { QuotationHistoryPanel } from "./QuotationHistoryPanel";
import useAuth from "@/hooks/useAuth";
import { GroupedServiceSelector } from "@/components/forms/GroupedServiceSelector";

// Allow editable quantity ("" or number)
type EditableSelectedService = Omit<StrictSelectedService, "quantity"> & {
  quantity: number | "";
  samples?: number | "";
};

// --- Utilities for Inquiry Display ---

// Format service type for display
const formatServiceType = (type: string | null | undefined): string => {
  if (!type) return "—";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

// Format workflow type for display
const formatWorkflowType = (type: string | null | undefined): string => {
  if (!type) return "—";
  if (type === "complete-bioinfo") return "Complete molecular workflow with Bioinformatics Analysis";
  if (type === "complete") return "Complete Molecular workflow only (DNA Extraction to Sequencing)";
  if (type === "individual") return "Individual Assay";
  return type
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
  prefix = ""
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
      rows.push(...flattenBioinformaticsDetails(value as Record<string, any>, path));
      return;
    }

    rows.push({ key: path, value: String(value) });
  });

  return rows;
};

// --- End Utilities ---

export default function QuotationBuilder({
  inquiryId,
  initialClientInfo,
}: {
  inquiryId?: string;
  initialClientInfo?: {
    name: string;
    institution: string;
    designation: string;
    email: string;
  };
}) {
  const [selectedServices, setSelectedServices] = useState<EditableSelectedService[]>([]);
  const [isInternal, setIsInternal] = useState(false);
  const [useAffiliationAsClientName, setUseAffiliationAsClientName] = useState(false);
  const [openPreview, setOpenPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [clientInfo, setClientInfo] = useState({
    name: "",
    institution: "",
    designation: "",
    email: "",
  });

  const { adminInfo } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const effectiveInquiryId = inquiryId || searchParams.get("inquiryId") || "";

  const { data: catalog = [] } = useQuery({
    queryKey: ["serviceCatalog"],
    queryFn: getServiceCatalog,
  });

  const { data: inquiryData } = useQuery<Inquiry | undefined>({
    queryKey: ["inquiry", effectiveInquiryId],
    queryFn: () => getInquiryById(effectiveInquiryId),
    enabled: !!effectiveInquiryId,
  });

  // Sync clientInfo state with fetched inquiry data or initial props
  useEffect(() => {
    if (initialClientInfo) {
      setClientInfo(initialClientInfo);
    } else if (inquiryData) {
      setClientInfo({
        name: inquiryData.name || "Unknown",
        institution: inquiryData.affiliation || "N/A",
        designation: inquiryData.designation || "N/A",
        email: inquiryData.email || "",
      });
    }
  }, [initialClientInfo, inquiryData]);

  useEffect(() => {
    const fetchRef = async () => {
      const year = new Date().getFullYear();
      const next = await generateNextReferenceNumber(year);
      setReferenceNumber(next);
    };
    fetchRef();
  }, []);

  const currentYear = new Date().getFullYear();

  const toggleService = (id: string, service: ServiceItem) => {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.id === id);
      if (exists) return prev.filter((s) => s.id !== id);
      return [...prev, { ...service, quantity: 1, samples: 0, description: service.description }];
    });
  };

  const updateQuantity = (id: string, qty: number | "") => {
    setSelectedServices((prev) =>
      prev.map((svc) => (svc.id === id ? { ...svc, quantity: qty } : svc))
    );
  };

  const updateSamples = (id: string, samples: number | "") => {
    setSelectedServices((prev) =>
      prev.map((svc) => (svc.id === id ? { ...svc, samples } : svc))
    );
  };

  const updateParticipants = (id: string, participants: number | "") => {
    setSelectedServices((prev) =>
      prev.map((svc) => (svc.id === id ? { ...svc, participants } : svc))
    );
  };

  const cleanedServices: StrictSelectedService[] = selectedServices
    .filter((s) => typeof s.quantity === "number" && s.quantity > 0)
    .map((s) => ({ ...s, quantity: s.quantity as number }));

  const subtotal = cleanedServices.reduce((sum, item) => {
    const serviceType = item.type.toLowerCase();

    if (serviceType.includes('bioinformatics') || serviceType.includes('bioinfo')) {
      const samples = (item as any).samples ?? 1;
      const samplesAmount = calculateItemTotal(samples, item.price, {
        minQuantity: (item as any).minQuantity,
        additionalUnitPrice: (item as any).additionalUnitPrice,
      });
      return sum + (samplesAmount * item.quantity);
    } else if (serviceType.includes('training')) {
      const participants = (item as any).participants ?? 1;
      const participantsAmount = calculateItemTotal(participants, item.price, {
        minQuantity: (item as any).minParticipants,
        additionalUnitPrice: (item as any).additionalParticipantPrice,
      });
      return sum + (participantsAmount * item.quantity);
    } else {
      return sum + (item.price * item.quantity);
    }
  }, 0);
  const discount = isInternal ? subtotal * 0.12 : 0;
  const total = subtotal - discount;

  const handleSaveAndDownload = async () => {
    try {
      setSaving(true);
      const currentYear = new Date().getFullYear();
      const quotationRecord = {
        referenceNumber,
        name: clientInfo.name,
        institution: clientInfo.institution,
        designation: clientInfo.designation,
        email: clientInfo.email,
        services: cleanedServices,
        isInternal,
        useAffiliationAsClientName,
        dateIssued: new Date().toISOString(),
        year: currentYear,
        subtotal,
        discount,
        total,
        preparedBy: {
          name: adminInfo?.name || "—",
          position: adminInfo?.position || "—",
        },
        categories: Array.from(
          new Set(cleanedServices.map((s) => s.type))
        ),
        inquiryId: effectiveInquiryId.trim(),
      };

      if (!adminInfo?.email) {
        toast.error("User authentication required to save quotation");
        setSaving(false);
        return;
      }

      const result = await saveQuotationAction(quotationRecord, {
        name: adminInfo.name || adminInfo.email!,
        email: adminInfo.email!
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to save quotation");
      }

      let emailQueued = result.emailQueued;
      let emailError = result.emailError;
      if (!emailQueued && clientInfo.email.trim()) {
        try {
          await addDoc(collection(db, "mail"), {
            to: [clientInfo.email.trim().toLowerCase()],
            ...(quotationRecord.inquiryId
              ? { inquiryId: quotationRecord.inquiryId }
              : {}),
            message: createQuotationAvailabilityEmail(
              clientInfo.name || "Client",
            ),
          });
          emailQueued = true;
          emailError = undefined;
          console.info(
            `Quotation notification email queued for ${clientInfo.email}`,
          );
        } catch (error) {
          console.error(
            `Could not queue quotation notification from the admin client for ${clientInfo.email}:`,
            error,
          );
          const code =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof error.code === "string"
              ? error.code
              : "unknown";
          emailError = `Email queue fallback failed (${code}). Check that your admin account can create mail records.`;
        }
      }

      // Invalidate both potential query keys used in QuotationHistoryPanel
      const normalizedInquiryId = effectiveInquiryId.trim().toUpperCase();
      queryClient.invalidateQueries({ queryKey: ["quotationHistory", "inquiry", normalizedInquiryId] });
      if (clientInfo.name) {
        queryClient.invalidateQueries({ queryKey: ["quotationHistory", "client", clientInfo.name] });
      }

      toast.success("Quotation saved successfully!");
      if (!emailQueued) {
        toast.error(
          emailError ||
            "Quotation saved, but the client notification email was not queued.",
        );
      } else if (!result.emailQueued) {
        toast.success("Client notification email queued.");
      }
      setOpenPreview(false);
    } catch (error) {
      console.error("Error saving quotation:", error);
      toast.error(`Failed to save quotation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 flex gap-6">
      <div className="flex-[2] min-w-[520px]">
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-2">Build Quotation for:</h1>
          <Accordion type="single" collapsible defaultValue="client-info">
            <AccordionItem value="client-info" className="border rounded-lg overflow-hidden shadow-sm">
              <AccordionTrigger className="px-4 py-3 hover:no-underline bg-white text-base font-semibold">
                Client Information
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                <div className="pl-6 pr-4 pb-3">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground w-40">Reference Number</td>
                        <td className="py-2 font-mono font-bold text-slate-700">{referenceNumber}</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">Client Name</td>
                        <td className="py-2 font-semibold text-slate-900">{clientInfo.name}</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">Institution</td>
                        <td className="py-2 text-slate-700">{clientInfo.institution}</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">Designation</td>
                        <td className="py-2 text-slate-700">{clientInfo.designation}</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">Email</td>
                        <td className="py-2 text-slate-700">{clientInfo.email || "N/A"}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={useAffiliationAsClientName}
                      onCheckedChange={val => setUseAffiliationAsClientName(!!val)}
                    />
                    <span className="text-sm">Display affiliation as client name in PDF</span>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={isInternal}
                      onCheckedChange={val => setIsInternal(!!val)}
                    />
                    <span className="text-sm">Internal Client (Apply 12% discount)</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="quotation-request-details" className="mt-3 border rounded-lg overflow-hidden shadow-sm">
              <AccordionTrigger className="px-4 py-3 hover:no-underline bg-white text-base font-semibold">
                Quotation Request Details
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                <div className="pl-6 pr-4 pb-3 text-sm">
                  <div className="pt-2 pb-4 space-y-4">
                    {/* Service Type */}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <FlaskConical className="h-4 w-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Service Type</span>
                      </div>
                      <Badge className="w-fit capitalize bg-gradient-to-r from-[#166FB5]/10 to-[#4038AF]/10 text-[#166FB5] border-[#166FB5]/20">
                        {formatServiceType(inquiryData?.serviceType)}
                      </Badge>
                    </div>

                    {/* Equipment Details Section */}
                    {inquiryData?.serviceType === 'equipment' && inquiryData?.individualAssayDetails && (
                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-700">Equipment / Workflow Details</h3>
                        <div className="flex flex-col">
                          <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">
                            {inquiryData.individualAssayDetails}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Retail Sales Details Section */}
                    {inquiryData?.serviceType === 'retail' && inquiryData?.retailItems && (
                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-700">Retail Sales Details</h3>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                            Requested Items
                          </span>
                          <div className="grid grid-cols-1 gap-3 mt-2">
                            {inquiryData.retailItems.map((item) => (
                              <div key={item} className="flex flex-col bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <span className="text-sm font-semibold text-slate-800">{item}</span>
                                {inquiryData.retailItemDetails?.[item] && (
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Amount:</span>
                                    <span className="text-sm text-[#166FB5] font-medium">{inquiryData.retailItemDetails[item]}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bioinformatics Details Section */}
                    {inquiryData?.serviceType === 'bioinformatics' && (
                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-700">Bioinformatics Details</h3>

                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Type of Bioinformatics Service</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(Array.isArray(inquiryData.bioinformaticsDetails?.serviceTypes) ? inquiryData.bioinformaticsDetails?.serviceTypes : []).length > 0 ? (
                              (inquiryData.bioinformaticsDetails?.serviceTypes as string[]).map((serviceType) => (
                                <Badge key={serviceType} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
                                  {serviceType}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-slate-700">—</span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Provide Own Data</span>
                            <span className="text-sm font-medium text-slate-800 mt-1">{inquiryData.bioinformaticsDetails?.dataProvideOwnData ? "Yes" : "No"}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Data Generated by PGC Visayas</span>
                            <span className="text-sm font-medium text-slate-800 mt-1">{inquiryData.bioinformaticsDetails?.dataProvidedByPgc ? "Yes" : "No"}</span>
                          </div>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Overview of Research and Objectives</span>
                          <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">
                            {inquiryData.bioinformaticsDetails?.overviewObjectives || "—"}
                          </p>
                        </div>

                        {flattenBioinformaticsDetails(inquiryData.bioinformaticsDetails).length > 0 && (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">All Submitted Bioinformatics Entries</span>
                            <div className="mt-1 rounded-lg border border-slate-100 bg-slate-50 p-3">
                              <ul className="space-y-1 text-xs text-slate-700">
                                {flattenBioinformaticsDetails(inquiryData.bioinformaticsDetails).map((entry) => (
                                  <li key={`${entry.key}-${entry.value}`}>
                                    <span className="font-semibold text-slate-600">{entry.key}:</span> {entry.value}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Research & Collaboration Details Section */}
                    {(
                      inquiryData?.serviceType === 'research' ||
                      inquiryData?.projectBackground ||
                      inquiryData?.projectBudget ||
                      inquiryData?.molecularServicesBudget ||
                      inquiryData?.plannedSampleCount
                    ) && (
                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-700">Research & Collaboration Details</h3>

                        {(inquiryData?.researchOverview || inquiryData?.projectBackground) && (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              Overview of Research, Objectives, and Scope of Collaboration
                            </span>
                            <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">
                              {inquiryData?.researchOverview || inquiryData?.projectBackground}
                            </p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {inquiryData?.molecularServicesBudget && (
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Molecular Services Budget</span>
                              <span className="text-sm font-medium text-slate-800 mt-1">{inquiryData?.molecularServicesBudget}</span>
                            </div>
                          )}

                          {inquiryData?.plannedSampleCount && (
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">How Many Samples Are You Planning to Send?</span>
                              <span className="text-sm font-medium text-slate-800 mt-1">{inquiryData?.plannedSampleCount}</span>
                            </div>
                          )}

                          {inquiryData?.projectBudget && (
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Project Budget</span>
                              <span className="text-sm font-medium text-slate-800 mt-1">{inquiryData?.projectBudget}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Laboratory Details Section */}
                    {inquiryData?.serviceType === 'laboratory' && (
                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-700">Laboratory Details</h3>

                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Species</span>
                          <span className="text-sm font-medium text-slate-800 capitalize mt-1">
                            {inquiryData.species 
                              ? (inquiryData.otherSpecies ? `${inquiryData.species}: ${inquiryData.otherSpecies}` : inquiryData.species)
                              : "—"}
                          </span>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Sample Count</span>
                          <span className="text-sm font-medium text-slate-800 mt-1">{inquiryData.sampleCount || "—"}</span>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Workflow</span>
                          <span className="text-sm font-medium text-slate-800 mt-1">
                            {inquiryData.workflowType ? formatWorkflowType(inquiryData.workflowType) : "—"}
                          </span>
                        </div>

                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Bioinformatics Analysis</span>
                          {inquiryData.bioinfoOptions && inquiryData.bioinfoOptions.length > 0 ? (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {inquiryData.bioinfoOptions.map((option) => (
                                <Badge 
                                  key={option} 
                                  variant="secondary" 
                                  className="bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 transition-colors py-1 px-3"
                                >
                                  {formatBioinfoOption(option)}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-slate-800 mt-1">—</span>
                          )}
                        </div>

                        {inquiryData.individualAssayDetails && (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              Individual Assay Details
                            </span>
                            <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">
                              {inquiryData.individualAssayDetails}
                            </p>
                          </div>
                        )}
                
                        {/* Training Specific Fields (also relevant for some inquiries) */}
                        {((inquiryData.trainingPrograms && inquiryData.trainingPrograms.length > 0) || inquiryData.specificTrainingNeed || inquiryData.targetTrainingDate || inquiryData.numberOfParticipants) && (
                          <div className="pt-4 border-t border-slate-100 space-y-4">
                            <h3 className="text-sm font-semibold text-slate-700">Training Details</h3>

                            {inquiryData.trainingPrograms && inquiryData.trainingPrograms.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Selected Training Programs</span>
                                <div className="grid grid-cols-1 gap-2">
                                  {inquiryData.trainingPrograms.map((program: string, index: number) => (
                                    <div key={`${program}-${index}`} className="text-sm text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                      {program === "others-customized" ? "Others / Customized Training Program" : program}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {inquiryData.specificTrainingNeed && (
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Others / Customized Training Program Details</span>
                                <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">{inquiryData.specificTrainingNeed}</p>
                              </div>
                            )}

                            {inquiryData.targetTrainingDate && (
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2 mb-1">
                                  <Calendar className="h-4 w-4 text-slate-400" />
                                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Target Training Date</span>
                                </div>
                                <span className="text-sm font-medium text-slate-800">{inquiryData.targetTrainingDate}</span>
                              </div>
                            )}

                            {inquiryData.numberOfParticipants && (
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Number of Participants</span>
                                <span className="text-sm font-medium text-slate-800 mt-1">{inquiryData.numberOfParticipants}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Separator className="my-4" />
                  
                  <div className="py-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Request Overview</p>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground w-40">Request ID</td>
                        <td className="py-2 text-slate-700 font-mono">{inquiryData?.id || effectiveInquiryId || "N/A"}</td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">Date Submitted</td>
                        <td className="py-2 text-slate-700">
                          {inquiryData?.createdAt
                            ? new Date(inquiryData.createdAt).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })
                            : "N/A"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">Status</td>
                        <td className="py-2 text-slate-700">{inquiryData?.status || "N/A"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button
            variant={showSelectedOnly ? "default" : "outline"}
            onClick={() => setShowSelectedOnly(!showSelectedOnly)}
            className="whitespace-nowrap"
          >
            {showSelectedOnly ? "Show All" : "Show Selected"}
            {selectedServices.length > 0 && (
              <span className="ml-2 bg-white text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
                {selectedServices.length}
              </span>
            )}
          </Button>
        </div>

        <ScrollArea className="h-[65vh] pr-2 w-full">
          <div className="w-full">
            <GroupedServiceSelector
              catalog={catalog}
              selectedServices={selectedServices}
              search={search}
              showSelectedOnly={showSelectedOnly}
              onToggleService={toggleService}
              onUpdateQuantity={updateQuantity}
              onUpdateSamples={updateSamples}
              onUpdateParticipants={updateParticipants}
            />
          </div>
        </ScrollArea>
      </div>

      <div className="flex-[1] min-w-[320px] max-w-[420px] shrink-0 sticky top-6 h-fit border p-4 rounded-md shadow-sm bg-white">
        <h3 className="text-lg font-bold mb-2">Summary</h3>
        <p className="text-sm text-muted-foreground mb-2">
          {cleanedServices.length} {cleanedServices.length === 1 ? 'service' : 'services'} selected
        </p>
        <Separator className="mb-2" />
        {cleanedServices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No services selected</p>
            <p className="text-xs mt-1">Select services from the list to continue</p>
          </div>
        ) : (
          <>
            {Object.entries(
              cleanedServices.reduce((acc, item) => {
                const category = item.type || 'Other';
                if (!acc[category]) acc[category] = [];
                acc[category].push(item);
                return acc;
              }, {} as Record<string, typeof cleanedServices>)
            ).map(([category, items]) => (
              <div key={category} className="mb-3">
                <p className="text-xs font-semibold text-gray-600 uppercase mb-1">
                  {category} ({items.length})
                </p>
                {items.map((item) => {
                  const participants = (item as any).participants ?? 1;
                  const baseAmount = calculateItemTotal(participants, item.price, {
                    minQuantity: (item as any).minParticipants || (item as any).minQuantity,
                    additionalUnitPrice: (item as any).additionalParticipantPrice || (item as any).additionalUnitPrice,
                  });
                  const totalAmount = baseAmount * item.quantity;
                  return (
                    <div key={item.id} className="flex justify-between text-sm mb-1 pl-2">
                      <span className="truncate">
                        {item.name} x {item.quantity}
                      </span>
                      <span className="font-medium">₱{totalAmount.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
        <Separator className="my-2" />
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>Subtotal:</span>
            <span>₱{subtotal.toFixed(2)}</span>
          </div>
          {isInternal && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount (12%):</span>
              <span>-₱{discount.toFixed(2)}</span>
            </div>
          )}
        </div>
        <Separator className="my-2" />
        <div className="flex justify-between text-lg font-bold text-primary">
          <span>Total:</span>
          <span>₱{total.toFixed(2)}</span>
        </div>

        <Dialog open={openPreview} onOpenChange={setOpenPreview}>
          <DialogTrigger asChild>
            <Button
              className="mt-4 w-full"
              disabled={cleanedServices.length === 0}
            >
              Preview Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Preview Quotation PDF</DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <PDFViewer width="100%" height="600">
                <QuotationPDF
                  services={cleanedServices}
                  clientInfo={clientInfo}
                  referenceNumber={referenceNumber}
                  useInternalPrice={isInternal}
                  useAffiliationAsClientName={useAffiliationAsClientName}
                  preparedBy={{
                    name: adminInfo?.name || "—",
                    position: adminInfo?.position || "—",
                  }}
                  dateOfIssue={new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                />
              </PDFViewer>
              <div className="text-right mt-4">
                <Button
                  onClick={handleSaveAndDownload}
                  disabled={cleanedServices.length === 0 || saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Generate Final Quotation"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Separator className="my-6" />
        <QuotationHistoryPanel 
          inquiryId={effectiveInquiryId || undefined} 
          clientName={clientInfo.name || undefined} 
        />
      </div>
    </div>
  );
}