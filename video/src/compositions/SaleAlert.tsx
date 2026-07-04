import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AUDIO } from "../audio";
import { EndCard } from "../components/EndCard";
import { GradientText } from "../components/GradientText";
import { GotchiSprite } from "../components/GotchiSprite";
import { Scene } from "../components/Scene";
import { StatCounter } from "../components/StatCounter";
import { TraitBars } from "../components/TraitBars";
import { theme } from "../theme";
import type { SaleAlertProps } from "../types";

export const SALE_ALERT_DURATION = 450;

/** Expanding shockwave ring behind the SOLD stamp when it lands. */
const Burst: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (t <= 0 || t >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        width: 360,
        height: 360,
        borderRadius: "50%",
        border: `6px solid ${theme.pink}`,
        opacity: (1 - t) * 0.8,
        transform: `scale(${0.4 + t * 2.2})`,
      }}
    />
  );
};

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
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 40 }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 60, height: 150 }}>
          <Burst at={10} />
          <div
            style={{
              fontSize: 82,
              fontFamily: theme.fontHeading,
              color: theme.pink,
              border: `4px solid hsl(326, 100%, 68%, 0.85)`,
              borderRadius: 20,
              padding: "16px 46px",
              transform: `scale(${stamp}) rotate(-6deg)`,
              boxShadow: "0 0 48px hsl(326, 100%, 68%, 0.55)",
              ...theme.glow(theme.pink, 22),
            }}
          >
            SOLD
          </div>
        </div>
        <GotchiSprite svg={p.svg} size={480} />
        <GradientText fontSize={64} style={{ textAlign: "center" }}>
          {p.name || `Gotchi #${p.gotchiId}`}
        </GradientText>
        <Sequence from={70} layout="none">
          <StatCounter label="Price" value={p.priceGhst} suffix=" GHST" color={theme.gold} fontSize={104} />
          {p.priceUsd ? (
            <div style={{ fontSize: 30, color: theme.muted, fontFamily: theme.fontMono, textAlign: "center" }}>
              ≈ ${p.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
          ) : null}
        </Sequence>
        <Sequence from={150} layout="none">
          <TraitBars traits={p.traits} width={760} delay={0} />
        </Sequence>
        <Sequence from={230} layout="none">
          <div style={{ fontSize: 26, color: theme.muted, fontFamily: theme.fontMono, textAlign: "center", lineHeight: 1.9 }}>
            BRS {p.brs} · {p.whenText}
            <br />
            {p.sellerShort} <span style={{ color: theme.pink }}>→</span> {p.buyerShort}
          </div>
        </Sequence>
      </AbsoluteFill>
      <Sequence from={SALE_ALERT_DURATION - 110}>
        <EndCard line="every big sale, on the baazaar pulse" />
      </Sequence>
    </Scene>
  );
};
