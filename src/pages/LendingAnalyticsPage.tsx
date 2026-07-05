import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ArrowLeft,
  TrendingUp,
  Coins,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
} from "lucide-react";
import { useHistoricalLendings } from "@/hooks/useHistoricalLendings";
import {
  buildPriceHeatmap,
  buildDailyVolume,
  buildWhitelistLeaderboard,
  buildBorrowerLeaderboard,
  buildLenderLeaderboard,
  buildHeroStats,
  buildPriceHistogram,
  buildDurationHistogram,
  buildBRSHistogram,
  buildChannellingComparison,
  buildTopGotchis,
  buildBandStats,
  recentLendings,
  lendingsInCell,
  filterByAddress,
} from "@/lib/lending/analytics";
import { BRS_BANDS } from "@/lib/lending/types";
import { HeatmapPriceMatrix } from "@/components/lending/HeatmapPriceMatrix";
import { SuggestedPriceWidget } from "@/components/lending/SuggestedPriceWidget";
import { AnalyticsToolbar } from "@/components/lending/AnalyticsToolbar";
import { BarHistogram } from "@/components/lending/BarHistogram";
import { DrillDownPanel } from "@/components/lending/DrillDownPanel";
import { ChannellingPremiumPanel } from "@/components/lending/ChannellingPremiumPanel";
import { TopGotchisLeaderboard } from "@/components/lending/TopGotchisLeaderboard";
import { BandStatsTable } from "@/components/lending/BandStatsTable";
import { RecentLendingsFeed } from "@/components/lending/RecentLendingsFeed";
import { LendingDetailModal } from "@/components/lending/LendingDetailModal";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";

