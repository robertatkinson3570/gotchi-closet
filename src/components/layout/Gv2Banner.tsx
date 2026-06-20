import { useState } from "react";
import { X } from "lucide-react";

// Bump the version suffix to re-show the banner to everyone after a change.
const DISMISS_KEY = "gv2-banner-dismissed-v1";
const GV2_URL = "https://gv2.gotchicloset.com/";

/**
 * Site-wide announcement bar for the Gotchiverse 2D relaunch. Renders above the
 * sticky header in RootLayout, so it scrolls away after first view. Dismissal
 * persists in localStorage.
 */
export function Gv2Banner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage disabled (private mode) — banner just won't stay dismissed */
    }
  };

  return (
    <div
      role="region"
      aria-label="Gotchiverse 2D announcement"
      className="relative w-full border-b border-[hsl(var(--border))] bg-[linear-gradient(120deg,hsl(var(--spectral)/0.22),hsl(var(--ghst-pink)/0.22),hsl(var(--cyan)/0.22))]"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-10 py-2 text-center text-sm sm:text-[15px]">
        <span className="font-medium">
          <span aria-hidden="true">🔥 </span>
          <span className="font-heading">Gotchiverse 2D</span> claws its way back from the grave.
        </span>
        <a
          href={GV2_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-glow-sm transition-shadow hover:shadow-glow-md"
        >
          Step inside
          <span aria-hidden="true">→</span>
        </a>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
