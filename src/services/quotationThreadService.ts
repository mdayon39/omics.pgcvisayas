/**
 * Quotation Thread Service
 *
 * Manages the entire lifecycle of quotations from inquiry to approval,
 * including communication between admin and client.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  addDoc,
  writeBatch,
  deleteDoc,
  deleteField,
  runTransaction,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import {
  QuotationThread,
  QuotationVersion,
  ThreadMessage,
  InquiryStatus,
  QuotationStatus,
  MessageSenderRole,
  MessageType,
  QuotationGenerationRequest,
  QuotationItem,
} from "@/types/QuotationThread";

const THREADS_COLLECTION = "quotationThreads";
const MESSAGES_COLLECTION = "threadMessages";
const QUOTATIONS_COLLECTION = "quotations";

async function triggerPushNotify(
  threadId: string,
  senderRole: MessageSenderRole,
  content: string,
  unreadCount: number,
): Promise<void> {
  try {
    await fetch("/api/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId,
        senderRole,
        messagePreview: content,
        unreadCount,
      }),
    });
  } catch (error) {
    // Push should not break chat flow.
    console.error("Push notify trigger failed:", error);
  }
}

/**
 * Initialize a quotation thread when an inquiry is submitted
 */
export async function initializeQuotationThread(
  inquiryId: string,
): Promise<string> {
  try {
    // Get inquiry data
    const inquiryRef = doc(db, "inquiries", inquiryId);
    const inquirySnap = await getDoc(inquiryRef);

    if (!inquirySnap.exists()) {
      throw new Error("Inquiry not found");
    }

    const inquiryData = inquirySnap.data();

    // Check if thread already exists
    const threadRef = doc(db, THREADS_COLLECTION, inquiryId);
    const threadSnap = await getDoc(threadRef);

    if (threadSnap.exists()) {
      return inquiryId; // Thread already exists
    }

    // Create new thread
    const thread: Omit<QuotationThread, "id"> = {
      inquiryId,
      clientEmail: inquiryData.email || "",
      clientName: inquiryData.name || "",
      clientAffiliation: inquiryData.affiliation || "",
      status: "pending",
      quotations: [],
      unreadCount: {
        admin: 0,
        client: 0,
      },
      adminTextMessageCount: 0,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };

    await setDoc(threadRef, thread);

    // Create initial system message
    await addThreadMessage({
      threadId: inquiryId,
      type: "system",
      content: "Inquiry submitted. Waiting for admin review.",
      senderId: "system",
      senderName: "System",
      senderRole: "admin",
      isRead: false,
    });

    return inquiryId;
  } catch (error) {
    console.error("Error initializing quotation thread:", error);
    throw error;
  }
}

/**
 * Get a quotation thread by ID
 */
export async function getQuotationThread(
  threadId: string,
): Promise<QuotationThread | null> {
  try {
    const threadRef = doc(db, THREADS_COLLECTION, threadId);
    const threadSnap = await getDoc(threadRef);

    if (!threadSnap.exists()) {
      return null;
    }

    return { id: threadSnap.id, ...threadSnap.data() } as QuotationThread;
  } catch (error) {
    console.error("Error getting quotation thread:", error);
    throw error;
  }
}

/**
 * Get all quotation threads (for admin dashboard)
 */
