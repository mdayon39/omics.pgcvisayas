import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  doc,
  setDoc,
  getDoc,
  limit,
  deleteDoc,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { QuotationRecord } from "@/types/Quotation";

function normalizeEmail(value?: string | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function resolveUuidFromEmail(
  email?: string | null,
): Promise<string | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", normalizedEmail));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data() as { uid?: string };
      if (typeof userData?.uid === "string" && userData.uid) {
        return userData.uid;
      }

      return snapshot.docs[0].id || null;
    }

    const allUsersSnapshot = await getDocs(usersRef);
    for (const userDoc of allUsersSnapshot.docs) {
      const userData = userDoc.data() as { email?: string; uid?: string };
      const storedEmail = normalizeEmail(userData.email);
      if (storedEmail === normalizedEmail) {
        return typeof userData?.uid === "string" && userData.uid
          ? userData.uid
          : userDoc.id || null;
      }
    }
  } catch (error) {
    console.warn(
      `[Firestore] Unable to resolve uuid for quotation email ${normalizedEmail}:`,
      error,
    );
  }

  return null;
}

/**
 * Get all quotations related to a specific inquiry ID or a list of inquiry IDs.
 */
export async function getQuotationsByInquiryId(
  inquiryId: string | string[],
): Promise<QuotationRecord[]> {
  const quotationsRef = collection(db, "quotations");

  let q;
  if (Array.isArray(inquiryId)) {
    if (inquiryId.length === 0) return [];
    // Firestore "in" query limited to 30 elements
    const ids = inquiryId.filter((id) => id && id.trim().length > 0);
    if (ids.length === 0) return [];

    // For now support up to 30, if more we'd need to chunk
    q = query(
      quotationsRef,
      where("inquiryId", "in", ids.slice(0, 30)),
      orderBy("dateIssued", "desc"),
    );
  } else {
    q = query(
      quotationsRef,
      where("inquiryId", "==", inquiryId),
      orderBy("dateIssued", "desc"),
    );
  }

  const snapshot = await getDocs(q);

  console.log(
    `[Firestore] Found ${snapshot.size} quotations for inquiryId: ${inquiryId}`,
  );

  const records: QuotationRecord[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const { clientInfo = {}, ...rest } = data;

    records.push({
      ...rest,
      ...clientInfo, // flatten name, institution, etc
      id: docSnap.id,
      dateIssued:
        typeof data.dateIssued === "string"
          ? data.dateIssued
          : data.dateIssued.toDate().toISOString(),
    } as QuotationRecord);
  });

  return records;
}

/**
 * Get all quotations related to a specific client name.
 */
export async function getQuotationsByClientName(
  clientName: string,
): Promise<QuotationRecord[]> {
  // Return empty array if clientName is empty or invalid
  if (!clientName || clientName.trim().length === 0) {
    console.log(
      "[Firestore] Empty client name provided, returning empty array",
    );
    return [];
  }

  const quotationsRef = collection(db, "quotations");
  const q = query(
    quotationsRef,
    where("name", "==", clientName),
    orderBy("dateIssued", "desc"),
  );

  const snapshot = await getDocs(q);

  console.log(
    `[Firestore] Found ${snapshot.size} quotations for client: ${clientName}`,
  );

  const records: QuotationRecord[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const { clientInfo = {}, ...rest } = data;

    records.push({
      ...rest,
      ...clientInfo, // flatten name, institution, etc
      id: docSnap.id,
      dateIssued:
        typeof data.dateIssued === "string"
          ? data.dateIssued
          : data.dateIssued.toDate().toISOString(),
    } as QuotationRecord);
  });

  return records;
}

/**
 * Save or overwrite a quotation using referenceNumber as the document ID.
 * Ensures the status field is always present, defaulting to "pending".
 */
export async function saveQuotationToFirestore(quotation: QuotationRecord) {
  const docRef = doc(db, "quotations", quotation.referenceNumber);
  const resolvedUuid = await resolveUuidFromEmail(quotation.email);

  await setDoc(docRef, {
    status: "pending",
    selectedForProject: "",
    ...quotation,
    uuid: resolvedUuid ?? quotation.uuid ?? "",
  });
}

/**
 * Update quotation status.
 * When status is "selected", sets selectedForProject to the inquiryId.
 * When status is "cancelled" or "pending", empties the selectedForProject field.
 */
export async function updateQuotationStatus(
  referenceNumber: string,
  status: "pending" | "selected" | "completed" | "cancelled",
  inquiryId?: string,
): Promise<void> {
  const docRef = doc(db, "quotations", referenceNumber);

  const updateData: Record<string, any> = { status };

  if (status === "selected" && inquiryId) {
    updateData.selectedForProject = inquiryId;
  } else if (status === "cancelled" || status === "pending") {
    updateData.selectedForProject = "";
  }

  await setDoc(docRef, updateData, { merge: true });
}

