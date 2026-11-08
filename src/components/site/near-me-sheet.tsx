import { useEffect, useState } from "react";
import { Check, ChevronRight, Loader2, LocateFixed, MapPin, MapPinned, ShieldCheck } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Drawer as DrawerPrimitive } from "vaul";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Aurora, Orb } from "@/components/site/account-controls-sheet";
import { geolocationPermission, useNearMe, type GpsResult } from "@/hooks/use-near-me";
import { useIsMobile } from "@/hooks/use-mobile";
import { areasForCounty } from "@/lib/kenya-locations";
import { KENYA_COUNTIES, NEAR_ME_RADIUS_OPTIONS } from "@/lib/near-me";
import { cn } from "@/lib/utils";

type Step = "ask" | "locating" | "problem" | "manual" | "manage";

const PROBLEMS: Record<Exclude<GpsResult, { ok: true }>["reason"], string> = {
  denied:
    "Location is blocked for this site. Allow it in your browser's site settings, or just pick your area instead.",
  unavailable: "We couldn't work out where you are right now. Pick your area instead.",
  timeout: "Finding your location took too long. Try again, or pick your area instead.",
  outside: "Near me works inside Kenya. Pick your area to continue.",
  unsupported: "This browser can't share its location. Pick your area instead.",
};

const selectClass =
  "h-12 w-full rounded-2xl border border-border bg-background px-4 text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

