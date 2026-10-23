// src/components/charge-slip/ChargeSlipPDFActions.tsx
"use client";

import { pdf } from "@react-pdf/renderer";
import { saveChargeSlipAction } from "@/app/actions/chargeSlipActions";
import { sendChargeSlipNotification } from "@/services/chargeSlipEmailService";
import { ChargeSlipPDF } from "./ChargeSlipPDF";
import { SelectedService } from "@/types/SelectedService";
import { Client } from "@/types/Client";
import { Project } from "@/types/Project";
import { AdminInfo } from "@/types/Admin";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import { sanitizeObject } from "@/lib/sanitizeObject";
import { normalizeDate } from "@/lib/formatters";
import useAuth from "@/hooks/useAuth";

interface ChargeSlipPDFActionsProps {
  services: SelectedService[];
  client: Client;
  project: Project;
  chargeSlipNumber: string;
  orNumber?: string;
  useInternalPrice: boolean;
  useAffiliationAsClientName?: boolean;
  preparedBy: AdminInfo;
  referenceNumber: string;
  clientInfo: {
    name: string;
    institution: string;
    designation: string;
    email: string;
  };
  approvedBy?: AdminInfo;
  dateIssued: string;
  subtotal: number;
  discount: number;
  total: number;
}

// Fallback approver
const DEFAULT_APPROVER: AdminInfo = {
  name: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D.",
  position: "AED, PGC Visayas",
};

export default function ChargeSlipPDFActions({
  services,
  client,
  project,
  chargeSlipNumber,
  orNumber = "",
  useInternalPrice,
  useAffiliationAsClientName,
  preparedBy,
  referenceNumber,
  clientInfo,
  approvedBy = DEFAULT_APPROVER,
  dateIssued,
  subtotal,
  discount,
  total,
}: ChargeSlipPDFActionsProps) {
  const { adminInfo } = useAuth();
  const router = useRouter();

  const handleGenerateAndSave = async () => {
    try {
      const rawRecord: ChargeSlipRecord = {
        id: chargeSlipNumber,
        chargeSlipNumber,
        referenceNumber,
        projectId: project?.pid ?? "",
        cid: client?.cid ?? "",
        client,
        project,
        services,
        useInternalPrice,
        useAffiliationAsClientName,
        preparedBy,
        approvedBy,
        clientInfo,
        orNumber,
        dateIssued,
        subtotal,
        discount,
        total,

        // Add this line to prevent `undefined` error
        dateOfOR: null,
      };

      const sanitized = sanitizeObject(rawRecord) as ChargeSlipRecord;
      const result = await saveChargeSlipAction(sanitized, {
        name: adminInfo?.name || "System",
        email: adminInfo?.email || "system@pgc.admin"
      });

      if (result.success) {
        const emailResult = await sendChargeSlipNotification(sanitized);
        const blob = await pdf(
          <ChargeSlipPDF
            services={services}
            client={client}
            project={project}
            chargeSlipNumber={chargeSlipNumber}
            orNumber={orNumber}
            isInternal={useInternalPrice}
            useInternalPrice={useInternalPrice}
            useAffiliationAsClientName={useAffiliationAsClientName}
            preparedBy={preparedBy}
            approvedBy={approvedBy}
            referenceNumber={referenceNumber}
            clientInfo={clientInfo}
            dateIssued={normalizeDate(dateIssued)}
            subtotal={subtotal}
            discount={discount}
            total={total}
          />
        ).toBlob();

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${chargeSlipNumber}.pdf`;
        link.click();
        URL.revokeObjectURL(url);

        if (emailResult.queued) {
          toast.success("Charge slip saved, downloaded, and billing email queued.");
        } else {
          toast.success("Charge slip saved and downloaded successfully!");
          toast.error(
            `Charge slip saved, but the billing email could not be queued: ${emailResult.error}`,
          );
        }
        router.push("/admin/charge-slips");
      } else {
        toast.error(result.error || "Failed to save charge slip");
      }
    } catch (err) {
      console.error("Error saving or generating PDF:", err);
      toast.error("Failed to save charge slip. Please try again.");
    }
  };

  return (
    <button
      onClick={handleGenerateAndSave}
      className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
    >
      Generate Final Charge Slip
    </button>
  );
}