import { createHash, randomUUID } from "node:crypto";
import { getFirestoreDb } from "./firebase.server";
import type { DocumentReference } from "./firestore-rest.server";
import {
  canSelfSwitchMembership,
  DEFAULT_MEMBERSHIP,
  getEffectiveMembershipTier,
  type MembershipTier,
} from "./membership";
import {
  getCloudinaryEvidenceConfig,
  signCloudinaryParams,
  verifyCloudinaryUploadResponse,
} from "./cloudinary-evidence.server";

const FALLBACK_PACKAGES = {
  basic: {
    name: "Basic",
    price_kes: 0,
    billing_period: "Free",
    enabled: true,
    benefits: [
      "Read and share workplace stories and salary insights",
      "Comment, save, follow, message and report",
      "All essential community and safety features",
    ],
  },
  premium: {
    name: "Premium",
    price_kes: 500,
    billing_period: "",
    enabled: true,
    benefits: [
      "Everything in Basic",
      "Pin up to 3 published stories to your profile",
      "Premium supporter badge",
    ],
  },
  // Kept to render historical billing records only; users cannot purchase Gold.
  gold: {
    name: "Gold",
    price_kes: 1000,
    billing_period: "",
    enabled: false,
    benefits: [
      "Everything in Premium",
      "Pin up to 3 published stories to your profile",
      "Gold supporter badge",
    ],
  },
} as const;

export type BillingConfig = {
  packages: Record<
    MembershipTier,
    {
      name: string;
      price_kes: number;
      billing_period: string;
      enabled: boolean;
      benefits: string[];
    }
  >;
  manual_mpesa: {
    enabled: boolean;
    mode: "paybill" | "till" | "send_money" | null;
    business_number: string;
    account_name: string;
    reference_instructions: string;
    payment_instructions: string;
  };
};

const FALLBACK_CONFIG: BillingConfig = {
  packages: {
    basic: { ...FALLBACK_PACKAGES.basic, benefits: [...FALLBACK_PACKAGES.basic.benefits] },
    premium: { ...FALLBACK_PACKAGES.premium, benefits: [...FALLBACK_PACKAGES.premium.benefits] },
    gold: { ...FALLBACK_PACKAGES.gold, benefits: [...FALLBACK_PACKAGES.gold.benefits] },
  },
  manual_mpesa: {
    enabled: true,
    mode: "send_money",
    business_number: "0715938110",
    account_name: "",
    reference_instructions:
      "Include your Candid payment reference in the M-Pesa message if available.",
    payment_instructions:
      "Send the exact amount to 0715938110 using M-Pesa Send Money. Include the Candid payment reference in the message if prompted.",
  },
};

type PaymentStatus =
  "awaiting_payment" | "pending_verification" | "approved" | "rejected" | "cancelled";
type PaymentRequest = {
  id: string;
  user_id: string;
  package_id: MembershipTier;
  package_name: string;
  expected_amount_kes: number;
  billing_period: string;
  payment_reference: string;
  status: PaymentStatus;
  created_at: string;
  transaction_code?: string | null;
  payer_phone?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  subscription_period?: { starts_at: string; ends_at: string } | null;
  proof?: {
    ticket_id: string;
    public_id: string;
    format: string;
    version: number;
    uploaded_at: string;
  } | null;
};

export type PaymentProofUploadTicket = {
  ticketId: string;
  cloudName: string;
  apiKey: string;
  publicId: string;
  timestamp: number;
  signature: string;
  type: "authenticated";
};

