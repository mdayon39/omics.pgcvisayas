"use client";

import { useEffect, useState } from "react";
import { Project } from "@/types/Project";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { toast } from "sonner";

import { getChargeSlipsByProjectId } from "@/services/chargeSlipService";
import { getQuotationsByInquiryId } from "@/services/quotationService";
import { getInquiriesByIds } from "@/services/inquiryService";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import { QuotationRecord } from "@/types/Quotation";
import { Inquiry } from "@/types/Inquiry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  Loader2,
  Receipt,
  User,
  Users,
  X,
  ShieldEllipsis,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { logActivity } from "@/services/activityLogService";
import useAuth from "@/hooks/useAuth";
import { EditProjectModal } from "@/components/forms/EditProjectModal";
import AdminFormSubmissions from "@/components/admin/AdminFormSubmissions";
import AdminServiceReport from "@/components/admin/AdminServiceReport";

interface ProjectDetailSheetProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
  onProjectUpdated?: () => void;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className="text-sm font-medium text-slate-800">
        {value ?? <span className="text-slate-400 italic">—</span>}
      </span>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#166FB5] to-[#4038AF]" />
      <div className="flex items-center gap-1.5 text-slate-700">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {count !== undefined && (
        <span className="text-[10px] text-slate-500">({count})</span>
      )}
    </div>
  );
}

