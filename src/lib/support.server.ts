import { getFirestoreDb } from "./firebase.server";

type TicketInput = {
  full_name: string;
  contact: string;
  category: "story" | "account" | "privacy" | "employer" | "technical" | "other";
  message: string;
};

const now = () => new Date().toISOString();

/** A public form for people who cannot, or prefer not to, sign in. */
export async function createTicket(input: TicketInput) {
  const db = getFirestoreDb();
  const ref = db.collection("support_tickets").doc();
  const createdAt = now();
  await ref.set({
    id: ref.id,
    ...input,
    status: "open",
    source: "support_form",
    created_at: createdAt,
    updated_at: createdAt,
  });
  return { id: ref.id };
}

function conversationRef(userId: string) {
  return getFirestoreDb().collection("support_conversations").doc(userId);
}

async function ensureConversation(userId: string) {
  const ref = conversationRef(userId);
  const snap = await ref.get();
  if (!snap.exists) {
    const createdAt = now();
    await ref.set({
      id: ref.id,
      user_id: userId,
      status: "open",
      created_at: createdAt,
      updated_at: createdAt,
      last_message_at: createdAt,
      last_message: "",
      last_sender: null,
    });
  }
  return ref;
}

export async function readSupportConversation(userId: string) {
  const db = getFirestoreDb();
  const ref = await ensureConversation(userId);
  const [conversation, messages] = await Promise.all([
    ref.get(),
    db.collection("support_messages").where("conversation_id", "==", ref.id).get(),
  ]);
  return {
    conversation: conversation.data(),
    escalation: {
      needsOwner: Boolean(conversation.data()?.needs_owner),
      reason: conversation.data()?.escalation_reason ?? null,
    },
    messages: messages.docs
      .map((doc) => doc.data())
      .sort((a, b) => String(a["created_at"]).localeCompare(String(b["created_at"]))),
  };
}

export async function writeSupportMessage(userId: string, body: string) {
  const db = getFirestoreDb();
  const ref = await ensureConversation(userId);
  const conversation = await ref.get();
  const existing = await db.collection("support_messages").where("conversation_id", "==", ref.id).get();
  const history = existing.docs
    .map((doc) => doc.data() as { sender_type?: string; body?: string; created_at?: string })
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-10)
    .map((message) => ({ sender: message.sender_type === "user" ? "user" as const : "candid" as const, body: String(message.body || "") }));
  const { answerSupportMessage } = await import("./ai.server");
  const response = await answerSupportMessage({ messages: [...history, { sender: "user", body }] });
  const userMessageRef = db.collection("support_messages").doc();
  const aiMessageRef = db.collection("support_messages").doc();
  const createdAt = now();
  const answeredAt = new Date(Date.now() + 1).toISOString();
  const needsOwner = response.disposition === "escalate" || Boolean(conversation.data()?.needs_owner);
  const escalationReason = response.disposition === "escalate"
    ? response.escalation_reason
    : conversation.data()?.escalation_reason ?? null;
  const userIdOnly = conversation.data()?.user_id || userId;
  const notificationRef = needsOwner ? db.collection("notifications").doc() : null;
  const auditRef = db.collection("owner_audit_log").doc();
  await db.runTransaction(async (transaction) => {
    transaction.set(userMessageRef, {
      id: userMessageRef.id,
      conversation_id: ref.id,
      sender_id: userId,
      sender_type: "user",
      body,
      created_at: createdAt,
      read_at: null,
    });
    transaction.set(aiMessageRef, {
      id: aiMessageRef.id,
      conversation_id: ref.id,
      sender_id: "candid-official",
      sender_type: "ai",
      body: response.reply,
      created_at: answeredAt,
      read_at: null,
      escalation_reason: needsOwner ? escalationReason : null,
    });
    transaction.set(
      ref,
      {
        updated_at: answeredAt,
        last_message_at: answeredAt,
        last_message: response.reply,
        last_sender: "ai",
        status: "open",
        needs_owner: needsOwner,
        escalation_reason: needsOwner ? escalationReason : null,
        escalation_created_at: needsOwner ? answeredAt : null,
      },
      { merge: true },
    );
    if (notificationRef) transaction.set(notificationRef, {
      id: notificationRef.id,
      user_id: userIdOnly,
      kind: "info",
      title: "Candid support is following up",
      description: "Your question needs a closer look. The team will reply here.",
      link: "/support",
      created_at: answeredAt,
      read_at: null,
    });
    transaction.set(auditRef, {
      id: auditRef.id,
      action: needsOwner ? "support.ai_escalated" : "support.ai_replied",
      target_type: "support_conversation",
      target_id: ref.id,
      payload: { user_id: userId, reason: needsOwner ? escalationReason : null },
      created_at: answeredAt,
    });
  });
  return { id: userMessageRef.id, created_at: createdAt, reply: response.reply, escalated: needsOwner };
}