function SheetBody({ onClose, still }: { onClose: () => void; still: boolean }) {
  const near = useNearMe();
  const [step, setStep] = useState<Step>(near.location ? "manage" : "ask");
  const [problem, setProblem] = useState<keyof typeof PROBLEMS | null>(null);
  const [county, setCounty] = useState(near.location?.county ?? "");
  const [area, setArea] = useState(near.location?.area ?? "");
  const areas = county ? [...(areasForCounty(county) ?? [])] : [];

  async function allow() {
    // Skip the browser prompt entirely when it is already blocked: it would not appear.
    if ((await geolocationPermission()) === "denied") {
      setProblem("denied");
      setStep("problem");
      return;
    }
    setStep("locating");
    const result = await near.requestGps();
    if (result.ok) {
      onClose();
      return;
    }
    setProblem(result.reason);
    setStep("problem");
  }

  function useChosenArea() {
    if (!county) return;
    if (near.chooseArea(county, area || null)) onClose();
  }

  const privacy = (
    <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground">
      {[
        "Your exact location stays on this device.",
        "You see stories and employers close to you.",
        "People nearby is separate, and off until you turn it on.",
      ].map((line) => (
        <li key={line} className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          {line}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative">
      <Aurora still={still} />
      <div className="relative px-6 pb-4 pt-8">
        {step === "manage" ? (
          <>
            <Orb icon={MapPinned} className="bg-background/80 text-primary" still={still} />
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              Near {near.location?.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {near.location?.source === "gps" ? "Using your device location" : "Using the area you chose"}
              . Change how far we look, or update where you are.
            </p>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Search distance
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Search distance">
              {NEAR_ME_RADIUS_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={near.radius === option}
                  onClick={() => near.setRadius(option)}
                  className={cn(
                    "h-11 rounded-xl border text-sm font-medium transition-colors",
                    near.radius === option
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {option} km
                </button>
              ))}
            </div>
          </>
        ) : step === "manual" ? (
          <>
            <Orb icon={MapPin} className="bg-background/80 text-primary" still={still} />
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              Choose your area
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll show what's close to it. You can change this any time.
            </p>
            <label className="mt-6 block text-sm font-medium" htmlFor="near-county">
              County
            </label>
            <select
              id="near-county"
              value={county}
              onChange={(event) => {
                setCounty(event.target.value);
                setArea("");
              }}
              className={cn(selectClass, "mt-1.5")}
            >
              <option value="">Select a county</option>
              {KENYA_COUNTIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {areas.length ? (
              <>
                <label className="mt-4 block text-sm font-medium" htmlFor="near-area">
                  Area <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <select
                  id="near-area"
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  className={cn(selectClass, "mt-1.5")}
                >
                  <option value="">Anywhere in {county}</option>
                  {areas.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </>
        ) : step === "problem" ? (
          <>
            <Orb icon={MapPin} className="bg-background/80 text-primary" still={still} />
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              We couldn't get your location
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {problem ? PROBLEMS[problem] : PROBLEMS.unavailable}
            </p>
          </>
        ) : (
          <>
            <Orb icon={LocateFixed} className="bg-background/80 text-primary" still={still} />
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              {step === "locating" ? "Finding you…" : "See what's near you"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "locating"
                ? "Approve the location prompt from your browser to continue."
                : "Allow location to see employers and stories close to where you are."}
            </p>
            {step === "ask" ? privacy : null}
          </>
        )}
      </div>

      <div className="relative space-y-1 px-6 pb-3 pt-2">
        {step === "ask" || step === "problem" ? (
          <>
            {step === "ask" || problem === "timeout" || problem === "unavailable" ? (
              <button
                type="button"
                onClick={() => void allow()}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-display text-base font-semibold text-primary-foreground outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.985]"
              >
                <LocateFixed className="size-4" />
                {step === "ask" ? "Allow location" : "Try again"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setStep("manual")}
              className="flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              Choose my area instead <ChevronRight className="size-4" />
            </button>
          </>
        ) : null}

        {step === "locating" ? (
          <div className="flex h-14 items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : null}

        {step === "manual" ? (
          <button
            type="button"
            disabled={!county}
            onClick={useChosenArea}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-display text-base font-semibold text-primary-foreground outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.985] disabled:opacity-40"
          >
            <Check className="size-4" /> Use this area
          </button>
        ) : null}

        {step === "manage" ? (
          <>
            <button
              type="button"
              onClick={() => void allow()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-display text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.985]"
            >
              <LocateFixed className="size-4" /> Update from my location
            </button>
            <button
              type="button"
              onClick={() => setStep("manual")}
              className="h-12 w-full rounded-2xl text-sm font-medium transition-colors hover:bg-muted/60"
            >
              Choose another area
            </button>
            <button
              type="button"
              onClick={() => {
                near.clear();
                onClose();
              }}
              className="h-12 w-full rounded-2xl text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Forget my location
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-2xl text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          {step === "manage" ? "Done" : "Not now"}
        </button>
      </div>
    </div>
  );
}

/**
 * Asks for location the friendly way: a bottom sheet on phones, a dialog on desktop. The sheet
 * explains why before the browser prompt appears, and always offers choosing an area instead.
 */
export function NearMeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const still = Boolean(useReducedMotion());
  // Remount on every open so it always starts on the right step.
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((value) => value + 1);
  }, [open]);
  const close = () => onOpenChange(false);

  if (isMobile) {
    return (
      <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[3px]" />
          <DrawerPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-[100] flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[2rem] border-t border-border/60 bg-background pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_80px_-12px_rgba(0,0,0,0.35)] outline-none"
          >
            <DrawerPrimitive.Title className="sr-only">Near me</DrawerPrimitive.Title>
            <div className="absolute left-1/2 top-2.5 z-20 h-1.5 w-11 -translate-x-1/2 rounded-full bg-foreground/20" />
            <div className="overflow-y-auto">
              <SheetBody key={session} onClose={close} still={still} />
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="max-w-md gap-0 overflow-hidden rounded-3xl border-border/70 bg-background p-0 shadow-2xl"
      >
        <DialogTitle className="sr-only">Near me</DialogTitle>
        <DialogDescription className="sr-only">
          Choose how Candid finds stories and employers near you.
        </DialogDescription>
        <SheetBody key={session} onClose={close} still={still} />
      </DialogContent>
    </Dialog>
  );
}
