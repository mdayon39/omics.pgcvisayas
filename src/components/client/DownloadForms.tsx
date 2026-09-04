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
} from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import useAuth from "@/hooks/useAuth";
import { format } from "date-fns";

interface FormEntry {
  label: string;
  description: string;
  storagePath: string;
  formKey: string;
}

const PORTAL_FORMS: FormEntry[] = [
  {
    label: "Sample Submission Requirements",
    description: "VSF-LR-SSR Rev. 005 — Read before submitting samples",
    storagePath:
      "forms/VSF-LR-SSR_Sample Submission Requirements and Form_v6.pdf",
    formKey: "ssreq",
  },
  {
    label: "Sample Submission Form",
    description: "PGCV-LF-SSF Rev. 001 — Fill out and include with shipment",
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
}

export default function DownloadForms({ projectId }: DownloadFormsProps) {
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
    <div className="ml-5 mb-2 space-y-2">
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
            className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden"
          >
            {/* Header row */}
            <div className="w-full flex items-center justify-between gap-2 px-3 py-1.5">
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
            </div>

            {/* Upload panel */}
            <div className="border-t border-slate-100 px-3 py-2 bg-white/60 space-y-1.5">
              {/* Uploaded files listed ABOVE the upload button */}
              {uploaded.length > 0 && (
                <div className="space-y-2">
                  {uploaded.map((f) => (
                    <div key={f.id} className="space-y-1">
                      <div className="flex items-center gap-1.5 rounded-md bg-slate-50 border border-slate-100 px-2 py-0.5">
                        {f.acknowledgedByAdmin ? (
                          <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Clock className="h-2.5 w-2.5 shrink-0 text-amber-400" />
                        )}
                        {/* Clickable filename */}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <a
                            href={f.downloadURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] font-medium text-orange-600 hover:underline truncate"
                            title={`View ${f.fileName}`}
                          >
                            {f.fileName}
                          </a>
                          <span className="text-[9px] text-slate-400 shrink-0">
                            {f.uploadedAt
                              ? format(
                                  f.uploadedAt.toDate(),
                                  "MMM d, yyyy h:mm a",
                                )
                              : "—"}
                          </span>
                        </div>
                        {f.acknowledgedByAdmin ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0 shrink-0 h-5">
                            Acknowledged
                            {f.acknowledgedAt && (
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
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0 shrink-0 h-5">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
                        className="flex items-center gap-1.5 text-xs font-bold text-orange-600 bg-white hover:bg-orange-600 hover:text-white border border-orange-500 rounded-full px-3 py-1 transition-all shrink-0 disabled:opacity-50"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Attach Form
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-blue-50/50 border border-blue-200 rounded-lg">
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-slate-800 truncate">
                            {attachedFile.name}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {(attachedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <a
                          href={URL.createObjectURL(attachedFile)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 hover:bg-blue-100 rounded transition-colors"
                          title="Preview file"
                        >
                          <Eye className="h-3.5 w-3.5 text-blue-600" />
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveAttachment(form.formKey);
                          }}
                          className="p-1 hover:bg-red-100 rounded transition-colors"
                          title="Remove attachment"
                        >
                          <X className="h-3.5 w-3.5 text-red-600" />
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpload(form);
                        }}
                        disabled={isUploading}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-white bg-[#166FB5] hover:bg-[#0e4f8a] rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
                      >
                        {isUploading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3" />
                        )}
                        {isUploading ? "Uploading…" : "Upload"}
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