export async function getAllQuotationThreads(
  statusFilter?: InquiryStatus[],
): Promise<QuotationThread[]> {
  try {
    const threadsRef = collection(db, THREADS_COLLECTION);
    let q = query(threadsRef, orderBy("updatedAt", "desc"));

    if (statusFilter && statusFilter.length > 0) {
      q = query(
        threadsRef,
        where("status", "in", statusFilter),
        orderBy("updatedAt", "desc"),
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as QuotationThread,
    );
  } catch (error) {
    console.error("Error getting quotation threads:", error);
    throw error;
  }
}

/**
 * Get threads assigned to a specific admin
 */
export async function getAdminAssignedThreads(
  adminEmail: string,
): Promise<QuotationThread[]> {
  try {
    const threadsRef = collection(db, THREADS_COLLECTION);
    const q = query(
      threadsRef,
      where("assignedTo", "==", adminEmail),
      orderBy("updatedAt", "desc"),
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as QuotationThread,
    );
  } catch (error) {
    console.error("Error getting admin assigned threads:", error);
    throw error;
  }
}

/**
 * Subscribe to all threads where admin has unread messages (real-time, single query).
 * Efficient: Firestore only returns documents where unreadCount.admin > 0.
 */
export function subscribeToAllAdminUnreadCounts(
  callback: (
    unreadThreads: {
      inquiryId: string;
      clientName: string;
      unreadCount: number;
    }[],
  ) => void,
): () => void {
  const threadsRef = collection(db, THREADS_COLLECTION);
  const q = query(threadsRef, where("unreadCount.admin", ">", 0));

  return onSnapshot(q, (snapshot) => {
    const unreadThreads = snapshot.docs.map((docSnap) => ({
      inquiryId: docSnap.id,
      clientName: (docSnap.data().clientName || "Unknown") as string,
      unreadCount: (docSnap.data().unreadCount?.admin || 0) as number,
    }));
    callback(unreadThreads);
  });
}

/**
 * Subscribe to quotation thread updates (real-time)
 */
export function subscribeToQuotationThread(
  threadId: string,
  callback: (thread: QuotationThread | null) => void,
): () => void {
  const threadRef = doc(db, THREADS_COLLECTION, threadId);

  return onSnapshot(threadRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() } as QuotationThread);
    } else {
      callback(null);
    }
  });
}

/**
 * Update thread status
 */
export async function updateThreadStatus(
  threadId: string,
  status: InquiryStatus,
  adminEmail?: string,
): Promise<void> {
  try {
    const threadRef = doc(db, THREADS_COLLECTION, threadId);
    await updateDoc(threadRef, {
      status,
      updatedAt: serverTimestamp(),
    });

    // Add system message
    const statusMessages: Record<InquiryStatus, string> = {
      pending: "Inquiry is pending review",
      under_review: "Admin is reviewing your inquiry",
      quoted: "Quotation has been sent",
      negotiating: "Quotation is under discussion",
      approved: "Quotation has been approved",
      rejected: "Inquiry has been closed",
      converted: "Inquiry has been converted to a project",
    };

    await addThreadMessage({
      threadId,
      type: "system",
      content: statusMessages[status],
      senderId: adminEmail || "system",
      senderName: "System",
      senderRole: "admin",
      isRead: false,
    });
  } catch (error) {
    console.error("Error updating thread status:", error);
    throw error;
  }
}

/**
 * Assign thread to admin
 */
export async function assignThreadToAdmin(
  threadId: string,
  adminEmail: string,
  adminName: string,
): Promise<void> {
  try {
    const threadRef = doc(db, THREADS_COLLECTION, threadId);
    await updateDoc(threadRef, {
      assignedTo: adminEmail,
      assignedToName: adminName,
      updatedAt: serverTimestamp(),
    });

    await addThreadMessage({
      threadId,
      type: "system",
      content: `Inquiry assigned to ${adminName}`,
      senderId: adminEmail,
      senderName: "System",
      senderRole: "admin",
      isRead: false,
    });
  } catch (error) {
    console.error("Error assigning thread:", error);
    throw error;
  }
}

/**
 * Generate a quotation number
 */
function generateQuotationNumber(inquiryId: string, version: number): string {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const shortId = inquiryId.substring(0, 8).toUpperCase();
  return `QUO-${year}${month}-${shortId}-V${version}`;
}

/**
 * Calculate quotation totals
 */
