import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  SampleFormData,
  SampleFormRecord,
  SampleFormSummary,
} from "@/types/SampleForm";
import { resolveClientUuid } from "@/services/clientUuidService";

const SAMPLE_FORMS_COLLECTION = "sampleForms";

export async function getNextSampleFormId(): Promise<string> {
  const ref = collection(db, SAMPLE_FORMS_COLLECTION);
  const q = query(ref, orderBy("formId", "desc"), limit(1));
  const snapshot = await getDocs(q);

  let nextNum = 1;
  if (!snapshot.empty) {
    const lastDoc = snapshot.docs[0].data();
    const lastId = lastDoc.formId as string;
    if (lastId && lastId.startsWith("PGCV-LF-SSF-")) {
      const numPart = lastId.replace("PGCV-LF-SSF-", "");
      const lastNum = parseInt(numPart, 10);
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1;
      }
    }
  }

  return `PGCV-LF-SSF-${nextNum}`;
}

export async function createSampleForm(
  payload: SampleFormData & {
    inquiryId: string;
    projectId: string;
    projectTitle?: string;
    clientId?: string;
    submittedByEmail: string;
    submittedByName?: string;
  },
): Promise<string> {
  const formId = await getNextSampleFormId();
  const ref = doc(db, SAMPLE_FORMS_COLLECTION, formId);
  const uuid = await resolveClientUuid(
    payload.inquiryId,
    payload.submittedByEmail,
  );

  await setDoc(ref, {
    ...payload,
    ...(uuid ? { uuid } : {}),
    formId,
    sfid: formId,
    status: "Submitted",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return formId;
}

export async function getSampleFormsByProjectId(
  projectId: string,
): Promise<SampleFormSummary[]> {
  if (!projectId) return [];

  const q = query(
    collection(db, SAMPLE_FORMS_COLLECTION),
    where("projectId", "==", projectId),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((record) => {
    const data = record.data() as any;
    return {
      id: record.id,
      projectId: data.projectId || "",
      totalNumberOfSamples: Number(data.totalNumberOfSamples || 0),
      submittedByEmail: data.submittedByEmail || "",
      createdAt: data.createdAt,
    } as SampleFormSummary;
  });
}

export async function getSampleFormById(
  formId: string,
): Promise<SampleFormRecord | null> {
  if (!formId) return null;

  // Primary lookup: document ID equals formId (standard path)
  const ref = doc(db, SAMPLE_FORMS_COLLECTION, formId);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    const data = snapshot.data() as Omit<SampleFormRecord, "id">;
    return { ...data, id: snapshot.id };
  }

  // Fallback: query by the formId field in case the doc ID differs
  const q = query(
    collection(db, SAMPLE_FORMS_COLLECTION),
    where("formId", "==", formId),
    limit(1),
  );
  const qSnap = await getDocs(q);
  if (!qSnap.empty) {
    const d = qSnap.docs[0];
    return { ...(d.data() as Omit<SampleFormRecord, "id">), id: d.id };
  }

  return null;
}

export async function getAllSampleForms(): Promise<SampleFormRecord[]> {
  const ref = collection(db, SAMPLE_FORMS_COLLECTION);
  const q = query(ref, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((record) => {
    const data = record.data() as any;
    return {
      ...data,
      id: record.id,
    } as SampleFormRecord;
  });
}

export async function saveSampleFormPdf(
  formId: string,
  dataUrl: string,
): Promise<void> {
  if (!formId) throw new Error("Missing formId");
  if (!dataUrl) throw new Error("Missing PDF data");

  const ref = doc(db, "sampleFormsPDF", formId);
  await setDoc(
    ref,
    {
      formId,
      dataUrl,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
