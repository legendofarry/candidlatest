import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ fallback = "/", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 text-muted-foreground hover:text-foreground"
      onClick={() => {
        if (canGoBack) router.history.back();
        else router.navigate({ to: fallback });
      }}
    >
      <ArrowLeft className="size-4" /> {label}
    </Button>
  );
}
