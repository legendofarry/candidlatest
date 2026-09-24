import { useSyncExternalStore } from "react";
import type { MessageRecord } from "./messaging.server";

export const DEMO_CONVERSATION_ID = "demo-candid-team";
const STORAGE_KEY = "candid.demo-chat.v1";

export type DemoConversation = {
  id: string;
  with: { id: string; username: string; verified: boolean; official: boolean };
  messages: MessageRecord[];
  can_send: true;
  blocked_reason: null;
  last_message: string;
  last_message_at: string;
  unread: number;
  mine: boolean;
  demo: true;
};

const listeners = new Set<() => void>();
let conversation: DemoConversation | null = null;
let hydrated = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) conversation = JSON.parse(stored) as DemoConversation;
  } catch {
    conversation = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  hydrate();
  return () => listeners.delete(listener);
}

function persist() {
  if (typeof window === "undefined") return;
  if (conversation) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
  else window.localStorage.removeItem(STORAGE_KEY);
}

function starterConversation(): DemoConversation {
  const now = Date.now();
  const messages: MessageRecord[] = [
    {
      id: "demo-welcome",
      conversation_id: DEMO_CONVERSATION_ID,
      sender_id: "candid-demo-team",
      body: "Hi! This is a sample conversation with the Candid team. Try sending a reply or adding a reaction.",
      created_at: new Date(now - 1000 * 60 * 18).toISOString(),
      read_at: new Date(now - 1000 * 60 * 16).toISOString(),
      reactions: { "👋": ["candid-demo-team"] },
    },
    {
      id: "demo-followup",
      conversation_id: DEMO_CONVERSATION_ID,
      sender_id: "candid-demo-team",
      body: "You can also open this thread from the demo notification in your inbox. Nothing here is sent to a real account.",
      created_at: new Date(now - 1000 * 60 * 12).toISOString(),
      read_at: null,
      reactions: {},
    },
  ];
  const latestMessage = messages[messages.length - 1]!;
  return {
    id: DEMO_CONVERSATION_ID,
    with: { id: "candid-demo-team", username: "candid.team.demo", verified: true, official: true },
    messages,
    can_send: true,
    blocked_reason: null,
    last_message: latestMessage.body,
    last_message_at: latestMessage.created_at,
    unread: 2,
    mine: false,
    demo: true,
  };
}

export function seedDemoConversation() {
  hydrate();
  if (!conversation) conversation = starterConversation();
  persist();
  emit();
}

export function clearDemoConversation() {
  hydrate();
  conversation = null;
  persist();
  emit();
}

export function getDemoConversation() {
  hydrate();
  return conversation;
}

export function useDemoConversation() {
  return useSyncExternalStore(
    subscribe,
    () => conversation,
    () => null,
  );
}

export function sendDemoMessage(body: string) {
  const current = getDemoConversation();
  if (!current) throw new Error("Load the demo conversation first.");
  const message: MessageRecord = {
    id: `demo-${Date.now().toString(36)}`,
    conversation_id: DEMO_CONVERSATION_ID,
    sender_id: "demo-me",
    body: body.trim(),
    created_at: new Date().toISOString(),
    read_at: null,
    reactions: {},
  };
  conversation = {
    ...current,
    messages: [...current.messages, message],
    last_message: message.body,
    last_message_at: message.created_at,
    unread: 0,
    mine: true,
  };
  persist();
  emit();
  return message;
}

export function markDemoConversationRead() {
  const current = getDemoConversation();
  if (!current || current.unread === 0) return;
  const readAt = new Date().toISOString();
  conversation = {
    ...current,
    unread: 0,
    messages: current.messages.map((message) =>
      message.sender_id === "demo-me" || message.read_at
        ? message
        : { ...message, read_at: readAt },
    ),
  };
  persist();
  emit();
}

export function toggleDemoReaction(messageId: string, emoji: string) {
  const current = getDemoConversation();
  if (!current) return;
  conversation = {
    ...current,
    messages: current.messages.map((message) => {
      if (message.id !== messageId) return message;
      const reactions = { ...message.reactions };
      const users = reactions[emoji] ?? [];
      const next = users.includes("demo-me")
        ? users.filter((id) => id !== "demo-me")
        : [...users, "demo-me"];
      if (next.length) reactions[emoji] = next;
      else delete reactions[emoji];
      return { ...message, reactions };
    }),
  };
  persist();
  emit();
}
