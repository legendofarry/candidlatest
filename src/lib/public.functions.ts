import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildCompanyScores,
  buildSalaryAggregates,
  getCompanyView,
  getFilterOptionsData,
  getPublicStories,
  getPublicStoryPage,
  getStoryView,
  getStoryCommentContext as readStoryCommentContext,
  getStoryCommentsPage as readStoryCommentsPage,
  searchData,
} from "./firebase-data.server";
import { optionalFirebaseAuth } from "@/integrations/firebase/auth-middleware";

function isFirebaseReadUnavailable(error: unknown) {
  return (
    error instanceof Error &&
    /PERMISSION_DENIED|RESOURCE_EXHAUSTED|Quota exceeded|Firestore request failed \[429\]|Firestore API|Missing Firebase admin|Failed to parse private key|FIREBASE_SERVICE_ACCOUNT_JSON|fetch failed|ETIMEDOUT|ECONNRESET|EAI_AGAIN/.test(
      error.message,
    )
  );
}

const FeedInput = z.object({
  sort: z.enum(["new", "top", "trending"]).default("new"),
  industry: z.string().nullable().default(null),
  county: z.string().nullable().default(null),
  area: z.string().nullable().default(null),
  reason: z.string().nullable().default(null),
  companySlug: z.string().nullable().default(null),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.object({ createdAt: z.string(), id: z.string() }).nullable().optional(),
});

export const listStories = createServerFn({ method: "GET" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) => FeedInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    try {
      if (data.sort === "new") {
        const page = await getPublicStoryPage({
          limit: data.limit,
          viewerId: context.userId,
          cursor: data.cursor ?? null,
          industry: data.industry,
          county: data.county,
          area: data.area,
        });
        return { ...page, error: null as string | null };
      }
      const allStories = await getPublicStories({
        sort: data.sort,
        industry: data.industry,
        county: data.county,
        area: data.area,
        reason: data.reason,
        companySlug: data.companySlug,
        limit: 0,
        viewerId: context.userId,
      });
      const cursorIndex = data.cursor
        ? allStories.findIndex((story) => story.id === data.cursor?.id)
        : -1;
      const start = Math.max(0, cursorIndex + 1);
      const page = allStories.slice(start, start + data.limit + 1);
      const hasMore = page.length > data.limit;
      const stories = page.slice(0, data.limit);
      const last = stories.at(-1);
      return {
        stories,
        error: null as string | null,
        hasMore,
        nextCursor:
          hasMore && last?.created_at && last.id
            ? { createdAt: last.created_at, id: last.id }
            : null,
      };
    } catch (error) {
      console.error("[listStories] Full error:", error);
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[listStories] Firebase public read unavailable", error);
      return { stories: [], error: "Firebase is not ready yet.", hasMore: false, nextCursor: null };
    }
  });

export const listStoryPage = createServerFn({ method: "GET" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.object({ createdAt: z.string(), id: z.string() }).nullable().default(null),
        industry: z.string().nullable().default(null),
        county: z.string().nullable().default(null),
        area: z.string().nullable().default(null),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    try {
      return { ...(await getPublicStoryPage({ ...data, viewerId: context.userId })), error: null as string | null };
    } catch (error) {
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[listStoryPage] Firebase public read unavailable", error);
      return { stories: [], hasMore: false, nextCursor: null, error: "Firebase is not ready yet." };
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
      areas: result.areas.length,
    });
    return result;
  } catch (error) {
    console.error("[getFilterOptions] Full error:", error);
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[getFilterOptions] Firebase public read unavailable", error);
    return { companies: [], industries: [], counties: [], areas: [], areasByCounty: {} };
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
      error: null as string | null,
    };
  } catch (error) {
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[listCompanyScores] Firebase public read unavailable", error);
    return { companies: [], error: "Employer information is temporarily unavailable." };
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
      throw new Error("Company information is temporarily unavailable. Please try again.");
    }
  });

export const getStory = createServerFn({ method: "GET" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    try {
      return await getStoryView(data.id, context.userId);
    } catch (error) {
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[getStory] Firebase public read unavailable", error);
      return null;
    }
  });

export const getStoryComments = createServerFn({ method: "GET" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        cursor: z.object({ createdAt: z.string(), id: z.string() }).nullable().default(null),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => readStoryCommentsPage(data.id, data.cursor, context.userId));

export const getStoryCommentContext = createServerFn({ method: "GET" })
  .middleware([optionalFirebaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ story_id: z.string().uuid(), comment_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => readStoryCommentContext(data.story_id, data.comment_id, context.userId));

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

export const getSalaryCompanies = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { buildCompanySalaryDirectory } = await import("./firebase-data.server");
    return { companies: await buildCompanySalaryDirectory(), error: null as string | null };
  } catch (error) {
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[getSalaryCompanies] Firebase public read unavailable", error);
    return { companies: [], error: "Salary information is temporarily unavailable." };
  }
});

export const getCompanySalaries = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { buildCompanySalaryDetail } = await import("./firebase-data.server");
      return await buildCompanySalaryDetail(data.slug);
    } catch (error) {
      if (!isFirebaseReadUnavailable(error)) throw error;
      console.warn("[getCompanySalaries] Firebase public read unavailable", error);
      return null;
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

export const getPulse = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { buildPulse } = await import("./site.server");
    return await buildPulse();
  } catch (error) {
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[getPulse] Firebase public read unavailable", error);
    return null;
  }
});

export const getSiteContact = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { readSiteContact } = await import("./site.server");
    return await readSiteContact();
  } catch (error) {
    if (!isFirebaseReadUnavailable(error)) throw error;
    console.warn("[getSiteContact] Firebase public read unavailable", error);
    return null;
  }
});
