import { SignJWT } from "jose";

type StoredDevice = {
  id: "primary";
  deviceId: string;
  privateKey: CryptoKey;
  publicKey: JsonWebKey;
};

export type TrustedDevice = Omit<StoredDevice, "id">;

const DATABASE_NAME = "candid-trusted-account-device";
const STORE_NAME = "keys";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("Trusted account switching requires browser storage.");
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open trusted device storage."));
  });
}

async function readDevice(database: IDBDatabase): Promise<StoredDevice | undefined> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get("primary");
    request.onsuccess = () => resolve(request.result as StoredDevice | undefined);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not read the trusted device key."));
  });
}

async function writeDevice(database: IDBDatabase, device: StoredDevice): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(device);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("Could not save the trusted device key."));
  });
}

export async function getTrustedDevice(): Promise<{ device: TrustedDevice; created: boolean }> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser does not support secure account switching.");
  }
  const database = await openDatabase();
  try {
    const existing = await readDevice(database);
    if (existing) {
      return {
        device: {
          deviceId: existing.deviceId,
          privateKey: existing.privateKey,
          publicKey: existing.publicKey,
        },
        created: false,
      };
    }

    const generated = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const publicKey = await crypto.subtle.exportKey("jwk", generated.publicKey);
    const privateJwk = await crypto.subtle.exportKey("jwk", generated.privateKey);
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      privateJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const device = { deviceId: crypto.randomUUID(), privateKey, publicKey };
    await writeDevice(database, { id: "primary", ...device });
    return { device, created: true };
  } finally {
    database.close();
  }
}

export async function signTrustedSwitch(
  device: TrustedDevice,
  uid: string,
  challengeId: string,
  nonce: string,
) {
  return new SignJWT({ nonce })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: device.deviceId })
    .setIssuer(uid)
    .setSubject(uid)
    .setAudience("candid-account-switch")
    .setJti(challengeId)
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(device.privateKey);
}
