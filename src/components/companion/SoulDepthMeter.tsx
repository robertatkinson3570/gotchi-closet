import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getSoulDepth, type SoulDepthData } from "@/lib/companion/soulApi";
import { SoulCertificate } from "@/components/soul/SoulCertificate";

// ---------------------------------------------------------------------------
// Level → accent colour
// ---------------------------------------------------------------------------

const LEVEL_COLOURS: Record<string, string> = {
  Flickering: "#6b7280", // gray
  Stirring:   "#8b5cf6", // violet
  Warming:    "#a855f7", // purple
  Bonded:     "#c026d3", // fuchsia
  Devoted:    "#e879f9", // pink-fuchsia
  Eternal:    "#f0abfc", // pale fuchsia / near-white
};

function levelColour(level: string): string {
  return LEVEL_COLOURS[level] ?? "#8b5cf6";
}

// ---------------------------------------------------------------------------
// Sub-bar component
// ---------------------------------------------------------------------------

interface SubBarProps {
  label: string;
  value: number;
  max: number;
  colour: string;
  delay: number;
}

function SubBar({ label, value, max, colour, delay }: SubBarProps) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-right text-[10px] text-white/50">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: colour }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay, ease: "easeOut" }}
        />
      </div>
      <span className="w-6 text-left text-[10px] tabular-nums text-white/40">
        {Math.round(value)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main meter
// ---------------------------------------------------------------------------

interface SoulDepthMeterProps {
  tokenId: string | null;
}

export function SoulDepthMeter({ tokenId }: SoulDepthMeterProps) {
  const [data, setData] = useState<SoulDepthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [certOpen, setCertOpen] = useState(false);

  useEffect(() => {
    if (!tokenId) { setData(null); return; }
    setLoading(true);
    setData(null);
    getSoulDepth(tokenId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [tokenId]);

  if (!tokenId) return null;

  if (loading) {
    return (
      <div className="mt-2 animate-pulse rounded-xl border border-white/10 bg-white/5 px-3 py-2">
        <div className="h-3 w-24 rounded bg-white/10" />
      </div>
    );
  }

  if (!data) return null;

  const colour = levelColour(data.level);
  const scorePct = Math.min(100, data.depth);

  return (
    <>
      {certOpen && tokenId && (
        <SoulCertificate tokenId={tokenId} onClose={() => setCertOpen(false)} />
      )}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur"
      >
      {/* Header row — clicking opens the certificate */}
      <button
        type="button"
        onClick={() => setCertOpen(true)}
        className="flex w-full items-center justify-between hover:opacity-80 transition-opacity"
        aria-label="View Soul Certificate"
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: colour }}>
          Soul Depth
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium" style={{ color: colour }}>
            {data.level}
          </span>
          <span className="text-[10px] text-white/30">view certificate →</span>
        </span>
      </button>

      {/* Main score bar */}
      <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: colour }}
          initial={{ width: 0 }}
          animate={{ width: `${scorePct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-white/40">
        <span>{Math.round(data.depth)}/100</span>
        <span title="Consecutive active days">🔥 {data.streak}d streak</span>
      </div>

      {/* Breakdown sub-bars */}
      <div className="mt-2.5 flex flex-col gap-1">
        <SubBar label="Kinship/XP"   value={data.breakdown.kinshipXp}   max={35} colour={colour} delay={0.1} />
        <SubBar label="Consistency"  value={data.breakdown.consistency}  max={30} colour={colour} delay={0.2} />
        <SubBar label="Soul age"     value={data.breakdown.soulAge}      max={25} colour={colour} delay={0.3} />
        <SubBar label="Memories"     value={data.breakdown.memory}       max={10} colour={colour} delay={0.4} />
      </div>

      {/* Footer stats */}
      <div className="mt-2 flex justify-between text-[10px] text-white/35">
        <span title="Days with companion activity">{data.soulAgeDays}d bonded</span>
        <span title="Kinship on-chain">{data.kinship} kinship</span>
        <span title="Stored memories">{data.memories} memories</span>
      </div>
      </motion.div>
    </>
  );
}
