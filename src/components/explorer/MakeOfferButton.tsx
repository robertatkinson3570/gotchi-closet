import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, HandCoins, CheckCircle2, X } from "lucide-react";
import { useMakeOffer } from "@/hooks/useMakeOffer";
import { BAAZAAR_CATEGORY } from "@/lib/lending/contracts";
import { useToast } from "@/ui/use-toast";

type Props = {
  kind: "erc721" | "erc1155";
  category: number;
  tokenId: string;
  contractAddress: `0x${string}`;
  /** Human label for the item, shown in the modal + toast. */
  label: string;
  /** Small thumbnail for the modal header (optional). */
  preview?: React.ReactNode;
  /** Button style override; defaults to a full-width pill. */
  className?: string;
  /** Compact rendering for dense cards (smaller trigger). */
  compact?: boolean;
};

const DURATIONS: { label: string; seconds: number }[] = [
  { label: "1 day", seconds: 86400 },
  { label: "3 days", seconds: 3 * 86400 },
  { label: "7 days", seconds: 7 * 86400 },
  { label: "30 days", seconds: 30 * 86400 },
  { label: "No expiry", seconds: 0 },
];

/**
 * "Make an offer" trigger + modal. Places a Baazaar buy order on the explorer
 * for any gotchi / wearable / item. Owns its own tx hook instance.
 */
export function MakeOfferButton({ kind, category, tokenId, contractAddress, label, preview, className, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const [duration, setDuration] = useState(DURATIONS[2].seconds); // 7 days default
  const { makeOffer, step, errorMsg, reset, isConnected } = useMakeOffer();
  const { toast } = useToast();

  const busy = step === "approving" || step === "submitting" || step === "confirming";
  const priceNum = Number(price);
  const valid = priceNum > 0 && Number.isFinite(priceNum) && (kind === "erc721" || qty >= 1);
  const isErc1155 = kind === "erc1155";
  const total = isErc1155 ? priceNum * qty : priceNum;

  useEffect(() => {
    if (step === "success") {
      toast({ title: "Offer placed", description: `Your offer on ${label} is live.` });
      const t = setTimeout(() => { setOpen(false); reset(); setPrice(""); setQty(1); }, 900);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const submit = () => {
    if (!valid) return;
    const priceInWei = BigInt(Math.round(priceNum * 1e6)) * 10n ** 12n; // 6-dp precision → wei
    makeOffer({ kind, category, tokenId, contractAddress, priceInWei, quantity: qty, durationSeconds: duration });
  };

  const trigger = (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      className={
        className ??
        (compact
          ? "inline-flex items-center justify-center gap-1 h-6 w-full px-1 rounded bg-primary/15 text-primary hover:bg-primary/25 text-[9px] font-semibold"
          : "inline-flex items-center justify-center gap-1.5 h-10 w-full px-3 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-sm font-semibold transition-colors")
      }
    >
      <HandCoins className={compact ? "w-3 h-3" : "w-4 h-4"} /> {compact ? "Offer" : "Make Offer"}
    </button>
  );

  if (!open) return trigger;

  const catName =
    category === BAAZAAR_CATEGORY.AAVEGOTCHI ? "Gotchi" : category === BAAZAAR_CATEGORY.REALM && kind === "erc721" ? "Parcel" : category === BAAZAAR_CATEGORY.WEARABLE ? "Wearable" : "Item";

  const modal = createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3" onClick={() => !busy && setOpen(false)}>
      <div className="w-[min(420px,96vw)] rounded-2xl border border-white/10 bg-background shadow-2xl ring-1 ring-primary/10" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border/60 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent pointer-events-none" />
          <div className="relative flex items-center gap-2 text-base font-bold"><HandCoins className="w-5 h-5 text-primary" /> Make an offer</div>
          <button onClick={() => !busy && setOpen(false)} className="relative p-1.5 rounded-lg bg-black/20 hover:bg-black/40 disabled:opacity-40" disabled={busy}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            {preview && <span className="w-14 h-14 flex items-center justify-center rounded-xl overflow-hidden bg-muted/30 shrink-0">{preview}</span>}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{label}</div>
              <div className="text-xs text-muted-foreground">{catName} · #{tokenId}</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{isErc1155 ? "Price per item (GHST)" : "Offer price (GHST)"}</label>
            <input
              type="number" inputMode="decimal" min={0} step="0.01" value={price} autoFocus
              onChange={(e) => setPrice(e.target.value)} placeholder="0.00"
              className="w-full h-11 px-3 rounded-lg bg-muted/40 border border-border/50 focus:border-primary/60 outline-none text-sm font-mono"
            />
          </div>

          {isErc1155 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity</label>
              <input
                type="number" inputMode="numeric" min={1} step={1} value={qty}
                onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-full h-11 px-3 rounded-lg bg-muted/40 border border-border/50 focus:border-primary/60 outline-none text-sm font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Expires in</label>
            <div className="grid grid-cols-5 gap-1">
              {DURATIONS.map((d) => (
                <button key={d.label} onClick={() => setDuration(d.seconds)}
                  className={`h-8 rounded-md text-[11px] font-medium border ${duration === d.seconds ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{d.label}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">You escrow</span>
            <span className="font-bold text-emerald-500">{total > 0 ? total.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0"} GHST</span>
          </div>

          {errorMsg && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{errorMsg}</div>}

          <button
            type="button" disabled={!valid || busy || !isConnected} onClick={submit}
            className="inline-flex items-center justify-center gap-2 h-11 w-full rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {busy ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{step === "approving" ? "Approve GHST…" : step === "submitting" ? "Confirm in wallet…" : "Placing…"}</>
            ) : step === "success" ? (
              <><CheckCircle2 className="w-4 h-4" /> Offer placed</>
            ) : !isConnected ? "Connect wallet" : "Place offer"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center">GHST is escrowed to the Aavegotchi diamond and refunded if you cancel or it expires.</p>
        </div>
      </div>
    </div>,
    document.body
  );

  return (<>{trigger}{modal}</>);
}
