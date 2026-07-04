import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
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

/** A BRS gauge that fills from naked -> final as wearables go on. */
const BrsGauge: React.FC<{ brs: number; naked: number; final: number }> = ({ brs, naked, final }) => {
  const range = Math.max(1, final - naked);
  const pct = Math.max(0, Math.min(1, (brs - naked) / range));
  return (
    <div style={{ width: 720, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: theme.muted, fontFamily: theme.fontMono }}>
        <span>naked {naked.toLocaleString("en-US")}</span>
        <span>{final.toLocaleString("en-US")} max</span>
      </div>
      <div style={{ height: 24, borderRadius: 999, background: "hsl(265, 45%, 14%, 0.9)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.spectral}, ${theme.cyan})`,
            boxShadow: `0 0 16px ${theme.cyan}`,
          }}
        />
      </div>
    </div>
  );
};

export const FitReveal: React.FC<FitRevealProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stepIdx = Math.min(p.steps.length - 1, Math.max(-1, Math.floor((frame - INTRO) / PER_STEP)));
  const active = frame < INTRO ? null : p.steps[stepIdx];
  const svg = active ? active.svg : p.nakedSvg;
  const brs = active ? active.brs : p.nakedBrs;
  const stingerAt = INTRO + p.steps.length * PER_STEP;
  const inStinger = p.setName && frame >= stingerAt && frame < stingerAt + STINGER;
  const pop = spring({ frame: (frame - INTRO) % PER_STEP, fps, config: { damping: 12 } });

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
      <AbsoluteFill style={{ alignItems: "center", padding: 70, gap: 40 }}>
        <div style={{ ...theme.label, marginTop: 40, color: theme.cyan, ...theme.glow(theme.cyan, 8) }}>Fit Check</div>
        <GradientText fontSize={80} style={{ textAlign: "center" }}>
          {p.name || `Gotchi #${p.gotchiId}`}
        </GradientText>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: 620 }}>
          <div
            style={{
              position: "absolute",
              width: 660,
              height: 660,
              borderRadius: "50%",
              background: "radial-gradient(circle, hsl(275 100% 70% / 0.22) 0%, transparent 62%)",
            }}
          />
          <GotchiSprite svg={svg} size={620} />
        </div>
        <div style={{ fontSize: 60, color: theme.cyan, fontFamily: theme.fontMono, ...theme.glow(theme.cyan, 14) }}>
          BRS {brs.toLocaleString("en-US")}
        </div>
        <BrsGauge brs={brs} naked={p.nakedBrs} final={p.finalBrs} />
        {active && !inStinger ? (
          <div style={{ ...theme.panel, padding: "20px 34px", transform: `scale(${pop})`, textAlign: "center" }}>
            <div style={{ ...theme.label, fontSize: 20, marginBottom: 10 }}>+ {active.slotLabel}</div>
            <div style={{ fontSize: 34, color: theme.gold, fontFamily: theme.fontMono }}>{active.wearableName}</div>
          </div>
        ) : null}
        {inStinger ? (
          <div
            style={{
              ...theme.panel,
              border: "2px solid hsl(47, 100%, 64%, 0.6)",
              boxShadow: "0 0 36px hsl(47, 100%, 64%, 0.4)",
              padding: "28px 44px",
              textAlign: "center",
              transform: `scale(${spring({ frame: frame - stingerAt, fps, config: { damping: 10 } })})`,
            }}
          >
            <div style={{ fontSize: 30, color: theme.gold, fontFamily: theme.fontMono, marginBottom: 12 }}>
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
            bottom: 250,
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
