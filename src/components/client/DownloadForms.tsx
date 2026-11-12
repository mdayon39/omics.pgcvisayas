"use client";

import { useEffect, useRef, useState } from "react";
import {
  ref,
  getDownloadURL,
  getBlob,
  uploadBytes,
  deleteObject,
} from "firebase/storage";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
  Timestamp,
} from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import {
  FileText,
  Loader2,
  Upload,
  CheckCircle2,
  Clock,
  X,
  Paperclip,
  Eye,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import useAuth from "@/hooks/useAuth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface FormEntry {
  label: string;
  description: string;
  portalDescription: string;
  revision: string;
  storagePath: string;
  formKey: string;
}

const PORTAL_FORMS: FormEntry[] = [
  {
    label: "Sample Submission Requirements",
    description: "VSF-LR-SSR Rev. 005 — Read before submitting samples",
    portalDescription: "Read before submitting samples",
    revision: "VSF-LR-SSR · Rev. 005",
    storagePath:
      "forms/VSF-LR-SSR_Sample Submission Requirements and Form_v6.pdf",
    formKey: "ssreq",
  },
  {
    label: "Sample Submission Form",
    description: "PGCV-LF-SSF Rev. 001 — Fill out and include with shipment",
    portalDescription: "Fill out and include with shipment",
    revision: "PGCV-LF-SSF · Rev. 001",
    storagePath: "forms/Sample_Submission_Form.pdf",
    formKey: "ssf",
  },
];

interface TemplateState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

interface SubmittedFile {
  id: string;
  fileName: string;
  downloadURL: string;
  storagePath: string;
  uploadedAt: Timestamp | null;
  acknowledgedByAdmin?: boolean;
  acknowledgedAt?: Timestamp | null;
}

interface DownloadFormsProps {
  projectId: string;
  referenceClientDesign?: boolean;
}

