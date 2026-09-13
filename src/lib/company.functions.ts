import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import {
  buildCompanyIntel,
  readMyCompanyRating,
  saveCompanyLocation,
  saveCompanyRating,
  type RatingMetricKey,
} from "./company.server";

function isFirebaseReadUnavailable(error: unknown) {
  return (
    error instanceof Error &&
    /PERMISSION_DENIED|Firestore API|Missing Firebase admin|Failed to parse private key|FIREBASE_SERVICE_ACCOUNT_JSON/.test(
      error.message,
    )
  );
}

const Metrics = z.object({
  pay_on_time: z.number().min(1).max(5),
  compliance: z.number().min(1).max(5),
  respect: z.number().min(1).max(5),
  workload: z.number().min(1).max(5),
  growth: z.number().min(1).max(5),
});

export const getCompanyIntel = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ company_id: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    try {
      return await buildCompanyIntel(data.company_id);
    } catch (error) {
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[getCompanyIntel] Firebase read unavailable", error);
      return {
        location: null,
        respondents: 0,
        rating_count: 0,
        would_work_here_pct: null,
        reasons: [],
      };
    }
  });

export const getMyCompanyRating = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ company_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => readMyCompanyRating(data.company_id, context.userId));

export const rateCompanyFromQuestionnaire = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().min(1),
        metrics: Metrics,
        would_work_here: z.boolean(),
        reasons: z.array(z.string().min(2).max(120)).max(12).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) =>
    saveCompanyRating({
      companyId: data.company_id,
      userId: context.userId,
      metrics: data.metrics as Record<RatingMetricKey, number>,
      wouldWorkHere: data.would_work_here,
      reasons: data.reasons,
    }),
  );

export const setCompanyLocation = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_id: z.string().min(1),
        label: z.string().max(160).nullable().default(null),
        map_url: z.string().url().max(500).nullable().default(null),
        lat: z.number().min(-90).max(90).nullable().default(null),
        lng: z.number().min(-180).max(180).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.map_url && (data.lat === null || data.lng === null)) {
      throw new Error("Pin your location or paste a map link.");
    }
    return saveCompanyLocation({
      companyId: data.company_id,
      userId: context.userId,
      label: data.label,
      mapUrl: data.map_url,
      lat: data.lat,
      lng: data.lng,
    });
  });
