"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, X } from "lucide-react";
import { toast } from "sonner";
import { collection, getDocs, query, where } from "firebase/firestore";
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
import { auth, db } from "@/lib/firebase";
import { queueClientBroadcast } from "@/app/actions/broadcastEmailActions";
import { hasAdminEmailOperationsAccess } from "@/constants/adminEmailAccess";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECIPIENT_STATUSES = [
  "Ongoing Quotation",
  "Approved Client",
  "In Progress",
] as const;
type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

type InquiryRecipient = {
  email: string;
  name: string;
  statuses: string[];
};

export default function BroadcastEmailPage() {
  const router = useRouter();
  const { adminInfo, loading: authLoading } = useAuth();
  const canAccessBroadcast =
    adminInfo?.role === "superadmin" ||
    hasAdminEmailOperationsAccess(adminInfo?.email);
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [inquiryRecipients, setInquiryRecipients] = useState<InquiryRecipient[]>([]);
  const [selectedInquiryEmails, setSelectedInquiryEmails] = useState<Set<string>>(
    new Set(),
  );
  const [inquiryStatus, setInquiryStatus] = useState<RecipientStatus>(
    RECIPIENT_STATUSES[0],
  );
  const [loadingInquiryRecipients, setLoadingInquiryRecipients] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!canAccessBroadcast) {
      router.replace("/admin/dashboard");
    }
  }, [canAccessBroadcast, authLoading, router]);

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
    setRecipientEmails(next);
    setEmailInput("");
  };

  const loadInquiryRecipients = async () => {
    setLoadingInquiryRecipients(true);
    try {
      const inquiryQuery = query(
        collection(db, "inquiries"),
        where("status", "==", inquiryStatus),
      );
      const snapshot = await getDocs(inquiryQuery);
      const recipientsByEmail = new Map<string, InquiryRecipient>();

      snapshot.docs.forEach((inquiry) => {
        const data = inquiry.data();
        const email =
          typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
        if (!email || !EMAIL_PATTERN.test(email)) return;

        const recipient = recipientsByEmail.get(email);
        if (recipient) {
          if (!recipient.statuses.includes(data.status)) {
            recipient.statuses.push(data.status);
          }
          if (!recipient.name && typeof data.name === "string") {
            recipient.name = data.name.trim();
          }
          return;
        }

        recipientsByEmail.set(email, {
          email,
          name: typeof data.name === "string" ? data.name.trim() : "",
          statuses: [data.status],
        });
      });

      const recipients = [...recipientsByEmail.values()].sort((left, right) =>
        (left.name || left.email).localeCompare(right.name || right.email),
      );
      setInquiryRecipients(recipients);
      setSelectedInquiryEmails(new Set());
      if (recipients.length === 0) {
        toast.info(
          `No valid email addresses found for ${inquiryStatus} inquiries.`,
        );
      } else {
        toast.success(
          `Loaded ${recipients.length} client email${recipients.length === 1 ? "" : "s"} with ${inquiryStatus} status.`,
        );
      }
    } catch (error) {
      console.error("Could not load eligible inquiry recipients:", error);
      toast.error("Could not load eligible inquiry recipients. Check your admin access and try again.");
    } finally {
      setLoadingInquiryRecipients(false);
    }
  };

  const addSelectedInquiryRecipients = () => {
    const additions = [...selectedInquiryEmails].filter(
      (email) => !recipientEmails.includes(email),
    );
    const next = [...recipientEmails, ...additions];
    if (additions.length === 0) {
      toast.info("Select at least one new email address.");
      return;
    }
    setRecipientEmails(next);
    setSelectedInquiryEmails(new Set());
    toast.success(`${additions.length} recipient${additions.length === 1 ? "" : "s"} added.`);
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
      if (!result.success) {
        if (result.queuedCount) {
          const queued = new Set(result.queuedEmails || []);
          setRecipientEmails((current) =>
            current.filter((email) => !queued.has(email)),
          );
        }
        toast.error(result.error);
        return;
      }
      if (result.queuedCount === 0) {
        toast.info(
          "No emails were queued because all selected recipients opted out of broadcast emails.",
        );
      } else {
        toast.success(
          `Email queued for ${result.queuedCount} recipient${result.queuedCount === 1 ? "" : "s"}.${result.skippedCount > 0 ? ` Skipped ${result.skippedCount} opted-out recipient${result.skippedCount === 1 ? "" : "s"}.` : ""}`,
        );
      }
      setRecipientEmails([]);
      setSubject("");
      setBody("");
    } catch (error) {
      console.error("Could not queue client broadcast:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not queue the broadcast.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {authLoading || !canAccessBroadcast ? (
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
            <p className="font-semibold">Before sending</p>
            <p className="mt-1">
              Each recipient receives a separate email and cannot see other
              recipients' addresses. Verify the recipient list and send only
              relevant service or administrative updates. Recipients can
              disable future broadcast emails using the preference link in
              each message; messages already queued cannot be recalled.
              Delivery is subject to your email provider's quotas and rate
              limits.
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
            <div className="space-y-3 rounded-md border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    Add recipients from inquiries
                  </h3>
                  <p className="text-xs text-slate-600">
                    Select one inquiry status at a time, then review its client
                    email addresses before adding them.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="inquiry-recipient-status" className="text-sm">
                    Status
                  </Label>
                  <select
                    id="inquiry-recipient-status"
                    value={inquiryStatus}
                    onChange={(event) => {
                      setInquiryStatus(event.target.value as RecipientStatus);
                      setInquiryRecipients([]);
                      setSelectedInquiryEmails(new Set());
                    }}
                    disabled={loadingInquiryRecipients}
                    className="h-9 rounded-md border bg-white px-2 text-sm"
                  >
                    {RECIPIENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadInquiryRecipients}
                    disabled={loadingInquiryRecipients}
                  >
                    {loadingInquiryRecipients ? "Loading…" : "Load clients"}
                  </Button>
                </div>
              </div>
              {inquiryRecipients.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-600">
                      {selectedInquiryEmails.size} selected · {inquiryRecipients.length} eligible
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedInquiryEmails(new Set())}
                        disabled={selectedInquiryEmails.size === 0}
                      >
                        Reset selection
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const available = inquiryRecipients
                            .filter((recipient) => !recipientEmails.includes(recipient.email))
                            .map((recipient) => recipient.email);
                          setSelectedInquiryEmails(new Set(available));
                        }}
                      >
                        Select available
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={addSelectedInquiryRecipients}
                        disabled={selectedInquiryEmails.size === 0}
                      >
                        Add selected
                      </Button>
                    </div>
                  </div>
                  <ul className="max-h-56 divide-y overflow-y-auto rounded-md border bg-white">
                    {inquiryRecipients.map((recipient) => {
                      const alreadyAdded = recipientEmails.includes(recipient.email);
                      return (
                        <li key={recipient.email} className="flex items-center gap-3 p-2.5">
                          <input
                            type="checkbox"
                            checked={alreadyAdded || selectedInquiryEmails.has(recipient.email)}
                            disabled={alreadyAdded}
                            aria-label={`Select ${recipient.name || recipient.email}`}
                            onChange={(event) => {
                              setSelectedInquiryEmails((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(recipient.email);
                                else next.delete(recipient.email);
                                return next;
                              });
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {recipient.name || "Name not recorded"}
                            </p>
                            <p className="break-all text-xs text-slate-600">{recipient.email}</p>
                          </div>
                          <span className="shrink-0 text-right text-[11px] text-slate-500">
                            {recipient.statuses.join(", ")}
                          </span>
                          {alreadyAdded && (
                            <span className="shrink-0 text-xs text-emerald-700">Added</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <div className="rounded-md border bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  Selected email addresses ({recipientEmails.length})
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={recipientEmails.length === 0}
                  onClick={() => {
                    setRecipientEmails([]);
                    setSelectedInquiryEmails(new Set());
                  }}
                >
                  Unselect all
                </Button>
              </div>
              {recipientEmails.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">
                  No recipients added yet.
                </p>
              ) : (
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                  {recipientEmails.map((email) => (
                    <li
                      key={email}
                      className="flex items-center justify-between gap-2"
                    >
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
                  {recipientEmails.length === 1 ? "message" : "messages"}.
                  Verify all recipients and the subject before confirming.
                  Queued messages cannot be recalled from this screen.
                </AlertDialogDescription>
                <ul className="max-h-32 overflow-y-auto rounded-md border bg-slate-50 p-3 text-sm">
                  {recipientEmails.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
                <p className="text-sm font-medium">Subject: {subject.trim()}</p>
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
