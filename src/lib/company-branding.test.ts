import assert from "node:assert/strict";
import test from "node:test";
import { getCompanyBrand, getCompanyBrandLogoUrl } from "./company-branding.ts";

test("company brand recognition tolerates punctuation and legal-name noise", () => {
  assert.equal(getCompanyBrand("Safaricom PLC")?.color, "#00A651");
  assert.equal(getCompanyBrand("Co-operative Bank of Kenya")?.domain, "co-opbank.co.ke");
  assert.equal(
    getCompanyBrand("MP Shah Hospital")?.logoPath,
    "/company-logos/mp-shah-hospital.webp",
  );
  assert.equal(
    getCompanyBrand("Gertrudes Children's Hospital")?.logoPath,
    "/company-logos/gertrudes-childrens-hospital.webp",
  );
});

test("unknown companies do not receive guessed brand identities", () => {
  assert.equal(getCompanyBrand("A locally owned employer"), null);
});

test("user-provided company logos are available through curated aliases", () => {
  const logos = [
    ["Elgon Kenya", "elgon-kenya"],
    ["Copia", "copia"],
    ["VP Group", "vp-group"],
    ["Airtel Kenya", "airtel"],
    ["Lancet Laboratories", "lancet-laboratories"],
    ["Andela", "andela"],
    ["MP Shah Hospital", "mp-shah-hospital"],
    ["Avenue Healthcare", "avenue-healthcare"],
    ["Pesapal", "pesapal"],
    ["Twiga Foods", "twiga"],
    ["Amiran Kenya", "amiran-kenya"],
    ["Africa's Talking", "africas-talking"],
    ["Coptic Hospital", "coptic-mission"],
    ["Liquid Intelligent Technologies", "liquid-intelligent-technologies"],
    ["Konza Technopolis", "konza-technopolis"],
    ["Gertrudes Children's Hospital", "gertrudes-childrens-hospital"],
    ["Safaricom", "safaricom"],
    ["Modtechy", "modtechy"],
  ] as const;

  for (const [name, asset] of logos) {
    assert.equal(getCompanyBrand(name)?.logoPath, `/company-logos/${asset}.webp`, name);
  }
});

test("company brand logos use the configured official domain", () => {
  assert.match(getCompanyBrandLogoUrl("safaricom.co.ke"), /safaricom\.co\.ke/);
  assert.equal(
    getCompanyBrandLogoUrl("safaricom.co.ke", "/company-logos/safaricom.webp"),
    "/company-logos/safaricom.webp",
  );
});
