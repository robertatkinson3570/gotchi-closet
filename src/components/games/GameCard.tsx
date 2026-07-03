// src/components/games/GameCard.tsx
import type { GamePublic } from "@/lib/games/types";
import { approvedImageUrl } from "@/lib/games/api";

const CHIP: Record<string, string> = {
  Games: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40",
  Tools: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  Dashboards: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Other: "bg-muted/40 text-muted-foreground border-border/40",
};

export function GameCard({ game }: { game: GamePublic }) {
  return (
    <a
      href={game.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 ring-1 ring-primary/5 transition-shadow hover:shadow-[0_0_24px_rgba(217,70,239,0.25)]"
    >
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl pointer-events-none bg-fuchsia-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="aspect-video w-full overflow-hidden bg-black/30">
        <img src={approvedImageUrl(game.id)} alt={game.title} loading="lazy" className="w-full h-full object-cover" />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold truncate">{game.title}</h3>
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${CHIP[game.category] ?? CHIP.Other}`}>
            {game.category}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{game.description}</p>
        <span className="mt-3 inline-block text-xs text-primary group-hover:underline">Open ↗</span>
      </div>
    </a>
  );
}
