import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Loader2,
  RotateCcw,
  Trash2,
  UserRoundCog,
  UserRoundMinus,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type AccountAction = "deactivate" | "delete";
type Step = "choose" | AccountAction;

const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

/** Aurora colours per step, so the whole sheet shifts mood as you move through it. */
const AURORA: Record<Step, [string, string]> = {
  choose: ["bg-primary/30", "bg-sky-400/25"],
  deactivate: ["bg-amber-400/35", "bg-orange-300/25"],
  delete: ["bg-red-400/30", "bg-rose-300/25"],
};

const DETAILS: Record<
  AccountAction,
  {
    title: string;
    lead: string;
    icon: LucideIcon;
    orb: string;
    points: { icon: LucideIcon; text: string }[];
  }
> = {
  deactivate: {
    title: "Pause your account?",
    lead: "A break you can undo.",
    icon: UserRoundMinus,
    orb: "bg-amber-500/15 text-amber-600",
    points: [
      { icon: EyeOff, text: "Your account is hidden from other people." },
      { icon: CalendarClock, text: "You have 7 days to come back and keep it." },
      { icon: RotateCcw, text: "Reactivate any time from Settings." },
    ],
  },
  delete: {
    title: "Delete your account?",
    lead: "This ends your time on Candid.",
    icon: Trash2,
    orb: "bg-destructive/15 text-destructive",
    points: [
      { icon: CalendarClock, text: "Deletion is scheduled, not instant." },
      { icon: RotateCcw, text: "You have 48 hours to cancel it from Settings." },
      { icon: Trash2, text: "After that, it is final." },
    ],
  },
};

