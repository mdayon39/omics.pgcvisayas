"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Info, Megaphone, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PermissionGuard } from "@/components/PermissionGuard";
import {
  CLIENT_ANNOUNCEMENT_ID,
  CLIENT_ANNOUNCEMENT_TARGET_EMAIL,
  DEFAULT_CLIENT_ANNOUNCEMENT,
} from "@/constants/clientAnnouncement";
import useAuth from "@/hooks/useAuth";
import { db } from "@/lib/firebase";

const ANNOUNCEMENT_REF = doc(
  db,
  "clientAnnouncements",
  CLIENT_ANNOUNCEMENT_ID,
);

export default function ClientAnnouncementPage() {
  return (
    <PermissionGuard module="configurations" action="edit">
      <ClientAnnouncementContent />
    </PermissionGuard>
  );
}

function ClientAnnouncementContent() {
  const { adminInfo } = useAuth();
  const [title, setTitle] = useState(DEFAULT_CLIENT_ANNOUNCEMENT.title);
  const [body, setBody] = useState(DEFAULT_CLIENT_ANNOUNCEMENT.body);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        ANNOUNCEMENT_REF,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setTitle(
              typeof data.title === "string"
                ? data.title
                : DEFAULT_CLIENT_ANNOUNCEMENT.title,
            );
            setBody(
              typeof data.body === "string"
                ? data.body
                : DEFAULT_CLIENT_ANNOUNCEMENT.body,
            );
            setIsActive(data.isActive === true);
          } else {
            setTitle(DEFAULT_CLIENT_ANNOUNCEMENT.title);
            setBody(DEFAULT_CLIENT_ANNOUNCEMENT.body);
            setIsActive(true);
          }
          setLoading(false);
        },
        (error) => {
          console.error("Failed to load client announcement:", error);
          toast.error("Could not load the client announcement.");
          setLoading(false);
        },
      ),
    [],
  );

  const saveAnnouncement = async () => {
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) {
      toast.error("Enter both an announcement title and message.");
      return;
    }
    if (!adminInfo?.email) {
      toast.error("Your admin account details could not be verified.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(ANNOUNCEMENT_REF, {
        title: cleanTitle,
        body: cleanBody,
        isActive,
        targetEmail: CLIENT_ANNOUNCEMENT_TARGET_EMAIL,
        updatedAt: serverTimestamp(),
        updatedBy: adminInfo.email,
      });
      toast.success(
        isActive
          ? `Announcement published for ${CLIENT_ANNOUNCEMENT_TARGET_EMAIL}.`
          : "Announcement saved and hidden from the client.",
      );
    } catch (error) {
      console.error("Failed to save client announcement:", error);
      toast.error("Could not save the client announcement.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-[#166FB5]" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-slate-800">
            Client Announcement
          </h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Create a portal banner for the designated client.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Announcement details</CardTitle>
          <CardDescription>
            This announcement is visible only to {CLIENT_ANNOUNCEMENT_TARGET_EMAIL}. Other clients
            cannot read it.
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
              Line breaks are preserved in the client portal banner.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-800">
                Show announcement in client portal
              </p>
              <p className="text-xs text-slate-500">
                {isActive ? "Published" : "Hidden"}
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={loading || saving}
              aria-label="Show announcement in client portal"
            />
          </div>

          <div className="flex items-start gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Saving publishes the current title, message, and visibility
              setting. The banner updates in real time for the designated
              client.
            </p>
          </div>

          <div className="flex justify-end">
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
    </div>
  );
}
