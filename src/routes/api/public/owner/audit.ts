import { createFileRoute } from "@tanstack/react-router";
import { getAdmin, json, ownerPageMetadata, pagination, readOwnerPage, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/audit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        const db = await getAdmin();
        const collection = db.collection("owner_audit_log");
        const query = collection.orderBy("created_at", "desc");
        const page = await readOwnerPage(query, collection, pagination(new URL(request.url)), "created_at");
        return json({ ...ownerPageMetadata(page), entries: page.docs.map((doc) => ({ ...doc.data(), id: doc.id })) });
      },
    },
  },
});
