import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Sprout, Timer } from "lucide-react";
import { useAccount } from "wagmi";
import { useMyConnectedLendings } from "@/hooks/useMyLendings";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { useLandAlchemica } from "@/hooks/useLandAlchemica";
import { useToast } from "@/ui/use-toast";

const DECIMALS = BigInt(10) ** BigInt(18);

function formatAlch(amount: bigint): string {
  const whole = amount / DECIMALS;
  const frac = amount % DECIMALS;
  if (frac === BigInt(0)) return whole.toLocaleString();
  const fracStr = ((frac * BigInt(100)) / DECIMALS).toString().padStart(2, "0").replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

/**
 * Shown on /lending/me. Reads the claimable reservoir alchemica sitting on the
 * connected wallet's Gotchiverse parcels and offers a one-click batched claim
 * (claimAllAvailableAlchemica), signed in the browser wallet. This sweeps what
 * harvesters have accumulated; the larger in-ground reserves release over time.
 */
export function LandAlchemicaBar() {
  const { address } = useAccount();
  const { toast } = useToast();

  // Any gotchi the connected wallet controls can be the claimer on owner-only
  // parcels. Lender records expose gotchiTokenIds even while rented/locked;
  // fall back to directly-owned gotchis.
  const { lender } = useMyConnectedLendings();
  const { gotchis } = useGotchisByOwner(address?.toLowerCase() ?? "");
  const claimerGotchiId = useMemo(() => {
    const fromLender = lender.find((l) => Number.isFinite(Number(l.gotchiTokenId)));
    if (fromLender) return Number(fromLender.gotchiTokenId);
    const g = (gotchis ?? [])[0] as any;
    const id = g ? Number(g.gotchiId ?? g.id) : NaN;
    return Number.isFinite(id) ? id : undefined;
  }, [lender, gotchis]);

  const land = useLandAlchemica(claimerGotchiId);

  // Tick every 30s so the channel-cooldown countdown stays live.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);

  const channel = useMemo(() => {
    const times = land.nextChannelTimes ?? [];
    let readyCount = 0;
    let soonest = Infinity;
    for (const t of times) {
      if (t <= nowSec) readyCount++;
      else soonest = Math.min(soonest, t - nowSec);
    }
    return {
      readyCount,
      total: times.length,
      soonestIn: soonest === Infinity ? null : soonest,
    };
  }, [land.nextChannelTimes, nowSec]);

  // Soonest time any reservoir comes off its empty-cooldown — shown once
  // everything claimable has been claimed so the bar doesn't just vanish.
  const reservoirSoonestIn = useMemo(() => {
    const times = land.nextReservoirTimes ?? [];
    let soonest = Infinity;
    for (const t of times) if (t > nowSec) soonest = Math.min(soonest, t - nowSec);
    return soonest === Infinity ? null : soonest;
  }, [land.nextReservoirTimes, nowSec]);

  useEffect(() => {
    if (land.step === "success") {
      toast({
        title: "Land alchemica claimed",
        description: "Reservoir balances swept to your wallet.",
      });
      land.reset();
    }
    if (land.step === "error" && land.errorMsg) {
      toast({
        title: "Claim failed",
        description: land.errorMsg.slice(0, 160),
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [land.step]);

  useEffect(() => {
    if (land.channelStep === "success") {
      toast({ title: "Channeling done", description: `Channeled ${land.channelDone} parcel${land.channelDone === 1 ? "" : "s"}.` });
      land.reset();
    }
    if (land.channelStep === "error" && land.errorMsg) {
      toast({ title: "Channel all", description: land.errorMsg.slice(0, 180), variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [land.channelStep]);

  if (!address) return null;
  if (land.isLoading) return null;
  // Keep the bar mounted as long as the wallet owns parcels — hiding it the
  // moment nothing is claimable also hid Channel-all and the cooldown status.
  if (land.parcelCount === 0) return null;
  const hasClaimable = land.claimableCount > 0;

  const summary = ["FUD", "FOMO", "ALPHA", "KEK"]
    .map((sym) => {
      const t = land.totalsBySymbol[sym];
      if (!t || t === BigInt(0)) return null;
      return `${formatAlch(t)} ${sym}`;
    })
    .filter(Boolean)
    .join(" · ");

  const busy = land.step === "submitting" || land.step === "confirming";
  const chBusy = land.channelStep === "submitting" || land.channelStep === "confirming";
  const batchNote = land.progress && land.progress.total > 1
    ? ` (${land.progress.done}/${land.progress.total} batches)`
    : "";

  return (
    <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
      <div className="text-sm font-semibold inline-flex items-center gap-1.5">
        <Sprout className="w-4 h-4 text-emerald-500" />
        Land alchemica &amp; channeling
      </div>
      {hasClaimable ? (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs min-w-0">
            <div className="font-semibold text-emerald-600 dark:text-emerald-400">
              Ready to claim
            </div>
            <div className="text-muted-foreground break-words">
              <span className="text-foreground font-medium">{summary}</span>
              <span className="ml-1">
                · across {land.claimableCount} parcel{land.claimableCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => land.send()}
            disabled={busy || !land.isOnBase}
            title={
              !land.isOnBase
                ? "Switch to Base to claim"
                : "Sweep every ready parcel's reservoir alchemica to your wallet (signed in your wallet; large counts sign in batches)"
            }
            data-testid="land-claim-all"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-emerald-600 text-white hover:bg-emerald-600/90 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {land.step === "submitting" ? `Sign in wallet…${batchNote}` : `Confirming…${batchNote}`}
              </>
            ) : land.step === "success" ? (
              <>
                <CheckCircle2 className="w-4 h-4" /> Done
              </>
            ) : land.step === "error" ? (
              <>
                <XCircle className="w-4 h-4" /> Retry
              </>
            ) : (
              <>Claim all land alchemica ({land.claimableCount})</>
            )}
          </button>
        </div>
      ) : (
        <div className="rounded border border-emerald-500/20 bg-muted/20 p-2.5 text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/70" />
          All reservoirs emptied — nothing ready to claim right now
          {reservoirSoonestIn != null && (
            <>
              {" "}· next ready in{" "}
              <span className="text-foreground font-medium">{formatCountdown(reservoirSoonestIn)}</span>
            </>
          )}
        </div>
      )}

      {channel.total > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-muted-foreground px-0.5">
          <span className="inline-flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-emerald-500/80" />
            Channeling cooldown:{" "}
            <span className="text-foreground font-medium">
              {channel.readyCount}/{channel.total}
            </span>{" "}
            parcels ready
            {channel.soonestIn != null && (
              <>
                {" "}· next in{" "}
                <span className="text-foreground font-medium">{formatCountdown(channel.soonestIn)}</span>
              </>
            )}
          </span>
          {channel.readyCount > 0 && (
            <button
              type="button"
              onClick={() => land.channelAll()}
              disabled={chBusy || !land.isOnBase}
              title="Channel every ready parcel with your gotchi (needs an unlocked gotchi; one channel per gotchi cooldown — locked/lent gotchis are skipped)"
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-semibold"
            >
              {chBusy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Channeling {land.channelProgress?.done}/
                  {land.channelProgress?.total}…
                </>
              ) : (
                <>Channel all ready ({channel.readyCount})</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
