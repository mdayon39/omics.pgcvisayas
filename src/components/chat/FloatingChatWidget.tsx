"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import ChatBox from "@/components/chat/ChatBox";
import { MessageSenderRole } from "@/types/QuotationThread";
import UnreadBadge from "@/components/chat/UnreadBadge";
import {
  subscribeToThreadMessages,
  markMessagesAsRead,
} from "@/services/quotationThreadService";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import useAuth from "@/hooks/useAuth";
import { subscribeToInquiryById } from "@/services/inquiryService";
import { Inquiry } from "@/types/Inquiry";
import { getClientInitials, getAdminDisplayNameWithIcon } from "@/lib/chatUtils";
import { startPresence, subscribeToAnyAdminOnline } from "@/services/presenceService";
import usePresenceStatus from "@/hooks/usePresenceStatus";
import PresenceIndicator from "@/components/chat/PresenceIndicator";
import { useOfficeAvailability } from "@/hooks/useOfficeAvailability";
import { getConfigurationSettings } from "@/services/configurationSettingsService";
import { ConfigurationSettings } from "@/types/ConfigurationSettings";

type NavigatorWithBadge = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(normalized);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ── Office header status for client role ─────────────────────────────────────

interface OfficeStatusIndicatorProps {
  officeOpen: boolean | null;
  reason: string | null;
  autoReplyMessage: string | null;
  supportOnline: boolean;
}

