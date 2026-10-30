"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  MailCheck,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  EMAIL_MONITOR_CATEGORIES,
  type EmailMonitorEvent,
} from "@/types/EmailMonitoring";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MailRecord = {
  to?: string[] | string;
  senderEmail?: string;
  message?: {
    subject?: string;
    text?: string;
    html?: string;
  };
  delivery?: { state?: string; error?: string; endTime?: unknown };
  status?: string;
};

type MonitorStatus =
  | "Sent"
  | "Pending"
  | "Stalled"
  | "Queueing"
  | "Failed"
  | "Missing email record";

type BroadcastPreference = {
  uid: string;
  email: string;
  name: string;
  disabledAt: Date;
};

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }
  return new Date(0);
}

function formatDate(date: Date): string {
  if (!date.getTime()) return "Waiting for timestamp";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function htmlToPlainText(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

function getMonitorStatus(
  event: EmailMonitorEvent,
  mail: MailRecord | undefined,
  now: number,
): { status: MonitorStatus; error?: string } {
  if (event.queueStatus === "failed") {
    return { status: "Failed", error: event.error };
  }

  if (event.queueStatus === "queueing") {
    const ageMs = now - event.triggeredAt.getTime();
    return ageMs > 2 * 60 * 1000
      ? {
          status: "Missing email record",
          error: "The trigger was recorded, but no mail queue record was linked.",
        }
      : { status: "Queueing" };
  }

  if (!event.mailDocumentId || !mail) {
    return {
      status: "Missing email record",
      error: "The trigger was recorded, but its mail queue record is missing.",
    };
  }

  const state = String(mail.delivery?.state || mail.status || "").toUpperCase();
  if (state === "SUCCESS" || state === "SENT") return { status: "Sent" };
  if (state === "ERROR" || state === "FAILED" || state === "FAILURE") {
    return {
      status: "Failed",
      error: mail.delivery?.error || "The email provider reported a failure.",
    };
  }
  if (now - event.triggeredAt.getTime() > 10 * 60 * 1000) {
    return {
      status: "Stalled",
      error: "The email is still pending with the mail delivery extension.",
    };
  }
  return { status: "Pending" };
}

function statusClass(status: MonitorStatus): string {
  if (status === "Sent") return "bg-emerald-100 text-emerald-800";
  if (
    status === "Failed" ||
    status === "Stalled" ||
    status === "Missing email record"
  ) {
    return "bg-red-100 text-red-800";
  }
  return "bg-amber-100 text-amber-800";
}

export function EmailMonitoringPanel() {
  const [events, setEvents] = useState<EmailMonitorEvent[]>([]);
  const [mailById, setMailById] = useState<Map<string, MailRecord>>(new Map());
  const [broadcastPreferences, setBroadcastPreferences] = useState<
    BroadcastPreference[]
  >([]);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [clock, setClock] = useState(() => Date.now());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [resendingEventId, setResendingEventId] = useState<string | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletingEvents, setDeletingEvents] = useState(false);

  useEffect(() => {
    const clockInterval = window.setInterval(() => setClock(Date.now()), 30_000);
    let active = true;
    let preferenceSnapshotVersion = 0;
    const eventsQuery = query(
      collection(db, "emailMonitoringEvents"),
      orderBy("triggeredAt", "desc"),
      limit(300),
    );
    const unsubscribeEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const nextEvents = snapshot.docs.map((document) => {
          const data = document.data();
          return {
            id: document.id,
            category: data.category,
            recipient: data.recipient || "",
            sourceId: data.sourceId || "",
            triggeredAt: toDate(data.triggeredAt),
            triggeredByEmail: data.triggeredByEmail,
            queueStatus: data.queueStatus || "queueing",
            mailDocumentId: data.mailDocumentId,
            error: data.error,
          } as EmailMonitorEvent;
        });
        const eventIds = new Set(nextEvents.map((event) => event.id));
        setEvents(nextEvents);
        setSelectedEventIds((current) => {
          const next = new Set(
            [...current].filter((eventId) => eventIds.has(eventId)),
          );
          return next.size === current.size ? current : next;
        });
        setLoading(false);
        setError("");
      },
      (snapshotError) => {
        console.error("Could not load email monitoring events:", snapshotError);
        setError("Could not load email monitoring events. Check your admin access and try refreshing.");
        setLoading(false);
      },
    );

    const unsubscribeMail = onSnapshot(
      collection(db, "mail"),
      (snapshot) => {
        const nextMail = new Map<string, MailRecord>();
        snapshot.forEach((document) => nextMail.set(document.id, document.data() as MailRecord));
        setMailById(nextMail);
      },
      (snapshotError) => {
        console.error("Could not load email delivery states:", snapshotError);
        setError("Could not load email delivery states. Check your admin access and try refreshing.");
      },
    );

    const unsubscribePreferences = onSnapshot(
      collection(db, "emailBroadcastPreferences"),
      (snapshot) => {
        const version = ++preferenceSnapshotVersion;
        const preferences = snapshot.docs
          .map((document) => {
            const data = document.data();
            if (data.broadcastEmailEnabled !== false) return null;

            return {
              uid: document.id,
              email: typeof data.email === "string" ? data.email : "",
              name: typeof data.name === "string" ? data.name.trim() : "",
              disabledAt: toDate(data.updatedAt),
            };
          })
          .filter(
            (preference): preference is BroadcastPreference =>
              preference !== null,
          )
          .sort(
            (left, right) =>
              right.disabledAt.getTime() - left.disabledAt.getTime(),
          );

        setBroadcastPreferences(preferences);
        setPreferencesLoading(false);
        setPreferencesError("");

        const missingNames = preferences.filter(
          (preference) => !preference.name,
        );
        if (missingNames.length === 0) return;

        void Promise.all(
          missingNames.map(async (preference) => {
            try {
              const profile = await getDoc(doc(db, "users", preference.uid));
              const data = profile.exists() ? profile.data() : null;
              const profileName =
                typeof data?.name === "string"
                  ? data.name.trim()
                  : typeof data?.displayName === "string"
                    ? data.displayName.trim()
                    : "";
              return [preference.uid, profileName] as const;
            } catch (profileError) {
              console.error(
                "Could not load client name for broadcast preference:",
                profileError,
              );
              return [preference.uid, ""] as const;
            }
          }),
        ).then((profileNames) => {
          if (!active || version !== preferenceSnapshotVersion) return;
          const namesByUid = new Map(profileNames);
          setBroadcastPreferences((current) =>
            current.map((preference) => ({
              ...preference,
              name: preference.name || namesByUid.get(preference.uid) || "",
            })),
          );
        });
      },
      (snapshotError) => {
        console.error(
          "Could not load email broadcast preferences:",
          snapshotError,
        );
        setPreferencesError(
          "Could not load email broadcast preferences. Check your admin access and try refreshing.",
        );
        setPreferencesLoading(false);
      },
    );

    return () => {
      active = false;
      window.clearInterval(clockInterval);
      unsubscribeEvents();
      unsubscribeMail();
      unsubscribePreferences();
    };
  }, []);

  const now = clock;
  const rows = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        ...getMonitorStatus(
          event,
          event.mailDocumentId
            ? mailById.get(event.mailDocumentId)
            : undefined,
          now,
        ),
      })),
    [events, mailById, now],
  );
  const visibleRows = rows.filter(
    (row) => category === "All" || row.category === category,
  );
  const allVisibleRowsSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selectedEventIds.has(row.id));
  const attentionCount = rows.filter(
    (row) =>
      row.status === "Failed" ||
      row.status === "Stalled" ||
      row.status === "Missing email record",
  ).length;
  const sentCount = rows.filter((row) => row.status === "Sent").length;
  const pendingCount = rows.filter(
    (row) => row.status === "Pending" || row.status === "Queueing",
  ).length;
  const selectedEvent = rows.find((row) => row.id === selectedEventId);
  const selectedMail = selectedEvent?.mailDocumentId
    ? mailById.get(selectedEvent.mailDocumentId)
    : undefined;
  const selectedMessage = selectedMail?.message;
  const selectedRecipient = Array.isArray(selectedMail?.to)
    ? selectedMail.to.join(", ")
    : selectedMail?.to || selectedEvent?.recipient || "No recipient recorded";
  const canResendSelectedEvent =
    selectedEvent?.category === "Chat received" ||
    selectedEvent?.category === "Quotation available";

  const toggleEventSelection = (eventId: string, checked: boolean) => {
    setSelectedEventIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      return next;
    });
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedEventIds((current) => {
      const next = new Set(current);
      for (const row of visibleRows) {
        if (checked) {
          next.add(row.id);
        } else {
          next.delete(row.id);
        }
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const eventIds = [...selectedEventIds];
    if (eventIds.length === 0 || deletingEvents) return;

    const countLabel = `${eventIds.length} selected notification event${eventIds.length === 1 ? "" : "s"}`;
    if (
      !window.confirm(
        `Delete ${countLabel}? This removes monitoring records only; queued emails are not affected.`,
      )
    ) {
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error("Sign in again before deleting notification events.");
      return;
    }

    setDeletingEvents(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/admin/email-monitoring/delete-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ eventIds }),
      });
      const result = (await response.json()) as {
        error?: string;
        deletedCount?: number;
      };
      if (!response.ok) {
        throw new Error(result.error || "Could not delete notification events.");
      }

      setSelectedEventIds(new Set());
      if (selectedEventId && eventIds.includes(selectedEventId)) {
        setSelectedEventId(null);
      }
      const deletedCount = result.deletedCount ?? eventIds.length;
      toast.success(
        `Deleted ${deletedCount} notification event${deletedCount === 1 ? "" : "s"}.`,
      );
    } catch (deleteError) {
      console.error("Could not delete selected notification events:", deleteError);
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete notification events.",
      );
    } finally {
      setDeletingEvents(false);
    }
  };

  const handleResend = async () => {
    if (!selectedEvent || !canResendSelectedEvent || resendingEventId) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error("Sign in again before resending this email.");
      return;
    }

    setResendingEventId(selectedEvent.id);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch("/api/admin/resend-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ eventId: selectedEvent.id }),
      });
      const result = (await response.json()) as {
        error?: string;
        recipient?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Could not resend the notification.");
      }
      toast.success(`Email queued for ${result.recipient || selectedEvent.recipient}.`);
    } catch (resendError) {
      console.error("Could not resend monitored notification:", resendError);
      toast.error(
        resendError instanceof Error
          ? resendError.message
          : "Could not resend the notification.",
      );
    } finally {
      setResendingEventId(null);
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <MailCheck className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl font-bold">Email Monitoring</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Monitor notification triggers, mail queue creation, and delivery-provider status in real time.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Tracked triggers" value={rows.length} />
        <SummaryCard label="Provider accepted" value={sentCount} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
        <SummaryCard label="Pending" value={pendingCount} icon={<Clock3 className="h-4 w-4 text-amber-600" />} />
        <SummaryCard label="Needs attention" value={attentionCount} icon={<AlertCircle className="h-4 w-4 text-red-600" />} alert={attentionCount > 0} />
        <SummaryCard label="Opted out of broadcasts" value={broadcastPreferences.length} />
      </div>

      <div className="rounded-lg border bg-white">
        <div className="border-b p-4">
          <h2 className="font-semibold">Broadcast email preferences</h2>
          <p className="text-xs text-slate-500">
            {broadcastPreferences.length} client
            {broadcastPreferences.length === 1 ? " has" : "s have"} disabled
            email broadcasts.
          </p>
        </div>

        {preferencesError ? (
          <p className="p-6 text-sm text-red-700">{preferencesError}</p>
        ) : preferencesLoading ? (
          <p className="p-6 text-sm text-slate-500">
            Loading broadcast preferences...
          </p>
        ) : broadcastPreferences.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No clients have disabled email broadcasts.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Client name</th>
                  <th className="px-4 py-3">Email address</th>
                  <th className="px-4 py-3">Disabled on</th>
                  <th className="px-4 py-3">Client UID</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {broadcastPreferences.map((preference) => (
                  <tr key={preference.uid}>
                    <td className="px-4 py-3">
                      {preference.name || "Name not recorded"}
                    </td>
                    <td className="px-4 py-3">
                      {preference.email || "Not recorded"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(preference.disabledAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {preference.uid}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">Notification events</h2>
            <p className="text-xs text-slate-500">Showing the most recent 300 tracked triggers.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="email-monitor-category" className="text-sm text-slate-600">Category</label>
              <select
                id="email-monitor-category"
                className="h-9 rounded-md border bg-white px-2 text-sm"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option>All</option>
                {EMAIL_MONITOR_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {selectedEventIds.size > 0 && (
                <span className="text-sm text-slate-600">
                  {selectedEventIds.size} selected
                </span>
              )}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={selectedEventIds.size === 0 || deletingEvents}
                onClick={handleDeleteSelected}
              >
                {deletingEvents ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete selected
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading notification events...</p>
        ) : visibleRows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No tracked notification triggers yet. Monitoring starts with app versions that write email event records.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all visible notification events"
                      className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                      checked={allVisibleRowsSelected}
                      onChange={(event) =>
                        toggleVisibleSelection(event.target.checked)
                      }
                    />
                  </th>
                  <th className="px-4 py-3">Triggered</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Sent by</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="w-12 px-4 py-3">
                    <span className="sr-only">View email</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRows.map((row) => (
                  <tr key={row.id} className={row.status === "Failed" || row.status === "Stalled" || row.status === "Missing email record" ? "bg-red-50/50" : ""}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select notification event for ${row.recipient || "recipient"}`}
                        className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                        checked={selectedEventIds.has(row.id)}
                        onChange={(event) =>
                          toggleEventSelection(row.id, event.target.checked)
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(row.triggeredAt)}</td>
                    <td className="px-4 py-3">{row.category}</td>
                    <td className="px-4 py-3">{row.recipient || "No recipient recorded"}</td>
                    <td className="px-4 py-3">
                      {row.triggeredByEmail ||
                        (row.mailDocumentId
                          ? mailById.get(row.mailDocumentId)?.senderEmail
                          : undefined) ||
                        "Not recorded"}
                    </td>
                    <td className="px-4 py-3"><Badge className={statusClass(row.status)}>{row.status}</Badge></td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`View email to ${row.recipient || "recipient"}`}
                        title="View email"
                        onClick={() => setSelectedEventId(row.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">
        “Provider accepted” means the configured mail extension reported success; it does not guarantee inbox placement. Only triggers recorded by the deployed monitoring-enabled app version appear here.
      </p>
      <Dialog
        open={selectedEventId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEventId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedMessage?.subject || "Email details"}
            </DialogTitle>
            <DialogDescription>
              Review the queued email, recipient, sender, and delivery status.
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <dl className="grid gap-3 rounded-md border bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">Recipient</dt>
                  <dd className="break-all text-slate-900">
                    {selectedRecipient}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Sent by</dt>
                  <dd className="break-all text-slate-900">
                    {selectedEvent.triggeredByEmail ||
                      selectedMail?.senderEmail ||
                      "Not recorded for this email"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Status</dt>
                  <dd>
                    <Badge className={statusClass(selectedEvent.status)}>
                      {selectedEvent.status}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Triggered</dt>
                  <dd className="text-slate-900">
                    {formatDate(selectedEvent.triggeredAt)}
                  </dd>
                </div>
              </dl>
              {selectedEvent.error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {selectedEvent.error}
                </div>
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Message</h3>
                <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-md border p-4 text-sm leading-6 text-slate-700">
                  {selectedMessage?.text ||
                    htmlToPlainText(selectedMessage?.html) ||
                    "Message content is not available for this email."}
                </div>
              </div>
              {canResendSelectedEvent && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="text-xs text-slate-500">
                      Queues a new email to the client address currently on the
                      chat or quotation. Use this to resend a missed notification.
                    </p>
                    <Button
                      type="button"
                      onClick={handleResend}
                      disabled={resendingEventId !== null}
                    >
                      {resendingEventId === selectedEvent.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Send again
                    </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  alert = false,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${alert ? "border-red-200 bg-red-50" : "bg-white"}`}>
      <div className="flex items-center justify-between text-sm text-slate-600">
        {label}
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}
