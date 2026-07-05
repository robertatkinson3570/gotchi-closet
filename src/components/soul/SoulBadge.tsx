import { useMemo } from "react";
import { quickSoulDepth } from "@/lib/soul/quickDepth";

interface SoulBadgeProps {
  kinship?: number;
  level?: number;
  createdAt?: number;
  size?: "sm" | "md";
}

/** Colour palette per level — purple/cyan ghost theme. */
const LEVEL_COLORS: Record<string, { ring: string; text: string; bg: string }> = {
  Eternal:    { ring: "#c084fc", text: "#e879f9", bg: "rgba(192,132,252,0.15)" },
  Devoted:    { ring: "#818cf8", text: "#a5b4fc", bg: "rgba(129,140,248,0.15)" },
  Bonded:     { ring: "#22d3ee", text: "#67e8f9", bg: "rgba(34,211,238,0.15)"  },
  Warming:    { ring: "#34d399", text: "#6ee7b7", bg: "rgba(52,211,153,0.15)"  },
  Stirring:   { ring: "#94a3b8", text: "#cbd5e1", bg: "rgba(148,163,184,0.12)" },
  Flickering: { ring: "#64748b", text: "#94a3b8", bg: "rgba(100,116,139,0.10)" },
};

/**
 * SoulBadge — compact client-side soul indicator.
 *
 * Renders a conic-gradient depth ring + level name.  Uses only on-chain data
 * already present on the gotchi object; no network requests.
 *
 * The score shown is out of 60 max (kinshipXp + soulAge signals only).
 * Full depth (including consistency + memory) is available in the companion.
 */
export function SoulBadge({ kinship = 0, level = 0, createdAt, size = "sm" }: SoulBadgeProps) {
  const { score, level: soulLevel } = useMemo(
    () => quickSoulDepth(kinship, level, createdAt),
    [kinship, level, createdAt]
  );

  const colors = LEVEL_COLORS[soulLevel] ?? LEVEL_COLORS.Flickering;

  // Fill fraction out of 60 (the max possible with 2 signals).
  const fillFraction = Math.min(1, score / 60);
  const fillDeg = Math.round(fillFraction * 360);

  const ringSize  = size === "md" ? 22 : 16;
  const ringBorder = size === "md" ? 3 : 2;
  const innerSize = ringSize - ringBorder * 2;

  const tooltipText = `Soul: ${soulLevel} · ${Math.round(score)}/60 (on-chain read, open the companion for full depth)`;

  return (
    <span
      className="inline-flex items-center gap-1 select-none"
      title={tooltipText}
      aria-label={tooltipText}
    >
      {/* Depth ring — conic-gradient arc */}
      <span
        style={{
          display: "inline-block",
          width: ringSize,
          height: ringSize,
          borderRadius: "50%",
          background: `conic-gradient(${colors.ring} 0deg ${fillDeg}deg, rgba(255,255,255,0.08) ${fillDeg}deg 360deg)`,
          padding: ringBorder,
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            display: "block",
            width: innerSize,
            height: innerSize,
            borderRadius: "50%",
            background: colors.bg,
          }}
        />
      </span>

      {/* Level label */}
      <span
        style={{ color: colors.text, background: colors.bg }}
        className={`rounded px-1 font-semibold leading-none ${
          size === "md" ? "text-[11px] py-0.5" : "text-[9px] py-0.5"
        }`}
      >
        {soulLevel}
        {size === "md" && (
          <span className="ml-1 opacity-60 font-normal">{Math.round(score)}</span>
        )}
      </span>
    </span>
  );
}
