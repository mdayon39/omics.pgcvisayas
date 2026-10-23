"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { ChargeSlipHistoryPanel } from "./ChargeSlipHistoryPanel";
import { QuotationHistoryPanel } from "@/components/quotation/QuotationHistoryPanel";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pdf, PDFViewer } from "@react-pdf/renderer";
import { toast } from "sonner";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import { QuotationRecord } from "@/types/Quotation";
import { sanitizeObject } from "@/lib/sanitizeObject";
import { calculateItemTotal } from "@/lib/calculatePrice";
import { getServiceCatalog } from "@/services/serviceCatalogService";
import { getClientById, getProjectById } from "@/services/clientProjectService";
import { getInquiryById } from "@/services/inquiryService";
import { generateNextChargeSlipNumber } from "@/services/chargeSlipService";
import { saveChargeSlipAction } from "@/app/actions/chargeSlipActions";
import { sendChargeSlipNotification } from "@/services/chargeSlipEmailService";

import { SelectedService as StrictSelectedService } from "@/types/SelectedService";
import { ServiceItem } from "@/types/ServiceItem";

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

import { ChargeSlipPDF } from "./ChargeSlipPDF";
import useAuth from "@/hooks/useAuth";
import { GroupedServiceSelector } from "@/components/forms/GroupedServiceSelector";
import { Loader2 } from "lucide-react";
import { getActiveCatalogItems } from "@/services/catalogSettingsService";
import { CatalogItem } from "@/types/CatalogSettings";

export type EditableSelectedService = Omit<
  StrictSelectedService,
  "quantity" | "price"
> & {
  quantity: number | "";
  price: number;
};

