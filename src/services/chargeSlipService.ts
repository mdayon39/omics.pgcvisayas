import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  where,
  orderBy,
  query,
  Timestamp,
  limit,
  deleteDoc,
} from "firebase/firestore";
import { ChargeSlipRecord } from "@/types/ChargeSlipRecord";
import { convertToDate, convertToTimestamp } from "@/lib/convert";
import { Client } from "@/types/Client";
import { Project } from "@/types/Project";

const CHARGE_SLIPS_COLLECTION = "chargeSlips";

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
      `[Firestore] Unable to resolve uuid for charge slip email ${normalizedEmail}:`,
      error,
    );
  }

  try {
    const inquirySnapshot = await getDocs(
      query(
        collection(db, "inquiries"),
        where("email", "==", normalizedEmail),
        limit(1),
      ),
    );
    const inquiryUuid = inquirySnapshot.docs[0]?.data()?.uuid;
    if (typeof inquiryUuid === "string" && inquiryUuid) return inquiryUuid;
  } catch (error) {
    console.warn(
      `[Firestore] Unable to resolve uuid from inquiry for ${normalizedEmail}:`,
      error,
    );
  }

  return null;
}

// Helper to safely convert timestamps only if defined
const safeTimestamp = (value: any) =>
  value ? convertToTimestamp(value) : convertToTimestamp(new Date());

// Helper to handle malformed timestamps with _seconds and _nanoseconds
const normalizeTimestamp = (value: any): Timestamp => {
  if (!value) {
    return Timestamp.fromDate(new Date());
  }

  // Already a Firestore Timestamp
  if (value instanceof Timestamp) {
    return value;
  }

  // Malformed timestamp with _seconds and _nanoseconds
  if (value._seconds !== undefined) {
    const seconds = value._seconds || 0;
    const nanoseconds = value._nanoseconds || 0;
    return new Timestamp(seconds, nanoseconds);
  }

  // Date object or string
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }

  if (typeof value === "string") {
    return Timestamp.fromDate(new Date(value));
  }

  // Fallback
  return Timestamp.fromDate(new Date());
};

// Helper to remove undefined values from an object
const removeUndefined = (obj: any): any => {
  if (!obj || typeof obj !== "object") return obj;

  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

export async function getAllChargeSlips(): Promise<ChargeSlipRecord[]> {
  const snapshot = await getDocs(
    query(
      collection(db, CHARGE_SLIPS_COLLECTION),
      orderBy("dateIssued", "desc"),
    ),
  );

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as any;

    const clientData: Client = {
      ...data.client,
      createdAt: convertToDate(data.client?.createdAt),
    };

    const projectData: Project = {
      ...data.project,
      createdAt: convertToDate(data.project?.createdAt),
    };

    return {
      ...data,
      id: docSnap.id,
      client: clientData,
      project: projectData,
      dateIssued: convertToDate(data.dateIssued),
      dateOfOR: convertToDate(data.dateOfOR),
      createdAt: convertToDate(data.createdAt),
    };
  });
}

export async function getChargeSlipById(
  id: string,
): Promise<ChargeSlipRecord | null> {
  const docRef = doc(db, CHARGE_SLIPS_COLLECTION, id);
  const snap = await getDoc(docRef);

  if (!snap.exists()) return null;

  const data = snap.data() as any;

  return {
    ...data,
    id: snap.id,
    client: {
      ...data.client,
      createdAt: convertToDate(data.client?.createdAt),
    },
    project: {
      ...data.project,
      createdAt: convertToDate(data.project?.createdAt),
    },
    dateIssued: convertToDate(data.dateIssued),
    dateOfOR: convertToDate(data.dateOfOR),
    createdAt: convertToDate(data.createdAt),
  };
}

export async function deleteChargeSlip(
  chargeSlipNumber: string,
): Promise<void> {
  const docRef = doc(db, CHARGE_SLIPS_COLLECTION, chargeSlipNumber);
  await deleteDoc(docRef);
}

