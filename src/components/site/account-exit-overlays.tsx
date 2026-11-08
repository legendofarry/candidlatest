import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, LogOut, X } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Shared behaviour                                                           */
/* -------------------------------------------------------------------------- */

/** Locks page scroll, lets Escape cancel, and keeps keyboard focus on the cancel button. */
function useOverlayChrome(
  onCancel: () => void,
  cancelRef: RefObject<HTMLButtonElement | null>,
  locked: boolean,
) {
  useEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !locked) {
        event.preventDefault();
        onCancel();
      } else if (event.key === "Tab") {
        event.preventDefault();
        cancelRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, cancelRef, locked]);
}

/* -------------------------------------------------------------------------- */
/* Pause: the screen is peeled away square by square                         */
/* -------------------------------------------------------------------------- */

type Phase = "fold" | "message" | "committing";

const FOLD_MS = 5200;
const PIECE_MS = 850;
const GRACE_MS = 5000;

export function PauseFoldOverlay({
  onCancel,
  onCommit,
}: {
  onCancel: () => void;
  onCommit: () => Promise<void>;
}) {
  const still = Boolean(useReducedMotion());
  const [phase, setPhase] = useState<Phase>(still ? "message" : "fold");
  const [secs, setSecs] = useState(Math.ceil(GRACE_MS / 1000));
  const cancelRef = useRef<HTMLButtonElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const view = useMemo(() => ({ w: window.innerWidth, h: window.innerHeight }), []);

  const handleCancel = () => {
    if (phase !== "committing") onCancel();
  };
  useOverlayChrome(handleCancel, cancelRef, phase === "committing");

  // Once the last square has flown off, the screen is black and the message appears.
  useEffect(() => {
    if (still) return;
    const timer = window.setTimeout(() => setPhase("message"), FOLD_MS + PIECE_MS);
    return () => window.clearTimeout(timer);
  }, [still]);

  // Short grace window on the message screen, then the pause is applied.
  useEffect(() => {
    if (phase !== "message") return;
    const started = Date.now();
    const tick = window.setInterval(() => {
      setSecs(Math.max(1, Math.ceil((GRACE_MS - (Date.now() - started)) / 1000)));
    }, 200);
    const commit = window.setTimeout(() => {
      setPhase("committing");
      void commitRef.current();
    }, GRACE_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(commit);
    };
  }, [phase]);

  useEffect(() => {
    cancelRef.current?.focus();
  }, [phase]);

  // Tiles peel outward from the middle of the screen, speeding up as the fold goes on.
  const tiles = useMemo(() => {
    const size = view.w < 640 ? 56 : 84;
    const cols = Math.ceil(view.w / size);
    const rows = Math.ceil(view.h / size);
    const originX = view.w / 2;
    const originY = view.h / 2;
    const raw: { cx: number; left: number; top: number; score: number }[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cx = col * size + size / 2;
        const cy = row * size + size / 2;
        raw.push({
          cx,
          left: col * size,
          top: row * size,
          score: Math.hypot(cx - originX, cy - originY) * (0.82 + Math.random() * 0.36),
        });
      }
    }
    raw.sort((a, b) => a.score - b.score);
    const count = raw.length;
    return raw.map((tile, index) => ({
      key: `${tile.left}-${tile.top}`,
      left: tile.left,
      top: tile.top,
      size,
      delay: Math.round(FOLD_MS * (1 - Math.pow(1 - index / count, 1.8))),
      dx: Math.round((tile.cx - originX) * 0.12 + (Math.random() * 2 - 1) * 30),
      dy: -Math.round(70 + Math.random() * 90),
      rot: Math.round((Math.random() * 2 - 1) * 160),
    }));
  }, [view]);

  const showStage = phase === "fold";
  const solid = phase !== "fold";

  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      className={`fixed inset-0 z-[300] overflow-hidden ${solid || still ? "bg-black" : "bg-transparent"}`}
      initial={{ opacity: still ? 0 : 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {!still ? (
        <div aria-hidden="true" className="absolute inset-0">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className="acct-cell absolute bg-black"
              style={{
                left: tile.left,
                top: tile.top,
                width: tile.size + 1,
                height: tile.size + 1,
                ["--d" as string]: `${tile.delay}ms`,
              }}
            />
          ))}
          {tiles.map((tile) => (
            <div
              key={`p-${tile.key}`}
              className="acct-paper absolute border border-foreground/10 bg-background shadow-md"
              style={{
                left: tile.left,
                top: tile.top,
                width: tile.size,
                height: tile.size,
                backgroundImage:
                  "linear-gradient(135deg, transparent 80%, rgba(0,0,0,0.10) 80%)",
                ["--d" as string]: `${tile.delay}ms`,
                ["--dx" as string]: `${tile.dx}px`,
                ["--dy" as string]: `${tile.dy}px`,
                ["--rot" as string]: `${tile.rot}deg`,
              }}
            />
          ))}
        </div>
      ) : null}

      <AnimatePresence>
        {showStage ? (
          <motion.button
            key="cancel-pill"
            ref={cancelRef}
            type="button"
            onClick={handleCancel}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 inline-flex h-10 items-center gap-1.5 rounded-full border border-white/30 bg-black/70 px-4 text-sm font-medium text-white outline-none backdrop-blur focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X className="size-4" />
            Cancel
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {!showStage ? (
          <motion.div
            key="message"
            className="absolute inset-0 z-10 flex flex-col text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            {phase === "message" ? (
              <motion.div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 origin-left bg-amber-400"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: GRACE_MS / 1000, ease: "linear" }}
              />
            ) : null}
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <motion.span
                initial={still ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                className="flex size-16 items-center justify-center rounded-full border border-white/20 bg-white/5"
              >
                {phase === "committing" ? (
                  <Loader2 className="size-7 animate-spin text-amber-300" />
                ) : (
                  <LogOut className="size-7 text-amber-300" />
                )}
              </motion.span>
              <h2 id="pause-title" className="mt-6 font-display text-3xl font-semibold tracking-tight">
                {phase === "committing" ? "Pausing your account…" : "Taking a break"}
              </h2>
              <p className="mt-3 max-w-sm text-base leading-relaxed text-white/70">
                You&rsquo;ll be logged out now. Your account stays hidden, and it resumes the next time
                you log in within 7 days.
              </p>
              {phase === "message" ? (
                <p className="mt-6 text-sm tabular-nums text-white/50" aria-live="polite">
                  Logging out in {secs}
                </p>
              ) : null}
            </div>
            <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <button
                ref={phase === "message" ? cancelRef : undefined}
                type="button"
                disabled={phase === "committing"}
                onClick={handleCancel}
                className="mx-auto flex h-14 w-full max-w-md items-center justify-center rounded-2xl bg-white font-display text-base font-semibold text-black outline-none transition-transform focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.985] disabled:opacity-40"
              >
                Cancel, keep me logged in
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Delete: a 10-second countdown the user can abort                           */
/* -------------------------------------------------------------------------- */

const RING = 2 * Math.PI * 96;

export function DeleteCountdownOverlay({
  seconds = 10,
  onCancel,
  onCommit,
}: {
  seconds?: number;
  onCancel: () => void;
  onCommit: () => Promise<void>;
}) {
  const still = Boolean(useReducedMotion());
  const [left, setLeft] = useState(seconds);
  const [committing, setCommitting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const handleCancel = () => {
    if (!committing) onCancel();
  };
  useOverlayChrome(handleCancel, cancelRef, committing);

  useEffect(() => {
    cancelRef.current?.focus();
    const started = Date.now();
    let done = false;
    const tick = window.setInterval(() => {
      const remaining = Math.ceil((seconds * 1000 - (Date.now() - started)) / 1000);
      if (remaining <= 0) {
        if (done) return;
        done = true;
        window.clearInterval(tick);
        setLeft(0);
        setCommitting(true);
        void commitRef.current();
        return;
      }
      setLeft((previous) => {
        if (previous !== remaining && remaining <= 3 && typeof navigator.vibrate === "function") {
          navigator.vibrate(12);
        }
        return remaining;
      });
    }, 100);
    return () => window.clearInterval(tick);
  }, [seconds]);

  const urgent = left <= 3;

  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      className="fixed inset-0 z-[300] flex flex-col overflow-hidden bg-[#0d0507] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-24 top-1/4 size-80 rounded-full bg-red-600/25 blur-3xl"
          animate={still ? undefined : { x: [0, 80, 0], y: [0, -30, 0], opacity: urgent ? 0.9 : 0.6 }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-24 bottom-1/4 size-96 rounded-full bg-rose-500/20 blur-3xl"
          animate={still ? undefined : { x: [0, -70, 0], y: [0, 40, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
        <h2 id="delete-title" className="text-sm font-medium uppercase tracking-[0.22em] text-white/60">
          {committing ? "Scheduling deletion" : "Deleting your account in"}
        </h2>

        <div className="relative mt-8 flex size-64 items-center justify-center">
          <svg viewBox="0 0 220 220" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
            <circle cx="110" cy="110" r="96" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <motion.circle
              cx="110"
              cy="110"
              r="96"
              fill="none"
              stroke={urgent ? "#ff4d5e" : "#ef4444"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={RING}
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: RING }}
              transition={{ duration: seconds, ease: "linear" }}
            />
          </svg>
          <AnimatePresence mode="popLayout" initial={false}>
            {committing ? (
              <motion.span
                key="spin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Loader2 className="size-14 animate-spin text-red-400" />
              </motion.span>
            ) : (
              <motion.span
                key={left}
                initial={still ? false : { opacity: 0, scale: 0.6, y: 24, filter: "blur(8px)" }}
                animate={{
                  opacity: 1,
                  scale: urgent && !still ? [1.15, 1] : 1,
                  y: 0,
                  filter: "blur(0px)",
                }}
                exit={still ? { opacity: 0 } : { opacity: 0, scale: 1.3, y: -24, filter: "blur(8px)" }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className={`font-display text-8xl font-semibold tabular-nums ${urgent ? "text-red-400" : "text-white"}`}
              >
                {left}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-8 max-w-sm text-base leading-relaxed text-white/65">
          Nothing is deleted yet. If this runs out, your account is scheduled for removal, and you
          still get 48 hours to cancel it from Settings.
        </p>
        <span className="sr-only" aria-live="assertive">
          {left === seconds || left <= 3 || left === 5 ? `${left} seconds` : ""}
        </span>
      </div>

      <div className="relative px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button
          ref={cancelRef}
          type="button"
          disabled={committing}
          onClick={handleCancel}
          className="mx-auto flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-white font-display text-base font-semibold text-black outline-none transition-transform focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.985] disabled:opacity-40"
        >
          Cancel, keep my account
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}
