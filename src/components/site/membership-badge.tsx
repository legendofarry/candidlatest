import { BadgeCheck } from "lucide-react";
import { getMembershipEntitlements, type MembershipTier } from "@/lib/membership";

/** The one public membership badge used everywhere Candid shows an account. */
export function MembershipBadge({
  tier,
  official = false,
  className,
}: {
  tier?: MembershipTier | null | undefined;
  official?: boolean | undefined;
  className?: string;
}) {
  if (official || !tier || !getMembershipEntitlements(tier).membershipBadge) return null;

  const label = tier === "gold" ? "Gold member" : "Premium member";

  return (
    <span
      title={label}
      className="ml-1 inline-flex translate-y-[0.04em] align-middle text-verified"
    >
      <BadgeCheck
        aria-label={label}
        role="img"
        strokeWidth={3}
        className={`inline-block size-5 shrink-0 ${className ?? ""}`}
      />
    </span>
  );
}
