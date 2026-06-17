import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useChainId, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { Heart, Pencil, Sparkles, Send, Flame, Loader2, Tag, X, CheckCircle2, XCircle, Shirt, Wallet, RotateCcw, Clock } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE, CORE_SUBGRAPH_URL, BAAZAAR_CATEGORY, ESCROW_FACET_ABI, GHST_TOKEN_BASE, LENDING_FACET_ABI } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { EquipWearablesModal } from "@/components/explorer/EquipWearablesModal";
import { useBatchTransferEscrow, type EscrowBalance } from "@/hooks/useEscrowWithdraw";

const ACTIONS_ABI = [
  { name: "interact", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenIds", type: "uint256[]" }], outputs: [] },
  { name: "setAavegotchiName", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_name", type: "string" }], outputs: [] },
  { name: "spendSkillPoints", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_values", type: "int16[4]" }], outputs: [] },
  { name: "decreaseAndDestroy", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint256" }, { name: "_toId", type: "uint256" }], outputs: [] },
  { name: "safeTransferFrom", type: "function", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { name: "addERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_erc721TokenAddress", type: "address" }, { name: "_erc721TokenId", type: "uint256" }, { name: "_priceInWei", type: "uint256" }], outputs: [] },
  { name: "cancelERC721Listing", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_listingId", type: "uint256" }], outputs: [] },
  // Respec: resets the gotchi's traits to base and refunds all spent skill
  // points. First respec per gotchi is free; subsequent ones charge a fee
  // enforced by the contract. Token id is uint32 here (matches the diamond).
  { name: "resetSkillPoints", type: "function", stateMutability: "nonpayable", inputs: [{ name: "_tokenId", type: "uint32" }], outputs: [] },
] as const;

const RESPEC_COUNT_ABI = [
  { name: "respecCount", type: "function", stateMutability: "view", inputs: [{ name: "_tokenId", type: "uint32" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export type ManageGotchi = {
  gotchiId: string;
  name?: string;
  hauntId?: number;
  collateral?: string;
  numericTraits?: number[];
  equippedWearables?: number[];
};

const TRAITS = ["NRG", "AGG", "SPK", "BRN"] as const;
type Status = { kind: "idle" } | { kind: "busy"; label: string } | { kind: "ok"; label: string } | { kind: "err"; label: string };

/** Large, controlled modal to view + manage a gotchi (opened from the profile). */
export function GotchiManageModal({ gotchi, onClose }: { gotchi: ManageGotchi; onClose: () => void }) {
  const { gotchiId, name, hauntId, collateral, numericTraits, equippedWearables } = gotchi;
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
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</div>
      {children}
    </div>
  );
  const field = "h-9 flex-1 min-w-0 rounded border border-border bg-background px-2.5 text-sm";
  const goBtn = "h-9 px-4 rounded bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 shrink-0";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="w-[min(560px,96vw)] max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background z-10">
          <div className="text-base font-bold">Manage Gotchi #{gotchiId}{name ? ` · ${name}` : ""}</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted/50"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-4">
            <span className="w-28 h-28 rounded-lg bg-muted/40 overflow-hidden shrink-0">
              <GotchiSvg gotchiId={gotchiId} hauntId={hauntId} collateral={collateral} numericTraits={numericTraits} equippedWearables={equippedWearables} mode="preview" useBlobUrl className="w-full h-full object-contain" />
            </span>
            <div className="text-sm text-muted-foreground">
              Every action is signed in your wallet. You must own this gotchi and it must be unlocked, or the action reverts.
            </div>
          </div>

          <button onClick={() => setEquipOpen(true)} className="w-full h-10 rounded-lg bg-primary/10 border border-primary/40 text-primary text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-primary/20">
            <Shirt className="w-4 h-4" /> Equip / change wearables
          </button>

          {status.kind !== "idle" && (
            <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
              status.kind === "busy" ? "bg-muted/50 text-foreground" : status.kind === "ok" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-500"
            }`}>
              {status.kind === "busy" ? <Loader2 className="w-4 h-4 animate-spin" /> : status.kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {status.label}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Section icon={<Heart className="w-4 h-4 text-rose-500" />} title="Pet (kinship)">
              <button disabled={busy} onClick={() => run("Pet", "interact", [[id]])} className="h-9 w-full rounded bg-rose-500/15 text-rose-500 border border-rose-500/30 text-sm font-semibold disabled:opacity-50">Pet now</button>
            </Section>

            <Section icon={<Pencil className="w-4 h-4" />} title="Rename">
              <div className="flex items-center gap-1.5">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New name" className={field} />
                <button disabled={busy || !newName.trim()} onClick={() => run("Rename", "setAavegotchiName", [id, newName.trim()])} className={goBtn}>Save</button>
              </div>
            </Section>

            <Section icon={<Sparkles className="w-4 h-4 text-amber-500" />} title="Spend skill points">
              <div className="grid grid-cols-4 gap-1.5">
                {TRAITS.map((t, i) => (
                  <label key={t} className="text-[11px] text-muted-foreground">
                    {t}
                    <input type="number" value={sp[i]} onChange={(e) => setSp((p) => { const n = [...p] as typeof p; n[i] = e.target.value; return n; })} className="h-8 w-full rounded border border-border bg-background px-1.5 text-sm" />
                  </label>
                ))}
              </div>
              <button disabled={busy} onClick={() => run("Spend skill points", "spendSkillPoints", [id, sp.map((v) => Math.trunc(Number(v) || 0))])} className="h-9 w-full rounded bg-amber-500/15 text-amber-600 border border-amber-500/30 text-sm font-semibold disabled:opacity-50">Spend</button>
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

            <Section icon={<Tag className="w-4 h-4 text-emerald-500" />} title="List for sale">
              <div className="flex items-center gap-1.5">
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (GHST)" className={field} />
                <button disabled={busy || !(Number(price) > 0)} onClick={() => run("List", "addERC721Listing", [AAVEGOTCHI_DIAMOND_BASE, id, BigInt(Math.floor(Number(price) * 1e18))])} className={`${goBtn} bg-emerald-600`}>List</button>
              </div>
              <button disabled={busy} onClick={cancelListing} className="h-8 w-full rounded border border-border/60 text-xs font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50">Cancel my listing</button>
            </Section>

            <Section icon={<Wallet className="w-4 h-4 text-sky-500" />} title="Pocket (escrow)">
              <PocketBody gotchiId={gotchiId} />
            </Section>

            <EndRentalBody gotchiId={gotchiId} />

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
