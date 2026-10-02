import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronRight, MapPin } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
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

const statClass =
  "block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:border-primary/50 hover:bg-white/10 active:scale-95 xl:px-4 xl:py-3";

function StatInner({ label, value }: { label: string; value: number }) {
  const shown = useCountUp(value);
  return (
    <>
      <p className="text-3xl font-bold leading-none text-foreground tabular-nums xl:text-2xl">
        {shown}
      </p>
      <p className="mt-1.5 flex items-center gap-0.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
        {label} <ChevronRight className="size-3" />
      </p>
    </>
  );
}

/** On phones, scale the panel up as it nears the screen centre, then back down. */
function useScrollSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!mq.matches || reduce.matches) {
        el.style.transform = "";
        el.style.setProperty("--spot", "0");
        return;
      }
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const distance = Math.abs(rect.top + rect.height / 2 - vh / 2);
      const p = Math.max(0, 1 - distance / (vh * 0.55));
      const eased = p * p * (3 - 2 * p);
      el.style.transform = `scale(${1 + eased * 0.08})`;
      el.style.setProperty("--spot", eased.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return ref;
}

/**
 * Candid Pulse: a plain-language readout of what the community has reported
 * recently. Numbers are live, refreshed on a slow interval.
 */
type PulseProps = {
  onReason?: (reason: string) => void;
  onStories?: () => void;
  onThisWeek?: () => void;
};

export function CandidPulse({ onReason, onStories, onThisWeek }: PulseProps = {}) {
  const spotlight = useScrollSpotlight();
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
      ref={spotlight}
      className="signal-panel dark relative mx-auto w-full max-w-md origin-center will-change-transform xl:max-w-none"
      aria-label="Candid Pulse — live workplace signals"
    >
      <div className="signal-grid absolute inset-0 rounded-3xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[oklch(0.135_0.014_285)] p-5 text-foreground shadow-2xl shadow-black/30 backdrop-blur-sm transition-shadow xl:p-7" style={{ boxShadow: "0 25px 60px -15px color-mix(in oklab, var(--primary) calc(var(--spot, 0) * 45%), transparent)" }}>
        <div className="flex items-center justify-between text-xs xl:text-sm">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <Activity className="size-4 text-primary xl:size-5" /> Candid Pulse
          </span>
          <button
            type="button"
            onClick={() =>
              toast("Candid Pulse", {
                description: "Counted live from community exit stories across Kenya.",
              })
            }
            className="flex items-center gap-1.5 rounded-full px-2 py-1 text-muted-foreground transition hover:bg-white/10 active:scale-95"
          >
            <span className="size-2 animate-pulse rounded-full bg-primary" /> Live
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground xl:mt-3 xl:text-sm">
          What Kenyan workers reported this week — the reasons people are actually leaving, counted
          as stories come in.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 xl:mt-5 xl:gap-3">
          <button type="button" className={statClass} onClick={onStories}>
            <StatInner label="Stories" value={pulse?.storiesTotal ?? 0} />
          </button>
          <button type="button" className={statClass} onClick={onThisWeek}>
            <StatInner label="This week" value={pulse?.storiesLast7Days ?? 0} />
          </button>
          <Link to="/companies" className={statClass}>
            <StatInner label="Employers" value={pulse?.companies ?? 0} />
          </Link>
        </div>

        <div className="mt-4 space-y-2 xl:mt-5 xl:space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Top reasons for leaving
          </p>
          {(pulse?.topReasons ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No stories yet — the first one will show up here.
            </p>
          ) : (
            (pulse?.topReasons ?? []).map((row) => (
              <button
                type="button"
                key={row.reason}
                onClick={() => onReason?.(row.reason)}
                className="group block w-full space-y-1.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/5 active:scale-[0.98]"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate capitalize text-foreground/90">{row.reason}</span>
                  <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                    {row.count}
                    <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/10 xl:h-2">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.round((row.count / maxReason) * 100)}%` }}
                  />
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs xl:mt-5 xl:px-4 xl:py-3 xl:text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-3.5 text-verified" /> {pulse?.counties ?? 0} counties covered
          </span>
          <span className="text-primary">{pulse?.storiesLast24Hours ?? 0} in 24h</span>
        </div>
      </div>
    </div>
  );
}
