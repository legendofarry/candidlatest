import { createFileRoute } from "@tanstack/react-router";
import { getFirestoreDb } from "@/lib/firebase.server";
import { createAuthenticatedImageUrl } from "@/lib/cloudinary-evidence.server";
import { getAdmin, json, verifyOwnerKey } from "@/lib/owner-api.server";

export const Route = createFileRoute("/api/public/owner/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = verifyOwnerKey(request);
        if (denied) return denied;

        await getAdmin();
        const db = getFirestoreDb();
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [
          storiesTotal,
          storiesPublished,
          storiesPending,
          storiesHidden,
          storiesLast7Days,
          companies,
          users,
          bannedUsers,
          comments,
          reportsOpen,
          salaries,
          ratings,
          payments,
          paymentReviewQueueCount,
        ] = await Promise.all([
          db.collection("stories").count(),
          db.collection("stories").where("status", "==", "published").count(),
          db.collection("stories").where("status", "==", "pending").count(),
          db.collection("stories").where("status", "==", "hidden").count(),
          db.collection("stories").where("created_at", ">=", since).count(),
          db.collection("companies").count(),
          db.collection("profiles").count(),
          db.collection("profiles").where("banned", "==", true).count(),
          db.collection("comments").count(),
          db.collection("reports").where("status", "==", "open").count(),
          db.collection("salary_reports").count(),
          db.collection("company_ratings").count(),
          db
            .collection("manual_payment_requests")
            .where("status", "==", "pending_verification")
            .orderBy("submitted_at", "desc")
            .limit(100)
            .get(),
          db
            .collection("manual_payment_requests")
            .where("status", "==", "pending_verification")
            .count(),
        ]);
        const paymentsRows = payments.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        const profileIds = [
          ...new Set(
            paymentsRows.map((payment) => String(payment["user_id"] ?? "")).filter(Boolean),
          ),
        ];
        const profiles = await Promise.all(
          profileIds.map((id) => db.collection("profiles").doc(id).get()),
        );
        const profileById = new Map(
          profiles
            .filter((profile) => profile.exists)
            .map((profile) => [profile.id, profile.data()!]),
        );
        const paymentReviewQueue = await Promise.all(
          paymentsRows.map(async (payment) => {
            const proof = payment["proof"] as { public_id?: string; format?: string } | undefined;
            let proofUrl: string | null = null;
            if (proof?.public_id && proof.format) {
              try {
                proofUrl = createAuthenticatedImageUrl(
                  proof.public_id,
                  proof.format,
                  Math.floor(Date.now() / 1000) + 5 * 60,
                );
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
            total: storiesTotal,
            published: storiesPublished,
            pending: storiesPending,
            hidden: storiesHidden,
            last7Days: storiesLast7Days,
          },
          companies,
          users: {
            total: users,
            banned: bannedUsers,
          },
          comments,
          reportsOpen,
          salaryReports: salaries,
          companyRatings: ratings,
          paymentReviewQueue,
          paymentReviewQueueCount,
          generatedAt: new Date().toISOString(),
        });
      },
    },
  },
});
