import { createFileRoute } from "@tanstack/react-router";
import { getAdmin, json, ownerPageMetadata, pagination, readOwnerPage, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/stories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const options = pagination(url);
        const db = await getAdmin();
        const collection = db.collection("stories");
        let query = collection.orderBy("created_at", "desc");
        const filters = [
          ["status", url.searchParams.get("status")],
          ["company_id", url.searchParams.get("company_id")],
          ["county", url.searchParams.get("county")],
          ["industry", url.searchParams.get("industry")],
        ] as const;
        for (const [field, value] of filters) if (value) query = query.where(field, "==", value);
        const search = url.searchParams.get("q")?.trim().toLowerCase();
        let page;
        if (search) {
          // Content search is bounded because Firestore does not provide substring/full-text search.
          const candidates = (await query.limit(500).get()).docs.filter((doc) => {
            const story = doc.data();
            return `${story["title"] ?? ""} ${story["body"] ?? ""}`.toLowerCase().includes(search);
          });
          const offset = Math.min(options.offset, 500);
          const docs = candidates.slice(offset, offset + options.limit);
          page = { docs, total: candidates.length, limit: options.limit, offset, hasMore: offset + docs.length < candidates.length, nextCursor: null };
        } else {
          page = await readOwnerPage(query, collection, options, "created_at");
        }
        const stories = await Promise.all(page.docs.map(async (doc) => {
          const story = { ...doc.data(), id: doc.id };
          const [company, profile] = await Promise.all([
            story["company_id"] ? db.collection("companies").doc(String(story["company_id"])).get() : null,
            story["author_id"] ? db.collection("profiles").doc(String(story["author_id"])).get() : null,
          ]);
          return {
            ...story,
            companies: company?.exists ? { ...company.data(), id: company.id } : null,
            story_reasons: (Array.isArray(story["reasons"]) ? story["reasons"] : []).map((reason) => ({ reason })),
            profiles: profile?.exists ? { ...profile.data(), id: profile.id } : null,
          };
        }));
        return json({ ...ownerPageMetadata(page), stories });
      },
    },
  },
});
