"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

interface StatusChange {
  id: string;
  fromStatus: string;
  toStatus: string;
  changedByEmail: string;
  changedByName: string;
  changedAt: Timestamp | Date;
}

function statusColor(status: string) {
  switch (status.toLowerCase()) {
    case "paid":
      return "bg-green-100 text-green-800";
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    case "waived":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function toDate(value: Timestamp | Date) {
  return value instanceof Timestamp ? value.toDate() : value;
}

export function ChargeSlipStatusHistory({
  chargeSlipNumber,
}: {
  chargeSlipNumber: string;
}) {
  const [changes, setChanges] = useState<StatusChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const historyQuery = query(
      collection(db, "chargeSlips", chargeSlipNumber, "statusHistory"),
      orderBy("changedAt", "desc"),
    );

    return onSnapshot(
      historyQuery,
      (snapshot) => {
        setChanges(
          snapshot.docs.map((historyDoc) => ({
            id: historyDoc.id,
            ...historyDoc.data(),
          })) as StatusChange[],
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Failed to load charge slip status history:", snapshotError);
        setError("Status history could not be loaded.");
        setLoading(false);
      },
    );
  }, [chargeSlipNumber]);

  const changesByAdmin = changes.reduce<
    Map<string, { name: string; email: string; count: number }>
  >((counts, change) => {
    const email = change.changedByEmail || "Unknown admin";
    const current = counts.get(email);
    if (current) {
      current.count += 1;
    } else {
      counts.set(email, {
        name: change.changedByName || email,
        email,
        count: 1,
      });
    }
    return counts;
  }, new Map());

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-[#166FB5]" />
          <h2 className="text-lg font-semibold text-slate-800">
            Status Change History
          </h2>
        </div>
        <Badge variant="outline">
          {changes.length} {changes.length === 1 ? "change" : "changes"}
        </Badge>
      </div>

      {changesByAdmin.size > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {[...changesByAdmin.values()].map((admin) => (
            <div
              key={admin.email}
              className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"
            >
              <span className="font-medium text-slate-800">{admin.name}</span>
              <span className="ml-2">{admin.count} status change{admin.count === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading status history…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      ) : changes.length === 0 ? (
        <p className="text-sm text-slate-500">
          No status changes have been recorded for this charge slip.
        </p>
      ) : (
        <ol className="space-y-3">
          {changes.map((change, index) => (
            <li
              key={change.id}
              className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className={`capitalize shadow-none ${statusColor(change.fromStatus)}`}>
                  {change.fromStatus}
                </Badge>
                <span aria-hidden="true" className="text-slate-400">→</span>
                <Badge className={`capitalize shadow-none ${statusColor(change.toStatus)}`}>
                  {change.toStatus}
                </Badge>
                <span className="text-slate-600">
                  by <span className="font-medium text-slate-800">{change.changedByName || change.changedByEmail}</span>
                </span>
                <span className="text-xs text-slate-500">{change.changedByEmail}</span>
              </div>
              <time
                className="shrink-0 text-xs text-slate-500"
                dateTime={toDate(change.changedAt).toISOString()}
              >
                {toDate(change.changedAt).toLocaleString()}
              </time>
              <span className="sr-only">Change {changes.length - index}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
