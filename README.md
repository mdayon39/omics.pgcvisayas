# PGC GenomeBase

A Next.js application for managing genomics projects, quotations, and client relationships with integrated Firestore database backup features.

## Features

- 🔐 Role-based access control (Superadmin, Admin, User)
- 📊 Dashboard with real-time analytics
- 💼 Client and project management
- 📝 Quotation generation and tracking
- 📈 Charge slip management
- 💾 **Three Backup Methods:**
  - **Download Backup** - Save to any device/browser with directory selection
  - **Server Backup** - Create backups on Vercel server
  - **Google Drive Auto Backup** - Scheduled incremental backups every Friday

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Firebase project with Firestore
- (Optional) Google Drive API credentials for auto-backups

### Environment Setup

1. Copy the example environment file:
```bash
cp .env.example .env.local
```

2. Add your Firebase configuration to `.env.local`:
   - Client SDK credentials (already configured)
   - **Firebase Admin SDK credentials** (required for backup download feature)
   
   See [FIREBASE_ADMIN_SETUP.md](./FIREBASE_ADMIN_SETUP.md) for detailed instructions.

### Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Database Backup Features

This application includes three comprehensive backup methods:

### Download Firebase Storage files

To download all objects from the Firebase Storage bucket to your computer, run:

```bash
npm run backup:storage
```

To check the total object count and stored size without downloading files, run:

```bash
npm run storage:size
```

To schedule an automatic local download on Windows, open PowerShell in the
repository folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-firebase-storage-backup-task.ps1
```

The scheduled task runs every Monday, Wednesday, and Friday at 9:00 AM (or the
next available scheduled day if today's run time has passed). It runs while the
Windows account is logged in; Task Scheduler starts a missed run when possible. Each successful backup
removes only valid Firebase Storage backup folders older than 30 days. The
latest run log is `backups/firebase-storage-backup-task.log`. To remove the
schedule, run
`Unregister-ScheduledTask -TaskName "PGC Firebase Storage Backup" -Confirm:$false`.

### Schedule Firestore collections backup on Windows

To back up Firestore collections locally every day at 11:00 AM, run this from
PowerShell in the repository folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-firestore-collections-backup-task.ps1
```

The task uses `scripts/serviceAccountKey.json`, retains Firestore collection
backups for 30 days, and removes older collection backup folders after each
successful daily backup. It runs while this Windows account is logged in and
starts missed runs when possible. Its log is
`backups/firestore-collections-backup-task.log`. To remove the schedule, run
`Unregister-ScheduledTask -TaskName "PGC Firestore Collections Backup" -Confirm:$false`.

The files are saved under `backups/firebase-storage-backup-<timestamp>/`, with
their Storage folder structure preserved. The script also writes a
`backup-metadata.json` file. Backups are excluded from Git.

The command uses the Firebase Admin service account from
`scripts/serviceAccountKey.json`, `FIREBASE_SERVICE_ACCOUNT`, or
`GOOGLE_APPLICATION_CREDENTIALS`. Set `FIREBASE_STORAGE_BUCKET` or
`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` to the bucket name shown in Firebase
Console. The service account must have permission to list and read objects in
that bucket.

### 1. Download Backup to Your Computer ⬇️
- **Best for:** Individual users wanting local backups
- **Works on:** Any browser, any device (desktop, laptop, mobile)
- **Directory Selection:** 
  - Chrome/Edge: Choose exact folder location
  - Other browsers: Downloads to default Downloads folder
- **Setup Required:** Firebase Admin SDK credentials ([Setup Guide](./FIREBASE_ADMIN_SETUP.md))

### 2. Server Backup (Advanced) 🖥️
- **Best for:** Automated server-side backups
- **Storage:** Vercel server filesystem
- **Access:** Superadmin only
- **Use Case:** Quick backups accessible from server

### 3. Google Drive Automatic Backup 📅
- **Best for:** Scheduled incremental backups
- **Schedule:** Every Friday at 6:00 PM
- **Features:** 
  - Incremental backup (saves ~73% storage)
  - Automatic change tracking
  - Cloud storage integration
- **Setup Required:** Google Drive API credentials ([Setup Guide](./GOOGLE_DRIVE_BACKUP_GUIDE.md))

### Security & Permissions

All backup features are **restricted to Superadmin role only** through the `databaseBackup` permission module.

## Documentation

- **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Fix deployment errors and configure environment variables
- [Firebase Admin Setup](./FIREBASE_ADMIN_SETUP.md) - Configure Firebase Admin SDK for backup downloads
- [Google Drive Backup Guide](./GOOGLE_DRIVE_BACKUP_GUIDE.md) - Set up automatic Drive backups
- [Activity Logging Guide](./ACTIVITY_LOGGING_GUIDE.md) - Configure activity tracking
- [Catalog Management Guide](./CATALOG_MANAGEMENT_GUIDE.md) - Manage service catalog
- [Migration Guide](./MIGRATION_GUIDE.md) - Database migration information

## Deployment

### Deploying to Vercel/Netlify/Other Platforms

⚠️ **Important:** Before deploying, you must configure environment variables on your deployment platform.

See the **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** for detailed instructions on:
- Setting up required environment variables
- Configuring Firebase credentials
- Troubleshooting common deployment errors

### Quick Deploy Steps:
1. Push your code to GitHub
2. Connect your repository to Vercel/Netlify
3. **Add all environment variables** (see [Deployment Guide](./DEPLOYMENT_GUIDE.md))
4. Deploy!

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
