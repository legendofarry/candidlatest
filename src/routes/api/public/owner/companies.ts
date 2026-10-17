import { createFileRoute } from "@tanstack/react-router";
import { getAdmin, json, ownerPageMetadata, pagination, readOwnerPage, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/companies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const options = pagination(url);
        const db = await getAdmin();
        const collection = db.collection("companies");
        let query = collection.orderBy("name", "asc");
        const industry = url.searchParams.get("industry");
        const county = url.searchParams.get("county");
        if (industry) query = query.where("industry", "==", industry);
        if (county) query = query.where("county", "==", county);
        const search = url.searchParams.get("q")?.trim().toLowerCase();
        let page;
        if (search) {
          // Bounded compatibility search; Firestore cannot search arbitrary substrings.
          const candidates = (await query.limit(500).get()).docs.filter((doc) => String(doc.data()["name"] ?? "").toLowerCase().includes(search));
          const offset = Math.min(options.offset, 500);
          const docs = candidates.slice(offset, offset + options.limit);
          page = { docs, total: candidates.length, limit: options.limit, offset, hasMore: offset + docs.length < candidates.length, nextCursor: null };
        } else {
          page = await readOwnerPage(query, collection, options, "name");
        }
        const companies = await Promise.all(page.docs.map(async (doc) => {
          const [aiProfiles, location] = await Promise.all([
            db.collection("company_ai_profiles").where("company_id", "==", doc.id).limit(1).get(),
            db.collection("company_locations").where("company_id", "==", doc.id).limit(1).get(),
          ]);
          return {
            ...doc.data(),
            id: doc.id,
            company_ai_profiles: aiProfiles.docs[0]?.data() ?? null,
            company_location: location.docs[0]?.data() ?? null,
          };
        }));
        return json({ ...ownerPageMetadata(page), companies });
      },
    },
  },
});
