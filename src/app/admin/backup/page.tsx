"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Download,
  Upload,
  Database,
  Calendar,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PermissionGuard } from "@/components/PermissionGuard";

interface BackupItem {
  id: string;
  name: string;
  timestamp: string;
  totalDocuments: number;
  size: string;
  collections: string[];
  duration?: number;
}

interface DatabaseStats {
  totalCollections: number;
  totalDocuments: number;
  estimatedSize: string;
}

export default function BackupPage() {
  return (
    <PermissionGuard module="databaseBackup" action="view">
      <BackupContent />
    </PermissionGuard>
  );
}

function BackupContent() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(
    null,
  );
  const { toast } = useToast();

  // Load existing backups and database stats on component mount
  useEffect(() => {
    loadBackups();
    loadDatabaseStats();
  }, []);

  const loadBackups = async () => {
    try {
      const response = await fetch("/api/admin/restore");
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups || []);
      }
    } catch (error) {
      console.error("Failed to load backups:", error);
      toast({
        title: "Error",
        description: "Failed to load existing backups",
        variant: "destructive",
      });
    }
  };

  const loadDatabaseStats = async () => {
    try {
      const response = await fetch("/api/admin/backup/stats");
      if (response.ok) {
        const data = await response.json();
        setDbStats(data);
      }
    } catch (error) {
      console.error("Failed to load database stats:", error);
    }
  };

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    setBackupProgress(0);

    try {
      console.log("🚀 Starting backup request...");

      // Start progress simulation
      const progressInterval = setInterval(() => {
        setBackupProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      clearInterval(progressInterval);

      console.log("Response status:", response.status, response.statusText);

      const result = await response.json();

      console.log("Backup response:", result);

      if (!response.ok || !result.success) {
        const errorMsg =
          result.details || result.error || result.message || "Backup failed";
        console.error("Backup error details:", {
          status: response.status,
          statusText: response.statusText,
          result,
        });
        throw new Error(errorMsg);
      }

      setBackupProgress(100);

      // If backup data is available for download (Vercel environment)
      if (result.downloadReady && result.data) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `firestore-backup-${timestamp}.json`;

        // Create download link
        const dataStr = JSON.stringify(result.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);

        toast({
          title: "Success",
          description: `Backup created and downloaded as ${filename}`,
          variant: "default",
        });
      } else {
        toast({
          title: "Success",
          description: `Database backup created successfully. ${result.output || ""}`,
          variant: "default",
        });
      }

      // Reload backups list
      setTimeout(() => {
        loadBackups();
        setBackupProgress(0);
      }, 1000);
    } catch (error) {
      console.error("❌ Backup failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create backup";
      toast({
        title: "Backup Error",
        description: errorMessage,
        variant: "destructive",
      });
      setBackupProgress(0);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async (backupId: string) => {
    setRestoringBackupId(backupId);
    setIsRestoring(true);
    setRestoreProgress(0);

    try {
      // Start progress simulation
      const progressInterval = setInterval(() => {
        setRestoreProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 10;
        });
      }, 800);

      const response = await fetch("/api/admin/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ backupId }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error("Restore failed");
      }

      setRestoreProgress(100);

      toast({
        title: "Success",
        description: "Database restored successfully",
        variant: "default",
      });

      // Reload database stats
      setTimeout(() => {
        loadDatabaseStats();
        setRestoreProgress(0);
      }, 1000);
    } catch (error) {
      console.error("Restore failed:", error);
      toast({
        title: "Error",
        description: "Failed to restore backup",
        variant: "destructive",
      });
    } finally {
      setRestoringBackupId(null);
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    try {
      const response = await fetch(`/api/admin/restore?backupId=${backupId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      toast({
        title: "Success",
        description: "Backup deleted successfully",
        variant: "default",
      });

      loadBackups();
    } catch (error) {
      console.error("Delete failed:", error);
      toast({
        title: "Error",
        description: "Failed to delete backup",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Database Backup</h1>
          <p className="text-slate-600 mt-1">
            Create and manage Firestore database backups
          </p>
        </div>

        <Button
          onClick={loadBackups}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Database Stats Card */}
      {dbStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-[#166FB5]" />
              Database Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <div className="text-2xl font-bold text-slate-900">
                  {dbStats.totalCollections}
                </div>
                <div className="text-sm text-slate-600">Collections</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {dbStats.totalDocuments}
                </div>
                <div className="text-sm text-slate-600">Documents</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {dbStats.estimatedSize}
                </div>
                <div className="text-sm text-slate-600">Est. Size</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Backup Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-[#166FB5]" />
            Create New Backup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-slate-600">
              Create a complete backup of your Firestore database including all
              collections and documents.
            </p>

            {isBackingUp && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Creating backup...</span>
                  <span>{Math.round(backupProgress)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div
                    className="bg-[#166FB5] h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${backupProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={isBackingUp}
                  className="gap-2 bg-[#166FB5] hover:bg-[#145ca3]"
                >
                  <Download className="w-4 h-4" />
                  Create Backup
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Create Database Backup</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a complete backup of your Firestore
                    database. The process may take several minutes depending on
                    your data size.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateBackup}>
                    Create Backup
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Existing Backups Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-[#166FB5]" />
            Existing Backups ({backups.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No backups found. Create your first backup above.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText className="w-5 h-5 text-[#166FB5]" />
                        <h3 className="font-medium text-slate-900">
                          {backup.name}
                        </h3>
                        <Badge variant="outline" className="text-xs">
                          {backup.size}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {formatDate(backup.timestamp)}
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          {backup.totalDocuments} documents
                        </div>
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          {backup.collections.length} collections
                        </div>
                      </div>

                      {backup.duration && backup.duration > 0 && (
                        <div className="mt-2 text-xs text-slate-500">
                          Backup completed in {formatDuration(backup.duration)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRestoring}
                            className="gap-2"
                          >
                            {restoringBackupId === backup.id ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Restoring...
                              </>
                            ) : (
                              <>
                                <Upload className="w-4 h-4" />
                                Restore
                              </>
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Restore Database
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will restore your database to the state of
                              this backup.
                              <strong className="text-red-600">
                                {" "}
                                This action cannot be undone.
                              </strong>
                              <br />
                              <br />
                              Backup: {backup.name}
                              <br />
                              Created: {formatDate(backup.timestamp)}
                              <br />
                              Documents: {backup.totalDocuments}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRestoreBackup(backup.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Restore Database
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Backup</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this backup? This
                              action cannot be undone.
                              <br />
                              <br />
                              <strong>{backup.name}</strong>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteBackup(backup.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete Backup
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Progress */}
      {isRestoring && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#166FB5]" />
                <span className="font-medium">Restoring Database...</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Progress</span>
                <span className="text-slate-500">{restoreProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-[#166FB5] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${restoreProgress}%` }}
                ></div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-800">
                  Please do not close this page or navigate away during the
                  restore process.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
