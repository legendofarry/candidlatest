import test from "node:test";
import assert from "node:assert/strict";
import {
  describeRatingSample,
  describeSalaryEvidence,
  formatRatingScore,
} from "./company-comparison.ts";

test("rating summaries distinguish no responses from a zero rating", () => {
  assert.equal(formatRatingScore(0, null), "Not rated yet");
  assert.match(describeRatingSample(0), /missing information/);
  assert.equal(formatRatingScore(1, 0), "0.0 / 5");
});

test("rating summaries disclose small and growing samples", () => {
  assert.match(describeRatingSample(2), /very small sample/);
  assert.match(describeRatingSample(8), /sample is still limited/);
  assert.match(describeRatingSample(20), /20 member responses/);
});

test("salary disclosures distinguish missing, unavailable, and reported data", () => {
  assert.equal(describeSalaryEvidence(null).value, "No reports yet");
  assert.equal(describeSalaryEvidence(null, true).value, "Unavailable");
  const reported = describeSalaryEvidence({ contributions: 2, positions: 2 });
  assert.equal(reported.value, "2 reports");
  assert.match(reported.detail, /aren’t like-for-like/);
});
