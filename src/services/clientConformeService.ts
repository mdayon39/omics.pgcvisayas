// Client Conforme Service - Legal document management
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ClientConformeData, ClientConforme } from "@/types/ClientConforme";
import { resolveClientUuid } from "@/services/clientUuidService";

const COLLECTION = "clientConformes";

// Generate a hash of the document content for integrity verification
function generateDocumentHash(
  data: Omit<
    ClientConformeData,
    "documentHash" | "createdAt" | "agreementDate"
  >,
): string {
  const content = [
    data.documentVersion,
    data.clientName,
    data.designation,
    data.affiliation,
    data.projectTitle,
    data.fundingAgency,
    data.inquiryId,
    "PGCV_CLIENT_CONFORME", // Salt
  ].join("|");

  // Simple hash implementation (in production, use crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

// Get client IP and browser info (to be called from client-side)
export function getBrowserMetadata(): {
  userAgent: string;
  browserFingerprint: string;
} {
  const userAgent = typeof window !== "undefined" ? navigator.userAgent : "";

  // Simple browser fingerprint
  const fingerprint =
    typeof window !== "undefined"
      ? [
          navigator.language,
          screen.width + "x" + screen.height,
          new Date().getTimezoneOffset(),
          navigator.platform,
        ].join("|")
      : "";

  return {
    userAgent,
    browserFingerprint: btoa(fingerprint), // Base64 encode
  };
}

/**
 * Create a new Client Conforme record when client agrees to terms
 */
export async function createClientConforme(
  baseData: Omit<
    ClientConformeData,
    "documentHash" | "createdAt" | "agreementDate" | "clientSignature"
  >,
  clientIpAddress: string,
  clientSignatureData?: string,
): Promise<string> {
  try {
    console.log("🔐 Creating Client Conforme service call", {
      inquiryId: baseData.inquiryId,
      clientName: baseData.clientName,
    });

    const metadata = getBrowserMetadata();
    const timestamp = new Date();
    const uuid = await resolveClientUuid(
      baseData.inquiryId,
      baseData.createdBy,
    );

    const conformeData: ClientConformeData = {
      ...baseData,
      documentHash: generateDocumentHash(baseData),
      agreementDate: timestamp,
      clientIpAddress,
      userAgent: metadata.userAgent,
      browserFingerprint: metadata.browserFingerprint,
      clientSignature: {
        method: "typed_name", // Default to typed name
        data: clientSignatureData || baseData.clientName,
        timestamp: timestamp,
      },
      createdAt: timestamp,
      status: "pending_director",
    };

    // Generate document ID: inquiryId_timestamp
    const docId = `${baseData.inquiryId}_${timestamp.getTime()}`;
    const docRef = doc(db, COLLECTION, docId);

    console.log("💾 Saving to Firestore with ID:", docId);

    try {
      await setDoc(docRef, {
        data: {
          ...conformeData,
          ...(uuid ? { uuid } : {}),
          agreementDate: Timestamp.fromDate(
            new Date(conformeData.agreementDate),
          ),
          createdAt: serverTimestamp(),
          ...(conformeData.clientSignature && {
            clientSignature: {
              ...conformeData.clientSignature,
              timestamp: Timestamp.fromDate(
                new Date(conformeData.clientSignature.timestamp),
              ),
            },
          }),
        },
      });

      console.log("✅ Client Conforme saved successfully:", docId);
    } catch (firestoreError) {
      console.error(
        "🔥 Firestore Error - likely permission issue:",
        firestoreError,
      );
      console.log(
        "📄 Conforme data that would have been saved:",
        JSON.stringify(conformeData, null, 2),
      );

      // For development: throw a more descriptive error
      throw new Error(
        `Firestore write failed - check security rules for 'clientConformes' collection: ${firestoreError}`,
      );
    }
    return docId;
  } catch (error) {
    console.error("❌ Error in createClientConforme service:", error);
    throw error; // Re-throw to let API handle it
  }
}

/**
 * Add program director signature to complete the conforme
 */
export async function addDirectorSignature(
  conformeId: string,
  directorEmail: string = "vnferriols@up.edu.ph",
): Promise<void> {
  try {
    console.log("🖋️ Adding director signature to:", conformeId);

    const docRef = doc(db, COLLECTION, conformeId);

    const programDirectorSignature = {
      method: "auto_approved" as const,
      data: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D.",
      signedBy: directorEmail,
      timestamp: Timestamp.fromDate(new Date()),
    };

    await setDoc(
      docRef,
      {
        "data.programDirectorSignature": programDirectorSignature,
        "data.status": "completed",
      },
      { merge: true },
    );

    console.log("✅ Director signature added successfully");
  } catch (error) {
    console.error("❌ Error adding director signature:", error);
    throw error;
  }
}

/**
 * Get all Client Conforme records for an inquiry
 */
export async function getClientConformesByInquiry(
  inquiryId: string,
): Promise<ClientConforme[]> {
  const q = query(
    collection(db, COLLECTION),
    where("data.inquiryId", "==", inquiryId),
    orderBy("data.createdAt", "desc"),
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data().data as ClientConformeData,
  }));
}

/**
 * Get Client Conforme for a specific project
 */
export async function getClientConformeByProject(
  projectPid: string,
): Promise<ClientConforme | null> {
  const q = query(
    collection(db, COLLECTION),
    where("data.projectPid", "==", projectPid),
    orderBy("data.createdAt", "desc"),
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    data: doc.data().data as ClientConformeData,
  };
}

/**
 * Verify document integrity by checking hash
 */
export function verifyDocumentIntegrity(conforme: ClientConforme): boolean {
  const expectedHash = generateDocumentHash({
    documentVersion: conforme.data.documentVersion,
    clientName: conforme.data.clientName,
    designation: conforme.data.designation,
    affiliation: conforme.data.affiliation,
    projectTitle: conforme.data.projectTitle,
    fundingAgency: conforme.data.fundingAgency,
    inquiryId: conforme.data.inquiryId,
    projectPid: conforme.data.projectPid,
    projectRequestId: conforme.data.projectRequestId,
    clientIpAddress: conforme.data.clientIpAddress,
    userAgent: conforme.data.userAgent,
    browserFingerprint: conforme.data.browserFingerprint,
    clientSignature: conforme.data.clientSignature,
    programDirectorSignature: conforme.data.programDirectorSignature,
    createdBy: conforme.data.createdBy,
    status: conforme.data.status,
  });

  return expectedHash === conforme.data.documentHash;
}

/**
 * Get client IP address (server-side helper)
 * Note: This would typically be called from an API route
 */
export function getClientIpAddress(request: Request): string {
  // Try different headers for IP address
  const xForwardedFor = request.headers.get("x-forwarded-for");
  const xRealIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }

  if (xRealIp) {
    return xRealIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fallback
  return "unknown";
}
