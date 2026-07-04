import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { theme } from "../theme";

// An animated area + line sparkline that draws left-to-right. Used behind PulseRecap stats
// to turn a lone number into "look, real on-chain data with a trend".
export const Sparkline: React.FC<{
  data: number[];
  width: number;
  height: number;
  color?: string;
  delay?: number;
  strokeWidth?: number;
}> = ({ data, width, height, color = theme.cyan, delay = 0, strokeWidth = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 55 });

  if (!data || data.length < 2) return null;

  const pad = strokeWidth + 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  // Smooth-ish path via quadratic midpoints.
  let line = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const mx = (px + cx) / 2;
    line += ` Q ${px} ${py} ${mx} ${(py + cy) / 2} T ${cx} ${cy}`;
  }
  const area = `${line} L ${pts[pts.length - 1][0]} ${height} L ${pts[0][0]} ${height} Z`;

  const gid = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  const lead = pts[Math.min(pts.length - 1, Math.max(0, Math.round(progress * (pts.length - 1))))];

  return (
    <div style={{ width, height, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, width: `${progress * 100}%`, overflow: "hidden" }}>
        <svg width={width} height={height} style={{ display: "block" }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.34} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 10px ${color})` }}
          />
        </svg>
      </div>
      {progress > 0.02 && progress < 0.999 && (
        <div
          style={{
            position: "absolute",
            left: lead[0] - 7,
            top: lead[1] - 7,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 16px ${color}`,
          }}
        />
      )}
    </div>
  );
};