function calculateQuotationTotals(
  items: QuotationItem[],
  discount?: number,
  discountPercentage?: number,
  tax?: number,
  taxPercentage?: number,
) {
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  let discountAmount = discount || 0;
  if (discountPercentage) {
    discountAmount = subtotal * (discountPercentage / 100);
  }

  const afterDiscount = subtotal - discountAmount;

  let taxAmount = tax || 0;
  if (taxPercentage) {
    taxAmount = afterDiscount * (taxPercentage / 100);
  }

  const totalAmount = afterDiscount + taxAmount;

  return {
    subtotal,
    discount: discountAmount,
    tax: taxAmount,
    totalAmount,
  };
}

/**
 * Create a new quotation version
 */
export async function createQuotationVersion(
  request: QuotationGenerationRequest,
  adminEmail: string,
  adminName: string,
): Promise<QuotationVersion> {
  try {
    const thread = await getQuotationThread(request.inquiryId);
    if (!thread) {
      throw new Error("Quotation thread not found");
    }

    const version = (thread.currentQuotationVersion || 0) + 1;
    const quotationNumber = generateQuotationNumber(request.inquiryId, version);

    // Add IDs and calculate subtotals for items
    const items: QuotationItem[] = request.items.map((item, index) => ({
      ...item,
      id: `item-${Date.now()}-${index}`,
      subtotal: item.quantity * item.unitPrice,
    }));

    // Calculate totals
    const totals = calculateQuotationTotals(
      items,
      request.discount,
      request.discountPercentage,
      request.tax,
      request.taxPercentage,
    );

    // Calculate validity date
    const validityDays = request.validityDays || 30;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validityDays);

    // Create quotation version
    const quotation: Omit<QuotationVersion, "id"> = {
      version,
      inquiryId: request.inquiryId,
      quotationNumber,
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      discountPercentage: request.discountPercentage,
      tax: totals.tax,
      taxPercentage: request.taxPercentage,
      totalAmount: totals.totalAmount,
      status: "draft",
      createdBy: adminEmail,
      createdByName: adminName,
      notes: request.notes,
      termsAndConditions: request.termsAndConditions,
      validUntil: Timestamp.fromDate(validUntil),
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
    };

    // Save quotation
    const quotationRef = await addDoc(
      collection(db, QUOTATIONS_COLLECTION),
      quotation,
    );
    const quotationId = quotationRef.id;

    // Update thread
    const threadRef = doc(db, THREADS_COLLECTION, request.inquiryId);
    await updateDoc(threadRef, {
      currentQuotationVersion: version,
      [`quotations`]: [...thread.quotations, { ...quotation, id: quotationId }],
      updatedAt: serverTimestamp(),
    });

    return { id: quotationId, ...quotation } as QuotationVersion;
  } catch (error) {
    console.error("Error creating quotation version:", error);
    throw error;
  }
}

/**
 * Send quotation to client
 */
