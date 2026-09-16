import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, MapPin } from "lucide-react";
import { getPulse } from "@/lib/public.functions";

/** Counts up to the target so the panel feels alive without faking data. */
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;
    if (from === target) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

function Stat({ label, value }: { label: string; value: number }) {
  const shown = useCountUp(value);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-lg font-semibold leading-none text-foreground tabular-nums">{shown}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Candid Pulse: a plain-language readout of what the community has reported
 * recently. Numbers are live, refreshed on a slow interval.
 */
export function CandidPulse() {
  const [hydrated, setHydrated] = useState(false);
  const { data } = useQuery({
    queryKey: ["pulse"],
    queryFn: () => getPulse(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => setHydrated(true), []);

  const pulse = hydrated ? data : undefined;

  const maxReason = Math.max(1, ...(pulse?.topReasons ?? []).map((row) => row.count));

  return (
    <div
      className="signal-panel dark relative mx-auto w-full max-w-md"
      aria-label="Candid Pulse — live workplace signals"
    >
      <div className="signal-grid absolute inset-0 rounded-3xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[oklch(0.135_0.014_285)] p-5 text-foreground shadow-2xl shadow-black/30 backdrop-blur-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <Activity className="size-4 text-primary" /> Candid Pulse
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Live
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          What Kenyan workers reported this week — the reasons people are actually leaving, counted
          as stories come in.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Stories" value={pulse?.storiesTotal ?? 0} />
          <Stat label="This week" value={pulse?.storiesLast7Days ?? 0} />
          <Stat label="Employers" value={pulse?.companies ?? 0} />
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Top reasons for leaving
          </p>
          {(pulse?.topReasons ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No stories yet — the first one will show up here.
            </p>
          ) : (
            (pulse?.topReasons ?? []).map((row) => (
              <div key={row.reason} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate capitalize text-foreground/90">{row.reason}</span>
                  <span className="tabular-nums text-muted-foreground">{row.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.round((row.count / maxReason) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-3.5 text-verified" /> {pulse?.counties ?? 0} counties covered
          </span>
          <span className="text-primary">{pulse?.storiesLast24Hours ?? 0} in 24h</span>
        </div>
      </div>
    </div>
  );
}
