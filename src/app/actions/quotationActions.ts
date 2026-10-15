"use server";

import { revalidatePath } from "next/cache";
import {
  saveQuotationToFirestore,
  getAllQuotations,
} from "@/services/quotationService";
import { updateInquiryStatus, getInquiryById } from "@/services/inquiryService";
import { QuotationRecord } from "@/types/Quotation";
import { logActivity } from "@/services/activityLogService";
import { sanitizeObject } from "@/lib/sanitizeObject";
import { adminDb } from "@/lib/firebase-admin";
import { createQuotationAvailabilityEmail } from "@/lib/quotationEmail";
import {
  beginEmailMonitorEvent,
  markEmailMonitorFailed,
  markEmailMonitorQueued,
} from "@/services/emailMonitoringAdmin";

function normalizeEmail(value?: string | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function resolveUidFromUsersByEmail(
  email?: string | null,
): Promise<string | null> {
  if (!adminDb) return null;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const exactMatch = await adminDb
    .collection("users")
    .where("email", "==", normalizedEmail)
    .limit(1)
    .get();

  if (!exactMatch.empty) {
    const userData = exactMatch.docs[0].data() as { uid?: string };
    return typeof userData?.uid === "string" && userData.uid
      ? userData.uid
      : null;
  }

  const allUsersSnapshot = await adminDb.collection("users").get();
  for (const userDoc of allUsersSnapshot.docs) {
    const userData = userDoc.data() as { email?: string; uid?: string };
    if (normalizeEmail(userData.email) !== normalizedEmail) continue;
    return typeof userData?.uid === "string" && userData.uid
      ? userData.uid
      : null;
  }

  return null;
}

export async function saveQuotationAction(
  quotation: QuotationRecord,
  userInfo: { name: string; email: string },
) {
  try {
    const cleanedQuotation = sanitizeObject(quotation) as QuotationRecord;
    await saveQuotationToFirestore(cleanedQuotation);

    let inquiry: Awaited<ReturnType<typeof getInquiryById>> | null = null;
    if (quotation.inquiryId) {
      try {
        await updateInquiryStatus(quotation.inquiryId, "Ongoing Quotation");
      } catch (statusError) {
        console.warn(
          `Could not update inquiry ${quotation.inquiryId} status:`,
          statusError,
        );
      }

      try {
        inquiry = await getInquiryById(quotation.inquiryId);
      } catch (inquiryError) {
        console.warn(
          `Could not load inquiry ${quotation.inquiryId} for quotation notification:`,
          inquiryError,
        );
      }
    }

    const recipientEmail =
      normalizeEmail(quotation.email) || normalizeEmail(inquiry?.email);
    let emailQueued = false;
    let emailError: string | undefined;
    let emailMonitorEventId: string | null = null;

    if (!recipientEmail) {
      const monitorEventId = await beginEmailMonitorEvent(
        "Quotation available",
        "",
        quotation.referenceNumber,
      );
      emailMonitorEventId = monitorEventId;
      await markEmailMonitorFailed(emailMonitorEventId, "No client email address was available.");
      emailError =
        "Quotation saved, but no client email address was available for the notification.";
    } else if (!adminDb) {
      console.error(
        "Quotation was saved, but Firebase Admin is unavailable; notification email was not queued.",
      );
      emailError =
        "Quotation saved, but the notification email could not be queued. Please contact support.";
    } else {
      const clientName = quotation.name || inquiry?.name || "Client";
      const message = createQuotationAvailabilityEmail(clientName);
      emailMonitorEventId = await beginEmailMonitorEvent(
        "Quotation available",
        recipientEmail,
        quotation.referenceNumber,
      );

      try {
        const mailDocument = await adminDb.collection("mail").add({
          to: [recipientEmail],
          ...(quotation.inquiryId ? { inquiryId: quotation.inquiryId } : {}),
          message,
        });
        await markEmailMonitorQueued(emailMonitorEventId, mailDocument.id);
        emailQueued = true;
        console.info(`Quotation notification email queued for ${recipientEmail}`);
      } catch (emailQueueError) {
        await markEmailMonitorFailed(emailMonitorEventId, emailQueueError);
        console.error(
          `Quotation was saved, but notification email could not be queued for ${recipientEmail}:`,
          emailQueueError,
        );
        emailError =
          "Quotation saved, but the notification email could not be queued. Please contact support.";
      }

      if (quotation.inquiryId && inquiry) {
        try {
          const resolvedUid = await resolveUidFromUsersByEmail(recipientEmail);
          if (resolvedUid) {
            await adminDb
              .collection("inquiries")
              .doc(quotation.inquiryId)
              .set({ uuid: resolvedUid }, { merge: true });
          }

          await adminDb.collection("clientNotifications").add({
            recipientEmail,
            ...((resolvedUid || inquiry.uuid)
              ? { uuid: resolvedUid || inquiry.uuid }
              : {}),
            type: "quotation",
            title: "Quotation Available",
            body: "Your quotation is now available in the client portal. Please review it at your convenience.",
            read: false,
            createdAt: new Date(),
          });
        } catch (notificationError) {
          console.warn(
            `Could not create in-app quotation notification for ${recipientEmail}:`,
            notificationError,
          );
        }
      }
    }

    // Log the activity
    await logActivity({
      userId: userInfo.email,
      userEmail: userInfo.email,
      userName: userInfo.name,
      action: "GENERATE",
      entityType: "quotation",
      entityId: quotation.referenceNumber || quotation.id || "unknown",
      entityName: `Quotation for ${quotation.name || "Unknown Client"}`,
      description: `Generated quotation: ${quotation.referenceNumber || quotation.id}`,
      changesAfter: quotation,
    });

    revalidatePath("/admin/quotations");
    revalidatePath("/admin/inquiries");
    return { success: true, emailQueued, emailError, emailMonitorEventId };
  } catch (error) {
    console.error("Error saving quotation:", error);
    return { success: false, error: "Failed to save quotation" };
  }
}

export async function getQuotationsAction() {
  try {
    const quotations = await getAllQuotations();
    return { success: true, data: quotations };
  } catch (error) {
    console.error("Error fetching quotations:", error);
    return { success: false, error: "Failed to fetch quotations" };
  }
}
