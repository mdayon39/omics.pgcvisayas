"use client";

import { useEffect } from "react";

const unreadBySource = new Map<string, number>();
const alertIcon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#166FB5"/><text x="13" y="44" fill="white" font-family="Arial,sans-serif" font-size="30" font-weight="700">P</text><circle cx="49" cy="16" r="13" fill="#dc2626"/><circle cx="49" cy="16" r="4" fill="white"/></svg>',
)}`;

let interval: ReturnType<typeof setInterval> | null = null;
let originalTitle = "";
let originalIcon = "";
let iconLink: HTMLLinkElement | null = null;
let alertPhase = false;

function syncTabAttention() {
  if (typeof document === "undefined") return;

  const unreadCount = Array.from(unreadBySource.values()).reduce(
    (total, count) => total + count,
    0,
  );

  if (unreadCount === 0) {
    if (interval) clearInterval(interval);
    interval = null;
    if (originalTitle) document.title = originalTitle;
    if (iconLink && originalIcon) iconLink.href = originalIcon;
    originalTitle = "";
    originalIcon = "";
    iconLink = null;
    return;
  }

  if (interval) return;

  originalTitle = document.title;
  iconLink = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  originalIcon = iconLink?.href || "/favicon.ico";
  alertPhase = false;

  const updateTab = () => {
    const hasUnreadMessages = Array.from(unreadBySource.values()).some(
      (count) => count > 0,
    );
    if (!hasUnreadMessages) {
      syncTabAttention();
      return;
    }

    alertPhase = !alertPhase;
    document.title = alertPhase
      ? `New chat message | ${originalTitle}`
      : originalTitle;
    if (iconLink) iconLink.href = alertPhase ? alertIcon : originalIcon;
  };

  updateTab();
  interval = setInterval(updateTab, 800);
}

export function useChatTabAttention(source: string, unreadCount: number) {
  useEffect(() => {
    unreadBySource.set(source, unreadCount);
    syncTabAttention();

    return () => {
      unreadBySource.delete(source);
      syncTabAttention();
    };
  }, [source, unreadCount]);
}
