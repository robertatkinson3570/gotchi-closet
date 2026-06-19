import { useEffect, useMemo, useRef, useState } from "react";
import { qk } from "@/lib/queryKeys";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Wallet,
  AlertCircle,
  XCircle,
  Coins,
  Clock,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { fetchGotchisByOwner } from "@/graphql/fetchers";
import { useWhitelistsForAddress } from "@/hooks/useWhitelists";
import { useBatchAddListing, type ListingParams } from "@/hooks/useLendingTx";
import { ALCHEMICA_TOKEN_ADDRESSES_BASE } from "@/lib/lending/contracts";
import { useHistoricalLendings } from "@/hooks/useHistoricalLendings";
import { useAlchemicaPrices } from "@/hooks/useAlchemicaPrices";
import { autoPriceBatch, type AutoPriceGoal } from "@/lib/lending/autoPrice";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { useAddressState } from "@/lib/addressState";
import { switchToBaseChain } from "@/lib/chains";
import { Sparkles } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { loadMultiWallets } from "@/lib/multiWallet";

type GotchiRow = {
  tokenId: string;
  name: string;
  modBRS: number;
  baseBRS: number;
  level: number;
  kinship: number;
  hauntId: number;
  lendingActive: boolean;
  ownerWallet: string;
};

type Step = 1 | 2 | 3;

const ZERO = "0x0000000000000000000000000000000000000000";

function suggestedPrice(modBRS: number): number {
  if (modBRS >= 700) return 250;
  if (modBRS >= 660) return 150;
  if (modBRS >= 630) return 80;
  if (modBRS >= 600) return 50;
  if (modBRS >= 570) return 30;
  if (modBRS >= 530) return 15;
  return 15;
}