export async function saveChargeSlip(slip: ChargeSlipRecord): Promise<string> {
  const docRef = doc(db, CHARGE_SLIPS_COLLECTION, slip.chargeSlipNumber);
  const resolvedUuid = await resolveUuidFromEmail(
    slip.clientInfo?.email || slip.client?.email || null,
  );
  const clientUuid =
    (slip.client as (Client & { uuid?: string | null }) | undefined)?.uuid ||
    slip.uuid ||
    resolvedUuid;

  const payload: any = {
    ...slip,
    uuid: clientUuid ?? "",
    dateIssued: safeTimestamp(slip.dateIssued),
    dateOfOR: slip.dateOfOR ? convertToTimestamp(slip.dateOfOR) : null,
    createdAt: safeTimestamp(slip.createdAt || new Date()),
    client: slip.client
      ? removeUndefined({
          ...slip.client,
          createdAt: normalizeTimestamp(slip.client.createdAt),
        })
      : null,
    project: slip.project
      ? removeUndefined({
          ...slip.project,
          createdAt: normalizeTimestamp(slip.project.createdAt),
          startDate: slip.project.startDate
            ? normalizeTimestamp(slip.project.startDate)
            : null,
        })
      : null,
  };

  await setDoc(docRef, payload);
  return slip.chargeSlipNumber;
}

export async function getChargeSlipsByClientId(
  clientId: string,
): Promise<ChargeSlipRecord[]> {
  // Use top-level "cid" field to avoid requiring a composite Firestore index.
  // Older records store client ID in both "cid" (top-level) and "client.cid" (nested);
  // querying the top-level field works for all records without an explicit index.
  const q = query(
    collection(db, CHARGE_SLIPS_COLLECTION),
    where("cid", "==", clientId),
  );

  const snapshot = await getDocs(q);

  const results = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as any;
    return {
      ...data,
      id: docSnap.id,
      client: {
        ...data.client,
        createdAt: convertToDate(data.client?.createdAt),
      },
      project: {
        ...data.project,
        createdAt: convertToDate(data.project?.createdAt),
      },
      dateIssued: convertToDate(data.dateIssued),
      dateOfOR: convertToDate(data.dateOfOR),
      createdAt: convertToDate(data.createdAt),
    };
  });

  // Sort descending by chargeSlipNumber in JavaScript to avoid composite index
  return results.sort((a, b) =>
    (b.chargeSlipNumber ?? "").localeCompare(a.chargeSlipNumber ?? ""),
  );
}

export async function updateChargeSlip(
  id: string,
  updates: Partial<ChargeSlipRecord>,
) {
  const docRef = doc(db, CHARGE_SLIPS_COLLECTION, id);

  const updatedData: any = {};

  if ("dvNumber" in updates) updatedData.dvNumber = updates.dvNumber;
  if ("orNumber" in updates) updatedData.orNumber = updates.orNumber;
  if ("status" in updates) {
    updatedData.status = updates.status;
    if (updates.status === "paid") {
      updatedData.datePaid = Timestamp.fromDate(new Date());
    } else {
      updatedData.datePaid = null;
    }
  }
  if ("notes" in updates) updatedData.notes = updates.notes;

  if ("dateIssued" in updates) {
    updatedData.dateIssued = safeTimestamp(updates.dateIssued);
  }

  if ("dateOfOR" in updates) {
    const convertedDateOfOR = updates.dateOfOR
      ? convertToTimestamp(updates.dateOfOR)
      : null;
    updatedData.dateOfOR = convertedDateOfOR ?? null;
  }

  // Support accumulating OR entries and updating the latest OR number
  if ("orNumber" in updates) updatedData.orNumber = updates.orNumber;
  if ("orEntries" in updates) updatedData.orEntries = updates.orEntries;
  if ("showOfficialReceipts" in updates)
    updatedData.showOfficialReceipts = updates.showOfficialReceipts;
  if ("paidValidatedAt" in updates)
    updatedData.paidValidatedAt = updates.paidValidatedAt ?? null;
  if ("paidValidatedBy" in updates)
    updatedData.paidValidatedBy = updates.paidValidatedBy ?? null;
  if ("paidValidatedByName" in updates)
    updatedData.paidValidatedByName = updates.paidValidatedByName ?? null;

  if ("createdAt" in updates) {
    updatedData.createdAt = safeTimestamp(updates.createdAt);
  }

  if (updates.client) {
    updatedData.client = {
      ...updates.client,
      ...(updates.client.createdAt && {
        createdAt: safeTimestamp(updates.client.createdAt),
      }),
    };
  }

  if (updates.project) {
    updatedData.project = {
      ...updates.project,
      ...(updates.project.createdAt && {
        createdAt: safeTimestamp(updates.project.createdAt),
      }),
    };
  }

  await updateDoc(docRef, updatedData);
}

