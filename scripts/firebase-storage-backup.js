#!/usr/bin/env node

const admin = require("firebase-admin");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const BACKUP_RETENTION_DAYS = 30;
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env"), override: false });

function loadServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid JSON.");
    }
  }

  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (rawBase64) {
    try {
      return JSON.parse(Buffer.from(rawBase64, "base64").toString("utf8"));
    } catch {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_BASE64 must contain base64-encoded service-account JSON.",
      );
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  const keyPath = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(keyPath)) {
    try {
      return JSON.parse(fs.readFileSync(keyPath, "utf8"));
    } catch {
      throw new Error(`Could not parse service account file: ${keyPath}`);
    }
  }

  return null;
}

function safeObjectPath(root, objectName) {
  const segments = objectName.split("/").map((segment) => {
    let safe = segment.replace(/[<>:"|?*%\\\x00-\x1f]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
    );
    safe = safe.replace(/[. ]+$/g, (trailing) =>
      [...trailing]
        .map((character) => `%${character.charCodeAt(0).toString(16)}`)
        .join(""),
    );
    if (safe === "." || safe === "..") {
      safe = [...safe]
        .map((character) => `%${character.charCodeAt(0).toString(16)}`)
        .join("");
    }
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(safe)) {
      safe = `_${safe}`;
    }
    return safe || "_";
  });

  const destination = path.resolve(root, ...segments);
  const relative = path.relative(root, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe Storage object path: ${objectName}`);
  }
  return destination;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** unitIndex).toFixed(2)} ${units[unitIndex]}`;
}

function cleanupExpiredBackups(currentBackupPath) {
  const backupsRoot = path.join(projectRoot, "backups");
  const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removedCount = 0;

  for (const entry of fs.readdirSync(backupsRoot, { withFileTypes: true })) {
    if (
      !entry.isDirectory() ||
      !entry.name.startsWith("firebase-storage-backup-")
    ) {
      continue;
    }

    const backupPath = path.resolve(backupsRoot, entry.name);
    if (backupPath === currentBackupPath) continue;

    const metadataPath = path.join(backupPath, "backup-metadata.json");
    if (!fs.existsSync(metadataPath)) continue;

    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      if (
        metadata.backupType !== "firebase-storage" ||
        typeof metadata.timestamp !== "string"
      ) {
        continue;
      }

      const backupTime = Date.parse(metadata.timestamp);
      if (Number.isNaN(backupTime) || backupTime >= cutoff) continue;

      fs.rmSync(backupPath, { recursive: true, force: false });
      removedCount += 1;
      console.log(`Removed expired Storage backup: ${entry.name}`);
    } catch (error) {
      console.error(
        `Could not clean up Storage backup ${entry.name}:`,
        error.message,
      );
    }
  }

  console.log(
    `Retention cleanup removed ${removedCount} Storage backup(s) older than ${BACKUP_RETENTION_DAYS} days.`,
  );
}

async function downloadStorageBackup() {
  const serviceAccount = loadServiceAccount();
  if (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Firebase Admin credentials are missing. Set GOOGLE_APPLICATION_CREDENTIALS, configure FIREBASE_SERVICE_ACCOUNT, or add scripts/serviceAccountKey.json.",
    );
  }

  const configuredBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    serviceAccount?.storage_bucket ||
    (serviceAccount?.project_id
      ? `${serviceAccount.project_id}.firebasestorage.app`
      : "");
  if (!configuredBucket) {
    throw new Error(
      "Storage bucket is not configured. Set FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to the bucket name shown in Firebase Console.",
    );
  }

  const bucketName = configuredBucket.replace(/^gs:\/\//, "").trim();
  if (!bucketName) {
    throw new Error("The configured Firebase Storage bucket name is empty.");
  }

  admin.initializeApp({
    ...(serviceAccount
      ? { credential: admin.credential.cert(serviceAccount) }
      : { credential: admin.credential.applicationDefault() }),
    storageBucket: bucketName,
  });

  const sizeOnly = process.argv.includes("--size-only");
  console.log(
    `${sizeOnly ? "Checking" : "Downloading"} Firebase Storage bucket: ${bucketName}`,
  );
  const [files] = await admin.storage().bucket(bucketName).getFiles();
  const objects = files.filter((file) => !file.name.endsWith("/"));
  const totalBytes = objects.reduce(
    (total, file) => total + Number(file.metadata.size || 0),
    0,
  );

  if (sizeOnly) {
    console.log(`Objects: ${objects.length}`);
    console.log(`Stored size: ${formatBytes(totalBytes)} (${totalBytes} bytes)`);
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    projectRoot,
    "backups",
    `firebase-storage-backup-${timestamp}`,
  );
  fs.mkdirSync(backupPath, { recursive: true });
  console.log(`Backup folder: ${backupPath}`);

  for (let index = 0; index < objects.length; index += 1) {
    const file = objects[index];
    const destination = safeObjectPath(backupPath, file.name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    await file.download({ destination });

    console.log(
      `[${index + 1}/${objects.length}] Downloaded ${file.name} (${formatBytes(Number(file.metadata.size || 0))})`,
    );
  }

  const metadata = {
    backupType: "firebase-storage",
    bucket: bucketName,
    timestamp: new Date().toISOString(),
    totalFiles: objects.length,
    totalBytes,
  };
  fs.writeFileSync(
    path.join(backupPath, "backup-metadata.json"),
    JSON.stringify(metadata, null, 2),
  );

  console.log(
    `Storage download complete: ${objects.length} file(s), ${totalBytes} bytes.`,
  );
  console.log(`Local backup: ${backupPath}`);
  cleanupExpiredBackups(backupPath);
}

downloadStorageBackup().catch((error) => {
  console.error("Firebase Storage download failed:", error.message);
  process.exitCode = 1;
});
