import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchXpDropStatus } from "@/lib/xpDrops";

function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const d = Math.floor(s / 86400), mo = Math.floor(d / 30), y = Math.floor(d / 365);
  if (y > 0) return `${y} yr${y > 1 ? "s" : ""} ago`;
  if (mo > 0) return `${mo} mo ago`;
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60);
  return h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : "just now";
}

/** Recent XP merkle drops + this gotchi's claim status for each. */
export function XpDrops({ gotchiId }: { gotchiId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["xp-drops", gotchiId],
    queryFn: () => fetchXpDropStatus(gotchiId),
    staleTime: 300_000,
  });

  return (
    <div>
      <div className="text-sm font-semibold mb-1.5">XP drops</div>
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2">No XP drops indexed yet.</div>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/30 text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left font-medium px-2.5 py-1.5">Drop</th>
                <th className="text-right font-medium px-2.5 py-1.5">XP</th>
                <th className="text-right font-medium px-2.5 py-1.5">When</th>
                <th className="text-right font-medium px-2.5 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.dropId} className="border-t border-border/20">
                  <td className="px-2.5 py-1.5 font-mono">{d.dropId.slice(0, 6)}…{d.dropId.slice(-4)}</td>
                  <td className="px-2.5 py-1.5 text-right text-emerald-500 font-semibold">+{d.amount}</td>
                  <td className="px-2.5 py-1.5 text-right text-muted-foreground">{ago(d.createdAt)}</td>
                  <td className="px-2.5 py-1.5 text-right">
                    {d.claimed ? (
                      <span className="text-emerald-500 font-medium">Claimed</span>
                    ) : (
                      <span className="text-muted-foreground">Not claimed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[10px] text-muted-foreground mt-1">
        Unclaimed may mean not eligible. Eligibility lists live off-chain.
      </div>
    </div>
  );
}
