import { VenetianMask, Globe2 } from "lucide-react";
import { ProfileAvatar } from "@/components/site/profile-photo";
import { cn } from "@/lib/utils";
import type { User } from "firebase/auth";

function buzz() {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* haptics are optional */
  }
}

/**
 * Compact identity chip for composers. Flip it and your face pixelates into a
 * mosaic, a ghost surfaces, redaction tape wipes across your name and a light
 * ring starts orbiting. Pair the surrounding field with `anon-field` +
 * `data-anon` so the whole composer reacts too.
 */
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
  const name = user?.displayName?.trim() || "";
  const initial = (name || "U").slice(0, 1).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => {
        buzz();
        onToggle();
      }}
      aria-label={anonymous ? "Switch to public identity" : "Switch to anonymous identity"}
      aria-pressed={anonymous}
      className={cn("anon-toggle", className)}
    >
      <span className="anon-ring" aria-hidden />
      <span className="anon-toggle__avatar" aria-hidden>
        <span className="anon-toggle__face">
          {user?.photoURL ? (
            <ProfileAvatar photoUrl={user.photoURL} initials={initial} className="size-full" />
          ) : (
            <span className="font-semibold">{initial}</span>
          )}
        </span>
        <span className="anon-toggle__mosaic" />
        <span className="anon-toggle__ghost">
          <VenetianMask className="size-4" />
        </span>
      </span>
      <span className="anon-toggle__label" aria-live="polite">
        <span className="anon-toggle__name">Public</span>
        <span className="anon-toggle__tape">Anonymous</span>
      </span>
    </button>
  );
}

/** Segmented "Public | Anonymous" switch with a gliding thumb, for settings. */
export function AnonymousModeSwitch({
  anonymous,
  onToggle,
  disabled,
  className,
}: {
  anonymous: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={anonymous}
      aria-label="Post anonymously by default"
      disabled={disabled}
      onClick={() => {
        buzz();
        onToggle();
      }}
      className={cn("anon-switch disabled:opacity-60", className)}
    >
      <span className="anon-switch__thumb" aria-hidden>
        <span className="anon-ring" />
      </span>
      <span className="anon-switch__seg" data-seg="public">
        <Globe2 className="size-4" aria-hidden /> Public
      </span>
      <span className="anon-switch__seg" data-seg="anon">
        <VenetianMask className="size-4" aria-hidden /> Anonymous
      </span>
    </button>
  );
}