export async function sendQuotationToClient(
  threadId: string,
  quotationId: string,
  adminEmail: string,
  adminName: string,
  message?: string,
): Promise<void> {
  try {
    // Update quotation status
    const quotationRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    await updateDoc(quotationRef, {
      status: "sent",
      sentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update thread status
    const thread = await getQuotationThread(threadId);
    const newStatus: InquiryStatus =
      thread?.status === "pending" ? "quoted" : "negotiating";
    await updateThreadStatus(threadId, newStatus);

    // Add message
    const content =
      message || `Quotation ${quotationId} has been sent for your review.`;
    await addThreadMessage({
      threadId,
      type: "quotation",
      content,
      senderId: adminEmail,
      senderName: adminName,
      senderRole: "admin",
      isRead: false,
      quotationVersion: thread?.currentQuotationVersion,
    });

    // Increment unread count for client
    const threadRef = doc(db, THREADS_COLLECTION, threadId);
    await updateDoc(threadRef, {
      "unreadCount.client": (thread?.unreadCount.client || 0) + 1,
      lastMessageAt: serverTimestamp(),
      lastMessageBy: adminEmail,
      lastMessageByName: adminName,
      lastMessageByRole: "admin",
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error sending quotation to client:", error);
    throw error;
  }
}

/**
 * Add a message to thread
 */
export async function addThreadMessage(
  message: Omit<ThreadMessage, "id" | "createdAt">,
): Promise<string> {
  try {
    const messageData = {
      ...message,
      createdAt: serverTimestamp(),
    };

    const messageRef = await addDoc(
      collection(db, MESSAGES_COLLECTION),
      messageData,
    );

    // Ensure the quotationThreads document exists — auto-create if missing.
    // This handles existing inquiries that were created before thread initialization
    // was part of the inquiry submission flow.
    const threadRef = doc(db, THREADS_COLLECTION, message.threadId);
    let thread = await getQuotationThread(message.threadId);

    if (!thread) {
      // Fetch inquiry data to populate the thread
      const inquirySnap = await getDoc(doc(db, "inquiries", message.threadId));
      const inquiryData = inquirySnap.exists() ? inquirySnap.data() : {};

      const newThreadData = {
        inquiryId: message.threadId,
        clientEmail: inquiryData.email || "",
        clientName: inquiryData.name || "",
        clientAffiliation: inquiryData.affiliation || "",
        status: "pending" as InquiryStatus,
        quotations: [],
        unreadCount: { admin: 0, client: 0 },
        adminTextMessageCount: 0,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      };
      await setDoc(threadRef, newThreadData);
      thread = { id: message.threadId, ...newThreadData };
    }

    const unreadCountUpdate =
      message.senderRole === "admin"
        ? { "unreadCount.client": (thread.unreadCount.client || 0) + 1 }
        : {
            "unreadCount.admin": (thread.unreadCount.admin || 0) + 1,
            dismissedByAdmin: false, // Reset dismissed flag when client sends a new message
          };

    const finalUpdate = {
      ...unreadCountUpdate,
      lastMessageAt: serverTimestamp(),
      lastMessageBy: message.senderId,
      lastMessageByName: message.senderName,
      lastMessageByRole: message.senderRole,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(threadRef, finalUpdate);

    let shouldNotifyClient = false;
    if (message.senderRole === "admin" && message.type === "text") {
      try {
        await runTransaction(db, async (tx) => {
          const threadSnap = await tx.get(threadRef);
          if (!threadSnap.exists()) return;
          const data = threadSnap.data() as {
            adminTextMessageCount?: number;
            firstAdminChatEmailSent?: boolean;
          };
          const currentCount =
            typeof data.adminTextMessageCount === "number"
              ? data.adminTextMessageCount
              : 0;
          // Use a dedicated flag so legacy threads (where the automated welcome message
          // wrongly incremented adminTextMessageCount before the system-type fix) also
          // receive the notification on the admin's first real human message.
          shouldNotifyClient = data.firstAdminChatEmailSent !== true;
          tx.update(threadRef, {
            adminTextMessageCount: currentCount + 1,
            ...(shouldNotifyClient ? { firstAdminChatEmailSent: true } : {}),
          });
        });
      } catch (error) {
        console.error("Error updating admin message count:", error);
      }
    }

    // Denormalize message state onto the inquiries document for efficient table display
    const inquiryRef = doc(db, "inquiries", message.threadId);
    if (message.senderRole === "client") {
      const newUnread = (thread.unreadCount.admin || 0) + 1;
      await updateDoc(inquiryRef, {
        messageState: "has_unread",
        unreadMessageCount: newUnread,
        dismissedByAdmin: false, // Also reset on inquiry if stored there
      }).catch((err) => {
        console.error("Error updating inquiry messageState (client):", err);
      });
    } else {
      // Admin sent — only change to admin_only if there are no unread client messages
      const adminUnread = thread.unreadCount.admin || 0;
      if (adminUnread === 0) {
        await updateDoc(inquiryRef, {
          messageState: "admin_only",
          unreadMessageCount: 0,
        }).catch((err) => {
          console.error("Error updating inquiry messageState (admin):", err);
        });
      }
    }

    if (message.type !== "system") {
      const targetUnreadCount =
        message.senderRole === "admin"
          ? (thread.unreadCount.client || 0) + 1
          : (thread.unreadCount.admin || 0) + 1;

      await triggerPushNotify(
        message.threadId,
        message.senderRole,
        message.content,
        targetUnreadCount,
      );
    }

    if (shouldNotifyClient) {
      try {
        await fetch("/api/chat/notify-first-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: message.threadId,
            adminName: message.senderName,
          }),
        });
      } catch (error) {
        console.error("Failed to send first admin chat email:", error);
      }
    }

    return messageRef.id;
  } catch (error) {
    console.error("Error adding thread message:", error);
    throw error;
  }
}

/**
 * Toggle a reaction for a given message.
 * If user already reacted with the emoji, remove their reaction; otherwise add it.
 */
export async function toggleReaction(
  messageId: string,
  emoji: string,
  userId: string,
): Promise<void> {
  try {
    const msgRef = doc(db, MESSAGES_COLLECTION, messageId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(msgRef);
      if (!snap.exists()) throw new Error("Message not found");

      const data = snap.data() as any;
      const reactions = (data.reactions && data.reactions[emoji]) || [];
      const hasReacted = reactions.includes(userId);

      if (hasReacted) {
        tx.update(msgRef, {
          [`reactions.${emoji}`]: arrayRemove(userId),
        });
      } else {
        tx.update(msgRef, {
          [`reactions.${emoji}`]: arrayUnion(userId),
        });
      }
    });
  } catch (error) {
    console.error("Error toggling reaction:", error);
    throw error;
  }
}

/**
 * Get thread messages
 */
export async function getThreadMessages(
  threadId: string,
): Promise<ThreadMessage[]> {
  try {
    const messagesRef = collection(db, MESSAGES_COLLECTION);
    const q = query(
      messagesRef,
      where("threadId", "==", threadId),
      // orderBy("createdAt", "asc")
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as ThreadMessage,
    );
  } catch (error) {
    console.error("Error getting thread messages:", error);
    throw error;
  }
}

/**
 * Subscribe to thread messages (real-time)
 */
export function subscribeToThreadMessages(
  threadId: string,
  callback: (messages: ThreadMessage[]) => void,
): () => void {
  const messagesRef = collection(db, MESSAGES_COLLECTION);
  const q = query(
    messagesRef,
    where("threadId", "==", threadId),
    // orderBy("createdAt", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as ThreadMessage,
    );
    messages.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeA - timeB;
    });
    callback(messages);
  });
}

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  threadId: string,
  userRole: MessageSenderRole,
  userEmail: string,
  senderId?: string,
  senderName?: string,
  viewerDisplayName?: string,
): Promise<void> {
  try {
    const thread = await getQuotationThread(threadId);
    if (!thread) return;

    // Reset unread count for the CURRENT user role
    const threadRef = doc(db, THREADS_COLLECTION, threadId);
    const unreadCountUpdate =
      userRole === "admin"
        ? { "unreadCount.admin": 0 }
        : { "unreadCount.client": 0 };

    await updateDoc(threadRef, unreadCountUpdate);

    // Mark individual messages as read IF they were sent by the OTHER party
    const messages = await getThreadMessages(threadId);
    const batch = writeBatch(db);

    messages.forEach((msg) => {
      // Logic for marking as read:
      // 1. Message must be currently unread
      // 2. Message must NOT be from current user's role
      // 3. Optional: Filter by specific sender (id/name)
      const isFromOtherParty = msg.senderRole !== userRole;
      const isUnread = !msg.isRead;

      let shouldMark = isUnread && isFromOtherParty;

      // If specific sender filter provided, apply it to the OTHER party's messages
      if (shouldMark && (senderId || senderName)) {
        const matchesId = senderId ? msg.senderId === senderId : true;
        const matchesName = senderName ? msg.senderName === senderName : true;
        shouldMark = matchesId && matchesName;
      }

      if (shouldMark && msg.id) {
        const msgRef = doc(db, MESSAGES_COLLECTION, msg.id);
        const updatePayload: Record<string, unknown> = {
          isRead: true,
          readAt: serverTimestamp(),
          readBy: userEmail,
        };
        // Track which admins viewed each client message
        if (userRole === "admin" && msg.senderRole === "client") {
          updatePayload.viewedBy = arrayUnion({
            name: viewerDisplayName || userEmail,
            email: userEmail,
          });
        }
        batch.update(msgRef, updatePayload);
      }
    });

    await batch.commit();

    // Denormalize message state onto the inquiries document
    // After admin reads, determine the resulting state:
    // - If no messages at all -> none
    // - If no client messages exist at all → admin_only
    // - If there were client messages and admin just read them → all_read
    const hasClientMessages = messages.some((m) => m.senderRole === "client");
    const hasAdminMessages = messages.some((m) => m.senderRole === "admin");
    let newState: "none" | "admin_only" | "all_read" = "none";

    if (hasClientMessages) {
      newState = "all_read";
    } else if (hasAdminMessages) {
      newState = "admin_only";
    }

    const inquiryRef = doc(db, "inquiries", threadId);
    await updateDoc(inquiryRef, {
      messageState: newState,
      unreadMessageCount: 0,
    }).catch((err) => {
      console.error("Error updating inquiry messageState (markRead):", err);
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    throw error;
  }
}

/**
 * Mark the latest seen client message as unseen for admins.
 * This is useful when an admin wants to re-flag a thread for follow-up.
 */
export async function markLatestClientMessageAsUnseen(
  threadId: string,
): Promise<number> {
  try {
    const thread = await getQuotationThread(threadId);
    if (!thread) return 0;

    const messages = await getThreadMessages(threadId);
    const latestSeenClientMessage = messages
      .filter((m) => m.senderRole === "client" && m.isRead)
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      })[0];

    if (!latestSeenClientMessage?.id) {
      return 0;
    }

    const messageRef = doc(db, MESSAGES_COLLECTION, latestSeenClientMessage.id);
    await updateDoc(messageRef, {
      isRead: false,
      readAt: deleteField(),
      readBy: deleteField(),
    });

    const currentlyUnreadClientMessages = messages.filter(
      (m) => m.senderRole === "client" && !m.isRead,
    ).length;
    const nextUnreadCount = currentlyUnreadClientMessages + 1;

    const threadRef = doc(db, THREADS_COLLECTION, threadId);
    await updateDoc(threadRef, {
      "unreadCount.admin": nextUnreadCount,
      updatedAt: serverTimestamp(),
    });

    const inquiryRef = doc(db, "inquiries", threadId);
    await updateDoc(inquiryRef, {
      messageState: "has_unread",
      unreadMessageCount: nextUnreadCount,
    }).catch((err) => {
      console.error("Error updating inquiry messageState (markUnseen):", err);
    });

    return nextUnreadCount;
  } catch (error) {
    console.error("Error marking latest client message as unseen:", error);
    throw error;
  }
}

