// src/lib/firebase-admin.ts
import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

function parseServiceAccountFromEnv() {
  // Option 1: full JSON string in one env var
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch (error) {
      console.error("❌ Invalid FIREBASE_SERVICE_ACCOUNT JSON:", error);
    }
  }

  // Option 2: base64-encoded full JSON (common workaround for CI/CD env handling)
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (rawBase64) {
    try {
      const decoded = Buffer.from(rawBase64, "base64").toString("utf-8");
      return JSON.parse(decoded);
    } catch (error) {
      console.error(
        "❌ Invalid FIREBASE_SERVICE_ACCOUNT_BASE64 payload:",
        error,
      );
    }
  }

  // Option 3: split fields
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKeyRaw) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKeyRaw.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

let adminInitAttempted = false;

function initializeAdminApp() {
  if (adminInitAttempted) return;
  adminInitAttempted = true;

  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("✅ Firebase Admin initialized via environment variables");
      return;
    } catch (error) {
      console.error("❌ Firebase Admin init from env failed:", error);
    }
  }

  const keyPath = path.join(process.cwd(), "scripts", "serviceAccountKey.json");
  if (fs.existsSync(keyPath)) {
    try {
      const serviceAccountFile = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountFile),
      });
      console.log("✅ [Firebase Admin] Initialized via serviceAccountKey.json");
      return;
    } catch (error) {
      console.error(
        "❌ Firebase Admin init from service account file failed:",
        error,
      );
    }
  }

  try {
    // Final fallback for GCP-hosted environments using workload identity.
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
    console.log(
      "✅ [Firebase Admin] Initialized via application default credentials",
    );
  } catch (error) {
    console.error("❌ Firebase Admin initialization error:", error);
  }
}

if (!admin.apps.length) {
  initializeAdminApp();
}

// Add an exported getter to handle lazy initialization during Fast Refresh or lazy loading
export function getAdminDb() {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }
  return null;
}

export const adminDb = getAdminDb();
if (!adminDb) {
  console.error(
    "❌ adminDb failed to initialize at module level. admin.apps.length:",
    admin.apps.length,
  );
}

export function getFirestoreDb() {
  if (adminDb) return adminDb;
  if (admin.apps.length > 0) return admin.firestore();
  return null;
}

function normalizeBucketName(raw: string): string {
  return raw.replace(/^gs:\/\//, "").trim();
}

export function getStorageBucket() {
  if (admin.apps.length === 0) return null;

  const configuredBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    (admin.app().options.storageBucket as string | undefined);

  const bucketName =
    configuredBucket && configuredBucket.trim()
      ? normalizeBucketName(configuredBucket)
      : admin.app().options.projectId
        ? `${admin.app().options.projectId}.appspot.com`
        : "";

  if (!bucketName) return null;

  try {
    return admin.storage().bucket(bucketName);
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Storage bucket:", error);
    return null;
  }
}

export default admin;
