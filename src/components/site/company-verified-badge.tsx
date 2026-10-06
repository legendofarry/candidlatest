import { BadgeCheck } from "lucide-react";

/** Small, consistent mark for companies verified by Candid. */
export function CompanyVerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <BadgeCheck
      aria-label="Verified company"
      role="img"
      className={`inline-block size-4 shrink-0 text-verified ${className}`}
    />
  );
}