const statusColor: Record<string, string> = {
  Pending: "bg-blue-50 text-blue-700 border-blue-200",
  Ongoing: "bg-amber-50 text-amber-700 border-amber-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatDate(value?: Date | string) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectDetailSheet({
  project,
  open,
  onClose,
  onProjectUpdated,
}: ProjectDetailSheetProps) {
  const { adminInfo } = useAuth();

  const [quotations, setQuotations] = useState<QuotationRecord[]>([]);
  const [chargeSlips, setChargeSlips] = useState<ChargeSlipRecord[]>([]);
  const [linkedInquiries, setLinkedInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [
    allowServiceReportWithoutQuotation,
    setAllowServiceReportWithoutQuotation,
  ] = useState(Boolean(project?.allowServiceReportWithoutQuotation));
  const [
    allowServiceReportWithoutChargeSlip,
    setAllowServiceReportWithoutChargeSlip,
  ] = useState(Boolean(project?.allowServiceReportWithoutChargeSlip));
  const [updatingServiceReportSetting, setUpdatingServiceReportSetting] =
    useState(false);

  useEffect(() => {
    setAllowServiceReportWithoutQuotation(
      Boolean(project?.allowServiceReportWithoutQuotation),
    );
    setAllowServiceReportWithoutChargeSlip(
      Boolean(project?.allowServiceReportWithoutChargeSlip),
    );
  }, [
    project?.allowServiceReportWithoutQuotation,
    project?.allowServiceReportWithoutChargeSlip,
  ]);

  useEffect(() => {
    if (!open || !project?.pid) return;

    const loadDocs = async () => {
      setLoading(true);
      setQuotations([]);
      setChargeSlips([]);
      setLinkedInquiries([]);

      try {
        const pid = project.pid!;
        const iid = project.iid;
        const iids = Array.isArray(iid) ? iid : iid ? [iid] : [];

        const [qs, cs, inqs] = await Promise.all([
          iid
            ? getQuotationsByInquiryId(iid).catch(() => [])
            : Promise.resolve([]),
          getChargeSlipsByProjectId(pid).catch(() => []),
          iids.length > 0
            ? getInquiriesByIds(iids).catch(() => [])
            : Promise.resolve([]),
        ]);

        setQuotations(qs as QuotationRecord[]);
        setChargeSlips(cs as ChargeSlipRecord[]);
        setLinkedInquiries(inqs as Inquiry[]);

        // Log view
        await logActivity({
          userId: adminInfo?.email || "system",
          userEmail: adminInfo?.email || "system@pgc.admin",
          userName: adminInfo?.name || "System",
          action: "VIEW",
          entityType: "project",
          entityId: pid,
          entityName: project.title || pid,
          description: `Viewed project details: ${project.title || pid}`,
        });
      } catch (err) {
        console.error("Failed to load project documents:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project?.pid]);

  const handleToggleServiceReportWithoutQuotation = async (
    checked: boolean,
  ) => {
    if (!project?.pid) return;

    setUpdatingServiceReportSetting(true);
    setAllowServiceReportWithoutQuotation(checked);

    try {
      await updateDoc(doc(db, "projects", project.pid), {
        allowServiceReportWithoutQuotation: checked,
        serviceReportToggleEnabledBy:
          checked && adminInfo?.name
            ? adminInfo.name
            : project.serviceReportToggleEnabledBy || null,
        serviceReportToggleEnabledByEmail:
          checked && adminInfo?.email
            ? adminInfo.email
            : project.serviceReportToggleEnabledByEmail || null,
      });
    } catch (error) {
      console.error(
        "Failed to update service report attachment setting:",
        error,
      );
      setAllowServiceReportWithoutQuotation(!checked);
      toast.error("Could not update the service report setting.");
    } finally {
      setUpdatingServiceReportSetting(false);
    }
  };

  const handleToggleServiceReportException = async (
    field: "allowServiceReportWithoutChargeSlip",
    checked: boolean,
    setChecked: (value: boolean) => void,
  ) => {
    if (!project?.pid) return;

    setUpdatingServiceReportSetting(true);
    setChecked(checked);
    try {
      await updateDoc(doc(db, "projects", project.pid), { [field]: checked });
    } catch (error) {
      console.error("Failed to update service report exception:", error);
      setChecked(!checked);
      toast.error("Could not update the service report setting.");
    } finally {
      setUpdatingServiceReportSetting(false);
    }
  };

  if (!project) return null;

  const iids = Array.isArray(project.iid)
    ? project.iid
    : project.iid
      ? [project.iid]
      : [];
  const status = project.status ?? "Pending";
  const hasApprovedInquiry = linkedInquiries.some(
    (inq) => inq.status === "Approved Client",
  );
  const hasEligibleChargeSlip = chargeSlips.some((chargeSlip) => {
    const chargeSlipStatus = (chargeSlip.status ?? "").trim().toLowerCase();
    return chargeSlipStatus === "paid" || chargeSlipStatus === "waived";
  });
  const hasSelectedQuotation = quotations.some(
    (q) => (q.status ?? "").toLowerCase() === "selected",
  );
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0 border-l shadow-2xl"
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4">
          <SheetHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <SheetTitle className="text-xl font-bold bg-gradient-to-r from-[#166FB5] to-[#4038AF] bg-clip-text text-transparent">
                Project Details
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="font-mono text-[#F69122] border-[#F69122]/30 bg-[#F69122]/5 text-xs"
                >
                  {project.pid}
                </Badge>
                <Badge
                  className={`text-xs border ${statusColor[status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}
                  variant="outline"
                >
                  {status}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <EditProjectModal
                project={project}
                onSuccess={() => {
                  onClose();
                  onProjectUpdated?.();
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── Project Overview ── */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <SectionHeader
              icon={<Briefcase className="h-4 w-4 text-[#166FB5]" />}
              label="Project Overview"
            />
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Year" value={project.year?.toString()} />
              <InfoRow
                label="Start Date"
                value={formatDate(project.startDate)}
              />
              <InfoRow label="Project Tag" value={project.projectTag} />
            </div>
            <InfoRow
              label="Project Title"
              value={<span className="text-sm">{project.title}</span>}
            />
            {project.notes && (
              <InfoRow
                label="Notes"
                value={
                  <span className="text-sm text-slate-600">
                    {project.notes}
                  </span>
                }
              />
            )}
          </section>

          {/* ── People ── */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <SectionHeader
              icon={<Users className="h-4 w-4 text-indigo-600" />}
              label="People"
            />
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Project Lead" value={project.lead} />
              <InfoRow
                label="Personnel Assigned"
                value={project.personnelAssigned}
              />
            </div>
            {(project.clientNames?.length ?? 0) > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Clients / Members
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {project.clientNames!.map((name, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-medium text-indigo-700"
                    >
                      <User className="h-3 w-3" />
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Institution & Funding ── */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <SectionHeader
              icon={<Building2 className="h-4 w-4 text-emerald-600" />}
              label="Institution & Funding"
            />
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <InfoRow
                label="Sending Institution"
                value={project.sendingInstitution}
              />
              <InfoRow
                label="Funding Category"
                value={project.fundingCategory}
              />
              <InfoRow
                label="Funding Institution"
                value={project.fundingInstitution}
              />
              <InfoRow
                label="Created At"
                value={formatDate(project.createdAt)}
              />
            </div>
          </section>

          {/* ── Services Requested ── */}
          {(project.serviceRequested?.length ?? 0) > 0 && (
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <SectionHeader
                icon={<Briefcase className="h-4 w-4 text-orange-600" />}
                label="Services Requested"
                count={project.serviceRequested!.length}
              />
              <Separator />
              <div className="flex flex-wrap gap-2">
                {project.serviceRequested!.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="text-orange-700 border-orange-200 bg-orange-50 text-xs"
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* ── Documents ── */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
            <div className="flex items-center gap-2 py-2">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#166FB5] to-[#4038AF]" />
              <FileText className="h-4 w-4 text-slate-700" />
              <span className="text-sm font-semibold text-slate-700">
                Documents
              </span>
              {loading && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 ml-1" />
              )}
            </div>
            <Separator />

            {loading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading documents…
              </div>
            ) : (
              <div className="space-y-5">
                {/* Inquiries - always above Quotations */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="h-3.5 w-3.5 text-purple-600" />
                    <span className="text-xs font-semibold text-slate-700">
                      Inquiries
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({linkedInquiries.length})
                    </span>
                  </div>
                  {linkedInquiries.length === 0 ? (
                    <p className="text-xs text-slate-400 ml-5">
                      No linked inquiries
                    </p>
                  ) : (
                    <div className="space-y-1 ml-5">
                      {linkedInquiries.map((inq) => {
                        const inqStatus = inq.status ?? "Pending";
                        const inqColor =
                          inqStatus === "Approved Client"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : inqStatus === "Cancelled"
                              ? "bg-rose-50 border-rose-200 text-rose-700"
                              : inqStatus === "Ongoing Quotation"
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-blue-50 border-blue-200 text-blue-700";
                        return (
                          <div
                            key={inq.id}
                            className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0"
                          >
                            <a
                              href={`/admin/inquiry/${inq.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-blue-600 hover:underline hover:text-blue-700"
                            >
                              {inq.id}
                            </a>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${inqColor}`}
                            >
                              {inqStatus}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Quotations */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="h-3.5 w-3.5 text-purple-600" />
                    <span className="text-xs font-semibold text-slate-700">
                      Quotations
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({quotations.length})
                    </span>
                  </div>
                  {quotations.length === 0 ? (
                    <p className="text-xs text-slate-400 ml-5">No quotations</p>
                  ) : (
                    <div className="space-y-1 ml-5">
                      {quotations.map((q) => (
                        <div
                          key={q.id}
                          className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0"
                        >
                          <a
                            href={`/admin/quotations/${q.referenceNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-blue-600 hover:underline hover:text-blue-700"
                          >
                            {q.referenceNumber}
                          </a>
                          {q.selectedForProject && q.status !== "cancelled" ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium shrink-0">
                              Selected
                            </span>
                          ) : q.status === "cancelled" ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-medium shrink-0">
                              Cancelled
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Client Form Submissions — admin acknowledge */}
                {project.pid && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <FileText className="h-3.5 w-3.5 text-orange-500" />
                      <span className="text-xs font-semibold text-slate-700">
                        Uploaded Completed Submission Forms
                      </span>
                    </div>
                    <AdminFormSubmissions projectId={project.pid} />
                  </div>
                )}

                {/* Charge Slips */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Receipt className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-xs font-semibold text-slate-700">
                      Charge Slips
                    </span>
                    <span className="text-[10px] text-slate-500">
                      ({chargeSlips.length})
                    </span>
                  </div>
                  {chargeSlips.length === 0 ? (
                    <p className="text-xs text-slate-400 ml-5">
                      No charge slips
                    </p>
                  ) : (
                    <div className="space-y-1 ml-5">
                      {chargeSlips.map((cs) => {
                        const csStatus = (cs.status ?? "").toLowerCase();
                        const csBadge =
                          csStatus === "paid"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : csStatus === "validated"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : csStatus === "pending"
                                ? "bg-blue-50 border-blue-200 text-blue-700"
                                : csStatus === "cancelled"
                                  ? "bg-rose-50 border-rose-200 text-rose-700"
                                  : csStatus === "waived"
                                    ? "bg-purple-50 border-purple-200 text-purple-700"
                                    : "bg-amber-50 border-amber-200 text-amber-700"; // processing / default
                        const csLabel =
                          csStatus === "paid"
                            ? "Paid"
                            : csStatus === "validated"
                              ? "Validated"
                              : csStatus === "pending"
                                ? "Pending"
                                : csStatus === "cancelled"
                                  ? "Cancelled"
                                  : csStatus === "waived"
                                    ? "Waived"
                                    : "Processing";
                        return (
                          <div
                            key={cs.id}
                            className="flex items-center gap-2 py-1 border-b border-slate-50 last:border-0"
                          >
                            <a
                              href={`/admin/charge-slips/${cs.chargeSlipNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-blue-600 hover:underline hover:text-blue-700"
                            >
                              {cs.chargeSlipNumber}
                            </a>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${csBadge}`}
                            >
                              {csLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Service Reports — admin uploads */}
                {project.pid && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <ShieldEllipsis className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-semibold text-slate-700">
                        Service Reports
                      </span>
                    </div>
                    <div className="ml-5 mb-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
                      <p className="text-[11px] leading-snug text-slate-500">
                        Enable a toggle only when the corresponding prerequisite
                        is intentionally being skipped for this project.
                      </p>
                      {quotations.length === 0 && (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-slate-700">
                              Skip quotation requirement
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Allow upload without a quotation
                            </p>
                          </div>
                          <Switch
                            checked={allowServiceReportWithoutQuotation}
                            onCheckedChange={
                              handleToggleServiceReportWithoutQuotation
                            }
                            disabled={
                              !project.pid || updatingServiceReportSetting
                            }
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-700">
                            Skip charge-slip requirement
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Allow upload without a charge slip.
                          </p>
                        </div>
                        <Switch
                          checked={allowServiceReportWithoutChargeSlip}
                          onCheckedChange={(checked) =>
                            handleToggleServiceReportException(
                              "allowServiceReportWithoutChargeSlip",
                              checked,
                              setAllowServiceReportWithoutChargeSlip,
                            )
                          }
                          disabled={
                            !project.pid || updatingServiceReportSetting
                          }
                        />
                      </div>
                    </div>
                    <AdminServiceReport
                      projectId={project.pid}
                      clientEmail={
                        chargeSlips[0]?.clientInfo?.email ??
                        quotations[0]?.email
                      }
                      clientName={
                        chargeSlips[0]?.clientInfo?.name ?? quotations[0]?.name
                      }
                      chargeSlips={chargeSlips}
                      linkedInquiries={linkedInquiries}
                      quotations={quotations}
                      allowWithoutQuotation={allowServiceReportWithoutQuotation}
                      allowWithoutChargeSlip={
                        allowServiceReportWithoutChargeSlip
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── Metadata ── */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
            <SectionHeader
              icon={<CalendarDays className="h-4 w-4 text-slate-500" />}
              label="Metadata"
            />
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <InfoRow
                label="Project ID (PID)"
                value={<span className="font-mono text-xs">{project.pid}</span>}
              />
              <InfoRow
                label="Record Created"
                value={formatDate(project.createdAt)}
              />
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
