import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { readCollection, readDocument, type CommentRecord } from "@/lib/firebase-data.server";
import { FieldValue } from "@/lib/firestore-rest.server";
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
    name: z.string().trim().min(2).max(120).optional(),
    industry: z.string().max(80).nullable().optional(),
    county: z.string().max(60).nullable().optional(),
    area: z.string().max(100).nullable().optional(),
    website: z.string().url().max(500).nullable().optional(),
    address: z.string().max(300).nullable().optional(),
    verified: z.boolean().optional(),
    is_public: z.boolean().optional(),
    location: z.object({
      label: z.string().max(300).nullable(),
      map_url: z.string().url().max(500).nullable(),
      lat: z.number().min(-90).max(90).nullable(),
      lng: z.number().min(-180).max(180).nullable(),
    }).optional(),
  }),
  z.object({ entity: z.literal("company_claim"), id: documentId, user_id: documentId, approve: z.boolean() }),
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
          const previousStatus = String(story["status"] ?? "pending");
          const storyRef = db.collection("stories").doc(input.id);
          const storyPatch = {
              status: input.status,
              moderation_note:
                input.moderation_note === undefined
                  ? input.status === "published"
                    ? null
                    : (story["moderation_note"] ?? null)
                  : input.moderation_note,
              moderated_at: timestamp,
            };
          if (input.status === "published" && typeof story["company_id"] === "string") {
            const companyRef = db.collection("companies").doc(String(story["company_id"]));
            const companySnap = await companyRef.get();
            const batch = db.batch();
            batch.update(storyRef, storyPatch);
            if (companySnap.exists) batch.update(companyRef, { is_public: true }, companySnap.updateTime ? { updateTime: companySnap.updateTime } : undefined);
            await batch.commit();
          } else {
            await storyRef.update(storyPatch);
          }
          await auditOwnerAction({
            action: `story.${input.status}`,
            targetType: "story",
            targetId: input.id,
            payload: { moderation_note: input.moderation_note ?? null },
          });
          if (previousStatus !== input.status && (input.status === "published" || input.status === "hidden")) {
            const authorId = typeof story["author_id"] === "string" ? story["author_id"] : "";
            if (authorId) {
              const { pushServerNotification } = await import("@/lib/notifications.server");
              const rejected = input.status === "hidden" && previousStatus === "pending";
              try {
                await pushServerNotification({
                  userId: authorId,
                  kind: input.status === "published" ? "success" : "warning",
                  title: input.status === "published" ? "Your story is approved" : rejected ? "Your story was not approved" : "Your story is no longer published",
                  description: input.moderation_note?.trim() || (input.status === "published" ? "Your story is now visible on Candid." : "Open your story status to see the moderation decision."),
                  link: "/profile",
                });
              } catch (error) {
                console.error("Could not notify story author of moderation decision", error);
              }
            }
            if (input.status === "published" && typeof story["company_id"] === "string") {
              try {
                const [{ pushServerNotification }, companyOwners] = await Promise.all([
                  import("@/lib/notifications.server"),
                  db.collection("account_verifications").where("company_id", "==", story["company_id"]).get(),
                ]);
                await Promise.all(companyOwners.docs
                  .filter((doc) => doc.id !== authorId)
                  .map((doc) => pushServerNotification({
                    userId: doc.id,
                    kind: "info",
                    title: "Your company was mentioned in a story",
                    description: "An approved story mentioning your company is now visible on Candid.",
                    link: `/stories/${encodeURIComponent(input.id)}`,
                  })));
              } catch (error) {
                console.error("Could not notify company account about approved story", error);
              }
            }
          }
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
        } else if (input.entity === "company") {
          const existingCompany = await readDocument("companies", input.id);
          if (!existingCompany)
            return json({ error: "Company not found" }, 404);
          const aliases = Array.isArray(existingCompany["aliases"]) ? [...existingCompany["aliases"] as string[]] : [];
          if (input.name && input.name.toLowerCase() !== String(existingCompany["name"] ?? "").toLowerCase()) {
            const oldName = String(existingCompany["name"] ?? "").trim();
            if (oldName && !aliases.some((alias) => alias.toLowerCase() === oldName.toLowerCase())) aliases.push(oldName);
          }
          const patch: Record<string, unknown> = Object.fromEntries(
            Object.entries({
              name: input.name,
              industry: input.industry,
              county: input.county,
              area: input.area,
              website: input.website,
              address: input.address,
              verified: input.verified,
              is_public: input.is_public,
            }).filter(([, value]) => value !== undefined),
          );
          if (input.name && aliases.length) patch["aliases"] = aliases;
          if (Object.keys(patch).length === 0 && !input.location)
            return json({ error: "No company changes supplied" }, 400);
          if (Object.keys(patch).length) await db.collection("companies").doc(input.id).update(patch);
          if (input.location) {
            await db.collection("company_locations").doc(input.id).set({
              id: input.id,
              company_id: input.id,
              label: input.location.label,
              map_url: input.location.map_url,
              lat: input.location.lat,
              lng: input.location.lng,
              updated_by: "owner-admin",
              updated_at: timestamp,
            });
          }
          await auditOwnerAction({
            action: "company.updated",
            targetType: "company",
            targetId: input.id,
            payload: patch,
          });
        } else {
          const company = await readDocument("companies", input.id);
          if (!company) return json({ error: "Company not found" }, 404);
          const profile = await readDocument("profiles", input.user_id);
          if (!profile) return json({ error: "User not found" }, 404);
          const companyRef = db.collection("companies").doc(input.id);
          const companySnap = await companyRef.get();
          const currentCompany = companySnap.data() as { claimed_by?: string | null } | undefined;
          if (input.approve && currentCompany?.claimed_by && currentCompany.claimed_by !== input.user_id) {
            return json({ error: "This company is already claimed by another account" }, 409);
          }
          if (!input.approve && currentCompany?.claimed_by && currentCompany.claimed_by !== input.user_id) {
            return json({ error: "This company is claimed by a different account" }, 409);
          }
          const verificationRef = db.collection("account_verifications").doc(input.user_id);
          const verificationSnap = await verificationRef.get();
          const claimTime = new Date().toISOString();
          const batch = db.batch();
          batch.update(companyRef, {
            claimed_by: input.approve ? input.user_id : null,
            verified: input.approve,
            ...(input.approve ? { is_public: true } : {}),
          }, companySnap.updateTime ? { updateTime: companySnap.updateTime } : undefined);
          if (input.approve) {
            batch.set(verificationRef, {
              id: input.user_id,
              user_id: input.user_id,
              account_type: "company",
              owner_override: "company",
              company_id: input.id,
              company_name: company["name"] ?? null,
              company_slug: company["slug"] ?? null,
              owner_verified: true,
              badge_status: "claimed",
              approval_status: "approved",
              claimed_at: claimTime,
              checked_at: claimTime,
            }, { merge: true });
            batch.set(db.collection("profiles").doc(input.user_id), { account_type: "company", company_id: input.id, verified: true }, { merge: true });
          } else {
            if (verificationSnap.exists) batch.update(verificationRef, { owner_verified: false, owner_override: null, badge_status: "none", approval_status: "none", claimed_at: null });
            batch.set(db.collection("profiles").doc(input.user_id), { account_type: "individual", company_id: null, verified: false }, { merge: true });
          }
          await batch.commit();
          await auditOwnerAction({
            action: input.approve ? "company.claim_approved" : "company.claim_revoked",
            targetType: "company",
            targetId: input.id,
            payload: { user_id: input.user_id },
          });
        }

        return json({ ok: true });
      },
    },
  },
});
