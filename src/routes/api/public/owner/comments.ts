import { createFileRoute } from "@tanstack/react-router";
import { getAdmin, json, ownerPageMetadata, pagination, readOwnerPage, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/comments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const options = pagination(url);
        const db = await getAdmin();
        const collection = db.collection("comments");
        let query = collection.orderBy("created_at", "desc");
        const status = url.searchParams.get("status");
        if (status) query = query.where("status", "==", status);
        const search = url.searchParams.get("q")?.trim().toLowerCase();
        let page;
        if (search) {
          // Bounded compatibility search; add a dedicated search index for unrestricted text search.
          const candidates = (await query.limit(500).get()).docs.filter((doc) => {
            const comment = doc.data();
            return `${comment["body"] ?? ""} ${comment["author_handle"] ?? ""}`.toLowerCase().includes(search);
          });
          const offset = Math.min(options.offset, 500);
          const docs = candidates.slice(offset, offset + options.limit);
          page = { docs, total: candidates.length, limit: options.limit, offset, hasMore: offset + docs.length < candidates.length, nextCursor: null };
        } else {
          page = await readOwnerPage(query, collection, options, "created_at");
        }
        const storyIds = [...new Set(page.docs.map((doc) => String(doc.data()["story_id"] ?? "")).filter(Boolean))];
        const stories = await Promise.all(storyIds.map((id) => db.collection("stories").doc(id).get()));
        const storyById = new Map(stories.filter((story) => story.exists).map((story) => [story.id, { ...story.data(), id: story.id }]));
        return json({
          ...ownerPageMetadata(page),
          comments: page.docs.map((doc) => {
            const comment = { ...doc.data(), id: doc.id };
            return { ...comment, story: storyById.get(String(comment["story_id"] ?? "")) ?? null };
          }),
        });
      },
    },
  },
});
