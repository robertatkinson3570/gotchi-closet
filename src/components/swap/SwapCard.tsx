import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract, useSendTransaction } from "wagmi";
import { ArrowDownUp, Fuel, Loader2, Sparkles, Zap } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { ERC20_ABI } from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";
import { useToast } from "@/ui/use-toast";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { NATIVE, fetchLifiQuote, executeLifiSwap, fmtUnits, type Token, type Quote } from "@/lib/swap/lifi";

const GHST: Token = { symbol: "GHST", address: "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB", decimals: 18 };
const PAY_TOKENS: Token[] = [
  { symbol: "ETH", address: NATIVE, decimals: 18 },
  { symbol: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
  { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
];

function TokenBadge({ t }: { t: Token }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-purple-500/10 text-[9px] font-black text-primary">{t.symbol[0]}</span>
      <span className="font-semibold">{t.symbol}</span>
    </span>
  );
}

/** In-app swap on Base: pay ETH/USDC/WETH -> GHST, or flip to cash GHST out. */
export function SwapCard() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { toast } = useToast();

  const [payToken, setPayToken] = useState<Token>(PAY_TOKENS[0]);
  const [reversed, setReversed] = useState(false); // false: pay -> GHST, true: GHST -> pay
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);

  const fromToken = reversed ? GHST : payToken;
  const toToken = reversed ? payToken : GHST;
  const amountWei = useMemo(() => {
    const n = Number(amount);
    if (!(n > 0)) return 0n;
    return BigInt(Math.round(n * 10 ** Math.min(fromToken.decimals, 9))) * 10n ** BigInt(Math.max(0, fromToken.decimals - 9));
  }, [amount, fromToken.decimals]);

  const { data: ethBal } = useBalance({ address, chainId: BASE_CHAIN_ID, query: { enabled: !!address } });
  const { data: erc20Bal } = useReadContract({
    chainId: BASE_CHAIN_ID,
    address: (fromToken.address === NATIVE ? GHST.address : fromToken.address) as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && fromToken.address !== NATIVE, refetchInterval: 30_000 },
  });
  const fromBalance: bigint | undefined = fromToken.address === NATIVE ? ethBal?.value : (erc20Bal as bigint | undefined);

  // Debounced live quote.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (amountWei <= 0n) return;
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await fetchLifiQuote({
          fromToken: fromToken.address,
          toToken: toToken.address,
          fromAmountWei: amountWei,
          fromAddress: address ?? "0x0000000000000000000000000000000000000001",
        });
        if (cancelled) return;
        setQuote(q);
      } catch (e: any) {
        if (!cancelled) setQuoteError(e?.message ?? "Quote failed, try again");
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [amountWei, fromToken.address, toToken.address, address]);

  const doSwap = async () => {
    if (!quote || !address || !publicClient) return;
    setSwapping(true);
    try {
      await executeLifiSwap({ quote, fromToken, amountWei, address, publicClient, writeContractAsync, sendTransactionAsync });
      toast({ title: "Swap complete", description: `Received ~${fmtUnits(quote.toAmount, toToken.decimals)} ${toToken.symbol}.` });
      setAmount("");
      setQuote(null);
    } catch (e) {
      toast({ title: "Swap failed", description: parseRevert(e).slice(0, 140), variant: "destructive" });
    } finally {
      setSwapping(false);
    }
  };

  const insufficient = fromBalance != null && amountWei > fromBalance;

  return (
    <div className="relative rounded-2xl border border-border/40 bg-gradient-to-b from-primary/[0.07] to-background/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-1.5 text-sm font-bold"><Zap className="w-4 h-4 text-primary" /> Instant swap</div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Best route on Base</span>
      </div>

      {/* You pay */}
      <div className="rounded-xl border border-border/40 bg-background/70 p-3">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>You pay</span>
          {isConnected && fromBalance != null && (
            <button className="hover:text-primary" onClick={() => setAmount((Number(fromBalance) / 10 ** fromToken.decimals * (fromToken.address === NATIVE ? 0.98 : 1)).toString())}>
              Balance {fmtUnits(fromBalance, fromToken.decimals)} · Max
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.0"
            className="flex-1 min-w-0 bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/40"
          />
          {reversed ? (
            <TokenBadge t={GHST} />
          ) : (
            <select
              value={payToken.symbol}
              onChange={(e) => setPayToken(PAY_TOKENS.find((t) => t.symbol === e.target.value)!)}
              className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs font-semibold cursor-pointer"
            >
              {PAY_TOKENS.map((t) => <option key={t.symbol}>{t.symbol}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Flip */}
      <div className="relative h-0 z-10 flex justify-center">
        <button
          onClick={() => { setReversed((r) => !r); setAmount(""); }}
          title="Flip direction"
          className="-translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-full border border-border bg-background shadow hover:border-primary/50 hover:text-primary transition-colors"
        >
          <ArrowDownUp className="w-4 h-4" />
        </button>
      </div>

      {/* You receive */}
      <div className="rounded-xl border border-border/40 bg-background/70 p-3">
        <div className="text-[10px] text-muted-foreground mb-1">You receive (est.)</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 text-xl font-semibold tabular-nums truncate">
            {quoting ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : quote ? fmtUnits(quote.toAmount, toToken.decimals) : "None"}
          </div>
          {reversed ? (
            <select
              value={payToken.symbol}
              onChange={(e) => setPayToken(PAY_TOKENS.find((t) => t.symbol === e.target.value)!)}
              className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs font-semibold cursor-pointer"
            >
              {PAY_TOKENS.map((t) => <option key={t.symbol}>{t.symbol}</option>)}
            </select>
          ) : (
            <TokenBadge t={GHST} />
          )}
        </div>
      </div>

      {quote && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 px-1 text-[10px] text-muted-foreground">
          <span>Min received: <b className="text-foreground/80">{fmtUnits(quote.toAmountMin, toToken.decimals)} {toToken.symbol}</b></span>
          {quote.gasUsd && <span className="inline-flex items-center gap-0.5"><Fuel className="w-3 h-3" /> ${quote.gasUsd}</span>}
          <span className="inline-flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> via {quote.tool}</span>
          <span>Slippage 0.5%</span>
        </div>
      )}
      {quoteError && <div className="mt-2 px-1 text-[11px] text-rose-500">{quoteError}</div>}

      <div className="mt-3">
        {!isConnected ? (
          <ConnectButton className="w-full h-10" />
        ) : (
          <button
            disabled={!quote || swapping || quoting || insufficient}
            onClick={doSwap}
            className="w-full h-10 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white text-sm font-bold shadow hover:opacity-95 disabled:opacity-40 transition-opacity inline-flex items-center justify-center gap-2"
          >
            {swapping ? (<><Loader2 className="w-4 h-4 animate-spin" /> Swapping…</>) : insufficient ? `Not enough ${fromToken.symbol}` : `Swap ${fromToken.symbol} → ${toToken.symbol}`}
          </button>
        )}
      </div>
    </div>
  );
}
