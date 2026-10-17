import { Heart, Sparkles } from "lucide-react";
import { getMembershipEntitlements, type MembershipTier } from "@/lib/membership";

/** Paid membership is shown as support for Candid, never as identity verification. */
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

  const isGold = tier === "gold";
  const Icon = isGold ? Sparkles : Heart;
  const label = isGold ? "Gold supporter" : "Premium supporter";

  return (
    <span
      title={label}
      className={`ml-1 inline-flex translate-y-[0.04em] align-middle ${isGold ? "text-amber-500" : "text-primary"}`}
    >
      <Icon
        aria-label={label}
        role="img"
        className={`inline-block size-3.5 shrink-0 ${className ?? ""}`}
      />
    </span>
  );
}
