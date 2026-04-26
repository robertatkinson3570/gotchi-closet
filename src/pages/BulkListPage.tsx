import { useEffect, useMemo, useState } from "react";
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
import { useAddListing } from "@/hooks/useLendingTx";
import { useHistoricalLendings } from "@/hooks/useHistoricalLendings";
import { useAlchemicaPrices } from "@/hooks/useAlchemicaPrices";
import { autoPriceBatch, type AutoPriceGoal } from "@/lib/lending/autoPrice";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { useAddressState } from "@/lib/addressState";
import { switchToBaseChain } from "@/lib/chains";
import { env } from "@/lib/env";
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
      queryKey: ["gotchis", owner],
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
  const [periodDays, setPeriodDays] = useState(7);
  const [whitelistId, setWhitelistId] = useState("0");
  const [splitOwner, setSplitOwner] = useState(20);
  const [splitOther, setSplitOther] = useState(
    env.lendingFeeAddress ? Number(env.lendingFeePct) || 0 : 0
  );
  const [thirdParty, setThirdParty] = useState(env.lendingFeeAddress);
  const [channelling, setChannelling] = useState(true);
  const [useSuggestedPrice, setUseSuggestedPrice] = useState(true);
  const [flatPrice, setFlatPrice] = useState("");
  const splitBorrower = Math.max(0, 100 - splitOwner - splitOther);

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
      setPeriodDays(median);
    }
    setChannelling(channellingOn >= selectedRows.length / 2);
    // If majority is channelling-mode, push the lender split higher (50/50)
    if (modeChannelling > modeBattler) {
      setSplitOwner(50);
    } else {
      setSplitOwner(20);
    }
    void modeBattler;
  };

  // Submit queue state
  const [queueIdx, setQueueIdx] = useState<number | null>(null);
  const [queueResults, setQueueResults] = useState<
    Record<string, "pending" | "success" | "error">
  >({});
  const list = useAddListing();

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

  // Listing queue: drive sequentially based on tx state
  useEffect(() => {
    if (queueIdx == null) return;
    if (queueIdx >= selectedRows.length) return;
    if (list.step === "success") {
      const cur = selectedRows[queueIdx];
      setQueueResults((r) => ({ ...r, [cur.tokenId]: "success" }));
      list.reset();
      setQueueIdx((i) => (i ?? 0) + 1);
      return;
    }
    if (list.step === "error") {
      const cur = selectedRows[queueIdx];
      setQueueResults((r) => ({ ...r, [cur.tokenId]: "error" }));
      list.reset();
      setQueueIdx((i) => (i ?? 0) + 1);
      return;
    }
  }, [list.step, queueIdx, selectedRows, list]);

  // When advancing or starting, fire next tx
  useEffect(() => {
    if (queueIdx == null || queueIdx >= selectedRows.length) return;
    const cur = selectedRows[queueIdx];
    if (queueResults[cur.tokenId]) return; // already processed
    if (list.step !== "idle") return; // wait for previous to settle

    // Skip rows owned by a different wallet — only the connected signer can list.
    if (
      cur.ownerWallet &&
      address &&
      cur.ownerWallet.toLowerCase() !== address.toLowerCase()
    ) {
      setQueueResults((r) => ({ ...r, [cur.tokenId]: "error" }));
      setQueueIdx((i) => (i ?? 0) + 1);
      return;
    }

    const ghst = (() => {
      if (overrides[cur.tokenId]) return Number(overrides[cur.tokenId]);
      if (useSuggestedPrice) return suggestedPrice(cur.modBRS);
      return Number(flatPrice) || 0;
    })();
    const initialCostWei = ghstToWei(ghst);
    setQueueResults((r) => ({ ...r, [cur.tokenId]: "pending" }));
    list.send({
      tokenId: Number(cur.tokenId),
      initialCostWei,
      periodSeconds: periodDays * 86400,
      splitOwner,
      splitBorrower,
      splitOther,
      originalOwner: (cur.ownerWallet || address) as `0x${string}`,
      thirdParty: (splitOther > 0 && thirdParty
        ? thirdParty
        : ZERO) as `0x${string}`,
      whitelistId: Number(whitelistId) || 0,
      revenueTokens: [],
      permissions: channelling ? BigInt(0) : BigInt(1),
    });
  }, [queueIdx, list, selectedRows, queueResults, overrides, useSuggestedPrice, flatPrice, periodDays, splitOwner, splitBorrower, splitOther, address, thirdParty, whitelistId, channelling]);

  const startQueue = () => {
    if (!address) return;
    setQueueResults({});
    setQueueIdx(0);
    setStep(3);
  };

  const queueDone = queueIdx != null && queueIdx >= selectedRows.length;
  const successCount = Object.values(queueResults).filter((s) => s === "success").length;
  const failCount = Object.values(queueResults).filter((s) => s === "error").length;

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
        Pick gotchis, set shared params, sign in sequence (one tx per gotchi).
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
              periodDays={periodDays}
              setPeriodDays={setPeriodDays}
              splitOwner={splitOwner}
              setSplitOwner={setSplitOwner}
              splitBorrower={splitBorrower}
              splitOther={splitOther}
              setSplitOther={setSplitOther}
              thirdParty={thirdParty}
              setThirdParty={setThirdParty}
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
              selectedRows={selectedRows}
              queueResults={queueResults}
              queueIdx={queueIdx}
              successCount={successCount}
              failCount={failCount}
              done={queueDone}
              onBack={() => {
                setQueueIdx(null);
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
  periodDays,
  setPeriodDays,
  splitOwner,
  setSplitOwner,
  splitBorrower,
  splitOther,
  setSplitOther,
  thirdParty,
  setThirdParty,
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
  periodDays: number;
  setPeriodDays: (v: number) => void;
  splitOwner: number;
  setSplitOwner: (v: number) => void;
  splitBorrower: number;
  splitOther: number;
  setSplitOther: (v: number) => void;
  thirdParty: string;
  setThirdParty: (v: string) => void;
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
  const splitsOk = splitOwner + splitBorrower + splitOther === 100;
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
          <input
            type="number"
            min={1}
            max={30}
            value={periodDays}
            onChange={(e) => setPeriodDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            className="w-24 h-9 px-2 rounded border border-border/40 bg-background/70 text-sm"
          />
          <span className="ml-2 text-xs text-muted-foreground">days (max 30)</span>
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

        <Section label="Revenue split (sum to 100%)">
          <div className="grid grid-cols-3 gap-2">
            <SplitCell label="Lender" value={splitOwner} onChange={setSplitOwner} />
            <SplitCell label="Borrower" value={splitBorrower} disabled />
            <SplitCell label="3rd party" value={splitOther} onChange={setSplitOther} />
          </div>
          {!splitsOk && (
            <p className="text-[10px] text-destructive mt-1">
              Splits sum to {splitOwner + splitBorrower + splitOther}%, must be 100.
            </p>
          )}
          {splitOther > 0 && (
            <input
              type="text"
              value={thirdParty}
              onChange={(e) => setThirdParty(e.target.value)}
              placeholder="0x… (third-party address)"
              className="mt-2 w-full h-8 px-2 rounded border border-border/40 bg-background/70 text-xs font-mono"
            />
          )}
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
            Sign {selectedRows.length} txs <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Step3Submit({
  selectedRows,
  queueResults,
  queueIdx,
  successCount,
  failCount,
  done,
  onBack,
}: {
  selectedRows: GotchiRow[];
  queueResults: Record<string, "pending" | "success" | "error">;
  queueIdx: number | null;
  successCount: number;
  failCount: number;
  done: boolean;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/40 bg-card/50 p-3 text-sm">
        {done ? (
          <span className="inline-flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Done — {successCount} listed{failCount > 0 ? `, ${failCount} failed` : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Signing transaction {(queueIdx ?? 0) + 1} of {selectedRows.length}…
          </span>
        )}
      </div>
      <div className="rounded-lg border border-border/40 bg-card/50 divide-y divide-border/30 max-h-[60vh] overflow-y-auto">
        {selectedRows.map((r, i) => {
          const status = queueResults[r.tokenId];
          const isCurrent = queueIdx === i && !status;
          return (
            <div key={r.tokenId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="w-5">
                {status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {status === "error" && <XCircle className="w-4 h-4 text-destructive" />}
                {status === "pending" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {isCurrent && !status && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {!isCurrent && !status && <span className="text-muted-foreground/40">·</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs">{r.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  #{r.tokenId} · BRS {r.modBRS}
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
        {done && (
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
