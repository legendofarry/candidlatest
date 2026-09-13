import { getFirestoreDb } from "./firebase.server";
import { readCollection, readDocument, type CompanyRatingRecord } from "./firebase-data.server";

export type CompanyRatingAnswerRecord = {
  id: string;
  company_id: string;
  user_id: string;
  reasons: string[];
  would_work_here: boolean;
  created_at: string;
};

export type CompanyLocationRecord = {
  id: string;
  company_id: string;
  label: string | null;
  map_url: string | null;
  lat: number | null;
  lng: number | null;
  updated_by: string | null;
  updated_at: string;
};

export const RATING_REASONS = [
  "Paid on time, every time",
  "Salary delays",
  "Contract and statutory deductions handled",
  "No contract or missing NSSF/SHIF/PAYE",
  "Managers treat people with respect",
  "Bullying or harassment",
  "Workload is sustainable",
  "Constant unpaid overtime",
  "Real training and promotion",
  "No growth path",
  "Tribalism or nepotism in hiring",
  "Clean, fair exit process",
] as const;

export const RATING_METRICS = [
  { key: "pay_on_time", label: "Were you paid in full and on time?" },
  { key: "compliance", label: "Was your contract and statutory paperwork in order?" },
  { key: "respect", label: "How were people treated day to day?" },
  { key: "workload", label: "How reasonable was the workload?" },
  { key: "growth", label: "How much room was there to grow?" },
] as const;

export type RatingMetricKey = (typeof RATING_METRICS)[number]["key"];

/** Location a company account has pinned for itself, if any. */
export async function getCompanyLocation(companyId: string) {
  return readDocument<CompanyLocationRecord>("company_locations", companyId);
}

/** Everything the company detail screen needs beyond the base score. */
export async function buildCompanyIntel(companyId: string) {
  const [answers, ratings, location] = await Promise.all([
    readCollection<CompanyRatingAnswerRecord>("company_rating_answers"),
    readCollection<CompanyRatingRecord>("company_ratings"),
    getCompanyLocation(companyId),
  ]);

  const ours = answers.filter((answer) => answer.company_id === companyId);
  const companyRatings = ratings.filter((rating) => rating.company_id === companyId);

  const tally = new Map<string, number>();
  for (const answer of ours) {
    for (const reason of answer.reasons ?? []) {
      tally.set(reason, (tally.get(reason) ?? 0) + 1);
    }
  }

  const wouldWorkHere = ours.filter((answer) => answer.would_work_here).length;

  return {
    location,
    respondents: ours.length,
    rating_count: companyRatings.length,
    would_work_here_pct: ours.length ? Math.round((wouldWorkHere / ours.length) * 100) : null,
    reasons: [...tally.entries()]
      .map(([reason, count]) => ({
        reason,
        count,
        pct: ours.length ? Math.round((count / ours.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function saveCompanyRating(input: {
  companyId: string;
  userId: string;
  metrics: Record<RatingMetricKey, number>;
  wouldWorkHere: boolean;
  reasons: string[];
}) {
  const db = getFirestoreDb();
  const id = `${input.companyId}:${input.userId}`;
  const now = new Date().toISOString();

  await Promise.all([
    db
      .collection("company_ratings")
      .doc(id)
      .set({
        id,
        company_id: input.companyId,
        ...input.metrics,
        would_work_again: input.wouldWorkHere,
        user_id: input.userId,
        created_at: now,
      }),
    db
      .collection("company_rating_answers")
      .doc(id)
      .set({
        id,
        company_id: input.companyId,
        user_id: input.userId,
        reasons: input.reasons,
        would_work_here: input.wouldWorkHere,
        created_at: now,
      } satisfies CompanyRatingAnswerRecord),
  ]);

  return { ok: true as const };
}

export async function readMyCompanyRating(companyId: string, userId: string) {
  const id = `${companyId}:${userId}`;
  const [rating, answer] = await Promise.all([
    readDocument<CompanyRatingRecord>("company_ratings", id),
    readDocument<CompanyRatingAnswerRecord>("company_rating_answers", id),
  ]);
  if (!rating) return null;
  return { rating, reasons: answer?.reasons ?? [] };
}

export async function saveCompanyLocation(input: {
  companyId: string;
  userId: string;
  label: string | null;
  mapUrl: string | null;
  lat: number | null;
  lng: number | null;
}) {
  const db = getFirestoreDb();
  const record: CompanyLocationRecord = {
    id: input.companyId,
    company_id: input.companyId,
    label: input.label,
    map_url: input.mapUrl,
    lat: input.lat,
    lng: input.lng,
    updated_by: input.userId,
    updated_at: new Date().toISOString(),
  };
  await db.collection("company_locations").doc(input.companyId).set(record);
  return record;
}
