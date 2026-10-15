"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import useAuth from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";
import {
  getBroadcastRecipients,
  queueClientBroadcast,
} from "@/app/actions/broadcastEmailActions";

type Recipient = { id: string; name: string; email: string };
const TEST_RECIPIENT_EMAIL = "dayonmerlitojr@gmail.com";

export default function BroadcastEmailPage() {
  const router = useRouter();
  const { adminInfo, loading: authLoading } = useAuth();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const refreshRecipients = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      const nextRecipients = await getBroadcastRecipients(token);
      setRecipients(nextRecipients);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Could not load broadcast recipients:", error);
      toast.error(
        error instanceof Error ? error.message : "Could not load clients.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (adminInfo?.role !== "superadmin") {
      router.replace("/admin/dashboard");
      return;
    }
    void refreshRecipients();
  }, [adminInfo?.email, adminInfo?.role, authLoading, refreshRecipients, router]);

  const visibleRecipients = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return recipients;
    return recipients.filter(
      (recipient) =>
        recipient.name.toLowerCase().includes(normalizedSearch) ||
        recipient.email.includes(normalizedSearch),
    );
  }, [recipients, search]);

  const toggleRecipient = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 1) {
        next.add(id);
      } else {
        toast.error("Only the designated test recipient can be selected.");
      }
      return next;
    });
  };

  const selectVisible = () => {
    const next = new Set(selectedIds);
    const testRecipient = visibleRecipients.find(
      (recipient) => recipient.email === TEST_RECIPIENT_EMAIL,
    );
    if (testRecipient) next.add(testRecipient.id);
    setSelectedIds(next);
  };

  const sendBroadcast = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error("Sign in again before sending the broadcast.");
      return;
    }

    setSending(true);
    setConfirming(false);
    try {
      const token = await currentUser.getIdToken();
      const result = await queueClientBroadcast(token, {
        clientIds: [...selectedIds],
        subject,
        body,
      });
      toast.success(
        `Broadcast queued for ${result.queuedCount} clients.`,
      );
      setSelectedIds(new Set());
      setSubject("");
      setBody("");
    } catch (error) {
      console.error("Could not queue client broadcast:", error);
      toast.error(
        error instanceof Error ? error.message : "Could not queue the broadcast.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {authLoading || adminInfo?.role !== "superadmin" ? (
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          Checking superadmin access…
        </div>
      ) : (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <header>
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl font-bold">Client Email Broadcast</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Send a service or administrative update to selected client contacts.
          </p>
        </header>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <p className="font-semibold">Send responsibly</p>
          <p className="mt-1">
            Each client receives a separate email, so recipient addresses are
            private. Use this for relevant service or administrative updates,
            and only contact clients when you have an appropriate basis to do
            so. This testing page is restricted to the designated recipient
            below and is not a consent or unsubscribe management tool.
          </p>
        </div>

        <section className="space-y-4 rounded-lg border bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Recipients</h2>
              <p className="text-sm text-slate-600">
                {selectedIds.size} selected · testing recipient only
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={selectVisible}
                disabled={loading || selectedIds.size === 1}
              >
                Select visible
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedIds(new Set())}
                disabled={selectedIds.size === 0}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refreshRecipients()}
                disabled={loading}
                aria-label="Refresh clients"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search clients by name or email"
            aria-label="Search clients"
          />
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading clients…</p>
            ) : visibleRecipients.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                The designated test client ({TEST_RECIPIENT_EMAIL}) was not
                found with a valid email address.
              </p>
            ) : (
              visibleRecipients.map((recipient) => (
                <label
                  key={recipient.id}
                  className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-b-0 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(recipient.id)}
                    onChange={() => toggleRecipient(recipient.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {recipient.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {recipient.email}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Message</h2>
          <div className="space-y-2">
            <Label htmlFor="broadcast-subject">Subject</Label>
            <Input
              id="broadcast-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
              placeholder="Enter a clear, descriptive subject"
            />
            <p className="text-right text-xs text-slate-500">
              {subject.length}/200
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="broadcast-body">Message</Label>
            <Textarea
              id="broadcast-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={10_000}
              rows={10}
              placeholder="Write your message. It will be sent as plain text and safely formatted for email."
            />
            <p className="text-right text-xs text-slate-500">
              {body.length}/10,000
            </p>
          </div>
        </section>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={
              loading ||
              sending ||
              selectedIds.size === 0 ||
              !subject.trim() ||
              !body.trim()
            }
          >
            <Send className="mr-2 h-4 w-4" />
            {sending ? "Queueing…" : `Review and send (${selectedIds.size})`}
          </Button>
        </div>

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Queue this broadcast?</AlertDialogTitle>
              <AlertDialogDescription>
                This will create {selectedIds.size} individual email messages
                with the subject “{subject.trim()}”. Queued messages cannot be
                recalled from this screen.
              </AlertDialogDescription>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
                {body.trim()}
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={sending}
                onClick={(event) => {
                  event.preventDefault();
                  void sendBroadcast();
                }}
              >
                {sending ? "Queueing…" : "Queue emails"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
      )}
    </>
  );
}
