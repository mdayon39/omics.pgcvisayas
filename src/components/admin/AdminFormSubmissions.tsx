"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  FileText,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { format, isValid, parseISO } from "date-fns";
import useAuth from "@/hooks/useAuth";

interface SubmittedFile {
  id: string;
  formLabel: string;
  formKey: string;
  fileName: string;
  downloadURL: string;
  storagePath: string;
  uploadedAt: Timestamp | null;
  plannedSampleSubmissionDate?: string;
  uploadedBy: string;
  acknowledgedByAdmin: boolean;
  acknowledgedAt?: Timestamp | null;
  acknowledgedBy?: string;
}

interface AdminFormSubmissionsProps {
  projectId: string;
}

export default function AdminFormSubmissions({ projectId }: AdminFormSubmissionsProps) {
  const { adminInfo } = useAuth();
  const [submissions, setSubmissions] = useState<SubmittedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubmittedFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    // Use a simple query (no orderBy) to avoid composite index requirement.
    // Results are sorted client-side below.
    const q = query(
      collection(db, "clientFormSubmissions"),
      where("projectId", "==", projectId)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: SubmittedFile[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            formLabel: data.formLabel ?? data.formKey,
            formKey: data.formKey,
            fileName: data.fileName,
            downloadURL: data.downloadURL,
            storagePath: data.storagePath ?? "",
            uploadedAt: data.uploadedAt ?? null,
            plannedSampleSubmissionDate:
              typeof data.plannedSampleSubmissionDate === "string"
                ? data.plannedSampleSubmissionDate
                : undefined,
            uploadedBy: data.uploadedBy ?? "client",
            acknowledgedByAdmin: data.acknowledgedByAdmin ?? false,
            acknowledgedAt: data.acknowledgedAt ?? null,
            acknowledgedBy: data.acknowledgedBy ?? null,
          };
        });
        items.sort((a, b) => (b.uploadedAt?.toMillis() ?? 0) - (a.uploadedAt?.toMillis() ?? 0));
        setSubmissions(items);
        setLoading(false);
      },
      (error) => {
        console.error("AdminFormSubmissions: Firestore error", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [projectId]);

  const handleAcknowledge = async (submissionId: string, fileName: string) => {
    setAcknowledging(submissionId);
    try {
      await updateDoc(doc(db, "clientFormSubmissions", submissionId), {
        acknowledgedByAdmin: true,
        acknowledgedAt: serverTimestamp(),
        acknowledgedBy: adminInfo?.email ?? "admin",
      });
      toast.success(`"${fileName}" marked as acknowledged.`);
    } catch {
      toast.error("Failed to acknowledge. Please try again.");
    } finally {
      setAcknowledging(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, "clientFormSubmissions", deleteTarget.id));

      // Delete from Firebase Storage if we have a path
      if (deleteTarget.storagePath) {
        try {
          await deleteObject(ref(storage, deleteTarget.storagePath));
        } catch (storageErr) {
          // File may already be gone from storage — not a fatal error
          console.warn("Storage delete warning:", storageErr);
        }
      }

      toast.success(`"${deleteTarget.fileName}" deleted.`);
    } catch {
      toast.error("Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-2 ml-5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading submissions…
      </div>
    );
  }

  if (submissions.length === 0) {
    return <p className="text-xs text-slate-400 ml-5">No uploaded forms yet</p>;
  }

  return (
    <>
      <div className="space-y-2 ml-5">
        {submissions.map((f) => {
          const isAcknowledging = acknowledging === f.id;
          const plannedSampleDate = f.plannedSampleSubmissionDate
            ? parseISO(f.plannedSampleSubmissionDate)
            : null;
          const plannedSampleDateLabel = plannedSampleDate
            ? isValid(plannedSampleDate)
              ? format(plannedSampleDate, "MMM d, yyyy")
              : f.plannedSampleSubmissionDate
            : null;
          return (
            <div
              key={f.id}
              className={`rounded-lg border p-3 space-y-1.5 ${
                f.acknowledgedByAdmin
                  ? "border-emerald-100 bg-emerald-50/40"
                  : "border-amber-100 bg-amber-50/30"
              }`}
            >
              {/* File header */}
              <div className="flex items-start gap-2">
                <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-orange-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 truncate">{f.formLabel}</p>
                  <p className="text-[10px] text-slate-500 truncate" title={f.fileName}>{f.fileName}</p>
                </div>
                {/* Status badge */}
                {f.acknowledgedByAdmin ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 shrink-0">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Acknowledged
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0">
                    <Clock className="h-2.5 w-2.5" />
                    Pending review
                  </span>
                )}
              </div>

              {/* Meta: upload date / acknowledged info */}
              <div className="flex flex-col gap-0.5 pl-5 text-[10px] text-slate-400">
                {f.uploadedAt && (
                  <span>Uploaded {format(f.uploadedAt.toDate(), "MMM d, yyyy")}</span>
                )}
                {f.formKey === "ssf" && plannedSampleDateLabel && (
                  <span className="font-medium text-slate-600">
                    Planned sample delivery: {plannedSampleDateLabel}
                  </span>
                )}
                {f.acknowledgedByAdmin && f.acknowledgedAt && (
                  <span className="text-emerald-600">
                    Acknowledged by: {f.acknowledgedBy ?? "Admin"} · {format(f.acknowledgedAt.toDate(), "MMM d, yyyy")}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pl-5">
                <a
                  href={f.downloadURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                >
                  <Eye className="h-3 w-3" />
                  View PDF
                </a>
                {!f.acknowledgedByAdmin && (
                  <button
                    onClick={() => handleAcknowledge(f.id, f.fileName)}
                    disabled={isAcknowledging}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAcknowledging ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    )}
                    {isAcknowledging ? "Saving…" : "Acknowledge"}
                  </button>
                )}
                {/* Delete button (only if not acknowledged, or if Super Admin) */}
                {( !f.acknowledgedByAdmin || adminInfo?.role?.toLowerCase().replace(/\s+/g, '') === 'superadmin') && (
                  <button
                    onClick={() => setDeleteTarget(f)}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-full px-2 py-0.5 transition-colors ml-auto"
                    title={f.acknowledgedByAdmin ? "Acknowledge files can only be deleted by a Super Admin" : "Delete this submission"}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { if (!deleting) setDeleteTarget(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Delete Submission</p>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-800">"{deleteTarget.fileName}"</span>?
              {" "}This will permanently remove the file from storage and the record from the database.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirmed}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
