import { createFileRoute } from "@tanstack/react-router";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { readCollection, readDocument, type CommentRecord } from "@/lib/firebase-data.server";
import { auditOwnerAction, getAdmin, json, verifyOwnerKey } from "@/lib/owner-api.server";

const documentId = z
  .string()
  .min(1)
  .max(180)
  .refine((value) => !value.includes("/"));
const ActionInput = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("story"),
    id: documentId,
    status: z.enum(["pending", "published", "hidden"]),
    moderation_note: z.string().max(1000).nullable().optional(),
  }),
  z.object({
    entity: z.literal("comment"),
    id: documentId,
    status: z.enum(["published", "hidden"]),
  }),
  z.object({
    entity: z.literal("report"),
    id: documentId,
    status: z.enum(["open", "resolved", "dismissed"]),
  }),
  z.object({ entity: z.literal("user"), id: documentId, banned: z.boolean() }),
  z.object({
    entity: z.literal("company"),
    id: documentId,
    industry: z.string().max(80).nullable().optional(),
    county: z.string().max(60).nullable().optional(),
    verified: z.boolean().optional(),
  }),
]);

export const Route = createFileRoute("/api/public/owner/actions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        const parsed = ActionInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid owner action" }, 400);

        const input = parsed.data;
        const db = await getAdmin();
        const timestamp = new Date().toISOString();

        if (input.entity === "story") {
          const story = await readDocument("stories", input.id);
          if (!story) return json({ error: "Story not found" }, 404);
          await db
            .collection("stories")
            .doc(input.id)
            .update({
              status: input.status,
              moderation_note:
                input.moderation_note === undefined
                  ? input.status === "published"
                    ? null
                    : (story["moderation_note"] ?? null)
                  : input.moderation_note,
              moderated_at: timestamp,
            });
          await auditOwnerAction({
            action: `story.${input.status}`,
            targetType: "story",
            targetId: input.id,
            payload: { moderation_note: input.moderation_note ?? null },
          });
        } else if (input.entity === "comment") {
          const comments = await readCollection<CommentRecord>("comments");
          const selected = comments.find((comment) => comment.id === input.id);
          if (!selected) return json({ error: "Comment not found" }, 404);

          const targets = new Set([input.id]);
          if (input.status === "hidden") {
            let frontier = [input.id];
            while (frontier.length > 0) {
              const next = comments
                .filter((comment) => comment.parent_id && frontier.includes(comment.parent_id))
                .map((comment) => comment.id)
                .filter((id) => !targets.has(id));
              next.forEach((id) => targets.add(id));
              frontier = next;
            }
          }

          const changed = comments.filter(
            (comment) => targets.has(comment.id) && comment.status !== input.status,
          );
          if (changed.length > 0) {
            const batch = db.batch();
            for (const comment of changed) {
              batch.update(db.collection("comments").doc(comment.id), { status: input.status });
            }
            const countDelta = changed.reduce(
              (delta, comment) =>
                delta +
                (input.status === "hidden"
                  ? comment.status === "published"
                    ? -1
                    : 0
                  : comment.status === "published"
                    ? 0
                    : 1),
              0,
            );
            if (countDelta !== 0) {
              batch.update(db.collection("stories").doc(selected.story_id), {
                comment_count: FieldValue.increment(countDelta),
              });
            }
            await batch.commit();
          }
          await auditOwnerAction({
            action: `comment.${input.status}`,
            targetType: "comment",
            targetId: input.id,
            payload: { affected: changed.length },
          });
        } else if (input.entity === "report") {
          const report = await readDocument("reports", input.id);
          if (!report) return json({ error: "Report not found" }, 404);
          await db.collection("reports").doc(input.id).update({
            status: input.status,
            reviewed_at: timestamp,
          });
          await auditOwnerAction({
            action: `report.${input.status}`,
            targetType: "report",
            targetId: input.id,
          });
        } else if (input.entity === "user") {
          if (!(await readDocument("profiles", input.id)))
            return json({ error: "User not found" }, 404);
          await db.collection("profiles").doc(input.id).update({ banned: input.banned });
          await auditOwnerAction({
            action: input.banned ? "user.banned" : "user.unbanned",
            targetType: "user",
            targetId: input.id,
          });
        } else {
          if (!(await readDocument("companies", input.id)))
            return json({ error: "Company not found" }, 404);
          const patch = Object.fromEntries(
            Object.entries({
              industry: input.industry,
              county: input.county,
              verified: input.verified,
            }).filter(([, value]) => value !== undefined),
          );
          if (Object.keys(patch).length === 0)
            return json({ error: "No company changes supplied" }, 400);
          await db.collection("companies").doc(input.id).update(patch);
          await auditOwnerAction({
            action: "company.updated",
            targetType: "company",
            targetId: input.id,
            payload: patch,
          });
        }

        return json({ ok: true });
      },
    },
  },
});
