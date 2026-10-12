"use client";

import { useEffect, useState } from "react";
import {
  collection,
  limit,
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
  currentStatus,
}: {
  chargeSlipNumber: string;
  currentStatus: string;
}) {
  const [latestChange, setLatestChange] = useState<StatusChange | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const historyQuery = query(
      collection(db, "chargeSlips", chargeSlipNumber, "statusHistory"),
      orderBy("changedAt", "desc"),
      limit(1),
    );

    return onSnapshot(
      historyQuery,
      (snapshot) => {
        setLatestChange(
          snapshot.docs[0]
            ? {
                id: snapshot.docs[0].id,
                ...snapshot.docs[0].data(),
              } as StatusChange
            : null,
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

  const changeMatchesCurrentStatus =
    latestChange?.toStatus.toLowerCase() === currentStatus.toLowerCase();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-[#166FB5]" />
          <h2 className="text-lg font-semibold text-slate-800">
            Current Status Details
          </h2>
        </div>
        <Badge className={`capitalize shadow-none ${statusColor(currentStatus)}`}>
          {currentStatus}
        </Badge>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading current status details…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-600">{error}</p>
      ) : !latestChange || !changeMatchesCurrentStatus ? (
        <p className="text-sm text-slate-500">
          No change details are recorded for the current status.
        </p>
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-slate-600">
            Changed by{" "}
            <span className="font-medium text-slate-800">
              {latestChange.changedByName || latestChange.changedByEmail}
            </span>
            {latestChange.changedByName && latestChange.changedByEmail && (
              <span className="ml-2 text-xs text-slate-500">
                {latestChange.changedByEmail}
              </span>
            )}
          </p>
          <time
            className="text-xs text-slate-500"
            dateTime={toDate(latestChange.changedAt).toISOString()}
          >
            {toDate(latestChange.changedAt).toLocaleString()}
          </time>
        </div>
      )}
    </section>
  );
}
