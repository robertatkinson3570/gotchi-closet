import React from "react";
import { AbsoluteFill, Composition } from "remotion";

const Hello: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "hsl(265, 60%, 4%)",
      color: "hsl(326, 100%, 68%)",
      justifyContent: "center",
      alignItems: "center",
      fontSize: 80,
      fontFamily: "sans-serif",
    }}
  >
    gotchi video engine
  </AbsoluteFill>
);

export const Root: React.FC = () => (
  <Composition
    id="Hello"
    component={Hello}
    durationInFrames={60}
    fps={30}
    width={1080}
    height={1920}
  />
);
