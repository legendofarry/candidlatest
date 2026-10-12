import { BadgeCheck } from "lucide-react";
import type { MembershipTier } from "@/lib/membership";

/** The package grants the standard check badge; tier does not change its appearance. */
export function MembershipBadge({
  tier,
  official = false,
  className,
}: {
  tier?: MembershipTier | null | undefined;
  official?: boolean | undefined;
  className?: string;
}) {
  if (official || !tier || tier === "basic") return null;

  return (
    <span title="Candid badge" className="ml-1 inline-flex translate-y-[0.04em] align-middle">
      <BadgeCheck
        aria-label="Candid badge"
        role="img"
        className={`inline-block size-4 shrink-0 text-primary ${className ?? ""}`}
      />
    </span>
  );
}
