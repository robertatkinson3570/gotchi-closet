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
import { theme } from "../theme";
import type { FitRevealProps } from "../types";

const INTRO = 90;
const PER_STEP = 75;
const STINGER = 90;
const OUTRO = 130;

export function fitRevealDuration(steps: number, hasSet: boolean): number {
  return INTRO + steps * PER_STEP + (hasSet ? STINGER : 0) + OUTRO;
}

const Brs: React.FC<{ value: number }> = ({ value }) => (
  <div
    style={{
      fontSize: 66,
      color: theme.cyan,
      fontFamily: theme.fontMono,
      ...theme.glow(theme.cyan, 16),
    }}
  >
    BRS {value.toLocaleString("en-US")}
  </div>
);

export const FitReveal: React.FC<FitRevealProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stepIdx = Math.min(
    p.steps.length - 1,
    Math.max(-1, Math.floor((frame - INTRO) / PER_STEP)),
  );
  const active = frame < INTRO ? null : p.steps[stepIdx];
  const svg = active ? active.svg : p.nakedSvg;
  const brs = active ? active.brs : p.nakedBrs;
  const stingerAt = INTRO + p.steps.length * PER_STEP;
  const inStinger = p.setName && frame >= stingerAt && frame < stingerAt + STINGER;
  const pop = spring({
    frame: (frame - INTRO) % PER_STEP,
    fps,
    config: { damping: 12 },
  });
  return (
    <Scene>
      <Audio loop src={AUDIO.loop} volume={0.22} />
      {p.steps.map((_, i) => (
        <Sequence key={i} from={INTRO + i * PER_STEP} durationInFrames={10}>
          <Audio src={AUDIO.blip} volume={0.65} />
        </Sequence>
      ))}
      {p.setName ? (
        <Sequence from={stingerAt} durationInFrames={20}>
          <Audio src={AUDIO.chaching} volume={0.7} />
        </Sequence>
      ) : null}
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 50 }}>
        <div style={{ ...theme.label, marginTop: 48 }}>Fit Check</div>
        <GradientText fontSize={84} style={{ textAlign: "center" }}>
          {p.name || `Gotchi #${p.gotchiId}`}
        </GradientText>
        <GotchiSprite svg={svg} size={680} />
        <Brs value={brs} />
        {active && !inStinger ? (
          <div
            style={{
              ...theme.panel,
              padding: "24px 38px",
              transform: `scale(${pop})`,
              textAlign: "center",
            }}
          >
            <div style={{ ...theme.label, fontSize: 20, marginBottom: 12 }}>
              + {active.slotLabel}
            </div>
            <div style={{ fontSize: 34, color: theme.gold, fontFamily: theme.fontMono }}>
              {active.wearableName}
            </div>
          </div>
        ) : null}
        {inStinger ? (
          <div
            style={{
              ...theme.panel,
              border: "2px solid hsl(47, 100%, 64%, 0.6)",
              boxShadow: "0 0 36px hsl(47, 100%, 64%, 0.4)",
              padding: "30px 46px",
              textAlign: "center",
              transform: `scale(${spring({ frame: frame - stingerAt, fps, config: { damping: 10 } })})`,
            }}
          >
            <div
              style={{
                fontSize: 30,
                color: theme.gold,
                fontFamily: theme.fontMono,
                marginBottom: 14,
              }}
            >
              ✦ SET BONUS · {p.setName!.toUpperCase()} ✦
            </div>
            <div style={{ fontSize: 46, color: theme.cyan, fontFamily: theme.fontMono }}>
              FINAL BRS {p.finalBrs.toLocaleString("en-US")}
            </div>
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            bottom: 260,
            ...theme.label,
            fontSize: 20,
            opacity: interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          dressed with gotchicloset.com
        </div>
      </AbsoluteFill>
      <Sequence from={stingerAt + (p.setName ? STINGER : 0)}>
        <EndCard />
      </Sequence>
    </Scene>
  );
};
