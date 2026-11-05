import assert from "node:assert/strict";
import test from "node:test";
import { getCompanyBrand, getCompanyBrandLogoUrl } from "./company-branding.ts";

test("company brand recognition tolerates punctuation and legal-name noise", () => {
  assert.equal(getCompanyBrand("Safaricom PLC")?.color, "#00A651");
  assert.equal(getCompanyBrand("Co-operative Bank of Kenya")?.domain, "co-opbank.co.ke");
});

test("unknown companies do not receive guessed brand identities", () => {
  assert.equal(getCompanyBrand("A locally owned employer"), null);
});

test("company brand logos use the configured official domain", () => {
  assert.match(getCompanyBrandLogoUrl("safaricom.co.ke"), /safaricom\.co\.ke/);
});
