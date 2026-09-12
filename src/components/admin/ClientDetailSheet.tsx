"use client";

import { useEffect, useState } from "react";
import { Client } from "@/types/Client";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import { getChargeSlipsByClientId } from "@/services/chargeSlipService";
import { updateClient } from "@/services/updateClient";
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
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Receipt,
  User,
  Users,
  X,
  CheckCircle2,
  Circle,
  ShieldCheck,
  Ban,
} from "lucide-react";
import { logActivity } from "@/services/activityLogService";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { EditClientModal } from "@/components/forms/EditClientModal";

interface ClientDetailSheetProps {
  client: Client | null;
  open: boolean;
  onClose: () => void;
  onClientUpdated?: () => void;
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

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      {children}
    </section>
  );
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 py-2">
      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#166FB5] to-[#4038AF]" />
      <div className="flex items-center gap-1.5 text-slate-700">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
    </div>
  );
}

function formatDate(value?: string | Date) {
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

function formatChargeSlipDate(value?: any) {
  if (!value) return "—";
  // Handle Firestore Timestamp
  if (typeof value?.toDate === "function") {
    return value
      .toDate()
      .toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
  }
  const d = new Date(value);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

const sexLabel: Record<string, string> = {
  M: "Male",
  F: "Female",
  Other: "Other / Prefer not to say",
};

const csStatusColor: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  pending: "bg-blue-50 text-blue-700 border-blue-200",
};

export function ClientDetailSheet({
  client,
  open,
  onClose,
  onClientUpdated,
}: ClientDetailSheetProps) {
  const { adminInfo } = useAuth();
  const { canEdit } = usePermissions(adminInfo?.role);
  const [chargeSlips, setChargeSlips] = useState<ChargeSlipRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientStatus, setClientStatus] = useState<"Approved" | "Cancelled">(
    "Approved",
  );
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    if (!open || !client?.cid) return;

    // Sync status from client prop
    setClientStatus(client.status || "Approved");

    const loadData = async () => {
      setLoading(true);
      setChargeSlips([]);

      try {
        const cid = client.cid!;
        const [cs] = await Promise.all([
          getChargeSlipsByClientId(cid).catch(() => []),
        ]);
        setChargeSlips(cs as ChargeSlipRecord[]);

        await logActivity({
          userId: adminInfo?.email || "system",
          userEmail: adminInfo?.email || "system@pgc.admin",
          userName: adminInfo?.name || "System",
          action: "VIEW",
          entityType: "client",
          entityId: cid,
          entityName: client.name || cid,
          description: `Viewed client details: ${client.name || cid}`,
        });
      } catch (err) {
        console.error("Failed to load client documents:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.cid]);

  if (!client) return null;

  const pids = Array.isArray(client.pid)
    ? client.pid
    : client.pid
      ? [client.pid]
      : [];

  const handleStatusChange = async (newStatus: "Approved" | "Cancelled") => {
    if (!client.cid || newStatus === clientStatus) return;
    setStatusSaving(true);
    try {
      await updateClient(client.cid, { status: newStatus });
      setClientStatus(newStatus);
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "UPDATE",
        entityType: "client",
        entityId: client.cid,
        entityName: client.name || client.cid,
        description: `Updated client status to: ${newStatus}`,
        changesAfter: { status: newStatus },
        changedFields: ["status"],
      });
      onClientUpdated?.();
    } catch (err) {
      console.error("Failed to update client status:", err);
    } finally {
      setStatusSaving(false);
    }
  };

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
        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4">
          <SheetHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <SheetTitle className="text-xl font-bold bg-gradient-to-r from-[#166FB5] to-[#4038AF] bg-clip-text text-transparent">
                Client Details
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className="font-mono text-[#F69122] border-[#F69122]/30 bg-[#F69122]/5 text-xs"
                >
                  {client.cid}
                </Badge>
                {client.haveSubmitted && (
                  <Badge
                    variant="outline"
                    className="text-emerald-700 border-emerald-200 bg-emerald-50 text-xs"
                  >
                    Submitted
                  </Badge>
                )}
                {client.isContactPerson && (
                  <Badge
                    variant="outline"
                    className="text-purple-700 border-purple-200 bg-purple-50 text-xs"
                  >
                    Contact Person
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canEdit("clients") && (
                <EditClientModal
                  client={client}
                  onSuccess={() => {
                    onClose();
                    onClientUpdated?.();
                  }}
                />
              )}
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
          {/* ── Identity ── */}
          <SectionCard>
            <SectionHeader
              icon={<User className="h-4 w-4 text-[#166FB5]" />}
              label="Identity"
            />
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Full Name" value={client.name} />
              <InfoRow
                label="Sex"
                value={
                  client.sex ? (sexLabel[client.sex] ?? client.sex) : undefined
                }
              />
              <InfoRow label="Year" value={client.year?.toString()} />
              <InfoRow
                label="Registered"
                value={formatDate(client.createdAt)}
              />
            </div>
          </SectionCard>

          {/* ── Contact Information ── */}
          <SectionCard>
            <SectionHeader
              icon={<Mail className="h-4 w-4 text-indigo-600" />}
              label="Contact Information"
            />
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <InfoRow
                label="Email"
                value={
                  client.email ? (
                    <a
                      href={`mailto:${client.email}`}
                      className="text-blue-600 hover:underline text-sm break-all"
                    >
                      {client.email}
                    </a>
                  ) : undefined
                }
              />
              <InfoRow
                label="Phone"
                value={
                  client.phoneNumber ? (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3 text-slate-400" />
                      {client.phoneNumber}
                    </span>
                  ) : undefined
                }
              />
              <InfoRow label="Designation" value={client.designation} />
            </div>
          </SectionCard>

          {/* ── Affiliation ── */}
          <SectionCard>
            <SectionHeader
              icon={<Building2 className="h-4 w-4 text-emerald-600" />}
              label="Affiliation"
            />
            <Separator />
            <div className="grid grid-cols-1 gap-4">
              <InfoRow
                label="Institution / Affiliation"
                value={client.affiliation}
              />
              <InfoRow
                label="Affiliation Address"
                value={client.affiliationAddress}
              />
            </div>
          </SectionCard>

          {/* ── Status Flags ── */}
          <SectionCard>
            <SectionHeader
              icon={<CheckCircle2 className="h-4 w-4 text-violet-600" />}
              label="Account Status"
            />
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                {client.haveSubmitted ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300" />
                )}
                <span className="text-sm text-slate-700">
                  Has Submitted Inquiry
                </span>
              </div>
              <div className="flex items-center gap-2">
                {client.isContactPerson ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300" />
                )}
                <span className="text-sm text-slate-700">
                  Is Contact Person
                </span>
              </div>
            </div>
          </SectionCard>

          {/* ── Client Status ── */}
          <SectionCard>
            <SectionHeader
              icon={<ShieldCheck className="h-4 w-4 text-rose-600" />}
              label="Client Status"
            />
            <Separator />
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Set the current standing of this client account.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={statusSaving}
                  onClick={() => handleStatusChange("Approved")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                    clientStatus === "Approved"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow"
                      : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approved
                </button>
                <button
                  type="button"
                  disabled={statusSaving}
                  onClick={() => handleStatusChange("Cancelled")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                    clientStatus === "Cancelled"
                      ? "bg-rose-600 text-white border-rose-600 shadow"
                      : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                  }`}
                >
                  <Ban className="h-4 w-4" />
                  Cancelled
                </button>
                {statusSaving && (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                )}
              </div>
            </div>
          </SectionCard>

          {/* ── Linked Projects ── */}
          <SectionCard>
            <SectionHeader
              icon={<Briefcase className="h-4 w-4 text-orange-600" />}
              label={`Linked Projects (${pids.length})`}
            />
            <Separator />
            {pids.length === 0 ? (
              <p className="text-sm text-slate-400 italic">
                No linked projects
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pids.map((pid) => (
                  <a
                    key={pid}
                    href={`/admin/projects?search=${encodeURIComponent(pid)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-xs font-mono font-semibold text-[#166FB5] hover:bg-blue-100 transition-colors"
                  >
                    {pid}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── Charge Slips ── */}
          <SectionCard>
            <div className="flex items-center gap-2 py-2">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-[#166FB5] to-[#4038AF]" />
              <Receipt className="h-4 w-4 text-slate-700" />
              <span className="text-sm font-semibold text-slate-700">
                Charge Slips
              </span>
              {loading && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 ml-1" />
              )}
              {!loading && (
                <span className="text-[10px] text-slate-500">
                  ({chargeSlips.length})
                </span>
              )}
            </div>
            <Separator />

            {loading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading charge slips…
              </div>
            ) : chargeSlips.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No charge slips found for this client.
              </p>
            ) : (
              <div className="space-y-2">
                {chargeSlips.map((cs) => (
                  <div
                    key={cs.id}
                    className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 border border-slate-200"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-slate-700">
                          {cs.chargeSlipNumber}
                        </span>
                        {cs.status && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${
                              csStatusColor[cs.status] ??
                              "bg-gray-50 text-gray-600 border-gray-200"
                            }`}
                          >
                            {cs.status}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {cs.project?.pid && (
                          <span className="font-mono text-blue-600 mr-2">
                            {cs.project.pid}
                          </span>
                        )}
                        {formatChargeSlipDate((cs as any).dateIssued)}
                      </div>
                    </div>
                    <a
                      href={`/admin/charge-slips/${cs.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline shrink-0 mt-0.5"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── Metadata ── */}
          <SectionCard>
            <SectionHeader
              icon={<CalendarDays className="h-4 w-4 text-slate-500" />}
              label="Metadata"
            />
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <InfoRow
                label="Client ID (CID)"
                value={<span className="font-mono text-xs">{client.cid}</span>}
              />
              <InfoRow
                label="Record Created"
                value={formatDate(client.createdAt)}
              />
            </div>
          </SectionCard>
        </div>
      </SheetContent>
    </Sheet>
  );
}
