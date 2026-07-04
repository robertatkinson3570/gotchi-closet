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
import type { SpotlightProps } from "../types";

export const SPOTLIGHT_DURATION = 24 * 30; // 24s

/** Soft glowing pedestal + slow rotating ring behind the sprite. */
const GlowPedestal: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <div
        style={{
          position: "absolute",
          width: 720,
          height: 720,
          borderRadius: "50%",
          background: "radial-gradient(circle, hsl(275 100% 70% / 0.28) 0%, transparent 62%)",
          transform: `scale(${1 + Math.sin(frame / 22) * 0.04})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 640,
          height: 640,
          borderRadius: "50%",
          border: "2px solid hsl(175 100% 60% / 0.25)",
          transform: `rotate(${frame * 0.4}deg)`,
        }}
      />
    </>
  );
};

export const Spotlight: React.FC<SpotlightProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 10, fps, config: { damping: 12 } });
  const flavorChars = Math.floor(Math.max(0, frame - 360) * 0.8);
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      <Sequence from={16} durationInFrames={10}>
        <Audio src={AUDIO.blip} volume={0.6} />
      </Sequence>
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 34 }}>
        <div style={{ ...theme.label, marginTop: 40, color: theme.cyan, ...theme.glow(theme.cyan, 8) }}>
          Gotchi Spotlight
        </div>
        <div style={{ opacity: interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" }) }}>
          <GradientText fontSize={92} style={{ textAlign: "center" }}>
            {p.name || `Gotchi #${p.gotchiId}`}
          </GradientText>
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: 560 }}>
          <GlowPedestal />
          <div style={{ transform: `scale(${enter})` }}>
            <GotchiSprite svg={p.svg} size={520} />
          </div>
        </div>
        <Sequence from={70} layout="none">
          <TraitBars traits={p.traits} width={840} />
        </Sequence>
        <Sequence from={185} layout="none">
          <div style={{ display: "flex", gap: 56, marginTop: 8 }}>
            <StatCounter label="BRS" value={p.brs} color={theme.cyan} fontSize={66} />
            <StatCounter label="Kinship" value={p.kinship} delay={12} color={theme.pink} fontSize={66} />
            <StatCounter label="Level" value={p.level} delay={24} color={theme.gold} fontSize={66} />
            <StatCounter label="Age · d" value={p.ageDays} delay={36} color={theme.ecto} fontSize={66} />
          </div>
        </Sequence>
        {p.setName ? (
          <Sequence from={290} layout="none">
            <div
              style={{
                ...theme.panel,
                padding: "18px 32px",
                fontSize: 30,
                color: theme.gold,
                fontFamily: theme.fontMono,
                border: "2px solid hsl(47, 100%, 64%, 0.5)",
                boxShadow: "0 0 24px hsl(47, 100%, 64%, 0.3)",
              }}
            >
              ✦ SET · {p.setName.toUpperCase()}
            </div>
          </Sequence>
        ) : null}
        <Sequence from={360} layout="none">
          <div
            style={{
              fontSize: 32,
              color: theme.cyan,
              fontFamily: theme.fontMono,
              textAlign: "center",
              lineHeight: 1.7,
              maxWidth: 880,
              minHeight: 60,
            }}
          >
            {p.flavor.slice(0, flavorChars)}
          </div>
        </Sequence>
      </AbsoluteFill>
      <Sequence from={SPOTLIGHT_DURATION - 130}>
        <EndCard />
      </Sequence>
    </Scene>
  );
};
