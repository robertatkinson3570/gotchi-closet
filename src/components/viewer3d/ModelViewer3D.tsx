import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

// The ~210 KB gz web component loads once, on first 3D render, never in the
// main bundle.
let loader: Promise<unknown> | null = null;
const loadModelViewer = () => (loader ??= import("@google/model-viewer"));

type Props = {
  src: string;
  /** Shown while the GLB streams (models run 0.6-7 MB). */
  poster?: string;
  alt: string;
  className?: string;
  /** Fired when the model can't load (uncached combo, network) — swap to 2D. */
  onLoadError?: () => void;
  /** Grids: keep wheel events scrolling the page instead of zooming the model. */
  disableZoom?: boolean;
  /** Spin the model continuously. Default on (modals); grids pass a per-card
   *  rotate-button state so 100 models don't churn the GPU at once. */
  autoRotate?: boolean;
  /** Gotchis: frame the ~2.3-unit body with a FIXED camera instead of
   *  auto-framing to scene bounds. Auto-framing sizes the gotchi by its
   *  accessories (a petless gotchi fills the card, one with pets shrinks),
   *  so mixed grids look inconsistent. Every gotchi body is the same world
   *  size, so one fixed camera renders them all at identical scale. */
  frameGotchi?: boolean;
};

/**
 * Clean GLB viewer: full 360° drag-orbit, pinch/scroll zoom and gentle
 * auto-rotate via <model-viewer> (the same component the dapp uses). Parents
 * MUST handle onLoadError by falling back to the 2D render — no broken cubes.
 */
export function ModelViewer3D({ src, poster, alt, className, onLoadError, disableZoom, autoRotate = true, frameGotchi }: Props) {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let mounted = true;
    loadModelViewer().then(() => { if (mounted) setReady(true); }).catch(() => onLoadError?.());
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current as (HTMLElement & {
      cameraTarget?: string; cameraOrbit?: string; fieldOfView?: string; jumpCameraToGoal?: () => void;
    }) | null;
    if (!el || !frameGotchi) return;
    // Must be set as PROPERTIES after the model loads: attribute-time camera
    // values get re-resolved against each model's auto-framing (verified
    // empirically — the same "8m" attribute produced per-model scales), while
    // post-load properties + jumpCameraToGoal() stick exactly. Users can
    // still orbit/zoom from this initial view.
    // Framing is baked into composed models (invisible FrameAnchor bounds -
    // see server compose), so plain auto-framing is already consistent.
    // Camera-property overrides are deliberately NOT used: model-viewer
    // silently clamps absolute radii per model (verified 9m/10m/11m render
    // identically), which sank three fixed-camera attempts. Just start
    // straight-on.
    const applyFraming = () => {
      el.cameraOrbit = "0deg 88deg 105%";
      el.jumpCameraToGoal?.();
    };
    el.addEventListener("load", applyFraming);
    return () => el.removeEventListener("load", applyFraming);
  }, [ready, src, frameGotchi]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onLoadError) return;
    // model-viewer can emit multiple error events for one failed fetch; fire
    // the callback once per src. (Ladder parents must additionally ignore
    // stale callbacks that race a src swap — see Gotchi3D's stepDown.)
    let fired = false;
    const onError = () => {
      if (fired) return;
      fired = true;
      onLoadError();
    };
    el.addEventListener("error", onError);
    return () => el.removeEventListener("error", onError);
  }, [ready, src, onLoadError]);

  if (!ready) {
    return (
      <div className={`flex items-center justify-center ${className ?? ""}`}>
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <model-viewer
      // Fresh element per model: after a failed load, model-viewer does not
      // reliably recover when src is swapped in place (ladder fallbacks).
      key={src}
      ref={ref as React.RefObject<HTMLElement>}
      src={src}
      poster={poster}
      alt={alt}
      camera-controls=""
      {...(autoRotate ? { "auto-rotate": "" } : {})}
      rotation-per-second="30deg"
      shadow-intensity="1"
      interaction-prompt="none"
      touch-action="pan-y"
      {...(disableZoom ? { "disable-zoom": "" } : {})}
      // Size comes from the caller's classes — an inline 100% would override
      // fixed Tailwind sizes (h-16 w-16) and collapse inside unsized parents.
      class={`block ${className ?? "w-full h-full"}`}
      style={{ backgroundColor: "transparent" }}
    />
  );
}
