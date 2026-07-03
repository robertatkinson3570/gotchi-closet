import React from "react";
import { Composition } from "remotion";
import fitRevealFixture from "../fixtures/fitReveal.json";
import pulseRecapFixture from "../fixtures/pulseRecap.json";
import saleAlertFixture from "../fixtures/saleAlert.json";
import spotlightFixture from "../fixtures/spotlight.json";
import { FitReveal, fitRevealDuration } from "./compositions/FitReveal";
import { PulseRecap, pulseRecapDuration } from "./compositions/PulseRecap";
import { SALE_ALERT_DURATION, SaleAlert } from "./compositions/SaleAlert";
import { SPOTLIGHT_DURATION, Spotlight } from "./compositions/Spotlight";
import { theme } from "./theme";
import type {
  FitRevealProps,
  PulseRecapProps,
  SaleAlertProps,
  SpotlightProps,
} from "./types";

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
    <Composition
      id="SaleAlert"
      component={SaleAlert}
      durationInFrames={SALE_ALERT_DURATION}
      {...size}
      defaultProps={saleAlertFixture as SaleAlertProps}
    />
    <Composition
      id="PulseRecap"
      component={PulseRecap}
      durationInFrames={900}
      {...size}
      defaultProps={pulseRecapFixture as PulseRecapProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: pulseRecapDuration(props.stats.length, props.cameos.length),
      })}
    />
  </>
);
