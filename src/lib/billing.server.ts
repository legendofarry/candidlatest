import { createHash, randomUUID } from "node:crypto";
import { getFirestoreDb } from "./firebase.server";
import type { DocumentReference } from "./firestore-rest.server";
import { canSelfSwitchMembership, DEFAULT_MEMBERSHIP, getEffectiveMembershipTier, type MembershipTier } from "./membership";

const FALLBACK_PACKAGES = {
  basic: { name: "Basic", price_kes: 0, billing_period: "Free", enabled: true, benefits: ["Read and share workplace stories", "Save stories and message members"] },
  premium: { name: "Premium", price_kes: 500, billing_period: "One month", enabled: true, benefits: ["All Basic features", "Premium membership badge"] },
  gold: { name: "Gold", price_kes: 1000, billing_period: "One month", enabled: false, benefits: ["All Premium features", "Gold membership badge"] },
} as const;

export type BillingConfig = {
  packages: Record<MembershipTier, { name: string; price_kes: number; billing_period: string; enabled: boolean; benefits: string[] }>;
  manual_mpesa: { enabled: boolean; mode: "paybill" | "till" | "send_money" | null; business_number: string; account_name: string; reference_instructions: string; payment_instructions: string };
};

const FALLBACK_CONFIG: BillingConfig = {
  packages: FALLBACK_PACKAGES,
  manual_mpesa: { enabled: false, mode: "send_money", business_number: "0715938110", account_name: "", reference_instructions: "Include your Candid payment reference in the M-Pesa message if available.", payment_instructions: "" },
};

type PaymentStatus = "awaiting_payment" | "pending_verification" | "approved" | "rejected" | "cancelled";
type PaymentRequest = {
  id: string; user_id: string; package_id: MembershipTier; package_name: string; expected_amount_kes: number;
  billing_period: string; payment_reference: string; status: PaymentStatus; created_at: string;
  transaction_code?: string | null; payer_phone?: string | null; submitted_at?: string | null;
  reviewed_at?: string | null; rejection_reason?: string | null; subscription_period?: { starts_at: string; ends_at: string } | null;
};

export async function readBillingConfig(): Promise<BillingConfig> {
  const db = getFirestoreDb();
  const snapshot = await db.collection("billing_config").doc("main").get();
  const saved = snapshot.data() as Partial<BillingConfig> | undefined;
  const packages = { ...FALLBACK_CONFIG.packages, ...(saved?.packages ?? {}) } as BillingConfig["packages"];
  return { packages, manual_mpesa: { ...FALLBACK_CONFIG.manual_mpesa, ...(saved?.manual_mpesa ?? {}) } };
}

export async function getMyBillingSummary(userId: string) {
  const db = getFirestoreDb();
  const [profileSnapshot, paymentsSnapshot, periodsSnapshot] = await Promise.all([
    db.collection("profiles").doc(userId).get(),
    db.collection("manual_payment_requests").where("user_id", "==", userId).get(),
    db.collection("subscription_periods").where("user_id", "==", userId).get(),
  ]);
  const profile = profileSnapshot.data() ?? {};
  return {
    membership: {
      accountType: profile.account_type ?? "individual",
      canSelfSwitch: canSelfSwitchMembership(profile),
      version: Number.isInteger(profile.subscription_version) ? profile.subscription_version : 0,
      tier: getEffectiveMembershipTier(profile),
      assignedTier: profile.subscription_tier ?? DEFAULT_MEMBERSHIP.subscription_tier,
      status: profile.subscription_status ?? DEFAULT_MEMBERSHIP.subscription_status,
      source: profile.subscription_source ?? DEFAULT_MEMBERSHIP.subscription_source,
      periodEndsAt: profile.subscription_period_ends_at ?? null,
      cancelAtPeriodEnd: profile.subscription_cancel_at_period_end === true,
    },
    payments: paymentsSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as PaymentRequest)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    history: periodsSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })).sort((a, b) => String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? ""))),
  };
}

