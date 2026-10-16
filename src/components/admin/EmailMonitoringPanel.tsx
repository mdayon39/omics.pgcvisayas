"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  MailCheck,
  Loader2,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/firebase";
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

export function EmailMonitoringPanel({
  isSuperadmin,
}: {
  isSuperadmin: boolean;
}) {
  const [events, setEvents] = useState<EmailMonitorEvent[]>([]);
  const [mailById, setMailById] = useState<Map<string, MailRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [clock, setClock] = useState(() => Date.now());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    new Set(),
  );
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const clockInterval = window.setInterval(() => setClock(Date.now()), 30_000);
    const eventsQuery = query(
      collection(db, "emailMonitoringEvents"),
      orderBy("triggeredAt", "desc"),
      limit(300),
    );
    const unsubscribeEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        setEvents(
          snapshot.docs.map((document) => {
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
          }),
        );
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

    return () => {
      window.clearInterval(clockInterval);
      unsubscribeEvents();
      unsubscribeMail();
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
  const selectedVisibleRows = visibleRows.filter((row) =>
    selectedEventIds.has(row.id),
  );
  const allVisibleSelected =
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

  const toggleVisibleSelection = () => {
    if (!isSuperadmin || deleting) return;
    setSelectedEventIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleRows.forEach((row) => next.delete(row.id));
      } else {
        visibleRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const deleteSelectedEvents = async () => {
    if (!isSuperadmin || deleting || selectedVisibleRows.length === 0) return;
    const confirmed = window.confirm(
      `Permanently delete ${selectedVisibleRows.length} selected notification event${selectedVisibleRows.length === 1 ? "" : "s"}? This will not delete the corresponding email from the mail queue.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      const batch = writeBatch(db);
      selectedVisibleRows.forEach((row) => {
        batch.delete(doc(db, "emailMonitoringEvents", row.id));
      });
      await batch.commit();
      const deletedIds = new Set(selectedVisibleRows.map((row) => row.id));
      setSelectedEventIds((current) => {
        const next = new Set(current);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      if (selectedEventId && deletedIds.has(selectedEventId)) {
        setSelectedEventId(null);
      }
    } catch (deleteError) {
      console.error("Could not delete selected email monitoring events:", deleteError);
      setError("Could not delete the selected notification events. Please try again.");
    } finally {
      setDeleting(false);
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Tracked triggers" value={rows.length} />
        <SummaryCard label="Provider accepted" value={sentCount} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
        <SummaryCard label="Pending" value={pendingCount} icon={<Clock3 className="h-4 w-4 text-amber-600" />} />
        <SummaryCard label="Needs attention" value={attentionCount} icon={<AlertCircle className="h-4 w-4 text-red-600" />} alert={attentionCount > 0} />
      </div>

      <div className="rounded-lg border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">Notification events</h2>
            <p className="text-xs text-slate-500">Showing the most recent 300 tracked triggers.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isSuperadmin && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={deleteSelectedEvents}
                disabled={deleting || selectedVisibleRows.length === 0}
              >
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete selected ({selectedVisibleRows.length})
              </Button>
            )}
            <div className="flex items-center gap-2">
              <label htmlFor="email-monitor-category" className="text-sm text-slate-600">Category</label>
              <select
                id="email-monitor-category"
                className="h-9 rounded-md border bg-white px-2 text-sm"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  setSelectedEventIds(new Set());
                }}
              >
                <option>All</option>
                {EMAIL_MONITOR_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
              </select>
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {isSuperadmin && (
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all visible notification events"
                        checked={allVisibleSelected}
                        disabled={deleting || visibleRows.length === 0}
                        onChange={toggleVisibleSelection}
                      />
                    </th>
                  )}
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
                    {isSuperadmin && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select notification event for ${row.recipient || "recipient"}`}
                          checked={selectedEventIds.has(row.id)}
                          disabled={deleting}
                          onChange={() => {
                            setSelectedEventIds((current) => {
                              const next = new Set(current);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                    )}
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
