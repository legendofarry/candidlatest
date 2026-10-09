import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPreference, usePreferences } from "@/lib/preferences";

export function ThemeToggle() {
  const { theme } = usePreferences();
  const dark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
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
