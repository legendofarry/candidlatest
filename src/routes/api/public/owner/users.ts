import { createFileRoute } from "@tanstack/react-router";
import { readCollection, type ProfileRecord } from "@/lib/firebase-data.server";
import { getAdmin, json, pagination, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const { limit, offset } = pagination(url);
        await getAdmin();

        const search = url.searchParams.get("q");
        const banned = url.searchParams.get("banned");
        const [profiles, verifications, verificationReviews] = await Promise.all([
          readCollection<ProfileRecord>("profiles"),
          readCollection<Record<string, unknown>>("account_verifications"),
          readCollection<Record<string, unknown>>("account_verification_reviews"),
        ]);
        const verificationByUser = new Map(verifications.map((item) => [String(item["user_id"] ?? item["id"] ?? ""), item]));
        const reviewByUser = new Map(verificationReviews.map((item) => [String(item["user_id"] ?? item["id"] ?? ""), item]));
        const filtered = profiles
          .filter((profile) =>
            search ? profile.handle.toLowerCase().includes(search.toLowerCase()) : true,
          )
          .filter((profile) => (banned === "true" ? profile.banned : true))
          .filter((profile) => (banned === "false" ? !profile.banned : true))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        return json({
          total: filtered.length,
          limit,
          offset,
          users: filtered.slice(offset, offset + limit).map((profile) => ({
            ...profile,
            account_verification: verificationByUser.get(profile.id) ?? null,
            verification_review: reviewByUser.get(profile.id) ?? null,
          })),
        });
      },
    },
  },
});
