import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

export const StatCounter: React.FC<{
  label: string;
  value: number;
  delay?: number;
  color?: string;
  suffix?: string;
  decimals?: number;
  fontSize?: number;
}> = ({ label, value, delay = 0, color = theme.cyan, suffix = "", decimals = 0, fontSize = 84 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 45 });
  const shown = (value * p).toFixed(decimals);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...theme.label, marginBottom: 18 }}>{label}</div>
      <div style={{ fontSize, color, fontFamily: theme.fontMono, fontWeight: 500, ...theme.glow(color, 16) }}>
        {Number(shown).toLocaleString("en-US", { maximumFractionDigits: decimals })}
        {suffix}
      </div>
    </div>
  );
};
