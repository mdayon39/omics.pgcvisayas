// Service for updating a project document in Firestore (admin use).
// Accepts validated admin project data and merges it into the existing project document.

import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { AdminProjectData } from "@/schemas/adminProjectSchema";

/**
 * Updates a project document in Firestore.
 * @param data The project data to update. Must include a valid pid.
 * @returns Promise<void>
 */
export async function editProject(data: AdminProjectData): Promise<void> {
  if (!data.pid) {
    throw new Error("Project ID (pid) is required to update a project.");
  }
  // Reference the project document by pid
  const docRef = doc(db, "projects", data.pid);
  // Merge the new data into the existing document
  const firestoreData = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
  await setDoc(docRef, firestoreData, { merge: true });
}
