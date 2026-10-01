import { createFileRoute } from "@tanstack/react-router";
import { readCollection, type CommentRecord, type StoryRecord } from "@/lib/firebase-data.server";
import { getAdmin, json, pagination, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/comments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const { limit, offset } = pagination(url);
        const status = url.searchParams.get("status");
        const search = url.searchParams.get("q")?.toLowerCase();
        await getAdmin();
        const [comments, stories] = await Promise.all([
          readCollection<CommentRecord>("comments"),
          readCollection<StoryRecord>("stories"),
        ]);
        const storyById = new Map(stories.map((story) => [story.id, story] as const));
        const filtered = comments
          .filter((comment) => (status ? comment.status === status : true))
          .filter((comment) =>
            search
              ? `${comment.body} ${comment.author_handle}`.toLowerCase().includes(search) ||
                (storyById.get(comment.story_id)?.title ?? "").toLowerCase().includes(search)
              : true,
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        return json({
          total: filtered.length,
          limit,
          offset,
          comments: filtered.slice(offset, offset + limit).map((comment) => ({
            ...comment,
            story: storyById.get(comment.story_id) ?? null,
          })),
        });
      },
    },
  },
});
