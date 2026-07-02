import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchWardrobeHistory } from "@/lib/explorer/wardrobe";
import { itemMetaSync, RARITY_COLORS } from "@/lib/explorer/itemMeta";

function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const d = Math.floor(s / 86400), mo = Math.floor(d / 30), y = Math.floor(d / 365);
  if (y > 0) return `${y} yr${y > 1 ? "s" : ""} ago`;
  if (mo > 0) return `${mo} mo ago`;
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60);
  return h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : "just now";
}

/** Full equip/unequip timeline for a gotchi (EquippedWearableOwner) — a
 *  wardrobe history no other Aavegotchi tool surfaces. */
export function WardrobeHistory({ gotchiId }: { gotchiId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["wardrobe-history", gotchiId],
    queryFn: () => fetchWardrobeHistory(gotchiId),
    staleTime: 60_000,
  });

  return (
    <div>
      <div className="text-sm font-semibold mb-1.5">Wardrobe history</div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2">No wardrobe history recorded.</div>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/30 text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left font-medium px-2.5 py-1.5">Wearable</th>
                <th className="text-right font-medium px-2.5 py-1.5">Slot</th>
                <th className="text-right font-medium px-2.5 py-1.5">When</th>
                <th className="text-right font-medium px-2.5 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((ev, i) => {
                const meta = itemMetaSync(ev.wearableId);
                const tint = meta?.rarity ? RARITY_COLORS[meta.rarity] : undefined;
                return (
                  <tr key={i} className="border-t border-border/20">
                    <td className={`px-2.5 py-1.5 truncate max-w-[140px] ${tint ?? ""}`}>{meta?.name ?? `#${ev.wearableId}`}</td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground">{ev.slotPosition}</td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground">{ago(ev.equippedAt)}</td>
                    <td className="px-2.5 py-1.5 text-right">
                      <span className={ev.isCurrentlyEquipped ? "text-emerald-500 font-semibold" : "text-muted-foreground"}>
                        {ev.isCurrentlyEquipped ? "Equipped" : "Removed"}
                      </span>
                      {ev.isDelegated && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-semibold">delegated</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
