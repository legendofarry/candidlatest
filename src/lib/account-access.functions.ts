import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase.server";

/** This endpoint is intentionally usable while an account hold is active. */
export const getInvestigationHoldState = createServerFn({ method: "POST" }).handler(async () => {
  const authorization = getRequest()?.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new Error("Unauthorized");

  const decoded = await getFirebaseAuth().verifyIdToken(token);
  if (!decoded.uid) throw new Error("Unauthorized");

  const profile = await getFirestoreDb().collection("profiles").doc(decoded.uid).get();
  const hold = profile.data()?.investigation_hold as boolean | { active?: boolean } | null | undefined;
  return { active: hold === true || (typeof hold === "object" && hold?.active === true) };
});
