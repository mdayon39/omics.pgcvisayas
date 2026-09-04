"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import {
  getQuotationByReferenceNumber,
  markQuotationAsSeen,
} from "@/services/quotationService";
import { getChargeSlipById } from "@/services/chargeSlipService";
import { QuotationPDF } from "@/components/quotation/QuotationPDF";
import { ChargeSlipPDF } from "@/components/charge-slip/ChargeSlipPDF";
import { Loader2, ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { normalizeDate } from "@/lib/formatters";
import useAuth from "@/hooks/useAuth";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Dynamically import PDF components with SSR disabled
const PDFViewer = dynamic<any>(
  () => import("@react-pdf/renderer").then((mod) => (mod as any).PDFViewer),
  { ssr: false },
);

const PDFDownloadLink = dynamic<any>(
  () =>
    import("@react-pdf/renderer").then((mod) => (mod as any).PDFDownloadLink),
  { ssr: false },
);

function ViewDocumentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAdmin, loading: authLoading } = useAuth();

  const type = searchParams.get("type");
  const ref = searchParams.get("ref");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if device is mobile - more robust check including smaller screens
    const checkMobile = () => {
      const userAgent =
        navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileAgent =
        /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
          userAgent,
        );
      const isSmallScreen = window.innerWidth < 1024;

      if (isMobileAgent || isSmallScreen) {
        setIsMobile(true);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    async function fetchData() {
      // Wait for auth to be determined
      if (authLoading) return;

      if (!user) {
        toast.error("You must be logged in to view documents.");
        setLoading(false);
        return;
      }

      if (!type || !ref) {
        toast.error("Invalid document parameters.");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        if (type === "quotation") {
          const quotation = await getQuotationByReferenceNumber(ref);
          if (quotation) {
            // Verify ownership: Admin can view any, user can only view their own
            if (!isAdmin) {
              const userEmail = user.email?.toLowerCase();
              // QuotationRecord has email directly
              const quoteEmail = (quotation as any).email?.toLowerCase();
              const quoteUuid = (quotation as any).uuid;

              // 1. Check direct email match
              let hasAccess =
                userEmail === quoteEmail || quoteUuid === user.uid;

              // 2. Check team membership via inquiryId
              const inquiryId = (quotation as any).inquiryId;
              if (!hasAccess && inquiryId) {
                // Check if user is a member of this inquiry in 'clients' collection
                const clientQuery = query(
                  collection(db, "clients"),
                  where("inquiryId", "==", inquiryId),
                  where("email", "==", user.email),
                );
                const clientSnap = await getDocs(clientQuery);
                if (!clientSnap.empty) {
                  hasAccess = true;
                } else {
                  // Final check: Is it the original contact person email on the inquiry?
                  const inquirySnap = await getDoc(
                    doc(db, "inquiries", inquiryId),
                  );
                  if (inquirySnap.exists()) {
                    const inquiryData = inquirySnap.data();
                    if (inquiryData.email?.toLowerCase() === userEmail) {
                      hasAccess = true;
                    }
                  }
                }
              }

              if (!hasAccess) {
                toast.error(
                  "Access denied. This document does not belong to you.",
                );
                router.push("/client");
                return;
              }
            }
            setData(quotation);

            // Mark as seen if a client (not admin) is viewing it
            if (!isAdmin && quotation.inquiryId) {
              markQuotationAsSeen(quotation.inquiryId);
            }
          } else {
            toast.error("Quotation not found.");
          }
        } else if (type === "charge-slip") {
          const chargeSlip = await getChargeSlipById(ref);
          if (chargeSlip) {
            // Verify ownership: Admin can view any, user can only view their own
            if (!isAdmin) {
              const userEmail = user.email?.toLowerCase();
              // ChargeSlipRecord has clientInfo.email or cid
              const slipEmail =
                (chargeSlip as any).clientInfo?.email?.toLowerCase() ||
                (chargeSlip as any).cid?.toLowerCase();

              // 1. Check direct email match
              let hasAccess = userEmail === slipEmail;

              // 2. Check team membership via projectId/inquiryId
              if (!hasAccess) {
                const iidRaw =
                  (chargeSlip as any).inquiryId ||
                  (chargeSlip as any).project?.iid;
                const inquiryIds = Array.isArray(iidRaw)
                  ? iidRaw.filter(Boolean)
                  : iidRaw
                    ? [iidRaw]
                    : [];

                if (inquiryIds.length > 0) {
                  // Check clients collection for any of the inquiry IDs
                  // Firestore 'in' query works for up to 30 elements
                  const clientQuery = query(
                    collection(db, "clients"),
                    where("inquiryId", "in", inquiryIds.slice(0, 30)),
                    where("email", "==", user.email),
                  );
                  const clientSnap = await getDocs(clientQuery);
                  if (!clientSnap.empty) {
                    hasAccess = true;
                  } else {
                    // Also check inquiries collection for each ID (limited to first for simplicity or loop)
                    for (const inquiryId of inquiryIds.slice(0, 5)) {
                      // Limit to 5 for fast response
                      const inquirySnap = await getDoc(
                        doc(db, "inquiries", inquiryId),
                      );
                      if (inquirySnap.exists()) {
                        const inquiryData = inquirySnap.data();
                        if (inquiryData.email?.toLowerCase() === userEmail) {
                          hasAccess = true;
                          break;
                        }
                      }
                    }
                  }
                }
              }

              if (!hasAccess) {
                toast.error(
                  "Access denied. This document does not belong to you.",
                );
                router.push("/client");
                return;
              }
            }
            setData(chargeSlip);
          } else {
            toast.error("Charge slip not found.");
          }
        }
      } catch (err) {
        console.error("Error fetching document:", err);
        toast.error("Failed to load document.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [type, ref, user, isAdmin, authLoading, router]);

  if (loading || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#166FB5]" />
        <span className="ml-2">Loading document...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-slate-500">Document not found or error loading.</p>
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => router.back()}
            variant="ghost"
            size="icon"
            className="text-white hover:bg-slate-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-white font-medium">
            {type === "quotation" ? "Quotation" : "Charge Slip"} - {ref}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Always show Download button on mobile, as PDFViewer might fail or be hard to use */}
          {true && (
            <PDFDownloadLink
              document={
                type === "quotation" ? (
                  <QuotationPDF
                    services={data.services}
                    clientInfo={{
                      name: data.name,
                      institution: data.institution,
                      designation: data.designation,
                      email: data.email,
                    }}
                    referenceNumber={data.referenceNumber}
                    useInternalPrice={data.isInternal}
                    preparedBy={data.preparedBy}
                    totalsOverride={{
                      subtotal: data.subtotal,
                      discount: data.discount,
                      total: data.total,
                    }}
                    dateOfIssue={data.dateIssued}
                    useAffiliationAsClientName={data.useAffiliationAsClientName}
                  />
                ) : (
                  <ChargeSlipPDF
                    services={data.services}
                    client={data.client}
                    project={data.project}
                    chargeSlipNumber={data.chargeSlipNumber}
                    orNumber={data.orNumber ?? ""}
                    isInternal={data.isInternal ?? !!data.useInternalPrice}
                    useInternalPrice={data.useInternalPrice}
                    useAffiliationAsClientName={data.useAffiliationAsClientName}
                    preparedBy={data.preparedBy}
                    referenceNumber={data.referenceNumber}
                    clientInfo={data.clientInfo}
                    approvedBy={
                      data.approvedBy || {
                        name: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D.",
                        position: "AED, PGC Visayas",
                      }
                    }
                    dateIssued={normalizeDate(data.dateIssued ?? "")}
                    subtotal={data.subtotal}
                    discount={data.discount}
                    total={data.total}
                  />
                )
              }
              fileName={`${type}-${ref}.pdf`}
            >
              {({ loading }: { loading: boolean }) => (
                <Button
                  variant="default"
                  size="sm"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  {isMobile ? "Download PDF" : "Download"}
                </Button>
              )}
            </PDFDownloadLink>
          )}
          <Button onClick={() => router.back()} variant="secondary" size="sm">
            Return
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-300 space-y-4">
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl max-w-sm">
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Download className="h-8 w-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                Mobile PDF Viewing
              </h2>
              <p className="text-sm text-slate-400 mb-6">
                Direct PDF previews are limited on some mobile browsers. For the
                best experience, please download the document to view it on your
                device.
              </p>
              <PDFDownloadLink
                document={
                  type === "quotation" ? (
                    <QuotationPDF
                      services={data.services}
                      clientInfo={{
                        name: data.name,
                        institution: data.institution,
                        designation: data.designation,
                        email: data.email,
                      }}
                      referenceNumber={data.referenceNumber}
                      useInternalPrice={data.isInternal}
                      preparedBy={data.preparedBy}
                      totalsOverride={{
                        subtotal: data.subtotal,
                        discount: data.discount,
                        total: data.total,
                      }}
                      dateOfIssue={data.dateIssued}
                      useAffiliationAsClientName={
                        data.useAffiliationAsClientName
                      }
                    />
                  ) : (
                    <ChargeSlipPDF
                      services={data.services}
                      client={data.client}
                      project={data.project}
                      chargeSlipNumber={data.chargeSlipNumber}
                      orNumber={data.orNumber ?? ""}
                      isInternal={data.isInternal ?? !!data.useInternalPrice}
                      useInternalPrice={data.useInternalPrice}
                      useAffiliationAsClientName={
                        data.useAffiliationAsClientName
                      }
                      preparedBy={data.preparedBy}
                      referenceNumber={data.referenceNumber}
                      clientInfo={data.clientInfo}
                      approvedBy={
                        data.approvedBy || {
                          name: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D.",
                          position: "AED, PGC Visayas",
                        }
                      }
                      dateIssued={normalizeDate(data.dateIssued ?? "")}
                      subtotal={data.subtotal}
                      discount={data.discount}
                      total={data.total}
                    />
                  )
                }
                fileName={`${type}-${ref}.pdf`}
              >
                {({ loading }: { loading: boolean }) => (
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Preparing Document...
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5 mr-2" />
                        Download PDF
                      </>
                    )}
                  </Button>
                )}
              </PDFDownloadLink>
            </div>
          </div>
        ) : (
          <PDFViewer style={{ width: "100%", height: "100%", border: "none" }}>
            {type === "quotation" ? (
              <QuotationPDF
                services={data.services}
                clientInfo={{
                  name: data.name,
                  institution: data.institution,
                  designation: data.designation,
                  email: data.email,
                }}
                referenceNumber={data.referenceNumber}
                useInternalPrice={data.isInternal}
                preparedBy={data.preparedBy}
                totalsOverride={{
                  subtotal: data.subtotal,
                  discount: data.discount,
                  total: data.total,
                }}
                dateOfIssue={data.dateIssued}
                useAffiliationAsClientName={data.useAffiliationAsClientName}
              />
            ) : (
              <ChargeSlipPDF
                services={data.services}
                client={data.client}
                project={data.project}
                chargeSlipNumber={data.chargeSlipNumber}
                orNumber={data.orNumber ?? ""}
                isInternal={data.isInternal ?? !!data.useInternalPrice}
                useInternalPrice={data.useInternalPrice}
                useAffiliationAsClientName={data.useAffiliationAsClientName}
                preparedBy={data.preparedBy}
                referenceNumber={data.referenceNumber}
                clientInfo={data.clientInfo}
                approvedBy={
                  data.approvedBy || {
                    name: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D.",
                    position: "AED, PGC Visayas",
                  }
                }
                dateIssued={normalizeDate(data.dateIssued ?? "")}
                subtotal={data.subtotal}
                discount={data.discount}
                total={data.total}
              />
            )}
          </PDFViewer>
        )}
      </div>
    </div>
  );
}

export default function ViewDocumentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#166FB5]" />
        </div>
      }
    >
      <ViewDocumentContent />
    </Suspense>
  );
}
