import { VenetianMask } from "lucide-react";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { cn } from "@/lib/utils";
import type { User } from "firebase/auth";

export function AnonymousPostingToggle({
  anonymous,
  onToggle,
  user,
  className,
}: {
  anonymous: boolean;
  onToggle: () => void;
  user?: Pick<User, "photoURL" | "displayName"> | null;
  className?: string;
}) {
  const initial = (user?.displayName ?? "U").slice(0, 1).toUpperCase();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={anonymous ? "Switch to public identity" : "Switch to anonymous identity"}
      aria-pressed={anonymous}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium transition-all duration-200 shadow-sm backdrop-blur-sm",
        anonymous
          ? "border-violet-400/60 bg-gradient-to-r from-violet-500/90 via-fuchsia-500/85 to-primary/90 text-white shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.85)]"
          : "border-border bg-background/90 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-5 place-items-center overflow-hidden rounded-full border transition-all duration-200",
          anonymous ? "border-white/30 bg-white/12" : "border-border bg-muted",
        )}
      >
        {anonymous ? (
          <VenetianMask className="size-3.5" />
        ) : user?.photoURL ? (
          <ProfileAvatar photoUrl={user.photoURL} initials={initial} className="size-5" />
        ) : (
          <span className="text-[9px] font-semibold">{initial}</span>
        )}
      </span>
      <span>{anonymous ? "Anon" : "Public"}</span>
    </button>
  );
}