export default function DownloadForms({
  projectId,
  referenceClientDesign = false,
}: DownloadFormsProps) {
  const { user } = useAuth();
  const [templateStates, setTemplateStates] = useState<TemplateState[]>(
    PORTAL_FORMS.map(() => ({ url: null, loading: true, error: false })),
  );
  const [downloadingIdx, setDownloadingIdx] = useState<number | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [submittedFiles, setSubmittedFiles] = useState<
    Record<string, SubmittedFile[]>
  >({});
  const [attachedFiles, setAttachedFiles] = useState<
    Record<string, File | null>
  >({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Load template download URLs
  useEffect(() => {
    PORTAL_FORMS.forEach((form, i) => {
      getDownloadURL(ref(storage, form.storagePath))
        .then((url) =>
          setTemplateStates((prev) =>
            prev.map((s, idx) =>
              idx === i ? { url, loading: false, error: false } : s,
            ),
          ),
        )
        .catch(() =>
          setTemplateStates((prev) =>
            prev.map((s, idx) =>
              idx === i ? { url: null, loading: false, error: true } : s,
            ),
          ),
        );
    });
  }, []);

  // Realtime listener for uploaded submissions
  // No orderBy to avoid requiring a composite Firestore index — sorted client-side.
  useEffect(() => {
    if (!projectId) return;

    const q = query(
      collection(db, "clientFormSubmissions"),
      where("projectId", "==", projectId),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const grouped: Record<string, SubmittedFile[]> = {};
        snap.forEach((d) => {
          const data = d.data();
          const key = data.formKey as string;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push({
            id: d.id,
            fileName: data.fileName,
            downloadURL: data.downloadURL,
            storagePath: data.storagePath,
            uploadedAt: data.uploadedAt ?? null,
            acknowledgedByAdmin: data.acknowledgedByAdmin ?? false,
            acknowledgedAt: data.acknowledgedAt ?? null,
          });
        });
        // Sort each group newest-first
        for (const key of Object.keys(grouped)) {
          grouped[key].sort(
            (a, b) =>
              (b.uploadedAt?.toMillis() ?? 0) - (a.uploadedAt?.toMillis() ?? 0),
          );
        }
        setSubmittedFiles(grouped);
      },
      (error) => {
        console.error("DownloadForms: Firestore error", error);
      },
    );

    return () => unsub();
  }, [projectId]);

  const handleDownloadTemplate = async (form: FormEntry, index: number) => {
    try {
      setDownloadingIdx(index);
      const fileRef = ref(storage, form.storagePath);
      let blob: Blob;
      try {
        blob = await getBlob(fileRef);
      } catch {
        const url = await getDownloadURL(fileRef);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Network error");
        blob = await res.blob();
      }
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = form.storagePath.split("/").pop() || "form.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      const url = templateStates[index].url;
      if (url) {
        window.open(url, "_blank");
        toast.info("Opening in new tab (direct download restricted)");
      } else {
        toast.error("Download failed. Please try viewing the file instead.");
      }
    } finally {
      setDownloadingIdx(null);
    }
  };

  const handleAttachFile = (form: FormEntry, file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20 MB.");
      return;
    }
    setAttachedFiles((prev) => ({ ...prev, [form.formKey]: file }));
    toast.success(`"${file.name}" attached. Review and confirm upload.`);
  };

  const handleRemoveAttachment = (formKey: string) => {
    setAttachedFiles((prev) => ({ ...prev, [formKey]: null }));
    const input = fileInputRefs.current[formKey];
    if (input) input.value = "";
  };

  const handleUpload = async (form: FormEntry) => {
    const file = attachedFiles[form.formKey];
    if (!file) {
      toast.error("No file attached.");
      return;
    }

    try {
      setUploadingKey(form.formKey);

      const ext = file.name.split(".").pop() || "pdf";
      const timestamp = Date.now();
      const uniqueName = `${form.formKey}-${timestamp}-${uuidv4()}.${ext}`;
      const storagePath = `client-form-submissions/${projectId}/${uniqueName}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      await addDoc(collection(db, "clientFormSubmissions"), {
        projectId,
        formKey: form.formKey,
        formLabel: form.label,
        fileName: file.name,
        storagePath,
        downloadURL,
        uploadedAt: serverTimestamp(),
        uploadedBy: user?.email ?? "client",
        ...(user?.uid ? { uuid: user.uid } : {}),
        acknowledgedByAdmin: false,
      });

      toast.success(`"${file.name}" uploaded successfully.`);
      setAttachedFiles((prev) => ({ ...prev, [form.formKey]: null }));
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploadingKey(null);
      const input = fileInputRefs.current[form.formKey];
      if (input) input.value = "";
    }
  };

  const handleDelete = async (
    fileId: string,
    storagePath: string,
    fileName: string,
  ) => {
    try {
      await deleteDoc(doc(db, "clientFormSubmissions", fileId));
      try {
        await deleteObject(ref(storage, storagePath));
      } catch {
        // Storage file may already be gone — ignore
      }
      toast.success(`"${fileName}" removed.`);
    } catch {
      toast.error("Could not remove the file. Please try again.");
    }
  };

  return (
    <div
      className={cn(
        "ml-5 mb-2 space-y-2",
        referenceClientDesign && "m-0 space-y-3",
      )}
    >
      {PORTAL_FORMS.map((form, i) => {
        const { url, loading, error } = templateStates[i];
        const isDownloading = downloadingIdx === i;
        const isUploading = uploadingKey === form.formKey;
        const uploaded = submittedFiles[form.formKey] ?? [];
        const attachedFile = attachedFiles[form.formKey];
        // Hide upload button if any file is still pending admin acknowledgement
        const hasPendingUpload = uploaded.some((f) => !f.acknowledgedByAdmin);

        return (
          <div
            key={form.formKey}
            className={cn(
              "rounded-lg border border-slate-100 bg-slate-50 overflow-hidden",
              referenceClientDesign && "rounded-xl border-slate-200 bg-white",
            )}
          >
            {/* Header row */}
            <div
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-1.5",
                referenceClientDesign && "flex-wrap items-start gap-3 p-4",
              )}
            >
              {referenceClientDesign ? (
                <>
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-50 text-xs font-semibold text-orange-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-5 text-slate-900">
                        {form.label}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {form.portalDescription}
                      </p>
                      <span className="mt-3 inline-flex rounded-md bg-orange-50 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-orange-700">
                        {form.revision}
                      </span>
                    </div>
                  </div>
                  {loading ? (
                    <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-orange-500" />
                  ) : error ? (
                    <span className="shrink-0 text-[10px] font-medium text-red-500">
                      Unavailable
                    </span>
                  ) : (
                    <a
                      href={url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (!url) e.preventDefault();
                      }}
                      aria-label={`View ${form.label}`}
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-orange-500 px-4 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-50",
                        !url && "pointer-events-none opacity-50",
                      )}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      View
                    </a>
                  )}
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    {loading ? (
                      <span className="text-xs font-medium text-slate-400">
                        {form.label}
                      </span>
                    ) : error ? (
                      <span className="text-xs font-medium text-slate-400">
                        {form.label}
                      </span>
                    ) : (
                      <a
                        href={url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          if (!url) e.preventDefault();
                        }}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-orange-600 border border-orange-200 bg-white rounded-md px-2 py-0.5 hover:bg-orange-50 transition-colors"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        {form.label}
                      </a>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                      {form.description}
                    </p>
                  </div>
                  {loading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300 shrink-0" />
                  )}
                  {error && (
                    <span className="text-[10px] text-red-400 shrink-0">
                      Unavailable
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Upload panel */}
            <div
              className={cn(
                "border-t border-slate-100 px-3 py-2 bg-white/60 space-y-1.5",
                referenceClientDesign &&
                  (uploaded.length > 0 || form.formKey !== "ssreq"
                    ? "border-t px-4 pb-4 pt-3"
                    : "border-t-0 px-4 pb-0 pt-0"),
              )}
            >
              {/* Uploaded files listed ABOVE the upload button */}
              {uploaded.length > 0 && (
                <div className="space-y-2">
                  {uploaded.map((f) => (
                    <div key={f.id} className="space-y-1">
                      <div
                        className={cn(
                          "flex items-center gap-1.5 rounded-md bg-slate-50 border border-slate-100 px-2 py-0.5",
                          referenceClientDesign &&
                            "gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50",
                            !referenceClientDesign && "hidden",
                          )}
                        >
                          <FileText className="h-4 w-4 text-orange-700" />
                        </span>
                        {!referenceClientDesign &&
                          (f.acknowledgedByAdmin ? (
                            <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-500" />
                          ) : (
                            <Clock className="h-2.5 w-2.5 shrink-0 text-amber-400" />
                          ))}
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                          <a
                            href={f.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "text-[11px] font-medium text-orange-600 hover:underline truncate",
                              referenceClientDesign &&
                                "max-w-full text-xs font-semibold text-slate-900 no-underline hover:text-slate-900",
                            )}
                            title={`View ${f.fileName}`}
                          >
                            {f.fileName}
                          </a>
                          <span
                            className={cn(
                              "text-[9px] text-slate-400 shrink-0",
                              referenceClientDesign &&
                                "text-[11px] text-slate-500",
                            )}
                          >
                            {referenceClientDesign
                              ? `Submitted ${
                                  f.uploadedAt
                                    ? format(
                                        f.uploadedAt.toDate(),
                                        "MMM d, yyyy · h:mm a",
                                      )
                                    : "—"
                                }`
                              : f.uploadedAt
                                ? format(
                                    f.uploadedAt.toDate(),
                                    "MMM d, yyyy h:mm a",
                                  )
                                : "—"}
                          </span>
                        </div>
                        {f.acknowledgedByAdmin ? (
                          <span
                            className={cn(
                              "flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0 shrink-0 h-5",
                              referenceClientDesign &&
                                "h-auto rounded-full border-0 px-2.5 py-1 text-[10px] text-emerald-800",
                            )}
                          >
                            {referenceClientDesign && (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            Acknowledged
                            {f.acknowledgedAt && !referenceClientDesign && (
                              <span className="font-normal text-emerald-500 opacity-80">
                                ·{" "}
                                {format(
                                  f.acknowledgedAt.toDate(),
                                  "MMM d, yyyy h:mm a",
                                )}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0 shrink-0 h-5",
                              referenceClientDesign &&
                                "inline-flex h-auto items-center gap-1 rounded-full border-0 px-2.5 py-1 text-[10px] text-amber-900",
                            )}
                          >
                            {referenceClientDesign && (
                              <Clock className="h-3 w-3" />
                            )}
                            Pending
                          </span>
                        )}
                      </div>
                      {referenceClientDesign &&
                        f.acknowledgedByAdmin &&
                        f.acknowledgedAt && (
                          <p className="px-1 text-[11px] text-emerald-800">
                            Acknowledged on{" "}
                            {format(
                              f.acknowledgedAt.toDate(),
                              "MMM d, yyyy · h:mm a",
                            )}
                          </p>
                        )}
                    </div>
                  ))}
                </div>
              )}
              {referenceClientDesign && hasPendingUpload && (
                <p className="text-xs leading-5 text-slate-600">
                  We&apos;ll notify you once the admin acknowledges your form.
                </p>
              )}

              {/* Attach/Upload workflow — hidden while a pending (unacknowledged) file exists, and hidden for read-only forms */}
              {!hasPendingUpload && form.formKey !== "ssreq" && (
                <div className="space-y-1.5">
                  {!attachedFile ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        ref={(el) => {
                          fileInputRefs.current[form.formKey] = el;
                        }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAttachFile(form, file);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRefs.current[form.formKey]?.click();
                        }}
                        disabled={isUploading}
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-bold text-orange-600 bg-white hover:bg-orange-600 hover:text-white border border-orange-500 rounded-full px-3 py-1 transition-all shrink-0 disabled:opacity-50",
                          referenceClientDesign &&
                            "rounded-xl px-4 py-2 hover:bg-orange-50 hover:text-orange-700",
                        )}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {referenceClientDesign && uploaded.length > 0
                          ? "Attach another form"
                          : "Attach Form"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div
                        className={cn(
                          "flex items-center gap-2 p-2 bg-blue-50/50 border border-blue-200 rounded-lg",
                          referenceClientDesign &&
                            "gap-3 rounded-xl border-slate-200 bg-white p-3",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50",
                            !referenceClientDesign && "hidden",
                          )}
                        >
                          <FileText className="h-4 w-4 text-orange-700" />
                        </span>
                        {!referenceClientDesign && (
                          <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {attachedFile.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {referenceClientDesign
                              ? `PDF · ${(attachedFile.size / 1024).toFixed(1)} KB · Ready to upload`
                              : `${(attachedFile.size / 1024).toFixed(1)} KB`}
                          </p>
                        </div>
                        <a
                          href={URL.createObjectURL(attachedFile)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "p-1 hover:bg-blue-100 rounded transition-colors",
                            referenceClientDesign &&
                              "rounded-lg p-2 hover:bg-slate-100",
                          )}
                          title="Preview file"
                          aria-label={`Preview ${attachedFile.name}`}
                        >
                          <Eye
                            className={cn(
                              "h-3.5 w-3.5 text-blue-600",
                              referenceClientDesign && "text-slate-600",
                            )}
                          />
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveAttachment(form.formKey);
                          }}
                          className={cn(
                            "p-1 hover:bg-red-100 rounded transition-colors",
                            referenceClientDesign &&
                              "rounded-lg p-2 hover:bg-red-50",
                          )}
                          title="Remove attachment"
                          aria-label={`Remove ${attachedFile.name}`}
                        >
                          {referenceClientDesign ? (
                            <Trash2 className="h-4 w-4 text-red-600" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-red-600" />
                          )}
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpload(form);
                        }}
                        disabled={isUploading}
                        className={cn(
                          "flex items-center gap-1.5 text-[11px] font-medium text-white bg-[#166FB5] hover:bg-[#0e4f8a] rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center",
                          referenceClientDesign &&
                            "h-11 rounded-xl bg-orange-700 text-sm font-semibold hover:bg-orange-800",
                        )}
                      >
                        {isUploading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        {isUploading
                          ? "Uploading…"
                          : referenceClientDesign
                            ? "Upload form"
                            : "Upload"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
