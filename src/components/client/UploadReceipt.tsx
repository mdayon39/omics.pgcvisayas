"use client";

import React, { useState, useEffect, useRef } from "react";
import { uploadFile } from "@/lib/fileUpload";
import { db, storage } from "@/lib/firebase";
import {
  collection,
  addDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  query,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";
import { logActivity } from "@/services/activityLogService";
import { updateChargeSlip } from "@/services/chargeSlipService";
import {
  FileText,
  Loader2,
  Paperclip,
  X,
  Upload,
  Lock,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Receipt {
  id: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  downloadURL?: string;
  uploadedBy?: string;
  uploadedAt?: Timestamp;
  orNumber?: string;
  orDate?: string;
  acknowledgedByAdmin?: boolean;
  returnedByAdmin?: boolean;
  chargeSlipNumber?: string;
  acknowledgedAt?: Timestamp | null;
}

interface UploadReceiptProps {
  projectId: string;
  hasChargeSlip: boolean;
  referenceClientDesign?: boolean;
  /** When provided, only show/upload receipts for this specific charge slip */
  chargeSlipNumber?: string;
  /** When false, hides upload controls — receipts are shown as read-only reference (e.g. for paid slips) */
  uploadAllowed?: boolean;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts?: Timestamp) {
  if (!ts) return "";
  try {
    return format(ts.toDate(), "MMM d, yyyy");
  } catch {
    return "";
  }
}

/** Extract the Firebase Storage path from a download URL for deletion. */
function extractStoragePath(url: string): string | null {
  try {
    const match = url.match(/\/o\/(.+?)(?:\?|$)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export default function UploadReceipt({
  projectId,
  hasChargeSlip,
  chargeSlipNumber: csNum,
  uploadAllowed = true,
  referenceClientDesign = false,
}: UploadReceiptProps) {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [orNumber, setOrNumber] = useState("");
  const [orDate, setOrDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Replace-on-return state
  const [replacingId, setReplacingId] = useState<string | null>(null); // receipt being replaced
  const [replacePendingFile, setReplacePendingFile] = useState<File | null>(
    null,
  );
  const [replaceOrNumber, setReplaceOrNumber] = useState("");
  const [replaceOrDate, setReplaceOrDate] = useState("");
  const [replaceUploading, setReplaceUploading] = useState(false);
  const [replaceSelecting, setReplaceSelecting] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (
      !projectId ||
      projectId === "DRAFT" ||
      projectId.startsWith("PENDING-")
    ) {
      setLoadingReceipts(false);
      return;
    }
    const q = query(
      collection(db, "projects", projectId, "officialReceipts"),
      orderBy("uploadedAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setReceipts(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Receipt),
        );
        setLoadingReceipts(false);
      },
      () => setLoadingReceipts(false),
    );
    return () => unsub();
  }, [projectId]);

  // Scope receipts to the active charge slip when one is provided
  const visibleReceipts = csNum
    ? receipts.filter((r) => r.chargeSlipNumber === csNum)
    : receipts;

  // View-only mode (e.g. paid slip): hide upload controls; if no receipts, render nothing
  if (!uploadAllowed && !loadingReceipts && visibleReceipts.length === 0)
    return null;

  // Locked if any receipt is awaiting admin action (not yet acknowledged and not returned)
  const hasPendingReceipt = visibleReceipts.some(
    (r) => !r.acknowledgedByAdmin && !r.returnedByAdmin,
  );
  const verifiedCount = visibleReceipts.filter(
    (r) => r.acknowledgedByAdmin,
  ).length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelecting(false);
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 10 MB.");
      return;
    }
    if (f.type !== "application/pdf" && !f.type.startsWith("image/")) {
      toast.error("Only PDF and image files are allowed.");
      return;
    }
    setPendingFile(f);
    setOrNumber("");
    setOrDate("");
  };

  const handleCancelPending = () => {
    setPendingFile(null);
    setOrNumber("");
    setOrDate("");
  };

  /** Cancel in-progress replace for a returned receipt */
  const handleCancelReplace = () => {
    setReplacingId(null);
    setReplacePendingFile(null);
    setReplaceOrNumber("");
    setReplaceOrDate("");
  };

  /** File picker callback for the replace flow */
  const handleReplaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReplaceSelecting(false);
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 10 MB.");
      return;
    }
    if (f.type !== "application/pdf" && !f.type.startsWith("image/")) {
      toast.error("Only PDF and image files are allowed.");
      return;
    }
    setReplacePendingFile(f);
    setReplaceOrNumber("");
    setReplaceOrDate("");
  };

  /** Upload a replacement file and overwrite the returned receipt document */
  const handleReplaceUpload = async (receipt: Receipt) => {
    if (!replacePendingFile) return;
    if (!replaceOrNumber.trim()) {
      toast.error("Please enter the OR Number before uploading.");
      return;
    }
    if (!replaceOrDate) {
      toast.error("Please select the OR Date before uploading.");
      return;
    }
    setReplaceUploading(true);
    try {
      // Upload new file
      const folder = csNum
        ? `receipts/${projectId}/${csNum}`
        : `receipts/${projectId}`;
      const downloadURL = await uploadFile(replacePendingFile, folder);
      // Overwrite the existing Firestore receipt doc (same ID — no new document)
      const receiptRef = doc(
        db,
        "projects",
        projectId,
        "officialReceipts",
        receipt.id,
      );
      await updateDoc(receiptRef, {
        fileName: replacePendingFile.name,
        contentType: replacePendingFile.type,
        size: replacePendingFile.size,
        downloadURL,
        uploadedAt: serverTimestamp(),
        orNumber: replaceOrNumber.trim(),
        orDate: replaceOrDate,
        acknowledgedByAdmin: false,
        returnedByAdmin: false,
      });

      // Update the canonical record in top-level 'receipts' collection
      const orId = replaceOrNumber.trim()
        ? `OR-${replaceOrNumber.trim().replace(/\s+/g, "-")}`
        : `OR-${projectId}-${receipt.id}`;
      await setDoc(
        doc(db, "receipts", orId),
        {
          orId,
          projectId,
          date: serverTimestamp(),
          orNo: replaceOrNumber.trim() || null,
          orDate: replaceOrDate || null,
          uploadStatus: "pending_validation",
          fileLink: downloadURL,
          uploadedBy: user?.email || "anonymous",
          receiptDocId: receipt.id,
        },
        { merge: true },
      );

      // Delete the old file from Firebase Storage
      if (receipt.downloadURL) {
        const oldPath = extractStoragePath(receipt.downloadURL);
        if (oldPath) {
          try {
            await deleteObject(storageRef(storage, oldPath));
          } catch {
            /* non-critical */
          }
        }
      }
      // Mark the charge slip as having a pending OR again after replacement
      if (csNum) {
        try {
          await updateDoc(doc(db, "chargeSlips", csNum), {
            orStatus: "Pending",
            status: "pending",
          });
        } catch {
          /* non-critical */
        }
      }

      await logActivity({
        userId: user?.email || "anonymous",
        userEmail: user?.email || "anonymous",
        userName: user?.displayName || "Client",
        action: "UPDATE",
        entityType: "project",
        entityId: projectId,
        description: `Replaced returned receipt: ${replacePendingFile.name} (OR No. ${replaceOrNumber.trim()})`,
      });
      toast.success(
        "Receipt replaced successfully. Awaiting admin validation.",
      );
      handleCancelReplace();
    } catch (err) {
      console.error("Replace upload failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      setReplaceUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    if (!orNumber.trim()) {
      toast.error("Please enter the OR Number before uploading.");
      return;
    }
    if (!orDate) {
      toast.error("Please select the OR Date before uploading.");
      return;
    }
    setUploading(true);
    try {
      // Store under receipts/{projectId}/{chargeSlipNumber} for easy identification
      const folder = csNum
        ? `receipts/${projectId}/${csNum}`
        : `receipts/${projectId}`;
      const downloadURL = await uploadFile(pendingFile, folder);
      const newReceiptRef = await addDoc(
        collection(db, "projects", projectId, "officialReceipts"),
        {
          fileName: pendingFile.name,
          contentType: pendingFile.type,
          size: pendingFile.size,
          downloadURL,
          uploadedBy: user?.email || "anonymous",
          uploadedAt: serverTimestamp(),
          orNumber: orNumber.trim(),
          orDate,
          acknowledgedByAdmin: false,
          returnedByAdmin: false,
          ...(csNum ? { chargeSlipNumber: csNum } : {}),
        },
      );

      // Also write to the canonical 'receipts' top-level collection
      const orId = orNumber.trim()
        ? `OR-${orNumber.trim().replace(/\s+/g, "-")}`
        : `OR-${projectId}-${newReceiptRef.id}`;
      await setDoc(
        doc(db, "receipts", orId),
        {
          orId,
          projectId,
          date: serverTimestamp(),
          orNo: orNumber.trim() || null,
          orDate: orDate || null,
          uploadStatus: "pending_validation",
          fileLink: downloadURL,
          uploadedBy: user?.email || "anonymous",
          receiptDocId: newReceiptRef.id,
        },
        { merge: true },
      );

      // Mark the charge slip as having a pending OR (awaiting admin validation)
      if (csNum) {
        try {
          await updateDoc(doc(db, "chargeSlips", csNum), {
            orStatus: "Pending",
            status: "pending",
          });
        } catch {
          /* non-critical */
        }
      }

      await logActivity({
        userId: user?.email || "anonymous",
        userEmail: user?.email || "anonymous",
        userName: user?.displayName || "Client",
        action: "CREATE",
        entityType: "project",
        entityId: projectId,
        description: `Uploaded official receipt: ${pendingFile.name} (OR No. ${orNumber.trim()})`,
      });
      toast.success(
        "Receipt uploaded successfully. Awaiting admin validation.",
      );

      // === EMAIL NOTIFICATION ===
      // Notify receipt notification recipients (non-blocking, non-critical)
      if (csNum) {
        try {
          const [csSnap, configSnap] = await Promise.all([
            getDoc(doc(db, "chargeSlips", csNum)),
            getDoc(doc(db, "settings", "appConfig")),
          ]);

          const csData = csSnap.exists()
            ? (csSnap.data() as Record<string, any>)
            : null;
          const configData = configSnap.exists()
            ? (configSnap.data() as Record<string, any>)
            : null;
          const recipients: string[] =
            Array.isArray(configData?.receiptNotifications) &&
            configData.receiptNotifications.length > 0
              ? configData.receiptNotifications
              : ["madayon1@up.edu.ph"];

          if (csData) {
            const clientName =
              csData.clientInfo?.name || user?.displayName || "Client";
            const clientEmail = csData.clientInfo?.email || "";
            const affiliation = csData.clientInfo?.institution || "";
            const designation = csData.clientInfo?.designation || "";
            const total: number = csData.total || 0;
            const services: any[] = csData.services || [];

            const servicesHtml = services.length
              ? services
                  .map(
                    (s: any) => `
                <tr>
                  <td style="padding: 4px 0; color: #334155;">${s.name || "—"}</td>
                  <td style="padding: 4px 0; text-align: right; color: #334155;">${s.quantity ?? 1}</td>
                  <td style="padding: 4px 0; text-align: right; color: #334155;">&#8369;${(s.price ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                </tr>`,
                  )
                  .join("")
              : `<tr><td colspan="3" style="color: #94a3b8; font-style: italic;">No services listed</td></tr>`;

            const emailHtml = `
              <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.5;">
                <div style="background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                  <h2 style="color: #1e40af; margin-top: 0; font-size: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                    New Receipt Uploaded from ${clientName}
                  </h2>

                  <div style="margin: 20px 0;">
                    <p style="margin: 5px 0;"><strong>Name:</strong> ${clientName}</p>
                    <p style="margin: 5px 0;"><strong>Email:</strong> ${clientEmail}</p>
                    <p style="margin: 5px 0;"><strong>Affiliation:</strong> ${affiliation}</p>
                    <p style="margin: 5px 0;"><strong>Designation:</strong> ${designation}</p>
                  </div>

                  <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; margin: 20px 0;">
                    <h3 style="margin-top: 0; font-size: 16px; color: #1e40af;">Service Details</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                      <thead>
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                          <th style="padding: 4px 0; text-align: left; color: #64748b; font-weight: 600;">Service</th>
                          <th style="padding: 4px 0; text-align: right; color: #64748b; font-weight: 600;">Qty</th>
                          <th style="padding: 4px 0; text-align: right; color: #64748b; font-weight: 600;">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${servicesHtml}
                      </tbody>
                    </table>

                    <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #e2e8f0; text-align: right;">
                      <p style="margin: 0; font-size: 16px; font-weight: 700; color: #1e40af;">
                        Amount Paid: &#8369;${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div style="background-color: #f0fdf4; padding: 12px 15px; border-radius: 6px; border: 1px solid #bbf7d0; margin: 20px 0; font-size: 13px;">
                    <p style="margin: 3px 0;"><strong>Charge Slip No.:</strong> ${csNum}</p>
                    <p style="margin: 3px 0;"><strong>Project ID:</strong> ${projectId}</p>
                    <p style="margin: 3px 0;"><strong>OR Number:</strong> ${orNumber.trim()}</p>
                    <p style="margin: 3px 0;"><strong>OR Date:</strong> ${orDate}</p>
                    ${downloadURL ? `<p style="margin: 3px 0;"><a href="${downloadURL}" style="color: #1e40af; font-weight: 600;">View Uploaded Receipt</a></p>` : ""}
                  </div>

                  <div style="margin-top: 20px;">
                    <a href="https://omics.pgcvisayas.upv.edu.ph/admin/charge-slips/${csNum}" style="background-color: #1e40af; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 600; font-size: 14px;">Review in Admin Panel</a>
                  </div>

                  <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
                    <p style="margin: 2px 0;">Submitted: ${new Date().toLocaleString()}</p>
                  </div>
                </div>
              </div>
            `;

            const emailText = [
              `New Receipt Uploaded from ${clientName}`,
              "",
              `Name: ${clientName}`,
              `Email: ${clientEmail}`,
              `Affiliation: ${affiliation}`,
              `Designation: ${designation}`,
              "",
              "Service Details:",
              ...services.map(
                (s: any) =>
                  `  - ${s.name ?? "Service"} x${s.quantity ?? 1} @ \u20B1${(s.price ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
              ),
              "",
              `Amount Paid: \u20B1${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              "",
              `Charge Slip No.: ${csNum}`,
              `Project ID: ${projectId}`,
              `OR Number: ${orNumber.trim()}`,
              `OR Date: ${orDate}`,
              "",
              `Yours in utilizing OMICS for a better Philippines,`,
              `Philippine Genome Center Visayas`,
            ].join("\n");

            await addDoc(collection(db, "mail"), {
              to: recipients,
              message: {
                subject: `New Receipt Uploaded from ${clientName}`,
                html: emailHtml,
                text: emailText,
              },
            });
          }
        } catch (emailErr) {
          console.error("Receipt email notification failed:", emailErr);
          // Non-critical — upload already succeeded
        }
      }

      setPendingFile(null);
      setOrNumber("");
      setOrDate("");
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (receipt: Receipt) => {
    // Block delete if acknowledged by admin (permanent lock)
    if (receipt.acknowledgedByAdmin) {
      toast.error(
        "This receipt has been acknowledged by the admin and cannot be deleted.",
      );
      return;
    }
    // Block delete if still pending admin action (not returned yet)
    if (!receipt.returnedByAdmin) {
      toast.error(
        "This receipt is pending admin review and cannot be deleted yet.",
      );
      return;
    }
    setDeletingId(receipt.id);
    try {
      await deleteDoc(
        doc(db, "projects", projectId, "officialReceipts", receipt.id),
      );
      if (receipt.downloadURL) {
        const path = extractStoragePath(receipt.downloadURL);
        if (path) {
          try {
            await deleteObject(storageRef(storage, path));
          } catch {
            // Non-critical: file metadata already removed from Firestore
          }
        }
      }

      // If deleting a returned receipt and no other receipts remain for this charge slip,
      // reset the charge slip status back to Processing.
      if (csNum) {
        try {
          // Check remaining receipts for this projects/{projectId}/officialReceipts subcollection
          // that match this csNum. Since we just deleted one, we count what's left.
          const remainingForCs = visibleReceipts.filter(
            (r) => r.id !== receipt.id,
          );
          if (remainingForCs.length === 0) {
            await updateDoc(doc(db, "chargeSlips", csNum), {
              status: "processing",
              orStatus: null,
            });
          }
        } catch (e) {
          console.error("Failed to reset CS status on delete:", e);
        }
      }

      await logActivity({
        userId: user?.email || "anonymous",
        userEmail: user?.email || "anonymous",
        userName: user?.displayName || "Client",
        action: "DELETE",
        entityType: "project",
        entityId: projectId,
        description: `Deleted official receipt: ${receipt.fileName || receipt.id}`,
      });
      toast.success("Receipt removed.");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to remove receipt. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className={cn(
        "relative space-y-2 mt-1",
        referenceClientDesign && "mt-0 border-t border-slate-200 px-5 py-3",
      )}
    >
      {/* ── Upload processing overlay — blocks UI while file is uploading ── */}
      {uploading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/85 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <p className="text-[11px] font-semibold text-slate-700">
            Uploading receipt…
          </p>
          <p className="text-[10px] text-slate-400 text-center px-4">
            Please wait. Do not close or refresh this page.
          </p>
        </div>
      )}

      {/* ── Receipt list ── */}
      {loadingReceipts ? (
        <div
          className={cn(
            "flex items-center gap-1.5 py-1 text-[11px] text-slate-400 ml-5",
            referenceClientDesign && "ml-0",
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading receipts…
        </div>
      ) : visibleReceipts.length === 0 ? null : (
        <div
          className={cn(
            "ml-5 space-y-1.5",
            referenceClientDesign && "ml-0 space-y-2",
          )}
        >
          <p
            className={cn(
              "text-[9px] text-slate-400",
              referenceClientDesign && "text-[11px] font-medium text-slate-600",
            )}
          >
            {referenceClientDesign && visibleReceipts.length === 1
              ? `${verifiedCount} of 1 receipt verified`
              : `${verifiedCount} of ${visibleReceipts.length} receipt${visibleReceipts.length !== 1 ? "s" : ""} verified`}
          </p>
          {visibleReceipts.map((receipt) => {
            const isVerified = receipt.acknowledgedByAdmin;
            const isReturned =
              receipt.returnedByAdmin && !receipt.acknowledgedByAdmin;
            const isPending =
              !receipt.acknowledgedByAdmin && !receipt.returnedByAdmin;

            return (
              <div key={receipt.id} className="space-y-1.5">
                {/* Receipt card: OR details row on top, filename + status badge below */}
                <div
                  className={cn(
                    "rounded-lg bg-white border border-slate-100 shadow-sm px-2.5 py-1.5 group hover:border-blue-200 hover:bg-blue-50/10 transition-colors",
                    referenceClientDesign &&
                      "flex items-center gap-3 rounded-xl border-slate-200 px-3 py-2.5 shadow-none hover:bg-white",
                  )}
                >
                  {referenceClientDesign && (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e1f4ed]">
                      <FileText className="h-4 w-4 text-[#08724f]" />
                    </span>
                  )}
                  {referenceClientDesign ? (
                    <div className="min-w-0 flex-1">
                      {receipt.downloadURL ? (
                        <a
                          href={receipt.downloadURL}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={receipt.fileName || receipt.id}
                          className="block truncate text-xs font-semibold text-slate-900 hover:underline"
                        >
                          {receipt.fileName || receipt.id}
                        </a>
                      ) : (
                        <span className="block truncate text-xs font-semibold text-slate-900">
                          {receipt.fileName || receipt.id}
                        </span>
                      )}
                      <p className="truncate text-[11px] text-slate-500">
                        {[
                          receipt.orNumber
                            ? `OR No. ${receipt.orNumber}`
                            : null,
                          receipt.orDate
                            ? format(new Date(receipt.orDate), "MMM d, yyyy")
                            : null,
                          formatFileSize(receipt.size),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Row 1: OR No. · Date · file size */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-slate-600 truncate">
                          {[
                            receipt.orNumber
                              ? `OR No. ${receipt.orNumber}`
                              : null,
                            receipt.orDate
                              ? format(new Date(receipt.orDate), "MMM d, yyyy")
                              : null,
                            formatFileSize(receipt.size),
                          ]
                            .filter(Boolean)
                            .join(" · ") || "\u00a0"}
                        </span>
                        {/* Action icon — top-right */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {isVerified && (
                            <span title="Cannot delete — validated by admin">
                              <Lock className="h-3 w-3 text-slate-300" />
                            </span>
                          )}
                          {isPending && (
                            <span title="Cannot delete — awaiting admin review">
                              <Lock className="h-3 w-3 text-amber-300" />
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Row 2: file icon + filename link + status badge */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <FileText className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                        {receipt.downloadURL ? (
                          <a
                            href={receipt.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={receipt.fileName || receipt.id}
                            className="text-sm font-semibold text-slate-700 hover:underline truncate flex-1 min-w-0"
                          >
                            {receipt.fileName || receipt.id}
                          </a>
                        ) : (
                          <span
                            title={receipt.fileName || receipt.id}
                            className="text-sm font-semibold text-slate-700 truncate flex-1 min-w-0"
                          >
                            {receipt.fileName || receipt.id}
                          </span>
                        )}
                        {/* Status badge */}
                        {isVerified && (
                          <span
                            className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 flex-shrink-0 h-6"
                            title="Validated by admin"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Verified
                            {receipt.acknowledgedAt && (
                              <span className="font-normal text-emerald-500 opacity-80">
                                ·{" "}
                                {format(
                                  receipt.acknowledgedAt.toDate(),
                                  "MMM d, yyyy",
                                )}
                              </span>
                            )}
                          </span>
                        )}
                        {isPending && (
                          <span
                            className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-semibold flex-shrink-0 h-6"
                            title="Waiting for admin validation"
                          >
                            Pending
                          </span>
                        )}
                        {isReturned && (
                          <span
                            className="flex items-center gap-0.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5 flex-shrink-0 h-6"
                            title="Admin returned this receipt for correction"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Returned
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  {referenceClientDesign && (
                    <div className="shrink-0">
                      {isVerified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#d2efcf] px-2.5 py-1 text-[10px] font-semibold text-[#176b22]">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                          {receipt.acknowledgedAt && (
                            <span className="font-medium">
                              ·{" "}
                              {format(
                                receipt.acknowledgedAt.toDate(),
                                "MMM d, yyyy",
                              )}
                            </span>
                          )}
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold text-blue-800">
                          Pending
                        </span>
                      )}
                      {isReturned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-800">
                          <RotateCcw className="h-3 w-3" />
                          Returned
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Returned receipt — inline replace section */}
                {uploadAllowed && isReturned && (
                  <div className="ml-4 space-y-1.5">
                    {/* Hidden file input for replace */}
                    <input
                      ref={replaceFileInputRef}
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={handleReplaceFileChange}
                    />

                    {replacingId === receipt.id && replacePendingFile ? (
                      /* Replace form */
                      <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-slate-700 truncate">
                              {replacePendingFile.name}
                            </p>
                            <p className="text-[9px] text-slate-400">
                              {formatFileSize(replacePendingFile.size)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCancelReplace}
                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-rose-100 transition-colors"
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                              OR Number <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={replaceOrNumber}
                              onChange={(e) =>
                                setReplaceOrNumber(
                                  e.target.value.replace(/\D/g, ""),
                                )
                              }
                              placeholder="e.g. 0012345"
                              className="h-7 text-xs"
                              maxLength={20}
                              inputMode="numeric"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                              OR Date <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              type="date"
                              value={replaceOrDate}
                              onChange={(e) => setReplaceOrDate(e.target.value)}
                              max={new Date().toISOString().split("T")[0]}
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={
                            replaceUploading ||
                            !replaceOrNumber.trim() ||
                            !replaceOrDate
                          }
                          onClick={() => handleReplaceUpload(receipt)}
                          className="w-full h-7 text-[11px] bg-rose-600 hover:bg-rose-700 text-white gap-1"
                        >
                          {replaceUploading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="h-3 w-3" />
                          )}
                          {replaceUploading
                            ? "Uploading…"
                            : "Submit replacement"}
                        </Button>
                      </div>
                    ) : (
                      /* Replace file button */
                      <button
                        type="button"
                        onClick={() => {
                          setReplacingId(receipt.id);
                          setTimeout(
                            () => replaceFileInputRef.current?.click(),
                            0,
                          );
                        }}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium border border-dashed border-rose-300 rounded-lg px-2.5 py-1.5 text-rose-600 bg-white hover:bg-rose-50 hover:border-rose-400 transition-colors"
                      >
                        <Paperclip className="h-3 w-3" />
                        Replace returned file
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pending file + OR details form ── */}
      {uploadAllowed && pendingFile && (
        <div className="ml-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3">
          {/* File preview */}
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-700 truncate">
                {pendingFile.name}
              </p>
              <p className="text-[9px] text-slate-400">
                {formatFileSize(pendingFile.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCancelPending}
              className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-emerald-100 transition-colors"
              title="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* OR Number & Date */}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                OR Number <span className="text-red-500">*</span>
              </Label>
              <Input
                value={orNumber}
                onChange={(e) => setOrNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 0012345"
                className="h-7 text-xs"
                maxLength={20}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                OR Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={orDate}
                onChange={(e) => setOrDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                className="h-7 text-xs"
              />
            </div>
          </div>

          <Button
            size="sm"
            disabled={uploading || !orNumber.trim() || !orDate}
            onClick={handleUpload}
            className="w-full h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            {uploading ? "Uploading…" : "Submit Receipt"}
          </Button>
        </div>
      )}

      {/* ── Attach button — shown when no new-upload is pending; one pending at a time ── */}
      {uploadAllowed && !pendingFile && !hasPendingReceipt && (
        <div
          className={cn(
            "ml-5",
            referenceClientDesign && "ml-0 flex items-center gap-3",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading || !hasChargeSlip}
          />
          <button
            type="button"
            disabled={uploading || !hasChargeSlip}
            onClick={() => fileInputRef.current?.click()}
            title={
              !hasChargeSlip
                ? "A Charge Slip must be issued first before attaching a receipt."
                : "Attach an official receipt"
            }
            className={cn(
              "flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-white hover:bg-emerald-600 hover:text-white border border-emerald-500 rounded-full px-3 py-1 transition-all shrink-0 disabled:opacity-50",
              referenceClientDesign &&
                "h-10 rounded-lg px-3.5 hover:bg-emerald-50 hover:text-emerald-700",
            )}
          >
            <Paperclip className="h-3.5 w-3.5" />
            Upload Receipt
          </button>
          {!hasChargeSlip && (
            <p className="text-[9px] text-slate-400 mt-1">
              A Charge Slip must be issued first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
