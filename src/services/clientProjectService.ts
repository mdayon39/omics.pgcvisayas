// Service for fetching a single client or project by ID from Firestore, with schema validation and timestamp conversion.

import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { clientSchema } from "@/schemas/clientSchema";
import { projectSchema } from "@/schemas/projectSchema";
import { Client } from "@/types/Client";
import { Project } from "@/types/Project";

/**
 * Utility to safely convert Firestore Timestamp to ISO string
 */
function safeDate(input: any): string | undefined {
  return input?.toDate?.() instanceof Date
    ? input.toDate().toISOString()
    : typeof input === "string"
    ? input
    : undefined;
}

/**
 * Fetch a single client by ID (cid) from Firestore.
 * Converts Firestore timestamps and validates with Zod schema.
 * Returns null if not found or validation fails.
 */
export async function getClientById(cid: string): Promise<Client | null> {
  try {
    const docRef = doc(db, "clients", cid);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data();

    // Handle createdAt timestamp conversion
    // Check if it's a Firestore Timestamp with toDate method
    if (data.createdAt?.toDate) {
      data.createdAt = data.createdAt.toDate();
    } 
    // Handle malformed timestamp stored as plain object with _seconds and _nanoseconds
    else if (data.createdAt?._seconds !== undefined) {
      const seconds = data.createdAt._seconds || 0;
      const nanoseconds = data.createdAt._nanoseconds || 0;
      data.createdAt = new Date(seconds * 1000 + nanoseconds / 1000000);
    }

    // Validate with Zod schema
    const parsed = clientSchema.safeParse({ id: snapshot.id, ...data });

    if (!parsed.success) {
      console.warn("Client has legacy fields; using available client data:", cid, parsed.error);
    }

    const clientData = parsed.success
      ? parsed.data
      : { ...data, cid: data.cid ?? snapshot.id };

    // Normalize parsed.client so it matches the Client type:
    // - convert any nullable fields that are `null` to `undefined`
    // - convert nullable cid (null) to undefined
    // - normalize createdAt to a Date or undefined
    const sanitized = Object.fromEntries(
      Object.entries(clientData).map(([k, v]) => [k, v === null ? undefined : v])
    ) as any;

    const client: Client = {
      ...sanitized,
      cid: sanitized.cid ?? snapshot.id,
      createdAt: sanitized.createdAt
        ? typeof sanitized.createdAt === "string"
          ? new Date(sanitized.createdAt)
          : sanitized.createdAt
        : undefined,
    };

    return client;
  } catch (error) {
    console.error("Error fetching client:", error);
    return null;
  }
}

/**
 * Fetch a single project by ID (pid) from Firestore.
 * Converts Firestore timestamps and validates with Zod schema.
 * Returns null if not found or validation fails.
 */
export async function getProjectById(pid: string): Promise<Project | null> {
  try {
    const docRef = doc(db, "projects", pid);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data();

    // Handle createdAt timestamp conversion
    if (data.createdAt?.toDate) {
      data.createdAt = data.createdAt.toDate();
    } else if (data.createdAt?._seconds !== undefined) {
      const seconds = data.createdAt._seconds || 0;
      const nanoseconds = data.createdAt._nanoseconds || 0;
      data.createdAt = new Date(seconds * 1000 + nanoseconds / 1000000);
    }
    
    // Handle startDate timestamp conversion
    if (data.startDate?.toDate) {
      data.startDate = data.startDate.toDate();
    } else if (data.startDate?._seconds !== undefined) {
      const seconds = data.startDate._seconds || 0;
      const nanoseconds = data.startDate._nanoseconds || 0;
      data.startDate = new Date(seconds * 1000 + nanoseconds / 1000000);
    }

    // Validate with Zod schema
    const parsed = projectSchema.safeParse({ id: snapshot.id, ...data });

    if (!parsed.success) {
      console.warn("Failed to validate project:", pid, parsed.error);
      return null;
    }

    // Normalize and format project fields
    const allowedStatuses = ["Ongoing", "Cancelled", "Completed"] as const;
    const normalizedStatus = allowedStatuses.includes(
      parsed.data.status as any
    )
      ? (parsed.data.status as typeof allowedStatuses[number])
      : undefined;

    const project: Project = {
      ...parsed.data,
      fundingCategory:
        parsed.data.fundingCategory === "External" ||
        parsed.data.fundingCategory === "In-House"
          ? parsed.data.fundingCategory
          : undefined,
      // normalize sendingInstitution to the exact allowed union values
      sendingInstitution:
        parsed.data.sendingInstitution === "UP System" ||
        parsed.data.sendingInstitution === "SUC/HEI" ||
        parsed.data.sendingInstitution === "Government" ||
        parsed.data.sendingInstitution === "Private/Local" ||
        parsed.data.sendingInstitution === "International" ||
        parsed.data.sendingInstitution === "N/A"
          ? parsed.data.sendingInstitution
          : undefined,
      status: normalizedStatus,
      clientNames: parsed.data.clientNames?.map((s) => s.trim()) || [],
      startDate: parsed.data.startDate
        ? new Date(parsed.data.startDate).toISOString().split("T")[0]
        : undefined,
      createdAt: parsed.data.createdAt
        ? typeof parsed.data.createdAt === "string"
          ? new Date(parsed.data.createdAt)
          : parsed.data.createdAt
        : undefined,
    };

    return project;
  } catch (error) {
    console.error(" Error fetching project:", error);
    return null;
  }
}