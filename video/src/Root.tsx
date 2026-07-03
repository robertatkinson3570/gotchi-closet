import React from "react";
import { Composition } from "remotion";
import spotlightFixture from "../fixtures/spotlight.json";
import { SPOTLIGHT_DURATION, Spotlight } from "./compositions/Spotlight";
import { theme } from "./theme";
import type { SpotlightProps } from "./types";

const size = { fps: theme.fps, width: theme.width, height: theme.height } as const;

export const Root: React.FC = () => (
  <>
    <Composition
      id="Spotlight"
      component={Spotlight}
      durationInFrames={SPOTLIGHT_DURATION}
      {...size}
      defaultProps={spotlightFixture as SpotlightProps}
    />
  </>
);
