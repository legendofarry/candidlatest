import { createFileRoute } from "@tanstack/react-router";
import { authorizeDevDatabase } from "@/lib/dev-database.server";

export const Route = createFileRoute("/api/dev/database")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const access = await authorizeDevDatabase(request);
        if (access instanceof Response) return access;
        return Response.json({ enabled: true, projectId: access.projectId });
      },
    },
  },
});
