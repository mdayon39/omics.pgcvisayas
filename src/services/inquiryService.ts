/**
 * Inquiry Service
 *
 * This service handles all database operations related to user inquiries.
 * It provides functions to retrieve inquiry data from Firestore and handles
 * data transformation between Firestore documents and TypeScript objects.
 */

import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  where,
  documentId,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Inquiry } from "@/types/Inquiry";

interface LinkedClient {
  id: string;
  cid?: string;
  inquiryId?: string;
  email?: string;
  isContactPerson?: boolean;
}

function attachContactClientIds(
  inquiries: Inquiry[],
  clients: LinkedClient[],
): Inquiry[] {
  const clientsByInquiry = new Map<string, LinkedClient[]>();
  const clientsByEmail = new Map<string, LinkedClient[]>();
  for (const client of clients) {
    if (client.inquiryId) {
      const linked = clientsByInquiry.get(client.inquiryId) ?? [];
      linked.push(client);
      clientsByInquiry.set(client.inquiryId, linked);
    }

    const email = client.email?.trim().toLowerCase();
    if (email) {
      const matchingEmail = clientsByEmail.get(email) ?? [];
      matchingEmail.push(client);
      clientsByEmail.set(email, matchingEmail);
    }
  }

  return inquiries.map((inquiry) => {
    const linkedClients = clientsByInquiry.get(inquiry.id) ?? [];
    const inquiryEmail = inquiry.email?.trim().toLowerCase();
    const emailMatches = inquiryEmail
      ? clientsByEmail.get(inquiryEmail) ?? []
      : [];

    const contactClients = linkedClients.filter(
      (client) => client.isContactPerson === true,
    );
    const linkedByEmail = inquiryEmail
      ? linkedClients.filter(
          (client) =>
            client.email?.trim().toLowerCase() === inquiryEmail,
        )
      : [];
    const emailContactClients = emailMatches.filter(
      (client) => client.isContactPerson === true,
    );

    const contactClient =
      (contactClients.length === 1 ? contactClients[0] : undefined) ??
      (linkedByEmail.length === 1 ? linkedByEmail[0] : undefined) ??
      (linkedClients.length === 1 ? linkedClients[0] : undefined) ??
      (!linkedClients.length && emailContactClients.length === 1
        ? emailContactClients[0]
        : undefined) ??
      (!linkedClients.length && emailMatches.length === 1
        ? emailMatches[0]
        : undefined);

    return contactClient
      ? { ...inquiry, clientId: contactClient.cid || contactClient.id }
      : inquiry;
  });
}

/**
 * Helper to map Firestore document data to Inquiry object
 */
function mapDocToInquiry(id: string, data: any): Inquiry {
  return {
    id: id,
    createdAt:
      data.createdAt?.toDate?.() ??
      (data.createdAt ? new Date(data.createdAt) : new Date()),
    name: data.name || "Unknown",
    status: data.status || "Pending",
    isApproved: data.isApproved || false,
    affiliation: data.affiliation || "",
    designation: data.designation || "",
    email: data.email ?? "",
    uuid: data.uuid ?? null,

    // Include new service selection fields
    serviceType: data.serviceType || null,
    species: data.species || null,
    otherSpecies: data.otherSpecies || null,
    researchOverview: data.researchOverview || null,
    methodologyFileUrl: data.methodologyFileUrl || null,
    sampleCount: data.sampleCount || null,
    workflowType: data.workflowType || null,
    bioinformaticsDetails: data.bioinformaticsDetails || null,
    bioinfoOptions: data.bioinfoOptions || null,
    individualAssayDetails: data.individualAssayDetails || null,

    // Retail projects fields
    retailItems: data.retailItems || null,
    retailItemDetails: data.retailItemDetails || null,

    // Legacy/Service-specific fields
    workflows: data.workflows || [],
    additionalInfo: data.additionalInfo || null,
    projectBackground: data.projectBackground || null,
    projectBudget: data.projectBudget || null,
    molecularServicesBudget: data.molecularServicesBudget || null,
    plannedSampleCount: data.plannedSampleCount || null,
    specificTrainingNeed: data.specificTrainingNeed || null,
    trainingPrograms: data.trainingPrograms || null,
    targetTrainingDate: data.targetTrainingDate || null,
    numberOfParticipants: data.numberOfParticipants || null,

    // System fields
    haveSubmitted: data.haveSubmitted || false,
    hasOpenedQuotation: data.hasOpenedQuotation || false,
    hasLoggedIn: data.hasLoggedIn || false,
    messageState: data.messageState || "none",
    unreadMessageCount: data.unreadMessageCount || 0,
    pinnedByAdmin: data.pinnedByAdmin === true,
    cancelledAt:
      data.cancelledAt?.toDate?.() ??
      (data.cancelledAt ? new Date(data.cancelledAt) : null),
    cancelledBy: data.cancelledBy || null,
    cancellationReason: data.cancellationReason || null,
  };
}

