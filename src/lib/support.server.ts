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
    messages: messages.docs
      .map((doc) => doc.data())
      .sort((a, b) => String(a["created_at"]).localeCompare(String(b["created_at"]))),
  };
}

export async function writeSupportMessage(userId: string, body: string) {
  const db = getFirestoreDb();
  const ref = await ensureConversation(userId);
  const messageRef = db.collection("support_messages").doc();
  const createdAt = now();
  await db.runTransaction(async (transaction) => {
    transaction.set(messageRef, {
      id: messageRef.id,
      conversation_id: ref.id,
      sender_id: userId,
      sender_type: "user",
      body,
      created_at: createdAt,
      read_at: null,
    });
    transaction.set(
      ref,
      {
        updated_at: createdAt,
        last_message_at: createdAt,
        last_message: body,
        last_sender: "user",
        status: "open",
      },
      { merge: true },
    );
  });
  return { id: messageRef.id, created_at: createdAt };
}