/**
 * Manually dismiss a thread from the admin's notification list.
 * This sets the admin unread count to 0 and marks the thread as dismissed.
 */
export async function dismissThreadNotification(
  inquiryId: string,
): Promise<void> {
  try {
    const threadRef = doc(db, THREADS_COLLECTION, inquiryId);

    // Clear the unread count and add a dismissed flag
    await updateDoc(threadRef, {
      "unreadCount.admin": 0,
      dismissedByAdmin: true,
      updatedAt: serverTimestamp(),
    });

    // Also update denormalized inquiry state
    const inquiryRef = doc(db, "inquiries", inquiryId);
    await updateDoc(inquiryRef, {
      unreadMessageCount: 0,
      messageState: "all_read",
    }).catch((err) => {
      console.error("Error updating inquiry state on dismiss:", err);
    });
  } catch (error) {
    console.error("Error dismissing thread notification:", error);
    throw error;
  }
}

/**
 * Client approves quotation
 */
export async function approveQuotation(
  threadId: string,
  quotationId: string,
  clientEmail: string,
  clientName: string,
): Promise<void> {
  try {
    // Update quotation
    const quotationRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    await updateDoc(quotationRef, {
      status: "approved",
      approvedAt: serverTimestamp(),
      approvedBy: clientEmail,
      updatedAt: serverTimestamp(),
    });

    // Update thread
    await updateThreadStatus(threadId, "approved");

    // Add message
    await addThreadMessage({
      threadId,
      type: "approval",
      content: "Quotation has been approved by the client.",
      senderId: clientEmail,
      senderName: clientName,
      senderRole: "client",
      isRead: false,
    });
  } catch (error) {
    console.error("Error approving quotation:", error);
    throw error;
  }
}

