import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Gift, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { XP_SUBGRAPH } from "@/lib/subgraph";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import {
  fetchDropData,
  getAddressEntry,
  resolveAddressClaim,
  buildClaimArgs,
  buildBatchClaimArgs,
  CLAIM_XP_ABI,
  BATCH_CLAIM_XP_ABI,
  type GotchiClaim,
} from "@/lib/xpClaim";

// One XP drop as it applies to a single address: which of its gotchis are
// eligible and which of those are still unclaimed.
type DropRow = {
  propId: string;
  amount: number;
  createdAt: number;
  gotchiIds: string[];
  unclaimed: string[];
};

function ago(unix: number): string {
  const s = Math.floor(Date.now() / 1000) - unix;
  const d = Math.floor(s / 86400), mo = Math.floor(d / 30), y = Math.floor(d / 365);
  if (y > 0) return `${y} yr${y > 1 ? "s" : ""} ago`;
  if (mo > 0) return `${mo} mo ago`;
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60);
  return h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : "just now";
}

async function xpGql(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(XP_SUBGRAPH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "subgraph error");
  return json.data;
}

/**
 * Build the airdrop rows for one address: every drop the address is eligible
 * for (its leaf exists in that drop's tree), annotated with which of its
 * gotchis remain unclaimed. Eligibility comes from each drop's off-chain
 * data.json; claimed state from the xp subgraph (claims keyed by claimer).
 */
async function loadAirdrops(address: string): Promise<DropRow[]> {
  const addr = address.toLowerCase();

  const [dropsData, claimsData] = await Promise.all([
    xpGql(`{ xpdrops(first: 100, orderBy: createdAt, orderDirection: desc){ id amount createdAt } }`),
    xpGql(`query($c: Bytes!){ claimedXPDrops(first: 1000, where: { claimer: $c }){ drop{ id } gotchi } }`, { c: addr }),
  ]);
  const drops: { id: string; amount: string; createdAt: string }[] = dropsData?.xpdrops ?? [];
  const claimed = new Set<string>(
    (claimsData?.claimedXPDrops ?? []).map((c: any) => `${c.drop.id}:${c.gotchi}`)
  );

  const rows = await Promise.all(
    drops.map(async (d) => {
      const data = await fetchDropData(d.id).catch(() => null);
      if (!data) return null;
      const entry = getAddressEntry(data, addr);
      if (!entry) return null;
      const unclaimed = entry.gotchiIds.filter((g) => !claimed.has(`${d.id}:${g}`));
      return {
        propId: d.id,
        amount: Number(d.amount),
        createdAt: Number(d.createdAt),
        gotchiIds: entry.gotchiIds,
        unclaimed,
      } as DropRow;
    })
  );
  return rows.filter((r): r is DropRow => r != null).sort((a, b) => b.createdAt - a.createdAt);
}

type Status = { key: string; kind: "busy" | "ok" | "err"; msg?: string } | null;

