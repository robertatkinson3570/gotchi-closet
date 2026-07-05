import { useMemo, useState } from "react";
import type { ContractFunctionParameters } from "viem";
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { Droplets, ExternalLink, Gift, Loader2, Lock, Sparkles, Unlock } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { ERC20_ABI, GLTR_FARM_ABI, GLTR_FARM_BASE, GLTR_POOLS, GLTR_TOKEN_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";

const fmt = (wei: bigint | undefined, dp = 2): string => {
  if (wei == null) return "0";
  const v = Number(wei) / 1e18;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toLocaleString(undefined, { maximumFractionDigits: v < 1 && v > 0 ? 4 : dp });
};

const toWei = (s: string): bigint => {
  const n = Number(s);
  if (!(n > 0)) return 0n;
  return BigInt(Math.round(n * 1e9)) * 10n ** 9n;
};

type PoolAction = { pid: number; kind: "stake" | "unstake" } | null;

export default function StakingPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const [action, setAction] = useState<PoolAction>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  // Farm-wide numbers: emission per block + weights. Pool GLTR/block =
  // currentRewardPerBlock * allocPoint / totalAllocPoint (weights verified 2/2/2/2/4/2).
  const farm = { address: GLTR_FARM_BASE, abi: GLTR_FARM_ABI, chainId: BASE_CHAIN_ID } as const;
  const { data: farmGlobals } = useReadContracts({
    contracts: [
      { ...farm, functionName: "currentRewardPerBlock" },
      { ...farm, functionName: "totalAllocPoint" },
      ...GLTR_POOLS.map((p) => ({ ...farm, functionName: "poolInfo", args: [BigInt(p.pid)] })),
      ...GLTR_POOLS.map((p) => ({ ...farm, functionName: "poolBalance", args: [BigInt(p.pid)] })),
    ] as ContractFunctionParameters[],
    query: { refetchInterval: 30_000 },
  });
  const rewardPerBlock = (farmGlobals?.[0]?.result as bigint | undefined) ?? 0n;
  const totalAlloc = (farmGlobals?.[1]?.result as bigint | undefined) ?? 1n;
  const poolAlloc = (i: number): bigint => {
    const info = farmGlobals?.[2 + i]?.result as readonly [string, bigint, bigint, bigint] | undefined;
    return info?.[1] ?? 0n;
  };
  const poolStaked = (i: number): bigint => (farmGlobals?.[2 + GLTR_POOLS.length + i]?.result as bigint | undefined) ?? 0n;

  // Per-user: pending + deposited per pool, LP wallet balances, GLTR balance.
  const { data: userData, refetch: refetchUser } = useReadContracts({
    contracts: (address
      ? [
          ...GLTR_POOLS.map((p) => ({ ...farm, functionName: "pending", args: [BigInt(p.pid), address] })),
          ...GLTR_POOLS.map((p) => ({ ...farm, functionName: "deposited", args: [BigInt(p.pid), address] })),
          ...GLTR_POOLS.map((p) => ({ chainId: BASE_CHAIN_ID, address: p.lp, abi: ERC20_ABI, functionName: "balanceOf", args: [address] })),
        ]
      : []) as ContractFunctionParameters[],
    query: { enabled: !!address, refetchInterval: 30_000 },
  });
  const n = GLTR_POOLS.length;
  const pendingOf = (i: number): bigint => (userData?.[i]?.result as bigint | undefined) ?? 0n;
  const depositedOf = (i: number): bigint => (userData?.[n + i]?.result as bigint | undefined) ?? 0n;
  const lpBalanceOf = (i: number): bigint => (userData?.[2 * n + i]?.result as bigint | undefined) ?? 0n;

  const { data: gltrBal, refetch: refetchGltr } = useReadContract({
    chainId: BASE_CHAIN_ID,
    address: GLTR_TOKEN_BASE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const totalPending = useMemo(() => GLTR_POOLS.reduce((acc, _, i) => acc + pendingOf(i), 0n), [userData]); // eslint-disable-line react-hooks/exhaustive-deps
  const yourPerBlock = useMemo(() => {
    let acc = 0n;
    for (let i = 0; i < n; i++) {
      const staked = poolStaked(i);
      if (staked > 0n) acc += (rewardPerBlock * poolAlloc(i) * depositedOf(i)) / (totalAlloc * staked);
    }
    return acc;
  }, [farmGlobals, userData]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<`0x${string}`>, done: string) => {
    if (!publicClient) return;
    setBusy(true);
    try {
      const hash = await fn();
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: done });
      setAction(null);
      setAmount("");
      refetchUser();
      refetchGltr();
    } catch (e) {
      toast({ title: "Transaction failed", description: parseRevert(e).slice(0, 140), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const doHarvestAll = () => {
    const pids = GLTR_POOLS.filter((_, i) => pendingOf(i) > 0n).map((p) => BigInt(p.pid));
    if (pids.length === 0) return;
    void run(
      () => writeContractAsync({ ...farm, functionName: "batchHarvest", args: [pids] }),
      "GLTR claimed from all pools",
    );
  };

  const doStake = async (pid: number, wei: bigint) => {
    if (!address || !publicClient || wei <= 0n) return;
    const lp = GLTR_POOLS[pid].lp;
    setBusy(true);
    try {
      const allowance = (await publicClient.readContract({ address: lp, abi: ERC20_ABI, functionName: "allowance", args: [address, GLTR_FARM_BASE] })) as bigint;
      if (allowance < wei) {
        const h = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: lp, abi: ERC20_ABI, functionName: "approve", args: [GLTR_FARM_BASE, wei] });
        await publicClient.waitForTransactionReceipt({ hash: h, confirmations: 1 });
      }
      const hash = await writeContractAsync({ ...farm, functionName: "deposit", args: [BigInt(pid), wei] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: `Staked into ${GLTR_POOLS[pid].name}` });
      setAction(null);
      setAmount("");
      refetchUser();
    } catch (e) {
      toast({ title: "Stake failed", description: parseRevert(e).slice(0, 140), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const wrongChain = isConnected && chainId !== BASE_CHAIN_ID;

  return (
    <div className="container mx-auto max-w-[980px] px-4 py-6">
      <Seo title="GLTR Staking · GotchiCloset" description="Stake Aavegotchi LP tokens on Base and earn GLTR to speed up the Forge." canonical={siteUrl("/staking")} />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-fuchsia-500/15 via-purple-500/10 to-background p-5 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2"><Droplets className="w-6 h-6 text-primary" /> GLTR Staking</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[46ch]">Stake Aavegotchi LP tokens to earn GLTR, burn it in the <a href="/forge" className="underline underline-offset-2 hover:text-primary">Forge</a> to skip queue time.</p>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Emission</div>
              <div className="text-lg font-bold tabular-nums">{fmt(rewardPerBlock)} <span className="text-xs font-medium text-muted-foreground">GLTR/block</span></div>
            </div>
            {isConnected && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Your GLTR</div>
                <div className="text-lg font-bold tabular-nums text-primary">{fmt(gltrBal as bigint | undefined)}</div>
              </div>
            )}
          </div>
        </div>

        {isConnected && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <div className="text-xs">
              <span className="text-muted-foreground">Unclaimed:</span>{" "}
              <b className="tabular-nums text-emerald-500">{fmt(totalPending, 4)} GLTR</b>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Your rate:</span>{" "}
              <b className="tabular-nums">{fmt(yourPerBlock, 4)}/block</b>
            </div>
            <button
              onClick={doHarvestAll}
              disabled={busy || totalPending === 0n}
              className="ml-auto inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />} Claim all
            </button>
          </div>
        )}
        {!isConnected && (
          <div className="mt-4"><ConnectButton /></div>
        )}
        {wrongChain && <div className="mt-2 text-[11px] text-amber-500">Switch your wallet to Base to stake.</div>}
      </div>

      {/* Pools */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GLTR_POOLS.map((p, i) => {
          const perBlock = totalAlloc > 0n ? (rewardPerBlock * poolAlloc(i)) / totalAlloc : 0n;
          const weightPct = totalAlloc > 0n ? (Number(poolAlloc(i)) / Number(totalAlloc)) * 100 : 0;
          const open = action?.pid === p.pid ? action : null;
          const staked = depositedOf(i);
          const wallet = lpBalanceOf(i);
          const pend = pendingOf(i);
          return (
            <div key={p.pid} className="group rounded-2xl border border-border/40 bg-background/60 p-4 hover:border-primary/40 hover:shadow-lg transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary"><Sparkles className="w-4 h-4" /></span>
                  <div>
                    <div className="text-sm font-bold">{p.name}</div>
                    <a href={`https://basescan.org/token/${p.lp}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-0.5">
                      LP token <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold tabular-nums">{fmt(perBlock)} <span className="font-medium text-muted-foreground">GLTR/block</span></div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">{weightPct.toFixed(2)}% weight</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="rounded-lg bg-muted/30 py-1.5">
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Pool staked</div>
                  <div className="text-xs font-semibold tabular-nums">{fmt(poolStaked(i))}</div>
                </div>
                <div className="rounded-lg bg-muted/30 py-1.5">
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Your stake</div>
                  <div className="text-xs font-semibold tabular-nums">{fmt(staked, 4)}</div>
                </div>
                <div className="rounded-lg bg-muted/30 py-1.5">
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Pending</div>
                  <div className={`text-xs font-semibold tabular-nums ${pend > 0n ? "text-emerald-500" : ""}`}>{fmt(pend, 4)}</div>
                </div>
              </div>

              {isConnected && (
                <>
                  {open ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder={`LP amount (max ${fmt(open.kind === "stake" ? wallet : staked, 6)})`}
                        className="flex-1 min-w-0 h-8 rounded-lg border border-border bg-background px-2 text-xs"
                      />
                      <button
                        onClick={() => setAmount(((Number(open.kind === "stake" ? wallet : staked)) / 1e18).toString())}
                        className="h-8 px-2 rounded-lg border border-border/60 text-[10px] font-semibold text-muted-foreground hover:text-primary"
                      >
                        Max
                      </button>
                      <button
                        disabled={busy || toWei(amount) <= 0n}
                        onClick={() =>
                          open.kind === "stake"
                            ? doStake(p.pid, toWei(amount))
                            : run(() => writeContractAsync({ ...farm, functionName: "withdraw", args: [BigInt(p.pid), toWei(amount)] }), `Unstaked from ${p.name}`)
                        }
                        className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : open.kind === "stake" ? "Stake" : "Unstake"}
                      </button>
                      <button onClick={() => { setAction(null); setAmount(""); }} className="h-8 px-1.5 text-muted-foreground hover:text-foreground text-xs">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setAction({ pid: p.pid, kind: "stake" }); setAmount(""); }}
                        disabled={wallet === 0n}
                        title={wallet === 0n ? "No LP tokens in your wallet" : `Stake ${p.name} LP`}
                        className="flex-1 h-8 rounded-lg bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 disabled:opacity-40 inline-flex items-center justify-center gap-1"
                      >
                        <Lock className="w-3 h-3" /> Stake
                      </button>
                      <button
                        onClick={() => { setAction({ pid: p.pid, kind: "unstake" }); setAmount(""); }}
                        disabled={staked === 0n}
                        className="flex-1 h-8 rounded-lg border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 inline-flex items-center justify-center gap-1"
                      >
                        <Unlock className="w-3 h-3" /> Unstake
                      </button>
                      <button
                        onClick={() => run(() => writeContractAsync({ ...farm, functionName: "harvest", args: [BigInt(p.pid)] }), `Claimed GLTR from ${p.name}`)}
                        disabled={busy || pend === 0n}
                        className="flex-1 h-8 rounded-lg bg-emerald-600/15 text-emerald-500 text-xs font-bold hover:bg-emerald-600/25 disabled:opacity-40 inline-flex items-center justify-center gap-1"
                      >
                        <Gift className="w-3 h-3" /> Claim
                      </button>
                    </div>
                  )}
                  {wallet > 0n && !open && <div className="mt-1.5 text-[10px] text-muted-foreground">Wallet: {fmt(wallet, 6)} LP</div>}
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground text-center max-w-[62ch] mx-auto">
        Pools stake Aavegotchi AMM LP tokens on Base. GLTR earned here can be spent in the Forge to instantly finish smelt/forge queues.
      </p>
    </div>
  );
}
