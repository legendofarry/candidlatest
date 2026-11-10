import { useState } from "react";
import {
  getCompanyAccent,
  getCompanyBrand,
  getCompanyBrandLogoUrl,
  getCompanyMonogram,
} from "@/lib/company-branding";
import { cn } from "@/lib/utils";

export function CompanyLogo({
  name,
  sizeClassName = "size-11",
}: {
  name: string;
  sizeClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const brand = getCompanyBrand(name);
  const logoUrl = brand?.logoPath ? getCompanyBrandLogoUrl(brand.domain, brand.logoPath) : null;

  if (logoUrl && !imageFailed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white",
          sizeClassName,
        )}
      >
        <img
          src={logoUrl}
          alt=""
          className="size-full object-contain"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  const accent = getCompanyAccent(name);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold text-white",
        sizeClassName,
      )}
      style={{
        background: `linear-gradient(140deg, ${accent}, color-mix(in oklab, ${accent} 45%, black))`,
      }}
    >
      {getCompanyMonogram(name)}
    </span>
  );
}
