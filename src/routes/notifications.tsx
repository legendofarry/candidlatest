import { createFileRoute, redirect } from "@tanstack/react-router";
import { openNotifications } from "@/lib/notifications-store";

/**
 * Notifications now live in a full-screen overlay with no URL of their own.
 * This route is kept only so older links keep working: it opens the overlay
 * and bounces back to the feed.
 */
export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications | Candid" },
      {
        name: "description",
        content: "Open your Candid notifications and review recent account activity.",
      },
      { property: "og:title", content: "Notifications | Candid" },
      {
        property: "og:description",
        content: "Open your Candid notifications and review recent account activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    if (typeof window !== "undefined") openNotifications();
    throw redirect({ to: "/" });
  },
});