/** Wallet-level XP airdrops view: all eligible drops for `address` + claiming. */
export function AirdropsPanel({ address }: { address: string; isSelf?: boolean }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState<Status>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["airdrops", address.toLowerCase()],
    queryFn: () => loadAirdrops(address),
    staleTime: 600_000,
    enabled: !!address,
  });

  const rows = data ?? [];
  const claimableRows = useMemo(() => rows.filter((r) => r.unclaimed.length > 0), [rows]);
  const totalClaimableXp = useMemo(
    () => claimableRows.reduce((sum, r) => sum + r.amount * r.unclaimed.length, 0),
    [claimableRows]
  );

  const canSubmit = () => {
    if (!isConnected || !publicClient) { setStatus({ key: "*", kind: "err", msg: "Connect your wallet first" }); return false; }
    if (!isOnBase) { setStatus({ key: "*", kind: "err", msg: "Switch to Base" }); return false; }
    return true;
  };

  const claimOne = async (row: DropRow) => {
    if (!canSubmit() || !publicClient) return;
    setStatus({ key: row.propId, kind: "busy", msg: "Finding proof…" });
    try {
      const claim = await resolveAddressClaim(row.propId, address);
      if (!claim) return setStatus({ key: row.propId, kind: "err", msg: "No proof found for this drop" });
      setStatus({ key: row.propId, kind: "busy", msg: "Confirm in wallet…" });
      const hash = await writeContractAsync({
        chainId: BASE_CHAIN_ID,
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: CLAIM_XP_ABI,
        functionName: "claimXPDrop",
        args: buildClaimArgs(claim) as any,
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setStatus({ key: row.propId, kind: "ok", msg: "Claimed" });
      refetch();
    } catch (e) {
      setStatus({ key: row.propId, kind: "err", msg: parseRevert(e).slice(0, 120) });
    }
  };

  const claimAll = async () => {
    if (!canSubmit() || !publicClient) return;
    setStatus({ key: "*", kind: "busy", msg: "Gathering proofs…" });
    try {
      const resolved = (
        await Promise.all(claimableRows.map((r) => resolveAddressClaim(r.propId, address).catch(() => null)))
      ).filter((c): c is GotchiClaim => c != null);
      if (!resolved.length) return setStatus({ key: "*", kind: "err", msg: "No claimable proofs found" });
      setStatus({ key: "*", kind: "busy", msg: `Confirm ${resolved.length} drop${resolved.length > 1 ? "s" : ""} in wallet…` });
      const hash = await writeContractAsync({
        chainId: BASE_CHAIN_ID,
        address: AAVEGOTCHI_DIAMOND_BASE,
        abi: BATCH_CLAIM_XP_ABI,
        functionName: "batchDropClaimXPDrop",
        args: buildBatchClaimArgs(resolved) as any,
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setStatus({ key: "*", kind: "ok", msg: "All claimed" });
      refetch();
    } catch (e) {
      setStatus({ key: "*", kind: "err", msg: parseRevert(e).slice(0, 140) });
    }
  };

  const busy = status?.kind === "busy";
  const globalStatus = status?.key === "*" ? status : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 border border-primary/30"><Gift className="w-5 h-5 text-primary" /></span>
          <div>
            <div className="text-sm font-semibold">XP airdrops</div>
            <div className="text-[11px] text-muted-foreground">
              {totalClaimableXp > 0 ? <span className="text-emerald-500 font-semibold">{totalClaimableXp.toLocaleString()} XP claimable</span> : "Nothing to claim right now"}
            </div>
          </div>
        </div>
        {claimableRows.length > 0 && (
          <button
            onClick={claimAll}
            disabled={busy}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 hover:brightness-110"
          >
            {globalStatus?.kind === "busy" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {globalStatus?.kind === "busy" ? globalStatus.msg : `Claim all (${claimableRows.length})`}
          </button>
        )}
      </div>

      {globalStatus && globalStatus.kind !== "busy" && (
        <div className={`mb-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${globalStatus.kind === "ok" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-500"}`}>
          {globalStatus.kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {globalStatus.msg}
        </div>
      )}

      {error ? (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">{(error as Error).message}</div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No XP airdrops for this wallet. Eligibility comes from voting on proposals.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Drop</th>
                <th className="text-right font-medium px-3 py-2">XP each</th>
                <th className="text-right font-medium px-3 py-2">Gotchis</th>
                <th className="text-right font-medium px-3 py-2">Claimable</th>
                <th className="text-right font-medium px-3 py-2">When</th>
                <th className="text-right font-medium px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowStatus = status?.key === r.propId ? status : null;
                const fullyClaimed = r.unclaimed.length === 0;
                return (
                  <tr key={r.propId} className="border-t border-border/20 hover:bg-muted/20">
                    <td className="px-3 py-1.5 font-mono">{r.propId.slice(0, 6)}…{r.propId.slice(-4)}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-500 font-semibold">+{r.amount}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">{r.unclaimed.length}/{r.gotchiIds.length}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{fullyClaimed ? "-" : (r.amount * r.unclaimed.length).toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">{ago(r.createdAt)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {fullyClaimed || rowStatus?.kind === "ok" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-medium"><CheckCircle2 className="w-3 h-3" /> Claimed</span>
                      ) : rowStatus?.kind === "busy" ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> {rowStatus.msg}</span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <button onClick={() => claimOne(r)} disabled={busy} className="h-7 px-2.5 rounded text-[11px] font-semibold bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 disabled:opacity-50">Claim</button>
                          {rowStatus?.kind === "err" && <span className="inline-flex items-center gap-1 text-red-500 text-[10px] max-w-[160px] text-right"><XCircle className="w-3 h-3 shrink-0" /> {rowStatus.msg}</span>}
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
      <p className="mt-3 text-[11px] text-muted-foreground">
        XP is earned by voting on proposals and credited to the gotchis held at each snapshot. Claiming is open to anyone and credits XP to the gotchi. Eligibility lists live off-chain in the aavegotchi-base repo.
      </p>
    </div>
  );
}
