import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function FloatingBackButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back to Candid"
      title="Back to Candid"
      className={cn(
        "fixed left-5 top-5 z-[100] inline-flex size-11 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
