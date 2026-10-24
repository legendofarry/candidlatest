import maintenance from "../shared/maintenance.cjs";

/** Permanently remove one account whose grace period has ended. */
export default async function purgeExpiredAccounts() {
  try {
    const result = await maintenance.purgeExpiredAccounts();
    if (result.failed > 0) {
      return new Response(`Account cleanup checked ${result.checked} account; ${result.failed} will retry.`, { status: 500 });
    }
    return new Response("Expired-account cleanup completed.", { status: 200 });
  } catch (error) {
    console.error("Scheduled account cleanup failed and will be retried.", error);
    return new Response("Expired-account cleanup failed.", { status: 500 });
  }
}

export const config = {
  schedule: "*/15 * * * *",
};