export async function createManualPaymentRequest(userId: string, tier: MembershipTier, renewal: boolean) {
  const db = getFirestoreDb();
  const [profileSnapshot, config] = await Promise.all([
    db.collection("profiles").doc(userId).get(), readBillingConfig(),
  ]);
  if (!profileSnapshot.exists) throw new Error("Could not find your Candid account.");
  const profile = profileSnapshot.data() ?? {};
  if (profile.account_type === "official") throw new Error("The official Candid account already has complimentary Gold access.");
  if (!config.manual_mpesa.enabled || !config.manual_mpesa.business_number || !config.manual_mpesa.mode) {
    throw new Error("Manual M-Pesa payments are not configured yet. Please try again later.");
  }
  const selected = config.packages[tier];
  if (tier === "basic" || !selected?.enabled || !Number.isInteger(selected.price_kes) || selected.price_kes <= 0) {
    throw new Error("This package is not currently available for purchase.");
  }
  const effectiveTier = getEffectiveMembershipTier(profile);
  if (renewal) {
    if (tier !== profile.subscription_tier || profile.subscription_source !== "paid") throw new Error("This subscription cannot be renewed from this account.");
  } else if (tier === effectiveTier) {
    throw new Error("This is already your current package. Choose Renew if you want to extend it.");
  }
  const outstanding = await db.collection("manual_payment_requests").where("user_id", "==", userId).where("status", "in", ["awaiting_payment", "pending_verification"]).get();
  if (outstanding.docs.some((doc) => {
    const status = doc.get("status");
    const expiredCheckout = status === "awaiting_payment" && Date.parse(String(doc.get("created_at") || "")) < Date.now() - 24 * 60 * 60_000;
    return !expiredCheckout;
  })) {
    throw new Error("You already have a payment request for this package. Check its status in Billing.");
  }
  const id = randomUUID();
  const reference = `CAN-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const request: PaymentRequest = {
    id, user_id: userId, package_id: tier, package_name: selected.name,
    expected_amount_kes: selected.price_kes, billing_period: selected.billing_period,
    payment_reference: reference, status: "awaiting_payment", created_at: new Date().toISOString(),
  };
  const paymentRef = db.collection("manual_payment_requests").doc(id);
  const lockId = createHash("sha256").update(userId).digest("hex");
  const lockRef = db.collection("manual_payment_request_locks").doc(lockId);
  const lockSnapshot = await lockRef.get();
  let stalePayment: { ref: DocumentReference; updateTime?: string } | null = null;
  if (lockSnapshot.exists) {
    const priorId = String(lockSnapshot.get("payment_request_id") || "");
    if (priorId) {
      const priorPaymentRef = db.collection("manual_payment_requests").doc(priorId);
      const priorPaymentSnapshot = await priorPaymentRef.get();
      const prior = priorPaymentSnapshot.data() as PaymentRequest | undefined;
      const open = prior && ["awaiting_payment", "pending_verification"].includes(prior.status);
      const expiredCheckout = prior?.status === "awaiting_payment" && Date.parse(prior.created_at) < Date.now() - 24 * 60 * 60_000;
      if (open && !expiredCheckout) throw new Error("You already have a payment request for this package. Check its status in Billing.");
      if (open && expiredCheckout) stalePayment = { ref: priorPaymentRef, updateTime: priorPaymentSnapshot.updateTime };
    }
  }
  const batch = db.batch();
  batch.create(paymentRef, request);
  if (lockSnapshot.exists) {
    if (stalePayment) {
      batch.update(stalePayment.ref, { status: "cancelled", cancelled_at: request.created_at, cancellation_reason: "payment_request_expired" }, stalePayment.updateTime ? { updateTime: stalePayment.updateTime } : undefined);
    }
    batch.update(lockRef, { payment_request_id: id, user_id: userId, package_id: tier, updated_at: request.created_at }, lockSnapshot.updateTime ? { updateTime: lockSnapshot.updateTime } : undefined);
  } else {
    batch.create(lockRef, { id: lockId, payment_request_id: id, user_id: userId, package_id: tier, created_at: request.created_at, updated_at: request.created_at });
  }
  await batch.commit();
  return { payment: request, paymentDetails: config.manual_mpesa };
}

const submitBuckets = new Map<string, { count: number; resetAt: number }>();
export async function submitManualPayment(userId: string, paymentId: string, rawCode: string, payerPhone: string | null) {
  const nowMs = Date.now();
  const bucket = submitBuckets.get(userId);
  if (bucket && bucket.resetAt > nowMs && bucket.count >= 5) throw new Error("Too many payment submissions. Try again in a few minutes.");
  submitBuckets.set(userId, !bucket || bucket.resetAt <= nowMs ? { count: 1, resetAt: nowMs + 10 * 60_000 } : { ...bucket, count: bucket.count + 1 });

  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{8,12}$/.test(code)) throw new Error("Enter a valid M-Pesa transaction code.");
  const phone = payerPhone?.trim() || null;
  if (phone && !/^(?:\+?254|0)\d{9}$/.test(phone.replace(/[\s-]/g, ""))) throw new Error("Enter a valid Kenyan phone number or leave it blank.");

  const db = getFirestoreDb();
  const paymentRef = db.collection("manual_payment_requests").doc(paymentId);
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists) throw new Error("Payment request not found.");
  const payment = paymentSnapshot.data() as PaymentRequest;
  if (payment.user_id !== userId) throw new Error("Payment request not found.");
  if (payment.status !== "awaiting_payment" || !paymentSnapshot.updateTime) throw new Error("This payment request has already been submitted or closed.");

  const codeId = createHash("sha256").update(code).digest("hex");
  const codeRef = db.collection("mpesa_transaction_codes").doc(codeId);
  const batch = db.batch();
  batch.create(codeRef, { transaction_code: code, payment_request_id: paymentId, user_id: userId, created_at: new Date().toISOString() });
  batch.update(paymentRef, { status: "pending_verification", transaction_code: code, payer_phone: phone, submitted_at: new Date().toISOString() }, { updateTime: paymentSnapshot.updateTime });
  await batch.commit();

  const { pushServerNotification } = await import("./notifications.server");
  await pushServerNotification({ id: `billing-payment-submitted-${paymentId}`, userId, kind: "info", title: "Payment submitted", description: "Your M-Pesa payment is awaiting verification.", link: "/billing" });
  return { status: "pending_verification" as const };
}

export async function requestBasicDowngrade(userId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("profiles").doc(userId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Could not find your Candid account.");
  const profile = snapshot.data() ?? {};
  if (profile.account_type === "official") throw new Error("The official Candid account permanently uses complimentary Gold access.");
  if (profile.subscription_source !== "paid" || !profile.subscription_period_ends_at) throw new Error("There is no paid subscription to cancel.");
  await ref.update({ subscription_cancel_at_period_end: true, subscription_cancel_requested_at: new Date().toISOString() }, snapshot.updateTime ? { updateTime: snapshot.updateTime } : undefined);
  return { periodEndsAt: profile.subscription_period_ends_at };
}

