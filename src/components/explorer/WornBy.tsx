import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { fetchCurrentWearers } from "@/lib/explorer/wardrobe";

function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const d = Math.floor(s / 86400), mo = Math.floor(d / 30), y = Math.floor(d / 365);
  if (y > 0) return `${y} yr${y > 1 ? "s" : ""} ago`;
  if (mo > 0) return `${mo} mo ago`;
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60);
  return h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : "just now";
}

const DISPLAY_CAP = 10;

/** Provenance: which gotchis currently have this wearable equipped. */
export function WornBy({ wearableId }: { wearableId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["worn-by", wearableId],
    queryFn: () => fetchCurrentWearers(wearableId),
    staleTime: 60_000,
  });

  return (
    <div>
      <div className="text-sm font-semibold mb-1.5">Currently worn by</div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2">Not currently equipped on any gotchi.</div>
      ) : (
        <div className="space-y-1 text-[11px]">
          {data.slice(0, DISPLAY_CAP).map((w) => (
            <div key={w.gotchiId} className="flex items-center justify-between">
              <Link to={`/gotchi/${w.gotchiId}`} className="font-mono text-primary hover:underline">Gotchi #{w.gotchiId}</Link>
              <span className="text-muted-foreground">{ago(w.equippedAt)}</span>
            </div>
          ))}
          {data.length > DISPLAY_CAP && (
            <div className="text-muted-foreground">+{data.length - DISPLAY_CAP} more</div>
          )}
        </div>
      )}
    </div>
  );
}
