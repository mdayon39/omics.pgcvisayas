import {
  collection,
  doc,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Query,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const NOTIFICATIONS_COLLECTION = "adminMentionNotifications";

export interface AdminMentionNotification {
  id: string;
  recipientEmail: string;
  threadId: string;
  messageId: string;
  senderName: string;
  clientName: string;
  contentPreview: string;
  read: boolean;
  createdAt?: Timestamp;
}

export async function createAdminMentionNotifications(input: {
  mentions: { email: string }[];
  senderEmail: string;
  senderName: string;
  clientName: string;
  threadId: string;
  messageId: string;
  content: string;
}): Promise<void> {
  const recipients = [
    ...new Set(
      input.mentions
        .map((mention) => mention.email.trim().toLowerCase())
        .filter((email) => email && email !== input.senderEmail.toLowerCase()),
    ),
  ];
  if (recipients.length === 0) return;

  const batch = writeBatch(db);
  for (const recipientEmail of recipients) {
    const notificationRef = doc(collection(db, NOTIFICATIONS_COLLECTION));
    batch.set(notificationRef, {
      recipientEmail,
      threadId: input.threadId,
      messageId: input.messageId,
      senderEmail: input.senderEmail,
      senderName: input.senderName,
      clientName: input.clientName,
      contentPreview: input.content.trim().slice(0, 160),
      read: false,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export function getAdminMentionNotificationsQuery(email: string): Query {
  return query(
    collection(db, NOTIFICATIONS_COLLECTION),
    where("recipientEmail", "==", email.toLowerCase()),
  );
}

export async function markAdminMentionNotificationRead(
  notificationId: string,
): Promise<void> {
  await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
}