export default function BulkListPage() {
  const { address, isConnected } = useAccount();
  const { isOnBase } = useAddressState();
  const ownerLower = address?.toLowerCase() ?? "";

  // All wallets to scan: connected + multi-wallet list from /home, deduped.
  const allOwners = useMemo(() => {
    const set = new Set<string>();
    if (ownerLower) set.add(ownerLower);
    for (const w of loadMultiWallets()) set.add(w.toLowerCase());
    return Array.from(set);
  }, [ownerLower]);

  const ownerQueries = useQueries({
    queries: allOwners.map((owner) => ({
      queryKey: qk.gotchis(owner),
      queryFn: () => fetchGotchisByOwner(owner),
      enabled: !!owner,
      staleTime: 30_000,
    })),
  });

  const loadingGotchis = ownerQueries.some((q) => q.isLoading);
  const allGotchis = useMemo(() => {
    const out: any[] = [];
    ownerQueries.forEach((q, i) => {
      if (q.data) {
        for (const g of q.data) {
          out.push({ ...g, _ownerWallet: allOwners[i] });
        }
      }
    });
    return out;
  }, [ownerQueries, allOwners]);

  const { asOwner: myWhitelists } = useWhitelistsForAddress(ownerLower || null);
  const { lendings: historical } = useHistoricalLendings(60);
  const { prices: alchPrices } = useAlchemicaPrices();

  const [step, setStep] = useState<Step>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodUnit, setPeriodUnit] = useState<"hours" | "days">("days");
  const [periodValue, setPeriodValue] = useState(7);
  const periodSec = periodUnit === "days" ? periodValue * 86400 : periodValue * 3600;
  const [whitelistId, setWhitelistId] = useState("0");
  const [splitOwner, setSplitOwner] = useState(20);
  // splitOther always 0 — fee model moved off-chain (subscription).
  const splitOther = 0;
  const thirdParty = ZERO;
  const [channelling, setChannelling] = useState(true);
  const [useSuggestedPrice, setUseSuggestedPrice] = useState(true);
  const [flatPrice, setFlatPrice] = useState("");
  const splitBorrower = 100 - splitOwner;

  // Per-gotchi price overrides
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const applyAutoPriceAll = (goal: AutoPriceGoal) => {
    const selectedRows = rows.filter((r) => selected.has(r.tokenId));
    const results = autoPriceBatch(
      historical,
      selectedRows.map((r) => ({
        tokenId: r.tokenId,
        brs: r.modBRS,
        hauntId: r.hauntId,
        kinship: r.kinship,
      })),
      goal,
      alchPrices
    );
    const next: Record<string, string> = { ...overrides };
    let channellingOn = 0;
    const periods: number[] = [];
    let modeBattler = 0;
    let modeChannelling = 0;
    for (const r of selectedRows) {
      const res = results.get(r.tokenId);
      if (!res) continue;
      next[r.tokenId] = String(
        res.recommendedUpfrontGhst < 1
          ? res.recommendedUpfrontGhst.toFixed(2)
          : Math.round(res.recommendedUpfrontGhst)
      );
      periods.push(res.recommendedPeriodDays);
      if (res.recommendedChannellingAllowed) channellingOn += 1;
      if (res.mode === "battler") modeBattler += 1;
      else modeChannelling += 1;
    }
    setOverrides(next);
    setUseSuggestedPrice(false);
    // Use the median recommended period so the global setting reflects the bulk
    if (periods.length) {
      const sorted = [...periods].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      setPeriodUnit("days");
      setPeriodValue(median);
    }
    setChannelling(channellingOn >= selectedRows.length / 2);
    // If majority is channelling-mode, push the lender split higher (50/50)
    if (modeChannelling > modeBattler) {
      setSplitOwner(50);
    } else {
      setSplitOwner(20);
    }
  };

  // Chunked-batch submit. With revenueTokens populated each addGotchiListing
  // costs ~280k gas, so 58+ listings in one tx exceeded Base's per-tx limit
  // (~16.7M cap, observed 16.5M used → revert). We chunk into smaller batches
  // and sign each sequentially. 25/batch keeps each tx well under 8M gas.
  const LIST_CHUNK_SIZE = 25;
  const list = useBatchAddListing();
  const [submittedRows, setSubmittedRows] = useState<GotchiRow[]>([]);
  const [skippedRows, setSkippedRows] = useState<GotchiRow[]>([]);
  const chunkQueueRef = useRef<ListingParams[][]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [chunksDone, setChunksDone] = useState(0);
  const [chunksFailed, setChunksFailed] = useState(0);
  const advancingRef = useRef(false);

  const rows: GotchiRow[] = useMemo(() => {
    return allGotchis
      .map((g: any) => {
        const modBRS = Number(
          g.withSetsRarityScore ?? g.modifiedRarityScore ?? g.baseRarityScore ?? 0
        );
        const baseBRS = Number(g.baseRarityScore ?? 0);
        const tokenId = String(g.gotchiId ?? g.id);
        return {
          tokenId,
          name: g.name ?? "Unnamed",
          modBRS,
          baseBRS,
          level: Number(g.level ?? 1),
          kinship: Number(g.kinship ?? 50),
          hauntId: Number(g.hauntId ?? 2),
          lendingActive: Boolean(g.lending && Number(g.lending) > 0),
          ownerWallet: String(g._ownerWallet ?? ""),
        };
      })
      .filter((r: GotchiRow) => !r.lendingActive)
      .sort((a: GotchiRow, b: GotchiRow) => b.modBRS - a.modBRS);
  }, [allGotchis]);

  const selectedRows = rows.filter((r) => selected.has(r.tokenId));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => setSelected(new Set(rows.map((r) => r.tokenId)));
  const clearAll = () => setSelected(new Set());

  const startQueue = () => {
    if (!address) return;
    // Split selected rows: owned-by-connected (will batch), others (skip + warn)
    const mine = selectedRows.filter(
      (r) =>
        !r.ownerWallet ||
        r.ownerWallet.toLowerCase() === address.toLowerCase()
    );
    const skipped = selectedRows.filter(
      (r) =>
        r.ownerWallet &&
        r.ownerWallet.toLowerCase() !== address.toLowerCase()
    );
    setSkippedRows(skipped);
    setSubmittedRows(mine);
    setStep(3);

    if (mine.length === 0) return;

    const tuples: ListingParams[] = mine.map((cur) => {
      const ghst = (() => {
        if (overrides[cur.tokenId]) return Number(overrides[cur.tokenId]);
        if (useSuggestedPrice) return suggestedPrice(cur.modBRS);
        return Number(flatPrice) || 0;
      })();
      return {
        tokenId: Number(cur.tokenId),
        initialCostWei: ghstToWei(ghst),
        periodSeconds: periodSec,
        splitOwner,
        splitBorrower,
        splitOther,
        originalOwner: (cur.ownerWallet || address) as `0x${string}`,
        thirdParty: (splitOther > 0 && thirdParty ? thirdParty : ZERO) as `0x${string}`,
        whitelistId: Number(whitelistId) || 0,
        // Declare the 4 alchemica addresses so claimGotchiLending iterates
        // over them and actually splits escrow alch per the lending terms.
        // (Verified via subgraph — every real Base lending uses these 4.)
        // The previous "empty array" workaround silently disabled all
        // claim-time payouts, leaving alch stranded in escrow.
        revenueTokens: ALCHEMICA_TOKEN_ADDRESSES_BASE,
        // permissions encoding (matches official dapp on Base):
        // 0x101 = channelling allowed; 0x0 = disabled. Was inverted prior.
        permissions: channelling ? BigInt(0x101) : BigInt(0),
      };
    });

    // Chunk into per-tx batches so we don't blow Base's per-tx gas limit.
    const chunks: ListingParams[][] = [];
    for (let i = 0; i < tuples.length; i += LIST_CHUNK_SIZE) {
      chunks.push(tuples.slice(i, i + LIST_CHUNK_SIZE));
    }
    chunkQueueRef.current = chunks;
    setChunkIndex(0);
    setChunksDone(0);
    setChunksFailed(0);
    advancingRef.current = false;
    list.reset();
    // Submit chunk 0 immediately. Subsequent chunks fire from the useEffect
    // below once each receipt confirms.
    list.send(chunks[0]);
  };

  // Drive the chunk queue: advance on each success, halt on error so a
  // single bad batch doesn't burn N more gas attempts.
  useEffect(() => {
    if (chunkQueueRef.current.length === 0) return;
    if (advancingRef.current) return;
    if (list.step === "success") {
      advancingRef.current = true;
      const nextIdx = chunkIndex + 1;
      setChunksDone((c) => c + 1);
      if (nextIdx >= chunkQueueRef.current.length) {
        advancingRef.current = false;
        return; // queue done
      }
      // Tiny breath so wagmi's writeContract state resets cleanly between
      // back-to-back signings.
      setTimeout(() => {
        setChunkIndex(nextIdx);
        list.reset();
        list.send(chunkQueueRef.current[nextIdx]);
        advancingRef.current = false;
      }, 400);
    } else if (list.step === "error") {
      setChunksFailed((c) => c + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.step, chunkIndex]);

  const totalChunks = chunkQueueRef.current.length;
  const submitDone =
    totalChunks > 0 &&
    (chunksDone + chunksFailed >= totalChunks || list.step === "error");
  // Translate chunk-level success into per-row count for the existing UI.
  const successCount = chunkQueueRef.current
    .slice(0, chunksDone)
    .reduce((n, c) => n + c.length, 0);
  const failCount =
    list.step === "error"
      ? chunkQueueRef.current[chunkIndex]?.length ?? 0
      : 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <Seo
        title="Bulk list — GotchiCloset"
        description="Stage and list multiple Aavegotchis for rent in one go."
        canonical={siteUrl("/lending/me/list")}
      />

      <Link
        to="/lending/me"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
      >
        <ArrowLeft className="w-3 h-3" /> Back to my lendings
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Bulk list for rent</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Pick gotchis, set terms, sign <span className="text-primary font-medium">one transaction</span> for all of them.
      </p>

      {!isConnected ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center max-w-md mx-auto">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-primary" />
          <p className="text-sm font-medium mb-3">Connect a wallet to bulk-list</p>
          <ConnectButton />
        </div>
      ) : !isOnBase ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 inline-flex items-center justify-between gap-4">
          <span className="text-sm text-amber-600 dark:text-amber-400 inline-flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Switch to Base to continue
          </span>
          <button
            type="button"
            onClick={() => switchToBaseChain().catch(() => {})}
            className="h-8 px-3 rounded-md bg-amber-500 text-amber-950 text-xs font-semibold"
          >
            Switch to Base
          </button>
        </div>
      ) : (
        <>
          <Stepper step={step} />

          {step === 1 && (
            <Step1Select
              loading={loadingGotchis}
              rows={rows}
              selected={selected}
              toggle={toggle}
              selectAll={selectAllVisible}
              clear={clearAll}
              onNext={() => selected.size > 0 && setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2Configure
              periodUnit={periodUnit}
              setPeriodUnit={setPeriodUnit}
              periodValue={periodValue}
              setPeriodValue={setPeriodValue}
              splitOwner={splitOwner}
              setSplitOwner={setSplitOwner}
              splitBorrower={splitBorrower}
              whitelistId={whitelistId}
              setWhitelistId={setWhitelistId}
              myWhitelists={myWhitelists}
              channelling={channelling}
              setChannelling={setChannelling}
              useSuggestedPrice={useSuggestedPrice}
              setUseSuggestedPrice={setUseSuggestedPrice}
              flatPrice={flatPrice}
              setFlatPrice={setFlatPrice}
              selectedRows={selectedRows}
              overrides={overrides}
              setOverrides={setOverrides}
              onAutoPriceAll={applyAutoPriceAll}
              onBack={() => setStep(1)}
              onNext={startQueue}
            />
          )}

          {step === 3 && (
            <Step3Submit
              submittedRows={submittedRows}
              skippedRows={skippedRows}
              txStep={list.step}
              txError={list.errorMsg}
              successCount={successCount}
              failCount={failCount}
              done={submitDone}
              chunkIndex={chunkIndex}
              totalChunks={totalChunks}
              chunksDone={chunksDone}
              onBack={() => {
                list.reset();
                setStep(2);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function ghstToWei(n: number): bigint {
  if (!n) return BigInt(0);
  const [whole, frac = ""] = String(n).split(".");
  const fracPad = (frac + "000000000000000000").slice(0, 18);
  return BigInt(whole) * (BigInt(10) ** BigInt(18)) + BigInt(fracPad);
}

function Stepper({ step }: { step: Step }) {
  const items = ["Select gotchis", "Configure terms", "Sign & submit"] as const;
  return (
    <div className="flex items-center gap-2 mb-5 text-xs">
      {items.map((label, i) => {
        const active = step === ((i + 1) as Step);
        const past = step > ((i + 1) as Step);
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center h-6 w-6 rounded-full border ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : past
                  ? "bg-green-500/20 text-green-500 border-green-500/40"
                  : "border-border/40 text-muted-foreground"
              }`}
            >
              {past ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={active ? "font-semibold" : "text-muted-foreground"}>{label}</span>
            {i < items.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />}
          </div>
        );
      })}
    </div>
  );
}

function Step1Select({
  loading,
  rows,
  selected,
  toggle,
  selectAll,
  clear,
  onNext,
}: {
  loading: boolean;
  rows: GotchiRow[];
  selected: Set<string>;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  onNext: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-muted/30 animate-pulse rounded" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/50 p-6 text-center text-sm">
        No unlisted gotchis in your wallet.
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">
          {selected.size} of {rows.length} selected
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={selectAll}
            className="h-7 px-2 rounded text-xs border border-border/40 hover:bg-muted/50"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clear}
            className="h-7 px-2 rounded text-xs border border-border/40 hover:bg-muted/50"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30 max-h-[60vh] overflow-y-auto">
        {rows.map((r) => {
          const checked = selected.has(r.tokenId);
          return (
            <label
              key={r.tokenId}
              className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30 ${
                checked ? "bg-primary/5" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(r.tokenId)}
                className="w-4 h-4"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  #{r.tokenId} · Lv {r.level}
                  {r.ownerWallet && (
                    <span className="ml-1.5">
                      · {r.ownerWallet.slice(0, 6)}…{r.ownerWallet.slice(-4)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs">
                  BRS <span className="font-semibold">{r.modBRS}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">base {r.baseBRS}</div>
              </div>
              <div className="text-[11px] text-muted-foreground">
                ~{suggestedPrice(r.modBRS)} GHST
              </div>
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={selected.size === 0}
          className="inline-flex items-center gap-1.5 h-10 px-5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold"
        >
          Continue ({selected.size}) <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

function Step2Configure({
  periodUnit,
  setPeriodUnit,
  periodValue,
  setPeriodValue,
  splitOwner,
  setSplitOwner,
  splitBorrower,
  whitelistId,
  setWhitelistId,
  myWhitelists,
  channelling,
  setChannelling,
  useSuggestedPrice,
  setUseSuggestedPrice,
  flatPrice,
  setFlatPrice,
  selectedRows,
  overrides,
  setOverrides,
  onAutoPriceAll,
  onBack,
  onNext,
}: {
  periodUnit: "hours" | "days";
  setPeriodUnit: (v: "hours" | "days") => void;
  periodValue: number;
  setPeriodValue: (v: number) => void;
  splitOwner: number;
  setSplitOwner: (v: number) => void;
  splitBorrower: number;
  whitelistId: string;
  setWhitelistId: (v: string) => void;
  myWhitelists: { id: string; name: string | null }[];
  channelling: boolean;
  setChannelling: (v: boolean) => void;
  useSuggestedPrice: boolean;
  setUseSuggestedPrice: (v: boolean) => void;
  flatPrice: string;
  setFlatPrice: (v: string) => void;
  selectedRows: GotchiRow[];
  overrides: Record<string, string>;
  setOverrides: (r: Record<string, string>) => void;
  onAutoPriceAll: (goal: AutoPriceGoal) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const splitsOk = splitOwner + splitBorrower === 100;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Auto-price all selected</span>
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">
            Computes per-gotchi price using same-band/duration comps + channelling premium signal.
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onAutoPriceAll("balance")}
              className="h-8 px-2.5 rounded text-xs border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-semibold"
            >
              Balance
            </button>
            <button
              type="button"
              onClick={() => onAutoPriceAll("maximize_revenue")}
              className="h-8 px-2.5 rounded text-xs border border-border/40 hover:bg-muted/50"
            >
              Max revenue
            </button>
            <button
              type="button"
              onClick={() => onAutoPriceAll("fast_fill")}
              className="h-8 px-2.5 rounded text-xs border border-border/40 hover:bg-muted/50"
            >
              Fast fill
            </button>
          </div>
        </div>

        <Section label="Period" icon={<Clock className="w-3.5 h-3.5" />}>
          <div className="inline-flex rounded-md border border-border/40 bg-background/40 p-0.5 mr-2 align-middle">
            {(["days", "hours"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  if (u === periodUnit) return;
                  if (u === "hours") {
                    setPeriodValue(Math.max(1, Math.min(720, Math.round(periodValue * 24))));
                  } else {
                    setPeriodValue(Math.max(1, Math.min(30, Math.max(1, Math.round(periodValue / 24)))));
                  }
                  setPeriodUnit(u);
                }}
                className={`px-2.5 h-7 rounded text-xs font-medium transition-colors ${
                  periodUnit === u
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {u === "days" ? "Days" : "Hours"}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            max={periodUnit === "days" ? 30 : 720}
            value={periodValue}
            onChange={(e) => {
              const max = periodUnit === "days" ? 30 : 720;
              setPeriodValue(Math.max(1, Math.min(max, Number(e.target.value) || 1)));
            }}
            className="w-24 h-9 px-2 rounded border border-border/40 bg-background/70 text-sm align-middle"
          />
          <span className="ml-2 text-xs text-muted-foreground">
            {periodUnit === "days" ? "days (max 30)" : "hours (max 720)"}
          </span>
        </Section>

        <Section label="Pricing" icon={<Coins className="w-3.5 h-3.5" />}>
          <div className="flex items-center gap-1 mb-2">
            <button
              type="button"
              onClick={() => setUseSuggestedPrice(true)}
              className={`px-2 py-1 rounded text-[11px] border ${
                useSuggestedPrice
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border/40 text-muted-foreground"
              }`}
            >
              Suggested per BRS band
            </button>
            <button
              type="button"
              onClick={() => setUseSuggestedPrice(false)}
              className={`px-2 py-1 rounded text-[11px] border ${
                !useSuggestedPrice
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : "border-border/40 text-muted-foreground"
              }`}
            >
              Flat price
            </button>
          </div>
          {!useSuggestedPrice && (
            <input
              type="number"
              min={0}
              step="any"
              value={flatPrice}
              onChange={(e) => setFlatPrice(e.target.value)}
              placeholder="GHST per gotchi"
              className="w-full h-9 px-2 rounded border border-border/40 bg-background/70 text-sm"
            />
          )}
        </Section>

        <Section label="Channelled alchemica split">
          <div className="grid grid-cols-2 gap-2">
            <SplitCell label="Lender %" value={splitOwner} onChange={setSplitOwner} />
            <SplitCell label="Borrower %" value={splitBorrower} disabled />
          </div>
          {!splitsOk && (
            <p className="text-[10px] text-destructive mt-1">
              Splits must sum to 100.
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            Splits any alchemica the borrower channels via realm parcels. Battler
            winnings go direct to the borrower regardless.
          </p>
        </Section>

        <Section label="Whitelist" icon={<Lock className="w-3.5 h-3.5" />}>
          <select
            value={whitelistId}
            onChange={(e) => setWhitelistId(e.target.value)}
            className="w-full h-9 px-2 rounded border border-border/40 bg-background/70 text-sm"
          >
            <option value="0">Open (any borrower)</option>
            {myWhitelists.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name || `Whitelist #${w.id}`}
              </option>
            ))}
          </select>
        </Section>

        <Section label="Channelling">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={channelling}
              onChange={(e) => setChannelling(e.target.checked)}
            />
            Allow channelling
          </label>
        </Section>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
          Per-gotchi preview ({selectedRows.length})
        </div>
        <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30 max-h-[55vh] overflow-y-auto">
          {selectedRows.map((r) => {
            const def = useSuggestedPrice ? suggestedPrice(r.modBRS) : Number(flatPrice) || 0;
            const v = overrides[r.tokenId] ?? String(def);
            return (
              <div key={r.tokenId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    #{r.tokenId} · BRS {r.modBRS}
                  </div>
                </div>
                <input
                  type="number"
                  value={v}
                  onChange={(e) =>
                    setOverrides({ ...overrides, [r.tokenId]: e.target.value })
                  }
                  className="w-20 h-7 px-1.5 rounded border border-border/40 bg-background/70 text-xs text-right"
                />
                <span className="text-[10px] text-muted-foreground w-12">GHST</span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-10 px-4 rounded-md border border-border/40 hover:bg-muted/50 text-sm"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!splitsOk || selectedRows.length === 0}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-semibold"
          >
            Sign 1 tx for {selectedRows.length} listings <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Step3Submit({
  submittedRows,
  skippedRows,
  txStep,
  txError,
  successCount,
  failCount,
  done,
  chunkIndex,
  totalChunks,
  chunksDone,
  onBack,
}: {
  submittedRows: GotchiRow[];
  skippedRows: GotchiRow[];
  txStep: string;
  txError: string | null;
  successCount: number;
  failCount: number;
  done: boolean;
  chunkIndex: number;
  totalChunks: number;
  chunksDone: number;
  onBack: () => void;
}) {
  const submitting = txStep === "submitting";
  const confirming = txStep === "confirming";
  const errored = txStep === "error";
  const multiChunk = totalChunks > 1;

  return (
    <div className="space-y-3">
      <div className="rounded-lg glass p-3 text-sm">
        {done && successCount > 0 && (
          <span className="inline-flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            {multiChunk
              ? `Done — ${successCount} listings confirmed across ${chunksDone} tx${chunksDone === 1 ? "" : "s"}`
              : `Done — all ${successCount} listings confirmed in one tx`}
          </span>
        )}
        {done && errored && (
          <span className="inline-flex items-center gap-2 text-destructive font-medium">
            <XCircle className="w-4 h-4" />
            Batch {chunkIndex + 1}/{totalChunks} failed — {failCount} listings in this batch did not go through ({successCount} succeeded in earlier batches)
          </span>
        )}
        {!done && submitting && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {multiChunk
              ? `Sign batch ${chunkIndex + 1}/${totalChunks} in your wallet… (${submittedRows.length} total gotchis, chunked to stay under per-tx gas limit)`
              : `Sign in your wallet… (one tx for all ${submittedRows.length} gotchis)`}
          </span>
        )}
        {!done && confirming && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {multiChunk
              ? `Confirming batch ${chunkIndex + 1}/${totalChunks} on-chain…`
              : `Confirming on-chain… (${submittedRows.length} listings in one tx)`}
          </span>
        )}
      </div>

      {errored && txError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive break-words">
          {txError}
        </div>
      )}

      {skippedRows.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
          <div className="font-medium mb-1">
            {skippedRows.length} gotchis skipped — owned by a different wallet
          </div>
          <div className="text-[11px] opacity-80">
            Switch to {Array.from(new Set(skippedRows.map((r) => r.ownerWallet))).map((w) => `${w.slice(0, 6)}…${w.slice(-4)}`).join(", ")} in your wallet, then come back and re-run for those.
          </div>
        </div>
      )}

      <div className="rounded-lg glass divide-y divide-border/30 max-h-[60vh] overflow-y-auto">
        {submittedRows.map((r, idx) => {
          // Map this row to its chunk so per-row status reflects actual chunk
          // state instead of the global tx step (which only reports the
          // currently-in-flight chunk).
          const chunkSize = totalChunks > 0
            ? Math.ceil(submittedRows.length / totalChunks)
            : submittedRows.length;
          const myChunk = Math.floor(idx / chunkSize);
          const myChunkDone = myChunk < chunksDone;
          const myChunkActive = myChunk === chunkIndex && (txStep === "submitting" || txStep === "confirming");
          const myChunkFailed = myChunk === chunkIndex && txStep === "error";
          const ok = myChunkDone || (txStep === "success" && myChunk <= chunkIndex);
          const fail = myChunkFailed;
          const pending = !ok && !fail && !myChunkActive;
          return (
            <div key={r.tokenId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="w-5">
                {ok && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {fail && <XCircle className="w-4 h-4 text-destructive" />}
                {myChunkActive && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {pending && <div className="w-3 h-3 rounded-full border border-border/40" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs">{r.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  #{r.tokenId} · BRS {r.modBRS}
                  {totalChunks > 1 && (
                    <span className="ml-1.5 opacity-70">· batch {myChunk + 1}/{totalChunks}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="h-9 px-3 rounded-md border border-border/40 hover:bg-muted/50 text-xs"
        >
          ← Back to terms
        </button>
        {done && successCount > 0 && (
          <Link
            to="/lending/me"
            className="h-9 px-4 inline-flex items-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
          >
            View my listings
          </Link>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function SplitCell({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange?.(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
        }
        className={`w-full h-8 px-2 rounded border border-border/40 bg-background/70 text-sm text-right ${
          disabled ? "opacity-60" : ""
        }`}
      />
    </div>
  );
}
