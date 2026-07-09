import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { fetchXpDropStatus } from "@/lib/xpDrops";
import { resolveGotchiClaim, buildClaimArgs, CLAIM_XP_ABI } from "@/lib/xpClaim";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";

function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const d = Math.floor(s / 86400), mo = Math.floor(d / 30), y = Math.floor(d / 365);
  if (y > 0) return `${y} yr${y > 1 ? "s" : ""} ago`;
  if (mo > 0) return `${mo} mo ago`;
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60);
  return h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : "just now";
}

// Per-row claim state. Only one claim is in flight at a time (one wallet popup).
type ClaimState = { dropId: string; kind: "busy" | "ok" | "err"; msg?: string };

/** Recent XP merkle drops + this gotchi's claim status, with per-drop claiming. */
export function XpDrops({ gotchiId }: { gotchiId: string }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [claim, setClaim] = useState<ClaimState | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["xp-drops", gotchiId],
    queryFn: () => fetchXpDropStatus(gotchiId),
    staleTime: 300_000,
  });

  // Claiming is permissionless (the contract does not check msg.sender), but a
  // wallet on Base is needed to submit. The claimer inside the proof is the
  // snapshot-time holder, resolved from the drop's off-chain tree — not
  // necessarily the connected wallet. XP credits to the gotchi regardless.
  const claimDrop = async (dropId: string) => {
    if (!isConnected || !publicClient) return setClaim({ dropId, kind: "err", msg: "Connect your wallet first" });
    if (!isOnBase) return setClaim({ dropId, kind: "err", msg: "Switch to Base" });
    setClaim({ dropId, kind: "busy", msg: "Finding proof…" });
    try {
      const resolved = await resolveGotchiClaim(dropId, gotchiId);
      if (!resolved) return setClaim({ dropId, kind: "err", msg: "Not eligible for this drop" });
      setClaim({ dropId, kind: "busy", msg: "Confirm in wallet…" });
      const hash = await writeContractAsync({
        chainId: BASE_CHAIN_ID,
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: CLAIM_XP_ABI,
        functionName: "claimXPDrop",
        args: buildClaimArgs(resolved) as any,
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setClaim({ dropId, kind: "ok", msg: "Claimed" });
      refetch();
    } catch (e) {
      setClaim({ dropId, kind: "err", msg: parseRevert(e).slice(0, 120) });
    }
  };

  const busyId = claim?.kind === "busy" ? claim.dropId : null;

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
              {data.map((d) => {
                const rowClaim = claim?.dropId === d.dropId ? claim : null;
                const claimed = d.claimed || rowClaim?.kind === "ok";
                return (
                  <tr key={d.dropId} className="border-t border-border/20">
                    <td className="px-2.5 py-1.5 font-mono">{d.dropId.slice(0, 6)}…{d.dropId.slice(-4)}</td>
                    <td className="px-2.5 py-1.5 text-right text-emerald-500 font-semibold">+{d.amount}</td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground">{ago(d.createdAt)}</td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                      {claimed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-medium"><CheckCircle2 className="w-3 h-3" /> Claimed</span>
                      ) : rowClaim?.kind === "busy" ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> {rowClaim.msg}</span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <button
                            onClick={() => claimDrop(d.dropId)}
                            disabled={!!busyId}
                            className="px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30 text-[11px] font-semibold hover:bg-primary/25 disabled:opacity-50"
                          >
                            Claim
                          </button>
                          {rowClaim?.kind === "err" && (
                            <span className="inline-flex items-center gap-1 text-red-500 text-[10px] max-w-[150px] text-right"><XCircle className="w-3 h-3 shrink-0" /> {rowClaim.msg}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[10px] text-muted-foreground mt-1">
        Claiming is open to anyone and credits XP to the gotchi. Unclaimed may mean not eligible — eligibility lists live off-chain.
      </div>
    </div>
  );
}
