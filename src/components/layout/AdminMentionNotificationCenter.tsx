"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onSnapshot } from "firebase/firestore";
import { AtSign } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import useAuth from "@/hooks/useAuth";
import {
  getAdminMentionNotificationsQuery,
  markAdminMentionNotificationRead,
  type AdminMentionNotification,
} from "@/services/adminMentionService";

export function AdminMentionNotificationCenter() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<
    AdminMentionNotification[]
  >([]);
  const [open, setOpen] = useState(false);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  useEffect(() => {
    if (!isAdmin || !user?.email) return;
    return onSnapshot(
      getAdminMentionNotificationsQuery(user.email),
      (snapshot) => {
        const latestNotifications = snapshot.docs.map((notificationDoc) => ({
          id: notificationDoc.id,
          ...notificationDoc.data(),
        })) as AdminMentionNotification[];
        latestNotifications.sort(
          (a, b) =>
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
        );
        setNotifications(latestNotifications);
      },
      (error) => {
        console.error("Failed to load admin mention notifications:", error);
        toast.error("Could not load mention notifications");
      },
    );
  }, [isAdmin, user?.email]);

  const openNotification = async (
    notification: AdminMentionNotification,
  ) => {
    try {
      if (!notification.read) {
        await markAdminMentionNotificationRead(notification.id);
      }
      setOpen(false);
      router.push(`/admin/inquiry?inquiryId=${notification.threadId}&focus=messages`);
    } catch (error) {
      console.error("Failed to open admin mention notification:", error);
      toast.error("Could not open mention notification");
    }
  };

  if (!isAdmin) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-slate-100"
          aria-label={
            unreadCount
              ? `${unreadCount} unread admin mention${unreadCount === 1 ? "" : "s"}`
              : "Admin mentions"
          }
        >
          <AtSign className="h-5 w-5 text-slate-700" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="end">
        <div className="border-b p-4">
          <h3 className="font-semibold text-slate-900">Admin Mentions</h3>
          <p className="text-xs text-slate-500">
            {unreadCount
              ? `${unreadCount} unread mention${unreadCount === 1 ? "" : "s"}`
              : "No unread mentions"}
          </p>
        </div>
        <ScrollArea className="max-h-[360px]">
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              Mentions in client conversations will appear here.
            </p>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                    notification.read ? "bg-white" : "bg-blue-50/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      {notification.senderName} mentioned you
                    </span>
                    {!notification.read && (
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600"
                        aria-label="Unread"
                      />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Client: {notification.clientName || "Client"}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-700">
                    {notification.contentPreview || "Attachment"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