export async function issuePaymentProofUpload(
  userId: string,
  paymentId: string,
  size: number,
  mimeType: string,
): Promise<PaymentProofUploadTicket> {
  if (!Number.isInteger(size) || size < 1 || size > 5 * 1024 * 1024)
    throw new Error("Choose a receipt image under 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType))
    throw new Error("Attach a JPG, PNG, or WebP receipt image.");
  const db = getFirestoreDb();
  const paymentRef = db.collection("manual_payment_requests").doc(paymentId);
  const payment = await paymentRef.get();
  if (
    !payment.exists ||
    payment.get("user_id") !== userId ||
    payment.get("status") !== "awaiting_payment"
  ) {
    throw new Error("This checkout is no longer waiting for payment proof.");
  }
  const config = getCloudinaryEvidenceConfig();
  const ticketId = randomUUID();
  const publicId = `candid-payment-proofs/${paymentId}/${ticketId}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = {
    overwrite: "false",
    public_id: publicId,
    timestamp: String(timestamp),
    type: "authenticated",
  };
  const signature = await signCloudinaryParams(signedParams, config.apiSecret);
  await db
    .collection("payment_proof_uploads")
    .doc(ticketId)
    .create({
      id: ticketId,
      user_id: userId,
      payment_id: paymentId,
      cloudinary_public_id: publicId,
      expected_format: mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1],
      expected_bytes: size,
      status: "issued",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
  return {
    ticketId,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    publicId,
    timestamp,
    signature,
    type: "authenticated",
  };
}

export async function readBillingConfig(): Promise<BillingConfig> {
  const db = getFirestoreDb();
  const snapshot = await db.collection("billing_config").doc("main").get();
  const saved = snapshot.data() as Partial<BillingConfig> | undefined;
  const savedPackages = saved?.packages;
  const packages = Object.fromEntries(
    (Object.keys(FALLBACK_CONFIG.packages) as MembershipTier[]).map((tier) => [
      tier,
      {
        ...FALLBACK_CONFIG.packages[tier],
        ...savedPackages?.[tier],
        // Benefit copy describes enforced entitlements, so old config cannot
        // advertise a package feature that the server does not provide.
        benefits: [...FALLBACK_CONFIG.packages[tier].benefits],
      },
    ]),
  ) as BillingConfig["packages"];
  packages.gold = { ...packages.gold, enabled: false };
  return {
    packages,
    manual_mpesa: { ...FALLBACK_CONFIG.manual_mpesa, ...(saved?.manual_mpesa ?? {}) },
  };
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
      assignedTier:
        profile.subscription_tier === "gold"
          ? "premium"
          : profile.subscription_tier ?? DEFAULT_MEMBERSHIP.subscription_tier,
      status: profile.subscription_status ?? DEFAULT_MEMBERSHIP.subscription_status,
      source: profile.subscription_source ?? DEFAULT_MEMBERSHIP.subscription_source,
      startedAt:
        profile.subscription_started_at ??
        profile.subscription_assigned_at ??
        profile.onboarded_at ??
        profile.created_at ??
        null,
      periodEndsAt: profile.subscription_period_ends_at ?? null,
      cancelAtPeriodEnd: profile.subscription_cancel_at_period_end === true,
    },
    payments: paymentsSnapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }) as PaymentRequest)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    history: periodsSnapshot.docs
      .map((doc) => ({ ...doc.data(), id: doc.id }))
      .sort((a, b) => String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? ""))),
  };
}

export async function createManualPaymentRequest(
  userId: string,
  tier: MembershipTier,
  renewal: boolean,
) {
  if (tier === "gold") throw new Error("Gold is no longer sold separately. Choose Premium.");
  const db = getFirestoreDb();
  const [profileSnapshot, config] = await Promise.all([
    db.collection("profiles").doc(userId).get(),
    readBillingConfig(),
  ]);
  if (!profileSnapshot.exists) throw new Error("Could not find your Candid account.");
  const profile = profileSnapshot.data() ?? {};
  if (profile.account_type === "official")
    throw new Error("The official Candid account already has complimentary Premium access.");
  if (
    !config.manual_mpesa.enabled ||
    !config.manual_mpesa.business_number ||
    !config.manual_mpesa.mode
  ) {
    throw new Error("Manual M-Pesa payments are not configured yet. Please try again later.");
  }
  const selected = config.packages[tier];
  if (
    tier === "basic" ||
    !selected?.enabled ||
    !Number.isInteger(selected.price_kes) ||
    selected.price_kes <= 0
  ) {
    throw new Error("This package is not currently available for purchase.");
  }
  const effectiveTier = getEffectiveMembershipTier(profile);
  const normalizedAssignedTier = profile.subscription_tier === "gold" ? "premium" : profile.subscription_tier;
  if (renewal) {
    if (tier !== normalizedAssignedTier || profile.subscription_source !== "paid")
      throw new Error("This subscription cannot be renewed from this account.");
  } else if (tier === effectiveTier) {
    throw new Error("This is already your current package. Choose Renew if you want to extend it.");
  }
  const outstanding = await db
    .collection("manual_payment_requests")
    .where("user_id", "==", userId)
    .where("status", "in", ["awaiting_payment", "pending_verification"])
    .get();
  const activeRequests = outstanding.docs.filter((doc) => {
    const status = doc.get("status");
    const expiredCheckout =
      status === "awaiting_payment" &&
      Date.parse(String(doc.get("created_at") || "")) < Date.now() - 24 * 60 * 60_000;
    return !expiredCheckout;
  });
  const existingRequest = activeRequests.find((doc) => doc.get("package_id") === tier);
  if (existingRequest) {
    return {
      payment: { ...existingRequest.data(), id: existingRequest.id } as PaymentRequest,
      paymentDetails: config.manual_mpesa,
    };
  }
  if (activeRequests.length > 0) {
    throw new Error(
      "You already have a payment request for this package. Check its status in Billing.",
    );
  }
  const id = randomUUID();
  const reference = `CAN-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const request: PaymentRequest = {
    id,
    user_id: userId,
    package_id: tier,
    package_name: selected.name,
    expected_amount_kes: selected.price_kes,
    billing_period: selected.billing_period,
    payment_reference: reference,
    status: "awaiting_payment",
    created_at: new Date().toISOString(),
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
      const expiredCheckout =
        prior?.status === "awaiting_payment" &&
        Date.parse(prior.created_at) < Date.now() - 24 * 60 * 60_000;
      if (open && !expiredCheckout)
        throw new Error(
          "You already have a payment request for this package. Check its status in Billing.",
        );
      if (open && expiredCheckout) {
        stalePayment = priorPaymentSnapshot.updateTime
          ? { ref: priorPaymentRef, updateTime: priorPaymentSnapshot.updateTime }
          : { ref: priorPaymentRef };
      }
    }
  }
  const batch = db.batch();
  batch.create(paymentRef, request);
  if (lockSnapshot.exists) {
    if (stalePayment) {
      batch.update(
        stalePayment.ref,
        {
          status: "cancelled",
          cancelled_at: request.created_at,
          cancellation_reason: "payment_request_expired",
        },
        stalePayment.updateTime ? { updateTime: stalePayment.updateTime } : undefined,
      );
    }
    batch.update(
      lockRef,
      { payment_request_id: id, user_id: userId, package_id: tier, updated_at: request.created_at },
      lockSnapshot.updateTime ? { updateTime: lockSnapshot.updateTime } : undefined,
    );
  } else {
    batch.create(lockRef, {
      id: lockId,
      payment_request_id: id,
      user_id: userId,
      package_id: tier,
      created_at: request.created_at,
      updated_at: request.created_at,
    });
  }
  await batch.commit();
  return { payment: request, paymentDetails: config.manual_mpesa };
}

