import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPreference, usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  prominent = false,
  className,
}: {
  prominent?: boolean;
  className?: string;
}) {
  const { theme } = usePreferences();
  const dark = theme === "dark";

  return (
    <Button
      variant={prominent ? "outline" : "ghost"}
      size="icon"
      className={cn(
        prominent && "!size-12 rounded-full border-2 bg-card shadow-sm",
        className,
      )}
      aria-label="Toggle theme"
      onClick={() => {
        const appliedDark = document.documentElement.classList.contains("dark");
        setPreference("theme", appliedDark ? "light" : "dark");
      }}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
