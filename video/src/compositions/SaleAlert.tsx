import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AUDIO } from "../audio";
import { EndCard } from "../components/EndCard";
import { GradientText } from "../components/GradientText";
import { GotchiSprite } from "../components/GotchiSprite";
import { Scene } from "../components/Scene";
import { StatCounter } from "../components/StatCounter";
import { TraitChips } from "../components/TraitChips";
import { theme } from "../theme";
import type { SaleAlertProps } from "../types";

export const SALE_ALERT_DURATION = 450;

export const SaleAlert: React.FC<SaleAlertProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stamp = spring({ frame: frame - 8, fps, config: { damping: 9 } });
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      <Sequence from={70} durationInFrames={25}>
        <Audio src={AUDIO.chaching} volume={0.75} />
      </Sequence>
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 46 }}>
        <div
          style={{
            marginTop: 60,
            fontSize: 78,
            fontFamily: theme.fontHeading,
            color: theme.pink,
            border: "4px solid hsl(326, 100%, 68%, 0.8)",
            borderRadius: 20,
            padding: "18px 44px",
            transform: `scale(${stamp}) rotate(-6deg)`,
            boxShadow: "0 0 48px hsl(326, 100%, 68%, 0.5)",
            ...theme.glow(theme.pink, 20),
          }}
        >
          SOLD
        </div>
        <GotchiSprite svg={p.svg} size={560} />
        <GradientText fontSize={72} style={{ textAlign: "center" }}>
          {p.name || `Gotchi #${p.gotchiId}`}
        </GradientText>
        <Sequence from={70} layout="none">
          <StatCounter label="Price" value={p.priceGhst} suffix=" GHST" color={theme.gold} fontSize={96} />
          {p.priceUsd ? (
            <div
              style={{
                fontSize: 30,
                color: theme.muted,
                fontFamily: theme.fontMono,
                textAlign: "center",
              }}
            >
              ≈ ${p.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          ) : null}
        </Sequence>
        <Sequence from={150} layout="none">
          <TraitChips traits={p.traits} />
        </Sequence>
        <Sequence from={210} layout="none">
          <div
            style={{
              fontSize: 26,
              color: theme.muted,
              fontFamily: theme.fontMono,
              textAlign: "center",
              lineHeight: 2,
            }}
          >
            BRS {p.brs} · {p.whenText}
            <br />
            {p.sellerShort} → {p.buyerShort}
          </div>
        </Sequence>
      </AbsoluteFill>
      <Sequence from={SALE_ALERT_DURATION - 110}>
        <EndCard line="every big sale, on the baazaar pulse" />
      </Sequence>
    </Scene>
  );
};
