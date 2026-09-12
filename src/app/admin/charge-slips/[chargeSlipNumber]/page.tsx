"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, notFound } from "next/navigation";
import {
  getChargeSlipById,
  updateChargeSlip,
} from "@/services/chargeSlipService";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { logActivity } from "@/services/activityLogService";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGuard } from "@/components/PermissionGuard";
import ChargeSlipPreviewButton from "@/components/charge-slip/ChargeSlipPreviewButton";
import {
  CheckCircle2,
  Loader2 as ReceiptLoader,
  RotateCcw,
  Stamp,
  Trash2,
} from "lucide-react";
import { getActiveCatalogItems } from "@/services/catalogSettingsService";
import { CatalogItem } from "@/types/CatalogSettings";

interface OfficialReceipt {
  id: string;
  fileName?: string;
  size?: number;
  downloadURL?: string;
  uploadedBy?: string;
  uploadedAt?: Timestamp;
  orNumber?: string;
  orDate?: string;
  acknowledgedByAdmin?: boolean;
  acknowledgedBy?: string;
  acknowledgedByName?: string;
  returnedByAdmin?: boolean;
  chargeSlipNumber?: string;
}

/** Extract Firebase Storage object path from a download URL. */
function extractStoragePath(url: string): string | null {
  try {
    const match = url.match(/\/o\/(.+?)(?:\?|$)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// Utility to normalize to string date
const formatDate = (
  val: Date | string | Timestamp | null | undefined,
): string => {
  if (!val) return "—";
  if (typeof val === "string") {
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-CA");
  }
  if (val instanceof Timestamp) return val.toDate().toLocaleDateString("en-CA");
  if (val instanceof Date) return val.toLocaleDateString("en-CA");
  return "—";
};

// Type guard for Firebase Timestamp
const isTimestamp = (val: any): val is Timestamp =>
  val?.seconds !== undefined && val?.nanoseconds !== undefined;

export default function ChargeSlipDetailPage() {
  return (
    <PermissionGuard module="chargeSlips" action="view">
      <ChargeSlipDetailContent />
    </PermissionGuard>
  );
}

function ChargeSlipDetailContent() {
  const { adminInfo } = useAuth();
  const { canEdit } = usePermissions(adminInfo?.role);
  const { chargeSlipNumber } = useParams() as { chargeSlipNumber: string };
  const router = useRouter();

  const [record, setRecord] = useState<ChargeSlipRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [dvNumber, setDvNumber] = useState("");
  const [orNumber, setOrNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string>("processing");
  const [availableStatuses, setAvailableStatuses] = useState<CatalogItem[]>([]);
  const [dateOfOR, setDateOfOR] = useState<Timestamp | undefined>(undefined);
  const [officialReceipts, setOfficialReceipts] = useState<OfficialReceipt[]>(
    [],
  );
  const [validating, setValidating] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [receiptToDelete, setReceiptToDelete] =
    useState<OfficialReceipt | null>(null);

  useEffect(() => {
    // Load statuses from catalog once
    const loadStatuses = async () => {
      try {
        const statuses = (await getActiveCatalogItems(
          "chargeSlipStatuses",
        )) as CatalogItem[];
        setAvailableStatuses(statuses);
      } catch (error) {
        console.error("Failed to load charge slip statuses:", error);
      }
    };
    loadStatuses();

    // Set up real-time listener for charge slip document
    const chargeSlipRef = doc(db, "chargeSlips", chargeSlipNumber);
    const unsubscribe = onSnapshot(chargeSlipRef, async (docSnap) => {
      if (!docSnap.exists()) {
        notFound();
        return;
      }

      const data = docSnap.data() as any;

      // Convert to ChargeSlipRecord format
      const chargeSlipData: ChargeSlipRecord = {
        ...data,
        id: docSnap.id,
        client: {
          ...data.client,
          createdAt: data.client?.createdAt?.toDate?.() || new Date(),
        },
        project: {
          ...data.project,
          createdAt: data.project?.createdAt?.toDate?.() || new Date(),
        },
        dateIssued:
          data.dateIssued?.toDate?.() || data.dateIssued || new Date(),
        dateOfOR: data.dateOfOR?.toDate?.() || data.dateOfOR,
        createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
      };

      setRecord(chargeSlipData);
      setDvNumber(chargeSlipData.dvNumber ?? "");
      setNotes(chargeSlipData.notes ?? "");
      setStatus((chargeSlipData.status ?? "processing").toLowerCase());

      const rawDate = chargeSlipData.dateOfOR;
      if (isTimestamp(rawDate)) setDateOfOR(rawDate);
      else if (typeof rawDate === "string")
        setDateOfOR(Timestamp.fromDate(new Date(rawDate)));

      // Load official receipts for the project
      const pid =
        chargeSlipData.projectId || (chargeSlipData.project as any)?.pid;
      setOrNumber(chargeSlipData.orNumber ?? "");

      if (pid) {
        try {
          const orSnap = await getDocs(
            query(
              collection(db, "projects", pid, "officialReceipts"),
              orderBy("uploadedAt", "desc"),
            ),
          );
          const ors = orSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as OfficialReceipt[];
          setOfficialReceipts(
            ors.filter(
              (r) => r.chargeSlipNumber === chargeSlipData.chargeSlipNumber,
            ),
          );
        } catch {
          // silently fail — official receipts are optional
        }
      }

      setLoading(false);
    });

    // Log VIEW activity once on mount
    if (adminInfo?.email) {
      logActivity({
        userId: adminInfo.email,
        userEmail: adminInfo.email,
        userName: adminInfo.name || "System",
        action: "VIEW",
        entityType: "charge_slip",
        entityId: chargeSlipNumber,
        entityName: `Charge Slip ${chargeSlipNumber}`,
        description: `Viewed charge slip: ${chargeSlipNumber}`,
      });
    }

    return () => unsubscribe();
  }, [chargeSlipNumber, adminInfo]);

  // Set up real-time listener for official receipts
  useEffect(() => {
    if (!record?.projectId && !(record?.project as any)?.pid) return;

    const pid = record?.projectId || (record?.project as any)?.pid;
    if (!pid) return;

    const receiptsRef = collection(db, "projects", pid, "officialReceipts");
    const receiptsQuery = query(receiptsRef, orderBy("uploadedAt", "desc"));

    const unsubscribeReceipts = onSnapshot(receiptsQuery, (snapshot) => {
      const ors = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as OfficialReceipt[];
      setOfficialReceipts(
        ors.filter((r) => r.chargeSlipNumber === record?.chargeSlipNumber),
      );
    });

    return () => unsubscribeReceipts();
  }, [record?.projectId, record?.project, record?.chargeSlipNumber]);

  const handleReturn = async (receipt: OfficialReceipt) => {
    if (!record) return;
    setReturning(receipt.id);
    try {
      const pid = record.projectId || (record.project as any)?.pid || "";
      await updateDoc(
        doc(db, "projects", pid, "officialReceipts", receipt.id),
        {
          returnedByAdmin: true,
        },
      );
      // Keep orStatus as Pending — returned receipts still awaiting a valid replacement
      await updateDoc(doc(db, "chargeSlips", record.chargeSlipNumber), {
        orStatus: "Pending",
      });
      setOfficialReceipts((prev) =>
        prev.map((r) =>
          r.id === receipt.id ? { ...r, returnedByAdmin: true } : r,
        ),
      );
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "UPDATE",
        entityType: "charge_slip",
        entityId: record.referenceNumber || record.chargeSlipNumber,
        entityName: `Charge Slip ${record.chargeSlipNumber}`,
        description: `Returned official receipt for correction: ${receipt.fileName || receipt.id}`,
      });
      toast.success("Receipt returned to client for correction.");
    } catch {
      toast.error("Failed to return receipt.");
    } finally {
      setReturning(null);
    }
  };

  const handleValidate = async (receipt: OfficialReceipt) => {
    if (!record?.id) return;
    setValidating(receipt.id);
    try {
      const pid = record.projectId || (record.project as any)?.pid || "";
      // Mark the receipt as acknowledged and record who acknowledged it
      await updateDoc(
        doc(db, "projects", pid, "officialReceipts", receipt.id),
        {
          acknowledgedByAdmin: true,
          acknowledgedBy: adminInfo?.email || "unknown",
          acknowledgedByName: adminInfo?.name || "",
          acknowledgedAt: Timestamp.now(),
        },
      );
      // Persist OR details on charge slip for future reference (status NOT changed — admin updates manually)
      const orVal = receipt.orNumber || orNumber;
      const orDateVal = receipt.orDate
        ? Timestamp.fromDate(new Date(receipt.orDate))
        : dateOfOR;
      const orEntry = {
        orNumber: orVal || "",
        orDate: receipt.orDate || "",
        acknowledgedAt: Timestamp.now(),
        acknowledgedBy: adminInfo?.email || "unknown",
        acknowledgedByName: adminInfo?.name || "",
      };
      await updateChargeSlip(record.id, {
        orNumber: orVal,
        dateOfOR: orDateVal,
      });
      // Append to orEntries history (arrayUnion prevents duplicates)
      await updateDoc(doc(db, "chargeSlips", record.id), {
        orEntries: arrayUnion(orEntry),
      });
      // Mark the charge slip orStatus as Validated
      await updateDoc(doc(db, "chargeSlips", record.chargeSlipNumber), {
        orStatus: "Validated",
      });
      // Sync local UI state (status unchanged)
      if (orVal) setOrNumber(orVal);
      if (orDateVal) setDateOfOR(orDateVal);
      setOfficialReceipts((prev) =>
        prev.map((r) =>
          r.id === receipt.id ? { ...r, acknowledgedByAdmin: true } : r,
        ),
      );
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "UPDATE",
        entityType: "charge_slip",
        entityId: record.referenceNumber || record.chargeSlipNumber,
        entityName: `Charge Slip ${record.chargeSlipNumber}`,
        description: `Validated official receipt: ${receipt.fileName || receipt.id} (OR No. ${orVal || "—"}). OR details saved.`,
      });
      toast.success("Receipt validated. OR details saved.");
    } catch {
      toast.error("Failed to validate receipt.");
    } finally {
      setValidating(null);
    }
  };

  const handleDeleteReceipt = async (receipt: OfficialReceipt) => {
    if (!record) return;
    setDeleting(receipt.id);
    try {
      const pid = record.projectId || (record.project as any)?.pid || "";
      // Delete Firestore document (triggers client onSnapshot — removes from client list automatically)
      await deleteDoc(doc(db, "projects", pid, "officialReceipts", receipt.id));
      // Delete file from Firebase Storage
      if (receipt.downloadURL) {
        const path = extractStoragePath(receipt.downloadURL);
        if (path) {
          try {
            await deleteObject(storageRef(storage, path));
          } catch {
            // Non-critical: Firestore doc already removed
          }
        }
      }
      const remainingReceipts = officialReceipts.filter(
        (r) => r.id !== receipt.id,
      );
      setOfficialReceipts(remainingReceipts);
      // Only reset to Processing when the last receipt is deleted
      if (record.id && remainingReceipts.length === 0) {
        await updateChargeSlip(record.id, {
          status: "processing",
          orNumber: "",
          dateOfOR: null,
        });
        // Clear orStatus since no receipt remains
        await updateDoc(doc(db, "chargeSlips", record.chargeSlipNumber), {
          orStatus: null,
        });
        // Also remove the corresponding orEntry from orEntries history (matched by orNumber + orDate)
        if (receipt.orNumber || receipt.orDate) {
          // arrayRemove requires exact object match — find existing entry to remove
          const updatedDoc = await import("firebase/firestore").then(
            ({ getDoc }) => getDoc(doc(db, "chargeSlips", record.id!)),
          );
          const existingEntries: any[] = updatedDoc.data()?.orEntries || [];
          const entryToRemove = existingEntries.find(
            (e) =>
              e.orNumber === (receipt.orNumber || "") &&
              e.orDate === (receipt.orDate || ""),
          );
          if (entryToRemove) {
            await updateDoc(doc(db, "chargeSlips", record.id!), {
              orEntries: arrayRemove(entryToRemove),
            });
          }
        }
        setStatus("processing");
        setOrNumber("");
        setDateOfOR(undefined);
      }
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "DELETE",
        entityType: "charge_slip",
        entityId: record.referenceNumber || record.chargeSlipNumber,
        entityName: `Charge Slip ${record.chargeSlipNumber}`,
        description: `Deleted official receipt: ${receipt.fileName || receipt.id} (OR No. ${receipt.orNumber || "—"})${remainingReceipts.length === 0 ? ". Status reset to Processing." : "."}`,
      });
      toast.success(
        remainingReceipts.length === 0
          ? "Receipt deleted. Status reset to Processing."
          : "Receipt deleted.",
      );
    } catch {
      toast.error("Failed to delete receipt.");
    } finally {
      setDeleting(null);
    }
  };

  const handleSave = async () => {
    if (!record?.id) return;

    try {
      const updates = {
        dvNumber,
        orNumber,
        notes,
        status,
        dateOfOR,
      };

      await updateChargeSlip(record.id, updates);

      // Log UPDATE activity
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "UPDATE",
        entityType: "charge_slip",
        entityId: record.referenceNumber || record.chargeSlipNumber,
        entityName: `Charge Slip ${record.chargeSlipNumber}`,
        description: `Updated charge slip: ${record.chargeSlipNumber}`,
        changesAfter: updates,
        changedFields: Object.keys(updates),
      });

      toast.success("Charge slip updated successfully.");
    } catch (error) {
      toast.error("Failed to update charge slip.");
    }
  };

  if (loading || !record) return <p className="p-10">Loading...</p>;

  const derivedCategories =
    record.categories?.length && record.categories.some(Boolean)
      ? record.categories
      : Array.from(
          new Set(
            (record.services ?? []).map((s) => s.type ?? "").filter(Boolean),
          ),
        );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50/50 to-blue-50/30 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Modern Header */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/50">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-[#166FB5] to-[#4038AF] bg-clip-text text-transparent">
                Charge Slip Details
              </h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">CS Number:</span>
                  <Badge
                    variant="outline"
                    className="font-mono text-[#F69122] border-[#F69122]/30 bg-[#F69122]/5"
                  >
                    {record.chargeSlipNumber}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600">Issued:</span>
                  <span className="text-sm font-medium text-slate-800">
                    {formatDate(record.dateIssued)}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/admin/charge-slips")}
              className="hover:bg-slate-50 border-slate-200"
            >
              ← Back to List
            </Button>
          </div>
        </div>

        {/* Client & Project Information Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/50">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-gradient-to-r from-[#F69122] to-[#B9273A] rounded-full"></div>
            Client & Project Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Client Name
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {record.clientInfo?.name || "—"}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Client ID
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {record.cid || "—"}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Address
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {record.clientInfo?.address ||
                    record.client?.affiliationAddress ||
                    "—"}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Project Title
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {record.project?.title || "—"}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Project ID
                </span>
                <span className="text-sm font-medium text-slate-800">
                  {record.projectId || "—"}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Total Amount
                </span>
                <span className="text-xl font-bold bg-gradient-to-r from-[#F69122] to-[#B9273A] bg-clip-text text-transparent">
                  ₱{record.total.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Service Categories
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {derivedCategories.map((cat, index) => (
                  <Badge
                    key={index}
                    className="capitalize bg-gradient-to-r from-[#166FB5]/10 to-[#4038AF]/10 text-[#166FB5] border-[#166FB5]/20 hover:bg-[#166FB5]/20"
                  >
                    {cat}
                  </Badge>
                ))}
                {derivedCategories.length === 0 && (
                  <span className="text-sm text-slate-500">
                    No categories available
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                Services
              </span>
              <div className="text-sm text-slate-700">
                {record.services?.map((s) => s.name).join(", ") ||
                  "No services listed"}
              </div>
            </div>
          </div>
        </div>

        {/* Status & Administrative Details Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/50">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 bg-gradient-to-r from-[#912ABD] to-[#6E308E] rounded-full"></div>
            Status & Administrative Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">
                  Status
                </label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    if (canEdit("chargeSlips")) setStatus(value);
                  }}
                  disabled={!canEdit("chargeSlips")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStatuses.length > 0 ? (
                      availableStatuses.map((s) => (
                        <SelectItem key={s.id} value={s.value.toLowerCase()}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: s.color || "#94a3b8" }}
                            />
                            <span className="capitalize">{s.value}</span>
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="waived">Waived</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              {/* OR Number and Date of OR are managed via the Official Receipts
                  section below — they are saved automatically when the admin
                  acknowledges an uploaded receipt, keeping data entry in one place.
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">OR Number</label>
                <Input
                  value={orNumber}
                  onChange={(e) => setOrNumber(e.target.value)}
                  placeholder="Enter OR number"
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">Date of OR</label>
                <Input
                  type="date"
                  value={
                    dateOfOR
                      ? dateOfOR.toDate().toISOString().split("T")[0]
                      : ""
                  }
                  onChange={(e) => {
                    const inputDate = e.target.value;
                    if (inputDate) {
                      setDateOfOR(Timestamp.fromDate(new Date(inputDate)));
                    } else {
                      setDateOfOR(undefined);
                    }
                  }}
                  className="w-full"
                />
              </div>
              */}
            </div>
          </div>

          {/* Official Receipts from Client */}
          {record.showOfficialReceipts !== false && (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Stamp className="h-4 w-4 text-emerald-600" />
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Official Receipts from Client
                </label>
                {officialReceipts.length > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-slate-500 border-slate-200"
                  >
                    {officialReceipts.length}
                  </Badge>
                )}
              </div>

              {officialReceipts.length === 0 ? (
                <p className="text-sm text-slate-400 italic">
                  No official receipts uploaded by client yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {officialReceipts.map((or_) => (
                    <div
                      key={or_.id}
                      className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        {or_.downloadURL ? (
                          <a
                            href={or_.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-blue-700 hover:underline truncate block"
                          >
                            {or_.fileName || or_.id}
                          </a>
                        ) : (
                          <p className="text-sm font-semibold text-slate-700 truncate">
                            {or_.fileName || or_.id}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500">
                          {or_.orNumber && (
                            <span>
                              OR No.:{" "}
                              <span className="font-medium text-slate-700">
                                {or_.orNumber}
                              </span>
                            </span>
                          )}
                          {or_.orDate && (
                            <span>
                              Date:{" "}
                              <span className="font-medium text-slate-700">
                                {or_.orDate}
                              </span>
                            </span>
                          )}
                          {or_.acknowledgedByAdmin &&
                            (or_.acknowledgedByName || or_.acknowledgedBy) && (
                              <span className="text-emerald-600">
                                Validated by:{" "}
                                <span className="font-medium">
                                  {or_.acknowledgedByName || or_.acknowledgedBy}
                                </span>
                              </span>
                            )}
                        </div>
                        <div className="pt-0.5">
                          {or_.acknowledgedByAdmin ? (
                            <Badge className="h-5 text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Validated
                            </Badge>
                          ) : or_.returnedByAdmin ? (
                            <Badge
                              variant="outline"
                              className="h-5 text-[10px] text-rose-600 border-rose-200 bg-rose-50 gap-1"
                            >
                              <RotateCcw className="h-2.5 w-2.5" /> Returned for
                              Correction
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-5 text-[10px] text-amber-600 border-amber-200 bg-amber-50"
                            >
                              Pending
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-2">
                          {/* Delete restricted to superadmin only */}
                          {adminInfo?.email === "madayon1@up.edu.ph" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={
                                deleting === or_.id ||
                                validating === or_.id ||
                                returning === or_.id
                              }
                              onClick={() => setReceiptToDelete(or_)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              title="Delete receipt"
                            >
                              {deleting === or_.id ? (
                                <ReceiptLoader className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                        {!or_.acknowledgedByAdmin && !or_.returnedByAdmin && (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              disabled={
                                returning === or_.id || validating === or_.id
                              }
                              onClick={() => handleReturn(or_)}
                              variant="outline"
                              className="h-7 text-[11px] px-3 border-rose-200 text-rose-600 hover:bg-rose-50 gap-1"
                            >
                              {returning === or_.id ? (
                                <ReceiptLoader className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Return
                            </Button>
                            <Button
                              size="sm"
                              disabled={
                                validating === or_.id || returning === or_.id
                              }
                              onClick={() => handleValidate(or_)}
                              className="h-7 text-[11px] px-3 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            >
                              {validating === or_.id ? (
                                <ReceiptLoader className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              Validate
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save Changes Card */}
        <div className="bg-gradient-to-r from-[#F69122]/5 via-[#B9273A]/5 to-[#912ABD]/5 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/50">
          <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-gradient-to-r from-[#F69122] to-[#912ABD] rounded-full"></div>
            Save Changes
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Update the charge slip with the latest information
          </p>

          <Button
            onClick={handleSave}
            className="bg-gradient-to-r from-[#166FB5] to-[#4038AF] hover:from-[#145a9b] hover:to-[#362f8f] text-white font-medium px-6 py-2 rounded-lg transition-all duration-200 shadow-lg"
          >
            Save Changes
          </Button>
        </div>

        {/* Preview Charge Slip Card */}
        <div className="bg-gradient-to-r from-[#166FB5]/5 via-[#4038AF]/5 to-[#912ABD]/5 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/50">
          <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-gradient-to-r from-[#166FB5] to-[#4038AF] rounded-full"></div>
            Preview Document
          </h2>
          <p className="text-sm text-slate-600 mb-4">
            Preview the charge slip PDF document
          </p>

          <ChargeSlipPreviewButton record={record} />
        </div>
      </div>

      {/* ── Delete receipt confirmation dialog ── */}
      <AlertDialog
        open={receiptToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Official Receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-800">
                {receiptToDelete?.fileName || receiptToDelete?.id}
              </span>
              ? This action cannot be undone and the file will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting === receiptToDelete?.id}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting === receiptToDelete?.id}
              onClick={() => {
                if (receiptToDelete) {
                  handleDeleteReceipt(receiptToDelete);
                  setReceiptToDelete(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting === receiptToDelete?.id
                ? "Deleting…"
                : "Yes, delete it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
