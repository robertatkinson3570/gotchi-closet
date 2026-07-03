import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { GradientText } from "./GradientText";
import { theme } from "../theme";

export const EndCard: React.FC<{ line?: string }> = ({
  line = "free. self-funded. community-built.",
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 48,
        opacity,
        background: "hsl(265, 60%, 4%, 0.72)",
      }}
    >
      <GradientText fontSize={110}>GotchiCloset</GradientText>
      <div style={{ fontSize: 34, color: theme.cyan, fontFamily: theme.fontMono }}>
        gotchicloset.com
      </div>
      <div style={{ ...theme.label, fontSize: 22 }}>{line}</div>
    </AbsoluteFill>
  );
};
