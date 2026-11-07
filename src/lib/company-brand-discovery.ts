import { normalizeCompanyName } from "./company-match.ts";

/** Pure helpers for automatically finding an employer's website, logo and brand colour. */

export type SiteIcon = { href: string; size: number; kind: "apple" | "icon" };
export type SiteIdentity = {
  title: string;
  siteName: string;
  ogTitle: string;
  headings: string;
  themeColor: string | null;
  icons: SiteIcon[];
};

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp", ".test", ".invalid", ".example"];

/** Returns a clean public hostname, or null for anything that is not an ordinary public domain. */
export function cleanPublicDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\./, "");
  if (host.length < 4 || host.length > 100) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
  const tld = host.split(".").pop() ?? "";
  if (!/^[a-z]{2,24}$/.test(tld)) return null; // also rejects raw IPv4 such as 10.0.0.1
  if (host === "localhost" || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  return host;
}

function attr(tag: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return (match?.[2] ?? match?.[3] ?? match?.[4] ?? "").trim();
}

function decode(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHex(value: string | null | undefined): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? "").trim());
  if (!match) return null;
  const raw = match[1]!.toLowerCase();
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return `#${full}`;
}

export function parseSiteIdentity(html: string, baseUrl: string): SiteIdentity {
  const head = html.slice(0, 250_000);
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key: string) => {
    for (const tag of metas) {
      const name = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
      if (name === key) return decode(attr(tag, "content"));
    }
    return "";
  };
  const headings = (head.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) ?? [])
    .slice(0, 3)
    .map((h) => decode(h.replace(/<[^>]+>/g, " ")))
    .join(" ");

  const icons: SiteIcon[] = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/(^|\s)(apple-touch-icon(-precomposed)?|icon|shortcut icon)(\s|$)/.test(rel)) continue;
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https:\/\//.test(absolute)) continue;
    const sizeMatch = /(\d+)x\d+/.exec(attr(tag, "sizes"));
    icons.push({
      href: absolute,
      size: sizeMatch ? Number(sizeMatch[1]) : /\.svg(\?|$)/i.test(absolute) ? 512 : 32,
      kind: rel.includes("apple") ? "apple" : "icon",
    });
  }

  return {
    title,
    siteName: meta("og:site_name") || meta("application-name"),
    ogTitle: meta("og:title"),
    headings,
    themeColor: normalizeHex(meta("theme-color")),
    icons,
  };
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A colour worth theming a hero with: not white, not black, not a flat grey. */
export function usableBrandColor(hex: string | null | undefined): string | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const l = luminance(normalized);
  if (l > 0.93 || l < 0.04) return null;
  const channels = [1, 3, 5].map((i) => parseInt(normalized.slice(i, i + 2), 16));
  if (Math.max(...channels) - Math.min(...channels) < 24) return null;
  return normalized;
}

/**
 * Guards against the AI naming a wrong or unrelated website: the page itself has to
 * mention the employer (title, site name, headline or the domain).
 */
export function pageMatchesCompany(companyName: string, hostname: string, identity: SiteIdentity): boolean {
  const tokens = normalizeCompanyName(companyName)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
  if (tokens.length === 0) return false;
  const haystack = `${hostname} ${identity.title} ${identity.siteName} ${identity.ogTitle} ${identity.headings}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  const squashed = haystack.replace(/ /g, "");
  const hits = tokens.filter((token) => haystack.includes(token) || squashed.includes(token)).length;
  return hits / tokens.length >= 0.6;
}

/** Best logo-like icon: large touch icons first, then the largest declared icon. */
export function pickLogoUrl(icons: SiteIcon[]): string | null {
  const score = (icon: SiteIcon) => (icon.kind === "apple" ? 1000 : 0) + Math.min(icon.size, 512);
  return [...icons].sort((a, b) => score(b) - score(a))[0]?.href ?? null;
}
