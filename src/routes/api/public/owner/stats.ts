import { createFileRoute } from "@tanstack/react-router";
import {
  readCollection,
  type CompanyRatingRecord,
  type CompanyRecord,
  type CommentRecord,
  type ProfileRecord,
  type ReportRecord,
  type SalaryReportRecord,
  type StoryRecord,
} from "@/lib/firebase-data.server";
import { getAdmin, json, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        await getAdmin();
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [stories, companies, profiles, comments, reports, salaries, ratings] =
          await Promise.all([
            readCollection<StoryRecord>("stories"),
            readCollection<CompanyRecord>("companies"),
            readCollection<ProfileRecord>("profiles"),
            readCollection<CommentRecord>("comments"),
            readCollection<ReportRecord>("reports"),
            readCollection<SalaryReportRecord>("salary_reports"),
            readCollection<CompanyRatingRecord>("company_ratings"),
          ]);

        return json({
          stories: {
            total: stories.length,
            published: stories.filter((story) => story.status === "published").length,
            pending: stories.filter((story) => story.status === "pending").length,
            hidden: stories.filter((story) => story.status === "hidden").length,
            last7Days: stories.filter((story) => story.created_at >= since).length,
          },
          companies: companies.length,
          users: {
            total: profiles.length,
            banned: profiles.filter((profile) => profile.banned).length,
          },
          comments: comments.length,
          reportsOpen: reports.filter((report) => report.status === "open").length,
          salaryReports: salaries.length,
          companyRatings: ratings.length,
          generatedAt: new Date().toISOString(),
        });
      },
    },
  },
});
