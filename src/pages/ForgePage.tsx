import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { Flame, Loader2, Hammer, PackageOpen, Gem, Zap } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, FORGE_DIAMOND_BASE, FORGE_ABI, GEODE_RSM, GLTR_TOKEN_BASE, ERC20_ABI, MAX_UINT256 } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import wearablesData from "../../data/wearables.json";

const ITEM_BALANCES_ABI = [
  { name: "itemBalances", type: "function", stateMutability: "view", inputs: [{ name: "_account", type: "address" }], outputs: [{ type: "tuple[]", components: [{ name: "itemId", type: "uint256" }, { name: "balance", type: "uint256" }] }] },
] as const;

type WData = { id: number; name: string; category: number };
const WMAP = new Map<number, WData>((wearablesData as WData[]).map((w) => [w.id, w]));
const itemImg = (id: number) => `https://dapp.aavegotchi.com/brand/items/${id}.svg`;
const FORGE_ITEM_MIN = 1_000_000_000; // forge materials (alloy/cores/geodes/schematics) live above this

type QueueItem = { itemId: bigint; gotchiId: bigint; id: bigint; readyBlock: bigint; claimed: boolean };
type Bal = { tokenId: bigint; balance: bigint };

export default function ForgePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const [sel, setSel] = useState<Record<number, number>>({}); // wearableId -> qty to smelt
  const [busy, setBusy] = useState(false);

  // Smelting/forging is done BY a gotchi — the user picks which one acts.
  const { gotchis } = useGotchisByOwner(address?.toLowerCase() ?? "");
  // Exclude lent-out/locked gotchis — every forge/smelt path is onlyAavegotchiUnlocked and would revert.
  const myGotchis = useMemo(() => (gotchis ?? []).filter((g) => !(g as { lentOut?: boolean }).lentOut && Number((g as { lending?: number | null }).lending ?? 0) === 0).map((g) => ({ id: String(g.gotchiId ?? g.id), name: g.name })).filter((g) => /^\d+$/.test(g.id)), [gotchis]);
  const myGotchiIds = useMemo(() => new Set(myGotchis.map((g) => g.id)), [myGotchis]);
  const [actor, setActor] = useState<string>("");
  const actorId = actor || myGotchis[0]?.id || "";

  // Unequipped wallet wearables (smeltable). itemBalances on the Aavegotchi diamond
  // returns wallet balances; equipped wearables aren't included.
  const { data: wallet, refetch: refetchWallet } = useQuery({
    queryKey: ["forge-wallet-wearables", address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 30_000,
    queryFn: async () => {
      const res = (await publicClient!.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: ITEM_BALANCES_ABI, functionName: "itemBalances", args: [address as `0x${string}`] })) as unknown as { itemId: bigint; balance: bigint }[];
      return res.map((b) => ({ id: Number(b.itemId), bal: Number(b.balance) })).filter((b) => b.bal > 0 && WMAP.get(b.id)?.category === 0);
    },
  });

  // Geode token-id set (so we can tell geodes apart from alloy/cores).
  const { data: geodeIds } = useQuery({
    queryKey: ["forge-geode-ids"],
    enabled: !!publicClient,
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const set = new Set<number>();
      for (const rsm of GEODE_RSM) {
        try { set.add(Number(await publicClient!.readContract({ address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "geodeTokenIdFromRsm", args: [rsm] }))); } catch { /* some rsm have no geode */ }
      }
      return set;
    },
  });

  // All forge balances (schematics: id == wearable id; geodes; other materials).
  const { data: forgeBal, refetch: refetchForge } = useQuery({
    queryKey: ["forge-balances", address?.toLowerCase()],
    enabled: !!address && !!publicClient,
    staleTime: 30_000,
    queryFn: async () => {
      const res = (await publicClient!.readContract({ address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "balanceOfOwner", args: [address as `0x${string}`] })) as unknown as Bal[];
      return res.map((b) => ({ id: Number(b.tokenId), bal: Number(b.balance) })).filter((b) => b.bal > 0);
    },
  });
  const refetchMaterials = refetchForge;

  const schematics = useMemo(() => (forgeBal ?? []).filter((b) => b.id < FORGE_ITEM_MIN && WMAP.get(b.id)?.category === 0), [forgeBal]);
  const geodes = useMemo(() => (forgeBal ?? []).filter((b) => geodeIds?.has(b.id)), [forgeBal, geodeIds]);
  const materials = useMemo(() => (forgeBal ?? []).filter((b) => b.id >= FORGE_ITEM_MIN && !geodeIds?.has(b.id)), [forgeBal, geodeIds]);

  // Smith level per owned gotchi.
  const { data: smithLevels } = useReadContracts({
    contracts: myGotchis.map((g) => ({ address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "getAavegotchiSmithingLevel" as const, args: [BigInt(g.id)], chainId: BASE_CHAIN_ID })),
    query: { enabled: myGotchis.length > 0 },
  });
  const smithById = useMemo(() => {
    const m: Record<string, number> = {};
    myGotchis.forEach((g, i) => { const r = smithLevels?.[i]; if (r?.status === "success") m[g.id] = Number(r.result as bigint); });
    return m;
  }, [myGotchis, smithLevels]);

  // Global forge queue (items are keyed by the forging gotchi). Filter to the
  // user's gotchis client-side.
  const { data: queueRaw, refetch: refetchQueue } = useQuery({
    queryKey: ["forge-queue"],
    enabled: !!publicClient,
    staleTime: 20_000,
    queryFn: async () => {
      const [q, block] = await Promise.all([
        publicClient!.readContract({ address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "getForgeQueue" }) as unknown as Promise<readonly QueueItem[]>,
        publicClient!.getBlockNumber(),
      ]);
      const blk = Number(block);
      const items = q.map((x) => ({ gotchiId: x.gotchiId.toString(), itemId: Number(x.itemId), readyBlock: Number(x.readyBlock), ready: BigInt(x.readyBlock) <= block, claimed: x.claimed }));
      return { block: blk, items };
    },
  });

  const myQueue = useMemo(() => (queueRaw?.items ?? []).filter((x) => myGotchiIds.has(x.gotchiId) && !x.claimed), [queueRaw, myGotchiIds]);
  const readyGotchiIds = useMemo(() => [...new Set(myQueue.filter((q) => q.ready).map((q) => q.gotchiId))], [myQueue]);
  const forging = useMemo(() => myQueue.filter((q) => !q.ready).map((q) => ({ ...q, blocksLeft: Math.max(0, q.readyBlock - (queueRaw?.block ?? q.readyBlock)) })), [myQueue, queueRaw]);
  const selCount = Object.values(sel).reduce((s, n) => s + n, 0);

  const setQty = (id: number, qty: number, max: number) => setSel((s) => { const n = { ...s }; const v = Math.max(0, Math.min(qty, max)); if (v === 0) delete n[id]; else n[id] = v; return n; });

  const smelt = async () => {
    if (!publicClient || selCount === 0) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    if (!actorId) return toast({ title: "Select a gotchi to smelt with", variant: "destructive" });
    // smeltWearables takes parallel itemIds + gotchiIds (one gotchi per burned item).
    const itemIds: bigint[] = [];
    for (const id of Object.keys(sel).map(Number)) for (let k = 0; k < sel[id]; k++) itemIds.push(BigInt(id));
    const gotchiIds = itemIds.map(() => BigInt(actorId));
    const names = Object.keys(sel).map((id) => `${sel[Number(id)]}× ${WMAP.get(Number(id))?.name ?? `#${id}`}`).join(", ");
    if (!window.confirm(`Smelt ${names} using gotchi #${actorId}? This permanently burns these wearables for Forge materials (alloy). Irreversible.`)) return;
    setBusy(true);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "smeltWearables", args: [itemIds, gotchiIds] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Smelted", description: "Wearables smelted into Forge materials." });
      setSel({});
      refetchWallet(); refetchMaterials();
    } catch (e) {
      toast({ title: "Smelt failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const claim = async () => {
    if (!publicClient || readyGotchiIds.length === 0) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setBusy(true);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "claimForgeQueueItems", args: [readyGotchiIds.map((g) => BigInt(g))] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Claimed", description: `Claimed forged item(s) for ${readyGotchiIds.length} gotchi(s).` });
      refetchQueue(); refetchMaterials();
    } catch (e) {
      toast({ title: "Claim failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const run = async (label: string, fn: string, args: unknown[], onOk?: () => void) => {
    if (!publicClient) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    setBusy(true);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: fn as never, args: args as never });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: `${label} confirmed` });
      onOk?.();
    } catch (e) {
      toast({ title: `${label} failed`, description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const forge = (schematicId: number) => {
    if (!actorId) return toast({ title: "Select a gotchi to forge with", variant: "destructive" });
    const name = WMAP.get(schematicId)?.name ?? `#${schematicId}`;
    if (!window.confirm(`Forge ${name} using gotchi #${actorId}? This spends Forge materials (alloy/essence) and occupies the gotchi until ready.`)) return;
    run("Forge", "forgeWearables", [[BigInt(schematicId)], [BigInt(actorId)], [0]], () => { refetchForge(); refetchQueue(); });
  };
  const openGeode = (geodeId: number) => {
    if (!window.confirm("Open 1 geode? This triggers a VRF roll; come back and Claim winnings once it lands.")) return;
    run("Open geode", "openGeodes", [[BigInt(geodeId)], [1n]], () => refetchForge());
  };
  const claimWinnings = () => run("Claim winnings", "claimWinnings", [], () => refetchForge());

  // Burn GLTR to skip a forging gotchi's remaining queue blocks (1 GLTR/block).
  const speedUp = async (gotchiId: string, blocks: number) => {
    if (!publicClient || blocks <= 0) return;
    if (!isOnBase) return toast({ title: "Switch to Base", variant: "destructive" });
    const cost = BigInt(blocks) * 10n ** 18n; // 1 GLTR per block
    if (!window.confirm(`Speed up gotchi #${gotchiId} by ${blocks} blocks? Burns ~${blocks.toLocaleString()} GLTR.`)) return;
    setBusy(true);
    try {
      const allowance = (await publicClient.readContract({ address: GLTR_TOKEN_BASE, abi: ERC20_ABI, functionName: "allowance", args: [address as `0x${string}`, FORGE_DIAMOND_BASE] })) as bigint;
      if (allowance < cost) {
        const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GLTR_TOKEN_BASE, abi: ERC20_ABI, functionName: "approve", args: [FORGE_DIAMOND_BASE, MAX_UINT256] });
        await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
      }
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: FORGE_DIAMOND_BASE, abi: FORGE_ABI, functionName: "reduceQueueTime", args: [[BigInt(gotchiId)], [blocks]] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      toast({ title: "Sped up", description: `Reduced gotchi #${gotchiId} by ${blocks} blocks.` });
      refetchQueue();
    } catch (e) {
      toast({ title: "Speed up failed", description: parseRevert(e).slice(0, 160), variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!isConnected) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <Seo title="Forge — GotchiCloset" description="Smelt and forge Aavegotchi wearables." canonical={siteUrl("/forge")} />
        <Flame className="w-8 h-8 mx-auto mb-2 text-orange-500" />
        <p className="text-sm font-medium mb-3">Connect a wallet to use the Forge</p>
        <ConnectButton />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-[1100px] px-4 py-6">
      <Seo title="Forge — GotchiCloset" description="Smelt wearables into Forge materials and claim forged items." canonical={siteUrl("/forge")} />
      <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2 mb-1"><Flame className="w-6 h-6 text-orange-500" /> Forge</h1>
      <p className="text-sm text-muted-foreground mb-5">Smelt unequipped wearables into Forge materials, and claim items you've forged. All actions are signed in your wallet.</p>

      {myQueue.length > 0 && (
        <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className="font-semibold">{readyGotchiIds.length}</span> gotchi(s) ready to claim · <span className="text-muted-foreground">{myQueue.filter((q) => !q.ready).length} still forging</span>
          </div>
          <button disabled={busy || readyGotchiIds.length === 0} onClick={claim} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageOpen className="w-4 h-4" />} Claim ready
          </button>
        </div>
      )}

      {forging.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> Forging — speed up with GLTR</div>
          <div className="flex flex-wrap gap-2">
            {forging.map((f) => (
              <div key={`${f.gotchiId}-${f.itemId}`} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 flex items-center gap-2">
                <img src={itemImg(f.itemId)} alt={WMAP.get(f.itemId)?.name} className="w-8 h-8 object-contain" />
                <div className="text-[11px]">
                  <div className="font-medium">{WMAP.get(f.itemId)?.name ?? `#${f.itemId}`}</div>
                  <div className="text-muted-foreground">Gotchi #{f.gotchiId} · ~{f.blocksLeft.toLocaleString()} blocks left</div>
                </div>
                <button disabled={busy || f.blocksLeft <= 0} onClick={() => speedUp(f.gotchiId, f.blocksLeft)} className="h-7 px-2.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-[11px] font-semibold disabled:opacity-50 inline-flex items-center gap-1"><Zap className="w-3 h-3" /> Finish (~{f.blocksLeft.toLocaleString()} GLTR)</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gotchi selector — smelting/forging is performed by a gotchi */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Forge with gotchi</span>
        {myGotchis.length === 0 ? (
          <span className="text-xs text-muted-foreground">You need a gotchi to smelt or forge.</span>
        ) : (
          <select value={actorId} onChange={(e) => setActor(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
            {myGotchis.map((g) => <option key={g.id} value={g.id}>#{g.id}{g.name ? ` · ${g.name}` : ""}{smithById[g.id] != null ? ` · Smith Lv ${smithById[g.id]}` : ""}</option>)}
          </select>
        )}
        {actorId && smithById[actorId] != null && (
          <span className="text-[11px] rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 font-semibold">Smithing Level {smithById[actorId]}</span>
        )}
      </div>

      <div className="mb-6">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5"><Hammer className="w-4 h-4" /> Smelt wearables</div>
        {!wallet ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : wallet.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center rounded-lg border border-border/40">No unequipped wearables in your wallet to smelt.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {wallet.map((w) => {
              const picked = sel[w.id] ?? 0;
              return (
                <div key={w.id} className={`rounded-lg border p-2 ${picked ? "border-orange-500 ring-1 ring-orange-500/40 bg-orange-500/5" : "border-border/40"}`}>
                  <span className="block aspect-square rounded bg-muted/30 flex items-center justify-center"><img src={itemImg(w.id)} alt={WMAP.get(w.id)?.name} className="max-w-[80%] max-h-[80%] object-contain" /></span>
                  <div className="mt-1 text-[10px] font-medium truncate text-center" title={WMAP.get(w.id)?.name}>{WMAP.get(w.id)?.name ?? `#${w.id}`}</div>
                  <div className="text-[9px] text-muted-foreground text-center">owned ×{w.bal}</div>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <button onClick={() => setQty(w.id, picked - 1, w.bal)} className="w-5 h-5 rounded bg-muted text-xs disabled:opacity-40" disabled={picked === 0}>−</button>
                    <span className="text-[11px] w-5 text-center tabular-nums">{picked}</span>
                    <button onClick={() => setQty(w.id, picked + 1, w.bal)} className="w-5 h-5 rounded bg-muted text-xs disabled:opacity-40" disabled={picked >= w.bal}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Forge new wearables from schematics */}
      <div className="mb-6">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5"><Hammer className="w-4 h-4 text-violet-500" /> Forge from schematics</div>
        {schematics.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-border/40">No schematics yet — win them from geodes, then forge them into wearables here.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {schematics.map((s) => (
              <div key={s.id} className="rounded-lg border border-border/40 p-2">
                <span className="block aspect-square rounded bg-muted/30 flex items-center justify-center"><img src={itemImg(s.id)} alt={WMAP.get(s.id)?.name} className="max-w-[80%] max-h-[80%] object-contain" /></span>
                <div className="mt-1 text-[10px] font-medium truncate text-center" title={WMAP.get(s.id)?.name}>{WMAP.get(s.id)?.name ?? `#${s.id}`}</div>
                <div className="text-[9px] text-muted-foreground text-center">schematics ×{s.bal}</div>
                <button disabled={busy || !actorId} onClick={() => forge(s.id)} className="mt-1 h-7 w-full rounded bg-violet-500/15 text-violet-600 border border-violet-500/30 text-[11px] font-semibold disabled:opacity-50">Forge</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Geodes */}
      {geodes.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center justify-between gap-1.5">
            <span className="inline-flex items-center gap-1.5"><Gem className="w-4 h-4 text-sky-400" /> Geodes</span>
            <button disabled={busy} onClick={claimWinnings} className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-sky-500/40 text-sky-600 dark:text-sky-400 text-[11px] font-semibold hover:bg-sky-500/10 disabled:opacity-50"><Zap className="w-3 h-3" /> Claim winnings</button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {geodes.map((g) => (
              <div key={g.id} className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2 flex flex-col items-center text-center">
                <Gem className="w-9 h-9 text-sky-400 my-1" />
                <div className="text-[9px] text-muted-foreground">Geode ×{g.bal}</div>
                <button disabled={busy} onClick={() => openGeode(g.id)} className="mt-1 h-7 w-full rounded bg-sky-600 text-white text-[11px] font-semibold disabled:opacity-50">Open</button>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Opening rolls a VRF prize. After it lands, hit "Claim winnings" to receive the prize.</p>
        </div>
      )}

      <div className="mb-6">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 inline-flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" /> Forge materials</div>
        {!forgeBal ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : materials.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-border/40">No forge materials yet — smelt wearables to earn Alloy, Schematics, Cores & Geodes.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {materials.map((m) => {
              const d = m.id - FORGE_ITEM_MIN;
              const label = m.id < FORGE_ITEM_MIN ? `Schematic #${m.id}` : d === 0 ? "Alloy" : d === 1 ? "Essence" : d <= 7 ? `Geode #${d - 1}` : `Core #${d - 7}`;
              return (
                <div key={m.id} className="rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-center">
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                  <div className="text-base font-bold tabular-nums">{m.bal.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selCount > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-border bg-background/95 backdrop-blur px-4 py-2 shadow-lg">
          <span className="text-xs"><span className="font-semibold">{selCount}</span> wearable(s) to smelt</span>
          <button disabled={busy} onClick={smelt} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-orange-600 text-white text-xs font-semibold disabled:opacity-50">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Smelting…</> : <><Flame className="w-4 h-4" /> Smelt</>}
          </button>
          <button onClick={() => setSel({})} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}
    </div>
  );
}
