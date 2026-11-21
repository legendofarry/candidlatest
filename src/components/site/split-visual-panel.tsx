import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Fingerprint, ShieldCheck } from "lucide-react";

export function SplitVisualPanel({
  eyebrow,
  title,
  description,
  titleLevel = 2,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  titleLevel?: 1 | 2;
}) {
  const Heading = titleLevel === 1 ? "h1" : "h2";

  return (
    <aside
      aria-labelledby="split-visual-title"
      className="relative hidden min-h-screen overflow-hidden bg-[#132523] px-7 py-16 text-white md:flex md:h-dvh md:min-h-0 md:items-center lg:px-12 lg:py-24"
    >
      <div className="absolute inset-0 bg-[linear-gradient(145deg,#182c28_0%,#17212c_55%,#29271d_100%)]" />
      <div className="absolute inset-0 opacity-20" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,#65c5a1,transparent_40%),radial-gradient(ellipse_at_85%_90%,#e2ac63,transparent_42%)]" />
      </div>
      <div className="relative mx-auto w-full max-w-lg md:pl-6">
        <p className="text-sm font-medium text-emerald-200">{eyebrow}</p>
        <Heading
          id="split-visual-title"
          className="mt-5 max-w-md font-display text-4xl font-semibold leading-tight tracking-tight"
        >
          {title}
        </Heading>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/70">{description}</p>
        <div className="relative mt-14 h-64 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-sm">
          <motion.div
            className="absolute left-8 right-8 top-8 rounded-xl border border-white/15 bg-[#16211f] p-4"
            animate={{ y: [0, -8, 0], rotate: [0, -1, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-300/15 text-emerald-200">
                <ShieldCheck className="size-5" />
              </span>
              <div className="flex-1">
                <div className="h-2 w-28 rounded-full bg-white/75" />
                <div className="mt-2 h-1.5 w-40 rounded-full bg-white/25" />
              </div>
              <span className="h-5 w-9 rounded-full bg-emerald-400/80 p-1">
                <span className="ml-auto block size-3 rounded-full bg-white" />
              </span>
            </div>
          </motion.div>
          <motion.div
            className="absolute bottom-7 left-12 right-12 rounded-xl border border-white/15 bg-[#202425] p-4"
            animate={{ y: [0, 7, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-amber-300/15 text-amber-200">
                <Fingerprint className="size-5" />
              </span>
              <div className="flex-1">
                <div className="h-2 w-24 rounded-full bg-white/75" />
                <div className="mt-2 h-1.5 w-32 rounded-full bg-white/25" />
              </div>
              <div className="flex gap-1">
                <i className="size-1.5 rounded-full bg-white/50" />
                <i className="size-1.5 rounded-full bg-white/50" />
                <i className="size-1.5 rounded-full bg-white/50" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </aside>
  );
}
