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
  const accent = getCompanyAccent(name);

  if (logoUrl && !imageFailed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
          sizeClassName,
        )}
        style={{ backgroundColor: accent }}
      >
        <img
          src={logoUrl}
          alt=""
          className="size-full scale-[1.15] object-contain"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

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