export default function LendingAnalyticsPage() {
  const [windowDays, setWindowDays] = useState<30 | 60 | 90>(30);
  const { lendings, loading, error } = useHistoricalLendings(90);
  const [addressFilter, setAddressFilter] = useState<string | null>(null);
  const [drill, setDrill] = useState<{
    title: string;
    subtitle?: string;
    lendings: typeof lendings;
  } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const detailId = searchParams.get("l");
  const closeDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("l");
    setSearchParams(next, { replace: true });
  };

  const windowed = useMemo(() => {
    const cutoff = Math.floor(Date.now() / 1000) - windowDays * 86400;
    return lendings.filter((l) => l.timeAgreed >= cutoff);
  }, [lendings, windowDays]);

  const filtered = useMemo(
    () => filterByAddress(windowed, addressFilter),
    [windowed, addressFilter]
  );

  // Summarize as-lender / as-borrower counts when filtering
  const addressBreakdown = useMemo(() => {
    if (!addressFilter) return null;
    const a = addressFilter.toLowerCase();
    const asLender = filtered.filter((l) => l.lender.toLowerCase() === a);
    const asBorrower = filtered.filter((l) => l.borrower?.toLowerCase() === a);
    return {
      asLender: asLender.length,
      asBorrower: asBorrower.length,
      lenderEarned: asLender.reduce((s, l) => s + l.upfrontGhst, 0),
      borrowerSpent: asBorrower.reduce((s, l) => s + l.upfrontGhst, 0),
    };
  }, [filtered, addressFilter]);

  const hero = useMemo(() => buildHeroStats(filtered), [filtered]);
  const heatmap = useMemo(() => buildPriceHeatmap(filtered), [filtered]);
  const volume = useMemo(() => buildDailyVolume(filtered, windowDays), [filtered, windowDays]);
  const priceHist = useMemo(() => buildPriceHistogram(filtered), [filtered]);
  const durHist = useMemo(() => buildDurationHistogram(filtered), [filtered]);
  const brsHist = useMemo(() => buildBRSHistogram(filtered), [filtered]);
  const channelling = useMemo(() => buildChannellingComparison(filtered), [filtered]);
  const topGotchis = useMemo(() => buildTopGotchis(filtered), [filtered]);
  const bandStats = useMemo(() => buildBandStats(filtered), [filtered]);
  const whitelists = useMemo(() => buildWhitelistLeaderboard(filtered), [filtered]);
  const borrowers = useMemo(() => buildBorrowerLeaderboard(filtered), [filtered]);
  const lenders = useMemo(() => buildLenderLeaderboard(filtered), [filtered]);
  const recent = useMemo(() => recentLendings(filtered, 18), [filtered]);

  const presetAddresses = useMemo(() => {
    const seen = new Set<string>();
    const result: { address: string; label: string }[] = [];
    for (const l of lenders.slice(0, 5)) {
      if (!seen.has(l.address)) {
        seen.add(l.address);
        result.push({ address: l.address, label: `Top lender: ${shortAddr(l.address)}` });
      }
    }
    for (const b of borrowers.slice(0, 5)) {
      if (!seen.has(b.address)) {
        seen.add(b.address);
        result.push({ address: b.address, label: `Top borrower: ${shortAddr(b.address)}` });
      }
    }
    return result;
  }, [lenders, borrowers]);

  const handleHeatmapClick = (band: string, dur: string) => {
    const items = lendingsInCell(filtered, band, dur);
    setDrill({
      title: `${band} BRS · ${dur}`,
      subtitle: `${items.length} lendings in this cell`,
      lendings: items,
    });
  };

  const handleBandClick = (band: string) => {
    const b = BRS_BANDS.find((x: typeof BRS_BANDS[number]) => x.label === band);
    if (!b) return;
    const items = filtered.filter((l) => l.gotchiBRS >= b.min && l.gotchiBRS < b.max);
    setDrill({
      title: `${band} BRS band`,
      subtitle: `${items.length} lendings in window`,
      lendings: items,
    });
  };

  const drillToAddress = (addr: string, label: string) => {
    const a = addr.toLowerCase();
    const items = filtered.filter(
      (l) => l.lender.toLowerCase() === a || l.borrower?.toLowerCase() === a
    );
    setDrill({
      title: label,
      subtitle: `${shortAddr(addr)} · ${items.length} lendings`,
      lendings: items,
    });
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <Seo
        title="Lending Analytics · GotchiCloset"
        description="Comprehensive Aavegotchi rental analytics on Base: heatmaps, distributions, leaderboards, address drill-downs, and a suggested-price tool."
        canonical={siteUrl("/lending/analytics")}
      />

      <div className="flex items-center justify-between mb-4">
        <div>
          <Link
            to="/lending"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3 h-3" /> Back to marketplace
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Lending Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Aavegotchi rental market on Base · click anything to drill in
          </p>
        </div>
      </div>

      <AnalyticsToolbar
        windowDays={windowDays}
        onWindowChange={setWindowDays}
        addressFilter={addressFilter}
        onAddressFilterChange={setAddressFilter}
        presetAddresses={presetAddresses}
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 mb-4 text-sm">
          Failed to load: {error}
        </div>
      )}

      {addressFilter && addressBreakdown && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Filtered to</div>
            <div className="font-mono font-semibold">{shortAddr(addressFilter)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">As lender</div>
            <div className="font-semibold">{addressBreakdown.asLender} listings</div>
            <div className="text-[10px] text-muted-foreground">
              {Math.round(addressBreakdown.lenderEarned).toLocaleString()} GHST upfront earned
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">As borrower</div>
            <div className="font-semibold">{addressBreakdown.asBorrower} rentals</div>
            <div className="text-[10px] text-muted-foreground">
              {Math.round(addressBreakdown.borrowerSpent).toLocaleString()} GHST upfront spent
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Net</div>
            <div className="font-semibold">
              {Math.round(addressBreakdown.lenderEarned - addressBreakdown.borrowerSpent).toLocaleString()} GHST
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat
          icon={<Activity className="w-4 h-4" />}
          label="Lendings agreed"
          value={hero.agreed30d.toLocaleString()}
          loading={loading}
        />
        <Stat
          icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
          label="Completed"
          value={hero.completed30d.toLocaleString()}
          loading={loading}
        />
        <Stat
          icon={<XCircle className="w-4 h-4 text-destructive" />}
          label="Cancelled"
          value={hero.cancelled30d.toLocaleString()}
          loading={loading}
        />
        <Stat
          icon={<Coins className="w-4 h-4 text-amber-500" />}
          label="Total upfront"
          value={`${Math.round(hero.totalUpfrontGhst30d).toLocaleString()} GHST`}
          loading={loading}
        />
        <Stat
          icon={<TrendingUp className="w-4 h-4 text-primary" />}
          label="Median paid"
          value={hero.medianUpfrontPaid > 0 ? `${hero.medianUpfrontPaid.toFixed(1)} GHST` : "None"}
          loading={loading}
        />
        <Stat
          icon={<Zap className="w-4 h-4 text-amber-500" />}
          label="Channelling on"
          value={`${hero.channellingAllowedPct}%`}
          loading={loading}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        {/* min-w-0: grid items default to min-width:auto, letting the heatmap
            table's intrinsic width blow the page out past 375px viewports. */}
        <div className="lg:col-span-2 rounded-xl glass p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Price heatmap</h2>
            <span className="text-[10px] text-muted-foreground">
              median GHST · click cell to drill
            </span>
          </div>
          {loading ? (
            <div className="h-64 bg-muted/30 animate-pulse rounded" />
          ) : (
            <HeatmapPriceMatrix cells={heatmap} onCellClick={handleHeatmapClick} />
          )}
        </div>

        <SuggestedPriceWidget lendings={filtered} />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <BarHistogram title="Price distribution (paid)" bins={priceHist} unit=" GHST" color="green" />
        <BarHistogram title="Duration distribution" bins={durHist} color="primary" />
        <BarHistogram title="BRS distribution" bins={brsHist} color="pink" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl glass p-4">
          <h2 className="font-semibold mb-3">Daily volume (last {windowDays} days)</h2>
          {loading ? (
            <div className="h-64 bg-muted/30 animate-pulse rounded" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volume} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="agreedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="agreed"
                    name="Agreed"
                    stroke="hsl(var(--primary))"
                    fill="url(#agreedGrad)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    name="Completed"
                    stroke="#10b981"
                    fill="url(#completedGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <ChannellingPremiumPanel rows={channelling} />
      </div>

      <div className="mb-4">
        <RecentLendingsFeed lendings={recent} />
      </div>

      <div className="mb-4">
        <BandStatsTable rows={bandStats} onBandClick={handleBandClick} />
      </div>

      <div className="mb-4">
        <TopGotchisLeaderboard rows={topGotchis} />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Leaderboard
          title="Top whitelists"
          loading={loading}
          rows={whitelists.slice(0, 10).map((w) => ({
            primary: w.name || `WL #${w.whitelistId}`,
            secondary: w.whitelistId === "0" ? "Open market" : `id ${w.whitelistId}`,
            metric: `${w.count} agreements`,
            sub: w.medianGhst > 0 ? `~${w.medianGhst.toFixed(1)} GHST median` : "free",
          }))}
        />

        <Leaderboard
          title="Top lenders"
          loading={loading}
          rows={lenders.map((l) => ({
            primary: shortAddr(l.address),
            secondary: l.address,
            metric: `${l.count} listings`,
            sub: `${Math.round(l.totalGhst).toLocaleString()} GHST`,
            onClick: () => drillToAddress(l.address, `Lender ${shortAddr(l.address)}`),
          }))}
        />

        <Leaderboard
          title="Top borrowers"
          loading={loading}
          rows={borrowers.map((b) => ({
            primary: shortAddr(b.address),
            secondary: b.address,
            metric: `${b.count} rentals`,
            sub: `${Math.round(b.totalGhst).toLocaleString()} GHST`,
            onClick: () => drillToAddress(b.address, `Borrower ${shortAddr(b.address)}`),
          }))}
        />
      </div>

      {drill && (
        <DrillDownPanel
          title={drill.title}
          subtitle={drill.subtitle}
          lendings={drill.lendings}
          onClose={() => setDrill(null)}
        />
      )}

      {detailId && <LendingDetailModal lendingId={detailId} onClose={closeDetail} />}
    </div>
  );
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function Stat({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl glass p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold">
        {loading ? <span className="inline-block w-16 h-5 bg-muted/40 animate-pulse rounded" /> : value}
      </div>
    </div>
  );
}

function Leaderboard({
  title,
  rows,
  loading,
}: {
  title: string;
  loading: boolean;
  rows: {
    primary: string;
    secondary: string;
    metric: string;
    sub: string;
    onClick?: () => void;
  }[];
}) {
  return (
    <div className="rounded-xl glass p-4">
      <h2 className="font-semibold mb-2">{title}</h2>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 bg-muted/30 animate-pulse rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-4 text-center">No data</div>
      ) : (
        <div className="divide-y divide-border/20">
          {rows.map((r, i) => {
            const inner = (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono w-5">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate" title={r.secondary}>
                    {r.primary}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {r.secondary}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-medium">{r.metric}</div>
                  <div className="text-[10px] text-muted-foreground">{r.sub}</div>
                </div>
              </div>
            );
            return r.onClick ? (
              <button
                key={i}
                type="button"
                onClick={r.onClick}
                className="block w-full text-left py-2 hover:bg-muted/30 -mx-2 px-2 rounded transition-colors"
              >
                {inner}
              </button>
            ) : (
              <div key={i} className="py-2">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
