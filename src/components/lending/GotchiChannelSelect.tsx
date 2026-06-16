import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Heart, Check } from "lucide-react";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import type { Gotchi } from "@/types";

const gid = (g: Gotchi) => Number(g.gotchiId ?? g.id);

function Icon({ g, size = 26 }: { g: Gotchi; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded bg-muted/40 overflow-hidden"
      style={{ width: size, height: size }}
    >
      <GotchiSvg
        gotchiId={String(gid(g))}
        hauntId={g.hauntId}
        collateral={g.collateral}
        numericTraits={g.numericTraits}
        equippedWearables={g.equippedWearables}
        mode="preview"
        useBlobUrl
        className="w-full h-full object-contain"
      />
    </span>
  );
}

/**
 * Picker for which wallet gotchi channels. Channeling yield scales with the
 * gotchi's KINSHIP (base 20/10/5/2 FUD/FOMO/ALPHA/KEK × kinship multiplier),
 * so options are ordered highest-kinship first and the default is the top one.
 * Only directly-owned (unlocked) gotchis can channel — lent/locked ones can't.
 */
export function GotchiChannelSelect({
  gotchis,
  value,
  onChange,
  disabled,
}: {
  gotchis: Gotchi[];
  value?: number;
  onChange: (id: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...gotchis].sort((a, b) => (b.kinship ?? 0) - (a.kinship ?? 0)),
    [gotchis]
  );
  const selected = sorted.find((g) => gid(g) === value) ?? sorted[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (sorted.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <span className="block text-[11px] text-muted-foreground mb-1">Channel with</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Choose which gotchi channels. Higher kinship channels more alchemica."
        className="inline-flex items-center gap-2 h-10 pl-1.5 pr-2 rounded-md border border-border bg-background hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed min-w-[220px] text-left"
      >
        {selected && <Icon g={selected} />}
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium truncate">
            {selected?.name || "Unnamed"} <span className="text-muted-foreground">#{selected && gid(selected)}</span>
          </span>
          <span className="block text-[11px] text-rose-500 inline-flex items-center gap-0.5">
            <Heart className="w-3 h-3 fill-current" /> {selected?.kinship ?? "—"} kinship
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[min(320px,90vw)] max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg p-1">
          {sorted.map((g) => {
            const id = gid(g);
            const isSel = id === value || (value == null && selected && id === gid(selected));
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-1.5 py-1.5 rounded text-left hover:bg-muted/60 ${isSel ? "bg-muted/40" : ""}`}
              >
                <Icon g={g} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium truncate">
                    {g.name || "Unnamed"} <span className="text-muted-foreground">#{id}</span>
                  </span>
                  <span className="block text-[11px] text-rose-500 inline-flex items-center gap-0.5">
                    <Heart className="w-3 h-3 fill-current" /> {g.kinship ?? "—"}
                  </span>
                </span>
                {isSel && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
