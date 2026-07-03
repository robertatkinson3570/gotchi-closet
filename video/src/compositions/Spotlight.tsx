import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
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
import type { SpotlightProps } from "../types";

export const SPOTLIGHT_DURATION = 24 * 30; // 24s

export const Spotlight: React.FC<SpotlightProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 10, fps, config: { damping: 12 } });
  const flavorChars = Math.floor(Math.max(0, frame - 330) * 0.8);
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      <Sequence from={20} durationInFrames={10}>
        <Audio src={AUDIO.blip} volume={0.6} />
      </Sequence>
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 44 }}>
        <div style={{ ...theme.label, marginTop: 48 }}>Gotchi Spotlight</div>
        <div style={{ opacity: interpolate(frame, [5, 25], [0, 1], { extrapolateRight: "clamp" }) }}>
          <GradientText fontSize={96} style={{ textAlign: "center" }}>
            {p.name || `Gotchi #${p.gotchiId}`}
          </GradientText>
        </div>
        <div style={{ transform: `scale(${enter})` }}>
          <GotchiSprite svg={p.svg} size={640} />
        </div>
        <Sequence from={90} layout="none">
          <TraitChips traits={p.traits} />
        </Sequence>
        <Sequence from={180} layout="none">
          <div style={{ display: "flex", gap: 60, marginTop: 20 }}>
            <StatCounter label="BRS" value={p.brs} color={theme.cyan} fontSize={72} />
            <StatCounter label="Kinship" value={p.kinship} delay={15} color={theme.pink} fontSize={72} />
            <StatCounter label="Level" value={p.level} delay={30} color={theme.gold} fontSize={72} />
            <StatCounter label="Age · days" value={p.ageDays} delay={45} color={theme.ecto} fontSize={72} />
          </div>
        </Sequence>
        {p.setName ? (
          <Sequence from={270} layout="none">
            <div
              style={{
                ...theme.panel,
                padding: "22px 36px",
                fontSize: 30,
                color: theme.gold,
                fontFamily: theme.fontMono,
                border: "2px solid hsl(47, 100%, 64%, 0.5)",
                boxShadow: "0 0 24px hsl(47, 100%, 64%, 0.3)",
              }}
            >
              SET · {p.setName.toUpperCase()}
            </div>
          </Sequence>
        ) : null}
        <Sequence from={330} layout="none">
          <div
            style={{
              fontSize: 32,
              color: theme.cyan,
              fontFamily: theme.fontMono,
              textAlign: "center",
              lineHeight: 1.8,
              maxWidth: 880,
            }}
          >
            {p.flavor.slice(0, flavorChars)}
          </div>
        </Sequence>
        <div style={{ position: "absolute", bottom: 260, ...theme.label, fontSize: 20 }}>
          owner {p.ownerShort}
        </div>
      </AbsoluteFill>
      <Sequence from={SPOTLIGHT_DURATION - 130}>
        <EndCard />
      </Sequence>
    </Scene>
  );
};
