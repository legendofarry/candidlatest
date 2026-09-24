import { useSyncExternalStore } from "react";

let selectedConversationId: string | null = null;
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
  emit();
}

export function closeMessagePanel() {
  if (!selectedConversationId) return;
  selectedConversationId = null;
  emit();
}

export function useSelectedConversationId() {
  return useSyncExternalStore(
    subscribe,
    () => selectedConversationId,
    () => null,
  );
}
