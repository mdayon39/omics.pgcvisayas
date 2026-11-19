"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileText,
  CheckCircle2,
  ChevronDown,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { cn } from "@/lib/utils";

interface ClientConformeModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  clientName: string;
  designation: string;
  affiliation: string;
  projectTitle?: string;
  fundingAgency?: string;
  // Required for creating the conforme record
  inquiryId: string;
  clientEmail: string;
  clientUid?: string;
  projectPid?: string;
  projectRequestId?: string;
  hideProgressIndicator?: boolean;
  professionalLayout?: boolean;
}

export default function ClientConformeModal({
  open,
  onConfirm,
  onCancel,
  loading = false,
  clientName,
  designation,
  affiliation,
  projectTitle,
  fundingAgency,
  inquiryId,
  clientEmail,
  clientUid,
  projectPid,
  projectRequestId,
  hideProgressIndicator = false,
  professionalLayout = false,
}: ClientConformeModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canAgree, setCanAgree] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset canAgree when the modal opens
    if (open) {
      setCanAgree(false);
      setAgreed(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let observer: IntersectionObserver | null = null;
    let scrollViewport: HTMLElement | null = null;
    let timerId: any = null;

    // We use a small delay because Radix Dialogs/ScrollAreas
    // might not be fully measured in the DOM immediately upon 'open'
    const setup = () => {
      if (!bottomRef.current) return;

      // 1. Find the Radix ScrollArea viewport
      scrollViewport = bottomRef.current.closest(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLElement;

      // Fallback: If Radix attribute is missing, find any parent that might be scrolling
      if (!scrollViewport) {
        let parent = bottomRef.current.parentElement;
        while (parent && parent !== document.body) {
          const style = window.getComputedStyle(parent);
          if (style.overflowY === "auto" || style.overflowY === "scroll") {
            scrollViewport = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }

      // 2. Setup Intersection Observer - More aggressive
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            console.log("✅ Sentinel is now visible. Enabling agree checkbox.");
            setCanAgree(true);
          }
        },
        {
          // We don't specify 'root' if we want it to intersect with the true viewport,
          // but Radix viewport works too. Let's try both paths by using more lenient settings.
          threshold: 0,
          rootMargin: "250px", // Trigger as soon as you are within 250px of the bottom
        },
      );
      observer.observe(bottomRef.current);

      // 3. Setup Scroll Listener - Backup
      const handleScroll = () => {
        if (!scrollViewport) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollViewport;
        // User is near the bottom (within 250px)
        if (scrollHeight - scrollTop <= clientHeight + 250) {
          setCanAgree(true);
        }
      };

      if (scrollViewport) {
        scrollViewport.addEventListener("scroll", handleScroll, {
          passive: true,
        });
      }

      // 4. Manual check: Is the document so small that it is already at the bottom?
      const checkInitialState = () => {
        if (!scrollViewport) {
          // Fallback if no scroll container found: just enable it
          // to prevent users from getting stuck forever.
          setCanAgree(true);
          return;
        }
        if (scrollViewport.scrollHeight <= scrollViewport.clientHeight + 100) {
          setCanAgree(true);
        }
      };

      checkInitialState();

      return () => {
        if (scrollViewport) {
          scrollViewport.removeEventListener("scroll", handleScroll);
        }
        observer?.disconnect();
      };
    };

    // Run setup after a short delay
    timerId = setTimeout(setup, 300);

    return () => {
      clearTimeout(timerId);
    };
  }, [open]);

  const today = new Date().toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const filled = (value: string | undefined, fallback = "_______________") =>
    value && value.trim() ? value.trim() : fallback;

  const handleConfirm = async () => {
    if (!agreed) return;

    setSaving(true);
    try {
      if (!inquiryId || !clientEmail) {
        toast.error(
          "Missing required information. Please reload the page and try again.",
        );
        return;
      }

      const filled = (v: string | undefined) =>
        v && v.trim() ? v.trim() : "N/A";
      const now = new Date();
      const ts = Timestamp.fromDate(now);

      // Best Practice: Reuse the same document if the user re-agrees in the same session
      // This avoids generating multiple documents for the same submission attempt.
      const savedConformeId = localStorage.getItem("currentConformeId");
      const conformeId =
        savedConformeId && savedConformeId.startsWith(`${inquiryId}_`)
          ? savedConformeId
          : `${inquiryId}_${now.getTime()}`;

      // Save with 'agreed_pending' status - user has read and agreed but not yet completed submission
      await setDoc(
        doc(db, "clientConformes", conformeId),
        {
          data: {
            documentVersion: "PGCV-LF-CC-v005",
            clientName: filled(clientName),
            designation: filled(designation),
            affiliation: filled(affiliation),
            projectTitle: filled(projectTitle),
            fundingAgency: filled(fundingAgency),
            inquiryId,
            projectPid: projectPid ?? null,
            projectRequestId: projectRequestId ?? null,
            createdBy: clientEmail,
            ...(clientUid ? { uuid: clientUid } : {}),
            ...(clientUid ? { createdByUid: clientUid } : {}),
            clientIpAddress: "client_browser",
            userAgent:
              typeof navigator !== "undefined"
                ? navigator.userAgent
                : "unknown",
            agreementDate: ts,
            createdAt: ts, // This will be updated if they re-sign, which is technically correct (most recent agreement)
            status: "agreed_pending", // User agreed but hasn't completed submission yet
            conformeId: conformeId,
            clientSignature: {
              method: "typed_name",
              data: filled(clientName),
              timestamp: ts,
            },
            programDirectorSignature: {
              method: "auto_approved",
              data: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D.",
              signedBy: "vnferriols@up.edu.ph",
              timestamp: ts,
            },
          },
        },
        { merge: true },
      ); // Use merge: true to preserve any fields if somehow already existing

      console.log(
        "✅ Client Conforme recorded with 'agreed_pending' status:",
        conformeId,
      );
      toast.success("Got it! You're all set. Proceeding to final review...", {
        duration: 3000,
      });
      setAgreed(false);

      // Pass the conformeId to the parent for status tracking
      localStorage.setItem("currentConformeId", conformeId);
      onConfirm();
    } catch (error: unknown) {
      console.error("❌ Error saving Client Conforme:", error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("permission") || msg.includes("PERMISSION_DENIED")) {
        toast.error(
          "Permission denied. Please ask admin to update Firestore rules for clientConformes collection.",
        );
      } else {
        toast.error("Failed to record agreement. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setAgreed(false);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent
        className={cn(
          "flex h-[90vh] max-h-[90vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0",
          professionalLayout && "rounded-xl",
        )}
      >
        <DialogHeader
          className={
            hideProgressIndicator
              ? "sr-only"
              : "shrink-0 border-b border-slate-200 px-6 pb-3 pt-6"
          }
        >
          <DialogTitle className={hideProgressIndicator ? "" : "sr-only"}>
            Client Conforme
          </DialogTitle>
          {!hideProgressIndicator && (
            <div className="mb-3 flex items-center gap-2">
              <Badge
                variant="default"
                className="flex items-center gap-1 bg-[#166FB5] text-white"
              >
                <FileText className="h-3 w-3" />
                Step 1 of 3
              </Badge>
            </div>
          )}
        </DialogHeader>

        {professionalLayout && (
          <div className="shrink-0 border-b border-slate-200 px-5 py-4 text-center">
            <h2 className="text-xl font-semibold tracking-wide text-slate-900">
              CLIENT CONFORME
            </h2>
            <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-700">
              Philippine Genome Center Visayas
            </div>
            <p className="mt-0.5 text-[10px] tracking-wide text-slate-500">
              PGCV-LF-CC-V005
            </p>
          </div>
        )}

        {/* Scrollable document body */}
        <ScrollArea className="flex-1 min-h-0 w-full">
          <div
            className={cn(
              "mx-auto max-w-4xl px-8 py-4 font-serif text-sm leading-relaxed text-slate-700",
              professionalLayout &&
                "max-w-none px-5 py-4 font-sans text-[13px] leading-5",
            )}
          >
            {/* Header */}
            {!professionalLayout && (
              <div className="mb-4 space-y-1 text-center">
                <h2 className="text-2xl font-bold tracking-wide text-slate-900">
                  CLIENT CONFORME
                </h2>
                <div className="text-sm font-semibold uppercase tracking-wider text-slate-900">
                  Philippine Genome Center Visayas
                </div>
                <p className="font-sans text-xs tracking-widest text-slate-500">
                  PGCV-LF-CC-V005
                </p>
              </div>
            )}

            {/* Introduction - Simplified */}
            {professionalLayout ? (
              <div className="mb-5 flex items-start gap-3 rounded-lg bg-blue-100 px-4 py-3 text-blue-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-[13px] italic leading-5">
                  Before submitting, kindly carefully review and agree to our
                  Client Terms and Conditions.
                </p>
              </div>
            ) : (
              <div className="mb-4">
                <p className="text-center font-sans text-sm italic text-slate-500">
                  Before submitting, kindly carefully review and agree to our
                  Client Terms and Conditions.
                </p>
              </div>
            )}

            {/* Agreement Preamble */}
            <div className="mb-4 space-y-2">
              <p className="text-justify leading-relaxed">
                This agreement is made between{" "}
                <span
                  className={cn(
                    "font-bold text-slate-900 underline decoration-slate-400",
                    professionalLayout &&
                      "rounded bg-slate-100 px-1.5 py-0.5 no-underline",
                  )}
                >
                  {filled(clientName)}
                </span>
                ,{" "}
                <span
                  className={cn(
                    "font-bold text-slate-900 underline decoration-slate-400",
                    professionalLayout &&
                      "rounded bg-slate-100 px-1.5 py-0.5 no-underline",
                  )}
                >
                  {filled(designation)}
                </span>{" "}
                of the{" "}
                <span
                  className={cn(
                    "font-bold text-slate-900 underline decoration-slate-400",
                    professionalLayout &&
                      "rounded bg-slate-100 px-1.5 py-0.5 no-underline",
                  )}
                >
                  {filled(affiliation)}
                </span>
                , hereafter referred to as &ldquo;Client&rdquo; and the
                Philippine Genome Center Visayas (PGC Visayas), herein referred
                to as &ldquo;PGC Visayas&rdquo;, and covers all jobs under the
                Project/Study entitled:
              </p>

              <div
                className={cn(
                  "rounded-md border-2 border-slate-300 bg-slate-50 p-4 text-center",
                  professionalLayout &&
                    "rounded-lg border border-slate-300 bg-white px-4 py-4",
                )}
              >
                <p className="font-bold text-slate-900 italic">
                  {filled(projectTitle)}
                </p>
              </div>

              <p className="text-justify">
                with funding from the (Name of Funding Agency/Source of Fund){" "}
                <span
                  className={cn(
                    "font-bold text-slate-900 underline decoration-slate-400",
                    professionalLayout &&
                      "rounded bg-slate-100 px-1.5 py-0.5 no-underline",
                  )}
                >
                  {filled(fundingAgency)}
                </span>
              </p>
            </div>

            {/* Terms Sections */}
            <div
              className={cn(
                "space-y-6",
                professionalLayout && "space-y-4",
              )}
            >
              {/* Section 1 */}
              <div>
                <h3 className={cn(
                  "mb-2 text-base font-bold text-slate-900",
                  professionalLayout && "text-sm",
                )}>
                  Summary of the Deliverables of the Project
                </h3>
                <div className="space-y-3 text-justify">
                  <p>
                    The Client shall engage PGC Visayas to perform and deliver
                    the services in accordance with the agreed project
                    deliverables as discussed and approved by both parties.
                  </p>
                  <p>
                    The Client shall provide the required information and
                    materials, hereinafter collectively referred to as the
                    &ldquo;Samples&rdquo; and/or &ldquo;Data/Metadata,&rdquo;
                    and shall remit the corresponding Service Fee as detailed in
                    the approved Charge Slip for the Project.
                  </p>
                  <p>
                    In consideration thereof, PGC Visayas shall deliver the
                    agreed outputs, which may include a service report and/or
                    raw sequence data, within the specified project or service
                    duration.
                  </p>
                </div>
              </div>

              {/* Section 2 */}
              <div>
                <h3 className={cn(
                  "mb-2 text-base font-bold text-slate-900",
                  professionalLayout && "text-sm",
                )}>
                  Duration of the Project
                </h3>
                <p className="text-justify">
                  The service/project is in effect once PGC Visayas has received
                  the samples from the Client and is ended upon release of the
                  Service Report. For Equipment Use and Other Services, the
                  service/project is in effect upon receiving all necessary
                  details from the client and ends once the Client has finished
                  all necessary experiments. Any additional services beyond the
                  initial scope of the agreed terms for the project are subject
                  to additional charges and must be agreed upon between the
                  parties.
                </p>
              </div>

              {/* Section 3 */}
              <div>
                <h3 className={cn(
                  "mb-2 text-base font-bold text-slate-900",
                  professionalLayout && "text-sm",
                )}>
                  Compliance with Sample Submission Requirements
                </h3>
                <p className="text-justify">
                  The Client agrees to conform to the Sample Submission
                  Requirements set by PGC Visayas, who will, upon acceptance of
                  the samples, inspect the samples and perform necessary quality
                  check assays before any analysis. If the samples do not pass
                  the inspection or the quality checks, PGC Visayas has the
                  right to reject the samples and request the Client to submit
                  new samples. Should the Client wish to proceed without
                  resending new samples, the Client agrees that PGC Visayas will
                  not be liable for the resulting outcomes.
                </p>
              </div>

              {/* Section 4 */}
              <div>
                <h3 className={cn(
                  "mb-2 text-base font-bold text-slate-900",
                  professionalLayout && "text-sm",
                )}>
                  Sample Retention
                </h3>
                <p className="text-justify">
                  All submitted samples will be discarded immediately after
                  processing, except for sanger sequencing and NGS samples,
                  which will be discarded one week after the Project has ended.
                  For nucleic acid extraction, a backup of the purified DNA or
                  RNA will be kept one week after the project has ended. Back-up
                  sequence files will be kept for one month, during which the
                  Client may have his or her data re-sent for whatever purpose.
                  For NGS, libraries will be kept for six (6) months, and backup
                  files will be kept for one (1) year only. The Client may
                  request PGC Visayas not to keep any backup files or samples.
                  In this case, PGC Visayas will discard all samples and data
                  upon project completion.
                </p>
              </div>

              {/* Section 5 */}
              <div>
                <h3 className={cn(
                  "mb-2 text-base font-bold text-slate-900",
                  professionalLayout && "text-sm",
                )}>
                  Confidentiality
                </h3>
                <p className="text-justify">
                  PGC Visayas agrees to keep all data strictly confidential and
                  will be accessible only to those involved in the project, as
                  agreed upon by PGC Visayas and the Client.
                </p>
              </div>

              {/* Section 6 */}
              <div>
                <h3 className={cn(
                  "mb-2 text-base font-bold text-slate-900",
                  professionalLayout && "text-sm",
                )}>
                  Ownership
                </h3>
                <p className="text-justify">
                  The Client retains full ownership of all data and intellectual
                  property rights arising from the Project. However, PGC Visayas
                  must be properly acknowledged in any presentations, reports,
                  or publications resulting from the services rendered.
                </p>
              </div>

              {/* Section 7 */}
              <div>
                <h3 className={cn(
                  "mb-2 text-base font-bold text-slate-900",
                  professionalLayout && "text-sm",
                )}>
                  Terms of Payment
                </h3>
                <p className="text-justify">
                  The Client agrees that payment should be received within
                  thirty (30) days after the receipt of the Charge Slip. Should
                  the Client fail to comply with this requirement, any
                  deliverables stipulated in Section I shall not be released.
                </p>
              </div>
            </div>

            {/* Confirmation Statement */}
            <div
              className={cn(
                "mt-8 rounded-md border border-slate-300 bg-slate-50 p-4",
                professionalLayout && "mt-6",
              )}
            >
              <p
                className={cn(
                  "text-center text-sm italic text-slate-700",
                  professionalLayout && "text-[13px]",
                )}
              >
                By checking the agreement box and submitting this form, the
                Client confirms that they have read, understood, and agreed to
                all the above terms and conditions.
              </p>
            </div>

            {/* Signature Block */}
            <div
              className={cn(
                "mt-10 grid grid-cols-1 gap-12 md:grid-cols-2",
                professionalLayout && "mt-8 gap-8",
              )}
            >
              {/* Client */}
              <div className="space-y-4">
                <p
                  className={cn(
                    "text-base font-semibold text-slate-900",
                    professionalLayout && "text-sm",
                  )}
                >
                  Client:
                </p>
                <div className="space-y-2">
                  <div className="border-b-2 border-slate-900 pb-2">
                    <p className="text-sm font-bold uppercase text-slate-900">
                      {filled(clientName)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">
                    Client Name
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="border-b-2 border-slate-900 pb-2">
                    <p className="text-slate-900 text-sm">{today}</p>
                  </div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">
                    Date
                  </p>
                </div>
              </div>

              {/* PGC Visayas */}
              <div className="space-y-4">
                <p
                  className={cn(
                    "text-base font-semibold text-slate-900",
                    professionalLayout && "text-sm",
                  )}
                >
                  PGC Visayas:
                </p>
                <div className="space-y-2">
                  <div className="border-b-2 border-slate-900 pb-2">
                    <p className="text-sm font-bold text-slate-900">
                      VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D.
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">
                    Director, PGC Visayas
                  </p>
                </div>
              </div>
            </div>

            {/* Scroll Observer Sentinel */}
            <div ref={bottomRef} className="h-20 w-full" />
          </div>
        </ScrollArea>

        {/* Footer: agree checkbox + buttons */}
        {professionalLayout ? (
          <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white px-4 py-3">
            {!canAgree && (
              <p className="flex items-center gap-1.5 text-xs text-[#1769AA]">
                <ChevronDown className="h-3.5 w-3.5" />
                Please scroll to the bottom to agree
              </p>
            )}
            <label
              className={cn(
                "flex items-center gap-3 rounded-lg border bg-white p-3 transition-colors",
                !canAgree
                  ? "cursor-not-allowed border-slate-200 opacity-70"
                  : "group cursor-pointer border-slate-200 hover:border-slate-300",
              )}
            >
              <Checkbox
                id="conforme-agree"
                checked={agreed}
                disabled={!canAgree}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="shrink-0"
              />
              <span className="text-[13px] font-medium text-slate-600">
                I have read and understood the Client Conforme agreement
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={loading}
                className="h-9 px-5 text-[13px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!agreed || !canAgree || loading || saving}
                className="h-9 bg-[#2878D4] px-4 text-[13px] font-semibold text-white hover:bg-[#2168BD] disabled:bg-none disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100"
              >
                {loading || saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {saving ? "Recording Agreement…" : "Processing…"}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />I Agree & Continue
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 space-y-4 border-t border-slate-200 bg-slate-50 px-6 py-4">
            <label
              className={`flex items-start gap-3 rounded-lg border bg-white p-3 transition-colors ${
                !canAgree
                  ? "cursor-not-allowed border-slate-200 opacity-60"
                  : "group cursor-pointer border-slate-200 hover:border-slate-300"
              }`}
            >
              <Checkbox
                id="conforme-agree"
                checked={agreed}
                disabled={!canAgree}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5 shrink-0"
              />
              <div className="space-y-1">
                <span className="text-sm font-medium text-slate-700 transition-colors">
                  I have read and understood the Client Conforme agreement
                </span>
                {!canAgree && (
                  <p className="flex items-center gap-1 text-xs font-medium text-amber-500">
                    <ChevronDown className="h-3 w-3 animate-bounce" />
                    Please scroll to the bottom to agree
                  </p>
                )}
              </div>
            </label>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={loading}
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!agreed || !canAgree || loading || saving}
                className="bg-gradient-to-r from-[#166FB5] to-[#4038AF] px-6 font-semibold text-white hover:from-[#166FB5]/90 hover:to-[#4038AF]/90 disabled:opacity-50"
              >
                {loading || saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {saving ? "Recording Agreement…" : "Processing…"}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />I Agree & Continue
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