/**
 * Retrieves all inquiries from Firestore, ordered by creation date (newest first)
 *
 * @returns Promise<Inquiry[]> - Array of inquiry objects, empty array if error occurs
 *
 * Features:
 * - Handles Firestore Timestamp conversion to JavaScript Date objects
 * - Provides fallback values for missing or undefined fields
 * - Sorts results by creation date in descending order
 * - Graceful error handling with console logging
 */
export async function getInquiries(): Promise<Inquiry[]> {
  try {
    console.log("Attempting to connect to Firestore...");

    // Create a reference to the 'inquiries' collection
    // NOTE: Do NOT use orderBy here — Firestore silently excludes documents
    // that are missing the ordered field, which would hide older inquiries.
    // Sorting is done in-memory below instead.
    const inquiriesRef = collection(db, "inquiries");
    const q = query(inquiriesRef);
    const [querySnapshot, clientsSnapshot] = await Promise.all([
      getDocs(q),
      getDocs(query(collection(db, "clients"))).catch((error) => {
        console.error("Error fetching clients for inquiry IDs:", error);
        return null;
      }),
    ]);

    const inquiries: Inquiry[] = [];

    // Process each document in the query results
    querySnapshot.forEach((doc) => {
      inquiries.push(mapDocToInquiry(doc.id, doc.data()));
    });

    const clients: LinkedClient[] =
      clientsSnapshot?.docs.map((clientDoc) => ({
        id: clientDoc.id,
        cid: clientDoc.data().cid,
        inquiryId: clientDoc.data().inquiryId,
        email: clientDoc.data().email,
        isContactPerson: clientDoc.data().isContactPerson,
      })) ?? [];

    // Additional sorting in memory as a backup (Firestore query should handle this)
    // Ensures consistent ordering even if Firestore ordering fails
    inquiries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    console.log(`Successfully processed ${inquiries.length} inquiries`);
    return attachContactClientIds(inquiries, clients);
  } catch (error) {
    console.error("Error fetching inquiries:", error);
    return [];
  }
}

/**
 * Retrieves a specific inquiry by its document ID
 *
 * @param id - The Firestore document ID of the inquiry to retrieve
 * @returns Promise<Inquiry> - The inquiry object if found
 * @throws Error if the inquiry is not found or if there's a database error
 *
 * Note: Unlike getInquiries(), this function throws errors rather than
 * returning empty results, allowing calling code to handle specific error cases
 */
export async function getInquiryById(id: string): Promise<Inquiry> {
  try {
    // Create reference to specific document in 'inquiries' collection
    const docRef = doc(db, "inquiries", id);
    const snap = await getDoc(docRef);

    // Check if document exists in Firestore
    if (!snap.exists()) throw new Error("Inquiry not found");

    return mapDocToInquiry(snap.id, snap.data());
  } catch (error) {
    console.error(`Failed to fetch inquiry ${id}:`, error);
    throw error;
  }
}

/**
 * Retrieves full Inquiry objects for a list of IDs.
 * Supports up to 30 IDs due to Firestore 'in' query limitations.
 */
export async function getInquiriesByIds(ids: string[]): Promise<Inquiry[]> {
  if (!ids || ids.length === 0) return [];

  try {
    const validIds = ids.filter((id) => id && id.trim().length > 0);
    if (validIds.length === 0) return [];

    // Firestore 'in' query limit is 30.
    const constrainedIds = validIds.slice(0, 30);
    const inquiriesRef = collection(db, "inquiries");
    const q = query(inquiriesRef, where(documentId(), "in", constrainedIds));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => mapDocToInquiry(doc.id, doc.data()));
  } catch (error) {
    console.error("Error fetching inquiries by IDs:", error);
    return [];
  }
}

/**
 * Subscribes to changes in a single inquiry document
 *
 * @param id - The Firestore document ID of the inquiry to monitor
 * @param callback - Function called with the updated Inquiry object
 * @returns Unsubscribe function to stop listening
 */
export function subscribeToInquiryById(
  id: string,
  callback: (inquiry: Inquiry | null) => void,
): () => void {
  const docRef = doc(db, "inquiries", id);

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(mapDocToInquiry(snapshot.id, snapshot.data()));
    },
    (error) => {
      console.error(`Error in inquiry subscription for ${id}:`, error);
      callback(null);
    },
  );
}

/**
 * Subscribe to real-time inquiry updates
 *
 * @param callback - Function called with updated inquiries array
 * @returns Unsubscribe function to stop listening
 *
 * This enables real-time updates without page refresh.
 * Call the returned function when component unmounts to clean up.
 */
