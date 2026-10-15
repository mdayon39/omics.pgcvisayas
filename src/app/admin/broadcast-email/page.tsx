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
const MAX_BROADCAST_RECIPIENTS = 200;

export default function BroadcastEmailPage() {
  const router = useRouter();
  const { adminInfo, loading: authLoading } = useAuth();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedInquiryIds, setSelectedInquiryIds] = useState<Set<string>>(
    new Set(),
  );
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
      setSelectedInquiryIds(new Set());
    } catch (error) {
      console.error("Could not load broadcast recipients:", error);
      toast.error(
        error instanceof Error ? error.message : "Could not load inquiry email addresses.",
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
    setSelectedInquiryIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_BROADCAST_RECIPIENTS) {
        next.add(id);
      } else {
        toast.error(
          `A broadcast can include at most ${MAX_BROADCAST_RECIPIENTS} email addresses.`,
        );
      }
      return next;
    });
  };

  const selectVisible = () => {
    const next = new Set(selectedInquiryIds);
    for (const recipient of visibleRecipients) {
      if (next.size >= MAX_BROADCAST_RECIPIENTS) break;
      next.add(recipient.id);
    }
    setSelectedInquiryIds(next);
    if (
      next.size === MAX_BROADCAST_RECIPIENTS &&
      visibleRecipients.some((recipient) => !next.has(recipient.id))
    ) {
      toast.info(
        `Selection is capped at ${MAX_BROADCAST_RECIPIENTS} email addresses.`,
      );
    }
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
        inquiryIds: [...selectedInquiryIds],
        subject,
        body,
      });
      toast.success(
        `Test email queued for ${result.queuedCount} selected inquiry address.`,
      );
      setSelectedInquiryIds(new Set());
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
            Select email addresses recorded on client inquiries, review the
            recipient list, and confirm it before queueing the email.
          </p>
        </header>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <p className="font-semibold">Send responsibly</p>
          <p className="mt-1">
            Each client receives a separate email, so recipient addresses are
            private. Use this for relevant service or administrative updates,
            and only contact clients when you have an appropriate basis to do
            so. This is not a consent or unsubscribe management tool. A maximum
            of {MAX_BROADCAST_RECIPIENTS} addresses can be selected per
            broadcast.
          </p>
        </div>

        <section className="space-y-4 rounded-lg border bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Recipients</h2>
              <p className="text-sm text-slate-600">
                {selectedInquiryIds.size} selected · {recipients.length} unique
                inquiry email addresses
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={selectVisible}
                disabled={
                  loading ||
                  selectedInquiryIds.size >= MAX_BROADCAST_RECIPIENTS
                }
              >
                Select visible
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedInquiryIds(new Set())}
                disabled={selectedInquiryIds.size === 0}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refreshRecipients()}
                disabled={loading}
                aria-label="Refresh inquiry email list"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search inquiry contacts by name or email"
            aria-label="Search inquiry contacts"
          />
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading clients…</p>
            ) : visibleRecipients.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                No inquiry email addresses with valid email format were found.
              </p>
            ) : (
              visibleRecipients.map((recipient) => (
                <label
                  key={recipient.id}
                  className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-b-0 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedInquiryIds.has(recipient.id)}
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
          <div className="rounded-md border bg-slate-50 p-3">
            <h3 className="text-sm font-semibold">Selected email addresses</h3>
            {selectedInquiryIds.size === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                Select addresses from the inquiry list to add them here.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {recipients
                  .filter((recipient) =>
                    selectedInquiryIds.has(recipient.id),
                  )
                  .map((recipient) => (
                    <li key={recipient.id}>
                      {recipient.name} — <strong>{recipient.email}</strong>
                    </li>
                  ))}
              </ul>
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
              selectedInquiryIds.size === 0 ||
              !subject.trim() ||
              !body.trim()
            }
          >
            <Send className="mr-2 h-4 w-4" />
            {sending
              ? "Queueing…"
              : `Review and send (${selectedInquiryIds.size})`}
          </Button>
        </div>

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Queue this broadcast?</AlertDialogTitle>
              <AlertDialogDescription>
                This will queue {selectedInquiryIds.size} individual email
                {selectedInquiryIds.size === 1 ? "message" : "messages"}. Verify
                all recipients and the subject before confirming. Queued
                messages cannot be recalled from this screen.
              </AlertDialogDescription>
              <ul className="max-h-32 overflow-y-auto rounded-md border bg-slate-50 p-3 text-sm">
                {recipients
                  .filter((recipient) =>
                    selectedInquiryIds.has(recipient.id),
                  )
                  .map((recipient) => (
                    <li key={recipient.id}>
                      {recipient.name} — <strong>{recipient.email}</strong>
                    </li>
                  ))}
              </ul>
              <p className="text-sm font-medium">
                Subject: {subject.trim()}
              </p>
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
