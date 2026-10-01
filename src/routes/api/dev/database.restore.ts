import { createFileRoute } from "@tanstack/react-router";
import {
  authorizeDevDatabase,
  badRequest,
  isBackupUploadTooLarge,
  restoreDatabaseBackup,
  serverError,
} from "@/lib/dev-database.server";

export const Route = createFileRoute("/api/dev/database/restore")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const access = await authorizeDevDatabase(request);
        if (access instanceof Response) return access;
        if (isBackupUploadTooLarge(request))
          return badRequest("Backup ZIP exceeds the 100 MB limit.");

        try {
          const form = await request.formData();
          const file = form.get("backup");
          const confirmation = form.get("confirmation");
          if (!(file instanceof File) || typeof confirmation !== "string") {
            return badRequest("Choose a backup ZIP and confirm the Firebase project ID.");
          }
          const restored = await restoreDatabaseBackup(file, access, confirmation);
          return Response.json({ ok: true, restoredDocuments: restored });
        } catch (error) {
          console.error("[dev database] Restore failed", error);
          return error instanceof Error
            ? badRequest(error.message)
            : serverError("Could not restore the Firestore backup.");
        }
      },
    },
  },
});
