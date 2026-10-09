import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import { getFirestoreDb } from "@/lib/firebase.server";

const RESET_CONFIRMATION = "CLEAR FIRESTORE";
const MAX_DOCUMENTS_PER_RESET = 25_000;

function resetEnabledFor(email: string | undefined) {
  const enabled = process.env["ALLOW_DEVELOPMENT_DATABASE_RESET"] === "true";
  const developerEmail = process.env["DEVELOPER_EMAIL"]?.trim().toLowerCase();
  return Boolean(enabled && developerEmail && email?.toLowerCase() === developerEmail);
}

/**
 * Explicitly opt-in development reset. This clears Firestore documents only;
 * Firebase Authentication users and Cloudinary assets live outside Firestore.
 */
export const clearDevelopmentFirestore = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ confirmation: z.literal(RESET_CONFIRMATION) }).parse(input),
  )
  .handler(async ({ context }) => {
    if (!resetEnabledFor(context.claims.email)) {
      throw new Error("Developer database reset is not enabled for this account.");
    }

    const db = getFirestoreDb();
    const documents: Array<{ path: string }> = [];

    async function collectCollection(path: string): Promise<void> {
      const snapshot = await db.collection(path).get();
      for (const document of snapshot.docs) {
        if (documents.length >= MAX_DOCUMENTS_PER_RESET) {
          throw new Error(
            `Reset stopped after ${MAX_DOCUMENTS_PER_RESET.toLocaleString()} documents.`,
          );
        }
        const childCollections = await db.listCollectionIds(document.ref.path);
        for (const child of childCollections) {
          await collectCollection(`${document.ref.path}/${child}`);
        }
        documents.push({ path: document.ref.path });
      }
    }

    for (const collection of await db.listCollectionIds()) {
      await collectCollection(collection);
    }

    // Documents are collected children-first, so nested data is removed before
    // its parent documents. Keep batches below Firestore's 500-write limit.
    for (let index = 0; index < documents.length; index += 400) {
      const batch = db.batch();
      for (const document of documents.slice(index, index + 400)) {
        batch.delete(
          db
            .collection(document.path.split("/").slice(0, -1).join("/"))
            .doc(document.path.split("/").at(-1)!),
        );
      }
      await batch.commit();
    }

    return { deleted: documents.length };
  });

export { RESET_CONFIRMATION };
