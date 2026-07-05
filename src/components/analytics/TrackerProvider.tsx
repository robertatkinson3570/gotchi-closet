// src/components/analytics/TrackerProvider.tsx
// Fires a pageview on every route change and a connect event the first time a
// wallet address appears. Renders nothing.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { track } from "@/lib/analytics/track";

export function TrackerProvider() {
  const location = useLocation();
  const { address } = useAccount();
  const lastConnected = useRef<string | null>(null);

  // Page views. address is included when known so the row is attributable.
  useEffect(() => {
    track("pageview", location.pathname, address);
  }, [location.pathname, address]);

  // Connect event, once per newly-seen address.
  useEffect(() => {
    if (address && lastConnected.current !== address) {
      lastConnected.current = address;
      track("connect", location.pathname, address);
    }
    if (!address) lastConnected.current = null;
    // location.pathname intentionally omitted: connect fires on address change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return null;
}
