import React from "react";
import { useCurrentFrame } from "remotion";
import { theme } from "../theme";

export const GradientText: React.FC<{
  children: React.ReactNode;
  fontSize: number;
  gradient?: string;
  shimmer?: boolean;
  fontFamily?: string;
  style?: React.CSSProperties;
}> = ({
  children,
  fontSize,
  gradient = theme.gradientSpectral,
  shimmer = true,
  fontFamily = theme.fontHeading,
  style,
}) => {
  const frame = useCurrentFrame();
  const pos = shimmer ? `${((frame * 1.2) % 200) - 100}% 0%` : "0% 0%";
  return (
    <div
      style={{
        fontSize,
        fontFamily,
        backgroundImage: gradient,
        backgroundSize: "200% 100%",
        backgroundPosition: pos,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        filter: "drop-shadow(0 0 22px hsl(275, 100%, 70%, 0.45))",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
