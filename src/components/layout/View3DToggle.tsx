import { Button } from "@/ui/button";
import { useView3D } from "@/app/View3DProvider";

/** A real 3D cube (CSS transforms, zero deps): six faces on a preserve-3d
 *  body. Spins continuously while 3D mode is on, and on hover as a preview
 *  when off. Honors prefers-reduced-motion. */
function Cube3D({ spinning }: { spinning: boolean }) {
  const size = 16;
  const half = size / 2;
  const faces = [
    `rotateY(0deg) translateZ(${half}px)`,
    `rotateY(90deg) translateZ(${half}px)`,
    `rotateY(180deg) translateZ(${half}px)`,
    `rotateY(-90deg) translateZ(${half}px)`,
    `rotateX(90deg) translateZ(${half}px)`,
    `rotateX(-90deg) translateZ(${half}px)`,
  ];
  return (
    <span className="gc-cube-scene" style={{ width: size, height: size }} aria-hidden="true">
      <style>{`
        .gc-cube-scene { display: inline-block; perspective: 90px; }
        .gc-cube-body {
          position: relative; width: 100%; height: 100%;
          transform-style: preserve-3d;
          transform: rotateX(-22deg) rotateY(36deg);
        }
        .gc-cube-body.gc-spin, .gc-cube-scene:hover .gc-cube-body {
          animation: gc-cube-spin 5s linear infinite;
        }
        @keyframes gc-cube-spin {
          from { transform: rotateX(-22deg) rotateY(0deg); }
          to   { transform: rotateX(-22deg) rotateY(360deg); }
        }
        .gc-cube-face {
          position: absolute; inset: 0;
          border: 1.5px solid currentColor;
          border-radius: 2px;
          background: color-mix(in srgb, currentColor 18%, transparent);
        }
        @media (prefers-reduced-motion: reduce) {
          .gc-cube-body, .gc-cube-scene:hover .gc-cube-body { animation: none !important; }
        }
      `}</style>
      <span className={`gc-cube-body ${spinning ? "gc-spin" : ""}`}>
        {faces.map((t, i) => (
          <span key={i} className="gc-cube-face" style={{ transform: t }} />
        ))}
      </span>
    </span>
  );
}

/** Site-wide 3D/2D switch: gotchi renders swap to rotating 3D models where a
 *  model exists (everything else stays pixel art). Sits next to the theme
 *  toggle in the nav. */
export function View3DToggle() {
  const { enabled, toggle } = useView3D();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={enabled ? "3D mode on: gotchis render as 3D models where available" : "Switch to 3D gotchi rendering"}
      aria-label="Toggle 3D rendering"
      aria-pressed={enabled}
      className={enabled ? "text-primary bg-primary/10 hover:bg-primary/20" : undefined}
    >
      <Cube3D spinning={enabled} />
    </Button>
  );
}
