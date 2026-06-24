// src/components/steward/StewardCard.tsx
// One gotchi card. Three states via deriveCardState. Beast-mode: dark card, animated
// "On Duty" pulse, soul-xp bar, hover lift. Click routes to the right destination.
import { motion } from "framer-motion";
import { Zap, Sparkles, Lock } from "lucide-react";
import type { CardState } from "@/lib/steward/cardState";

export interface StewardCardProps {
  gotchi: { id: number; name: string; image: string };
  state: CardState;
  soulXpPct?: number;
  chipChores?: string[];
  onClick: () => void;
}

export function StewardCard({ gotchi, state, soulXpPct = 0, chipChores = [], onClick }: StewardCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative flex w-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/80 p-4 text-left shadow-lg backdrop-blur"
    >
      {state === "on-duty" && (
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300"
        >
          <Zap size={12} /> On Duty
        </motion.span>
      )}
      <img src={gotchi.image} alt={gotchi.name} className="h-24 w-24 object-contain" />
      <div className="font-bold">{gotchi.name}</div>

      {state === "on-duty" && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-emerald-400" style={{ width: `${soulXpPct}%` }} />
          </div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">{chipChores.join(" · ")}</div>
        </>
      )}
      {state === "soul-idle" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/15 px-2 py-1 text-sm text-fuchsia-300">
          <Sparkles size={14} /> Put to work
        </span>
      )}
      {state === "no-soul" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-sm text-zinc-400">
          <Lock size={14} /> Awaken soul
        </span>
      )}
    </motion.button>
  );
}
