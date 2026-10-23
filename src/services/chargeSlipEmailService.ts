import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { resolveClientUuid } from "@/services/clientUuidService";
import {
  beginEmailMonitorEvent,
  markEmailMonitorFailed,
  markEmailMonitorQueued,
} from "@/services/emailMonitoringClient";
import type { ChargeSlipRecord } from "@/types/ChargeSlipRecord";

const MODE_OF_PAYMENT_URL =
  "https://firebasestorage.googleapis.com/v0/b/pgc-genomebase.firebasestorage.app/o/documents%2FMode%20of%20Payment_PGCV-MP-v005.pdf?alt=media&token=bb3d7fdf-77db-430c-9b3a-6b56724bca84";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function sendChargeSlipNotification(
  slip: ChargeSlipRecord,
): Promise<{ queued: boolean; error?: string }> {
  const recipientEmail = (
    slip.clientInfo?.email ||
    slip.client?.email ||
    ""
  )
    .trim()
    .toLowerCase();
  const sourceId = slip.referenceNumber || slip.id || "unknown";
  const monitorEventId = await beginEmailMonitorEvent(
    "Charge slip",
    recipientEmail,
    sourceId,
  );

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    const error = new Error("No valid client email address was available.");
    await markEmailMonitorFailed(monitorEventId, error);
    return { queued: false, error: error.message };
  }

  const clientName =
    slip.clientInfo?.name?.trim() || slip.client?.name?.trim() || "Valued Client";
  const safeClientName = escapeHtml(clientName);
  const emailHtml = `
    <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;color:#334155;line-height:1.6">
      <div style="background-color:#f1f5f9;padding:24px;border-radius:8px;border:1px solid #e2e8f0">
        <h2 style="color:#1e3a8a;margin-top:0">Billing/Invoice: PGC Visayas</h2>
        <p>Dear ${safeClientName},</p>
        <p>Good day. Your billing is now available in your client portal. Kindly review the details and proceed with payment at your convenience. For payment instructions, please refer to our <a href="${MODE_OF_PAYMENT_URL}" style="color:#1e3a8a;font-weight:600;text-decoration:underline">Mode of Payment</a>.</p>
        <div style="background-color:#ffffff;padding:15px;border-radius:6px;border-left:4px solid #1e3a8a;margin:15px 0">
          <h3 style="margin-top:0;color:#1e3a8a;font-size:14px;margin-bottom:8px">Next Steps</h3>
          <p style="margin-bottom:12px;font-size:14px">View your billing details and complete payment by following the instructions detailed on the <a href="${MODE_OF_PAYMENT_URL}" style="color:#1e3a8a;font-weight:600;text-decoration:underline">Mode of Payment</a>.</p>
          <p style="margin:0"><a href="https://omics.pgcvisayas.upv.edu.ph/portal" style="background-color:#1e3a8a;color:#ffffff;padding:8px 16px;text-decoration:none;border-radius:4px;display:inline-block;font-weight:600;font-size:13px">Access Client Portal</a></p>
        </div>
        <p>Once payment has been completed, please upload the official receipt requested from the UPV Cash Office through the portal for verification. <strong>Kindly note that results will be released upon confirmation of payment.</strong></p>
        <p>If you have any questions regarding the billing or encounter any issues with the portal, please feel free to reach out. We look forward to working with you.</p>
        <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="font-size:13px;color:#64748b;margin-bottom:0">Yours in utilizing OMICS for a better Philippines,<br /><strong>Philippine Genome Center Visayas</strong></p>
      </div>
    </div>`;
  const emailText = `Billing/Invoice: PGC Visayas

Dear ${clientName},

Good day. Your billing is now available in your client portal. Kindly review the details and proceed with payment at your convenience. For payment instructions, please refer to our Mode of Payment: ${MODE_OF_PAYMENT_URL}

To view your billing details and complete payment by following the instructions detailed on the Mode of Payment (${MODE_OF_PAYMENT_URL}), please access your Client Portal: https://omics.pgcvisayas.upv.edu.ph/portal

Once payment has been completed, please upload the official receipt requested from the UPV Cash Office through the portal for verification. Kindly note that results will be released upon confirmation of payment.

If you have any questions regarding the billing or encounter any issues with the portal, please feel free to reach out. We look forward to working with you.

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas`;

  try {
    const mailDocument = await addDoc(collection(db, "mail"), {
      to: [recipientEmail],
      message: {
        subject: "Billing/Invoice: PGC Visayas",
        text: emailText,
        html: emailHtml,
      },
    });
    await markEmailMonitorQueued(monitorEventId, mailDocument.id);

    try {
      const notificationUuid = await resolveClientUuid(
        undefined,
        recipientEmail,
      );
      await addDoc(collection(db, "clientNotifications"), {
        recipientEmail,
        ...(notificationUuid ? { uuid: notificationUuid } : {}),
        type: "chargeSlip",
        title: "New Charge Slip Available",
        body: "Your billing is now available in the client portal. Please review and proceed with payment.",
        read: false,
        createdAt: new Date(),
      });
    } catch (notificationError) {
      console.warn(
        "Could not create charge slip in-app notification:",
        notificationError,
      );
    }

    return { queued: true };
  } catch (error) {
    await markEmailMonitorFailed(monitorEventId, error);
    console.error(
      `Could not queue billing notification for ${recipientEmail}:`,
      error,
    );
    return {
      queued: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error while queueing billing email",
    };
  }
}
