import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";

const Blob: React.FC<{
  color: string;
  x: number;
  y: number;
  size: number;
  speed: number;
  phase?: number;
}> = ({ color, x, y, size, speed, phase = 0 }) => {
  const frame = useCurrentFrame();
  const dx = Math.sin(frame / speed + phase) * 60;
  const dy = Math.cos(frame / (speed * 1.3) + phase) * 80;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        opacity: 0.32,
        filter: "blur(130px)",
        transform: `translate(${dx}px, ${dy}px)`,
      }}
    />
  );
};

export const Scene: React.FC<React.PropsWithChildren> = ({ children }) => (
  <AbsoluteFill style={{ background: theme.bg, fontFamily: theme.fontSans, color: theme.text }}>
    <Blob color={theme.spectral} x={-200} y={-100} size={900} speed={55} />
    <Blob color={theme.pink} x={480} y={1250} size={850} speed={70} phase={2} />
    <Blob color={theme.cyan} x={300} y={520} size={520} speed={90} phase={4} />
    {children}
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse 90% 70% at 50% 45%, transparent 55%, hsl(265, 60%, 4%, 0.9) 100%)",
      }}
    />
  </AbsoluteFill>
);
