/** Shared employer-name normalization + fuzzy matching (client and server safe). */

const NOISE_WORDS = new Set([
  "ltd",
  "limited",
  "kenya",
  "ke",
  "ea",
  "enterprises",
  "enterprise",
  "shop",
  "store",
  "stores",
  "company",
  "co",
  "group",
  "holdings",
  "services",
  "the",
]);

export function normalizeCompanyName(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE_WORDS.has(token));
  return tokens.join(" ");
}

/** True when two names likely refer to the same business. */
export function companiesLikelySame(a: string, b: string): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

export type CompanyMatchCandidate = {
  id: string;
  name: string;
  slug: string;
  aliases?: string[] | null;
};

/** Finds existing companies that match a typed name, best match first. */
export function findCompanyMatches<T extends CompanyMatchCandidate>(
  typed: string,
  companies: T[],
  limit = 4,
): T[] {
  const needle = typed.trim();
  if (needle.length < 2) return [];
  const normalizedNeedle = normalizeCompanyName(needle);
  const scored = companies
    .map((company) => {
      const names = [company.name, ...(company.aliases ?? [])];
      let best = 0;
      for (const candidate of names) {
        if (!candidate) continue;
        const lower = candidate.toLowerCase();
        if (lower === needle.toLowerCase()) best = Math.max(best, 100);
        else if (companiesLikelySame(candidate, needle)) best = Math.max(best, 80);
        else if (normalizedNeedle && lower.includes(normalizedNeedle)) best = Math.max(best, 50);
        else if (lower.includes(needle.toLowerCase())) best = Math.max(best, 40);
      }
      return { company, score: best };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name));
  return scored.slice(0, limit).map((entry) => entry.company);
}
