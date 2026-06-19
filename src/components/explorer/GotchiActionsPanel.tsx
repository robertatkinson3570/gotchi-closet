import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { Heart, Pencil, Sparkles, Send, Flame, Loader2, Tag, X, CheckCircle2, XCircle, Shirt, Wallet, RotateCcw, Clock, Lock, FlaskConical } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, CORE_SUBGRAPH_URL, BAAZAAR_CATEGORY, ESCROW_FACET_ABI, GHST_TOKEN_BASE, LENDING_FACET_ABI } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { EquipWearablesModal } from "@/components/explorer/EquipWearablesModal";
import { UseConsumablesBody } from "@/components/explorer/UseConsumablesBody";
import { useBatchTransferEscrow, type EscrowBalance } from "@/hooks/useEscrowWithdraw";

const ACTIONS_ABI = [
  { name: "interact", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenIds", type: "uint256[]" }], outputs: [] },
  { name: "setAavegotchiName", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_name", type: "string" }], outputs: [] },
  { name: "spendSkillPoints", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_values", type: "int16[4]" }], outputs: [] },
  { name: "decreaseAndDestroy", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_toId", type: "uint256" }], outputs: [] },
  { name: "safeTransferFrom", type: "function", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { name: "addERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_erc721TokenAddress", type: "address" }, { name: "_erc721TokenId", type: "uint256" }, { name: "_category", type: "uint256" }, { name: "_priceInWei", type: "uint256" }], outputs: [] },
  { name: "cancelERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_listingId", type: "uint256" }], outputs: [] },
  // Respec: resets the gotchi's traits to base and refunds all spent skill
  // points. First respec per gotchi is free; subsequent ones charge a fee
  // enforced by the contract. Token id is uint32 here (matches the diamond).
  { name: "resetSkillPoints", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint32" }], outputs: [] },
] as const;

const RESPEC_COUNT_ABI = [
  { name: "respecCount", type: "function", stateMutability: "view", inputs: [{ name: "_tokenId", type: "uint32" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

// Skill points available to spend (AavegotchiGameFacet). Verified on Base.
const AVAILABLE_SP_ABI = [
  { name: "availableSkillPoints", type: "function", stateMutability: "view", inputs: [{ name: "_tokenId", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

// Pet (interact) cooldown: 12h.
const PET_COOLDOWN = 43200;

const ghstFmt = (wei?: string) => (wei ? (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0");
function fmtCountdown(sec: number): string {
  if (sec <= 0) return "now";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

export type ManageGotchi = {
  gotchiId: string;
  name?: string;
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  equippedWearables?: number[];
  /** Rented out or borrowed — only petting is allowed; other actions revert. */
  locked?: boolean;
  lockReason?: string;
  /** Listed for sale — only petting + editing the listing are allowed. */
  listed?: boolean;
};

const TRAITS = ["NRG", "AGG", "SPK", "BRN"] as const;
type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "ok"; label: string } | { kind: "err"; label: string };

/** Large, controlled modal to view + manage a gotchi (opened from the profile). */
export function GotchiManageModal({ gotchi, onClose }: { gotchi: ManageGotchi; onClose: () => void }) {
  const { gotchiId, name, hauntId, collateral, numericTraits, equippedWearables, locked, lockReason, listed } = gotchi;
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [equipOpen, setEquipOpen] = useState(false);
  const [newName, setNewName] = useState(name ?? "");
  const [sp, setSp] = useState<[string, string, string, string]>(["0", "0", "0", "0"]);
  const [to, setTo] = useState("");
  const [price, setPrice] = useState("");
  const [sacrificeTo, setSacrificeTo] = useState("");

  const id = BigInt(gotchiId);
  const busy = status.kind === "busy";

  const { data: respecCountData } = useReadContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: RESPEC_COUNT_ABI, functionName: "respecCount", args: [Number(gotchiId)], chainId: BASE_CHAIN_ID });
  const respecCount = respecCountData != null ? Number(respecCountData) : null;

  // Available skill points to spend (gate the Spend action + show the count).
  const { data: availPtsData } = useReadContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: AVAILABLE_SP_ABI, functionName: "availableSkillPoints", args: [BigInt(gotchiId)], chainId: BASE_CHAIN_ID });
  const availablePoints = availPtsData != null ? Number(availPtsData) : null;

  // Live gotchi detail + listing/offer state (rarity, kinship, level, last pet, listed price, top offer).
  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["manage-gotchi-detail", gotchiId],
    staleTime: 30_000,
    queryFn: async () => {
      const q = `{ aavegotchi(id:"${gotchiId}"){ hauntId level experience kinship baseRarityScore withSetsRarityScore equippedSetName lastInteracted }
        listing: erc721Listings(first:1, where:{ tokenId:"${gotchiId}", category:3, cancelled:false, timePurchased:"0" }){ id priceInWei }
        offer: erc721BuyOrders(first:1, where:{ erc721TokenId:"${gotchiId}", category:3, canceled:false }, orderBy:priceInWei, orderDirection:desc){ priceInWei } }`;
      const res = await fetch(CORE_SUBGRAPH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await res.json();
      return j.data ?? null;
    },
  });
  const ag = detail?.aavegotchi;
  const activeListing = detail?.listing?.[0] as { id: string; priceInWei: string } | undefined;
  const topOfferWei = detail?.offer?.[0]?.priceInWei as string | undefined;

  // Pet cooldown countdown (ticks every 30s).
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000); return () => clearInterval(t); }, []);
  const lastInteracted = ag ? Number(ag.lastInteracted) : 0;
  const nextPet = lastInteracted + PET_COOLDOWN;
  const petReady = !lastInteracted || nowSec >= nextPet;
  const spSum = sp.reduce((s, v) => s + Math.max(0, Math.trunc(Number(v) || 0)), 0);

  const run = async (label: string, functionName: string, args: any[]) => {
    if (!isConnected || !address || !publicClient) return setStatus({ kind: "err", label: "Connect your wallet first" });
    if (!isOnBase) return setStatus({ kind: "err", label: "Switch to Base" });
    setStatus({ kind: "busy", label: `${label}…` });
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: ACTIONS_ABI, functionName: functionName as any, args: args as any });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setStatus({ kind: "ok", label: `${label} confirmed` });
    } catch (e) {
      setStatus({ kind: "err", label: parseRevert(e).slice(0, 140) });
    }
  };

  const cancelListing = async () => {
    if (!isConnected || !address) return setStatus({ kind: "err", label: "Connect your wallet first" });
    setStatus({ kind: "busy", label: "Finding your listing…" });
    try {
      const q = `query($t:String!,$s:String!){ erc721Listings(first:1, where:{ tokenId:$t, seller:$s, category:${BAAZAAR_CATEGORY.AAVEGOTCHI}, cancelled:false, timePurchased:"0" }){ id } }`;
      const res = await fetch(CORE_SUBGRAPH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, variables: { t: gotchiId, s: address.toLowerCase() } }) });
      const json = await res.json();
      const lid = json.data?.erc721Listings?.[0]?.id;
      if (!lid) return setStatus({ kind: "err", label: "No open listing found for this gotchi" });
      await run("Cancel listing", "cancelERC721Listing", [BigInt(lid)]);
    } catch (e) {
      setStatus({ kind: "err", label: parseRevert(e).slice(0, 140) });
    }
  };

  const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="rounded-xl border border-border/50 bg-gradient-to-b from-muted/25 to-transparent p-3 space-y-2 transition-colors hover:border-border">
      <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-background/70 border border-border/50">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
  const field = "h-9 flex-1 min-w-0 rounded-lg border border-border bg-background px-2.5 text-sm focus:ring-1 focus:ring-primary/40 outline-none";
  const goBtn = "h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 shrink-0 hover:brightness-110";
  const Stat = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-bold truncate" title={typeof value === "string" ? value : undefined}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={onClose}>
      <div className="w-[min(620px,96vw)] max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-primary/10" onClick={(e) => e.stopPropagation()}>
        {/* Hero header */}
        <div className="relative overflow-hidden border-b border-border/60">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-fuchsia-500/10 to-transparent" />
          <button onClick={onClose} className="absolute right-3 top-3 z-10 p-1.5 rounded-lg bg-black/25 hover:bg-black/45 text-white"><X className="w-5 h-5" /></button>
          <div className="relative flex items-center gap-4 p-4">
            <span className="w-24 h-24 rounded-xl bg-black/20 overflow-hidden shrink-0 ring-2 ring-white/15 shadow-lg">
              <GotchiSvg gotchiId={gotchiId} hauntId={hauntId} collateral={collateral} numericTraits={numericTraits} equippedWearables={equippedWearables} mode="preview" useBlobUrl className="w-full h-full object-contain" />
            </span>
            <div className="min-w-0">
              <div className="text-xl font-bold tracking-tight truncate">{name || "Unnamed"}</div>
              <div className="text-xs text-muted-foreground font-mono">Gotchi #{gotchiId}</div>
              {locked && (
                <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/90 text-white"><Lock className="w-3 h-3" /> {lockReason || "Rented"}</span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {locked && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-700 dark:text-amber-300">
              This gotchi is {(lockReason || "rented").toLowerCase()} — only <span className="font-semibold">petting</span> is available right now. Channel &amp; claim its alchemica from <span className="font-semibold">Land Management</span>. Other actions unlock when the rental ends.
            </div>
          )}

          {!locked && !listed && (
            <button onClick={() => setEquipOpen(true)} className="w-full h-11 rounded-xl bg-gradient-to-r from-primary/20 to-fuchsia-500/20 border border-primary/40 text-primary text-sm font-bold inline-flex items-center justify-center gap-2 hover:from-primary/30 hover:to-fuchsia-500/30 transition-colors">
              <Shirt className="w-4 h-4" /> Equip / change wearables
            </button>
          )}

          {listed && !locked && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-[12px] text-emerald-700 dark:text-emerald-400">
              This gotchi is <span className="font-semibold">listed for sale</span> — only <span className="font-semibold">petting</span> and editing the listing are available. Cancel the listing to unlock other actions.
            </div>
          )}

          {status.kind !== "idle" && (
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
              status.kind === "busy" ? "bg-muted/50 text-foreground" : status.kind === "ok" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-500"
            }`}>
              {status.kind === "busy" ? <Loader2 className="w-4 h-4 animate-spin" /> : status.kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {status.label}
            </div>
          )}

          {ag && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              <Stat label="Rarity" value={`${ag.withSetsRarityScore}`} sub={`base ${ag.baseRarityScore}`} />
              <Stat label="Kinship" value={`${ag.kinship}`} />
              <Stat label="Level" value={`${ag.level}`} sub={`${Number(ag.experience).toLocaleString()} XP`} />
              <Stat label="Haunt" value={`H${ag.hauntId}`} />
              {ag.equippedSetName ? <Stat label="Set" value={ag.equippedSetName} /> : null}
              {topOfferWei ? <Stat label="Top offer" value={ghstFmt(topOfferWei)} sub="GHST" /> : null}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Section icon={<Heart className="w-4 h-4 text-rose-500" />} title="Pet (kinship)">
              <button disabled={busy || !petReady} onClick={async () => { await run("Pet", "interact", [[id]]); refetchDetail(); }} className="h-9 w-full rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/30 text-sm font-semibold disabled:opacity-50 hover:bg-rose-500/25">{petReady ? "Pet now" : "On cooldown"}</button>
              <div className={`text-[10px] text-center ${petReady ? "text-emerald-500" : "text-muted-foreground"}`}>
                {petReady ? "Ready to pet" : `Next pet in ${fmtCountdown(nextPet - nowSec)}`}
                {lastInteracted > 0 && ` · last pet ${fmtCountdown(nowSec - lastInteracted)} ago`}
              </div>
            </Section>

            <EndRentalBody gotchiId={gotchiId} />

            {!locked && (<>
            {!listed && (<>
            <Section icon={<Pencil className="w-4 h-4" />} title="Rename">
              <div className="flex items-center gap-1.5">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New name" className={field} />
                <button disabled={busy || !newName.trim()} onClick={() => run("Rename", "setAavegotchiName", [id, newName.trim()])} className={goBtn}>Save</button>
              </div>
            </Section>

            <Section icon={<Sparkles className="w-4 h-4 text-amber-500" />} title="Spend skill points">
              <div className="text-[11px] mb-0.5">
                <span className={availablePoints ? "text-amber-500 font-semibold" : "text-muted-foreground"}>{availablePoints ?? "…"} point{availablePoints === 1 ? "" : "s"} to spend</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {TRAITS.map((t, i) => (
                  <label key={t} className="text-[11px] text-muted-foreground">
                    {t}
                    <input type="number" disabled={!availablePoints} value={sp[i]} onChange={(e) => setSp((p) => { const n = [...p] as typeof p; n[i] = e.target.value; return n; })} className="h-8 w-full rounded border border-border bg-background px-1.5 text-sm disabled:opacity-50" />
                  </label>
                ))}
              </div>
              <button disabled={busy || !availablePoints || spSum <= 0 || spSum > (availablePoints || 0)} onClick={async () => { await run("Spend skill points", "spendSkillPoints", [id, sp.map((v) => Math.trunc(Number(v) || 0))]); refetchDetail(); }} className="h-9 w-full rounded bg-amber-500/15 text-amber-600 border border-amber-500/30 text-sm font-semibold disabled:opacity-50">
                {!availablePoints ? "No points to spend" : spSum > (availablePoints || 0) ? `Only ${availablePoints} available` : "Spend"}
              </button>
            </Section>

            <Section icon={<RotateCcw className="w-4 h-4 text-violet-500" />} title="Respec (reset skill points)">
              <p className="text-[11px] text-muted-foreground">
                Resets traits to base and refunds all spent skill points.
                {respecCount != null && <> Respecs performed: <span className="font-semibold text-foreground">{respecCount}</span>.</>}{" "}
                {respecCount === 0 ? "First respec is free." : "A fee applies (enforced by the contract)."}
              </p>
              <button
                disabled={busy}
                onClick={() => { if (window.confirm(`Respec gotchi #${gotchiId}? This resets its traits to base values and refunds all spent skill points${respecCount && respecCount > 0 ? " (a fee applies)" : " (first respec is free)"}.`)) run("Respec", "resetSkillPoints", [Number(gotchiId)]); }}
                className="h-9 w-full rounded bg-violet-500/15 text-violet-600 border border-violet-500/30 text-sm font-semibold disabled:opacity-50"
              >
                Respec gotchi
              </button>
            </Section>
            </>)}

            <Section icon={<Tag className="w-4 h-4 text-emerald-500" />} title="List for sale">
              {activeListing && (
                <div className="text-[12px] text-emerald-600 dark:text-emerald-400">Currently listed for <span className="font-semibold">{ghstFmt(activeListing.priceInWei)} GHST</span></div>
              )}
              <div className="flex items-center gap-1.5">
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={activeListing ? "New price (GHST)" : "Price (GHST)"} className={field} />
                <button disabled={busy || !(Number(price) > 0)} onClick={async () => { await run(activeListing ? "Update listing" : "List", "addERC721Listing", [AAVEGOTCHI_DIAMOND_BASE, id, 3n, BigInt(Math.floor(Number(price) * 1e18))]); refetchDetail(); }} className={`${goBtn} bg-emerald-600`}>{activeListing ? "Update" : "List"}</button>
              </div>
              {activeListing && (
                <button disabled={busy} onClick={async () => { await cancelListing(); refetchDetail(); }} className="h-8 w-full rounded border border-border/60 text-xs font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50">Cancel my listing</button>
              )}
            </Section>

            <Section icon={<FlaskConical className="w-4 h-4 text-cyan-500" />} title="Use item (consumables)">
              <UseConsumablesBody gotchiId={gotchiId} />
            </Section>

            {!listed && (<>
            <Section icon={<Wallet className="w-4 h-4 text-sky-500" />} title="Pocket (escrow)">
              <PocketBody gotchiId={gotchiId} />
            </Section>

            <Section icon={<Send className="w-4 h-4" />} title="Transfer">
              <div className="flex items-center gap-1.5">
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x recipient address" className={field} />
                <button disabled={busy || !/^0x[a-fA-F0-9]{40}$/.test(to)} onClick={() => run("Transfer", "safeTransferFrom", [address as `0x${string}`, to as `0x${string}`, id])} className={goBtn}>Send</button>
              </div>
            </Section>

            <Section icon={<Flame className="w-4 h-4 text-red-500" />} title="Sacrifice (irreversible)">
              <p className="text-[11px] text-muted-foreground">Destroys this gotchi, returns its staked collateral, and transfers its XP to another gotchi you choose.</p>
              <div className="flex items-center gap-1.5">
                <input type="number" value={sacrificeTo} onChange={(e) => setSacrificeTo(e.target.value)} placeholder="Transfer XP to gotchi #" className={field} />
              </div>
              <button
                disabled={busy || !/^\d+$/.test(sacrificeTo.trim())}
                onClick={() => { const toId = sacrificeTo.trim(); if (/^\d+$/.test(toId) && window.confirm(`Sacrifice gotchi #${gotchiId}? IRREVERSIBLE — destroys it, returns staked collateral, and sends its XP to gotchi #${toId}.`)) run("Sacrifice", "decreaseAndDestroy", [id, BigInt(toId)]); }}
                className="h-9 w-full rounded bg-red-500/15 text-red-500 border border-red-500/40 text-sm font-semibold disabled:opacity-50"
              >
                Sacrifice gotchi
              </button>
            </Section>
            </>)}
            </>)}
          </div>
        </div>
      </div>

      {equipOpen && (
        <EquipWearablesModal
          gotchiId={gotchiId}
          equippedWearables={equippedWearables}
          hauntId={hauntId}
          collateral={collateral}
          numericTraits={numericTraits}
          onClose={() => setEquipOpen(false)}
        />
      )}
    </div>
  );
}

