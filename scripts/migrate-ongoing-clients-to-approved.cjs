#!/usr/bin/env node
// One-time migration: convert clients.status 'Ongoing' -> 'Approved'
// Run: node scripts/migrate-ongoing-clients-to-approved.cjs

const admin = require('firebase-admin');
const path = require('path');

const EXPECTED_MATCH_COUNT = 142;
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (err) {
  console.error('Could not load serviceAccountKey.json from scripts/:', err.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrate() {
  const snapshot = await db.collection('clients').where('status', '==', 'Ongoing').get();

  if (snapshot.size !== EXPECTED_MATCH_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_MATCH_COUNT} matching clients, found ${snapshot.size}; no records were changed.`,
    );
  }

  console.log(`Updating ${snapshot.size} client records.`);
  const docs = snapshot.docs;
  const batchSize = 450;
  let updated = 0;

  for (let index = 0; index < docs.length; index += batchSize) {
    const batch = db.batch();
    const chunk = docs.slice(index, index + batchSize);
    chunk.forEach((docSnap) => {
      batch.update(docSnap.ref, { status: 'Approved' });
    });
    await batch.commit();
    updated += chunk.length;
  }

  const remaining = await db.collection('clients').where('status', '==', 'Ongoing').get();
  if (!remaining.empty) {
    throw new Error(`Migration completed with ${remaining.size} Ongoing client record(s) remaining.`);
  }

  console.log(`Migration complete. Updated ${updated} client record(s); no Ongoing client records remain.`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
