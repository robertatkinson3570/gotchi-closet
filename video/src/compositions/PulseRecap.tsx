import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AUDIO } from "../audio";
import { EndCard } from "../components/EndCard";
import { GradientText } from "../components/GradientText";
import { GotchiSprite } from "../components/GotchiSprite";
import { Scene } from "../components/Scene";
import { Sparkline } from "../components/Sparkline";
import { StatCounter } from "../components/StatCounter";
import { theme } from "../theme";
import type { PulseRecapProps, PulseStat } from "../types";

const INTRO = 110;
const PER_STAT = 96;
const PER_CAMEO = 96;
const VERDICT = 96;
const OUTRO = 120;

export function pulseRecapDuration(stats: number, cameos: number): number {
  return INTRO + stats * PER_STAT + cameos * PER_CAMEO + VERDICT + OUTRO;
}

const STAT_COLORS = [theme.cyan, theme.pink, theme.gold, theme.ecto, theme.spectral];

/** Wraps a scene with a springy slide-up entrance and a clean fade-out at the end. */
const SceneWrap: React.FC<React.PropsWithChildren<{ dur: number }>> = ({ dur, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.7 } });
  const y = interpolate(enter, [0, 1], [70, 0]);
  const exit = interpolate(frame, [dur - 14, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", opacity: Math.min(enter, exit), transform: `translateY(${y}px)` }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Wow: React.FC<{ wow: number | null }> = ({ wow }) => {
  if (wow === null) return null;
  const up = wow >= 0;
  const color = up ? theme.ecto : theme.red;
  return (
    <div
      style={{
        marginTop: 22,
        fontSize: 34,
        fontFamily: theme.fontMono,
        color,
        border: `2px solid ${color}`,
        borderRadius: 999,
        padding: "8px 22px",
        ...theme.glow(color, 10),
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(wow).toFixed(0)}% vs last week
    </div>
  );
};

const StatScene: React.FC<{ stat: PulseStat; color: string }> = ({ stat, color }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 940 }}>
    <div style={{ ...theme.label, marginBottom: 26 }}>{stat.label}</div>
    <StatCounter label="" value={stat.value} suffix={stat.unit} color={color} fontSize={132} />
    <Wow wow={stat.wow} />
    {stat.spark && stat.spark.length > 1 && (
      <div style={{ marginTop: 54 }}>
        <Sparkline data={stat.spark} width={860} height={230} color={color} delay={12} />
      </div>
    )}
  </div>
);

export const PulseRecap: React.FC<PulseRecapProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cameosAt = INTRO + p.stats.length * PER_STAT;
  const verdictAt = cameosAt + p.cameos.length * PER_CAMEO;

  const titleIn = spring({ frame: frame - 6, fps, config: { damping: 16 } });

  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      {p.stats.map((_, i) => (
        <Sequence key={`t${i}`} from={INTRO + i * PER_STAT} durationInFrames={8}>
          <Audio src={AUDIO.tick} volume={0.55} />
        </Sequence>
      ))}

      {/* Intro */}
      <Sequence durationInFrames={INTRO}>
        <SceneWrap dur={INTRO}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, transform: `scale(${interpolate(titleIn, [0, 1], [0.86, 1])})` }}>
            <div style={{ ...theme.label, color: theme.cyan, ...theme.glow(theme.cyan, 8) }}>This week on Base</div>
            <GradientText fontSize={104} style={{ textAlign: "center", lineHeight: 1.25 }}>Aavegotchi</GradientText>
            <GradientText fontSize={104} style={{ textAlign: "center" }}>Weekly Pulse</GradientText>
            <div style={{ marginTop: 10, fontSize: 34, color: theme.text, fontFamily: theme.fontMono, opacity: interpolate(frame, [22, 40], [0, 1], { extrapolateRight: "clamp" }) }}>
              {p.weekLabel}
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 300, fontSize: 84, color: theme.pink, opacity: interpolate(frame % 26, [0, 13, 26], [1, 0.35, 1]), ...theme.glow(theme.pink, 24) }}>♥</div>
        </SceneWrap>
      </Sequence>

      {/* Stat scenes with sparklines */}
      {p.stats.map((s, i) => (
        <Sequence key={s.label} from={INTRO + i * PER_STAT} durationInFrames={PER_STAT}>
          <SceneWrap dur={PER_STAT}>
            <StatScene stat={s} color={s.color || STAT_COLORS[i % STAT_COLORS.length]} />
          </SceneWrap>
        </Sequence>
      ))}

      {/* Star of the week */}
      {p.cameos.map((c, i) => (
        <Sequence key={c.name + i} from={cameosAt + i * PER_CAMEO} durationInFrames={PER_CAMEO}>
          <SceneWrap dur={PER_CAMEO}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
              <div style={{ ...theme.label, color: theme.gold, ...theme.glow(theme.gold, 8) }}>★ Star of the Week</div>
              <GotchiSprite svg={c.svg} size={560} />
              <GradientText fontSize={72}>{c.name}</GradientText>
              <div style={{ ...theme.panel, padding: "16px 30px", fontSize: 32, color: theme.gold, fontFamily: theme.fontMono, border: "2px solid hsl(47, 100%, 64%, 0.5)" }}>
                {c.caption}
              </div>
            </div>
          </SceneWrap>
        </Sequence>
      ))}

      {/* Protocol health */}
      <Sequence from={verdictAt} durationInFrames={VERDICT}>
        <SceneWrap dur={VERDICT}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 46 }}>
            <div style={theme.label}>Protocol Health</div>
            <div style={{ display: "flex", gap: 40 }}>
              <div style={{ ...theme.panel, padding: "28px 44px", textAlign: "center", border: `2px solid ${theme.ecto}`, boxShadow: `0 0 30px ${theme.ecto}55` }}>
                <div style={{ fontSize: 96, color: theme.ecto, fontFamily: theme.fontMono, ...theme.glow(theme.ecto, 14) }}>{p.greens}</div>
                <div style={{ ...theme.label, fontSize: 20, marginTop: 6 }}>healthy</div>
              </div>
              <div style={{ ...theme.panel, padding: "28px 44px", textAlign: "center", border: `2px solid ${theme.red}`, boxShadow: `0 0 30px ${theme.red}55` }}>
                <div style={{ fontSize: 96, color: theme.red, fontFamily: theme.fontMono, ...theme.glow(theme.red, 14) }}>{p.reds}</div>
                <div style={{ ...theme.label, fontSize: 20, marginTop: 6 }}>softening</div>
              </div>
            </div>
            <div style={{ fontSize: 26, color: theme.muted, fontFamily: theme.fontMono }}>full breakdown → gotchicloset.com/pulse</div>
          </div>
        </SceneWrap>
      </Sequence>

      <Sequence from={verdictAt + VERDICT}>
        <EndCard line="the weekly pulse, every week, automated" />
      </Sequence>
    </Scene>
  );
};
