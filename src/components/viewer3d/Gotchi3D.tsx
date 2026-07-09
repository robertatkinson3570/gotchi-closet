import { useEffect, useMemo, useState } from "react";
import { useView3D } from "@/app/View3DProvider";
import { ModelViewer3D } from "./ModelViewer3D";
import { gotchi3dHashes, gotchi3dGlbUrl, gotchi3dPosterUrl, type Gotchi3DInput } from "@/lib/gotchi3d";
import { env } from "@/lib/env";

// Ask our backend to queue a render for combos missing from the CDN. Today
// Pixelcraft's generator 502s so this is a silent no-op; the day it returns,
// gaps self-heal as users browse. Once per hash per session.
function kickMissingRender(hashes: string[]) {
  try {
    const fresh = hashes.filter((h) => !sessionStorage.getItem(`gc3dkick:${h}`));
    if (fresh.length === 0) return;
    fresh.forEach((h) => sessionStorage.setItem(`gc3dkick:${h}`, "1"));
    void fetch(`${env.companionApiUrl}/api/gotchi3d/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: fresh }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* private mode / offline */ }
}

// Availability results are stable per URL — cache across all cards/session.
const availabilityCache = new Map<string, boolean>();
async function srcAvailable(url: string): Promise<boolean> {
  const cached = availabilityCache.get(url);
  if (cached !== undefined) return cached;
  try {
    // Distinct query param + no-store: a cached 1-byte 206 for the SAME URL
    // poisons model-viewer's subsequent full fetch (observed as an eternally
    // hanging load), so the probe must never share a cache key with the real
    // request.
    const probeUrl = url + (url.includes("?") ? "&" : "?") + "gcprobe=1";
    const r = await fetch(probeUrl, { cache: "no-store", headers: { Range: "bytes=0-0" } });
    availabilityCache.set(url, r.ok);
    return r.ok;
  } catch {
    return false; // transient: don't cache
  }
}

type Props = {
  gotchi: Gotchi3DInput & { name?: string; tokenId?: string };
  className?: string;
  /** The 2D render, shown when 3D is off, underivable, or no model loads. */
  fallback: React.ReactNode;
  /** Fired once this gotchi is known to have no 3D model at all (hide 3D affordances). */
  onUnavailable?: () => void;
  /** Grids: keep wheel events scrolling the page instead of zooming the model. */
  disableZoom?: boolean;
  /** Spin the model continuously (default on; grids gate it behind a button). */
  autoRotate?: boolean;
  /** Grids: show the pre-rendered PNG (no WebGL); ⟳ flips to the live model. */
  posterOnly?: boolean;
};

type Candidate = { src: string; poster?: string; liveOnly?: boolean; naked?: boolean };

/**
 * Renders the gotchi's 3D model when the site-wide toggle is on. Source
 * ladder, PRE-RESOLVED with plain fetches (model-viewer's singleton renderer
 * re-dispatches stale error events across elements, so its error event can't
 * drive fallbacks):
 *   1. official dressed model (both hand orderings; CDN is inconsistent)
 *   2. our server-composed dressed model (live contexts only — no PNG poster)
 *   3. naked body model
 *   4. the 2D fallback, silently.
 */
export function Gotchi3D({ gotchi, className, fallback, onUnavailable, disableZoom, autoRotate, posterOnly }: Props) {
  const { enabled } = useView3D();

  const traitsKey = (gotchi.numericTraits ?? []).join(",");
  const wearablesKey = (gotchi.equippedWearables ?? []).join(",");
  const isDressed = (gotchi.equippedWearables ?? []).slice(0, 7).some((w) => Number(w) > 0);

  const { candidates, dressedCdnHashes } = useMemo(() => {
    const dressed = gotchi3dHashes(gotchi);
    if (dressed.length === 0) return { candidates: [] as Candidate[], dressedCdnHashes: [] as string[] };
    const naked = gotchi3dHashes({ ...gotchi, equippedWearables: [] });
    const list: Candidate[] = [];
    const seen = new Set<string>();
    for (const h of dressed) {
      if (!seen.has(h)) { seen.add(h); list.push({ src: gotchi3dGlbUrl(h), poster: gotchi3dPosterUrl(h) }); }
    }
    if (isDressed && dressed[0] !== naked[0]) {
      list.push({ src: `${env.companionApiUrl}/api/gotchi3d/composed/${dressed[0]}`, liveOnly: true });
    }
    for (const h of naked) {
      if (!seen.has(h)) { seen.add(h); list.push({ src: gotchi3dGlbUrl(h), poster: gotchi3dPosterUrl(h), naked: isDressed }); }
    }
    return { candidates: list, dressedCdnHashes: dressed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotchi.collateral, gotchi.hauntId, traitsKey, wearablesKey]);
  const candidatesKey = candidates.map((c) => c.src).join("|") + (posterOnly ? "|poster" : "|live");

  // Resolve the first available candidate up front (posters use the same GLB
  // availability: PNG and GLB exist together per hash; composed is GLB-only).
  const [resolved, setResolved] = useState<Candidate | null | "pending">("pending");
  useEffect(() => {
    if (!enabled || candidates.length === 0) return;
    let alive = true;
    setResolved("pending");
    (async () => {
      let missedDressedCdn = false;
      for (const c of candidates) {
        // Composed models have no PNG poster, but a dressed gotchi shown naked
        // is worse than a few live scenes per grid: poster cards fall through
        // to the live composed viewer rather than the naked poster.
        if (await srcAvailable(c.src)) {
          if (missedDressedCdn) kickMissingRender(dressedCdnHashes);
          if (alive) setResolved(c);
          return;
        }
        if (!c.liveOnly && !c.naked) missedDressedCdn = true;
      }
      if (missedDressedCdn) kickMissingRender(dressedCdnHashes);
      if (alive) setResolved(null);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, candidatesKey]);

  const failed = candidates.length === 0 || resolved === null;
  useEffect(() => {
    if (enabled && failed) onUnavailable?.();
  }, [enabled, failed, onUnavailable]);

  if (!enabled || failed) return <>{fallback}</>;
  if (resolved === "pending") return <>{fallback}</>; // 2D while resolving (fast)

  const alt = `${gotchi.name ?? "Aavegotchi"}${gotchi.tokenId ? ` #${gotchi.tokenId}` : ""} in 3D${resolved.naked ? " (body only)" : ""}`;

  const nakedBadge = resolved.naked ? (
    <span
      className="absolute bottom-0.5 right-0.5 z-10 text-[8px] leading-none px-1 py-0.5 rounded bg-black/60 text-amber-400/90 border border-amber-400/30 cursor-help"
      title={posterOnly
        ? "The official render of this outfit doesn't exist yet. Press ⟳ to build and view the outfit in 3D."
        : "This outfit's official 3D render doesn't exist yet and couldn't be composed. It has been queued for rendering; 2D always shows the full outfit."}
    >
      {posterOnly ? "⟳ for 3D outfit" : "no 3D outfit yet"}
    </span>
  ) : null;

  if (posterOnly && !resolved.liveOnly) {
    return (
      <span className={`relative block ${className ?? ""}`}>
        <img
          src={resolved.poster}
          alt={alt}
          title="Pre-rendered 3D view. Press ⟳ for the live, draggable model."
          loading="lazy"
          draggable={false}
          className="object-contain w-full h-full"
        />
        {nakedBadge}
      </span>
    );
  }

  return (
    <span className={`relative block ${className ?? ""}`}>
      <ModelViewer3D
        key={resolved.src}
        src={resolved.src}
        poster={resolved.poster}
        alt={alt}
        className="w-full h-full"
        disableZoom={disableZoom}
        autoRotate={autoRotate}
      />
      {nakedBadge}
    </span>
  );
}