/**
 * Client requests revision
 */
export async function requestQuotationRevision(
  threadId: string,
  quotationId: string,
  revisionNotes: string,
  clientEmail: string,
  clientName: string,
): Promise<void> {
  try {
    // Update quotation
    const quotationRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    await updateDoc(quotationRef, {
      status: "revised",
      updatedAt: serverTimestamp(),
    });

    // Update thread
    await updateThreadStatus(threadId, "negotiating");

    // Add message
    await addThreadMessage({
      threadId,
      type: "revision_request",
      content: revisionNotes,
      senderId: clientEmail,
      senderName: clientName,
      senderRole: "client",
      isRead: false,
    });
  } catch (error) {
    console.error("Error requesting quotation revision:", error);
    throw error;
  }
}

/**
 * Extracts a storage path from a full download URL.
 */
function extractStoragePath(url: string): string | null {
  try {
    const decodedUrl = decodeURIComponent(url);
    const match = decodedUrl.match(/\/o\/(.*?)\?/);
    return match ? match[1] : null;
  } catch (e) {
    console.error("Failed to parse storage URL:", e);
    return null;
  }
}

/**
 * Soft-delete a message by marking it as unsent.
 * Clears the content and sets unsent=true so UIs can show a tombstone.
 * Physical files associated with this message are deleted from Storage.
 */
