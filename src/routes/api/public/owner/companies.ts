import { createFileRoute } from "@tanstack/react-router";
import {
  readCollection,
  type CompanyAIProfileRecord,
  type CompanyRecord,
} from "@/lib/firebase-data.server";
import { getAdmin, json, pagination, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/companies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const { limit, offset } = pagination(url);
        await getAdmin();

        const search = url.searchParams.get("q");
        const industry = url.searchParams.get("industry");
        const county = url.searchParams.get("county");
        const [companies, profiles] = await Promise.all([
          readCollection<CompanyRecord>("companies"),
          readCollection<CompanyAIProfileRecord>("company_ai_profiles"),
        ]);
        const profileByCompany = new Map(
          profiles.map((profile) => [profile.company_id, profile] as const),
        );

        const filtered = companies
          .filter((company) =>
            search ? company.name.toLowerCase().includes(search.toLowerCase()) : true,
          )
          .filter((company) => (industry ? company.industry === industry : true))
          .filter((company) => (county ? company.county === county : true))
          .sort((a, b) => a.name.localeCompare(b.name));

        return json({
          total: filtered.length,
          limit,
          offset,
          companies: filtered.slice(offset, offset + limit).map((company) => ({
            ...company,
            company_ai_profiles: profileByCompany.get(company.id) ?? null,
          })),
        });
      },
    },
  },
});
