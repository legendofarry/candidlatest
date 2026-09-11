import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildCompanyScores,
  buildSalaryAggregates,
  getCompanyView,
  getFilterOptionsData,
  getPublicStories,
  getStoryView,
  searchData,
} from "./firebase-data.server";

function isFirebaseReadUnavailable(error: unknown) {
  return (
    error instanceof Error &&
    /PERMISSION_DENIED|Firestore API|Missing Firebase admin/.test(error.message)
  );
}

const FeedInput = z.object({
  sort: z.enum(["new", "top", "trending"]).default("new"),
  industry: z.string().nullable().default(null),
  county: z.string().nullable().default(null),
  reason: z.string().nullable().default(null),
  companySlug: z.string().nullable().default(null),
  limit: z.number().min(1).max(50).default(20),
});

export const listStories = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => FeedInput.parse(input ?? {}))
  .handler(async ({ data }) => {
    try {
      console.log("[listStories] Fetching stories with params:", data);
      const stories = await getPublicStories({
        sort: data.sort,
        industry: data.industry,
        county: data.county,
        reason: data.reason,
        companySlug: data.companySlug,
        limit: data.limit,
      });
      console.log("[listStories] Success, returned", stories.length, "stories");
      return { stories, error: null as string | null };
    } catch (error) {
      console.error("[listStories] Full error:", error);
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[listStories] Firebase public read unavailable", error);
      return { stories: [], error: "Firebase is not ready yet." };
    }
  });

export const getFilterOptions = createServerFn({ method: "GET" }).handler(async () => {
  try {
    console.log("[getFilterOptions] Fetching filter options");
    const result = await getFilterOptionsData();
    console.log("[getFilterOptions] Success:", {
      companies: result.companies.length,
      industries: result.industries.length,
      counties: result.counties.length,
    });
    return result;
  } catch (error) {
    console.error("[getFilterOptions] Full error:", error);
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[getFilterOptions] Firebase public read unavailable", error);
    return { companies: [], industries: [], counties: [] };
  }
});

export const listCompanyScores = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const companies = await buildCompanyScores();
    return {
      companies: companies.map((company) => ({
        ...company,
        descriptor: company.descriptor ?? null,
      })),
    };
  } catch (error) {
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[listCompanyScores] Firebase public read unavailable", error);
    return { companies: [] };
  }
});

export const getCompany = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    try {
      return await getCompanyView(data.slug);
    } catch (error) {
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[getCompany] Firebase public read unavailable", error);
      return null;
    }
  });

export const getStory = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    try {
      return await getStoryView(data.id);
    } catch (error) {
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[getStory] Firebase public read unavailable", error);
      return null;
    }
  });

export const getLeaderboards = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const rows = await buildCompanyScores();
    return {
      mostReported: [...rows]
        .sort((a, b) => Number(b.story_count) - Number(a.story_count))
        .slice(0, 10),
      bestRated: [...rows]
        .filter((r) => Number(r.rating_count) > 0)
        .sort((a, b) => Number(b.overall) - Number(a.overall))
        .slice(0, 10),
      wouldReturn: [...rows]
        .filter((r) => r.would_work_again_pct !== null)
        .sort((a, b) => Number(b.would_work_again_pct) - Number(a.would_work_again_pct))
        .slice(0, 10),
    };
  } catch (error) {
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[getLeaderboards] Firebase public read unavailable", error);
    return { mostReported: [], bestRated: [], wouldReturn: [] };
  }
});

export const getSalaryAggregates = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const rows = await buildSalaryAggregates();
    return { rows };
  } catch (error) {
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[getSalaryAggregates] Firebase public read unavailable", error);
    return { rows: [] };
  }
});

export const searchAll = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().max(120).default("") }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    try {
      return await searchData(data.q);
    } catch (error) {
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[searchAll] Firebase public read unavailable", error);
      return { companies: [], stories: [] };
    }
  });
