import test from "node:test";
import assert from "node:assert/strict";
import {
  canSelfSwitchMembership,
  getEffectiveMembershipTier,
  getMembershipEntitlements,
} from "./membership.ts";

test("effective package falls back to Basic when an assigned tier is inactive", () => {
  assert.equal(getEffectiveMembershipTier({ subscription_tier: "gold", subscription_status: "expired" }), "basic");
  assert.equal(getEffectiveMembershipTier({ subscription_tier: "premium", subscription_status: "active" }), "premium");
  assert.equal(getEffectiveMembershipTier({ subscription_tier: "gold", subscription_status: "cancelled", subscription_source: "complimentary", subscription_period_ends_at: "2099-01-01" }), "basic");
  assert.equal(getEffectiveMembershipTier({ subscription_tier: "gold", subscription_status: "cancelled", subscription_source: "paid", subscription_period_ends_at: "2099-01-01" }), "gold");
});

test("only the existing legacy Gold account or explicitly unlocked accounts can self-switch up", () => {
  assert.equal(canSelfSwitchMembership({ subscription_tier: "gold", subscription_source: "manual" }), true);
  assert.equal(canSelfSwitchMembership({ subscription_tier: "gold", subscription_source: "complimentary" }), false);
  assert.equal(canSelfSwitchMembership({ subscription_tier: "basic", subscription_switch_unlocked: true }), true);
  assert.equal(canSelfSwitchMembership({ subscription_tier: "basic" }), false);
});

test("package entitlements only expose the implemented membership badge", () => {
  assert.deepEqual(getMembershipEntitlements("basic"), { membershipBadge: false });
  assert.deepEqual(getMembershipEntitlements("premium"), { membershipBadge: true });
  assert.deepEqual(getMembershipEntitlements("gold"), { membershipBadge: true });
});