export async function getChargeSlipsByProjectId(
  projectId: string,
  clientUuid?: string | null,
): Promise<ChargeSlipRecord[]> {
  // Query both the top-level "projectId" field (newer records) and "project.pid"
  // nested field (older records) since older charge slips may not have the
  // top-level field populated.
  const [snap1, snap2] = await Promise.all([
    getDocs(
      query(
        collection(db, CHARGE_SLIPS_COLLECTION),
        ...(clientUuid
          ? [where("uuid", "==", clientUuid)]
          : [where("projectId", "==", projectId)]),
      ),
    ),
    clientUuid
      ? Promise.resolve(null)
      : getDocs(
          query(
            collection(db, CHARGE_SLIPS_COLLECTION),
            where("project.pid", "==", projectId),
          ),
        ),
  ]);

  const seen = new Set<string>();
  const results: ChargeSlipRecord[] = [];

  for (const snapshot of [snap1, snap2].filter(Boolean)) {
    if (!snapshot) continue;
    for (const docSnap of snapshot.docs) {
      if (seen.has(docSnap.id)) continue;
      seen.add(docSnap.id);
      const data = docSnap.data() as any;
      if (
        clientUuid &&
        data.projectId !== projectId &&
        data.project?.pid !== projectId
      ) {
        continue;
      }
      results.push({
        ...data,
        id: docSnap.id,
        client: {
          ...data.client,
          createdAt: convertToDate(data.client?.createdAt),
        },
        project: {
          ...data.project,
          createdAt: convertToDate(data.project?.createdAt),
        },
        dateIssued: convertToDate(data.dateIssued),
        dateOfOR: convertToDate(data.dateOfOR),
        createdAt: convertToDate(data.createdAt),
      });
    }
  }

  // Sort by dateIssued descending (latest first)
  results.sort((a, b) => {
    const dateA = a.dateIssued instanceof Date ? a.dateIssued.getTime() : 0;
    const dateB = b.dateIssued instanceof Date ? b.dateIssued.getTime() : 0;
    return dateB - dateA;
  });

  return results;
}

/**
 * Generates the next charge slip number for a given year.
 * Format: CS-YYYY-XXX (zero-padded to 3 digits while < 1000; from 1000 upward no padding)
 */
export async function generateNextChargeSlipNumber(
  year: number,
): Promise<string> {
  const prefix = `CS-${year}`;
  const lower = `${prefix}-`; // inclusive: "CS-2025-"
  const upper = `CS-${year + 1}-`; // exclusive: "CS-2026-"

  const qRef = query(
    collection(db, CHARGE_SLIPS_COLLECTION),
    where("chargeSlipNumber", ">=", lower),
    where("chargeSlipNumber", "<", upper),
    orderBy("chargeSlipNumber", "desc"),
    limit(1),
  );

  const snapshot = await getDocs(qRef);

  let nextNumber = 1;
  if (!snapshot.empty) {
    const last: string =
      snapshot.docs[0].data().chargeSlipNumber ?? snapshot.docs[0].id;
    const lastNum = parseInt(last.split("-").pop() || "0", 10);
    if (!Number.isNaN(lastNum)) nextNumber = lastNum + 1;
  }

  const suffix =
    nextNumber < 1000
      ? String(nextNumber).padStart(3, "0")
      : String(nextNumber);

  return `${prefix}-${suffix}`;
}
