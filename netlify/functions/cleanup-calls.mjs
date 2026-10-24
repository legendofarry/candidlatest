import maintenance from "../shared/maintenance.cjs";

/**
 * Remove only invitations, members, requests, and rooms whose persisted
 * lifecycle timestamps make them expired or inactive.
 */
export default async function cleanupCalls() {
  try {
    const result = await maintenance.cleanupExpiredCalls();
    if (result.failed > 0) {
      return new Response(`Call cleanup checked ${result.checked} records; ${result.failed} will retry.`, { status: 500 });
    }
    return new Response("Call cleanup completed.", { status: 200 });
  } catch (error) {
    console.error("Scheduled call cleanup failed and will be retried.", error);
    return new Response("Call cleanup failed.", { status: 500 });
  }
}

export const config = {
  // Two-minute cadence leaves call expiry responsive while limiting free-plan
  // compute use. Every operation is idempotent and is retried on the next run.
  schedule: "*/2 * * * *",
};
