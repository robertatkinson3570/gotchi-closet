import React from "react";
import { useCurrentFrame } from "remotion";

// Renders a raw gotchi SVG string. Forces the svg to fill its box; gotchi
// SVGs ship a viewBox, so width/height attributes are safe to inject.
// Pixel-art crispness + the site's color-matched spectral glow.
export const GotchiSprite: React.FC<{
  svg: string;
  size: number;
  float?: boolean;
  style?: React.CSSProperties;
}> = ({ svg, size, float = true, style }) => {
  const frame = useCurrentFrame();
  const dy = float ? Math.sin(frame / 14) * 12 : 0;
  const html = svg.replace(/<svg /, '<svg width="100%" height="100%" ');
  return (
    <div
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        transform: `translateY(${dy}px)`,
        filter:
          "drop-shadow(0 0 28px hsl(275, 100%, 70%, 0.55)) drop-shadow(0 0 90px hsl(326, 100%, 68%, 0.3))",
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
