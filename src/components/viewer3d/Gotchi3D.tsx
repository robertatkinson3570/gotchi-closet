import { useEffect, useMemo, useState } from "react";
import { useView3D } from "@/app/View3DProvider";
import { ModelViewer3D } from "./ModelViewer3D";
import { gotchi3dHashes, type Gotchi3DInput } from "@/lib/gotchi3d";
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
    // Only DEFINITIVE misses (403/404: asset absent upstream) cache negative.
    // Transient statuses (5xx, 429) would otherwise pin a card to 2D for the
    // whole session — seen on cold servers right after a deploy, when the
    // composed endpoint is still building its cache.
    if (r.ok || r.status === 403 || r.status === 404) availabilityCache.set(url, r.ok);
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

type Candidate = { src: string; poster: string };

/**
 * Renders the gotchi's 3D model when the site-wide toggle is on. ONE source:
 * our API's /model/:hash — the server serves Pixelcraft's official primary
 * render (mirrored onto our box forever) when one exists, else our composed
 * model. The card shows the 2D art until the model is confirmed ready, so a
 * dressed gotchi NEVER shows naked, never flashes a mirrored alt render, and
 * every card loads from one origin with one timing. Grids prefer the
 * official poster PNG when it exists (Pixelcraft's pre-lit renders).
 */
export function Gotchi3D({ gotchi, className, fallback, onUnavailable, disableZoom, autoRotate, posterOnly }: Props) {
  const { enabled } = useView3D();

  const traitsKey = (gotchi.numericTraits ?? []).join(",");
  const wearablesKey = (gotchi.equippedWearables ?? []).join(",");
  const isDressed = (gotchi.equippedWearables ?? []).slice(0, 7).some((w) => Number(w) > 0);

  const { candidate, dressedCdnHashes } = useMemo(() => {
    const dressed = gotchi3dHashes(gotchi);
    if (dressed.length === 0) return { candidate: null as Candidate | null, dressedCdnHashes: [] as string[] };
    // The PRIMARY hash only: alt hand-orderings render mirrored vs the 2D
    // art, and the server already falls back to our composed model.
    const hash = dressed[0];
    return {
      candidate: {
        src: `${env.companionApiUrl}/api/gotchi3d/model/${hash}?v=9`,
        poster: `${env.companionApiUrl}/api/gotchi3d/poster/${hash}?v=9`,
      },
      dressedCdnHashes: isDressed ? dressed : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotchi.collateral, gotchi.hauntId, traitsKey, wearablesKey]);
  const candidatesKey = (candidate?.src ?? "") + (posterOnly ? "|poster" : "|live");

  // Resolve the first available candidate up front (posters use the same GLB
  // availability: PNG and GLB exist together per hash; composed is GLB-only).
  const [resolved, setResolved] = useState<Candidate | null | "pending">("pending");
  const [posterOk, setPosterOk] = useState(false);
  useEffect(() => {
    if (!enabled || !candidate) return;
    let alive = true;
    setResolved("pending");
    setPosterOk(false);
    (async () => {
      // One probe. A cold model composes server-side during this request
      // (seconds); the card shows the 2D art until it's confirmed ready.
      const [modelOk, posterAvailable] = await Promise.all([
        srcAvailable(candidate.src),
        posterOnly ? srcAvailable(candidate.poster) : Promise.resolve(false),
      ]);
      if (!alive) return;
      if (!modelOk && isDressed) kickMissingRender(dressedCdnHashes);
      setPosterOk(posterAvailable);
      setResolved(modelOk ? candidate : null);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, candidatesKey]);

  const failed = !candidate || resolved === null;
  useEffect(() => {
    if (enabled && failed) onUnavailable?.();
  }, [enabled, failed, onUnavailable]);

  if (!enabled || failed) return <>{fallback}</>;
  if (resolved === "pending") return <>{fallback}</>; // 2D while resolving (fast)

  const alt = `${gotchi.name ?? "Aavegotchi"}${gotchi.tokenId ? ` #${gotchi.tokenId}` : ""} in 3D`;

  // Official posters win in grids: they're Pixelcraft's pre-lit renders and
  // look better than live neutral-lit scenes. Composed-only outfits have no
  // poster and render the live model with in-model frame anchors instead.
  if (posterOnly && posterOk) {
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
        frameGotchi
      />
    </span>
  );
}
