@echo off
echo ===============================================
echo    Firestore Backup Tool
echo ===============================================
echo.

cd /d "%~dp0.."

echo 🚀 Starting Firestore backup...
echo.

node scripts/firestore-backup.js

echo.
echo ===============================================
echo    Backup completed at %date% %time%
echo ===============================================

pause