/**
 * Mark a quotation as selected for a specific project.
 */
export async function markQuotationAsSelected(
  referenceNumber: string,
  projectId: string,
): Promise<void> {
  const docRef = doc(db, "quotations", referenceNumber);
  await setDoc(
    docRef,
    {
      selectedForProject: projectId,
      status: "selected",
    },
    { merge: true },
  );
}

/**
 * Reset the selected quotation for a given inquiry back to "pending".
 * Called when admin cancels a project submission so the client can choose again.
 */
export async function resetSelectedQuotationForInquiry(
  inquiryId: string,
): Promise<void> {
  const q = query(
    collection(db, "quotations"),
    where("selectedForProject", "==", inquiryId),
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  await Promise.all(
    snapshot.docs.map((docSnap) =>
      setDoc(
        docSnap.ref,
        { status: "pending", selectedForProject: "" },
        { merge: true },
      ),
    ),
  );
}

/**
 * Delete a quotation by its reference number.
 */
export async function deleteQuotation(refNumber: string): Promise<void> {
  const docRef = doc(db, "quotations", refNumber);
  await deleteDoc(docRef);
}

/**
 * Get a single quotation by its reference number (document ID).
 */
export async function getQuotationByReferenceNumber(
  refNumber: string,
): Promise<QuotationRecord | null> {
  const docRef = doc(db, "quotations", refNumber);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return {
    status: "pending" as const,
    ...data,
    id: snapshot.id,
    dateIssued:
      typeof data.dateIssued === "string"
        ? data.dateIssued
        : data.dateIssued.toDate().toISOString(),
  } as QuotationRecord;
}

/**
 * Get all quotations in the database.
 */
export async function getAllQuotations(): Promise<QuotationRecord[]> {
  const q = query(collection(db, "quotations"), orderBy("dateIssued", "desc"));
  const snapshot = await getDocs(q);

  const records: QuotationRecord[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    records.push({
      status: "pending" as const,
      ...data,
      id: docSnap.id,
      dateIssued:
        typeof data.dateIssued === "string"
          ? data.dateIssued
          : data.dateIssued.toDate().toISOString(),
    } as QuotationRecord);
  });

  return records;
}

/**
 * Generates the next reference number with a global counter that
 * does NOT reset per year.
 *
 * Examples:
 *  - Existing highest: VMENF-Q-2021-002
 *    currentYear = 2022  => VMENF-Q-2022-003
 *  - Existing highest: VMENF-Q-2025-099
 *    currentYear = 2026  => VMENF-Q-2026-100
 *  - Existing highest: VMENF-Q-2026-999
 *    currentYear = 2027  => VMENF-Q-2027-1000  (no padding ≥ 1000)
 */
export async function generateNextReferenceNumber(
  currentYear: number,
): Promise<string> {
  const prefixForYear = `VMENF-Q-${currentYear}`;

  // Get the lexicographically last reference across ALL years.
  const qRef = query(
    collection(db, "quotations"),
    orderBy("referenceNumber", "desc"),
    limit(1),
  );

  const snapshot = await getDocs(qRef);

  let nextNumber = 1;
  if (!snapshot.empty) {
    const lastRef: string =
      snapshot.docs[0].data().referenceNumber ?? snapshot.docs[0].id;

    // Extract trailing numeric segment after the last hyphen
    const parts = lastRef.split("-");
    const lastNum = parseInt(parts[parts.length - 1] || "0", 10);
    if (!Number.isNaN(lastNum)) nextNumber = lastNum + 1;
  }

  // Pad to 3 digits while < 1000; no padding once we hit 1000+
  const suffix =
    nextNumber < 1000
      ? String(nextNumber).padStart(3, "0")
      : String(nextNumber);

  return `${prefixForYear}-${suffix}`;
}

/**
 * Marks an inquiry as having its quotation opened/seen by the client.
 *
 * @param inquiryId - The Firestore document ID of the inquiry to update
 */
export async function markQuotationAsSeen(inquiryId: string): Promise<void> {
  if (!inquiryId) return;

  try {
    const inquiryRef = doc(db, "inquiries", inquiryId);
    await updateDoc(inquiryRef, {
      hasOpenedQuotation: true,
    });
    console.log(`[Firestore] Inquiry ${inquiryId} marked as quotation seen.`);
  } catch (error) {
    console.error(
      `[Firestore] Error marking inquiry ${inquiryId} as seen:`,
      error,
    );
  }
}
