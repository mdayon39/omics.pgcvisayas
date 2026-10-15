"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, X } from "lucide-react";
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
import { queueClientBroadcast } from "@/app/actions/broadcastEmailActions";

const MAX_BROADCAST_RECIPIENTS = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function BroadcastEmailPage() {
  const router = useRouter();
  const { adminInfo, loading: authLoading } = useAuth();
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (adminInfo?.role !== "superadmin") {
      router.replace("/admin/dashboard");
    }
  }, [adminInfo?.role, authLoading, router]);

  const addRecipients = () => {
    const entries = emailInput
      .split(/[,\s;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (entries.length === 0) {
      toast.error("Enter at least one email address.");
      return;
    }
    const invalid = entries.filter((email) => !EMAIL_PATTERN.test(email));
    if (invalid.length > 0) {
      toast.error(`Invalid email address: ${invalid[0]}`);
      return;
    }
    const next = [...new Set([...recipientEmails, ...entries])];
    if (next.length > MAX_BROADCAST_RECIPIENTS) {
      toast.error(
        `A broadcast can include at most ${MAX_BROADCAST_RECIPIENTS} email addresses.`,
      );
      return;
    }
    setRecipientEmails(next);
    setEmailInput("");
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
        recipientEmails,
        subject,
        body,
      });
      toast.success(
        `Email queued for ${result.queuedCount} recipient${result.queuedCount === 1 ? "" : "s"}.`,
      );
      setRecipientEmails([]);
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
            Enter recipient addresses, review the list, and confirm it before
            queueing the email.
          </p>
        </header>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <p className="font-semibold">Send responsibly</p>
          <p className="mt-1">
            Each client receives a separate email, so recipient addresses are
            private. Use this for relevant service or administrative updates,
            and only contact clients when you have an appropriate basis to do
            so. This is not a consent or unsubscribe management tool. A maximum
            of {MAX_BROADCAST_RECIPIENTS} addresses can be added per
            broadcast.
          </p>
        </div>

        <section className="space-y-4 rounded-lg border bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Recipients</h2>
              <p className="text-sm text-slate-600">
                {recipientEmails.length} recipient
                {recipientEmails.length === 1 ? "" : "s"} added
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addRecipients();
                }
              }}
              placeholder="Enter an email address (or paste comma-separated addresses)"
              aria-label="Recipient email addresses"
            />
            <Button type="button" variant="outline" onClick={addRecipients}>
              Add
            </Button>
          </div>
          <div className="rounded-md border bg-slate-50 p-3">
            <h3 className="text-sm font-semibold">Selected email addresses</h3>
            {recipientEmails.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                No recipients added yet.
              </p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {recipientEmails.map((email) => (
                    <li key={email} className="flex items-center justify-between gap-2">
                      <strong className="break-all">{email}</strong>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${email}`}
                        onClick={() =>
                          setRecipientEmails((previous) =>
                            previous.filter((item) => item !== email),
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
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
              sending ||
              recipientEmails.length === 0 ||
              !subject.trim() ||
              !body.trim()
            }
          >
            <Send className="mr-2 h-4 w-4" />
            {sending
              ? "Queueing…"
              : `Review and send (${recipientEmails.length})`}
          </Button>
        </div>

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Queue this broadcast?</AlertDialogTitle>
              <AlertDialogDescription>
                This will queue {recipientEmails.length} individual email
                {recipientEmails.length === 1 ? "message" : "messages"}. Verify
                all recipients and the subject before confirming. Queued
                messages cannot be recalled from this screen.
              </AlertDialogDescription>
              <ul className="max-h-32 overflow-y-auto rounded-md border bg-slate-50 p-3 text-sm">
                {recipientEmails.map((email) => (
                  <li key={email}>{email}</li>
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