function ChargeSlipBuilderInner({
  clientId,
  projectId,
  clientData,
  projectData,
  onSubmit,
}: {
  clientId?: string;
  projectId?: string;
  clientData?: any;
  projectData?: any;
  onSubmit: (data: any) => void;
}) {
  const [selectedServices, setSelectedServices] = useState<
    EditableSelectedService[]
  >([]);
  const [isInternal, setIsInternal] = useState(false);
  const [useAffiliationAsClientName, setUseAffiliationAsClientName] =
    useState(false);
  const [openPreview, setOpenPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [chargeSlipNumber, setChargeSlipNumber] = useState<string>("");
  const [orNumber, setOrNumber] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [clientInfo, setClientInfo] = useState({
    name: "Unknown Client",
    institution: "No Institution",
    designation: "No Designation",
    email: "",
  });

  const { adminInfo } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const effectiveClientId = clientId || searchParams.get("clientId") || "";
  const urlProjectId = projectId || searchParams.get("projectId") || "";

  const { data: catalog = [] } = useQuery({
    queryKey: ["serviceCatalog"],
    queryFn: getServiceCatalog,
  });

  const { data: fetchedClient } = useQuery({
    queryKey: ["client", effectiveClientId],
    queryFn: () => getClientById(effectiveClientId),
    enabled: !!effectiveClientId,
  });

  const clientRecord = useMemo(
    () => sanitizeObject(clientData || fetchedClient || {}),
    [clientData, fetchedClient],
  );

  const inquiryId =
    typeof clientRecord?.inquiryId === "string" ? clientRecord.inquiryId : "";

  const { data: fetchedInquiry } = useQuery({
    queryKey: ["inquiry", inquiryId],
    queryFn: () => getInquiryById(inquiryId),
    enabled: !!inquiryId,
  });

  // Use primary project (first pid) if no specific projectId provided
  const client = useMemo(() => {
    const base = sanitizeObject(clientRecord || {});
    if (!base || typeof base !== "object") return null;

    const baseClient = base as Record<string, unknown>;
    const inquiryFallback = fetchedInquiry
      ? {
          name: fetchedInquiry.name || (baseClient.name as string | undefined),
          affiliation:
            fetchedInquiry.affiliation ||
            (baseClient.affiliation as string | undefined),
          designation:
            fetchedInquiry.designation ||
            (baseClient.designation as string | undefined),
          email:
            fetchedInquiry.email ||
            (baseClient.email as string | undefined) ||
            "",
        }
      : {};

    const pidValue = baseClient.pid;
    const normalizedPid = Array.isArray(pidValue)
      ? pidValue.filter((item): item is string => typeof item === "string")
      : typeof pidValue === "string"
        ? [pidValue]
        : [];

    return {
      ...(baseClient as Record<string, unknown>),
      ...inquiryFallback,
      pid: normalizedPid,
      name:
        (baseClient.name as string | undefined) ||
        (inquiryFallback as { name?: string }).name ||
        "Unknown Client",
      affiliation:
        (baseClient.affiliation as string | undefined) ||
        (inquiryFallback as { affiliation?: string }).affiliation ||
        "No Institution",
      designation:
        (baseClient.designation as string | undefined) ||
        (inquiryFallback as { designation?: string }).designation ||
        "No Designation",
      email:
        (baseClient.email as string | undefined) ||
        (inquiryFallback as { email?: string }).email ||
        "",
    };
  }, [clientRecord, fetchedInquiry]);

  // Get the effective project ID - prioritize URL param, then primary project from client's pid array
  let effectiveProjectId = urlProjectId;

  // If projectId from URL contains comma-separated values, use only the first one (primary)
  if (effectiveProjectId && effectiveProjectId.includes(",")) {
    effectiveProjectId = effectiveProjectId.split(",")[0].trim();
    console.log(
      "Multiple PIDs detected in URL, using primary:",
      effectiveProjectId,
    );
  }

  // If still no projectId, get from client's primary pid
  if (
    !effectiveProjectId &&
    client &&
    Array.isArray(client.pid) &&
    client.pid.length > 0
  ) {
    effectiveProjectId = client.pid[0];
    console.log("Using primary project ID from client:", effectiveProjectId);
  }

  const { data: fetchedProject, isLoading: isProjectLoading } = useQuery({
    queryKey: ["project", effectiveProjectId],
    queryFn: () => getProjectById(effectiveProjectId!),
    enabled: !!effectiveProjectId,
  });

  const project = projectData || fetchedProject || null;

  // Log warning if client data is missing
  useEffect(() => {
    if (effectiveClientId && !client?.name) {
      console.warn(
        `Client data not found or incomplete for CID: ${effectiveClientId}`,
      );
    }
  }, [effectiveClientId, client]);

  useEffect(() => {
    const fetchRef = async () => {
      const year = new Date().getFullYear();
      const next = await generateNextChargeSlipNumber(year);
      setChargeSlipNumber(next);
    };
    fetchRef();
  }, []);

  const toggleService = (id: string, service: ServiceItem) => {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.id === id);
      if (exists) return prev.filter((s) => s.id !== id);
      return [...prev, { ...service, quantity: 1, price: service.price }];
    });

    // Reset checkboxes to default state
    setIsInternal(false);
    setUseAffiliationAsClientName(false);
  };

  const updateQuantity = (id: string, qty: number | "") => {
    setSelectedServices((prev) =>
      prev.map((svc) => (svc.id === id ? { ...svc, quantity: qty } : svc)),
    );
  };

  const updateSamples = (id: string, samples: number | "") => {
    setSelectedServices((prev) =>
      prev.map((svc) => (svc.id === id ? { ...svc, samples } : svc)),
    );
  };

  // for new price textbox
  const updatePrice = (id: string, price: number | "") => {
    const priceValue = typeof price === "number" ? price : 0;
    setSelectedServices((prev) =>
      prev.map((svc) => (svc.id === id ? { ...svc, price: priceValue } : svc)),
    );
  };

  const updateParticipants = (id: string, participants: number | "") => {
    setSelectedServices((prev) =>
      prev.map((svc) => (svc.id === id ? { ...svc, participants } : svc)),
    );
  };

  const handleQuotationSelect = (quote: QuotationRecord) => {
    // Sync pricing and formatting options from quotation
    if (typeof quote.isInternal === "boolean") {
      setIsInternal(quote.isInternal);
    }
    if (typeof quote.useAffiliationAsClientName === "boolean") {
      setUseAffiliationAsClientName(quote.useAffiliationAsClientName);
    }

    setSelectedServices((prev) => {
      const existingIds = new Set(prev.map((s) => s.id));
      const additions = quote.services
        .filter((s) => !existingIds.has(s.id))
        .map((s) => ({ ...s, quantity: (s.quantity as number) || 1 }));
      return [...prev, ...additions];
    });
  };

  const handleQuotationDeselect = (quote: QuotationRecord) => {
    // Reset flags when deselecting
    setIsInternal(false);
    setUseAffiliationAsClientName(false);
    setSelectedServices((prev) =>
      prev.filter((s) => !quote.services.some((qs) => qs.id === s.id)),
    );
  };
  const cleanedServices: StrictSelectedService[] = selectedServices
    .filter((s) => typeof s.quantity === "number" && s.quantity > 0)
    .map((s) => ({ ...s, quantity: s.quantity as number }));

  const subtotal = cleanedServices.reduce((sum, item) => {
    const serviceType = item.type.toLowerCase();

    if (
      serviceType.includes("bioinformatics") ||
      serviceType.includes("bioinfo")
    ) {
      // Use samples for bioinformatics
      const samples = (item as any).samples ?? 1;
      const samplesAmount = calculateItemTotal(samples, item.price, {
        minQuantity: (item as any).minQuantity,
        additionalUnitPrice: (item as any).additionalUnitPrice,
      });
      return sum + samplesAmount * item.quantity;
    } else if (serviceType.includes("training")) {
      // Use participants for training
      const participants = (item as any).participants ?? 1;
      const participantsAmount = calculateItemTotal(participants, item.price, {
        minQuantity: (item as any).minParticipants,
        additionalUnitPrice: (item as any).additionalParticipantPrice,
      });
      return sum + participantsAmount * item.quantity;
    } else {
      // Default calculation for other services
      return sum + item.price * item.quantity;
    }
  }, 0);
  const discount = isInternal ? subtotal * 0.12 : 0;
  const total = subtotal - discount;

  useEffect(() => {
    setClientInfo({
      name: client?.name || "Unknown Client",
      institution: client?.affiliation || "No Institution",
      designation: client?.designation || "No Designation",
      email: client?.email || "",
    });
  }, [client]);

  const groupedByType = useMemo(() => {
    const result: Record<string, ServiceItem[]> = {};
    const selectedIds = new Set(selectedServices.map((s) => s.id));

    for (const item of catalog) {
      // Filter by search
      const matchesSearch =
        !search || item.name.toLowerCase().includes(search.toLowerCase());
      // Filter by selected if showSelectedOnly is true
      const matchesFilter = !showSelectedOnly || selectedIds.has(item.id);

      if (matchesSearch && matchesFilter) {
        if (!result[item.type]) result[item.type] = [];
        result[item.type].push(item);
      }
    }
    return result;
  }, [search, catalog]);

  const renderTable = (services: ServiceItem[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>✔</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Qty</TableHead>
          <TableHead>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {services.map((item) => {
          const isSelected = selectedServices.find((s) => s.id === item.id);
          const quantity = isSelected?.quantity ?? "";
          const price = isSelected?.price ?? 0;
          const amount =
            isSelected && typeof quantity === "number" ? price * quantity : 0;
          // for new price textbox
          return (
            <TableRow key={item.id}>
              <TableCell>
                <Checkbox
                  checked={!!isSelected}
                  onCheckedChange={() => toggleService(item.id, item)}
                />
              </TableCell>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.unit}</TableCell>

              <TableCell>
                <Input
                  type="number"
                  value={price}
                  onChange={(e) =>
                    updateQuantity(item.id, Number(e.target.value))
                  }
                  className="w-24"
                  disabled={!isSelected}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) =>
                    updateQuantity(
                      item.id,
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  className="w-20"
                  disabled={!isSelected}
                />
              </TableCell>
              <TableCell className="text-right">
                ₱
                {amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  const normalizeCategory = (raw: string): string => {
    const lower = raw.toLowerCase();
    if (lower.includes("equipment")) return "equipment";
    if (lower.includes("lab")) return "laboratory";
    if (lower.includes("bioinformatics") || lower.includes("bioinfo"))
      return "bioinformatics";
    if (lower.includes("retail")) return "retail";
    if (lower.includes("training")) return "training";
    return lower; // fallback
  };

  const handleSaveAndDownload = async () => {
    setSaving(true);
    try {
      const rawRecord = {
        id: chargeSlipNumber,
        chargeSlipNumber,
        cid:
          (client as { cid?: string } | null | undefined)?.cid ||
          effectiveClientId,
        projectId: effectiveProjectId,
        client,
        project,
        services: cleanedServices,
        orNumber,
        useInternalPrice: isInternal,
        useAffiliationAsClientName,
        preparedBy: {
          name: adminInfo?.name || "—",
          position: adminInfo?.position || "—",
        },
        approvedBy: {
          name: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D",
          position: "AED, PGC Visayas",
        },
        referenceNumber: chargeSlipNumber,
        clientInfo,
        dateIssued: new Date().toISOString(),
        subtotal,
        discount,
        total,

        categories: Array.from(
          new Set(cleanedServices.map((s) => normalizeCategory(s.category))),
        ),
      };

      const record = sanitizeObject(rawRecord) as ChargeSlipRecord;

      // Save to Firestore and send email notification
      if (!adminInfo?.email) {
        toast.error("User authentication required to save charge slip");
        setSaving(false);
        return;
      }

      const result = await saveChargeSlipAction(record, {
        name: adminInfo.name || adminInfo.email!,
        email: adminInfo.email!,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to save charge slip");
      }

      const emailResult = await sendChargeSlipNotification(record);

      // Invalidate charge slip history to refresh the list
      queryClient.invalidateQueries({
        queryKey: ["chargeSlipHistory", effectiveProjectId],
      });

      if (emailResult.queued) {
        toast.success("Charge slip saved and billing email queued.");
      } else {
        toast.success("Charge slip saved successfully!");
        toast.error(
          `Charge slip saved, but the billing email could not be queued: ${emailResult.error}`,
        );
      }
      setOpenPreview(false);
      onSubmit?.(record);
    } catch (error) {
      console.error("Failed to save charge slip:", error);
      toast.error(
        `Failed to save charge slip: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 flex gap-6">
      {/* Left Column */}
      <div className="flex-[2] min-w-[520px]">
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-2">Build Charge Slip for:</h1>
          <Accordion type="single" collapsible defaultValue="client-info">
            <AccordionItem
              value="client-info"
              className="border rounded-lg overflow-hidden shadow-sm"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline bg-white text-base font-semibold">
                Client Information
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                <div className="pl-6 pr-4 pb-3">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground w-40">
                          Charge Slip Number
                        </td>
                        <td className="py-2 font-mono font-bold text-slate-700">
                          {chargeSlipNumber}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">
                          Client Name
                        </td>
                        <td className="py-2 font-semibold text-slate-900">
                          {clientInfo.name}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">
                          Institution
                        </td>
                        <td className="py-2 text-slate-700">
                          {clientInfo.institution}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">
                          Designation
                        </td>
                        <td className="py-2 text-slate-700">
                          {clientInfo.designation}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-muted-foreground">
                          Email
                        </td>
                        <td className="py-2 text-slate-700">
                          {clientInfo.email || "N/A"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={useAffiliationAsClientName}
                      onCheckedChange={(val) =>
                        setUseAffiliationAsClientName(!!val)
                      }
                    />
                    <span className="text-sm">
                      Display affiliation as client name in PDF
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      checked={isInternal}
                      onCheckedChange={(val) => setIsInternal(!!val)}
                    />
                    <span className="text-sm">
                      Internal Client (Apply 12% discount)
                    </span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="mb-4">
          <Label htmlFor="orNumber">OR Number</Label>
          <Input
            id="orNumber"
            placeholder="Enter OR Number"
            value={orNumber}
            onChange={(e) => setOrNumber(e.target.value)}
          />
        </div>

        <div className="flex gap-2 mb-4 items-center">
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

      {/* Right Summary Column */}
      <div className="flex-[1] min-w-[320px] max-w-[420px] shrink-0 sticky top-6 h-fit border p-4 rounded-md shadow-sm bg-white">
        <h3 className="text-lg font-bold mb-2">Summary</h3>
        <p className="text-sm text-muted-foreground mb-2">
          {cleanedServices.length}{" "}
          {cleanedServices.length === 1 ? "service" : "services"} selected
        </p>
        <Separator className="mb-2" />
        {cleanedServices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No services selected</p>
            <p className="text-xs mt-1">
              Select services from the list to continue
            </p>
          </div>
        ) : (
          <>
            {Object.entries(
              cleanedServices.reduce(
                (acc, item) => {
                  const category = item.category;
                  if (!acc[category]) acc[category] = [];
                  acc[category].push(item);
                  return acc;
                },
                {} as Record<string, typeof cleanedServices>,
              ),
            ).map(([category, items]) => (
              <div key={category} className="mb-3">
                <p className="text-xs font-semibold text-gray-600 uppercase mb-1">
                  {category} ({items.length})
                </p>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between text-sm mb-1 pl-2"
                  >
                    <span className="truncate">
                      {item.name} x {item.quantity}
                    </span>
                    <span className="font-medium">
                      ₱{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
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
              Preview Charge Slip
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Charge Slip Preview</DialogTitle>
            </DialogHeader>
            <div className="flex-1 bg-slate-100 rounded-md overflow-hidden min-h-[500px] mt-4">
              <PDFViewer width="100%" height="600">
                <ChargeSlipPDF
                  services={cleanedServices}
                  client={client as any}
                  project={project as any}
                  chargeSlipNumber={chargeSlipNumber}
                  orNumber={orNumber}
                  isInternal={isInternal}
                  useInternalPrice={isInternal}
                  useAffiliationAsClientName={useAffiliationAsClientName}
                  preparedBy={{
                    name: adminInfo?.name || "—",
                    position: adminInfo?.position || "—",
                  }}
                  referenceNumber={chargeSlipNumber}
                  clientInfo={clientInfo}
                  approvedBy={{
                    name: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D",
                    position: "AED, PGC Visayas",
                  }}
                  dateIssued={new Date().toISOString()}
                  subtotal={subtotal}
                  discount={discount}
                  total={total}
                />
              </PDFViewer>
            </div>
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
                  "Generate Final Charge Slip"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Separator className="my-6" />
        <ChargeSlipHistoryPanel projectId={effectiveProjectId} />
        {project?.iid && (
          <>
            <Separator className="my-6" />
            <QuotationHistoryPanel
              inquiryId={project.iid}
              showCheckboxes={true}
              onSelectQuotation={handleQuotationSelect}
              onDeselectQuotation={handleQuotationDeselect}
            />
          </>
        )}
      </div>
    </div>
  );
}

class ChargeSlipErrorBoundary extends React.Component<
  any,
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("ChargeSlipBuilder render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <h2 className="text-xl font-semibold text-red-600">
            Failed to load Charge Slip Builder
          </h2>
          <pre className="mt-4 text-sm text-gray-700 break-words">
            {String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ChargeSlipBuilder(props: any) {
  return (
    <ChargeSlipErrorBoundary>
      <ChargeSlipBuilderInner {...props} />
    </ChargeSlipErrorBoundary>
  );
}
