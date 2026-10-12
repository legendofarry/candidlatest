import { BadgeCheck } from "lucide-react";

/** Small, consistent mark for companies verified by Candid. */
export function CompanyVerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Verified company — Candid has confirmed this organisation’s identity."
      className="ml-1 inline-flex translate-y-[0.04em] align-middle"
    >
      <BadgeCheck
        aria-label="Verified company"
        role="img"
        className={`inline-block size-4 shrink-0 text-verified ${className}`}
      />
    </span>
  );
}
