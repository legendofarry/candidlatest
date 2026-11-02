import { getFirestoreDb } from "./firebase.server";
import type { DocumentData } from "./firestore-rest.server";

async function collectOwned(collectionName: string, field: string, userId: string) {
  const db = getFirestoreDb();
  const page = await db.collection(collectionName).where(field, "==", userId).get();
  return page.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function buildAccountExport(userId: string) {
  const db = getFirestoreDb();
  const profileSnapshot = await db.collection("profiles").doc(userId).get();
  if (!profileSnapshot.exists) throw new Error("Your account profile could not be found.");
  const profile = profileSnapshot.data() ?? {};
  const conversations = await db.collection("conversations").where("participant_ids", "array-contains", userId).get();
  const conversationRows = conversations.docs.map((doc) => {
    const row = doc.data();
    return {
      id: doc.id,
      participant_ids: row.participant_ids,
      created_at: row.created_at,
      last_message_at: row.last_message_at,
      preferences: row.preferences?.[userId] ?? {},
    };
  });
  const messages = (await Promise.all(conversationRows.map(async (conversation) => {
    const rows = await db.collection("messages").where("conversation_id", "==", conversation.id).get();
    return rows.docs.map((doc) => {
      const row = doc.data();
      return {
        id: doc.id,
        conversation_id: conversation.id,
        sender_id: row.sender_id,
        body: row.body,
        created_at: row.created_at,
        read_at: row.sender_id === userId ? row.read_at : null,
        image: row.image ? { public_id: row.image.public_id, format: row.image.format, bytes: row.image.bytes } : null,
        reactions: row.reactions ?? {},
        is_deleted: row.is_deleted === true,
      };
    });
  }))).flat();

  const [stories, comments, followsIn, followsOut, salaryReports, companyRatings, notifications,
    storyLikes, commentLikes, savedStories] = await Promise.all([
    collectOwned("stories", "author_id", userId),
    collectOwned("comments", "author_id", userId),
    collectOwned("follows", "following_id", userId),
    collectOwned("follows", "follower_id", userId),
    collectOwned("salary_reports", "user_id", userId),
    collectOwned("company_ratings", "user_id", userId),
    collectOwned("notifications", "user_id", userId),
    collectOwned("story_likes", "user_id", userId),
    collectOwned("comment_likes", "user_id", userId),
    collectOwned("story_saves", "user_id", userId),
  ]);

  const safeProfile = Object.fromEntries([
    "id", "handle", "username", "display_name", "bio", "photo_url", "cover_photo_url",
    "county", "area", "industry", "created_at", "profile_visibility", "account_status",
    "subscription_tier", "subscription_status", "subscription_started_at", "subscription_period_ends_at",
  ].filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]]));

  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    notice: "This export includes your Candid profile and contributions. It excludes passwords, login credentials, private employment evidence, internal moderation records, and other members’ private profile data.",
    profile: safeProfile,
    privacy_settings: (await db.collection("privacy_settings").doc(userId).get()).data() ?? {},
    stories: stories.map(({ evidence_status: _evidenceStatus, moderation_note: _moderationNote, ...story }) => story),
    comments,
    followers: followsIn,
    following: followsOut,
    salary_reports: salaryReports,
    company_ratings: companyRatings,
    notifications,
    story_likes: storyLikes,
    comment_likes: commentLikes,
    saved_stories: savedStories,
    conversations: conversationRows,
    messages,
  };
}
