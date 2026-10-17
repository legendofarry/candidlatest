import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LocateFixed, LoaderCircle, MapPin, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { updateStoryLocation } from "@/lib/actions.functions";
import { notify as toast } from "@/lib/notifications-store";
import { type MapCoordinates, isValidMapCoordinates } from "@/lib/map-location";

export function StoryLocationDialog({
  storyId,
  county,
  area,
  initialCoordinates,
  authorId,
}: {
  storyId: string;
  county: string | null;
  area: string | null;
  initialCoordinates: MapCoordinates | null;
  authorId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [coordinates, setCoordinates] = useState<MapCoordinates | null>(initialCoordinates);
  const [updating, setUpdating] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const saveLocation = useServerFn(updateStoryLocation);
  const canUpdate = Boolean(user && authorId && user.uid === authorId);
  const place = [area, county, "Kenya"].filter(Boolean).join(", ");
  const mapQuery = isValidMapCoordinates(coordinates)
    ? `${coordinates.lat},${coordinates.lng}`
    : place || "Kenya";
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=${coordinates ? 16 : 12}&output=embed`;

  function updateFromCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("Location services are not available in this browser.");
      return;
    }
    setUpdating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const next = { lat: Number(coords.latitude.toFixed(6)), lng: Number(coords.longitude.toFixed(6)) };
        try {
          await saveLocation({ data: { story_id: storyId, lat: next.lat, lng: next.lng } });
          setCoordinates(next);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["stories"] }),
            queryClient.invalidateQueries({ queryKey: ["story", storyId] }),
            queryClient.invalidateQueries({ queryKey: ["story-pages"] }),
          ]);
          toast.success("Public story location updated.");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not update the map pin.");
        } finally {
          setUpdating(false);
        }
      },
      () => {
        setUpdating(false);
        toast.error("Could not get your location. Check your browser permission and try again.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="relative z-10 inline-flex min-w-0 items-center gap-1 rounded-md text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open map for ${place || "story location"}`}
      >
        <MapPin className="size-3 shrink-0" />
        {county ? <span>{county}</span> : null}
        {area ? <><span aria-hidden="true">·</span><span>{area}</span></> : null}
        {!county && !area ? <span>View location</span> : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          hideCloseButton
          className="!fixed !inset-0 !left-0 !top-0 !z-[100] !grid !h-[100dvh] !w-screen !max-w-none !translate-x-0 !translate-y-0 !gap-0 !overflow-hidden !rounded-none !border-0 !p-0"
        >
          <div className="flex min-h-0 flex-col bg-background">
            <header className="z-10 flex shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 py-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-left text-base">Story location</DialogTitle>
                <p className="truncate text-xs text-muted-foreground">{place || "Kenya"}</p>
              </div>
              <DialogClose asChild>
                <Button type="button" size="icon" variant="outline" aria-label="Close map">
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </header>
            <div className="relative min-h-0 flex-1 bg-secondary">
              <iframe
                key={mapUrl}
                title={`Map showing ${place || "the story location"}`}
                src={mapUrl}
                className="absolute inset-0 size-full border-0"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
              {!coordinates ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-lg">
                  Showing an approximate area. No exact GPS pin was added.
                </div>
              ) : null}
            </div>
            {canUpdate ? (
              <footer className="shrink-0 space-y-2 border-t border-border bg-background px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
                <p className="text-xs text-muted-foreground">
                  This exact pin is public. Update it only while at the workplace.
                </p>
                <Button className="w-full" onClick={updateFromCurrentLocation} disabled={updating}>
                  {updating ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <LocateFixed className="mr-2 size-4" />}
                  {updating ? "Updating pin…" : "Update from current location"}
                </Button>
              </footer>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
