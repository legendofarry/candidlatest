import { getFirestoreDb } from "./firebase.server";

/** Blocks are bilateral for visibility and interaction checks. */
export async function accountsBlockEachOther(firstId: string, secondId: string) {
  if (!firstId || !secondId || firstId === secondId) return false;
  const db = getFirestoreDb();
  const [forward, reverse] = await Promise.all([
    db.collection("blocks").doc(`${firstId}:${secondId}`).get(),
    db.collection("blocks").doc(`${secondId}:${firstId}`).get(),
  ]);
  return forward.exists || reverse.exists;
}
