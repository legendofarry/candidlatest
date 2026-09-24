import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({
  fallback = "/",
  label = "Back",
  compact = false,
}: {
  fallback?: string;
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      aria-label={compact ? "Go back" : undefined}
      title={compact ? "Go back" : `Back to ${label}`}
      className={
        compact
          ? "rounded-full border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur transition-transform hover:-translate-x-0.5 hover:bg-secondary hover:text-foreground"
          : "-ml-2 text-muted-foreground hover:text-foreground"
      }
      onClick={() => {
        if (canGoBack) router.history.back();
        else router.navigate({ to: fallback });
      }}
    >
      <ArrowLeft className="size-4" /> {compact ? null : label}
    </Button>
  );
}
