import { createFileRoute, redirect } from "@tanstack/react-router";
import { openNotifications } from "@/lib/notifications-store";

/**
 * Notifications now live in a full-screen overlay with no URL of their own.
 * This route is kept only so older links keep working: it opens the overlay
 * and bounces back to the feed.
 */
export const Route = createFileRoute("/notifications")({
  beforeLoad: () => {
    if (typeof window !== "undefined") openNotifications();
    throw redirect({ to: "/" });
  },
});
