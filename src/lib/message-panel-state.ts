import { useSyncExternalStore } from "react";

let selectedConversationId: string | null = null;
let lastConversationId: string | null = null;
let lastInboxScroll = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openMessagePanel(conversationId: string) {
  selectedConversationId = conversationId;
  lastConversationId = conversationId;
  emit();
}

/** Close the open conversation but remember it so reopening restores it. */
export function closeMessagePanel() {
  if (!selectedConversationId) return;
  lastConversationId = selectedConversationId;
  selectedConversationId = null;
  emit();
}

export function rememberConversation(conversationId: string) {
  if (lastConversationId === conversationId) return;
  lastConversationId = conversationId;
  emit();
}

export function getLastConversationId() {
  return lastConversationId;
}

export function useSelectedConversationId() {
  return useSyncExternalStore(
    subscribe,
    () => selectedConversationId,
    () => null,
  );
}

export function useLastConversationId() {
  return useSyncExternalStore(
    subscribe,
    () => lastConversationId,
    () => null,
  );
}

/** Remember the messages inbox scroll position so reopening resumes where the user was. */
export function saveInboxScroll(value: number) {
  lastInboxScroll = value;
}

export function readInboxScroll() {
  return lastInboxScroll;
}
