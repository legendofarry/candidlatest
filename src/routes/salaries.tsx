import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/salaries")({
  component: () => <Outlet />,
});
