/**
 * MessageNotificationCenter
 *
 * Header icon that shows a red badge when clients have sent unread messages.
 * Opens a popover listing each inquiry with unread messages.
 * Clicking an item navigates to the inquiry page and opens the chat widget.
 */
"use client";

import React, { useMemo, useState } from "react";
import {
  MessageCircle,
  RotateCcw,
  MoreHorizontal,
  Search,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessageNotifications } from "@/hooks/useMessageNotifications";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import usePresenceStatus from "@/hooks/usePresenceStatus";
import {
  markLatestClientMessageAsUnseen,
  dismissThreadNotification,
} from "@/services/quotationThreadService";

export function MessageNotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [markingUnseenId, setMarkingUnseenId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [confirmDismissOpen, setConfirmDismissOpen] = useState(false);
  const [pendingDismiss, setPendingDismiss] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { notifications, totalUnread, markViewed, markAllViewed } =
    useMessageNotifications();

  const filteredNotifications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return notifications;

    return notifications.filter((notification) => {
      const haystack = [
        notification.clientName,
        notification.clientAffiliation,
        notification.clientEmail,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [notifications, searchQuery]);

  const handleNotificationClick = (inquiryId: string) => {
    markViewed(inquiryId);
    setOpen(false);
    router.push(`/admin/inquiry?inquiryId=${inquiryId}&focus=messages`);
  };

  const requestDismiss = (
    event: React.MouseEvent,
    inquiryId: string,
    clientName: string,
  ) => {
    event.stopPropagation();
    if (dismissingId) return;

    setPendingDismiss({ id: inquiryId, name: clientName });
    setConfirmDismissOpen(true);
  };

  const confirmDismiss = async () => {
    if (!pendingDismiss || dismissingId) return;

    try {
      setDismissingId(pendingDismiss.id);
      await dismissThreadNotification(pendingDismiss.id);
      toast.success("Notification dismissed");
      setConfirmDismissOpen(false);
      setPendingDismiss(null);
    } catch (error) {
      toast.error("Failed to dismiss notification");
    } finally {
      setDismissingId(null);
    }
  };

  const handleMarkAsUnseen = async (
    event: React.MouseEvent,
    inquiryId: string,
  ) => {
    event.stopPropagation();
    if (markingUnseenId === inquiryId) return;

    try {
      setMarkingUnseenId(inquiryId);
      const nextUnread = await markLatestClientMessageAsUnseen(inquiryId);
      if (nextUnread > 0) {
        toast.success("Marked client message as unseen");
      } else {
        toast.info("No seen client message available to mark as unseen");
      }
    } catch (error) {
      toast.error("Failed to mark message as unseen");
    } finally {
      setMarkingUnseenId(null);
    }
  };

  const unviewedCount = notifications.filter((n) => !n.viewed).length;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-slate-100"
            aria-label={
              totalUnread > 0
                ? `${totalUnread} unread client message${totalUnread !== 1 ? "s" : ""}`
                : "Client messages"
            }
          >
            <MessageCircle className="h-5 w-5 text-slate-700" />
            {totalUnread > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-red-500 animate-pulse"
              >
                {totalUnread > 9 ? "9+" : totalUnread}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[350px] p-0" align="end">
          {/* Header */}
          <div className="border-b p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Client Messages
                </h3>
                <p className="text-xs text-slate-500">
                  {totalUnread > 0
                    ? `${totalUnread} unread message${totalUnread !== 1 ? "s" : ""}`
                    : "All caught up!"}
                </p>
              </div>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search client or affiliation"
                className="h-8 pr-8 pl-8 text-xs"
                aria-label="Search client messages"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <ScrollArea className="h-[360px]">
            {filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="p-3 bg-slate-100 rounded-full mb-3">
                  <MessageCircle className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  {searchQuery ? "No matching clients" : "No new messages"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {searchQuery
                    ? "Try a different search keyword"
                    : "New client messages will appear here"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredNotifications.map((n) => (
                  <NotificationItem
                    key={n.inquiryId}
                    notification={n}
                    onClick={() => handleNotificationClick(n.inquiryId)}
                    handleDismiss={requestDismiss}
                    handleMarkAsUnseen={handleMarkAsUnseen}
                    dismissingId={dismissingId}
                    markingUnseenId={markingUnseenId}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={confirmDismissOpen}
        onOpenChange={(nextOpen) => {
          setConfirmDismissOpen(nextOpen);
          if (!nextOpen) {
            setPendingDismiss(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss client message?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the notification for{" "}
              <span className="font-semibold text-foreground">
                {pendingDismiss?.name || "this client"}
              </span>{" "}
              from the admin list. You can only restore it if a new message
              arrives.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissingId !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDismiss}
              disabled={!pendingDismiss || dismissingId !== null}
              className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
            >
              {dismissingId ? "Dismissing..." : "Dismiss message"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// NotificationItem — isolated so it can call hooks per inquiry row
// ---------------------------------------------------------------------------

interface NotificationItemProps {
  notification: any;
  onClick: () => void;
  handleDismiss: (
    e: React.MouseEvent,
    inquiryId: string,
    clientName: string,
  ) => void;
  handleMarkAsUnseen: (e: React.MouseEvent, inquiryId: string) => void;
  dismissingId: string | null;
  markingUnseenId: string | null;
}

function NotificationItem({
  notification: n,
  onClick,
  handleDismiss,
  handleMarkAsUnseen,
  dismissingId,
  markingUnseenId,
}: NotificationItemProps) {
  const presence = usePresenceStatus(`client_${n.inquiryId}`);

  return (
    <div
      onClick={onClick}
      className={`w-full px-4 py-3 text-left hover:bg-slate-50 transition-all group relative cursor-pointer border-b border-slate-100 last:border-0 ${
        n.unreadCount > 0 ? "bg-blue-50/30" : "bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Client Initials Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm border ${
              n.unreadCount > 0
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 border-slate-200"
            }`}
          >
            {n.clientName
              ? (() => {
                  const words = n.clientName.trim().split(/\s+/);
                  if (words.length === 1)
                    return words[0].substring(0, 2).toUpperCase();
                  return (
                    words[0][0] + words[words.length - 1][0]
                  ).toUpperCase();
                })()
              : "?"}
          </div>
          {/* Online dot overlay */}
          {presence.isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-200 animate-pulse" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p
                  className={`text-sm leading-tight inline ${
                    n.unreadCount > 0
                      ? "font-bold text-slate-900"
                      : "font-semibold text-slate-700"
                  }`}
                >
                  {n.clientName}
                </p>
                {n.lastMessageAt && (
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                    {formatDistanceToNow(n.lastMessageAt, {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>
            </div>

            {/* Options Dropdown */}
            <div className="flex items-center gap-1 shrink-0 -mt-1">
              {n.unreadCount > 0 && (
                <span className="flex-shrink-0 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold ring-2 ring-white">
                  {n.unreadCount}
                </span>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all z-20"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  {n.unreadCount > 0 ? (
                    <DropdownMenuItem
                      onClick={(e) =>
                        handleDismiss(e, n.inquiryId, n.clientName)
                      }
                      disabled={dismissingId === n.inquiryId}
                      className="text-[11px] cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      <span>Dismiss</span>
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem
                        onClick={(e) => handleMarkAsUnseen(e, n.inquiryId)}
                        disabled={markingUnseenId === n.inquiryId}
                        className="text-[11px] cursor-pointer"
                      >
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        <span>Mark as unseen</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) =>
                          handleDismiss(e, n.inquiryId, n.clientName)
                        }
                        disabled={dismissingId === n.inquiryId}
                        className="text-[11px] cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        <span>Dismiss</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {(n.lastMessagePreview || n.lastMessageByName) && (
            <p
              className="text-[10px] text-slate-500 leading-normal mt-1 line-clamp-2 pr-2"
              title={n.lastMessagePreview || undefined}
            >
              {n.lastMessageByRole === "admin"
                ? `Admin (${n.lastMessageByName || "Unknown"})`
                : "Client"}
              {n.lastMessagePreview ? `: ${n.lastMessagePreview}` : ":"}
            </p>
          )}
        </div>

        {/* Unread Status Dot */}
        {n.unreadCount > 0 && (
          <div className="flex-shrink-0 self-center">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
