import { useState } from "react";
import type { Placed } from "@/hooks/useParcelDetail";

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
  placing,
  onPlace,
  pending,
  onUnstage,
  size,
}: {
  installations: Placed[];
  tiles: Placed[];
  /** Parcel token id — used to build the per-item unequip busy key. */
  realmId?: string;
  /** When provided, installation tiles become clickable to remove (unequip). */
  onRemove?: (item: Placed) => void;
  /** `unequip:<realm>:<id>:<x>:<y>` key currently mid-transaction. */
  busyKey?: string | null;
  /** Footprint of the item being dragged from the inventory (enables drop). */
  placing?: { w: number; h: number } | null;
  /** Called with the snapped top-left cell when a valid drop occurs. */
  onPlace?: (x: number, y: number) => void;
  /** Staged (not-yet-saved) placements, drawn as dashed ghost tiles. */
  pending?: Placed[];
  /** Click a staged tile to remove it from the plan. */
  onUnstage?: (index: number) => void;
  /** Parcel size code — sets the true grid dimensions. */
  size?: number;
}) {
  const items = [...tiles, ...installations]; // tiles under installations
  const staged = pending ?? [];
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // Pack the grid to the installation bounding box (like aadventure) so tiles
  // sit side-by-side and fill the frame, with 1 cell of padding for dropping.
  // We intentionally do NOT stretch to full parcel dims (PARCEL_DIMS by `size`),
  // which left installations floating in a mostly-empty grid.
  void size;
  const all = [...items, ...staged];
  const cols = Math.max(6, ...all.map((i) => i.x + i.w)) + 1;
  const rows = Math.max(6, ...all.map((i) => i.y + i.h)) + 1;

  // Occupied cells (existing + staged), for collision checks when dropping.
  const occupied = new Set<string>();
  for (const it of [...items, ...staged])
    for (let dx = 0; dx < it.w; dx++) for (let dy = 0; dy < it.h; dy++) occupied.add(`${it.x + dx},${it.y + dy}`);

  const fits = (x: number, y: number, w: number, h: number) => {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) if (occupied.has(`${x + dx},${y + dy}`)) return false;
    return true;
  };
  const cellFromEvent = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
    return { x, y };
  };
  const hoverValid = placing && hover ? fits(hover.x, hover.y, placing.w, placing.h) : false;

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
          onDragOver={
            placing && onPlace
              ? (e) => {
                  e.preventDefault();
                  setHover(cellFromEvent(e));
                }
              : undefined
          }
          onDragLeave={placing ? () => setHover(null) : undefined}
          onDrop={
            placing && onPlace
              ? (e) => {
                  e.preventDefault();
                  const { x, y } = cellFromEvent(e);
                  setHover(null);
                  if (fits(x, y, placing.w, placing.h)) onPlace(x, y);
                }
              : undefined
          }
        >
          {placing && hover && (
            <div
              className="absolute rounded-[3px] ring-2 z-20 pointer-events-none"
              style={{
                left: `${(hover.x / cols) * 100}%`,
                top: `${(hover.y / rows) * 100}%`,
                width: `${(placing.w / cols) * 100}%`,
                height: `${(placing.h / rows) * 100}%`,
                background: hoverValid ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)",
                boxShadow: `0 0 0 9999px transparent`,
              }}
            />
          )}
          {items.map((it, idx) => {
            const removable = !!onRemove && it.category !== -1;
            const busy = busyKey === `unequip:${realmId}:${it.installationId}:${it.x}:${it.y}`;
            return (
              <div
                key={idx}
                title={`${it.name} · #${it.installationId} @ (${it.x},${it.y}) · ${it.w}×${it.h}${removable ? " — click to remove" : ""}`}
                onClick={removable ? () => onRemove!(it) : undefined}
                className={`group absolute flex items-center justify-center ${
                  removable ? "cursor-pointer rounded-[2px] hover:ring-2 hover:ring-red-400 hover:z-10" : ""
                } ${busy ? "animate-pulse ring-2 ring-red-500 rounded-[2px]" : ""}`}
                style={{
                  left: `${(it.x / cols) * 100}%`,
                  top: `${(it.y / rows) * 100}%`,
                  width: `${(it.w / cols) * 100}%`,
                  height: `${(it.h / rows) * 100}%`,
                }}
              >
                <img
                  src={`/installations/installation_${it.installationId}.png`}
                  alt={it.name}
                  className="w-full h-full object-contain pointer-events-none"
                  style={{ imageRendering: "pixelated" }}
                />
                {removable && (
                  <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-red-600/50 text-white text-[10px] font-bold z-20 rounded-[2px]">
                    ✕
                  </span>
                )}
              </div>
            );
          })}
          {staged.map((it, i) => (
            <div
              key={`pending-${i}`}
              title={`${it.name} (staged) @ (${it.x},${it.y}) — click to unstage`}
              onClick={onUnstage ? () => onUnstage(i) : undefined}
              className="absolute rounded-[3px] z-10 cursor-pointer flex items-center justify-center border-2 border-dashed border-emerald-200"
              style={{
                left: `${(it.x / cols) * 100}%`,
                top: `${(it.y / rows) * 100}%`,
                width: `${(it.w / cols) * 100}%`,
                height: `${(it.h / rows) * 100}%`,
                background: "rgba(16,185,129,0.55)",
              }}
            >
              <img
                src={`/installations/installation_${it.installationId}.png`}
                alt={it.name}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-80"
                style={{ imageRendering: "pixelated" }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <span className="relative text-[7px] font-bold text-white leading-none z-10" style={{ textShadow: "0 0 2px #000" }}>NEW</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end mt-2 text-[10px] text-muted-foreground">
        <span>{cols}×{rows} grid</span>
      </div>
    </div>
  );
}
