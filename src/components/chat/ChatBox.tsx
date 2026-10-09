"use client";

import React, { useState, useEffect, useRef } from "react";
import useAuth from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
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
import TextareaAutosize from "react-textarea-autosize";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Send,
  Clock,
  AlertCircle,
  Check,
  CheckCheck,
  Paperclip,
  FileText,
  FileSpreadsheet,
  File,
  X,
  Loader2,
  Download,
  Copy,
  Trash2,
  Info,
  ExternalLink,
} from "lucide-react";
import { ThreadMessage, MessageSenderRole } from "@/types/QuotationThread";
import {
  subscribeToThreadMessages,
  addThreadMessage,
  markMessagesAsRead,
  toggleReaction,
  deleteThreadMessage,
  unsendMessage,
} from "@/services/quotationThreadService";
import { uploadFile } from "@/lib/fileUpload";
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  getAdminDisplayName,
  getAdminDisplayNameWithIcon,
  getClientInitials,
} from "@/lib/chatUtils";
import { getAllAdmins, type Admin } from "@/services/adminService";
import { createAdminMentionNotifications } from "@/services/adminMentionService";
import EmojiPicker from "./EmojiPicker";

// Allowed attachment types for chat
const CHAT_MAX_SIZE_MB = 10;

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
];

const ACCEPT_ATTR = [
  "image/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
].join(",");

const FAQ_URL = "https://omics.pgcvisayas.upv.edu.ph/faqs";
const MODE_OF_PAYMENT_STORAGE_PATH = "documents/mode_of_payment.pdf";

type ChatResourceSuggestion = {
  id: "faqs" | "mode-of-payment";
  name: string;
  type: string;
};

function isImageType(type: string) {
  return type.startsWith("image/");
}

function getFileIcon(type: string) {
  if (
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return FileSpreadsheet;
  }
  if (type === "text/plain") return File;
  return FileText; // PDF, Word, PPT, etc.
}

function getMentionToken(admin: Admin, admins: Admin[]) {
  const displayToken = getAdminDisplayName(admin.email)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const nameToken = admin.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const emailToken = admin.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  const primaryToken = displayToken || nameToken || emailToken;
  const duplicateName = admins.filter(
    (candidate) =>
      getAdminDisplayName(candidate.email)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") === displayToken,
  ).length > 1;
  return duplicateName ? emailToken || primaryToken : primaryToken;
}