const submitBuckets = new Map<string, { count: number; resetAt: number }>();
export async function submitManualPayment(
  userId: string,
  paymentId: string,
  rawCode: string | null,
  payerPhone: string | null,
  proof: {
    ticketId: string;
    publicId: string;
    version: number;
    signature: string;
    format: string;
    bytes: number;
    type: string;
  },
) {
  const nowMs = Date.now();
  const bucket = submitBuckets.get(userId);
  if (bucket && bucket.resetAt > nowMs && bucket.count >= 5)
    throw new Error("Too many payment submissions. Try again in a few minutes.");
  submitBuckets.set(
    userId,
    !bucket || bucket.resetAt <= nowMs
      ? { count: 1, resetAt: nowMs + 10 * 60_000 }
      : { ...bucket, count: bucket.count + 1 },
  );

  const code = rawCode?.trim().toUpperCase() || null;
  if (code && !/^[A-Z0-9]{8,12}$/.test(code))
    throw new Error("Enter a valid M-Pesa transaction code or leave it blank.");
  const phone = payerPhone?.trim() || null;
  if (phone && !/^(?:\+?254|0)\d{9}$/.test(phone.replace(/[\s-]/g, "")))
    throw new Error("Enter a valid Kenyan phone number or leave it blank.");

  const db = getFirestoreDb();
  const paymentRef = db.collection("manual_payment_requests").doc(paymentId);
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists) throw new Error("Payment request not found.");
  const payment = paymentSnapshot.data() as PaymentRequest;
  if (payment.user_id !== userId) throw new Error("Payment request not found.");
  if (payment.status !== "awaiting_payment" || !paymentSnapshot.updateTime)
    throw new Error("This payment request has already been submitted or closed.");

  const ticketRef = db.collection("payment_proof_uploads").doc(proof.ticketId);
  const ticketSnapshot = await ticketRef.get();
  const ticket = ticketSnapshot.data();
  if (
    !ticketSnapshot.exists ||
    ticket?.user_id !== userId ||
    ticket?.payment_id !== paymentId ||
    ticket?.status !== "issued" ||
    ticket?.cloudinary_public_id !== proof.publicId ||
    Date.parse(String(ticket?.expires_at ?? "")) <= Date.now() ||
    ticket?.expected_bytes !== proof.bytes ||
    ticket?.expected_format !== proof.format ||
    proof.type !== "authenticated" ||
    !Number.isInteger(proof.version)
  ) {
    throw new Error("The receipt upload could not be verified. Attach it again.");
  }
  const { apiSecret } = getCloudinaryEvidenceConfig();
  const validUpload = await verifyCloudinaryUploadResponse({
    publicId: proof.publicId,
    version: proof.version,
    signature: proof.signature,
    apiSecret,
  });
  if (!validUpload)
    throw new Error("Cloudinary could not verify this receipt. Please upload it again.");

  const codeId = code ? createHash("sha256").update(code).digest("hex") : null;
  const codeRef = codeId ? db.collection("mpesa_transaction_codes").doc(codeId) : null;
  if (codeRef && (await codeRef.get()).exists)
    throw new Error("That M-Pesa transaction code has already been submitted.");
  const submittedAt = new Date().toISOString();
  const batch = db.batch();
  if (codeRef)
    batch.create(codeRef, {
      transaction_code: code,
      payment_request_id: paymentId,
      user_id: userId,
      created_at: submittedAt,
    });
  batch.update(ticketRef, { status: "attached", attached_at: submittedAt });
  batch.update(
    paymentRef,
    {
      status: "pending_verification",
      transaction_code: code,
      payer_phone: phone,
      proof: {
        ticket_id: proof.ticketId,
        public_id: proof.publicId,
        format: proof.format,
        version: proof.version,
        uploaded_at: submittedAt,
      },
      submitted_at: submittedAt,
    },
    { updateTime: paymentSnapshot.updateTime },
  );
  await batch.commit();

  try {
    const { pushServerNotification } = await import("./notifications.server");
    await pushServerNotification({
      id: `billing-payment-submitted-${paymentId}`,
      userId,
      kind: "info",
      title: "Payment submitted",
      description: "Your payment proof is awaiting verification.",
      link: "/billing",
    });
  } catch (error) {
    console.error("Could not notify member of payment submission", error);
  }
  return { status: "pending_verification" as const };
}

