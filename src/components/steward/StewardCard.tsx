// src/components/steward/StewardCard.tsx
// One gotchi card, compact, matching the explorer grid density: tier-colored border, a
// square gotchi image that fills the cell, a tight body, and corner badges (soul cert +
// on-duty). The art is the real on-chain SVG (GotchiSvgById).
import { motion } from "framer-motion";
import { Zap, BadgeCheck, Lock } from "lucide-react";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { getRarityTier } from "@/lib/explorer/filters";
import type { CardState } from "@/lib/steward/cardState";

export interface StewardCardProps {
  gotchi: { id: number; name: string };
  state: CardState;
  brs?: number | null;
  soulXpPct?: number;
  chipChores?: string[];
  lentOut?: boolean;
  onClick: () => void;
}

const tierColors: Record<string, { bg: string; border: string; text: string }> = {
  common: { bg: "bg-gray-500/5", border: "border-gray-400/20", text: "text-gray-400" },
  uncommon: { bg: "bg-green-500/5", border: "border-green-400/20", text: "text-green-400" },
  rare: { bg: "bg-blue-500/5", border: "border-blue-400/20", text: "text-blue-400" },
  legendary: { bg: "bg-orange-500/5", border: "border-orange-400/20", text: "text-orange-400" },
  mythical: { bg: "bg-purple-500/5", border: "border-purple-400/20", text: "text-purple-400" },
  godlike: { bg: "bg-pink-500/5", border: "border-pink-400/20", text: "text-pink-400" },
};

export function StewardCard({ gotchi, state, brs, soulXpPct = 0, chipChores = [], lentOut = false, onClick }: StewardCardProps) {
  const hasCert = state !== "no-soul";
  const c = tierColors[getRarityTier(brs ?? 0)] || tierColors.common;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      className={`relative overflow-hidden rounded-lg border ${c.border} ${c.bg} text-left transition-all duration-150 hover:ring-1 hover:ring-fuchsia-500/40 active:scale-[0.98]`}
    >
      <div className="relative flex aspect-square items-center justify-center bg-black/20">
        <GotchiSvgById id={String(gotchi.id)} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
        {/* bottom-left: rented-out marker (still petted + claims, but can't channel) */}
        {lentOut && (
          <span className="absolute bottom-1 left-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow">Rented out</span>
        )}
        {/* top-left: soul-cert status */}
        {hasCert ? (
          <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-fuchsia-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow">
            <BadgeCheck size={10} /> Soul
          </span>
        ) : (
          <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white/70 shadow">
            <Lock size={10} /> No cert
          </span>
        )}
        {/* top-right: on-duty pulse */}
        {state === "on-duty" && (
          <motion.span
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow"
          >
            <Zap size={10} /> On Duty
          </motion.span>
        )}
      </div>

      <div className="space-y-1 px-2 py-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="flex-1 truncate text-xs font-semibold">{gotchi.name || `#${gotchi.id}`}</span>
          <span className="shrink-0 font-mono text-[9px] text-zinc-500">#{gotchi.id}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1"><span className="text-zinc-500">BRS</span><span className={`font-semibold ${c.text}`}>{brs != null ? Math.round(brs) : "?"}</span></span>
          {state === "on-duty"
            ? <span className="truncate text-emerald-300/80">{chipChores.join(" · ")}</span>
            : state === "soul-idle"
              ? <span className="text-fuchsia-300">Put to work →</span>
              : <span className="text-zinc-400">Mint cert →</span>}
        </div>
        {state === "on-duty" && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-emerald-400" style={{ width: `${soulXpPct}%` }} />
          </div>
        )}
      </div>
    </motion.button>
  );
}
