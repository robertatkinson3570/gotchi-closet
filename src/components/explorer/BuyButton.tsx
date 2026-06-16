import { useEffect } from "react";
import { Loader2, ShoppingCart, CheckCircle2, XCircle } from "lucide-react";
import { useMarketplaceBuy } from "@/hooks/useMarketplaceBuy";
import { useToast } from "@/ui/use-toast";

type Props = {
  listingId: string;
  tokenId: string;
  priceInWei: string;
  kind: "erc721" | "erc1155";
  contractAddress: `0x${string}`;
  quantity?: number;
  /** What was bought, for the success toast (e.g. "#1234" or "Sushi Headband"). */
  label?: string;
  className?: string;
};

const fmtGhst = (wei: string) =>
  (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * Self-contained Buy button for a single Baazaar listing. Owns its own tx hook
 * instance so each card buys independently, with wallet-signed approve+execute.
 */
export function BuyButton({ listingId, tokenId, priceInWei, kind, contractAddress, quantity, label, className }: Props) {
  const { buy, step, errorMsg, activeKey, reset, isConnected } = useMarketplaceBuy();
  const { toast } = useToast();
  const mine = activeKey === listingId;
  const busy = mine && (step === "approving" || step === "submitting" || step === "confirming");

  useEffect(() => {
    if (!mine) return;
    if (step === "success") {
      toast({ title: "Purchased", description: `Bought ${label ?? `#${tokenId}`}.` });
      reset();
    }
    if (step === "error" && errorMsg) {
      toast({ title: "Buy failed", description: errorMsg.slice(0, 160), variant: "destructive" });
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mine]);

  return (
    <button
      type="button"
      disabled={busy || !isConnected}
      title={isConnected ? `Buy for ${fmtGhst(priceInWei)} GHST` : "Connect wallet to buy"}
      onClick={(e) => {
        e.stopPropagation();
        buy({ listingId, tokenId, priceInWei: BigInt(priceInWei), kind, contractAddress, quantity });
      }}
      className={
        className ??
        "inline-flex items-center justify-center gap-1 h-7 w-full px-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-semibold transition-colors"
      }
    >
      {busy ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {step === "approving" ? "Approve GHST…" : step === "submitting" ? "Sign…" : "Buying…"}
        </>
      ) : mine && step === "success" ? (
        <>
          <CheckCircle2 className="w-3.5 h-3.5" /> Bought
        </>
      ) : mine && step === "error" ? (
        <>
          <XCircle className="w-3.5 h-3.5" /> Retry
        </>
      ) : (
        <>
          <ShoppingCart className="w-3.5 h-3.5" /> Buy · {fmtGhst(priceInWei)} GHST
        </>
      )}
    </button>
  );
}
