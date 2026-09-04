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
import { Loader2, FileText, CheckCircle2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { doc, setDoc, Timestamp } from "firebase/firestore";

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
      <DialogContent className="max-w-4xl w-full flex flex-col h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-200 shrink-0">
          {/* Progress Indicator */}
          <div className="flex items-center gap-2 mb-3">
            <Badge
              variant="default"
              className="bg-[#166FB5] text-white flex items-center gap-1"
            >
              <FileText className="h-3 w-3" />
              Step 1 of 3
            </Badge>
          </div>
        </DialogHeader>

        {/* Scrollable document body */}
        <ScrollArea className="flex-1 min-h-0 w-full">
          <div className="px-8 py-4 text-sm text-slate-700 leading-relaxed font-serif max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center space-y-1 mb-4">
              <h2 className="font-bold text-2xl text-slate-900 tracking-wide">
                CLIENT CONFORME
              </h2>
              <div className="text-slate-900 uppercase font-semibold tracking-wider text-sm">
                Philippine Genome Center Visayas
              </div>
              <p className="text-xs text-slate-500 font-sans tracking-widest">
                PGCV-LF-CC-V005
              </p>
            </div>

            {/* Introduction - Simplified */}
            <div className="mb-4">
              <p className="text-sm text-slate-700 font-sans text-center italic text-slate-500">
                Before submitting, kindly carefully review and agree to our
                Client Terms and Conditions.
              </p>
            </div>

            {/* Agreement Preamble */}
            <div className="mb-4 space-y-2">
              <p className="text-justify leading-relaxed">
                This agreement is made between{" "}
                <span className="font-bold text-slate-900 underline decoration-slate-400">
                  {filled(clientName)}
                </span>
                ,{" "}
                <span className="font-bold text-slate-900 underline decoration-slate-400">
                  {filled(designation)}
                </span>{" "}
                of the{" "}
                <span className="font-bold text-slate-900 underline decoration-slate-400">
                  {filled(affiliation)}
                </span>
                , hereafter referred to as &ldquo;Client&rdquo; and the
                Philippine Genome Center Visayas (PGC Visayas), herein referred
                to as &ldquo;PGC Visayas&rdquo;, and covers all jobs under the
                Project/Study entitled:
              </p>

              <div className="bg-slate-50 border-2 border-slate-300 rounded-md p-4 text-center">
                <p className="font-bold text-slate-900 italic">
                  {filled(projectTitle)}
                </p>
              </div>

              <p className="text-justify">
                with funding from the (Name of Funding Agency/Source of Fund){" "}
                <span className="font-bold text-slate-900 underline decoration-slate-400">
                  {filled(fundingAgency)}
                </span>
              </p>
            </div>

            {/* Terms Sections */}
            <div className="space-y-6">
              {/* Section 1 */}
              <div>
                <h3 className="font-bold text-slate-900 mb-2 text-base">
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
                <h3 className="font-bold text-slate-900 mb-2 text-base">
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
                <h3 className="font-bold text-slate-900 mb-2 text-base">
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
                <h3 className="font-bold text-slate-900 mb-2 text-base">
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
                <h3 className="font-bold text-slate-900 mb-2 text-base">
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
                <h3 className="font-bold text-slate-900 mb-2 text-base">
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
                <h3 className="font-bold text-slate-900 mb-2 text-base">
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
            <div className="mt-8 bg-slate-50 border border-slate-300 rounded-md p-4">
              <p className="text-sm text-slate-700 text-center italic">
                By checking the agreement box and submitting this form, the
                Client confirms that they have read, understood, and agreed to
                all the above terms and conditions.
              </p>
            </div>

            {/* Signature Block */}
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Client */}
              <div className="space-y-4">
                <p className="font-semibold text-slate-900 text-base">
                  Client:
                </p>
                <div className="space-y-2">
                  <div className="border-b-2 border-slate-900 pb-2">
                    <p className="font-bold text-slate-900 uppercase text-sm">
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
                <p className="font-semibold text-slate-900 text-base">
                  PGC Visayas:
                </p>
                <div className="space-y-2">
                  <div className="border-b-2 border-slate-900 pb-2">
                    <p className="font-bold text-slate-900 text-sm">
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
        <div className="shrink-0 border-t border-slate-200 px-6 py-4 bg-slate-50 space-y-4">
          <label
            className={`flex items-start gap-3 p-3 bg-white border rounded-lg transition-colors ${
              !canAgree
                ? "cursor-not-allowed border-slate-200 opacity-60"
                : "cursor-pointer border-slate-200 hover:border-slate-300 group"
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
              <span className="text-sm text-slate-700 transition-colors font-medium">
                I have read and understood the Client Conforme agreement
              </span>
              {!canAgree && (
                <p className="text-xs text-amber-500 font-medium flex items-center gap-1">
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
              className="px-6 bg-gradient-to-r from-[#166FB5] to-[#4038AF] hover:from-[#166FB5]/90 hover:to-[#4038AF]/90 text-white font-semibold disabled:opacity-50"
            >
              {loading || saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {saving ? "Recording Agreement…" : "Processing…"}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />I Agree & Continue
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
