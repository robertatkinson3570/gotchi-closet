import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from "remotion";
import { AUDIO } from "../audio";
import { EndCard } from "../components/EndCard";
import { GradientText } from "../components/GradientText";
import { GotchiSprite } from "../components/GotchiSprite";
import { Scene } from "../components/Scene";
import { StatCounter } from "../components/StatCounter";
import { theme } from "../theme";
import type { PulseRecapProps } from "../types";

const INTRO = 120;
const PER_STAT = 90;
const PER_CAMEO = 90;
const VERDICT = 100;
const OUTRO = 130;

export function pulseRecapDuration(stats: number, cameos: number): number {
  return INTRO + stats * PER_STAT + cameos * PER_CAMEO + VERDICT + OUTRO;
}

const Wow: React.FC<{ wow: number | null }> = ({ wow }) => {
  if (wow === null) return null;
  const up = wow >= 0;
  const color = up ? theme.ecto : theme.red;
  return (
    <div
      style={{
        fontSize: 34,
        color,
        fontFamily: theme.fontMono,
        marginTop: 26,
        ...theme.glow(color, 12),
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(wow).toFixed(0)}% vs last week
    </div>
  );
};

export const PulseRecap: React.FC<PulseRecapProps> = (p) => {
  const frame = useCurrentFrame();
  const cameosAt = INTRO + p.stats.length * PER_STAT;
  const verdictAt = cameosAt + p.cameos.length * PER_CAMEO;
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      {p.stats.map((_, i) => (
        <Sequence key={`t${i}`} from={INTRO + i * PER_STAT} durationInFrames={8}>
          <Audio src={AUDIO.tick} volume={0.5} />
        </Sequence>
      ))}
      <Sequence durationInFrames={INTRO}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 44 }}>
          <GradientText fontSize={92} style={{ textAlign: "center", lineHeight: 1.3 }}>
            Aavegotchi
          </GradientText>
          <GradientText fontSize={92} style={{ textAlign: "center" }}>
            Weekly Pulse
          </GradientText>
          <div style={{ fontSize: 32, color: theme.text, fontFamily: theme.fontMono }}>
            {p.weekLabel}
          </div>
          <div
            style={{
              fontSize: 90,
              color: theme.pink,
              opacity: interpolate(frame % 30, [0, 15, 30], [1, 0.4, 1]),
              ...theme.glow(theme.pink, 26),
            }}
          >
            ♥
          </div>
        </AbsoluteFill>
      </Sequence>
      {p.stats.map((s, i) => (
        <Sequence key={s.label} from={INTRO + i * PER_STAT} durationInFrames={PER_STAT}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
            <StatCounter label={s.label} value={s.value} suffix={s.unit} fontSize={104} />
            <Wow wow={s.wow} />
          </AbsoluteFill>
        </Sequence>
      ))}
      {p.cameos.map((c, i) => (
        <Sequence key={c.name + i} from={cameosAt + i * PER_CAMEO} durationInFrames={PER_CAMEO}>
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 40 }}>
            <div style={theme.label}>Star of the Week</div>
            <GotchiSprite svg={c.svg} size={520} />
            <GradientText fontSize={64}>{c.name}</GradientText>
            <div style={{ fontSize: 30, color: theme.gold, fontFamily: theme.fontMono }}>
              {c.caption}
            </div>
          </AbsoluteFill>
        </Sequence>
      ))}
      <Sequence from={verdictAt} durationInFrames={VERDICT}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 48 }}>
          <div style={theme.label}>Protocol Health</div>
          <div style={{ display: "flex", gap: 70, fontFamily: theme.fontMono }}>
            <div style={{ fontSize: 64, color: theme.ecto, ...theme.glow(theme.ecto, 16) }}>
              {p.greens} ●
            </div>
            <div style={{ fontSize: 64, color: theme.red, ...theme.glow(theme.red, 16) }}>
              {p.reds} ●
            </div>
          </div>
          <div style={{ fontSize: 26, color: theme.muted, fontFamily: theme.fontMono }}>
            full breakdown → gotchicloset.com/pulse
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={verdictAt + VERDICT}>
        <EndCard line="the weekly pulse, every week, automated" />
      </Sequence>
    </Scene>
  );
};
