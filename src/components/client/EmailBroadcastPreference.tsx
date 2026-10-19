"use client";

import { useEffect, useState } from "react";
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase";

export function EmailBroadcastPreference({
  uid,
  email,
}: {
  uid: string;
  email: string;
}) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const preferenceRef = doc(db, "emailBroadcastPreferences", uid);
    return onSnapshot(
      preferenceRef,
      (snapshot) => {
        setLoadFailed(false);
        setEnabled(
          !(
            snapshot.exists() &&
            snapshot.data().broadcastEmailEnabled === false
          ),
        );
        setLoading(false);
      },
      (error) => {
        console.error("Could not load email broadcast preference:", error);
        toast.error("Could not load your email preferences.");
        setLoadFailed(true);
        setLoading(false);
      },
    );
  }, [uid]);

  const updatePreference = async (nextEnabled: boolean) => {
    setSaving(true);
    try {
      const preferenceRef = doc(db, "emailBroadcastPreferences", uid);
      if (nextEnabled) {
        await deleteDoc(preferenceRef);
      } else {
        await setDoc(preferenceRef, {
          email,
          broadcastEmailEnabled: false,
          updatedAt: serverTimestamp(),
        });
      }
      setEnabled(nextEnabled);
      toast.success(
        nextEnabled
          ? "You are subscribed to client email broadcasts."
          : "You are unsubscribed from client email broadcasts.",
      );
    } catch (error) {
      console.error("Could not update email broadcast preference:", error);
      toast.error("Could not save your email preference. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700">
          Client email announcements
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          {loadFailed
            ? "Preference could not be loaded. Refresh to try again."
            : enabled
              ? "Receive service and administrative broadcasts."
              : "You will not receive client email broadcasts."}
        </p>
      </div>
      <Switch
        id="client-email-broadcast-preference"
        checked={enabled}
        onCheckedChange={updatePreference}
        disabled={loading || saving || loadFailed || !email}
        aria-label="Receive client email broadcasts"
      />
    </div>
  );
}
