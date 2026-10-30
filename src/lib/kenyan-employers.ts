const employerGroups = [
  {
    industry: "Telecommunications & technology",
    names: [
      "Safaricom",
      "Airtel Kenya",
      "Telkom Kenya",
      "Jamii Telecommunications (Faiba)",
      "Liquid Intelligent Technologies",
      "SEACOM",
      "Poa Internet",
      "BRCK",
      "Cellulant",
      "M-KOPA",
      "Copia Global",
      "Twiga Foods",
      "Sendy",
      "Wasoko",
      "Pesapal",
      "Craft Silicon",
      "Andela",
      "Africa's Talking",
      "Konza Technopolis",
    ],
  },
  {
    industry: "Banking & financial services",
    names: [
      "Equity Bank",
      "KCB Bank",
      "Co-operative Bank",
      "NCBA Bank",
      "Absa Bank Kenya",
      "Standard Chartered Kenya",
      "Stanbic Bank",
      "I&M Bank",
      "DTB (Diamond Trust Bank)",
      "Family Bank",
      "Bank of Baroda",
      "Bank of India",
      "Ecobank",
      "Access Bank Kenya",
      "HF Group",
      "Sidian Bank",
      "Kingdom Bank",
      "Prime Bank",
      "Credit Bank",
      "KWFT",
      "Britam",
      "CIC Insurance",
      "Jubilee Insurance",
      "APA Insurance",
      "Old Mutual Kenya",
      "ICEA LION",
    ],
  },
  {
    industry: "Retail & supermarkets",
    names: [
      "Naivas",
      "Carrefour",
      "Quickmart",
      "Chandarana Foodplus",
      "Cleanshelf",
      "Magunas Supermarket",
      "Eastmatt",
      "Tumaini Supermarket",
      "Goodlife Pharmacy",
      "Pharmart",
      "Text Book Centre",
      "Bata Kenya",
      "Deacons",
      "Vivo Fashion Group",
      "ShopZetu",
    ],
  },
  {
    industry: "Manufacturing & FMCG",
    names: [
      "Bidco Africa",
      "Brookside Dairy",
      "Kenya Breweries",
      "East African Breweries",
      "Coca-Cola Beverages Africa",
      "Pepsi Kenya",
      "Kevian Kenya",
      "Kapa Oil Refineries",
      "Unga Group",
      "Del Monte Kenya",
      "Menengai Oil",
      "Pwani Oil",
      "Sameer Africa",
      "Bamburi Cement",
      "Devki Group",
      "Mabati Rolling Mills",
      "Crown Paints",
      "Kenya Seed Company",
      "Kenchic",
      "Bakhresa Grain Milling",
    ],
  },
  {
    industry: "Energy & utilities",
    names: [
      "Kenya Power",
      "KenGen",
      "Kenya Pipeline Company",
      "Kenya Electricity Transmission Company (KETRACO)",
      "Rubis Energy Kenya",
      "TotalEnergies Kenya",
      "Vivo Energy Kenya",
      "Hass Petroleum",
      "Ola Energy",
      "Gulf Energy",
      "Kenya Petroleum Refineries",
      "M-KOPA Solar",
      "PowerGen Renewable Energy",
    ],
  },
  {
    industry: "Transport, logistics & aviation",
    names: [
      "Kenya Airways",
      "Jambojet",
      "Skyward Express",
      "DHL Kenya",
      "Fargo Courier",
      "G4S Kenya",
      "Wells Fargo Courier",
      "Siginon Group",
      "Mitchell Cotts",
      "Modern Coast",
      "Little",
      "BasiGo",
      "Uber Kenya",
      "Bolt Kenya",
    ],
  },
  {
    industry: "Media & entertainment",
    names: [
      "Nation Media Group",
      "Royal Media Services",
      "Standard Group",
      "Mediamax Network",
      "Radio Africa Group",
      "Citizen TV",
      "KTN",
      "NTV Kenya",
      "K24",
      "Switch TV",
    ],
  },
  {
    industry: "Hospitality & restaurants",
    names: [
      "Java House",
      "Artcaffé",
      "Big Square",
      "Chicken Inn",
      "Pizza Inn",
      "Galito's",
      "KFC Kenya",
      "Subway Kenya",
      "Serena Hotels",
      "Sarova Hotels",
      "PrideInn Hotels",
      "Trademark Hotel",
      "Villa Rosa Kempinski",
      "Tamarind Group",
      "EKA Hotel",
    ],
  },
  {
    industry: "Real estate & construction",
    names: [
      "Centum Real Estate",
      "HassConsult",
      "Cytonn Real Estate",
      "BuyRentKenya",
      "Optiven",
      "Mi Vida Homes",
      "Acorn Holdings",
      "Two Rivers Development",
      "Knight Frank Kenya",
      "Pam Golding Properties",
      "China Wu Yi",
      "Epco Builders",
      "Laxmanbhai Construction",
    ],
  },
  {
    industry: "Education",
    names: [
      "Riara Group of Schools",
      "Brookhouse Schools",
      "Nova Pioneer",
      "Makini Schools",
      "Braeburn Schools",
      "Crawford International School",
      "Mount Kenya University",
      "Strathmore University",
      "USIU-Africa",
      "Zetech University",
      "KCA University",
      "Africa Nazarene University",
    ],
  },
  {
    industry: "Healthcare",
    names: [
      "Aga Khan University Hospital",
      "Nairobi Hospital",
      "MP Shah Hospital",
      "Gertrude's Children's Hospital",
      "Avenue Healthcare",
      "Coptic Hospital",
      "Mater Misericordiae Hospital",
      "Mediheal Group",
      "Lancet Laboratories",
      "Pathologists Lancet Kenya",
    ],
  },
  {
    industry: "Agriculture",
    names: [
      "Kakuzi",
      "Sasini",
      "Kakuzi PLC",
      "Vegpro Group",
      "Flamingo Horticulture",
      "Amiran Kenya",
      "Kenya Tea Development Agency",
      "East African Growers",
      "Elgon Kenya",
    ],
  },
] as const;

export const knownKenyanEmployers = employerGroups.flatMap(({ industry, names }) =>
  names.map((name) => ({ name, industry })),
);

/** Resolve an exact curated employer name/alias without fuzzy matching unrelated businesses. */
export function findKnownKenyanEmployer(name: string) {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return null;
  return (
    knownKenyanEmployers.find((employer) => normalizeCompanyName(employer.name) === normalized) ??
    null
  );
}

function slugifyEmployerName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "company"
  );
}

export function getKnownKenyanEmployerDirectoryEntries() {
  return knownKenyanEmployers.map((employer, index) => ({
    id: `seed-${slugifyEmployerName(employer.name)}-${index}`,
    slug: slugifyEmployerName(employer.name),
    name: employer.name,
    industry: employer.industry,
    county: null,
    // Presence in the curated catalogue means "known listing", not verified.
    verified: false,
    is_public: true,
    created_at: "2024-01-01T00:00:00.000Z",
    aliases: [],
  }));
}
import { normalizeCompanyName } from "./company-match";
