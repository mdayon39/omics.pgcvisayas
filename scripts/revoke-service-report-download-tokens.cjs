#!/usr/bin/env node
// Remove permanent Firebase download tokens from service report objects.
// Dry run: node scripts/revoke-service-report-download-tokens.cjs
// Apply:   node scripts/revoke-service-report-download-tokens.cjs --apply

const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (error) {
  console.error('Could not load serviceAccountKey.json from scripts/:', error.message);
  process.exit(1);
}

const bucketName =
  process.env.FIREBASE_STORAGE_BUCKET ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  serviceAccount.storage_bucket ||
  (serviceAccount.project_id
    ? `${serviceAccount.project_id}.firebasestorage.app`
    : '');

if (!bucketName) {
  console.error('Storage bucket is not configured.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: bucketName,
});

const bucket = admin.storage().bucket(bucketName);
const applyChanges = process.argv.includes('--apply');

async function revokeTokens() {
  const [files] = await bucket.getFiles({ prefix: 'serviceReports/' });
  let tokenizedFiles = 0;
  let revokedFiles = 0;
  const errors = [];

  console.log(`${applyChanges ? 'Applying' : 'Dry run:'} found ${files.length} service-report object(s) in ${bucket.name}.`);

  for (const file of files) {
    try {
      const [metadata] = await file.getMetadata();
      const downloadTokens = metadata.metadata?.firebaseStorageDownloadTokens;
      if (!downloadTokens) continue;

      tokenizedFiles += 1;
      if (!applyChanges) continue;

      await file.setMetadata({
        metadata: { firebaseStorageDownloadTokens: null },
      });
      revokedFiles += 1;
    } catch (error) {
      errors.push(file.name);
      console.error(`Failed to revoke a service-report token for ${file.name}:`, error.message);
    }
  }

  console.log(`Objects with public download tokens: ${tokenizedFiles}`);
  if (applyChanges) console.log(`Tokens revoked: ${revokedFiles}`);
  else console.log('No changes made. Re-run with --apply to revoke these tokens.');

  if (errors.length > 0) {
    throw new Error(`Failed to update ${errors.length} service-report object(s).`);
  }
}

revokeTokens()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Service-report token revocation failed:', error);
    process.exit(1);
  });