export async function unsendMessage(messageId: string): Promise<void> {
  const msgRef = doc(db, MESSAGES_COLLECTION, messageId);
  const snap = await getDoc(msgRef);

  if (snap.exists()) {
    const data = snap.data() as ThreadMessage;

    // Remove any actual files from storage
    if (data.attachments && data.attachments.length > 0) {
      for (const attachment of data.attachments) {
        const path = extractStoragePath(attachment.url);
        if (path) {
          try {
            const storageRef = ref(storage, path);
            await deleteObject(storageRef);
          } catch (error: any) {
            // Ignore if file was already deleted or doesn't exist
            if (error.code !== "storage/object-not-found") {
              console.error(
                `Failed to delete storage object at ${path}:`,
                error,
              );
            }
          }
        }
      }
    }

    // Mark as unsent and clear content and attachments array
    await updateDoc(msgRef, {
      unsent: true,
      content: "",
      attachments: [],
    });
  }
}

/**
 * Permanently delete a message document.
 * Used for system-generated automated notices that should disappear entirely.
 */
export async function deleteThreadMessage(messageId: string): Promise<void> {
  const msgRef = doc(db, MESSAGES_COLLECTION, messageId);
  const snap = await getDoc(msgRef);

  if (!snap.exists()) {
    return;
  }

  const data = snap.data() as ThreadMessage;

  if (data.attachments && data.attachments.length > 0) {
    for (const attachment of data.attachments) {
      const path = extractStoragePath(attachment.url);
      if (path) {
        try {
          const storageRef = ref(storage, path);
          await deleteObject(storageRef);
        } catch (error: any) {
          if (error.code !== "storage/object-not-found") {
            console.error(`Failed to delete storage object at ${path}:`, error);
          }
        }
      }
    }
  }

  await deleteDoc(msgRef);
}
