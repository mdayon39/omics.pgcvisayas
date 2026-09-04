import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function normalizeEmail(value?: string | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function resolveClientUuid(
  inquiryId?: string | null,
  email?: string | null,
): Promise<string | null> {
  try {
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      const usersRef = collection(db, "users");
      const exactMatch = await getDocs(
        query(usersRef, where("email", "==", normalizedEmail), limit(1)),
      );
      if (!exactMatch.empty) {
        const uid = exactMatch.docs[0].data().uid;
        return typeof uid === "string" && uid ? uid : exactMatch.docs[0].id;
      }

      const usersSnapshot = await getDocs(usersRef);
      for (const userDoc of usersSnapshot.docs) {
        if (normalizeEmail(userDoc.data().email) !== normalizedEmail) continue;
        const uid = userDoc.data().uid;
        return typeof uid === "string" && uid ? uid : userDoc.id;
      }
    }

    if (inquiryId) {
      const inquirySnap = await getDoc(doc(db, "inquiries", inquiryId));
      const inquiryUuid = inquirySnap.exists() ? inquirySnap.data().uuid : null;
      if (typeof inquiryUuid === "string" && inquiryUuid) return inquiryUuid;
    }
  } catch (error) {
    console.warn(
      "Unable to resolve client UUID; preserving the active write:",
      error,
    );
  }

  return null;
}
