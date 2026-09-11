import { createFileRoute } from "@tanstack/react-router";
import {
  readCollection,
  type CompanyRecord,
  type ProfileRecord,
  type StoryRecord,
} from "@/lib/firebase-data.server";
import { getAdmin, json, pagination, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/stories")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const { limit, offset } = pagination(url);
        await getAdmin();

        const status = url.searchParams.get("status");
        const companyId = url.searchParams.get("company_id");
        const county = url.searchParams.get("county");
        const industry = url.searchParams.get("industry");
        const search = url.searchParams.get("q");
        const [stories, companies, profiles] = await Promise.all([
          readCollection<StoryRecord>("stories"),
          readCollection<CompanyRecord>("companies"),
          readCollection<ProfileRecord>("profiles"),
        ]);
        const companyById = new Map(companies.map((company) => [company.id, company] as const));
        const profileById = new Map(profiles.map((profile) => [profile.id, profile] as const));

        const filtered = stories
          .filter((story) => (status ? story.status === status : true))
          .filter((story) => (companyId ? story.company_id === companyId : true))
          .filter((story) => (county ? story.county === county : true))
          .filter((story) => (industry ? story.industry === industry : true))
          .filter((story) =>
            search
              ? `${story.title} ${story.body}`.toLowerCase().includes(search.toLowerCase())
              : true,
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

        return json({
          total: filtered.length,
          limit,
          offset,
          stories: filtered.slice(offset, offset + limit).map((story) => ({
            ...story,
            companies: companyById.get(story.company_id) ?? null,
            story_reasons: (story.reasons ?? []).map((reason) => ({ reason })),
            profiles: story.author_id ? (profileById.get(story.author_id) ?? null) : null,
          })),
        });
      },
    },
  },
});
