// eslint-disable-next-line @next/next/no-img-element -- plain <img>, not next/image:
// next/image's optimizer rejected this file in dev (sharp isn't installed), and this
// static logo is small enough that optimization/responsive srcset add nothing anyway.

// The mark is dark navy ink with no light-mode variant — nearly invisible on
// a dark surface. Light mode needs no help (it already sits on white), but
// dark mode gets a light backing chip so the mark stays legible without
// reprocessing the source image (which would risk banding the glow).
export function RedrobLogo() {
  return (
    <span className="inline-flex items-center rounded-lg dark:bg-slate-100 dark:px-2 dark:py-1.5">
      <img src="/redrob-logo.png" alt="Redrob" width={637} height={236} className="h-7 w-auto" />
    </span>
  );
}
