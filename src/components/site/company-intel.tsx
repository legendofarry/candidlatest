import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, MapPin, Star, Users } from "lucide-react";
import { getCompanyIntel, setCompanyLocation } from "@/lib/company.functions";
import { getOnboardingState } from "@/lib/onboarding.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { notify as toast } from "@/lib/notifications-store";
import { CompanyRatingDialog } from "@/components/site/company-rating-dialog";
import { MapModal } from "@/components/site/map-modal";

export function companyIntelQueryKey(companyId: string) {
  return ["company-intel", companyId] as const;
}

export function useCompanyIntel(companyId: string) {
  return useQuery({
    queryKey: companyIntelQueryKey(companyId),
    queryFn: () => getCompanyIntel({ data: { company_id: companyId } }),
  });
}

/** Location chip on a story — hidden entirely when the employer has no location. */
export function StoryLocationTag({
  companyId,
  county,
}: {
  companyId: string;
  county: string | null;
}) {
  const { data } = useCompanyIntel(companyId);
  const [open, setOpen] = useState(false);
  const location = data?.location;
  if (!location) return null;

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary"
      >
        <MapPin className="size-3" /> {location.label ?? county ?? "View on map"}
      </button>
      <MapModal
        open={open}
        onOpenChange={setOpen}
        target={{
          label: location.label,
          lat: location.lat,
          lng: location.lng,
          map_url: location.map_url,
        }}
      />
    </>
  );
}

export function CompanyIntelPanel({
  companyId,
  companyName,
  metooTotal,
}: {
  companyId: string;
  companyName: string;
  metooTotal: number;
}) {
  const { user } = useAuth();
  const intel = useCompanyIntel(companyId);
  const [rateOpen, setRateOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const data = intel.data;
  const location = data?.location ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">What people say</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.respondents ?? 0} people answered the questionnaire
            </p>
          </div>
          {user ? (
            <Button size="sm" onClick={() => setRateOpen(true)}>
              <Star className="size-4" /> Rate
            </Button>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link to="/auth">Sign in to rate</Link>
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-xl font-semibold text-primary">
              {data?.would_work_here_pct === null || data?.would_work_here_pct === undefined
                ? "—"
                : `${data.would_work_here_pct}%`}
            </p>
            <p className="text-[11px] text-muted-foreground">would work here</p>
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <p className="inline-flex items-center gap-1 text-xl font-semibold">
              <Users className="size-4 text-muted-foreground" /> {metooTotal}
            </p>
            <p className="text-[11px] text-muted-foreground">“me too” on these stories</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {intel.isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (data?.reasons.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">
              No red flags reported yet. Be the first to answer.
            </p>
          ) : (
            data?.reasons.slice(0, 6).map((item) => (
              <div key={item.reason}>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{item.reason}</span>
                  <span>{item.pct}%</span>
                </div>
                <Progress value={item.pct} className="mt-1 h-1.5" />
              </div>
            ))
          )}
        </div>
      </div>

      {location ? (
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="flex w-full items-center gap-2 rounded-2xl border border-border bg-card p-4 text-left text-sm transition hover:border-primary/50"
        >
          <MapPin className="size-4 text-primary" />
          <span className="flex-1">{location.label ?? "View this employer on the map"}</span>
          <span className="text-xs text-primary">Open map</span>
        </button>
      ) : null}

      <CompanyLocationPrompt companyId={companyId} hasLocation={Boolean(location)} />

      {location ? (
        <MapModal
          open={mapOpen}
          onOpenChange={setMapOpen}
          target={{
            label: location.label,
            lat: location.lat,
            lng: location.lng,
            map_url: location.map_url,
          }}
        />
      ) : null}

      <CompanyRatingDialog
        open={rateOpen}
        onOpenChange={setRateOpen}
        companyId={companyId}
        companyName={companyName}
      />
    </div>
  );
}

/** Only company accounts see this, and only until a location exists. */
function CompanyLocationPrompt({
  companyId,
  hasLocation,
}: {
  companyId: string;
  hasLocation: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const stateFn = useServerFn(getOnboardingState);
  const save = useServerFn(setCompanyLocation);
  const [label, setLabel] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinning, setPinning] = useState(false);

  const state = useQuery({
    queryKey: ["onboarding-state", user?.uid ?? "anon"],
    queryFn: () => stateFn(),
    enabled: Boolean(user),
  });

  if (!user || hasLocation || state.data?.accountType !== "company") return null;

  async function persist(lat: number | null, lng: number | null) {
    setBusy(true);
    try {
      await save({
        data: {
          company_id: companyId,
          label: label.trim() || null,
          map_url: mapUrl.trim() || null,
          lat,
          lng,
        },
      });
      toast.success("Location saved.");
      await queryClient.invalidateQueries({ queryKey: companyIntelQueryKey(companyId) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the location");
    } finally {
      setBusy(false);
    }
  }

  function pin() {
    if (!navigator.geolocation) {
      toast.error("This device cannot share a location.");
      return;
    }
    setPinning(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPinning(false);
        void persist(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setPinning(false);
        toast.error("Location permission denied. Paste a map link instead.");
      },
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <h2 className="text-sm font-semibold">Add your workplace location</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pin it automatically or paste a map link. Location tags on stories stay hidden until you do.
      </p>
      <div className="mt-3 space-y-2">
        <div className="space-y-1.5">
          <Label htmlFor="loc-label">Label</Label>
          <Input
            id="loc-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Head office, Westlands"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loc-url">Map link</Label>
          <Input
            id="loc-url"
            value={mapUrl}
            onChange={(event) => setMapUrl(event.target.value)}
            placeholder="https://maps.google.com/..."
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={pinning || busy} onClick={pin}>
            {pinning ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            Auto-pin
          </Button>
          <Button
            className="flex-1"
            disabled={busy || !mapUrl.trim()}
            onClick={() => void persist(null, null)}
          >
            Save link
          </Button>
        </div>
      </div>
    </div>
  );
}
