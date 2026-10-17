import { createFileRoute } from "@tanstack/react-router";
import { getAdmin, json, ownerPageMetadata, pagination, readOwnerPage, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const options = pagination(url);
        const db = await getAdmin();
        const collection = db.collection("profiles");
        let query = collection.orderBy("created_at", "desc");
        const banned = url.searchParams.get("banned");
        if (banned === "true" || banned === "false") query = collection.where("banned", "==", banned === "true").orderBy("created_at", "desc");

        const search = url.searchParams.get("q")?.trim().toLowerCase();
        if (search) {
          // Firestore has no substring search. Keep this compatibility search explicitly bounded.
          const candidates = (await query.limit(500).get()).docs
            .filter((doc) => String(doc.data()["handle"] ?? "").toLowerCase().includes(search));
          const total = candidates.length;
          const offset = Math.min(options.offset, 500);
          const users = await Promise.all(candidates.slice(offset, offset + options.limit).map(async (doc) => {
            const [verification, review] = await Promise.all([
              db.collection("account_verifications").where("user_id", "==", doc.id).limit(1).get(),
              db.collection("account_verification_reviews").where("user_id", "==", doc.id).orderBy("created_at", "desc").limit(1).get(),
            ]);
            return { ...doc.data(), id: doc.id, account_verification: verification.docs[0]?.data() ?? null, verification_review: review.docs[0]?.data() ?? null };
          }));
          return json({ total, limit: options.limit, offset, hasMore: offset + users.length < total, nextCursor: null, users });
        }

        const page = await readOwnerPage(query, collection, options, "created_at");
        const users = await Promise.all(page.docs.map(async (doc) => {
          const [verification, review] = await Promise.all([
            db.collection("account_verifications").where("user_id", "==", doc.id).limit(1).get(),
            db.collection("account_verification_reviews").where("user_id", "==", doc.id).orderBy("created_at", "desc").limit(1).get(),
          ]);
          return { ...doc.data(), id: doc.id, account_verification: verification.docs[0]?.data() ?? null, verification_review: review.docs[0]?.data() ?? null };
        }));
        return json({ ...ownerPageMetadata(page), users });
      },
    },
  },
});
