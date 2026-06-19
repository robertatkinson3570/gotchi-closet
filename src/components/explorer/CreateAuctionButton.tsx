import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Gavel, CheckCircle2, X } from "lucide-react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { GBM_DIAMOND_BASE } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";

type Props = {
  kind: "erc721" | "erc1155";
  /** GBM auction category: 3 for gotchis, 4 for everything else (verified on Base). */
  category: number;
  tokenId: string;
  /** Token contract that holds the asset (gotchi diamond, realm, tiles, …). */
  contractAddress: `0x${string}`;
  label: string;
  /** Max quantity for erc1155 (1 for erc721). */
  maxQuantity?: number;
  preview?: React.ReactNode;
  className?: string;
  compact?: boolean;
  /** Called after a successful auction creation (e.g. to refetch owned lists). */
  onCreated?: () => void;
};

// GBM tokenKind markers (verified from live Base createAuction txs).
const TOKEN_KIND = { erc721: "0x73ad2146", erc1155: "0x973bb640" } as const;

// createAuction((startTime,endTime,tokenAmount,category,tokenKind,tokenID,buyNow,startBid), tokenContract, presetId)
// Live Base selector 0xd4e42fea — the deployed 8-field InitiatorInfo (the dapp's
// bundled 6-field ABI is stale and not deployed).
const CREATE_AUCTION_ABI = [
  {
    type: "function", name: "createAuction", stateMutability: "nonpayable",
    inputs: [
      { name: "_info", type: "tuple", components: [
        { name: "startTime", type: "uint80" },
        { name: "endTime", type: "uint80" },
        { name: "tokenAmount", type: "uint56" },
        { name: "category", type: "uint8" },
        { name: "tokenKind", type: "bytes4" },
        { name: "tokenID", type: "uint256" },
        { name: "buyItNowPrice", type: "uint96" },
        { name: "startBidPrice", type: "uint96" },
      ] },
      { name: "_tokenContract", type: "address" },
      { name: "_auctionPresetID", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const APPROVAL_ABI = [
  { name: "isApprovedForAll", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "setApprovalForAll", type: "function", stateMutability: "nonpayable", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
] as const;

const DURATIONS: { label: string; seconds: number }[] = [
  { label: "1 day", seconds: 86400 },
  { label: "3 days", seconds: 3 * 86400 },
  { label: "5 days", seconds: 5 * 86400 },
  { label: "7 days", seconds: 7 * 86400 },
];

type Step = "idle" | "approving" | "creating" | "success";

/** "Create Auction" trigger + modal — registers a GBM auction on Base for any
 *  owned, whitelisted asset (gotchi, parcel, tile, installation, FAKE Gotchi…). */
export function CreateAuctionButton({ kind, category, tokenId, contractAddress, label, maxQuantity = 1, preview, className, compact, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<"now" | "scheduled">("now");
  const [startAt, setStartAt] = useState("");
  const [duration, setDuration] = useState(DURATIONS[1].seconds);
  const [qty, setQty] = useState(1);
  const [buyNow, setBuyNow] = useState("");
  const [startBid, setStartBid] = useState("");
  const [preset, setPreset] = useState(1);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { toast } = useToast();

  const isErc1155 = kind === "erc1155";
  const busy = step === "approving" || step === "creating";

  useEffect(() => {
    if (step === "success") {
      const t = setTimeout(() => { setOpen(false); setStep("idle"); setBuyNow(""); setStartBid(""); onCreated?.(); }, 1000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const toWei96 = (v: string) => {
    const n = Number(v);
    if (!(n > 0)) return 0n;
    return BigInt(Math.round(n * 1e6)) * 10n ** 12n; // GHST 18dp, 6-dp input precision
  };

  const submit = async () => {
    setErr(null);
    if (!publicClient || !address) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const startTime = startMode === "scheduled" && startAt ? Math.floor(new Date(startAt).getTime() / 1000) : nowSec + 120;
    if (startTime < nowSec) { setErr("Start time is in the past."); return; }
    const endTime = startTime + duration;
    const amount = isErc1155 ? Math.max(1, Math.min(qty, maxQuantity)) : 1;
    try {
      // 1) approve the GBM to escrow the token (idempotent).
      const approved = (await publicClient.readContract({ address: contractAddress, abi: APPROVAL_ABI, functionName: "isApprovedForAll", args: [address, GBM_DIAMOND_BASE] })) as boolean;
      if (!approved) {
        setStep("approving");
        const ah = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: contractAddress, abi: APPROVAL_ABI, functionName: "setApprovalForAll", args: [GBM_DIAMOND_BASE, true] });
        await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
      }
      // 2) create the auction.
      setStep("creating");
      const info = {
        startTime: BigInt(startTime),
        endTime: BigInt(endTime),
        tokenAmount: BigInt(amount),
        category,
        tokenKind: TOKEN_KIND[kind] as `0x${string}`,
        tokenID: BigInt(tokenId),
        buyItNowPrice: toWei96(buyNow),
        startBidPrice: toWei96(startBid),
      };
      const hash = await writeContractAsync({ chainId: BASE_CHAIN_ID, address: GBM_DIAMOND_BASE, abi: CREATE_AUCTION_ABI, functionName: "createAuction", args: [info, contractAddress, BigInt(preset)] });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      setStep("success");
      toast({ title: "Auction created", description: `${label} is live on the GBM Baazaar.` });
    } catch (e) {
      setStep("idle");
      setErr(parseRevert(e).slice(0, 160));
    }
  };

  const trigger = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      className={
        className ??
        (compact
          ? "inline-flex items-center justify-center gap-1 h-6 w-full px-1 rounded bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 text-[9px] font-semibold"
          : "inline-flex items-center justify-center gap-1.5 h-10 w-full px-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 text-sm font-semibold transition-colors")
      }
    >
      <Gavel className={compact ? "w-3 h-3" : "w-4 h-4"} /> {compact ? "Auction" : "Create Auction"}
    </button>
  );

  if (!open) return trigger;

  const modal = createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => !busy && setOpen(false)}>
      <div className="w-[min(440px,96vw)] rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-amber-500/10 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border/60 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-transparent pointer-events-none" />
          <div className="relative flex items-center gap-2 text-base font-bold"><Gavel className="w-5 h-5 text-amber-500" /> Create auction</div>
          <button onClick={() => !busy && setOpen(false)} className="relative p-1.5 rounded-lg bg-black/20 hover:bg-black/40 disabled:opacity-40" disabled={busy}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            {preview && <span className="w-14 h-14 flex items-center justify-center rounded-xl overflow-hidden bg-muted/30 shrink-0">{preview}</span>}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{label}</div>
              <div className="text-xs text-muted-foreground">#{tokenId} · GBM Baazaar auction</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Starts</label>
            <div className="flex gap-1">
              {(["now", "scheduled"] as const).map((m) => (
                <button key={m} onClick={() => setStartMode(m)} className={`h-8 px-3 rounded-md text-[11px] font-semibold border capitalize ${startMode === m ? "bg-amber-500/15 text-amber-500 border-amber-500/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{m}</button>
              ))}
            </div>
            {startMode === "scheduled" && (
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-2 w-full h-10 px-3 rounded-lg bg-muted/40 border border-border/50 focus:border-amber-500/60 outline-none text-sm" />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Duration</label>
            <div className="grid grid-cols-4 gap-1">
              {DURATIONS.map((d) => (
                <button key={d.label} onClick={() => setDuration(d.seconds)} className={`h-8 rounded-md text-[11px] font-medium border ${duration === d.seconds ? "bg-amber-500/15 text-amber-500 border-amber-500/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{d.label}</button>
              ))}
            </div>
          </div>

          {isErc1155 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity (you own {maxQuantity})</label>
              <input type="number" inputMode="numeric" min={1} max={maxQuantity} step={1} value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(maxQuantity, Math.floor(Number(e.target.value) || 1))))}
                className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border/50 focus:border-amber-500/60 outline-none text-sm font-mono" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Starting bid (GHST)</label>
              <input type="number" inputMode="decimal" min={0} step="0.01" value={startBid} onChange={(e) => setStartBid(e.target.value)} placeholder="0 (open)" className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border/50 focus:border-amber-500/60 outline-none text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Buy now (GHST)</label>
              <input type="number" inputMode="decimal" min={0} step="0.01" value={buyNow} onChange={(e) => setBuyNow(e.target.value)} placeholder="0 (none)" className="w-full h-10 px-3 rounded-lg bg-muted/40 border border-border/50 focus:border-amber-500/60 outline-none text-sm font-mono" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Bid preset</label>
            <div className="grid grid-cols-3 gap-1">
              {[{ p: 0, l: "Short" }, { p: 1, l: "Standard" }, { p: 2, l: "Long" }].map(({ p, l }) => (
                <button key={p} onClick={() => setPreset(p)} className={`h-8 rounded-md text-[11px] font-medium border ${preset === p ? "bg-amber-500/15 text-amber-500 border-amber-500/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{l}</button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Presets set the anti-snipe "hammer time" and bid increments (Standard ≈ 20 min).</p>
          </div>

          {err && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{err}</div>}

          <button
            type="button" disabled={busy || !isConnected} onClick={submit}
            className="inline-flex items-center justify-center gap-2 h-11 w-full rounded-lg bg-gradient-to-r from-amber-500 to-amber-500/80 text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {busy ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{step === "approving" ? "Approve GBM…" : "Confirm in wallet…"}</>
            ) : step === "success" ? (
              <><CheckCircle2 className="w-4 h-4" /> Auction created</>
            ) : !isConnected ? "Connect wallet" : "Create auction"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">Your asset is escrowed by the GBM until the auction settles or you cancel.</p>
        </div>
      </div>
    </div>,
    document.body
  );

  return (<>{trigger}{modal}</>);
}
