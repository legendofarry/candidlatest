import { createFileRoute } from "@tanstack/react-router";
import { getAdmin, json, ownerPageMetadata, pagination, readOwnerPage, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;
        const url = new URL(request.url);
        const db = await getAdmin();
        const collection = db.collection("reports");
        let query = collection.orderBy("created_at", "desc");
        const status = url.searchParams.get("status") ?? "open";
        const targetType = url.searchParams.get("target_type");
        if (status !== "all") query = query.where("status", "==", status).orderBy("created_at", "desc");
        if (targetType) query = query.where("target_type", "==", targetType).orderBy("created_at", "desc");
        const page = await readOwnerPage(query, collection, pagination(url), "created_at");
        const reports = await Promise.all(page.docs.map(async (doc) => {
          const report = { ...doc.data(), id: doc.id };
          const targetCollection = report["target_type"] === "story" ? "stories" : "comments";
          const targetId = String(report["target_id"] ?? "");
          const target = targetId ? await db.collection(targetCollection).doc(targetId).get() : null;
          return { ...report, target: target?.exists ? { ...target.data(), id: target.id } : null };
        }));
        return json({ ...ownerPageMetadata(page), reports });
      },
    },
  },
});
