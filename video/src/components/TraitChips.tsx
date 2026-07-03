import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TRAIT_LABELS, theme } from "../theme";
import type { TraitTuple } from "../types";

export const TraitChips: React.FC<{ traits: TraitTuple; delay?: number }> = ({
  traits,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
      {traits.map((v, i) => {
        const p = spring({ frame: frame - delay - i * 6, fps, config: { damping: 14 } });
        const extreme = Math.abs(v - 50) >= 40;
        return (
          <div
            key={TRAIT_LABELS[i]}
            style={{
              ...theme.panel,
              padding: "20px 28px",
              transform: `scale(${p})`,
              ...(extreme
                ? {
                    border: "2px solid hsl(47, 100%, 64%, 0.7)",
                    boxShadow: "0 0 24px hsl(47, 100%, 64%, 0.35)",
                  }
                : null),
            }}
          >
            <span style={{ fontSize: 24, color: theme.muted, letterSpacing: 4 }}>
              {TRAIT_LABELS[i]}{" "}
            </span>
            <span
              style={{
                fontSize: 36,
                fontFamily: theme.fontMono,
                color: extreme ? theme.gold : theme.text,
              }}
            >
              {v}
            </span>
          </div>
        );
      })}
    </div>
  );
};
