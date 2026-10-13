"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { Info, Megaphone, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PermissionGuard } from "@/components/PermissionGuard";
import {
  CLIENT_ANNOUNCEMENT_ADMIN_EMAILS,
  CLIENT_ANNOUNCEMENT_ID,
  CLIENT_ANNOUNCEMENT_TARGET_EMAIL,
  CLIENT_ANNOUNCEMENT_VIEWER_EMAILS,
  DEFAULT_CLIENT_ANNOUNCEMENT,
} from "@/constants/clientAnnouncement";
import useAuth from "@/hooks/useAuth";
import { db } from "@/lib/firebase";

interface ClientAnnouncement {
  id: string;
  title: string;
  body: string;
  isActive: boolean;
  targetEmail: string;
  startAt: Timestamp | undefined;
  endAt: Timestamp | undefined;
}

const ANNOUNCEMENTS_REF = collection(db, "clientAnnouncements");

function toDateTimeLocal(timestamp?: Timestamp): string {
  if (!timestamp) return "";
  const date = timestamp.toDate();
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

export default function ClientAnnouncementPage() {
  const { adminInfo } = useAuth();
  const isAnnouncementAdmin = CLIENT_ANNOUNCEMENT_ADMIN_EMAILS.some(
    (email) => email === adminInfo?.email?.trim().toLowerCase(),
  );

  if (isAnnouncementAdmin) {
    return <ClientAnnouncementContent />;
  }

  return (
    <PermissionGuard module="configurations" action="edit">
      <ClientAnnouncementContent />
    </PermissionGuard>
  );
}

function ClientAnnouncementContent() {
  const { adminInfo } = useAuth();
  const [announcements, setAnnouncements] = useState<ClientAnnouncement[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [announcementToDelete, setAnnouncementToDelete] =
    useState<ClientAnnouncement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    const initializeAnnouncements = async () => {
      if (!adminInfo?.email) return;
      try {
        const migrationRef = doc(
          db,
          "clientAnnouncementSettings",
          "defaultAnnouncementMigrated",
        );
        const migrationSnapshot = await getDoc(migrationRef);
        if (!migrationSnapshot.exists()) {
          const existingAnnouncements = await getDocs(ANNOUNCEMENTS_REF);
          const hasTargetAnnouncement = existingAnnouncements.docs.some(
            (announcementDoc) =>
              announcementDoc.data().targetEmail ===
              CLIENT_ANNOUNCEMENT_TARGET_EMAIL,
          );
          if (!hasTargetAnnouncement) {
            await setDoc(
              doc(db, "clientAnnouncements", CLIENT_ANNOUNCEMENT_ID),
              {
                ...DEFAULT_CLIENT_ANNOUNCEMENT,
                isActive: true,
                targetEmail: CLIENT_ANNOUNCEMENT_TARGET_EMAIL,
                createdAt: serverTimestamp(),
                createdBy: adminInfo.email,
                updatedAt: serverTimestamp(),
                updatedBy: adminInfo.email,
              },
            );
          }
          await setDoc(migrationRef, {
            completedAt: serverTimestamp(),
            completedBy: adminInfo.email,
          });
        }
        if (cancelled) return;
        unsubscribe = onSnapshot(
          ANNOUNCEMENTS_REF,
          (snapshot) => {
            const items = snapshot.docs
              .map((announcementDoc) => {
                const data = announcementDoc.data();
                if (
                  typeof data.title !== "string" ||
                  typeof data.body !== "string" ||
                  typeof data.targetEmail !== "string"
                ) {
                  return null;
                }
                return {
                  id: announcementDoc.id,
                  title: data.title,
                  body: data.body,
                  isActive: data.isActive === true,
                  targetEmail: data.targetEmail,
                  startAt:
                    data.startAt instanceof Timestamp ? data.startAt : undefined,
                  endAt:
                    data.endAt instanceof Timestamp ? data.endAt : undefined,
                };
              })
              .filter(
                (announcement): announcement is ClientAnnouncement =>
                  announcement !== null &&
                  announcement.targetEmail ===
                    CLIENT_ANNOUNCEMENT_TARGET_EMAIL,
              )
              .sort((left, right) => left.title.localeCompare(right.title));
            setAnnouncements(items);
            setLoading(false);
          },
          (error) => {
            console.error("Failed to load client announcements:", error);
            toast.error("Could not load client announcements.");
            setLoading(false);
          },
        );
      } catch (error) {
        console.error("Failed to initialize client announcements:", error);
        toast.error("Could not initialize client announcements.");
        setLoading(false);
      }
    };
    void initializeAnnouncements();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [adminInfo?.email]);

  const startNewAnnouncement = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setStartAt("");
    setEndAt("");
    setIsActive(false);
    setEditorOpen(true);
  };

  const startEditing = (announcement: ClientAnnouncement) => {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setBody(announcement.body);
    setStartAt(toDateTimeLocal(announcement.startAt));
    setEndAt(toDateTimeLocal(announcement.endAt));
    setIsActive(announcement.isActive);
    setEditorOpen(true);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setStartAt("");
    setEndAt("");
    setIsActive(false);
    setEditorOpen(false);
  };

  const saveAnnouncement = async () => {
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) {
      toast.error("Enter both an announcement title and message.");
      return;
    }
    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (
      !startAt ||
      !endAt ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      toast.error("Enter a valid start and end date; the end must be later.");
      return;
    }
    if (!adminInfo?.email) {
      toast.error("Your admin account details could not be verified.");
      return;
    }

    setSaving(true);
    try {
      const announcementData = {
        title: cleanTitle,
        body: cleanBody,
        isActive,
        targetEmail: CLIENT_ANNOUNCEMENT_TARGET_EMAIL,
        startAt: Timestamp.fromDate(startDate),
        endAt: Timestamp.fromDate(endDate),
        updatedAt: serverTimestamp(),
        updatedBy: adminInfo.email,
      };
      if (editingId) {
        await updateDoc(
          doc(db, "clientAnnouncements", editingId),
          announcementData,
        );
        toast.success("Announcement updated.");
      } else {
        await addDoc(ANNOUNCEMENTS_REF, {
          ...announcementData,
          createdAt: serverTimestamp(),
          createdBy: adminInfo.email,
        });
        toast.success("Announcement created.");
      }
      cancelEditing();
    } catch (error) {
      console.error("Failed to save client announcement:", error);
      toast.error("Could not save the client announcement.");
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (announcement: ClientAnnouncement) => {
    setDeletingId(announcement.id);
    try {
      await deleteDoc(doc(db, "clientAnnouncements", announcement.id));
      if (editingId === announcement.id) cancelEditing();
      toast.success("Announcement deleted.");
      setAnnouncementToDelete(null);
    } catch (error) {
      console.error("Failed to delete client announcement:", error);
      toast.error("Could not delete the client announcement.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-[#166FB5]" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-slate-800">
              Client Announcements
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Manage portal announcements for{" "}
            {CLIENT_ANNOUNCEMENT_VIEWER_EMAILS.join(" and ")}.
          </p>
        </div>
        <Button
          onClick={startNewAnnouncement}
          className="bg-[#166FB5] hover:bg-[#125d99]"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Create announcement
        </Button>
      </div>

      <div
        className={`grid gap-6 ${
          editorOpen
            ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
            : "grid-cols-1"
        }`}
      >
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>
              Enabled announcements are shown in a client portal carousel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-slate-500">Loading announcements...</p>
            ) : announcements.length === 0 ? (
              <p className="rounded-lg border border-dashed p-5 text-sm text-slate-500">
                No announcements yet. Create one to show a message in the
                client portal.
              </p>
            ) : (
              announcements.map((announcement) => (
                <article
                  key={announcement.id}
                  className={`rounded-lg border p-4 ${
                    editingId === announcement.id
                      ? "border-blue-400 bg-blue-50/50"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-sm font-semibold text-slate-800">
                          {announcement.title}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            announcement.isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {announcement.isActive ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                        {announcement.body}
                      </p>
                      {announcement.startAt && announcement.endAt && (
                        <p className="mt-2 text-[11px] text-slate-500">
                          {announcement.startAt.toDate().toLocaleString()} –{" "}
                          {announcement.endAt.toDate().toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(announcement)}
                        aria-label={`Edit ${announcement.title}`}
                        title="Edit announcement"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          setAnnouncementToDelete(announcement)
                        }}
                        disabled={deletingId === announcement.id}
                        aria-label={`Delete ${announcement.title}`}
                        title="Delete announcement"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </CardContent>
        </Card>

        {editorOpen && (
          <Card>
            <CardHeader>
              <CardTitle>
                {editingId ? "Edit announcement" : "Create announcement"}
              </CardTitle>
              <CardDescription>
                Only {CLIENT_ANNOUNCEMENT_VIEWER_EMAILS.join(" and ")} can view
                these announcements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="announcement-title">Title</Label>
                <Input
                  id="announcement-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={160}
                  disabled={loading || saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="announcement-body">Message</Label>
                <Textarea
                  id="announcement-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={4000}
                  rows={11}
                  className="min-h-64"
                  disabled={loading || saving}
                />
                <p className="text-xs text-slate-500">
                  Line breaks are preserved in the client carousel.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="announcement-start">Start date and time</Label>
                  <Input
                    id="announcement-start"
                    type="datetime-local"
                    value={startAt}
                    onChange={(event) => setStartAt(event.target.value)}
                    disabled={loading || saving}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="announcement-end">End date and time</Label>
                  <Input
                    id="announcement-end"
                    type="datetime-local"
                    value={endAt}
                    onChange={(event) => setEndAt(event.target.value)}
                    disabled={loading || saving}
                    required
                  />
                </div>
              </div>
              <p className="-mt-3 text-xs text-slate-500">
                The announcement will appear only during this period. Times use
                your local timezone.
              </p>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-800">
                    Show in client portal
                  </p>
                  <p className="text-xs text-slate-500">
                    {isActive ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={loading || saving}
                  aria-label="Enable announcement in client portal"
                />
              </div>

              <div className="flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                <Info
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  Changes to enabled announcements appear in the client portal
                  carousel immediately after saving.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  <X className="mr-2 h-4 w-4" aria-hidden="true" />
                  Cancel
                </Button>
                <Button
                  onClick={saveAnnouncement}
                  disabled={loading || saving}
                  className="bg-[#166FB5] hover:bg-[#125d99]"
                >
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  {saving ? "Saving..." : "Save announcement"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <AlertDialog
        open={announcementToDelete !== null}
        onOpenChange={(open) => {
          if (!open && deletingId === null) setAnnouncementToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{announcementToDelete?.title}” and
              removes it from the client portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deletingId !== null}
              onClick={(event) => {
                event.preventDefault();
                if (announcementToDelete) {
                  void deleteAnnouncement(announcementToDelete);
                }
              }}
            >
              {deletingId ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