export async function cancelManualPaymentRequest(userId: string, paymentId: string) {
  const db = getFirestoreDb();
  const paymentRef = db.collection("manual_payment_requests").doc(paymentId);
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists || !paymentSnapshot.updateTime)
    throw new Error("Payment request not found.");
  const payment = paymentSnapshot.data() as PaymentRequest;
  if (payment.user_id !== userId) throw new Error("Payment request not found.");
  if (!["awaiting_payment", "pending_verification"].includes(payment.status)) {
    throw new Error("This payment request can no longer be cancelled.");
  }

  const cancelledAt = new Date().toISOString();
  await paymentRef.update(
    {
      status: "cancelled",
      cancelled_at: cancelledAt,
      cancellation_reason: "cancelled_by_member",
      cancelled_by: userId,
    },
    { updateTime: paymentSnapshot.updateTime },
  );

  return { status: "cancelled" as const };
}

function periodEndFrom(start: Date, billingPeriod: string) {
  const end = new Date(start);
  if (/year/i.test(billingPeriod)) end.setFullYear(end.getFullYear() + 1);
  else if (/week/i.test(billingPeriod)) end.setDate(end.getDate() + 7);
  else if (/day/i.test(billingPeriod)) end.setDate(end.getDate() + 30);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

/** Owner confirmation is the only operation that activates a manually paid package. */
export async function reviewManualPaymentRequest(
  paymentId: string,
  decision: "approve" | "reject",
  rejectionReason?: string | null,
) {
  const db = getFirestoreDb();
  const paymentRef = db.collection("manual_payment_requests").doc(paymentId);
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists || !paymentSnapshot.updateTime)
    throw new Error("Payment request not found.");
  const payment = paymentSnapshot.data() as PaymentRequest;
  if (payment.status !== "pending_verification" || !payment.proof?.public_id) {
    throw new Error("This payment is not waiting for verification or has no attached proof.");
  }
  if (decision === "reject") {
    await paymentRef.update(
      {
        status: "rejected",
        rejection_reason:
          rejectionReason?.trim() || "Payment could not be confirmed. Contact Candid support.",
        reviewed_at: new Date().toISOString(),
        reviewed_by: "owner-admin",
      },
      { updateTime: paymentSnapshot.updateTime },
    );
    try {
      const { pushServerNotification } = await import("./notifications.server");
      await pushServerNotification({
        id: `billing-payment-rejected-${paymentId}`,
        userId: payment.user_id,
        kind: "warning",
        title: "Payment needs attention",
        description:
          rejectionReason?.trim() || "Candid could not confirm your payment. Contact support.",
        link: "/billing",
      });
    } catch (error) {
      console.error("Could not notify member of payment decision", error);
    }
    return { status: "rejected" as const };
  }

  const profileRef = db.collection("profiles").doc(payment.user_id);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists || !profileSnapshot.updateTime)
    throw new Error("The member profile could not be found.");
  const profile = profileSnapshot.data() ?? {};
  const now = new Date();
  const currentEnd = profile.subscription_period_ends_at
    ? new Date(String(profile.subscription_period_ends_at))
    : null;
  const startsAt = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  const endsAt = periodEndFrom(startsAt, payment.billing_period);
  const version = Number.isInteger(profile.subscription_version)
    ? Number(profile.subscription_version) + 1
    : 1;
  const approvedAt = now.toISOString();
  const period = {
    id: paymentId,
    user_id: payment.user_id,
    package_id: payment.package_id,
    package_name: payment.package_name,
    amount_kes: payment.expected_amount_kes,
    billing_period: payment.billing_period,
    payment_request_id: paymentId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_at: approvedAt,
  };
  const eventId = `payment-${paymentId}`;
  const batch = db.batch();
  batch.update(
    paymentRef,
    {
      status: "approved",
      reviewed_at: approvedAt,
      reviewed_by: "owner-admin",
      subscription_period: { starts_at: period.starts_at, ends_at: period.ends_at },
    },
    { updateTime: paymentSnapshot.updateTime },
  );
  batch.update(
    profileRef,
    {
      subscription_tier: payment.package_id,
      subscription_status: "active",
      subscription_source: "paid",
      subscription_provider: "manual_mpesa",
      subscription_started_at: startsAt.toISOString(),
      subscription_period_ends_at: endsAt.toISOString(),
      subscription_cancel_at_period_end: false,
      subscription_version: version,
      subscription_changed_at: approvedAt,
      subscription_change_id: eventId,
    },
    { updateTime: profileSnapshot.updateTime },
  );
  batch.create(db.collection("subscription_periods").doc(paymentId), period);
  batch.create(db.collection("subscription_change_events").doc(eventId), {
    id: eventId,
    user_id: payment.user_id,
    from_tier: profile.subscription_tier ?? "basic",
    to_tier: payment.package_id,
    source: "paid",
    initiated_by: "owner-admin",
    change_type: "payment_approved",
    payment_request_id: paymentId,
    payment_processed: true,
    created_at: approvedAt,
    effective_at: startsAt.toISOString(),
    version,
  });
  await batch.commit();
  try {
    const { pushServerNotification } = await import("./notifications.server");
    await pushServerNotification({
      id: `billing-payment-approved-${paymentId}`,
      userId: payment.user_id,
      kind: "success",
      title: `${payment.package_name} is active`,
      description: `Your payment is confirmed. Your package is active until ${endsAt.toLocaleDateString("en-KE")}.`,
      link: "/billing",
    });
  } catch (error) {
    console.error("Could not notify member of payment approval", error);
  }
  return {
    status: "approved" as const,
    tier: payment.package_id,
    periodEndsAt: endsAt.toISOString(),
  };
}

export async function requestBasicDowngrade(userId: string) {
  const db = getFirestoreDb();
  const ref = db.collection("profiles").doc(userId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error("Could not find your Candid account.");
  const profile = snapshot.data() ?? {};
  if (profile.account_type === "official")
    throw new Error("The official Candid account permanently uses complimentary Premium access.");
  if (profile.subscription_source !== "paid" || !profile.subscription_period_ends_at)
    throw new Error("There is no paid subscription to cancel.");
  await ref.update(
    {
      subscription_cancel_at_period_end: true,
      subscription_cancel_requested_at: new Date().toISOString(),
    },
    snapshot.updateTime ? { updateTime: snapshot.updateTime } : undefined,
  );
  return { periodEndsAt: profile.subscription_period_ends_at };
}
