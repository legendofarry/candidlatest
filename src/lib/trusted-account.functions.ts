import { createServerFn } from "@tanstack/react-start";
import { importJWK, jwtVerify } from "jose";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";

const publicKeySchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string().min(1).max(128),
  y: z.string().min(1).max(128),
});

const deviceIdSchema = z.string().uuid();

export const registerTrustedAccountDevice = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceId: deviceIdSchema,
        publicKey: publicKeySchema,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { getFirestoreDb } = await import("@/lib/firebase.server");
    const db = getFirestoreDb();
    const now = new Date().toISOString();
    await db.collection("trusted_account_devices").doc(`${context.userId}_${data.deviceId}`).set(
      {
        user_id: context.userId,
        device_id: data.deviceId,
        public_key: data.publicKey,
        created_at: now,
        updated_at: now,
      },
      { merge: true },
    );
    return { registered: true };
  });

export const createTrustedAccountSwitchChallenge = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetUid: z.string().min(1).max(128),
        deviceId: deviceIdSchema,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { getFirestoreDb } = await import("@/lib/firebase.server");
    const db = getFirestoreDb();
    const device = await db
      .collection("trusted_account_devices")
      .doc(`${data.targetUid}_${data.deviceId}`)
      .get();
    if (!device.exists || device.get("user_id") !== data.targetUid) {
      throw new Error(
        "This account needs a one-time sign-in on this device before quick switching.",
      );
    }

    const challengeId = crypto.randomUUID();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const expiresAt = Date.now() + 2 * 60 * 1000;
    const expiresAtIso = new Date(expiresAt).toISOString();
    const expiredChallenges = await db
      .collection("trusted_account_switch_challenges")
      .where("expires_at", "<=", new Date().toISOString())
      .limit(50)
      .get();
    if (!expiredChallenges.empty) {
      const cleanup = db.batch();
      expiredChallenges.docs.forEach((expired) => cleanup.delete(expired.ref));
      await cleanup.commit();
    }
    await db.collection("trusted_account_switch_challenges").doc(challengeId).create({
      target_uid: data.targetUid,
      device_id: data.deviceId,
      nonce,
      expires_at: expiresAtIso,
      created_at: new Date().toISOString(),
    });
    return { challengeId, nonce, expiresAt };
  });

export const completeTrustedAccountSwitch = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        targetUid: z.string().min(1).max(128),
        deviceId: deviceIdSchema,
        challengeId: z.string().uuid(),
        proof: z.string().min(1).max(4096),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { createFirebaseCustomToken, getFirestoreDb } = await import("@/lib/firebase.server");
    const db = getFirestoreDb();
    const profile = await db.collection("profiles").doc(data.targetUid).get();
    const profileData = profile.data() as
      | {
          banned?: boolean;
          account_status?: string;
          investigation_hold?: boolean | { active?: boolean } | null;
        }
      | undefined;
    const investigationHold = profileData?.investigation_hold;
    if (
      profileData?.banned ||
      profileData?.account_status === "deletion_pending" ||
      profileData?.account_status === "deactivated" ||
      profileData?.account_status === "deletion_in_progress" ||
      investigationHold === true ||
      (typeof investigationHold === "object" && investigationHold?.active)
    ) {
      throw new Error("This account is currently unavailable.");
    }

    const challengeRef = db.collection("trusted_account_switch_challenges").doc(data.challengeId);
    const challenge = await challengeRef.get();
    if (
      !challenge.exists ||
      challenge.get("target_uid") !== data.targetUid ||
      challenge.get("device_id") !== data.deviceId ||
      typeof challenge.get("expires_at") !== "string" ||
      Date.parse(challenge.get("expires_at")) <= Date.now() ||
      !challenge.updateTime
    ) {
      throw new Error("This switch request expired. Please try again.");
    }

    const device = await db
      .collection("trusted_account_devices")
      .doc(`${data.targetUid}_${data.deviceId}`)
      .get();
    if (!device.exists || device.get("user_id") !== data.targetUid) {
      throw new Error("This device is no longer trusted for that account.");
    }
    const publicKey = publicKeySchema.parse(device.get("public_key"));
    const key = await importJWK(publicKey, "ES256");
    const { payload, protectedHeader } = await jwtVerify(data.proof, key, {
      algorithms: ["ES256"],
      issuer: data.targetUid,
      subject: data.targetUid,
      audience: "candid-account-switch",
    });
    if (
      protectedHeader.kid !== data.deviceId ||
      payload.jti !== data.challengeId ||
      payload["nonce"] !== challenge.get("nonce")
    ) {
      throw new Error("Could not verify this trusted device.");
    }

    await challengeRef.delete({ updateTime: challenge.updateTime });
    await device.ref.set({ updated_at: new Date().toISOString() }, { merge: true });
    return { customToken: await createFirebaseCustomToken(data.targetUid) };
  });
