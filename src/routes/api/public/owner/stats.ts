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
import { createAuthenticatedImageUrl } from "@/lib/cloudinary-evidence.server";
import type { DocumentData } from "@/lib/firestore-rest.server";
import { getAdmin, json, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        await getAdmin();
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [stories, companies, profiles, comments, reports, salaries, ratings, payments] =
          await Promise.all([
            readCollection<StoryRecord>("stories"),
            readCollection<CompanyRecord>("companies"),
            readCollection<ProfileRecord>("profiles"),
            readCollection<CommentRecord>("comments"),
            readCollection<ReportRecord>("reports"),
            readCollection<SalaryReportRecord>("salary_reports"),
            readCollection<CompanyRatingRecord>("company_ratings"),
            readCollection<DocumentData>("manual_payment_requests"),
          ]);
        const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
        const paymentReviewQueue = await Promise.all(
          payments
            .filter((payment) => payment["status"] === "pending_verification")
            .map(async (payment) => {
              const proof = payment["proof"] as { public_id?: string; format?: string } | undefined;
              let proofUrl: string | null = null;
              if (proof?.public_id && proof.format) {
                try {
                  proofUrl = createAuthenticatedImageUrl(proof.public_id, proof.format, Math.floor(Date.now() / 1000) + 5 * 60);
                } catch (error) {
                  console.error("Could not sign payment receipt for owner review", error);
                }
              }
              const profile = profileById.get(String(payment["user_id"] ?? ""));
              return {
                id: payment["id"],
                user_id: payment["user_id"],
                username: profile?.username ?? profile?.handle ?? "Member",
                package_id: payment["package_id"],
                package_name: payment["package_name"],
                expected_amount_kes: payment["expected_amount_kes"],
                payment_reference: payment["payment_reference"],
                transaction_code: payment["transaction_code"] ?? null,
                payer_phone: payment["payer_phone"] ?? null,
                submitted_at: payment["submitted_at"] ?? null,
                proof_url: proofUrl,
              };
            }),
        );

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
          paymentReviewQueue,
          generatedAt: new Date().toISOString(),
        });
      },
    },
  },
});
