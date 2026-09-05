"use client";

import { useEffect, useRef, useState } from "react";
import { db, storage } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
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
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";
import { logActivity } from "@/services/activityLogService";
import {
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Trash2,
  Upload,
  Download,
  Paperclip,
  X,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ServiceReport } from "@/services/serviceReportService";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import { Inquiry } from "@/types/Inquiry";
import { QuotationRecord } from "@/types/Quotation";

interface Props {
  projectId: string;
  clientEmail?: string;
  clientName?: string;
  /** Charge slips linked to the project; used to gate service-report uploads. */
  chargeSlips?: ChargeSlipRecord[];
  /** Inquiries linked to the project; at least one must be "Approved Client". */
  linkedInquiries?: Inquiry[];
  /** Quotations linked to the project; at least one must be "selected" unless explicitly overridden. */
  quotations?: QuotationRecord[];
  /** Allow service report attachment without the corresponding prerequisite. */
  allowWithoutQuotation?: boolean;
  allowWithoutChargeSlip?: boolean;
}

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminServiceReport({
  projectId,
  clientEmail,
  clientName,
  chargeSlips = [],
  linkedInquiries = [],
  quotations = [],
  allowWithoutQuotation = false,
  allowWithoutChargeSlip = false,
}: Props) {
  const { adminInfo } = useAuth();
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ServiceReport | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gate: at least one linked inquiry must be "Approved Client", a charge
  // slip must be paid or waived, and a selected quotation must exist unless
  // explicitly overridden.
  const hasApprovedInquiry = linkedInquiries.some(
    (inq) => inq.status === "Approved Client",
  );
  const hasEligibleChargeSlip = chargeSlips.some((chargeSlip) => {
    const status = (chargeSlip.status ?? "").trim().toLowerCase();
    return status === "paid" || status === "waived";
  });
  const hasSelectedQuotation = quotations.some(
    (q) => (q.status ?? "").toLowerCase() === "selected",
  );
  const canAttach =
    linkedInquiries.length > 0 &&
    hasApprovedInquiry &&
    (allowWithoutChargeSlip || hasEligibleChargeSlip) &&
    (allowWithoutQuotation || (quotations.length > 0 && hasSelectedQuotation));
  const attachBlockReason = (() => {
    if (linkedInquiries.length === 0)
      return "No inquiries are linked to this project. At least one inquiry with an 'Approved Client' status is required.";
    if (!hasApprovedInquiry)
      return "None of the linked inquiries have an 'Approved Client' status. Update the inquiry status before attaching a service report.";
    if (!allowWithoutChargeSlip && chargeSlips.length === 0)
      return "No charge slips found for this project. A Paid or Waived charge slip is required before attaching a service report.";
    if (!allowWithoutChargeSlip && !hasEligibleChargeSlip)
      return "A charge slip must have a Paid or Waived status before attaching a service report.";
    if (!allowWithoutQuotation && quotations.length === 0)
      return "No quotations found for this project. At least one quotation with a 'Selected' status is required.";
    if (!allowWithoutQuotation && !hasSelectedQuotation)
      return "None of the quotations are marked as Selected. At least one quotation must be Selected before attaching a service report.";
    return null;
  })();

  // Real-time listener
  useEffect(() => {
    if (!projectId) return;
    const q = query(
      collection(db, "projects", projectId, "serviceReports"),
      orderBy("uploadedAt", "desc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setReports(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ServiceReport),
      );
    });
    return unsub;
  }, [projectId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("File must be 20 MB or less.");
      return;
    }

    setPendingFile(file);
  };

  const handleUpload = async () => {
    const file = pendingFile;
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      const ext = file.name.split(".").pop();
      const uniqueName = `${Date.now()}-${file.name}`;
      const path = `serviceReports/${projectId}/${uniqueName}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            setUploadProgress(
              Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
            );
          },
          reject,
          resolve,
        );
      });

      const fileUrl = await getDownloadURL(sRef);

      const projectUpdate: Record<string, unknown> = {};

      if (adminInfo?.name) {
        projectUpdate.serviceReportUploaderName = adminInfo.name;
      }
      if (adminInfo?.email) {
        projectUpdate.serviceReportUploaderEmail = adminInfo.email;
      }

      if (Object.keys(projectUpdate).length > 0) {
        await updateDoc(doc(db, "projects", projectId), projectUpdate);
      }

      await addDoc(collection(db, "projects", projectId, "serviceReports"), {
        fileName: file.name,
        fileUrl,
        storagePath: path,
        fileSize: file.size,
        contentType: file.type,
        uploadedAt: serverTimestamp(),
        uploadedBy: adminInfo?.email || "system",
        uploadedByName: adminInfo?.name || "Admin",
        uploadedByEmail: adminInfo?.email || null,
        exceptionEnabled: allowWithoutQuotation,
        projectId,
      });

      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "CREATE",
        entityType: "project",
        entityId: projectId,
        entityName: file.name,
        description: `Uploaded service report "${file.name}" for project ${projectId}`,
      });

      // Send notification email to client
      if (clientEmail) {
        const recipientName = clientName || "Client";
        const portalUrl = "https://omics.pgcvisayas.upv.edu.ph/portal";

        const emailHtml = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
            <div style="background-color: #f1f5f9; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <h2 style="color: #1e3a8a; margin-top: 0;">Service Report Available - PGC Visayas</h2>
              <p>Dear ${recipientName},</p>
              <p>Your service report is now available in your client portal.</p>
              <p>You may log in to access and review the results at your convenience. Should you have any questions or require further clarification, please feel free to contact us.</p>

              <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; border-left: 4px solid #1e3a8a; margin: 15px 0;">
                <h3 style="margin-top: 0; color: #1e3a8a; font-size: 14px; margin-bottom: 8px;">Access Your Report</h3>
                <p style="margin-bottom: 12px; font-size: 14px;">Log in to your client portal to view and download your service report.</p>
                <p style="margin: 0;"><a href="${portalUrl}" style="background-color: #1e3a8a; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 600; font-size: 13px;">Log in to Client Portal</a></p>
              </div>

              <p>Thank you for choosing our services.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">Yours in utilizing OMICS for a better Philippines,<br /><strong>Philippine Genome Center Visayas</strong></p>
            </div>
          </div>
        `;

        const emailText = `Service Report Available - PGC Visayas

Dear ${recipientName},

Your service report is now available in your client portal.

You may log in to access and review the results at your convenience. Should you have any questions or require further clarification, please feel free to contact us.

To view your service report, kindly log in to your Client Portal: ${portalUrl}

Thank you for choosing our services.

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas`.trim();

        try {
          await addDoc(collection(db, "mail"), {
            to: [clientEmail],
            message: {
              subject: "Service Report Available: PGC Visayas",
              text: emailText,
              html: emailHtml,
            },
          });

          // In-app notification
          const notificationUuid =
            quotations.find((quotation) => quotation.email === clientEmail)
              ?.uuid ||
            linkedInquiries.find((inquiry) => inquiry.email === clientEmail)
              ?.uuid;
          await addDoc(collection(db, "clientNotifications"), {
            recipientEmail: clientEmail,
            ...(notificationUuid ? { uuid: notificationUuid } : {}),
            type: "serviceReport",
            title: "Service Report Available",
            body: "Your service report is now available in the client portal. Please log in to access your results.",
            read: false,
            createdAt: new Date(),
          });
        } catch (emailErr) {
          console.warn("Service report email could not be sent:", emailErr);
        }
      }

      toast.success(`"${file.name}" uploaded successfully.`);
      setPendingFile(null);
    } catch (err) {
      console.error("Service report upload error:", err);
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (report: ServiceReport) => {
    setDeleting(report.id);
    try {
      // Delete from Storage
      if (report.storagePath) {
        try {
          await deleteObject(storageRef(storage, report.storagePath));
        } catch {
          // Storage object may already be gone — continue with Firestore delete
        }
      }
      await deleteDoc(
        doc(db, "projects", projectId, "serviceReports", report.id),
      );

      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "DELETE",
        entityType: "project",
        entityId: projectId,
        entityName: report.fileName,
        description: `Deleted service report "${report.fileName}" from project ${projectId}`,
      });

      toast.success(`"${report.fileName}" deleted.`);
    } catch (err) {
      console.error("Service report delete error:", err);
      toast.error("Delete failed.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* Existing reports */}
      {reports.length === 0 ? (
        <p className="text-xs text-slate-400 ml-5">
          No service reports uploaded yet
        </p>
      ) : (
        <div className="space-y-1 ml-5">
          {reports.map((report) => {
            const uploadedAtDate = report.uploadedAt?.toDate
              ? format(report.uploadedAt.toDate(), "MMM d, yyyy")
              : "";
            const uploadedAtTime = report.uploadedAt?.toDate
              ? format(report.uploadedAt.toDate(), "h:mm a")
              : "";
            const isReceived = report.status === "received";
            const receivedDate = report.receivedAt?.toDate
              ? format(report.receivedAt.toDate(), "MMM d, yyyy h:mm a")
              : "";
            return (
              <div
                key={report.id}
                className="flex items-center justify-between gap-2 py-1 border-b border-slate-50 last:border-0 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <a
                      href={report.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-700 hover:underline truncate block"
                      title={report.fileName}
                    >
                      {report.fileName}
                    </a>
                    {uploadedAtDate && (
                      <span className="text-[10px] text-slate-400 block">
                        {uploadedAtDate}{" "}
                        {uploadedAtTime && (
                          <span className="text-slate-400">
                            {uploadedAtTime}
                          </span>
                        )}{" "}
                        · {report.uploadedByName}
                      </span>
                    )}
                    {isReceived ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] text-green-700 border-green-200 bg-green-50 gap-1 py-0 px-1.5 h-4"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Received
                        </Badge>
                        {receivedDate && (
                          <span className="text-[10px] text-slate-400">
                            {receivedDate}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] text-amber-700 border-amber-200 bg-amber-50 gap-1 py-0 px-1.5 h-4"
                        >
                          <Clock className="h-2.5 w-2.5" />
                          Pending
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={report.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-400 hover:text-blue-600" />
                  </a>
                  {(!isReceived ||
                    adminInfo?.role?.toLowerCase().replace(/\s+/g, "") ===
                      "superadmin") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={deleting === report.id}
                      onClick={() => setConfirmDelete(report)}
                      title={
                        isReceived
                          ? "Received reports can only be deleted by a Super Admin"
                          : "Delete report"
                      }
                    >
                      {deleting === report.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload control */}
      <div className="ml-5">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.zip"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
            <span>Uploading… {uploadProgress}%</span>
          </div>
        ) : pendingFile ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 min-w-0 flex-1 truncate">
              <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="truncate font-medium">{pendingFile.name}</span>
              <span className="text-slate-400 shrink-0">
                ({(pendingFile.size / 1024).toFixed(0)} KB)
              </span>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              onClick={handleUpload}
            >
              <Upload className="h-3 w-3" />
              Upload
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 shrink-0"
              onClick={() => setPendingFile(null)}
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={!canAttach}
              className="h-7 text-xs gap-1.5 border-dashed disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                if (!canAttach) return;

                fileInputRef.current?.click();
              }}
            >
              <Paperclip className="h-3 w-3" />
              Attach Service Report
            </Button>
            {!canAttach && attachBlockReason && (
              <p className="flex items-start gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 leading-snug">
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                {attachBlockReason}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-700">
                &ldquo;{confirmDelete?.fileName}&rdquo;
              </span>
              ? This action cannot be undone and the file will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) {
                  handleDelete(confirmDelete);
                  setConfirmDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
