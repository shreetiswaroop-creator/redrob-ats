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
// backing chip. That filter only applies to the default static assets — an
// org-uploaded logo is rendered as-is, since we can't assume its palette.
//
// `variant="icon"` renders /redrob-icon.png — a real cropped asset (see
// scratch notes: sharp scanned redrob-logo.png's alpha channel column-by-
// column to find the icon mark's actual bounding box, not a guessed pixel
// window), not a CSS clip of the combined lockup, so no wordmark ever bleeds
// into the crop the way the old overflow-hidden div risked.
export function RedrobLogo({
  size = "default",
  variant = "full",
}: {
  size?: "default" | "lg";
  variant?: "full" | "icon";
}) {
  // The icon variant only ever sits in the collapsed sidebar rail (a fixed
  // 64px-wide column with 8px side padding), so it uses its own fixed size
  // rather than the "lg"/"default" scale meant for the full lockup — at
  // "lg" height the square icon rendered as wide as the rail itself and
  // spilled past its edge.
  const heightClass = variant === "icon" ? "h-9" : size === "lg" ? "h-16" : "h-10";
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/org-settings/logo")
      .then((r) => r.json())
      .then((data) => setLogoUrl(data.logo_url ?? null))
      .catch(() => {});
  }, []);

  if (logoUrl) {
    if (variant === "icon") {
      // No separate icon-only version of an org-uploaded logo exists (we
      // can't auto-crop an arbitrary uploaded image the way we did for the
      // default asset), so fall back to the full lockup centered and
      // clipped by a narrow window rather than showing nothing.
      return (
        <div className={`${heightClass} flex w-10 items-center justify-center overflow-hidden`}>
          <img src={logoUrl} alt="Redrob" className={`${heightClass} w-auto object-contain`} />
        </div>
      );
    }
    return <img src={logoUrl} alt="Redrob" className={`${heightClass} w-auto object-contain`} />;
  }

  if (variant === "icon") {
    return (
      <img
        src="/redrob-icon.png"
        alt="Redrob"
        width={113}
        height={113}
        className={`${heightClass} w-auto dark:invert dark:hue-rotate-180`}
      />
    );
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
