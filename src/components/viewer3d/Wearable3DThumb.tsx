import { useState } from "react";
import { useView3D } from "@/app/View3DProvider";
import { ModelViewer3D } from "./ModelViewer3D";
import { hasWearable3D, wearable3dGlbUrl } from "@/lib/gotchi3d";

type Props = {
  wearableId: number | string;
  /** The 2D icon, shown when 3D is off, the id has no model, or it fails. */
  fallback: React.ReactNode;
  className?: string;
  alt?: string;
  /** Default false: thumbnails are display-only so clicks/drags on the card
   *  keep working. Set true on inspect surfaces (modals). */
  interactive?: boolean;
  /** Spin continuously (modals); thumbnails stay still. */
  autoRotate?: boolean;
};

/** Drop-in 3D thumbnail for any wearable icon site, honoring the site-wide
 *  3D toggle with a silent 2D fallback. */
export function Wearable3DThumb({ wearableId, fallback, className, alt, interactive = false, autoRotate = false }: Props) {
  const { enabled } = useView3D();
  const [failed, setFailed] = useState(false);
  if (!enabled || failed || !hasWearable3D(wearableId)) return <>{fallback}</>;
  const viewer = (
    <ModelViewer3D
      src={wearable3dGlbUrl(wearableId)}
      alt={alt ?? `Wearable #${wearableId} in 3D`}
      className={interactive ? className : "w-full h-full"}
      onLoadError={() => setFailed(true)}
      disableZoom={!interactive}
      autoRotate={autoRotate}
    />
  );
  if (interactive) return viewer;
  return <div className={`pointer-events-none ${className ?? "w-full h-full"}`}>{viewer}</div>;
}
