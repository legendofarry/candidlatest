import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Wrench, X } from "lucide-react";

type Phase = "collapse" | "chat" | "glitch" | "restore";

const conversation = [
  {
    name: "Candid mechanic",
    text: "I was meant to be on leave, but it looks like our user broke something again.",
  },
  { name: "Mechanic on call", text: "You’re on vacation. I’ll take it from here." },
  { name: "Candid mechanic", text: "I’ll handle it, sadly. Enjoy the beach for both of us." },
];

export function MechanicEasterEgg({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("collapse");

  useEffect(() => {
    if (!open) return;
    setPhase("collapse");
    const scale = reduceMotion ? 0.05 : 1;
    const timers = [
      window.setTimeout(() => setPhase("chat"), 1150 * scale),
      window.setTimeout(() => setPhase("glitch"), 7000 * scale),
      window.setTimeout(() => setPhase("restore"), 8100 * scale),
      window.setTimeout(onClose, 9000 * scale),
    ];
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, reduceMotion]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Candid mechanics on call"
          className={`fixed inset-0 z-[200] overflow-hidden bg-black text-white ${phase === "glitch" ? "animate-[candid-glitch_120ms_steps(2)_infinite]" : ""}`}
          initial={{ clipPath: "circle(0% at 50% 52%)" }}
          animate={{
            clipPath: phase === "restore" ? "circle(0% at 50% 52%)" : "circle(150% at 50% 52%)",
          }}
          transition={{ duration: reduceMotion ? 0.08 : 1.05, ease: [0.76, 0, 0.24, 1] }}
          onAnimationComplete={() => {
            if (phase === "restore") onClose();
          }}
        >
          <button
            type="button"
            aria-label="Close animation"
            onClick={onClose}
            className="absolute right-5 top-5 z-20 flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(105,72,200,0.12),transparent_50%)]" />
          <motion.div
            className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: phase === "collapse" ? 0 : 1, y: phase === "collapse" ? 18 : 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="relative flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                <Wrench className="size-6" />
                <span className="absolute -bottom-1 -right-1 text-lg" aria-hidden="true">
                  👨🏽‍🔧
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  After-hours repair
                </p>
                <h2 className="mt-1 text-xl font-semibold">The Candid mechanics</h2>
              </div>
            </div>
            <div className="space-y-3">
              {conversation.map((message, index) => (
                <motion.div
                  key={message.name}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: phase === "collapse" ? 0 : 1, y: 0, scale: 1 }}
                  transition={{ delay: reduceMotion ? 0 : 0.25 + index * 0.65, duration: 0.35 }}
                  className={`max-w-[90%] rounded-2xl border px-4 py-3 text-sm leading-6 ${index === 1 ? "ml-auto border-primary/25 bg-primary/10" : "border-white/10 bg-white/[0.06]"}`}
                >
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/45">
                    {message.name}
                  </span>
                  {message.text}
                </motion.div>
              ))}
            </div>
            <motion.p
              animate={{
                opacity: phase === "glitch" ? [0.35, 1, 0.45] : phase === "restore" ? 0 : 1,
              }}
              transition={{ duration: 0.18, repeat: phase === "glitch" ? 5 : 0 }}
              className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-primary/75"
            >
              {phase === "glitch"
                ? "Repair complete · restoring screen"
                : "Candid is back in one piece"}
            </motion.p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
