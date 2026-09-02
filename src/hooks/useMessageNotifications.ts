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
  onSnapshot,
  orderBy,
  QuerySnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { QuotationThread, ThreadMessage } from "@/types/QuotationThread";

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
    const threadsQuery = query(
      collection(db, "quotationThreads"),
      orderBy("lastMessageAt", "desc"),
    );
    const messagesQuery = query(
      collection(db, "threadMessages"),
      orderBy("createdAt", "desc"),
    );

    let latestMessages = new Map<string, ThreadMessage>();
    let latestThreads: QuerySnapshot | null = null;

    const updateNotifications = () => {
      if (!latestThreads) return;

      const threads: MessageNotification[] = latestThreads.docs
        .map((docSnap) => {
          const data = docSnap.data() as QuotationThread;
          const latestMessage = latestMessages.get(docSnap.id);
          const unreadCount = data.unreadCount?.admin ?? 0;
          return {
            inquiryId: docSnap.id,
            clientName: data.clientName || "Unknown",
            clientEmail: data.clientEmail || "",
            clientAffiliation: data.clientAffiliation || "",
            unreadCount,
            lastMessageAt:
              data.lastMessageAt?.toDate?.() ||
              latestMessage?.createdAt?.toDate?.(),
            lastMessageBy: data.lastMessageBy || latestMessage?.senderId,
            lastMessageByName:
              data.lastMessageByName || latestMessage?.senderName,
            lastMessageByRole:
              data.lastMessageByRole || latestMessage?.senderRole,
            lastMessagePreview:
              data.lastMessagePreview ||
              latestMessage?.content?.trim().substring(0, 120),
            viewed: viewedRef.current.has(docSnap.id),
          };
        })
        .filter((n) => {
          const threadRaw = latestThreads?.docs
            .find((d) => d.id === n.inquiryId)
            ?.data() as any;
          if (threadRaw?.dismissedByAdmin === true) return false;

          return n.unreadCount > 0 || !!n.lastMessageAt;
        })
        .slice(0, 1000);

      const total = threads.reduce((sum, t) => sum + t.unreadCount, 0);
      setTotalUnread(total);
      setNotifications(threads);
    };

    const unsubscribeThreads = onSnapshot(threadsQuery, (snapshot) => {
      latestThreads = snapshot;
      updateNotifications();
    });
    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      latestMessages = new Map();
      snapshot.docs.forEach((docSnap) => {
        const message = docSnap.data() as ThreadMessage;
        if (message.threadId && !latestMessages.has(message.threadId)) {
          latestMessages.set(message.threadId, message);
        }
      });
      updateNotifications();
    });

    return () => {
      unsubscribeThreads();
      unsubscribeMessages();
    };
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
