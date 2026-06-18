import { useMemo } from "react";
import { useAppStore } from "@/state/useAppStore";
import { useCompanion } from "@/state/useCompanion";
import { buildPersonality } from "@/lib/companion/personality";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";

export function CompanionGotchiPicker({ onPicked }: { onPicked?: () => void }) {
  const gotchis = useAppStore((s) => s.gotchis);
  const setSelected = useCompanion((s) => s.setSelected);
  const selectedId = useCompanion((s) => s.selectedTokenId);

  const items = useMemo(
    () => gotchis.map((g) => ({ g, p: buildPersonality(g) })),
    [gotchis]
  );

  return (
    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto pr-1">
      {items.map(({ g, p }) => (
        <button
          key={g.id}
          onClick={() => { setSelected(g.id); onPicked?.(); }}
          className={`flex items-center gap-3 rounded-xl border p-2 text-left transition
            ${selectedId === g.id ? "border-fuchsia-400/60 bg-fuchsia-400/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
        >
          <span className="h-12 w-12 shrink-0"><GotchiSvgById id={g.id} className="block h-12 w-12" /></span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-white">{g.name || `#${g.id}`}</span>
            <span className="block truncate text-[11px] text-fuchsia-200/70">{p.archetype}</span>
            <span className="block truncate text-[10px] text-white/50">
              {p.traitLines.slice(0, 2).map((t) => `${t.emoji} ${t.label}`).join(" · ")}
            </span>
          </span>
        </button>
      ))}
      {!items.length && <div className="p-4 text-center text-sm text-white/50">Connect your wallet to meet your gotchis 👻</div>}
    </div>
  );
}
