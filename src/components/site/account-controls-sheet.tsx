import { useEffect, useState } from "react";
import {
  ChevronRight,
  Trash2,
  UserRoundCog,
  UserRoundMinus,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type AccountAction = "deactivate" | "delete";

const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

export function Aurora({ still }: { still: boolean }) {
  const a = "bg-primary/30";
  const b = "bg-sky-400/25";
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
export function Orb({ icon: Icon, className, still }: { icon: LucideIcon; className?: string; still: boolean }) {
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

function Controls({
  busy,
  onSelect,
  onClose,
  still,
}: {
  busy: boolean;
  onSelect: (action: AccountAction) => void;
  onClose: () => void;
  still: boolean;
}) {
  return (
    <div className="relative">
      <Aurora still={still} />
      <div className="relative">
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
          onClick={() => onSelect("deactivate")}
          still={still}
        />
        <ActionRow
          icon={Trash2}
          tone="red"
          title="Delete my account"
          hint="Scheduled for removal, with 48 hours to cancel."
          index={1}
          disabled={busy}
          onClick={() => onSelect("delete")}
          still={still}
        />
      </div>
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
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSelect: (action: AccountAction) => void;
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
                onSelect={onSelect}
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
            onSelect={onSelect}
            onClose={() => guardedChange(false)}
            still={still}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
