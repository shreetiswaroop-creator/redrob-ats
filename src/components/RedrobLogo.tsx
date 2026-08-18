"use client";

// eslint-disable-next-line @next/next/no-img-element -- plain <img>, not next/image:
// next/image's optimizer rejected this file in dev (sharp isn't installed), and this
// static logo is small enough that optimization/responsive srcset add nothing anyway.

import { useEffect, useState } from "react";

// The mark is dark navy ink with no light-mode variant — nearly invisible on
// a dark surface. Light mode needs no help (it already sits on white); dark
// mode runs the source image through a CSS filter (invert + hue-rotate) to
// flip the dark ink light while landing the violet glow back near its
// original hue, so the mark reads cleanly without a second asset or a
// backing chip. That filter only applies to the default static asset — an
// org-uploaded logo is rendered as-is, since we can't assume its palette.
export function RedrobLogo({ size = "default" }: { size?: "default" | "lg" }) {
  const heightClass = size === "lg" ? "h-16" : "h-10";
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/org-settings/logo")
      .then((r) => r.json())
      .then((data) => setLogoUrl(data.logo_url ?? null))
      .catch(() => {});
  }, []);

  if (logoUrl) {
    return <img src={logoUrl} alt="Redrob" className={`${heightClass} w-auto object-contain`} />;
  }

  return (
    <img
      src="/redrob-logo.png"
      alt="Redrob"
      width={637}
      height={236}
      className={`${heightClass} w-auto dark:invert dark:hue-rotate-180`}
    />
  );
}
