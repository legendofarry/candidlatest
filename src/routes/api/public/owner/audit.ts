import { createFileRoute } from "@tanstack/react-router";
import { readCollection, type OwnerAuditLogRecord } from "@/lib/firebase-data.server";
import { getAdmin, json, pagination, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/audit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        const { limit, offset } = pagination(new URL(request.url));
        await getAdmin();
        const entries = (await readCollection<OwnerAuditLogRecord>("owner_audit_log")).sort(
          (a, b) => b.created_at.localeCompare(a.created_at),
        );
        return json({
          total: entries.length,
          limit,
          offset,
          entries: entries.slice(offset, offset + limit),
        });
      },
    },
  },
});
