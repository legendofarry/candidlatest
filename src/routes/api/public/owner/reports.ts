import { createFileRoute } from "@tanstack/react-router";
import {
  readCollection,
  type CommentRecord,
  type ReportRecord,
  type StoryRecord,
} from "@/lib/firebase-data.server";
import { getAdmin, json, pagination, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const { limit, offset } = pagination(url);
        await getAdmin();

        const status = url.searchParams.get("status") ?? "open";
        const targetType = url.searchParams.get("target_type");
        const [reports, stories, comments] = await Promise.all([
          readCollection<ReportRecord>("reports"),
          readCollection<StoryRecord>("stories"),
          readCollection<CommentRecord>("comments"),
        ]);
        const storyById = new Map(stories.map((story) => [story.id, story] as const));
        const commentById = new Map(comments.map((comment) => [comment.id, comment] as const));

        const filtered = reports
          .filter((report) => (status !== "all" ? report.status === status : true))
          .filter((report) => (targetType ? report.target_type === targetType : true))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        return json({
          total: filtered.length,
          limit,
          offset,
          reports: filtered.slice(offset, offset + limit).map((report) => ({
            ...report,
            target:
              report.target_type === "story"
                ? (storyById.get(report.target_id) ?? null)
                : (commentById.get(report.target_id) ?? null),
          })),
        });
      },
    },
  },
});
