import { useState } from "react";
import { X } from "lucide-react";

import "./gvr-banner.css";

// Bump the version suffix to re-show the banner to everyone after a change.
const DISMISS_KEY = "gvr-banner-dismissed-v1";
const GVR_URL = "https://gvr.gotchicloset.com/";

/**
 * Site-wide announcement bar for Gotchiverse Revival. Renders above the sticky
 * header in RootLayout, so it scrolls away after first view. Dismissal persists
 * in localStorage.
 */
export function GvrBanner() {
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
    <div role="region" aria-label="Gotchiverse Revival announcement" className="gvr-banner w-full">
      <div className="mx-auto flex max-w-[1600px] items-center justify-center gap-2 px-8 py-1.5 sm:gap-3 sm:px-10">
        <span className="gvr-logo-wrap">
          <img
            src="/gvr-logo.webp"
            alt="Gotchiverse Revival"
            width={300}
            height={112}
            className="gvr-logo"
          />
          <span className="gvr-logo-glint" aria-hidden="true" />
        </span>
        <span className="gvr-copy text-[10px] leading-tight sm:text-xs">
          {/* The wordmark's own "GOTCHIVERSE REVIVAL" sub-line is unreadable at
              banner height, so the name is spelled out in type beside it. */}
          <span className="gvr-copy-name">Gotchiverse Revival</span> is live in 3D.{" "}
          {/* Tail clause is the hook, but it pushes the bar to two lines on phones. */}
          <span className="gvr-copy-tail hidden sm:inline">The roadmap you were promised.</span>
        </span>
        <a href={GVR_URL} target="_blank" rel="noopener noreferrer" className="gvr-cta">
          Enter
          <span aria-hidden="true">→</span>
        </a>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="gvr-dismiss absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
