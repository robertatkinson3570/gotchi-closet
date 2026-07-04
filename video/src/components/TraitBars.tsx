import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TRAIT_LABELS, theme } from "../theme";
import type { TraitTuple } from "../types";

// Animated horizontal trait bars — richer than chips. Each bar fills from 0 to the trait's
// value; extreme traits (far from 50) glow gold. Staggered draw-in for a kinetic feel.
export const TraitBars: React.FC<{ traits: TraitTuple; delay?: number; width?: number }> = ({
  traits,
  delay = 0,
  width = 820,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: 18 }}>
      {traits.map((v, i) => {
        const p = spring({ frame: frame - delay - i * 5, fps, config: { damping: 200 }, durationInFrames: 40 });
        const extreme = Math.abs(v - 50) >= 40;
        const color = extreme ? theme.gold : theme.spectral;
        const pct = Math.max(0, Math.min(100, v));
        return (
          <div key={TRAIT_LABELS[i]} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <span style={{ width: 66, fontSize: 26, letterSpacing: 3, color: theme.muted, fontFamily: theme.fontMono }}>
              {TRAIT_LABELS[i]}
            </span>
            <div style={{ flex: 1, height: 22, borderRadius: 999, background: "hsl(265, 45%, 14%, 0.9)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pct * p}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${theme.spectral}, ${color})`,
                  boxShadow: `0 0 14px ${color}`,
                }}
              />
            </div>
            <span
              style={{
                width: 64,
                textAlign: "right",
                fontSize: 30,
                fontFamily: theme.fontMono,
                color: extreme ? theme.gold : theme.text,
              }}
            >
              {Math.round(v * p)}
            </span>
          </div>
        );
      })}
    </div>
  );
};
