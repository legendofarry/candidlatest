import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";

/**
 * Thin top progress bar + soft overlay shown for any navigation or data fetch
 * that takes longer than a blink.
 */
export function RouteProgress() {
  const isNavigating = useRouterState({ select: (s) => s.status === "pending" });
  const fetching = useIsFetching();
  const busy = isNavigating || fetching > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy) {
      const t = window.setTimeout(() => setVisible(false), 220);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setVisible(true), 120);
    return () => window.clearTimeout(t);
  }, [busy]);

  if (!visible) return null;

  return (
    <>
      <div className="route-progress" aria-hidden>
        <span />
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        Loading
      </div>
    </>
  );
}

/** Inline waiting animation for panels, lists and buttons. */
export function PulseLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12" role="status">
      <div className="pulse-loader">
        <span />
        <span />
        <span />
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
    </div>
  );
}