function Aurora({ step, still }: { step: Step; still: boolean }) {
  const [a, b] = AURORA[step];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
    >
      <motion.div
        className={cn(
          "absolute -left-10 -top-16 size-56 rounded-full blur-3xl transition-colors duration-700",
          a,
        )}
        animate={still ? undefined : { x: [0, 60, 0], y: [0, 24, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={cn(
          "absolute -right-12 -top-8 size-60 rounded-full blur-3xl transition-colors duration-700",
          b,
        )}
        animate={still ? undefined : { x: [0, -50, 0], y: [0, 36, 0], scale: [1.1, 1, 1.1] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/** The icon orb with a soft expanding ring. */
function Orb({ icon: Icon, className, still }: { icon: LucideIcon; className?: string; still: boolean }) {
  return (
    <span className="relative inline-flex">
      {still ? null : (
        <motion.span
          aria-hidden="true"
          className={cn("absolute inset-0 rounded-2xl", className)}
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.span
        initial={still ? false : { scale: 0.6, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={SPRING}
        className={cn(
          "relative flex size-14 items-center justify-center rounded-2xl border border-white/40 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)] backdrop-blur",
          className,
        )}
      >
        <Icon className="size-6" />
      </motion.span>
    </span>
  );
}

function ActionRow({
  icon: Icon,
  title,
  hint,
  tone,
  index,
  disabled,
  onClick,
  still,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  tone: "amber" | "red";
  index: number;
  disabled: boolean;
  onClick: () => void;
  still: boolean;
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      initial={still ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: still ? 0 : 0.1 + index * 0.08 }}
      whileTap={still ? undefined : { scale: 0.985 }}
      className="group relative flex w-full items-center gap-4 border-t border-border/60 px-6 py-5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/60 disabled:opacity-60"
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3",
          tone === "amber" ? "bg-amber-500/15 text-amber-600" : "bg-destructive/12 text-destructive",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-display text-base font-semibold tracking-tight",
            tone === "red" && "text-destructive",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1" />
    </motion.button>
  );
}

/** Hold-to-confirm: a deliberate press fills the button, so nobody deletes an account by accident. */
function HoldToConfirm({
  label,
  busy,
  onConfirm,
}: {
  label: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);

  function start() {
    if (busy) return;
    holdingRef.current = true;
    setHolding(true);
  }
  function stop() {
    holdingRef.current = false;
    setHolding(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onBlur={stop}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            start();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") stop();
        }}
        className="relative flex h-14 w-full touch-none select-none items-center justify-center overflow-hidden rounded-2xl bg-destructive/10 font-display text-base font-semibold text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 disabled:opacity-70"
      >
        <span className="flex items-center gap-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {busy ? "Updating your account…" : label}
        </span>
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center gap-2 bg-destructive text-destructive-foreground"
          initial={false}
          animate={{ clipPath: holding && !busy ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
          transition={{ duration: holding ? 1.1 : 0.25, ease: holding ? "linear" : "easeOut" }}
          onAnimationComplete={() => {
            if (holdingRef.current) {
              holdingRef.current = false;
              setHolding(false);
              onConfirm();
            }
          }}
        >
          <Trash2 className="size-4" />
          {label}
        </motion.span>
      </button>
      <p className="text-center text-xs text-muted-foreground">Press and hold to confirm</p>
    </div>
  );
}

function Controls({
  busy,
  onSubmit,
  onClose,
  still,
}: {
  busy: boolean;
  onSubmit: (action: AccountAction) => void;
  onClose: () => void;
  still: boolean;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [direction, setDirection] = useState(1);

  function go(next: Step) {
    setDirection(next === "choose" ? -1 : 1);
    setStep(next);
  }

  const slide = {
    initial: (d: number) => ({ opacity: 0, x: still ? 0 : d * 36 }),
    animate: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: still ? 0 : d * -36 }),
  };

  return (
    <div className="relative">
      <Aurora step={step} still={still} />
      <motion.div layout={!still} transition={SPRING} className="relative">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          {step === "choose" ? (
            <motion.div
              key="choose"
              custom={direction}
              variants={slide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="px-6 pb-6 pt-8">
                <Orb icon={UserRoundCog} className="bg-background/80 text-primary" still={still} />
                <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
                  Account controls
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Need a breather, or ready to leave? Nothing happens until you confirm.
                </p>
              </div>
              <ActionRow
                icon={UserRoundMinus}
                tone="amber"
                title="Pause my account"
                hint="Hide it for now. Come back within 7 days."
                index={0}
                disabled={busy}
                onClick={() => go("deactivate")}
                still={still}
              />
              <ActionRow
                icon={Trash2}
                tone="red"
                title="Delete my account"
                hint="Scheduled for removal, with 48 hours to cancel."
                index={1}
                disabled={busy}
                onClick={() => go("delete")}
                still={still}
              />
            </motion.div>
          ) : (
            <motion.div
              key={step}
              custom={direction}
              variants={slide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {(() => {
                const detail = DETAILS[step];
                return (
                  <>
                    <div className="px-6 pb-5 pt-6">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => go("choose")}
                        className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        <ChevronLeft className="size-4" />
                        Back
                      </button>
                      <Orb icon={detail.icon} className={cn("bg-background/80", detail.orb)} still={still} />
                      <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
                        {detail.title}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">{detail.lead}</p>
                    </div>
                    <ul className="border-t border-border/60">
                      {detail.points.map((point, index) => (
                        <motion.li
                          key={point.text}
                          initial={still ? false : { opacity: 0, x: 16 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ ...SPRING, delay: still ? 0 : 0.08 + index * 0.07 }}
                          className="flex items-center gap-4 border-b border-border/60 px-6 py-4"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                            <point.icon className="size-4" />
                          </span>
                          <span className="text-sm leading-snug">{point.text}</span>
                        </motion.li>
                      ))}
                    </ul>
                    <div className="px-6 pb-2 pt-5">
                      {step === "delete" ? (
                        <HoldToConfirm
                          label="Delete my account"
                          busy={busy}
                          onConfirm={() => onSubmit("delete")}
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSubmit("deactivate")}
                          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 font-display text-base font-semibold text-white outline-none transition-transform focus-visible:ring-2 focus-visible:ring-amber-500/50 active:scale-[0.985] disabled:opacity-70"
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <UserRoundMinus className="size-4" />
                          )}
                          {busy ? "Updating your account…" : "Pause my account"}
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <div className="relative px-6 pb-2 pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="h-12 w-full rounded-2xl text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export function AccountControlsSheet({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (action: AccountAction) => void;
}) {
  const isMobile = useIsMobile();
  const still = Boolean(useReducedMotion());
  // Remount the content each time it opens so it always starts on the first step.
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((value) => value + 1);
  }, [open]);

  const guardedChange = (next: boolean) => {
    if (busy && !next) return;
    onOpenChange(next);
  };

  if (isMobile) {
    return (
      <DrawerPrimitive.Root open={open} onOpenChange={guardedChange} dismissible={!busy}>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[3px]" />
          <DrawerPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-[100] flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[2rem] border-t border-border/60 bg-background pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_80px_-12px_rgba(0,0,0,0.35)] outline-none"
          >
            <DrawerPrimitive.Title className="sr-only">Account controls</DrawerPrimitive.Title>
            <div className="absolute left-1/2 top-2.5 z-20 h-1.5 w-11 -translate-x-1/2 rounded-full bg-foreground/20" />
            <div className="overflow-y-auto">
              <Controls
                key={session}
                busy={busy}
                onSubmit={onSubmit}
                onClose={() => guardedChange(false)}
                still={still}
              />
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={guardedChange}>
      <DialogContent
        hideCloseButton
        className="max-w-md gap-0 overflow-hidden rounded-3xl border-border/70 bg-background p-0 shadow-2xl"
      >
        <DialogTitle className="sr-only">Account controls</DialogTitle>
        <DialogDescription className="sr-only">
          Pause or delete your Candid account.
        </DialogDescription>
        <div className="pb-3">
          <Controls
            key={session}
            busy={busy}
            onSubmit={onSubmit}
            onClose={() => guardedChange(false)}
            still={still}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
