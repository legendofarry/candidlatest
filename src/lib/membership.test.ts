import test from "node:test";
import assert from "node:assert/strict";
import {
  canSelfSwitchMembership,
  getEffectiveMembershipTier,
  getMembershipEntitlements,
} from "./membership.ts";

test("effective package falls back to Basic when an assigned tier is inactive", () => {
  assert.equal(
    getEffectiveMembershipTier({ subscription_tier: "gold", subscription_status: "expired" }),
    "basic",
  );
  assert.equal(
    getEffectiveMembershipTier({ subscription_tier: "premium", subscription_status: "active" }),
    "premium",
  );
  assert.equal(
    getEffectiveMembershipTier({
      subscription_tier: "gold",
      subscription_status: "cancelled",
      subscription_source: "complimentary",
      subscription_period_ends_at: "2099-01-01",
    }),
    "basic",
  );
  assert.equal(
    getEffectiveMembershipTier({
      subscription_tier: "gold",
      subscription_status: "cancelled",
      subscription_source: "paid",
      subscription_period_ends_at: "2099-01-01",
    }),
    "premium",
  );
});

test("only the existing legacy Gold account or explicitly unlocked accounts can self-switch up", () => {
  assert.equal(
    canSelfSwitchMembership({ subscription_tier: "gold", subscription_source: "manual" }),
    true,
  );
  assert.equal(
    canSelfSwitchMembership({ subscription_tier: "gold", subscription_source: "complimentary" }),
    false,
  );
  assert.equal(
    canSelfSwitchMembership({ subscription_tier: "basic", subscription_switch_unlocked: true }),
    true,
  );
  assert.equal(canSelfSwitchMembership({ subscription_tier: "basic" }), false);
});

test("Free and Premium package limits keep safety and core actions independent", () => {
  assert.deepEqual(getMembershipEntitlements("basic"), {
    membershipBadge: false,
    maxPinnedStories: 0,
    maxComparedCompanies: 2,
    leaderboardRows: 5,
    dailyStoryCatchUps: 1,
    dailyNewConversations: 3,
    monthlySalaryReports: 3,
  });
  assert.deepEqual(getMembershipEntitlements("premium"), {
    membershipBadge: true,
    maxPinnedStories: 3,
    maxComparedCompanies: 5,
    leaderboardRows: 10,
    dailyStoryCatchUps: 10,
    dailyNewConversations: 20,
    monthlySalaryReports: 20,
  });
  assert.deepEqual(getMembershipEntitlements("gold"), {
    membershipBadge: true,
    maxPinnedStories: 3,
    maxComparedCompanies: 5,
    leaderboardRows: 10,
    dailyStoryCatchUps: 10,
    dailyNewConversations: 20,
    monthlySalaryReports: 20,
  });
});