export function subscribeToInquiries(
  callback: (inquiries: Inquiry[]) => void,
): () => void {
  const inquiriesRef = collection(db, "inquiries");
  // NOTE: Do NOT use orderBy here — Firestore silently excludes documents
  // that are missing the ordered field, which would hide older inquiries.
  // Sorting is done in-memory below instead.
  const q = query(inquiriesRef);
  let inquiries: Inquiry[] | null = null;
  let clients: LinkedClient[] | null = null;
  const emit = () => {
    if (inquiries === null || clients === null) return;
    const enrichedInquiries = attachContactClientIds(inquiries, clients);
    enrichedInquiries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    callback(enrichedInquiries);
  };

  const unsubscribeInquiries = onSnapshot(
    q,
    (snapshot) => {
      inquiries = snapshot.docs.map((doc) =>
        mapDocToInquiry(doc.id, doc.data()),
      );
      emit();
    },
    (error) => {
      console.error("Error in inquiry subscription:", error);
      inquiries = [];
      emit();
    },
  );
  const unsubscribeClients = onSnapshot(
    collection(db, "clients"),
    (snapshot) => {
      clients = snapshot.docs.map((clientDoc) => ({
        id: clientDoc.id,
        cid: clientDoc.data().cid,
        inquiryId: clientDoc.data().inquiryId,
        email: clientDoc.data().email,
        isContactPerson: clientDoc.data().isContactPerson,
      }));
      emit();
    },
    (error) => {
      console.error("Error in client subscription for inquiry IDs:", error);
      clients = [];
      emit();
    },
  );

  return () => {
    unsubscribeInquiries();
    unsubscribeClients();
  };
}

/**
 * Updates the status of a specific inquiry
 * @param inquiryId - The ID of the inquiry to update
 * @param status - The new status to set
 */
export async function updateInquiryStatus(
  inquiryId: string,
  status: Inquiry["status"],
): Promise<void> {
  try {
    const inquiryRef = doc(db, "inquiries", inquiryId);
    await runTransaction(db, async (transaction) => {
      const inquirySnapshot = await transaction.get(inquiryRef);
      if (!inquirySnapshot.exists()) {
        throw new Error(`Inquiry ${inquiryId} not found`);
      }

      const inquiry = inquirySnapshot.data();
      if (
        status === "Ongoing Quotation" &&
        (inquiry.isApproved === true || inquiry.status === "Approved Client")
      ) {
        console.info(
          `Preserving approved status for inquiry ${inquiryId}; not setting it to Ongoing Quotation.`,
        );
        return;
      }

      transaction.update(inquiryRef, { status });
    });
    console.log(`Updated inquiry ${inquiryId} status to: ${status}`);
  } catch (error) {
    console.error(`Error updating inquiry ${inquiryId} status:`, error);
    throw error;
  }
}

/**
 * Pins or unpins an inquiry in the admin inquiry table.
 */
export async function setInquiryPinned(
  inquiryId: string,
  pinned: boolean,
): Promise<void> {
  try {
    await updateDoc(doc(db, "inquiries", inquiryId), {
      pinnedByAdmin: pinned,
    });
  } catch (error) {
    console.error(`Error updating inquiry ${inquiryId} pin status:`, error);
    throw error;
  }
}

/**
 * Cancels an inquiry on behalf of the client.
 * Stores cancellation metadata for auditing.
 */
export async function cancelInquiryByClient(
  inquiryId: string,
  reason?: string | null,
): Promise<void> {
  try {
    const inquiryRef = doc(db, "inquiries", inquiryId);
    await updateDoc(inquiryRef, {
      status: "Quotation Only",
      cancelledBy: "client",
      cancellationReason: reason ?? null,
      cancelledAt: serverTimestamp(),
    });
    console.log(`Inquiry ${inquiryId} marked as Quotation Only by client.`);
  } catch (error) {
    console.error(`Error cancelling inquiry ${inquiryId} by client:`, error);
    throw error;
  }
}

/**
 * Marks an inquiry as having the client logged in.
 *
 * @param inquiryId - The ID of the inquiry to update
 */
export async function markInquiryAsLoggedIn(inquiryId: string): Promise<void> {
  if (!inquiryId) return;

  try {
    const inquiryRef = doc(db, "inquiries", inquiryId);
    await updateDoc(inquiryRef, {
      hasLoggedIn: true,
    });
    console.log(`[Firestore] Inquiry ${inquiryId} marked as logged in.`);
  } catch (error) {
    console.error(
      `[Firestore] Error marking inquiry ${inquiryId} as logged in:`,
      error,
    );
  }
}
