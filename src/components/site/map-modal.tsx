import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, MapPin } from "lucide-react";

export type MapTarget = {
  label: string | null;
  lat: number | null;
  lng: number | null;
  map_url: string | null;
};

function embedSrc(lat: number, lng: number) {
  const d = 0.01;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

/** Full-screen map for a tapped location tag. Renders only when open, so SSR stays clean. */
export function MapModal({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  target: MapTarget;
}) {
  const hasPin = typeof target.lat === "number" && typeof target.lng === "number";
  const external =
    target.map_url ??
    (hasPin
      ? `https://www.openstreetmap.org/?mlat=${target.lat}&mlon=${target.lng}#map=16/${target.lat}/${target.lng}`
      : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] w-screen max-w-none gap-0 rounded-none p-0 sm:h-[85vh] sm:w-[92vw] sm:max-w-3xl sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-primary" />
            {target.label ?? "Location"}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {open && hasPin ? (
            <iframe
              title={target.label ?? "Company location"}
              src={embedSrc(target.lat as number, target.lng as number)}
              className="size-full border-0"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <MapPin className="size-8 text-primary" />
              <p>This employer shared a map link instead of a pin.</p>
            </div>
          )}
        </div>
        {external ? (
          <div className="border-t border-border p-3">
            <Button asChild variant="outline" className="w-full">
              <a href={external} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="size-4" /> Open in maps
              </a>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
