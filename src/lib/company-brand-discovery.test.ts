import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanPublicDomain,
  parseSiteIdentity,
  pageMatchesCompany,
  pickLogoUrl,
  usableBrandColor,
} from "./company-brand-discovery.ts";

test("only ordinary public domains are accepted", () => {
  assert.equal(cleanPublicDomain("https://www.Stima.co.ke/about"), "stima.co.ke");
  assert.equal(cleanPublicDomain("localhost"), null);
  assert.equal(cleanPublicDomain("10.0.0.1"), null);
  assert.equal(cleanPublicDomain("intranet.corp"), null);
  assert.equal(cleanPublicDomain("not a domain"), null);
  assert.equal(cleanPublicDomain(null), null);
});

const html = `<html><head><title>Twiga Foods | Fresh produce for Kenya</title>
<meta name="theme-color" content="#F7941D"><meta property="og:site_name" content="Twiga Foods">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/touch-180.png" sizes="180x180"></head><body><h1>Twiga</h1></body></html>`;

test("site identity, colour and icons are read from the page", () => {
  const identity = parseSiteIdentity(html, "https://twiga.com/");
  assert.equal(identity.themeColor, "#f7941d");
  assert.equal(identity.siteName, "Twiga Foods");
  assert.equal(pickLogoUrl(identity.icons), "https://twiga.com/touch-180.png");
});

test("a page must actually mention the employer", () => {
  const identity = parseSiteIdentity(html, "https://twiga.com/");
  assert.equal(pageMatchesCompany("Twiga Foods Ltd", "twiga.com", identity), true);
  assert.equal(pageMatchesCompany("Mama Pima Salon", "twiga.com", identity), false);
  assert.equal(pageMatchesCompany("AB", "twiga.com", identity), false);
});

test("white, black and grey are not brand colours", () => {
  assert.equal(usableBrandColor("#ffffff"), null);
  assert.equal(usableBrandColor("#000000"), null);
  assert.equal(usableBrandColor("#808080"), null);
  assert.equal(usableBrandColor("#00a651"), "#00a651");
});
