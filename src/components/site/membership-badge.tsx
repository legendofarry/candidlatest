import { BadgeCheck } from "lucide-react";
import type { MembershipTier } from "@/lib/membership";

/** The package grants the standard check badge; tier does not change its appearance. */
export function MembershipBadge({
  tier,
  className,
}: {
  tier?: MembershipTier | null | undefined;
  className?: string;
}) {
  if (!tier || tier === "basic") return null;

  return (
    <span title="Candid badge" className="inline-flex">
    <BadgeCheck
      aria-label="Candid badge"
      role="img"
      className={`inline-block size-4 shrink-0 text-primary ${className ?? ""}`}
    />
    </span>
  );
}
