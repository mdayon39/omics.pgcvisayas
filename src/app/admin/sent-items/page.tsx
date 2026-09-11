"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PermissionGuard } from "@/components/PermissionGuard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Mail,
  RefreshCw,
  XCircle,
} from "lucide-react";

type EmailCategory =
  | "Inquiry received"
  | "Chat received"
  | "Charge slip received"
  | "Quotation available"
  | "Service report available"
  | "Password recovery"
  | "Other client email";

type EmailStatus = "Sent" | "Failed" | "Pending";

type SentEmail = {
  id: string;
  recipient: string;
  subject: string;
  category: EmailCategory;
  status: EmailStatus;
  createdAt: Date;
  error?: string;
};

function toDate(value: any): Date {
  if (value?.toDate) return value.toDate();
  const date = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function categorizeEmail(subject: string): EmailCategory {
  const normalized = subject.toLowerCase();
  if (normalized.includes("inquiry")) return "Inquiry received";
  if (normalized.includes("chat") || normalized.includes("message")) {
    return "Chat received";
  }
  if (
    normalized.includes("billing") ||
    normalized.includes("invoice") ||
    normalized.includes("charge slip")
  ) {
    return "Charge slip received";
  }
  if (normalized.includes("quotation")) return "Quotation available";
  if (normalized.includes("service report")) {
    return "Service report available";
  }
  if (normalized.includes("password") || normalized.includes("recovery")) {
    return "Password recovery";
  }
  return "Other client email";
}

function isClientFacingEmail(subject: string): boolean {
  const normalized = subject.toLowerCase();
  if (normalized.includes("email system test")) return false;
  if (normalized.includes("new receipt uploaded")) return false;
  if (normalized.includes("new ") && normalized.includes(" inquiry from ")) {
    return false;
  }
  return true;
}

function getStatus(data: Record<string, any>): EmailStatus {
  const state = String(
    data?.delivery?.state || data?.status || "",
  ).toUpperCase();
  if (state === "SUCCESS" || state === "SENT") return "Sent";
  if (state === "ERROR" || state === "FAILED" || state === "FAILURE") {
    return "Failed";
  }
  return "Pending";
}

function formatDate(date: Date) {
  if (date.getTime() === 0) return "Unknown";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SentItemsPage() {
  return (
    <PermissionGuard module="activityLogs" action="view">
      <SentItemsContent />
    </PermissionGuard>
  );
}

function SentItemsContent() {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EmailCategory | "all">("all");
  const [status, setStatus] = useState<EmailStatus | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "mail"),
      (snapshot) => {
        const records = snapshot.docs
          .map((mailDoc) => {
            const data = mailDoc.data();
            const recipients = Array.isArray(data.to)
              ? data.to
              : data.to
                ? [data.to]
                : [];
            const message = data.message || {};
            const subject = String(
              message.subject || data.subject || "No subject",
            );
            const recipient = recipients.map(String).join(", ");

            return {
              id: mailDoc.id,
              recipient: recipient || "Unknown recipient",
              subject,
              category: categorizeEmail(subject),
              status: getStatus(data),
              createdAt: toDate(data.createdAt || data.timestamp),
              error: data.delivery?.error || data.error,
            } satisfies SentEmail;
          })
          .filter((email) => isClientFacingEmail(email.subject))
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          );

        setEmails(records);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load sent email records:", error);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const filteredEmails = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return emails.filter((email) => {
      const matchesCategory = category === "all" || email.category === category;
      const matchesStatus = status === "all" || email.status === status;
      const matchesSearch =
        !normalizedSearch ||
        email.recipient.toLowerCase().includes(normalizedSearch) ||
        email.subject.toLowerCase().includes(normalizedSearch);
      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [emails, search, category, status]);

  const counts = {
    Sent: emails.filter((email) => email.status === "Sent").length,
    Pending: emails.filter((email) => email.status === "Pending").length,
    Failed: emails.filter((email) => email.status === "Failed").length,
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Sent Items</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor automated client email delivery from the mail queue.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-xs text-muted-foreground">Sent</p>
            <p className="text-xl font-bold">{counts.Sent}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <Clock3 className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-xl font-bold">{counts.Pending}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <XCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-xl font-bold">{counts.Failed}</p>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search recipient or subject..."
            className="max-w-sm"
          />
          <Select
            value={category}
            onValueChange={(value) =>
              setCategory(value as EmailCategory | "all")
            }
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="Inquiry received">Inquiry received</SelectItem>
              <SelectItem value="Chat received">Chat received</SelectItem>
              <SelectItem value="Charge slip received">
                Charge slip received
              </SelectItem>
              <SelectItem value="Quotation available">
                Quotation available
              </SelectItem>
              <SelectItem value="Service report available">
                Service report available
              </SelectItem>
              <SelectItem value="Password recovery">
                Password recovery
              </SelectItem>
              <SelectItem value="Other client email">
                Other client email
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as EmailStatus | "all")}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Sent">Sent</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={5} className="h-32 text-center">
                    <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading email records...
                  </td>
                </tr>
              ) : filteredEmails.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <Mail className="mr-2 inline h-4 w-4" />
                    No email records found.
                  </td>
                </tr>
              ) : (
                filteredEmails.map((email) => (
                  <tr key={email.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(email.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {email.recipient}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{email.category}</Badge>
                    </td>
                    <td className="max-w-md px-4 py-3 text-xs">
                      {email.subject}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          email.status === "Sent"
                            ? "bg-emerald-100 text-emerald-800"
                            : email.status === "Failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }
                      >
                        {email.status === "Sent" ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : email.status === "Failed" ? (
                          <AlertCircle className="mr-1 h-3 w-3" />
                        ) : (
                          <Clock3 className="mr-1 h-3 w-3" />
                        )}
                        {email.status}
                      </Badge>
                      {email.error && (
                        <p className="mt-1 max-w-xs text-[10px] text-red-600">
                          {String(email.error)}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
