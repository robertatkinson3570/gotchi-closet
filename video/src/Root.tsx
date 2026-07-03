import React from "react";
import { Composition } from "remotion";
import fitRevealFixture from "../fixtures/fitReveal.json";
import spotlightFixture from "../fixtures/spotlight.json";
import { FitReveal, fitRevealDuration } from "./compositions/FitReveal";
import { SPOTLIGHT_DURATION, Spotlight } from "./compositions/Spotlight";
import { theme } from "./theme";
import type { FitRevealProps, SpotlightProps } from "./types";

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
    <Composition
      id="FitReveal"
      component={FitReveal}
      durationInFrames={600}
      {...size}
      defaultProps={fitRevealFixture as FitRevealProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: fitRevealDuration(props.steps.length, Boolean(props.setName)),
      })}
    />
  </>
);