async function downloadAttachment(url: string, name: string) {
  try {
    const response = await fetch(url, { mode: "cors" });
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Delay revoke so the browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // Fallback: open in new tab which lets the user save manually
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function AttachmentBubble({
  attachment,
  isMe,
}: {
  attachment: { name: string; url: string; type: string };
  isMe: boolean;
}) {
  const FileIcon = getFileIcon(attachment.type);

  if (attachment.type === "application/pdf" || attachment.type === "text/html") {
    return (
      <a
        href={attachment.url}
        target={attachment.type === "text/html" ? "_blank" : "_self"}
        rel={attachment.type === "text/html" ? "noopener noreferrer" : undefined}
        className={`flex items-center gap-2 mt-1.5 rounded-xl px-3 py-2 border transition-colors ${
          isMe
            ? "bg-white/15 border-white/20 hover:bg-white/25 text-white"
            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
        }`}
        title={`Open ${attachment.name}`}
      >
        <FileIcon className="h-5 w-5 flex-shrink-0" />
        <span className="text-xs font-medium truncate max-w-[180px]">
          {attachment.name}
        </span>
        <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 ml-auto opacity-70" />
      </a>
    );
  }

  if (isImageType(attachment.type)) {
    return (
      <div className="relative mt-1.5 group/img">
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl overflow-hidden border border-white/20 hover:opacity-90 transition-opacity"
          title={`View ${attachment.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.name}
            className="max-w-[220px] max-h-[180px] object-cover w-full"
          />
        </a>
        {/* Download overlay button */}
        <button
          onClick={() => downloadAttachment(attachment.url, attachment.name)}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/40 hover:bg-black/60 rounded-full p-1"
          title="Download"
        >
          <Download className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
    );
  }

  // Document / generic file — clicking forces download
  return (
    <button
      type="button"
      onClick={() => downloadAttachment(attachment.url, attachment.name)}
      className={`flex items-center gap-2 mt-1.5 rounded-xl px-3 py-2 border transition-colors cursor-pointer ${
        isMe
          ? "bg-white/15 border-white/20 hover:bg-white/25 text-white"
          : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
      }`}
      title={`Download ${attachment.name}`}
    >
      <FileIcon className="h-5 w-5 flex-shrink-0" />
      <span className="text-xs font-medium truncate max-w-[160px]">
        {attachment.name}
      </span>
      <Download className="h-3.5 w-3.5 flex-shrink-0 ml-auto opacity-70" />
    </button>
  );
}

interface ChatBoxProps {
  inquiryId: string;
  role: MessageSenderRole; // "admin" or "client"
  variant?: "default" | "floating";
  clientName?: string;
}

export default function ChatBox({
  inquiryId,
  role,
  variant = "default",
  clientName,
}: ChatBoxProps) {
  const { user, adminInfo } = useAuth();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [pendingLinkedAttachments, setPendingLinkedAttachments] = useState<
    { name: string; url: string; type: string }[]
  >([]);
  const [addingResource, setAddingResource] = useState<string | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [mentionedAdmins, setMentionedAdmins] = useState<
    { email: string; name: string; token: string }[]
  >([]);
  const [mentionMenu, setMentionMenu] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [unsendingId, setUnsendingId] = useState<string | null>(null);
  const [pendingUnsendId, setPendingUnsendId] = useState<string | null>(null);
  // ID of the client message whose viewer list is currently expanded
  const [expandedViewersId, setExpandedViewersId] = useState<string | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const DEFAULT_REACTIONS = ["👍", "❤️", "😮", "😂", "😥"];
  const mentionSuggestions =
    role === "admin" && mentionMenu
      ? admins
          .filter(
            (admin) =>
              admin.status !== "deactivated" &&
              admin.email.toLowerCase() !== user?.email?.toLowerCase(),
          )
          .filter((admin) => {
            const query = mentionMenu.query.toLowerCase();
            const normalize = (value: string) =>
              value.toLowerCase().replace(/[^a-z0-9]/g, "");
            const displayName = getAdminDisplayName(admin.email);
            const searchableValues = [
              displayName,
              admin.name,
              admin.email,
              admin.email.split("@")[0],
              getMentionToken(admin, admins),
            ].map(normalize);
            return searchableValues.some((value) => value.includes(query));
          })
          .sort((left, right) =>
            getAdminDisplayName(left.email).localeCompare(
              getAdminDisplayName(right.email),
            ),
          )
      : [];
  const resourceSuggestions: ChatResourceSuggestion[] =
    role === "admin"
      ? [
          ...(/\b(?:faq|faqs|frequently asked questions)\b/i.test(newMessage)
            ? [
                {
                  id: "faqs" as const,
                  name: "PGC Visayas FAQs",
                  type: "text/html",
                },
              ]
            : []),
          ...(/\b(?:mode|pay\w*)\b/i.test(newMessage)
            ? [
                {
                  id: "mode-of-payment" as const,
                  name: "Mode of Payment.pdf",
                  type: "application/pdf",
                },
              ]
            : []),
        ].filter(
          (resource) =>
            !pendingLinkedAttachments.some(
              (attachment) => attachment.name === resource.name,
            ),
        )
      : [];

  const normalizeIdentifier = (value: string | null | undefined) =>
    (value || "").trim().toLowerCase();

  const currentUserIdentifiers = new Set(
    [normalizeIdentifier(user?.email), normalizeIdentifier(user?.uid)].filter(
      Boolean,
    ),
  );
  const isSuperAdmin = role === "admin" && adminInfo?.role === "superadmin";

  useEffect(() => {
    if (role !== "admin") {
      setAdmins([]);
      return;
    }
    getAllAdmins()
      .then(setAdmins)
      .catch((adminError) => {
        console.error("Failed to load admins for chat mentions:", adminError);
        toast.error("Could not load admins for mentions");
      });
  }, [role]);

  // Alias of the currently logged-in admin (used for own-message labels)
  const currentAdminAlias =
    role === "admin" && user
      ? getAdminDisplayNameWithIcon(user.email || user.uid)
      : "";

  // Alias derived from the message senderId (email) — always reflects actual sender
  const getMessageAdminAlias = (msg: ThreadMessage) =>
    getAdminDisplayName(msg.senderId);

  useEffect(() => {
    if (!inquiryId || !user) return;

    try {
      // Subscribe to real-time messages
      const unsubscribe = subscribeToThreadMessages(
        inquiryId,
        (latestMessages) => {
          setMessages(latestMessages);
          setLoading(false);

          // Auto-mark as read for messages not from us
          // Always mark as read when messages change while the ChatBox is MOUNTED
          const unreadIds = latestMessages
            .filter((m) => !m.isRead && m.senderRole !== role)
            .map((m) => m.id as string)
            .filter(Boolean);

          if (unreadIds.length > 0) {
            const viewerName =
              role === "admin" && user.email
                ? getAdminDisplayNameWithIcon(user.email || user.uid)
                : undefined;
            markMessagesAsRead(
              inquiryId,
              role,
              user.email || user.uid || "SYSTEM",
              undefined,
              undefined,
              viewerName,
            ).catch(console.error);
          }
        },
      );

      return () => unsubscribe();
    } catch (err) {
      console.error("Error subscribing to thread:", err);
      setError("Failed to load messages.");
      setLoading(false);
    }
  }, [inquiryId, user, role]);

  const handleToggleReaction = async (
    messageId: string | undefined,
    emoji: string,
  ) => {
    if (!messageId || !user) return;
    try {
      await toggleReaction(messageId, emoji, user.email || user.uid);
    } catch (err) {
      console.error("Failed to toggle reaction", err);
    }
  };

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size
    if (file.size > CHAT_MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${CHAT_MAX_SIZE_MB} MB.`);
      e.target.value = "";
      return;
    }

    // Validate type
    const isImage = file.type.startsWith("image/");
    if (!isImage && !ALLOWED_MIME_TYPES.includes(file.type)) {
      setError(
        "Unsupported file type. Allowed: images, PDF, Word, Excel, PowerPoint, and text files.",
      );
      e.target.value = "";
      return;
    }

    setError(null);
    setPendingFile(file);
    e.target.value = "";
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = newMessage.trim().length > 0;
    const hasFile = !!pendingFile || pendingLinkedAttachments.length > 0;
    if ((!hasText && !hasFile) || !user) return;

    const messageContent =
      newMessage.trim() ||
      pendingFile?.name ||
      pendingLinkedAttachments[0]?.name ||
      "";
    setNewMessage("");
    setMentionMenu(null);
    const fileToSend = pendingFile;
    const linkedAttachmentsToSend = pendingLinkedAttachments;
    setPendingFile(null);
    setPendingLinkedAttachments([]);

    try {
      if (!user.email && !user.uid) {
        throw new Error("User identifier missing");
      }

      const senderDisplayName =
        role === "admin"
          ? getAdminDisplayNameWithIcon(user.email || user.uid)
          : clientName ||
            user.displayName ||
            user.email?.split("@")[0] ||
            "Client";

      // Upload file first if present
      let attachments:
        | { name: string; url: string; type: string }[]
        | undefined;
      attachments = linkedAttachmentsToSend;
      if (fileToSend) {
        setUploading(true);
        try {
          const url = await uploadFile(
            fileToSend,
            `chat-attachments/${inquiryId}`,
          );
          attachments = [
            ...linkedAttachmentsToSend,
            { name: fileToSend.name, url, type: fileToSend.type },
          ];
        } finally {
          setUploading(false);
        }
      }

      const selectedMentions =
        role === "admin"
          ? mentionedAdmins.filter((mention) =>
              messageContent.toLowerCase().includes(`@${mention.token.toLowerCase()}`),
            )
          : [];
      const messageId = await addThreadMessage({
        threadId: inquiryId,
        type: "text",
        content: messageContent || (fileToSend ? fileToSend.name : ""),
        senderId: user.email || user.uid,
        senderName: senderDisplayName,
        senderRole: role,
        isRead: false,
        ...(attachments ? { attachments } : {}),
        ...(selectedMentions.length > 0
          ? {
              mentions: selectedMentions,
              mentionedAdminEmails: selectedMentions.map(
                (mention) => mention.email,
              ),
            }
          : {}),
      } as Omit<ThreadMessage, "id" | "createdAt">);
      setMentionedAdmins([]);

      if (selectedMentions.length > 0) {
        try {
          await createAdminMentionNotifications({
            mentions: selectedMentions,
            senderEmail: user.email || user.uid,
            senderName: senderDisplayName,
            clientName: clientName || "",
            threadId: inquiryId,
            messageId,
            content: messageContent,
          });
        } catch (notificationError) {
          console.error(
            "Message was sent, but admin mention notifications failed:",
            notificationError,
          );
          toast.error("Message sent, but mention notification could not be delivered");
        }
      }

      // Trigger availability auto-reply only for client messages
      if (role === "client") {
        fetch("/api/chat/auto-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: inquiryId }),
        }).catch(() => {
          /* non-critical — ignore network errors */
        });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setError("Failed to send message. Please try again.");
      setNewMessage(messageContent);
      setMentionMenu(null);
      if (fileToSend) setPendingFile(fileToSend);
      setPendingLinkedAttachments(linkedAttachmentsToSend);
    }
  };

  const addChatResource = async (
    resourceId: "faqs" | "mode-of-payment",
  ) => {
    if (addingResource) return;
    setAddingResource(resourceId);
    try {
      const attachment =
        resourceId === "faqs"
          ? {
              name: "PGC Visayas FAQs",
              url: FAQ_URL,
              type: "text/html",
            }
          : {
              name: "Mode of Payment.pdf",
              url: await getDownloadURL(
                ref(storage, MODE_OF_PAYMENT_STORAGE_PATH),
              ),
              type: "application/pdf",
            };
      setPendingLinkedAttachments((current) =>
        current.some((item) => item.name === attachment.name)
          ? current
          : [...current, attachment],
      );
      toast.success(`${attachment.name} added to the message`);
    } catch (resourceError) {
      console.error(`Failed to add ${resourceId} to chat:`, resourceError);
      toast.error("Could not attach this resource");
    } finally {
      setAddingResource(null);
    }
  };

  const handleMessageChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    const value = event.target.value;
    const caret = event.target.selectionStart;
    setNewMessage(value);
    setMentionedAdmins((current) =>
      current.filter((mention) =>
        value.toLowerCase().includes(`@${mention.token.toLowerCase()}`),
      ),
    );

    if (role !== "admin") {
      setMentionMenu(null);
      return;
    }
    const beforeCaret = value.slice(0, caret);
    const tokenStart = beforeCaret.search(/\S+$/);
    const rawToken = tokenStart >= 0 ? beforeCaret.slice(tokenStart) : "";
    const tokenEnd = caret + (value.slice(caret).match(/^\S*/)?.[0].length ?? 0);
    const query = rawToken.startsWith("@")
      ? rawToken.slice(1)
      : rawToken;
    if (!query || query.length < 2 || !/^[a-zA-Z0-9._-]+$/.test(query)) {
      setMentionMenu(null);
      return;
    }
    setMentionMenu({
      start: tokenStart,
      end: tokenEnd,
      query,
    });
    setActiveMentionIndex(0);
  };

  const selectMention = (admin: Admin) => {
    if (!mentionMenu) return;
    const token = getMentionToken(admin, admins);
    const insertion = `@${token} `;
    const updatedMessage =
      newMessage.slice(0, mentionMenu.start) +
      insertion +
      newMessage.slice(mentionMenu.end);
    const nextCursor = mentionMenu.start + insertion.length;
    setNewMessage(updatedMessage);
    setMentionedAdmins((current) => [
      ...current.filter(
        (mention) => mention.email.toLowerCase() !== admin.email.toLowerCase(),
      ),
      { email: admin.email, name: admin.name, token },
    ]);
    setMentionMenu(null);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
      messageInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const handleUnsend = async (messageId: string) => {
    setPendingUnsendId(null);
    setUnsendingId(messageId);
    try {
      await unsendMessage(messageId);
    } catch (err) {
      console.error("Failed to unsend message:", err);
      setError("Failed to unsend message. Please try again.");
    } finally {
      setUnsendingId(null);
    }
  };

  const handleCopyMessage = async (event: React.MouseEvent, msg: ThreadMessage) => {
    event.stopPropagation();
    const attachmentNames =
      msg.attachments?.map((attachment) => attachment.name).join(", ") ?? "";
    const content = [msg.content, attachmentNames && `Attachments: ${attachmentNames}`]
      .filter(Boolean)
      .join("\n");

    if (!content) {
      toast.info("This message has no text or attachment names to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      toast.success("Message copied");
    } catch (copyError) {
      console.error("Failed to copy chat message:", copyError);
      toast.error("Failed to copy message");
    }
  };

  const handleDeleteAutoReply = async (messageId: string) => {
    setUnsendingId(messageId);
    try {
      await deleteThreadMessage(messageId);
    } catch (err) {
      console.error("Failed to delete automated notice:", err);
      setError("Failed to delete automated notice. Please try again.");
    } finally {
      setUnsendingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMenu && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveMentionIndex((index) => (index + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveMentionIndex(
          (index) =>
            (index - 1 + mentionSuggestions.length) % mentionSuggestions.length,
        );
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionMenu(null);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        selectMention(mentionSuggestions[activeMentionIndex] ?? mentionSuggestions[0]);
        return;
      }
    }
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      resourceSuggestions.length > 0
    ) {
      e.preventDefault();
      void addChatResource(resourceSuggestions[0].id);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = (e.currentTarget as any).form;
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const formatMessageTime = (msg: any) => {
    try {
      // Support for Firestore Timestamps which have toDate()
      if (msg && msg.createdAt) {
        if (typeof msg.createdAt.toDate === "function") {
          return format(msg.createdAt.toDate(), "MMM d, h:mm a");
        }
        return format(new Date(msg.createdAt), "MMM d, h:mm a");
      }
      return "Just now";
    } catch (e) {
      return "";
    }
  };

  if (!user) {
    return (
      <Card
        className={`w-full flex items-center justify-center bg-gray-50 border-gray-200 ${variant === "floating" ? "h-full border-none shadow-none" : "h-[500px]"}`}
      >
        <div className="text-center text-gray-500">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Please log in to view messages.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={`flex flex-col flex-1 relative ${variant === "floating" ? "h-full border-none shadow-none rounded-none" : "h-[500px] shadow-sm border-gray-200"}`}
    >
      {variant !== "floating" && (
        <CardHeader className="py-3 px-4 border-b bg-gray-50/50">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-gray-700">
            <MessageCircle className="w-4 h-4 text-blue-500" />
            Activity & Messages
          </CardTitle>
        </CardHeader>
      )}

      <CardContent className="flex-1 p-0 overflow-hidden relative bg-white">
        <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center items-center h-full text-sm text-gray-400">
              Loading conversation...
            </div>
          ) : error ? (
            <div className="flex flex-col justify-center items-center h-full text-center text-red-500 space-y-2">
              <AlertCircle className="w-8 h-8 opacity-50" />
              <p className="text-sm">{error}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-full text-center text-slate-500 space-y-3 px-6">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-2">
                <MessageCircle className="w-8 h-8 text-slate-200" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">
                  No messages yet.
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Have questions about your project? Send us a message and our
                  team will get back to you shortly.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const normalizedSenderId = normalizeIdentifier(msg.senderId);
              const senderUid = (msg as ThreadMessage & { senderUid?: string })
                .senderUid;
              const isOwnMessage =
                currentUserIdentifiers.has(normalizedSenderId) ||
                currentUserIdentifiers.has(normalizeIdentifier(senderUid));
              // Layout: client messages on the left, admin messages on the right.
              // When the admin panel is open, all admin messages (regardless of sender)
              // are right-aligned to distinguish the support team from the client.
              const isMe =
                role === "client"
                  ? msg.senderRole === "client"
                  : msg.senderRole === "admin";

              // Handle system messages dynamically
              if (msg.type === "system") {
                return (
                  <div key={msg.id || idx} className="flex justify-center my-4">
                    <span className="text-[11px] font-medium bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
                      {msg.content}
                    </span>
                  </div>
                );
              }

              // Auto-reply availability notice
              if (msg.type === "auto_reply") {
                const canDeleteAutoReply = role === "admin" && !!msg.id;
                return (
                  <div
                    key={msg.id || idx}
                    className="flex justify-start my-3 px-1"
                  >
                    <div className="flex gap-2.5 max-w-[90%]">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className="h-7 w-7 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center">
                          <Info className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                      </div>
                      <div className="flex-1 rounded-2xl rounded-tl-sm border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">
                            Automated Notice
                          </p>
                          {canDeleteAutoReply && (
                            <button
                              type="button"
                              onClick={() =>
                                msg.id && handleDeleteAutoReply(msg.id)
                              }
                              disabled={unsendingId === msg.id}
                              className="inline-flex items-center gap-1 text-[10px] text-amber-600 hover:text-red-600 transition-colors disabled:opacity-50"
                              title="Delete automated notice"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              {unsendingId === msg.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          )}
                        </div>
                        <p className="text-[13px] text-amber-900 whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>
                        <p className="text-[10px] text-amber-500 mt-1.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {formatMessageTime(msg)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // Unsent tombstone
              if (msg.unsent) {
                return (
                  <div
                    key={msg.id || idx}
                    className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}
                  >
                    <p className="text-xs italic text-slate-400 px-3 py-1.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                      {isMe ? "You unsent a message" : "Message was unsent"}
                    </p>
                  </div>
                );
              }

              // Deduplicate viewers by email for display
              const uniqueViewers = msg.viewedBy
                ? Array.from(
                    new Map(msg.viewedBy.map((v) => [v.email, v])).values(),
                  )
                : [];
              const isViewersExpanded = expandedViewersId === msg.id;
              // Only client messages shown to admin are clickable
              const isClickableForViewers =
                role === "admin" && msg.senderRole === "client" && !!msg.id;

              return (
                <div
                  key={msg.id || idx}
                  className={`flex flex-col w-full group ${isMe ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`flex flex-col max-w-[85%] ${isMe ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isMe ? (
                        /* Own/Admin messages: Name, Avatar, then time right-aligned */
                        <>
                          <span className="text-xs font-semibold text-gray-600">
                            {role === "admin" ? msg.senderName : "You"}
                          </span>
                          <Avatar className="h-4 w-4 border border-slate-100 bg-white">
                            <AvatarFallback className="bg-blue-50 text-[7px] font-bold text-blue-700">
                              {role === "admin"
                                ? "AD"
                                : getClientInitials(msg.senderName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[10px] text-gray-400 flex items-center gap-1 ml-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatMessageTime(msg)}
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            {msg.senderRole === "client" ? (
                              <Avatar className="h-4 w-4 border border-slate-100 bg-white">
                                <AvatarFallback className="bg-blue-50 text-[7px] font-bold text-blue-700">
                                  {getClientInitials(msg.senderName)}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[8px] h-3.5 py-0 px-1 bg-blue-50 text-blue-700 border-blue-200"
                              >
                                Admin
                              </Badge>
                            )}
                            <span className="text-xs font-semibold text-gray-600">
                              {msg.senderRole === "admin"
                                ? msg.senderName ||
                                  getAdminDisplayNameWithIcon(msg.senderId)
                                : msg.senderName}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 flex items-center gap-1 ml-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatMessageTime(msg)}
                          </span>
                        </>
                      )}
                      {!msg.unsent && (
                        <button
                          type="button"
                          onClick={(event) => handleCopyMessage(event, msg)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Copy message"
                          aria-label="Copy message"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Message bubble — clickable for admin to reveal who viewed it */}
                    <div
                      onClick={
                        isClickableForViewers
                          ? () =>
                              setExpandedViewersId(
                                isViewersExpanded ? null : (msg.id ?? null),
                              )
                          : undefined
                      }
                      className={`px-3.5 py-2.5 text-[14px] shadow-sm ${
                        isMe
                          ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm"
                          : "bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm border border-gray-100"
                      }${isClickableForViewers ? " cursor-pointer hover:brightness-95 transition-all select-none" : ""}`}
                    >
                      {msg.content && (
                        <p className="whitespace-pre-wrap leading-relaxed break-words">
                          {msg.content}
                        </p>
                      )}

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="space-y-1">
                          {msg.attachments.map((att, attIdx) => (
                            <AttachmentBubble
                              key={attIdx}
                              attachment={att}
                              isMe={isMe}
                            />
                          ))}
                        </div>
                      )}

                      {isMe && (
                        <div className="flex justify-end mt-1.5 -mb-0.5">
                          {msg.isRead ? (
                            <div className="flex items-center gap-1 group/seen bg-white/10 rounded-full px-1.5 py-0.5 ml-auto translate-x-1">
                              <CheckCheck
                                className="w-3 h-3 text-white"
                                strokeWidth={3}
                              />
                              <span className="text-[8px] font-bold text-white uppercase tracking-tighter">
                                Seen
                              </span>
                            </div>
                          ) : (
                            <Check
                              className="w-3 h-3 text-white/50 ml-auto"
                              strokeWidth={3}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Viewer list — shown on click, admin role only */}
                    {isClickableForViewers && (
                      <div
                        className={`overflow-hidden transition-all duration-200 ${
                          isViewersExpanded
                            ? "max-h-24 opacity-100 mt-1.5"
                            : "max-h-0 opacity-0"
                        }`}
                      >
                        {uniqueViewers.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mr-0.5">
                              Seen by
                            </span>
                            {uniqueViewers.map((v) => (
                              <span
                                key={v.email}
                                title={v.email}
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"
                              >
                                <span className="h-3.5 w-3.5 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-[7px] font-bold flex-shrink-0">
                                  {v.name.charAt(0).toUpperCase()}
                                </span>
                                {v.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">
                            Not yet viewed by any admin
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Unsend button — visible on hover for own messages only, within 24 hours */}
                  {(isOwnMessage ||
                    (isSuperAdmin && msg.senderRole === "admin")) &&
                    !msg.unsent &&
                    (() => {
                      const sentAt = msg.createdAt?.toDate
                        ? msg.createdAt.toDate()
                        : new Date((msg.createdAt as any) ?? 0);
                      const within24h =
                        Date.now() - sentAt.getTime() < 24 * 60 * 60 * 1000;
                      return within24h ? (
                        <button
                          type="button"
                          onClick={() => msg.id && setPendingUnsendId(msg.id)}
                          disabled={unsendingId === msg.id}
                          className="invisible group-hover:visible flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-500 transition-colors mt-0.5 cursor-pointer disabled:opacity-50"
                          title="Unsend message"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          {unsendingId === msg.id ? "Unsending…" : "Unsend"}
                        </button>
                      ) : null;
                    })()}
                </div>
              );
            })
          )}
        </div>
      </CardContent>

      <CardFooter className="p-3 bg-white border-t rounded-b-lg">
        <div className="relative flex w-full flex-col gap-2">
          {/* Pending file preview */}
          {pendingFile && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100">
              {pendingFile.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={URL.createObjectURL(pendingFile)}
                  alt={pendingFile.name}
                  className="h-10 w-10 rounded object-cover border border-blue-200 flex-shrink-0"
                />
              ) : (
                (() => {
                  const PendingIcon = getFileIcon(pendingFile.type);
                  return (
                    <PendingIcon className="h-8 w-8 text-blue-500 flex-shrink-0" />
                  );
                })()
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">
                  {pendingFile.name}
                </p>
                <p className="text-[10px] text-slate-500">
                  {(pendingFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-400 hover:text-slate-600 flex-shrink-0"
                onClick={() => setPendingFile(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {pendingLinkedAttachments.map((attachment) => (
            <div
              key={attachment.name}
              className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2"
            >
              {attachment.type === "text/html" ? (
                <ExternalLink className="h-5 w-5 flex-shrink-0 text-blue-600" />
              ) : (
                <FileText className="h-5 w-5 flex-shrink-0 text-blue-600" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                {attachment.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0 text-slate-400 hover:text-slate-600"
                onClick={() =>
                  setPendingLinkedAttachments((current) =>
                    current.filter((item) => item.name !== attachment.name),
                  )
                }
                aria-label={`Remove ${attachment.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {resourceSuggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Suggested chat resources"
              className="absolute bottom-14 left-12 right-0 z-30 w-auto max-w-lg rounded-lg border-2 border-blue-400 bg-blue-50 p-2 shadow-lg ring-2 ring-blue-100"
            >
              <p className="px-2 pb-2 text-xs font-semibold text-blue-800">
                Add this resource to the conversation
              </p>
              {resourceSuggestions.map((resource) => (
                <button
                  key={resource.id}
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    void addChatResource(
                      resource.id,
                    )
                  }
                  aria-selected={false}
                  disabled={addingResource !== null}
                  className="flex w-full min-w-0 items-center gap-3 rounded-md border border-blue-300 bg-white px-3 py-2.5 text-left text-blue-900 shadow-sm transition-colors hover:border-blue-500 hover:bg-blue-100 disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100">
                    {resource.type === "text/html" ? (
                      <ExternalLink className="h-4 w-4 text-blue-700" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-700" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold">
                      {resource.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      Press Enter to attach
                    </span>
                  </span>
                  <kbd className="shrink-0 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                    Enter ↵
                  </kbd>
                  {addingResource === resource.id && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </button>
              ))}
            </div>
          )}
          {mentionMenu && mentionSuggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Admin suggestions"
              className="absolute bottom-14 left-12 z-30 max-h-56 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
            >
              {mentionSuggestions.map((admin, index) => {
                const token = getMentionToken(admin, admins);
                return (
                  <button
                    key={admin.email}
                    type="button"
                    role="option"
                    aria-selected={index === activeMentionIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectMention(admin)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left ${
                      index === activeMentionIndex
                        ? "bg-blue-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {getAdminDisplayName(admin.email)}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {admin.name ? `${admin.name} · ${admin.email}` : admin.email}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-blue-700">
                      @{token}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <form
            onSubmit={handleSendMessage}
            className="flex w-full gap-2 items-end"
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={handleFileChange}
            />
            {/* Attach file button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading || loading}
              onClick={() => fileInputRef.current?.click()}
              className="h-10 w-10 flex-shrink-0 mb-1 text-slate-400 hover:text-slate-600 transition-colors"
              title="Attach file (images, PDF, Word, Excel, PowerPoint)"
            >
              <Paperclip className="w-5 h-5" />
            </Button>
            <div className="flex-1 relative flex items-end">
              <TextareaAutosize
                ref={messageInputRef}
                placeholder={
                  role === "admin" ? "Message client..." : "Message admin..."
                }
                value={newMessage}
                disabled={loading || uploading}
                onChange={handleMessageChange}
                onKeyDown={handleKeyDown}
                minRows={1}
                maxRows={10}
                className="flex-1 w-full rounded-xl pl-4 pr-10 py-3 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none overflow-hidden text-sm transition-all"
              />
              <div className="absolute right-2 bottom-2.5">
                <EmojiPicker
                  onEmojiSelect={(emoji) =>
                    setNewMessage((prev) => prev + emoji)
                  }
                />
              </div>
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={
                (!newMessage.trim() &&
                  !pendingFile &&
                  pendingLinkedAttachments.length === 0) ||
                loading ||
                uploading
              }
              className="rounded-full bg-blue-600 hover:bg-blue-700 transition-colors h-10 w-10 flex-shrink-0 mb-1"
            >
              {uploading ? (
                <Loader2 className="w-[18px] h-[18px] animate-spin" />
              ) : (
                <Send className="w-[18px] h-[18px] ml-0.5" />
              )}
            </Button>
          </form>
        </div>
      </CardFooter>
      <AlertDialog
        open={pendingUnsendId !== null}
        onOpenChange={(open) => {
          if (!open && !unsendingId) setPendingUnsendId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {role === "client" ? "Delete your message?" : "Unsend this message?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {role === "client"
                ? "This will delete your message and any attached files from the chat. This action cannot be undone."
                : "This will remove the message and its attachments from the chat. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unsendingId !== null}>
              Keep message
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingUnsendId || unsendingId !== null}
              onClick={(event) => {
                event.preventDefault();
                if (pendingUnsendId) void handleUnsend(pendingUnsendId);
              }}
            >
              Unsend message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