function OfficeStatusIndicator({
  officeOpen,
  reason,
  supportOnline,
}: OfficeStatusIndicatorProps) {
  // While loading, fall back to presence indicator
  if (officeOpen === null) {
    return (
      <PresenceIndicator
        isOnline={supportOnline}
        lastSeen={null}
        onlineLabel="Available"
        offlineLabel="Support Offline"
        variant="light"
      />
    );
  }

  if (officeOpen) {
    // Office open — show real admin presence
    return (
      <PresenceIndicator
        isOnline={supportOnline}
        lastSeen={null}
        onlineLabel="Available"
        offlineLabel="Support Offline"
        variant="light"
      />
    );
  }

  // Office closed — show reason without a green dot
  const label: string = (() => {
    switch (reason) {
      case "outside_hours": return "Outside Office Hours";
      case "weekend":         return "Weekend — Office Closed";
      case "holiday":         return "Holiday — Office Closed";
      case "closure":         return "Office Closure";
      case "partial_closure": return "Temporarily Unavailable";
      case "activity":        return "Office Activity Today";
      default:              return "Support Offline";
    }
  })();

  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full flex-shrink-0 bg-white/30" />
      <span className="text-[10px] text-white/60">{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface InquirySummary {
  id: string;
  status: string;
  serviceType?: string;
  createdAt?: Date | any;
}

interface FloatingChatWidgetProps {
  inquiryId: string;
  role: MessageSenderRole;
  className?: string;
  /** When provided (client portal only), the widget aggregates unread counts
   *  across ALL inquiry threads and shows a thread-picker tab bar. */
  allInquiries?: InquirySummary[];
  /** Called when the user switches inquiry tabs inside the widget, so the
   *  parent can sync its own selection state (e.g. sidebar highlight). */
  onThreadSwitch?: (threadId: string) => void;
}

/** Short display label for an inquiry thread pill */
function formatThreadLabel(inq: InquirySummary): string {
  const service = inq.serviceType
    ? inq.serviceType.charAt(0).toUpperCase() + inq.serviceType.slice(1)
    : "Inquiry";
  try {
    const date = inq.createdAt?.toDate
      ? inq.createdAt.toDate()
      : new Date(inq.createdAt);
    if (!isNaN(date.getTime())) {
      const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${service} · ${label}`;
    }
  } catch { /* ignore */ }
  return service;
}

function getInquiryStatusStyle(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "ongoing quotation":
    case "in progress":
    case "under_review":
      return "bg-blue-100 text-blue-800";
    case "approved client":
    case "approved":
    case "converted":
      return "bg-emerald-100 text-emerald-800";
    case "quotation only":
    case "quoted":
      return "bg-violet-100 text-violet-800";
    case "service not offered":
    case "cancelled":
    case "rejected":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function formatInquiryStatus(status: string): string {
  return status
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function FloatingChatWidget({
  inquiryId,
  role,
  className,
  allInquiries,
  onThreadSwitch,
}: FloatingChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [inquiryData, setInquiryData] = useState<Inquiry | null>(null);
  const [lastNotifiedUnread, setLastNotifiedUnread] = useState(0);

  // Active thread — defaults to the selected inquiry but can be switched via the tab picker.
  const [activeThreadId, setActiveThreadId] = useState(inquiryId);

  // Per-thread unread map (populated only when allInquiries has multiple entries)
  const [perThreadUnread, setPerThreadUnread] = useState<Map<string, number>>(new Map());

  // Sync activeThreadId when the parent changes the selected inquiry
  useEffect(() => {
    setActiveThreadId(inquiryId);
  }, [inquiryId]);

  // Refs so stable effects can read the latest values without being deps
  const isOpenRef = useRef(false);
  const inquiryDataRef = useRef<Inquiry | null>(null);
  const userRef = useRef(user);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { inquiryDataRef.current = inquiryData; }, [inquiryData]);
  useEffect(() => { userRef.current = user; }, [user]);

  // ---- Presence: client keyed by "client_{activeThreadId}", admin by email ----
  const clientPresenceId = `client_${activeThreadId}`;
  const adminPresenceId = user?.email ?? null;

  // Subscribe to the other party's presence
  // Admin view → watch the client's presence key
  // Client view → handled separately via subscribeToAnyAdminOnline
  const clientPresence = usePresenceStatus(role === "admin" ? clientPresenceId : null);

  // For client view: subscribe to whether any admin is online
  const [supportOnline, setSupportOnline] = useState(false);
  useEffect(() => {
    if (role !== "client") return;
    return subscribeToAnyAdminOnline((online) => setSupportOnline(online));
  }, [role]);

  // Load app config for feature flags
  const [appConfig, setAppConfig] = useState<ConfigurationSettings | null>(null);
  useEffect(() => {
    getConfigurationSettings().then(setAppConfig);
  }, []);

  // Office availability for client header status
  const officeAvailability = useOfficeAvailability();

  // Publish own presence
  useEffect(() => {
    if (role === "client") {
      // Clients are identified by their inquiryId
      return startPresence(clientPresenceId, "client");
    }
    // Admins: presence is already published by AdminChatWidget;
    // publish here as fallback (idempotent — same key, same heartbeat behaviour)
    if (adminPresenceId) {
      return startPresence(adminPresenceId, "admin");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, clientPresenceId, adminPresenceId]);

  useEffect(() => {
    if (!activeThreadId) return;
    const unsubscribe = subscribeToInquiryById(activeThreadId, (data) => {
      setInquiryData(data);
    });
    return () => unsubscribe();
  }, [activeThreadId]);

  // ── Multi-thread unread aggregation ───────────────────────────────────────
  // When the client has more than one inquiry, subscribe to all threads and
  // accumulate unread counts so the badge reflects messages across ALL inquiries.
  const allInquiryIdKey = allInquiries?.map(i => i.id).join(",") ?? "";
  useEffect(() => {
    if (!allInquiries || allInquiries.length <= 1) return;

    const unsubscribers: (() => void)[] = [];
    allInquiries.forEach(({ id: threadId }) => {
      const unsub = subscribeToThreadMessages(threadId, (messages) => {
        const unread = messages.filter(m => !m.isRead && m.senderRole !== role).length;
        setPerThreadUnread(prev => {
          const next = new Map(prev);
          next.set(threadId, unread);
          return next;
        });
      });
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allInquiryIdKey, role]);

  const closeWidget = () => {
    setIsOpen(false);
    if (searchParams.get("focus") === "messages" && searchParams.get("inquiryId") === activeThreadId) {
      // Create new URLSearchParams without focus and inquiryId
      const params = new URLSearchParams(searchParams.toString());
      params.delete("focus");
      params.delete("inquiryId");
      
      const newQuery = params.toString();
      router.replace(pathname + (newQuery ? `?${newQuery}` : ""), { scroll: false });
    }
  };

  // Open widget and mark messages as read when navigated here via URL focus param.
  // Also switches to the correct thread if a different inquiryId is in the URL.
  useEffect(() => {
    const focusInquiryId = searchParams.get("inquiryId");
    if (searchParams.get("focus") === "messages" && focusInquiryId) {
      // Switch to the focused thread if it belongs to this client
      if (allInquiries?.some(i => i.id === focusInquiryId)) {
        setActiveThreadId(focusInquiryId);
      } else if (focusInquiryId === inquiryId) {
        setActiveThreadId(inquiryId);
      } else {
        return; // Not our widget
      }
      setIsOpen(true);
      if (focusInquiryId) {
        const currentUser = userRef.current;
        const currentInquiryData = inquiryDataRef.current;
        const viewerName = role === "admin" && currentUser?.email
          ? getAdminDisplayNameWithIcon(currentUser.email)
          : undefined;
        markMessagesAsRead(
          focusInquiryId,
          role,
          currentUser?.email || currentUser?.uid || "SYSTEM",
          currentInquiryData?.email || undefined,
          currentInquiryData?.name || undefined,
          viewerName,
        ).catch(console.error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, inquiryId, role]);

  // Stable subscription — only recreated when activeThreadId or role changes.
  // isOpen is intentionally read via ref so the subscription is not torn down
  // and recreated every time the chat opens/closes (which would cause Firestore
  // to fire an immediate snapshot that could mark messages as read prematurely).
  useEffect(() => {
    if (!activeThreadId) return;

    const unsubscribe = subscribeToThreadMessages(activeThreadId, (messages) => {
      // Count messages that are NOT read and are NOT from us
      const unread = messages.filter(
        (m) => !m.isRead && m.senderRole !== role,
      ).length;

      // Only auto-mark as read when the widget is visibly open (user has clicked to open it)
      if (isOpenRef.current && unread > 0) {
        const currentUser = userRef.current;
        const currentInquiryData = inquiryDataRef.current;
        const viewerName = role === "admin" && currentUser?.email
          ? getAdminDisplayNameWithIcon(currentUser.email)
          : undefined;
        markMessagesAsRead(
          activeThreadId,
          role,
          currentUser?.email || currentUser?.uid || "SYSTEM",
          currentInquiryData?.email || undefined,
          currentInquiryData?.name || undefined,
          viewerName,
        ).catch(console.error);
      }

      setUnreadCount(unread);
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, role]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (role !== "client") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "granted") return;

    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
    if (!publicKey) return;

    const subscribe = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64ToUint8Array(publicKey) as unknown as BufferSource,
          }));

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: inquiryId,
            role: "client",
            subscriberId: user?.email || inquiryData?.email || "unknown-client",
            subscription: subscription.toJSON(),
          }),
        });
      } catch (error) {
        console.error("Push subscription failed:", error);
      }
    };

    subscribe();
  }, [inquiryData?.email, inquiryId, role, user?.email]);

  // Total unread to show on the badge: aggregate across all threads when
  // multiple inquiries exist, otherwise use the single-thread count.
  const totalUnreadCount = allInquiries && allInquiries.length > 1
    ? Array.from(perThreadUnread.values()).reduce((a, b) => a + b, 0)
    : unreadCount;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (role !== "client") return;

    const nav = navigator as NavigatorWithBadge;
    if (typeof nav.setAppBadge === "function" || typeof nav.clearAppBadge === "function") {
      if (totalUnreadCount > 0 && typeof nav.setAppBadge === "function") {
        nav.setAppBadge(totalUnreadCount).catch(() => {});
      }
      if (totalUnreadCount === 0 && typeof nav.clearAppBadge === "function") {
        nav.clearAppBadge().catch(() => {});
      }
    }

    // Foreground web notification (while app/browser tab is open but hidden).
    // Background push notifications when app is fully closed still need Web Push setup.
    if (
      document.visibilityState === "hidden" &&
      totalUnreadCount > lastNotifiedUnread &&
      Notification.permission === "granted"
    ) {
      new Notification("New message from PGC Visayas", {
        body: `You have ${totalUnreadCount} unread message${totalUnreadCount > 1 ? "s" : ""}.`,
        icon: "/assets/pgc-logo.png",
        badge: "/assets/pgc-logo.png",
        tag: `inquiry-${activeThreadId}`,
      });
    }

    setLastNotifiedUnread(totalUnreadCount);
  }, [activeThreadId, lastNotifiedUnread, role, totalUnreadCount]);

  const toggleOpen = () => {
    const newOpenState = !isOpen;
    
    if (!newOpenState) {
      closeWidget();
      return;
    }
    
    setIsOpen(newOpenState);

    if (newOpenState && role === "client" && typeof window !== "undefined") {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }

    // If opening, mark as read immediately for the active thread
    if (newOpenState && activeThreadId) {
      const viewerName = role === "admin" && user?.email
        ? getAdminDisplayNameWithIcon(user.email)
        : undefined;
      markMessagesAsRead(
        activeThreadId, 
        role, 
        user?.email || user?.uid || "SYSTEM",
        inquiryData?.email || undefined,
        inquiryData?.name || undefined,
        viewerName,
      ).catch(console.error);
    }
  };

  /** Switch to a different inquiry thread and mark it read immediately. */
  const handleSwitchThread = (threadId: string) => {
    setActiveThreadId(threadId);
    onThreadSwitch?.(threadId);
    const currentUser = userRef.current;
    const currentInquiryData = inquiryDataRef.current;
    const viewerName = role === "admin" && currentUser?.email
      ? getAdminDisplayNameWithIcon(currentUser.email)
      : undefined;
    markMessagesAsRead(
      threadId,
      role,
      currentUser?.email || currentUser?.uid || "SYSTEM",
      currentInquiryData?.email || undefined,
      currentInquiryData?.name || undefined,
      viewerName,
    ).catch(console.error);
  };

  return (
    <div
      className={`fixed ${role === "admin" ? "bottom-24" : "bottom-6"} right-6 z-50 flex flex-col items-end ${className || ""}`}
    >
      <AnimatePresence>
        {!isOpen && role !== "admin" && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="mb-2 mr-2 bg-white px-3 py-1.5 rounded-full shadow-lg border border-blue-100 flex items-center gap-2 pointer-events-none"
          >
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Talk to us
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          </motion.div>
        )}

        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-4 w-[350px] shadow-2xl rounded-2xl overflow-hidden border border-slate-200 bg-white"
          >
            <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
              <div className="flex items-center gap-3">
                {role === "admin" ? (
                  <Avatar className="h-10 w-10 border border-blue-500 bg-white shadow-sm shrink-0">
                    <AvatarFallback className="bg-blue-50 text-base font-bold tracking-tight text-blue-700">
                      {getClientInitials(inquiryData?.name)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center p-1.5 shadow-sm border border-blue-500 overflow-hidden">
                    <img src="/assets/pgc-logo.png" alt="PGC Logo" className="w-full h-full object-contain" />
                  </div>
                )}
                <div className="flex flex-col">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate font-bold text-sm tracking-tight leading-tight">
                      {role === "admin" ? (inquiryData?.name || "Client") : "PGC Visayas Support"}
                    </span>
                    {role === "admin" && inquiryData?.status && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${getInquiryStatusStyle(inquiryData.status)}`}
                        aria-label={`Inquiry status: ${formatInquiryStatus(inquiryData.status)}`}
                      >
                        {formatInquiryStatus(inquiryData.status)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {role === "admin" ? (
                      <PresenceIndicator
                        isOnline={clientPresence.isOnline}
                        lastSeen={clientPresence.lastSeen}
                        offlineLabel={inquiryData?.affiliation || "Inquiry Request"}
                        variant="light"
                      />
                    ) : (
                      <OfficeStatusIndicator
                        officeOpen={(appConfig?.portalFeatures.chatHeaderStatus !== false) ? (officeAvailability?.isOpen ?? null) : true}
                        reason={officeAvailability?.reason ?? null}
                        autoReplyMessage={officeAvailability?.autoReplyMessage ?? null}
                        supportOnline={supportOnline}
                      />
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={closeWidget}
                className="text-white/80 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Thread picker (multi-inquiry clients only) ───────────── */}
            {allInquiries && allInquiries.length > 1 && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border-b border-blue-100 overflow-x-auto scrollbar-hide">
                {allInquiries.map((inq) => {
                  const threadUnread = perThreadUnread.get(inq.id) ?? 0;
                  const isActive = inq.id === activeThreadId;
                  return (
                    <button
                      key={inq.id}
                      onClick={() => handleSwitchThread(inq.id)}
                      className={`relative flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-white text-blue-700 border border-blue-200 hover:bg-blue-100"
                      }`}
                    >
                      {formatThreadLabel(inq)}
                      {threadUnread > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-1 ring-white">
                          {threadUnread > 9 ? "9+" : threadUnread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="h-[400px] w-full bg-white flex flex-col">
              <ChatBox
                inquiryId={activeThreadId}
                role={role}
                variant="floating"
                clientName={inquiryData?.name}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleOpen}
        className={`relative flex items-center justify-center p-4 text-white rounded-full shadow-lg transition-colors ${
          !isOpen && totalUnreadCount > 0
            ? "bg-blue-600 hover:bg-blue-700 ring-4 ring-blue-300 ring-offset-1 animate-pulse"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {isOpen ? (
          <ChevronDown className="w-6 h-6" />
        ) : (
          <MessageCircle className="w-6 h-6" />
        )}

        {/* Unread Badge outside */}
        {!isOpen && totalUnreadCount > 0 && (
          <>
            <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm ring-2 ring-white z-10">
              {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
            </span>
            {/* Outer ping ring for flashing effect */}
            <span className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-400 animate-ping opacity-60 pointer-events-none" />
          </>
        )}
      </motion.button>
    </div>
  );
}
