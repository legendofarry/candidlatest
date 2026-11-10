import { normalizeCompanyName } from "./company-match.ts";

type CompanyBrand = {
  color: string;
  domain: string | null;
  logoPath?: string;
  names: string[];
};

const companyBrands: CompanyBrand[] = [
  {
    color: "#00A651",
    domain: "safaricom.co.ke",
    logoPath: "/company-logos/safaricom.webp",
    names: ["Safaricom"],
  },
  {
    color: "#E40000",
    domain: "airtel.co.ke",
    logoPath: "/company-logos/airtel.webp",
    names: ["Airtel Kenya", "Airtel"],
  },
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
  {
    color: "#F7941D",
    domain: "twiga.com",
    logoPath: "/company-logos/twiga.webp",
    names: ["Twiga Foods", "Twiga"],
  },
  { color: "#F36C21", domain: "cellulant.io", names: ["Cellulant"] },
  { color: "#FFCC00", domain: "m-kopa.com", names: ["M-KOPA", "M-KOPA Solar"] },
  {
    color: "#183B86",
    domain: "elgonkenya.co.ke",
    logoPath: "/company-logos/elgon-kenya.webp",
    names: ["Elgon Kenya", "Elgon"],
  },
  {
    color: "#D62828",
    domain: "copiaglobal.com",
    logoPath: "/company-logos/copia.webp",
    names: ["Copia", "Copia Kenya"],
  },
  {
    color: "#172142",
    domain: "vpgroup.co.ke",
    logoPath: "/company-logos/vp-group.webp",
    names: ["VP Group"],
  },
  {
    color: "#005A9C",
    domain: "lancet.co.ke",
    logoPath: "/company-logos/lancet-laboratories.webp",
    names: ["Lancet Laboratories", "Lancet"],
  },
  {
    color: "#152A32",
    domain: "andela.com",
    logoPath: "/company-logos/andela.webp",
    names: ["Andela"],
  },
  {
    color: "#005AA7",
    domain: "mpshahhospital.org",
    logoPath: "/company-logos/mp-shah-hospital.webp",
    names: ["M.P. Shah Hospital", "M.P. Shah", "MP Shah Hospital", "MP Shah"],
  },
  {
    color: "#193A72",
    domain: "avenuehealthcare.com",
    logoPath: "/company-logos/avenue-healthcare.webp",
    names: ["Avenue Healthcare", "Avenue"],
  },
  {
    color: "#244B70",
    domain: "pesapal.com",
    logoPath: "/company-logos/pesapal.webp",
    names: ["Pesapal"],
  },
  {
    color: "#168447",
    domain: "amiran.co.ke",
    logoPath: "/company-logos/amiran-kenya.webp",
    names: ["Amiran Kenya", "Amiran"],
  },
  {
    color: "#278449",
    domain: "africastalking.com",
    logoPath: "/company-logos/africas-talking.webp",
    names: ["Africa's Talking", "Africas Talking"],
  },
  {
    color: "#19864E",
    domain: "copticmission.org",
    logoPath: "/company-logos/coptic-mission.webp",
    names: ["Coptic Mission", "Coptic Hospital", "Coptic Mission/Hospital"],
  },
  {
    color: "#293E87",
    domain: "liquid.tech",
    logoPath: "/company-logos/liquid-intelligent-technologies.webp",
    names: ["Liquid Intelligent Technologies", "Liquid Technologies", "Liquid Telecom"],
  },
  {
    color: "#007143",
    domain: "konza.go.ke",
    logoPath: "/company-logos/konza-technopolis.webp",
    names: ["Konza Technopolis", "Konza"],
  },
  {
    color: "#1599C5",
    domain: "gertrudeschildrenshospital.org",
    logoPath: "/company-logos/gertrudes-childrens-hospital.webp",
    names: ["Gertrude's Children's Hospital", "Gertrudes Children's Hospital", "Gertrude's"],
  },
  {
    color: "#005EE0",
    domain: null,
    logoPath: "/company-logos/modtechy.webp",
    names: ["Modtechy"],
  },
];

const brandByName = new Map(
  companyBrands.flatMap((brand) =>
    brand.names.map((name) => [normalizeCompanyName(name), brand] as const),
  ),
);

export function getCompanyBrand(name: string) {
  return brandByName.get(normalizeCompanyName(name)) ?? null;
}

export function getCompanyBrandLogoUrl(domain: string | null, localLogoPath?: string) {
  if (localLogoPath) return localLogoPath;
  if (!domain) return null;
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
