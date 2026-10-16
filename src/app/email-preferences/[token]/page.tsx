"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getBroadcastEmailPreference,
  setBroadcastEmailPreference,
} from "@/app/actions/broadcastEmailActions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function BroadcastEmailPreferencesPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void getBroadcastEmailPreference(token).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setError(
          "This email preference link is invalid or no longer available. Contact PGC Visayas if you need help.",
        );
      } else {
        setSubscribed(result.subscribed);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const updatePreference = async (nextSubscribed: boolean) => {
    setSaving(true);
    setError("");
    try {
      const result = await setBroadcastEmailPreference(token, nextSubscribed);
      if (!result.success) {
        setError("Could not save your email preference. Please try again.");
        return;
      }
      setSubscribed(result.subscribed);
    } catch (updateError) {
      console.error("Could not save broadcast email preference:", updateError);
      setError("Could not save your email preference. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-xl space-y-6 p-6 sm:p-8">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-[#166FB5]">
            Philippine Genome Center Visayas
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Broadcast email preferences
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Choose whether you want to receive future client broadcast emails
            from PGC Visayas. This setting does not affect service-related or
            account emails.
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-slate-500">Loading your preference…</p>
        ) : error && subscribed === null ? (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-md border p-4">
              <div className="space-y-1">
                <Label
                  htmlFor="receive-broadcast-emails"
                  className="cursor-pointer text-sm font-semibold"
                >
                  Receive broadcast email updates
                </Label>
                <p className="text-xs text-slate-600">
                  {subscribed
                    ? "Enabled: you may receive future broadcast announcements."
                    : "Disabled: you will not receive future broadcast announcements."}
                </p>
              </div>
              <Switch
                id="receive-broadcast-emails"
                checked={subscribed === true}
                disabled={saving || subscribed === null}
                onCheckedChange={(checked) => void updatePreference(checked)}
                aria-label="Receive broadcast email updates"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            {saving && (
              <p aria-live="polite" className="text-sm text-slate-500">
                Saving your preference…
              </p>
            )}
          </>
        )}

        <p className="text-xs leading-5 text-slate-500">
          Emails already queued for delivery may still arrive. To manage your
          services, inquiries, and account details, visit the client portal.
        </p>
        <Button asChild variant="outline">
          <Link href="/portal">Go to Client Portal</Link>
        </Button>
      </Card>
    </main>
  );
}