// A gotchi's escrow ("pocket") holds GHST — show that, not alchemica.
const POCKET_TOKENS = [{ symbol: "GHST", address: GHST_TOKEN_BASE }];

// Each gotchi has a per-token escrow ("pocket"); the owner can sweep its ERC20s
// to their wallet (must be unlocked / not actively rented). Reuses the lending
// batchTransferEscrow path.
function PocketBody({ gotchiId }: { gotchiId: string }) {
  const { address } = useAccount();
  const { data, isLoading } = useReadContracts({
    contracts: POCKET_TOKENS.map((t) => ({ address: AAVEGOTCHI_DIAMOND_BASE, abi: ESCROW_FACET_ABI, functionName: "escrowBalance" as const, args: [BigInt(gotchiId), t.address as `0x${string}`], chainId: BASE_CHAIN_ID })),
    query: { enabled: !!gotchiId },
  });
  const rows = useMemo<EscrowBalance[]>(() => {
    if (!data) return [];
    return POCKET_TOKENS
      .map((t, i) => ({ tokenId: Number(gotchiId), erc20: t.address as `0x${string}`, symbol: t.symbol, amount: data[i]?.status === "success" ? (data[i].result as bigint) : 0n }))
      .filter((r) => r.amount > 0n);
  }, [data, gotchiId]);
  const { send, step, errorMsg } = useBatchTransferEscrow();
  const busy = step === "submitting" || step === "confirming";
  const fmt = (a: bigint) => (Number(a) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (isLoading) return <div className="text-xs text-muted-foreground">Loading pocket…</div>;
  if (rows.length === 0) return <div className="text-xs text-muted-foreground">Pocket is empty.</div>;
  return (
    <>
      <div className="space-y-1 text-xs">
        {rows.map((r) => (
          <div key={r.symbol} className="flex justify-between"><span className="text-muted-foreground">{r.symbol}</span><span className="font-semibold tabular-nums">{fmt(r.amount)}</span></div>
        ))}
      </div>
      <button disabled={busy || !address} onClick={() => address && send(rows, address)} className="h-9 w-full rounded bg-sky-500/15 text-sky-600 border border-sky-500/30 text-sm font-semibold disabled:opacity-50">
        {busy ? "Withdrawing…" : "Withdraw all to my wallet"}
      </button>
      {step === "success" && <div className="text-[11px] text-emerald-500">Withdrawn to your wallet.</div>}
      {step === "error" && <div className="text-[11px] text-red-500">{errorMsg?.slice(0, 120)}</div>}
    </>
  );
}

// Shows an "End rental" action when the gotchi is actively rented out. The
// rental can be ended (claim final split + free the gotchi) once the agreed
// period has elapsed.
function EndRentalBody({ gotchiId }: { gotchiId: string }) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);

  const { data: lending } = useQuery({
    queryKey: ["gotchi-active-lending", gotchiId],
    staleTime: 30_000,
    queryFn: async () => {
      const q = `{ gotchiLendings(first:1, where:{ gotchiTokenId:"${gotchiId}", completed:false, cancelled:false }){ timeAgreed period borrower } }`;
      const res = await fetch(CORE_SUBGRAPH_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await res.json();
      return j.data?.gotchiLendings?.[0] ?? null;
    },
  });

  const timeAgreed = Number(lending?.timeAgreed ?? 0);
  if (!lending || timeAgreed === 0) return null; // not actively rented

  const endTs = timeAgreed + Number(lending.period ?? 0);
  const now = Math.floor(Date.now() / 1000);
  const expired = now >= endTs;
  const endDate = new Date(endTs * 1000).toLocaleString();

  const endRental = async () => {
    if (!publicClient) return;
    setBusy(true); setMsg(null);
    try {
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: AAVEGOTCHI_DIAMOND_BASE, abi: LENDING_FACET_ABI, functionName: "claimAndEndGotchiLending", args: [Number(gotchiId)] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setMsg({ ok: true, text: "Rental ended and final split claimed." });
    } catch (e) {
      setMsg({ text: parseRevert(e).slice(0, 140) });
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-amber-500/40 p-3 space-y-2 sm:col-span-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold"><Clock className="w-4 h-4 text-amber-500" /> Rented out</div>
      <p className="text-[11px] text-muted-foreground">{expired ? `Rental period ended ${endDate}. You can end it now to reclaim your gotchi and the final revenue split.` : `Rented until ${endDate}. You can end it once the period elapses.`}</p>
      <button disabled={busy || !expired || !address} onClick={endRental} className="h-9 w-full rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 text-sm font-semibold disabled:opacity-50">
        {busy ? "Ending…" : expired ? "End rental" : "Rental still active"}
      </button>
      {msg && <div className={`text-[11px] ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}
    </div>
  );
}
