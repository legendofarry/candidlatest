import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authorizeDevDatabase, clearDatabase, serverError } from "@/lib/dev-database.server";

export const Route = createFileRoute("/api/dev/database/clear")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const access = await authorizeDevDatabase(request);
        if (access instanceof Response) return access;

        const parsed = z
          .object({ confirmation: z.string(), backupDownloaded: z.literal(true) })
          .safeParse(await request.json().catch(() => null));
        if (!parsed.success || parsed.data.confirmation !== access.projectId) {
          return Response.json(
            { error: "Download a backup and confirm the project ID." },
            { status: 400 },
          );
        }

        try {
          const collections = await clearDatabase(access.db);
          return Response.json({ ok: true, clearedCollections: collections });
        } catch (error) {
          console.error("[dev database] Clear failed", error);
          return serverError("Could not clear all Firestore collections.");
        }
      },
    },
  },
});
