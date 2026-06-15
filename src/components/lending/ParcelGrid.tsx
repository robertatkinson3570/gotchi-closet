import type { Placed } from "@/hooks/useParcelDetail";

// Aavegotchi alchemica palette (gradient stops) for harvesters/reservoirs.
const ALCH = [
  { from: "#34d399", to: "#059669", label: "FUD" },
  { from: "#fb7185", to: "#e11d48", label: "FOMO" },
  { from: "#60a5fa", to: "#2563eb", label: "ALPHA" },
  { from: "#c084fc", to: "#9333ea", label: "KEK" },
];
const GOLD = { from: "#fbbf24", to: "#d97706" };
const SLATE = { from: "#94a3b8", to: "#475569" };

function styleFor(item: Placed) {
  // Altar / lodge / maker → gold regardless of alch; harvester/reservoir → alch color; tiles/other → slate.
  if (item.category === 0 || item.category === 3 || item.category === 6) return GOLD;
  if (item.alch >= 0 && item.alch <= 3) return ALCH[item.alch];
  return SLATE;
}
function tag(item: Placed): string {
  switch (item.category) {
    case 0: return "ALTAR";
    case 1: return "HARV";
    case 2: return "RESV";
    case 3: return "LODGE";
    case 6: return "MAKER";
    default: return "TILE";
  }
}

/**
 * Read-only visual layout of a parcel's equipped installations + tiles, drawn
 * to scale on the coordinate grid (footprint-accurate, colored by alchemica
 * type). Percentage positioning makes it responsive to any container width.
 */
export function ParcelGrid({
  installations,
  tiles,
  realmId,
  onRemove,
  busyKey,
}: {
  installations: Placed[];
  tiles: Placed[];
  /** Parcel token id — used to build the per-item unequip busy key. */
  realmId?: string;
  /** When provided, installation tiles become clickable to remove (unequip). */
  onRemove?: (item: Placed) => void;
  /** `unequip:<realm>:<id>:<x>:<y>` key currently mid-transaction. */
  busyKey?: string | null;
}) {
  const items = [...tiles, ...installations]; // tiles under installations
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">Nothing equipped.</div>;
  }

  const cols = Math.max(8, ...items.map((i) => i.x + i.w));
  const rows = Math.max(8, ...items.map((i) => i.y + i.h));

  const cell = `linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)`;

  return (
    <div>
      <div className="rounded-lg border border-border/40 bg-[#0d0f17] p-3 overflow-hidden">
        <div
          className="relative w-full"
          style={{
            paddingBottom: `${(rows / cols) * 100}%`,
            backgroundImage: cell,
            backgroundSize: `${100 / cols}% ${100 / rows}%`,
          }}
        >
          {items.map((it, idx) => {
            const c = styleFor(it);
            const removable = !!onRemove && it.category !== -1;
            const busy = busyKey === `unequip:${realmId}:${it.installationId}:${it.x}:${it.y}`;
            return (
              <div
                key={idx}
                title={`${it.name} · #${it.installationId} @ (${it.x},${it.y}) · ${it.w}×${it.h}${removable ? " — click to remove" : ""}`}
                onClick={removable ? () => onRemove!(it) : undefined}
                className={`group absolute rounded-[3px] shadow-sm ring-1 ring-black/30 flex flex-col items-center justify-center overflow-hidden ${
                  removable ? "cursor-pointer hover:ring-2 hover:ring-red-400 hover:z-10" : ""
                } ${busy ? "animate-pulse ring-2 ring-red-500" : ""}`}
                style={{
                  left: `${(it.x / cols) * 100}%`,
                  top: `${(it.y / rows) * 100}%`,
                  width: `${(it.w / cols) * 100}%`,
                  height: `${(it.h / rows) * 100}%`,
                  padding: "1px",
                  background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
                }}
              >
                <span className="text-[7px] leading-none font-bold text-black/70 truncate max-w-full px-0.5">
                  {tag(it)}
                </span>
                {it.level > 1 && (
                  <span className="text-[7px] leading-none font-semibold text-white/90 mt-0.5">L{it.level}</span>
                )}
                {removable && (
                  <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-red-600/40 text-white text-[9px] font-bold">
                    ✕
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 flex-wrap mt-2 text-[10px] text-muted-foreground">
        {ALCH.map((a) => (
          <span key={a.label} className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }} />
            {a.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: `linear-gradient(135deg, ${GOLD.from}, ${GOLD.to})` }} />
          Altar / Maker
        </span>
        <span className="ml-auto">{cols}×{rows} grid</span>
      </div>
    </div>
  );
}
