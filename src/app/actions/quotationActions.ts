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
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { adminDb } from "@/lib/firebase-admin";

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

    // Automatically update inquiry status from "Pending" to "Ongoing Quotation"
    if (quotation.inquiryId) {
      try {
        await updateInquiryStatus(quotation.inquiryId, "Ongoing Quotation");

        // Send email to client about quotation availability
        const inquiry = await getInquiryById(quotation.inquiryId);
        let resolvedUid: string | null = null;

        // Keep inquiry ownership in sync during quotation send by deriving
        // uuid from users.email -> users.uid using inquiry email.
        if (adminDb && inquiry?.email) {
          resolvedUid = await resolveUidFromUsersByEmail(inquiry.email);
          if (resolvedUid) {
            await adminDb
              .collection("inquiries")
              .doc(quotation.inquiryId)
              .set({ uuid: resolvedUid }, { merge: true });
          }
        }

        if (inquiry && inquiry.email) {
          const notificationUuid =
            resolvedUid ||
            inquiry.uuid ||
            (await resolveUidFromUsersByEmail(inquiry.email));
          const mailCollection = collection(db, "mail");

          const clientEmailHtml = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
              <div style="background-color: #f1f5f9; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <h2 style="color: #1e3a8a; margin-top: 0;">Quotation Available - PGC Visayas</h2>
                <p>Dear ${inquiry.name},</p>
                <p>Your quotation is now available in your client portal. <strong>Please note that the quotation does not include re-runs for unsuccessful samples.</strong> Make sure to read our <a href="https://omics.pgcvisayas.upv.edu.ph/faqs" style="color: #1e3a8a; font-weight: 600; text-decoration: underline;">FAQs</a> for details about turnaround time, sample submission, and payment details.</p>
                
                <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; border-left: 4px solid #1e3a8a; margin: 15px 0;">
                  <h3 style="margin-top: 0; color: #1e3a8a; font-size: 14px; margin-bottom: 8px;">Next Steps</h3>
                  <p style="margin-bottom: 12px; font-size: 14px;">View your quotation and monitor progress via the Client Portal.</p>
                  <p style="margin: 0;"><a href="https://omics.pgcvisayas.upv.edu.ph/portal" style="background-color: #1e3a8a; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 600; font-size: 13px;">Access Client Portal</a></p>
                </div>

                <p>If you'd like to proceed with the service, please complete the client and project details in the portal and submit for admin review. Kindly wait for a confirmation if your project has been approved before scheduling any laboratory use or sending samples.</p>
                
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">Yours in utilizing OMICS for a better Philippines,<br /><strong>Philippine Genome Center Visayas</strong></p>
              </div>
            </div>
          `;

          const clientEmailText = `
Quotation Available - PGC Visayas

Dear ${inquiry.name},

Your quotation is now available in your client portal. Please note that the quotation does not include re-runs for unsuccessful samples. Make sure to read our FAQs (https://omics.pgcvisayas.upv.edu.ph/faqs) for details about turnaround time, sample submission, and payment details.

To view the quotation and progress of requested services, kindly log in to your Client Portal: https://omics.pgcvisayas.upv.edu.ph/portal

If you'd like to proceed with the service, please complete the client and project details in the portal and submit for admin review. Kindly wait for a confirmation if your project has been approved before scheduling any laboratory use or sending samples.

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas
          `.trim();

          await addDoc(mailCollection, {
            to: [inquiry.email],
            message: {
              subject: "Quotation Available: PGC Visayas",
              text: clientEmailText,
              html: clientEmailHtml,
            },
          });
          console.log(
            `✅ Quotation availability email sent to ${inquiry.email}`,
          );

          // In-app notification
          await addDoc(collection(db, "clientNotifications"), {
            recipientEmail: inquiry.email,
            ...(notificationUuid ? { uuid: notificationUuid } : {}),
            type: "quotation",
            title: "Quotation Available",
            body: "Your quotation is now available in the client portal. Please review it at your convenience.",
            read: false,
            createdAt: new Date(),
          });
        }
      } catch (statusError) {
        console.warn("Could not handle inquiry update or email:", statusError);
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
    return { success: true };
  } catch (error) {
    console.error("Error saving quotation:", error);
    return { success: false, error: "Failed to save quotation" };
  }
}

export async function getQuotationsAction() {
  try {
    if (!adminDb) throw new Error("Firebase Admin is not initialized");
    const snapshot = await adminDb
      .collection("quotations")
      .orderBy("dateIssued", "desc")
      .get();
    const quotations = snapshot.docs.map((docSnap) => ({
      ...docSnap.data(),
      id: docSnap.id,
      dateIssued: docSnap.data().dateIssued?.toDate?.()?.toISOString() || null,
    })) as QuotationRecord[];
    return { success: true, data: quotations };
  } catch (error) {
    console.error("Error fetching quotations:", error);
    return { success: false, error: "Failed to fetch quotations" };
  }
}
