import { normalizeCompanyName } from "./company-match.ts";

type CompanyBrand = {
  color: string;
  domain: string;
  names: string[];
};

const companyBrands: CompanyBrand[] = [
  { color: "#00A651", domain: "safaricom.co.ke", names: ["Safaricom"] },
  { color: "#E40000", domain: "airtel.co.ke", names: ["Airtel Kenya", "Airtel"] },
  { color: "#0099CC", domain: "telkom.co.ke", names: ["Telkom Kenya", "Telkom"] },
  { color: "#E31837", domain: "equitygroupholdings.com", names: ["Equity Bank", "Equity"] },
  { color: "#007A4B", domain: "kcbgroup.com", names: ["KCB Bank", "KCB"] },
  {
    color: "#00843D",
    domain: "co-opbank.co.ke",
    names: ["Co-operative Bank", "Cooperative Bank", "Co-op Bank", "Co-operative Bank of Kenya"],
  },
  { color: "#AF0000", domain: "absa.co.ke", names: ["Absa Bank Kenya", "Absa"] },
  {
    color: "#76232F",
    domain: "ncbagroup.com",
    names: ["NCBA Bank", "NCBA"],
  },
  {
    color: "#0072AA",
    domain: "sc.com",
    names: ["Standard Chartered Kenya", "Standard Chartered"],
  },
  { color: "#004E9E", domain: "carrefour.ke", names: ["Carrefour"] },
  { color: "#00A94F", domain: "naivas.online", names: ["Naivas"] },
  { color: "#ED1C24", domain: "quickmart.co.ke", names: ["Quickmart"] },
  { color: "#00AEEF", domain: "kplc.co.ke", names: ["Kenya Power"] },
  { color: "#C8102E", domain: "kenya-airways.com", names: ["Kenya Airways"] },
  { color: "#003F2D", domain: "eabl.com", names: ["East African Breweries", "Kenya Breweries"] },
  { color: "#4A2C22", domain: "javahouseafrica.com", names: ["Java House"] },
  { color: "#D40511", domain: "dhl.com", names: ["DHL Kenya", "DHL"] },
  { color: "#F7941D", domain: "twiga.com", names: ["Twiga Foods", "Twiga"] },
  { color: "#F36C21", domain: "cellulant.io", names: ["Cellulant"] },
  { color: "#FFCC00", domain: "m-kopa.com", names: ["M-KOPA", "M-KOPA Solar"] },
];

const brandByName = new Map(
  companyBrands.flatMap((brand) =>
    brand.names.map((name) => [normalizeCompanyName(name), brand] as const),
  ),
);

export function getCompanyBrand(name: string) {
  return brandByName.get(normalizeCompanyName(name)) ?? null;
}

export function getCompanyBrandLogoUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

/** Brand colour for any employer: mapped brand hue, or a stable generated hue from the name. */
export function getCompanyAccent(name: string) {
  const brand = getCompanyBrand(name);
  if (brand) return brand.color;
  let hash = 0;
  for (const char of normalizeCompanyName(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 72% 56%)`;
}

export function getCompanyMonogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : name.trim().slice(0, 2);
  return letters.toUpperCase();
}
