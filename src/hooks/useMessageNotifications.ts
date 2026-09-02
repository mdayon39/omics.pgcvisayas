/**
 * useMessageNotifications
 *
 * Real-time hook that listens to quotationThreads with unread admin messages.
 * Powers the in-header Message Notification Center.
 */

import { useState, useEffect, useRef } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { QuotationThread } from "@/types/QuotationThread";

export interface MessageNotification {
  inquiryId: string;
  clientName: string;
  clientEmail: string;
  clientAffiliation: string;
  unreadCount: number;
  lastMessageAt?: Date;
  lastMessageBy?: string;
  lastMessageByName?: string;
  lastMessageByRole?: "admin" | "client";
  lastMessagePreview?: string;
  /** Local-only flag — true after the admin opens this thread from the panel */
  viewed: boolean;
}

export function useMessageNotifications() {
  const [notifications, setNotifications] = useState<MessageNotification[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  // Track which inquiry IDs have been "viewed" in the panel (local-only)
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const q = query(
      collection(db, "quotationThreads"),
      orderBy("lastMessageAt", "desc"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const threads: MessageNotification[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data() as QuotationThread;
          const unreadCount = data.unreadCount?.admin ?? 0;
          return {
            inquiryId: docSnap.id,
            clientName: data.clientName || "Unknown",
            clientEmail: data.clientEmail || "",
            clientAffiliation: data.clientAffiliation || "",
            unreadCount,
            lastMessageAt: data.lastMessageAt?.toDate?.(),
            lastMessageBy: data.lastMessageBy,
            lastMessageByName: data.lastMessageByName,
            lastMessageByRole: data.lastMessageByRole,
            lastMessagePreview: data.lastMessagePreview,
            viewed: viewedRef.current.has(docSnap.id),
          };
        })
        .filter((n) => {
          // Hide manually dismissed threads from this recent list
          const threadRaw = snapshot.docs
            .find((d) => d.id === n.inquiryId)
            ?.data() as any;
          if (threadRaw?.dismissedByAdmin === true) return false;

          return n.unreadCount > 0 || !!n.lastMessageAt;
        })
        .slice(0, 1000); // keep up to 1,000 recent threads visible in the admin client messages list

      const total = threads.reduce((sum, t) => sum + t.unreadCount, 0);
      setTotalUnread(total);
      setNotifications(threads);
    });

    return () => unsubscribe();
  }, []);

  /** Mark a single thread as viewed in the panel (visual only — clears the blue dot) */
  const markViewed = (inquiryId: string) => {
    viewedRef.current.add(inquiryId);
    setNotifications((prev) =>
      prev.map((n) => (n.inquiryId === inquiryId ? { ...n, viewed: true } : n)),
    );
  };

  /** Mark all threads viewed in the panel */
  const markAllViewed = () => {
    setNotifications((prev) => {
      prev.forEach((n) => viewedRef.current.add(n.inquiryId));
      return prev.map((n) => ({ ...n, viewed: true }));
    });
  };

  return { notifications, totalUnread, markViewed, markAllViewed };
}
