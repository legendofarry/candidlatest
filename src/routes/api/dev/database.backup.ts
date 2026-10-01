import { createFileRoute } from "@tanstack/react-router";
import {
  authorizeDevDatabase,
  backupFileName,
  createDatabaseBackup,
  serverError,
} from "@/lib/dev-database.server";

export const Route = createFileRoute("/api/dev/database/backup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const access = await authorizeDevDatabase(request);
        if (access instanceof Response) return access;
        try {
          const archive = await createDatabaseBackup(access);
          const body = archive.buffer.slice(
            archive.byteOffset,
            archive.byteOffset + archive.byteLength,
          ) as ArrayBuffer;
          return new Response(body, {
            headers: {
              "content-type": "application/zip",
              "content-disposition": `attachment; filename="${backupFileName()}"`,
              "cache-control": "no-store",
            },
          });
        } catch (error) {
          console.error("[dev database] Backup failed", error);
          return serverError(
            error instanceof Error ? error.message : "Could not create the database backup.",
          );
        }
      },
    },
  },
});
