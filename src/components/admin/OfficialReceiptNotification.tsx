"use client";

/**
 * OfficialReceiptNotification
 *
 * Displays a notification panel for admins listing all unacknowledged official
 * receipts across all projects. Admins can view each receipt and acknowledge it,
 * which locks it from client-side deletion.
 */

import React, { useEffect, useState } from "react";
import {
  collectionGroup,
  query,
  where,
  onSnapshot,
  updateDoc,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Bell,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { logActivity } from "@/services/activityLogService";
import { getChargeSlipsByProjectId, updateChargeSlip } from "@/services/chargeSlipService";
import useAuth from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface PendingReceipt {
  id: string;
  projectId: string;
  fileName?: string;
  downloadURL?: string;
  orNumber?: string;
  orDate?: string;
  uploadedBy?: string;
  uploadedAt?: Timestamp;
  size?: number;
  returnedByAdmin?: boolean;
}

function formatDate(ts?: Timestamp) {
  if (!ts) return "";
  try {
    return format(ts.toDate(), "MMM d, yyyy");
  } catch {
    return "";
  }
}

export function OfficialReceiptNotification() {
  const { adminInfo } = useAuth();
  const [pending, setPending] = useState<PendingReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);

  useEffect(() => {
    // Listen to all officialReceipts sub-collections where acknowledgedByAdmin is false
    const q = query(
      collectionGroup(db, "officialReceipts"),
      where("acknowledgedByAdmin", "==", false),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: PendingReceipt[] = snap.docs.map((d) => {
          // Parent path: projects/{projectId}/officialReceipts/{receiptId}
          const projectId = d.ref.parent.parent?.id ?? "";
          return { id: d.id, projectId, ...d.data() } as PendingReceipt;
        });
        setPending(items);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsub();
  }, []);

  const handleReturn = async (receipt: PendingReceipt) => {
    setReturning(receipt.id);
    try {
      await updateDoc(
        doc(db, "projects", receipt.projectId, "officialReceipts", receipt.id),
        { returnedByAdmin: true },
      );
      await logActivity({
        userId: adminInfo?.email || "admin",
        userEmail: adminInfo?.email || "admin",
        userName: adminInfo?.name || "Admin",
        action: "UPDATE",
        entityType: "project",
        entityId: receipt.projectId,
        description: `Returned official receipt for correction: ${receipt.fileName || receipt.id}`,
      });

      // Update the canonical record in 'receipts' collection to show 'returned'
      const orFullId = receipt.orNumber?.trim()
        ? `OR-${receipt.orNumber.trim().replace(/\s+/g, "-")}`
        : `OR-${receipt.projectId}-${receipt.id}`;
      await updateDoc(doc(db, "receipts", orFullId), {
        uploadStatus: "returned",
        returnedDate: serverTimestamp(),
      });

      toast.success("Receipt returned to client for correction.");
    } catch {
      toast.error("Failed to return receipt.");
    } finally {
      setReturning(null);
    }
  };

  const handleAcknowledge = async (receipt: PendingReceipt) => {
    setAcknowledging(receipt.id);
    try {
      // 1. Mark as acknowledged in the sub-collection
      await updateDoc(
        doc(db, "projects", receipt.projectId, "officialReceipts", receipt.id),
        { acknowledgedByAdmin: true },
      );

      // 2. Update all processing charge slips for this project to Paid
      const chargeSlips = await getChargeSlipsByProjectId(receipt.projectId);
      for (const cs of chargeSlips) {
        if (cs.id && cs.status !== "paid" && cs.status !== "cancelled") {
          const orDateVal = receipt.orDate
            ? Timestamp.fromDate(new Date(receipt.orDate))
            : cs.dateOfOR;
          await updateChargeSlip(cs.id, {
            status: "paid",
            orNumber: cs.orNumber || receipt.orNumber,
            dateOfOR: orDateVal,
          }, {
            email: adminInfo?.email || "",
            name: adminInfo?.name,
            role: adminInfo?.role,
          });
        }
      }

      // 3. (Optional) We no longer need to write the whole setDoc here if the client already wrote it.
      // But we update the status to 'validated'.
      // Redundant code removed to keep it clean.
      
      await logActivity({
        userId: adminInfo?.email || "admin",
        userEmail: adminInfo?.email || "admin",
        userName: adminInfo?.name || "Admin",
        action: "UPDATE",
        entityType: "project",
        entityId: receipt.projectId,
        description: `Acknowledged official receipt: ${receipt.fileName || receipt.id} (OR No. ${receipt.orNumber || "—"})`,
      });

      // 4. Update the canonical record to 'validated'
      const orFullId = receipt.orNumber?.trim()
        ? `OR-${receipt.orNumber.trim().replace(/\s+/g, "-")}`
        : `OR-${receipt.projectId}-${receipt.id}`;
      
      await setDoc(doc(db, "receipts", orFullId), {
        uploadStatus: "validated",
        validatedBy: adminInfo?.email ?? "admin",
        validatedDate: serverTimestamp(),
        // Ensure critical fields exist even if setDoc on client failed
        orId: orFullId,
        projectId: receipt.projectId,
        orNo: receipt.orNumber?.trim() || null,
        orDate: receipt.orDate || null,
        receiptDocId: receipt.id,
      }, { merge: true });

      toast.success("Receipt acknowledged successfully.");
    } catch (err) {
      console.error("Acknowledge failed:", err);
      toast.error("Failed to acknowledge receipt. Please try again.");
    } finally {
      setAcknowledging(null);
    }
  };

  const count = pending.length;

  return (
    <div className="relative">
      {/* Bell trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition-colors"
        title="Official Receipt notifications"
        aria-label="Official Receipt notifications"
      >
        <Bell className="h-4 w-4 text-slate-600" />
        {!loading && count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-9 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-800">
                  Official Receipts
                </h3>
                {count > 0 && (
                  <Badge className="h-4 px-1.5 text-[9px] bg-red-100 text-red-600 border-red-200 hover:bg-red-100">
                    {count} pending
                  </Badge>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-50">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : count === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
                  <CheckCircle2 className="h-8 w-8 text-emerald-300" />
                  <p className="text-sm font-medium">All receipts acknowledged</p>
                </div>
              ) : (
                pending.map((receipt) => (
                  <div
                    key={receipt.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-[12px] font-semibold text-slate-700 truncate">
                        {receipt.fileName || receipt.id}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Project:{" "}
                        <span className="font-medium text-slate-700">
                          {receipt.projectId}
                        </span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        OR No.:{" "}
                        <span className="font-medium text-slate-700">
                          {receipt.orNumber || "—"}
                        </span>{" "}
                        · Date:{" "}
                        <span className="font-medium text-slate-700">
                          {receipt.orDate || "—"}
                        </span>
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Uploaded by {receipt.uploadedBy || "—"} ·{" "}
                        {formatDate(receipt.uploadedAt)}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        {receipt.downloadURL && (
                          <a
                            href={receipt.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:underline"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            View file
                          </a>
                        )}
                        <Button
                          size="sm"
                          disabled={returning === receipt.id || acknowledging === receipt.id}
                          onClick={() => handleReturn(receipt)}
                          variant="outline"
                          className="h-6 text-[10px] px-2 border-rose-200 text-rose-600 hover:bg-rose-50 gap-1"
                        >
                          {returning === receipt.id ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-2.5 w-2.5" />
                          )}
                          Return
                        </Button>
                        <Button
                          size="sm"
                          disabled={acknowledging === receipt.id || returning === receipt.id}
                          onClick={() => handleAcknowledge(receipt)}
                          className="h-6 text-[10px] px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        >
                          {acknowledging === receipt.id ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          )}
                          Acknowledge
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
