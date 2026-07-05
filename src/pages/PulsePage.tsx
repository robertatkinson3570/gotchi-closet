import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartPulse, Loader2, Info } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Seo } from "@/components/Seo";
import { PulseVideoHero } from "@/components/megaphone/PulseVideoHero";
import { siteUrl } from "@/lib/site";
import { env } from "@/lib/env";
import { addDays } from "@/lib/pulse/aggregate";
import type { PulsePayload } from "@/lib/pulse/payload";
import type { PulseVerdict, VerdictColor } from "@/lib/pulse/verdicts";

type PulseResponse = PulsePayload | { building: true };
const isBuilding = (d: PulseResponse | undefined): d is { building: true } => !!d && "building" in d;

async function fetchPulse(): Promise<PulseResponse> {
  const res = await fetch(`${env.companionApiUrl}/api/pulse`);
  if (res.status === 202) return { building: true };
  if (!res.ok) throw new Error(`pulse request failed: ${res.status}`);
  return res.json();
}

const WINDOWS = [
  { key: "30D", days: 30 },
  { key: "90D", days: 90 },
  { key: "1Y", days: 365 },
  { key: "All", days: 0 },
] as const;

// Categorical palette from the brand triad, validated (CVD ΔE ≥ 57, both modes).
// Fixed assignment order — never re-mapped when a category is empty.
const CAT_COLORS = { gotchis: "#b566ff", wearables: "#00a294", parcels: "#ab8410", other: "#f0439b" } as const;

const fmtGhst = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(2)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtUsd = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtDelta = (d: number | null) => (d == null ? "None" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`);

const VERDICT_STYLE: Record<VerdictColor, string> = {
  green: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]",
  yellow: "bg-amber-500/15 text-amber-500 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.25)]",
  red: "bg-red-500/15 text-red-500 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.25)]",
  accruing: "bg-muted/40 text-muted-foreground border-border/40",
};
const VERDICT_TEXT: Record<VerdictColor, string> = {
  green: "healthy", yellow: "softening", red: "shrinking", accruing: "accruing",
};

const TOOLTIP_STYLE = {
  fontSize: 12,
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--foreground))",
} as const;

/** Neon card shell: phantom-void gradient + color-matched blur orb (StatsPage pattern). */
function GlowCard({ accent, className = "", children }: { accent: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 ring-1 ring-primary/5 ${className}`}>
      <div className={`absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl pointer-events-none ${accent}`} />
      <div className="relative">{children}</div>
    </div>
  );
}

function VerdictChip({ v }: { v: VerdictColor }) {
  return <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${VERDICT_STYLE[v]}`}>{VERDICT_TEXT[v]}</span>;
}

function HeroTile({ label, value, sub, delta, verdict, spark, accent, sparkColor }: {
  label: string; value: string; sub?: string; delta?: number | null; verdict?: VerdictColor;
  spark?: { day: string; value: number }[]; accent: string; sparkColor: string;
}) {
  const gradId = `spark-${label.replace(/\W+/g, "")}`;
  return (
    <GlowCard accent={accent} className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        {verdict && <VerdictChip v={verdict} />}
      </div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{sub}</span>
        {delta !== undefined && (
          <span className={`text-xs font-semibold ${delta != null && delta < 0 ? "text-red-500" : "text-emerald-500"}`}>{fmtDelta(delta ?? null)} 30d</span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="h-10 mt-2 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={sparkColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke={sparkColor} fill={`url(#${gradId})`} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlowCard>
  );
}

function RealityLever({ verdicts, keys }: { verdicts: PulseVerdict[]; keys: string[] }) {
  const rows = verdicts.filter((v) => keys.includes(v.key));
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {rows.map((v) => (
        <div key={v.key} className="rounded-xl border border-border/40 bg-muted/10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold">{v.label}</span>
            <VerdictChip v={v.verdict} />
            {v.delta != null && <span className="text-xs text-muted-foreground">{fmtDelta(v.delta)}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{v.ruleText}</p>
          <div className="mt-2 rounded-lg bg-primary/5 border border-primary/25 p-2.5 shadow-[0_0_14px_-6px_hsl(var(--primary)/0.5)]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-0.5">Lever · opinion, aspirational</div>
            <p className="text-xs">{v.lever}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PulsePage() {
  const [win, setWin] = useState<(typeof WINDOWS)[number]>(WINDOWS[1]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["pulse"],
    queryFn: fetchPulse,
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (isBuilding(q.state.data) ? 5000 : false),
  });

  const p = !isBuilding(data) ? data : undefined;

  const slice = useMemo(() => {
    if (!p) return () => [] as { day: string; value: number }[];
    const volSeries = p.series.sales_volume_ghst ?? [];
    const lastDay = volSeries.length ? volSeries[volSeries.length - 1].day : "";
    const from = win.days > 0 ? addDays(lastDay, -win.days) : "";
    return (key: string) => (p.series[key] ?? []).filter((pt) => pt.day >= from);
  }, [p, win]);

  const volumeChart = useMemo(() => {
    if (!p) return [];
    const byDay = (key: string) => new Map(slice(key).map((x) => [x.day, x.value]));
    const wearables = byDay("sales_ghst_wearables");
    const parcels = byDay("sales_ghst_parcels");
    const other = byDay("sales_ghst_other");
    return slice("sales_ghst_gotchis").map((g) => ({
      day: g.day,
      gotchis: g.value,
      wearables: wearables.get(g.day) ?? 0,
      parcels: parcels.get(g.day) ?? 0,
      other: other.get(g.day) ?? 0,
    }));
  }, [p, slice]);

  return (
    <div className="container mx-auto max-w-[1100px] px-4 py-6">
      <Seo title="Pulse: State of the Aavegotchiverse" description="Daily GHST and marketplace health metrics for Aavegotchi on Base: price, volume, buyers, holders, with transparent health verdicts." canonical={siteUrl("/pulse")} />

      <h1 className="text-3xl font-bold tracking-tight inline-flex items-center gap-2.5 mb-1">
        <span className="relative inline-flex">
          <HeartPulse className="w-7 h-7 text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.6)]" />
        </span>
        <span className="bg-gradient-to-r from-[hsl(var(--spectral))] via-[hsl(var(--ghst-pink))] to-[hsl(var(--cyan))] bg-clip-text text-transparent">Pulse</span>
      </h1>
      <p className="text-sm text-muted-foreground mb-5">State of the Aavegotchiverse: reality first, levers second. Chain: <span className="font-semibold text-foreground">Base</span></p>

      <PulseVideoHero />


      {error && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">{(error as Error).message}</div>}

      {isLoading || isBuilding(data) || !p ? (
        <div className="flex flex-col items-center gap-3 py-20 text-sm text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          {isBuilding(data) ? "Building history from the chain, first run takes a few minutes…" : "Loading…"}
        </div>
      ) : (
        <>
          {/* Hero tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <HeroTile label="GHST price" value={fmtUsd(p.latest.ghst_price_usd ?? 0)} delta={p.deltas.ghst_price_usd?.mom} verdict={p.verdicts.find((v) => v.key === "ghst-price")?.verdict} spark={slice("ghst_price_usd")} accent="bg-primary/20" sparkColor="hsl(var(--spectral))" />
            <HeroTile label="Market cap (approx)" value={fmtUsd(p.latest.ghst_mcap_usd ?? 0)} sub="price × current supply" spark={slice("ghst_mcap_usd")} accent="bg-[hsl(var(--cyan))]/15" sparkColor="hsl(var(--cyan))" />
            <HeroTile label="30d volume" value={`${fmtGhst(p.windows.sales_volume_ghst_30d)} GHST`} sub={`≈ ${fmtUsd(p.windows.sales_volume_usd_30d)}`} delta={p.deltas.sales_volume_ghst?.mom} verdict={p.verdicts.find((v) => v.key === "sales-volume")?.verdict} spark={slice("sales_volume_ghst")} accent="bg-[hsl(var(--ghst-pink))]/15" sparkColor="hsl(var(--ghst-pink))" />
            <HeroTile label="30d buyers" value={fmtGhst(p.windows.sales_buyers_30d)} sub={`${fmtGhst(p.windows.sales_count_30d)} sales`} delta={p.deltas.sales_buyers?.mom} verdict={p.verdicts.find((v) => v.key === "buyers")?.verdict} spark={slice("sales_buyers")} accent="bg-[hsl(var(--gold))]/15" sparkColor="hsl(var(--gold))" />
          </div>

          {/* Window toggle */}
          <div className="flex items-center gap-1.5 mt-6 mb-3">
            {WINDOWS.map((w) => (
              <button key={w.key} onClick={() => setWin(w)} className={`h-8 px-3.5 rounded-lg text-xs font-semibold border transition-shadow ${win.key === w.key ? "bg-primary/15 text-primary border-primary/40 shadow-[0_0_12px_-2px_hsl(var(--primary)/0.5)]" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>{w.key}</button>
            ))}
          </div>

          {/* Sales section */}
          <GlowCard accent="bg-primary/15" className="p-5">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Daily settled volume (GHST, by category)</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeChart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    {Object.entries(CAT_COLORS).map(([k, c]) => (
                      <linearGradient key={k} id={`vol-${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.06} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtGhst(v)} width={48} />
                  <Tooltip formatter={(v, name) => [`${fmtGhst(Number(v))} GHST`, String(name)]} contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  {/* Fixed category order; gradient fills, neon edge strokes */}
                  <Area type="monotone" dataKey="gotchis" stackId="v" stroke={CAT_COLORS.gotchis} strokeWidth={1.5} fill="url(#vol-gotchis)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="wearables" stackId="v" stroke={CAT_COLORS.wearables} strokeWidth={1.5} fill="url(#vol-wearables)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="parcels" stackId="v" stroke={CAT_COLORS.parcels} strokeWidth={1.5} fill="url(#vol-parcels)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="other" stackId="v" stroke={CAT_COLORS.other} strokeWidth={1.5} fill="url(#vol-other)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <MiniChart title="Unique buyers / day" data={slice("sales_buyers")} color="hsl(var(--cyan))" />
              <MiniChart title="Average sale (GHST)" data={slice("sales_avg_ghst")} color="hsl(var(--ghst-pink))" />
            </div>
            <RealityLever verdicts={p.verdicts} keys={["sales-volume", "buyers"]} />
          </GlowCard>

          {/* Engagement section */}
          <GlowCard accent="bg-[hsl(var(--ecto))]/12" className="p-5 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Gotchis summoned / day (portals claimed on Base)</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slice("gotchis_summoned")} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="summons-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--ecto))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--ecto))" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={36} allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${Number(v)} summoned`, "gotchis"]} contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--ecto))" fill="url(#summons-fill)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
              <Accruing label="Gotchis (claimed)" value={p.latest.gotchis_total} since={p.trackingSince.gotchis_total} fmt={(v) => v.toLocaleString()} />
              <Accruing label="Petted last 24h" value={p.latest.gotchis_petted_24h} since={p.trackingSince.gotchis_petted_24h} fmt={(v) => v.toLocaleString()} />
              <Accruing label="Petted last 7d" value={p.latest.gotchis_petted_7d} since={p.trackingSince.gotchis_petted_7d} fmt={(v) => v.toLocaleString()} />
              <Accruing label="Kinship avg / median" value={p.latest.kinship_avg} since={p.trackingSince.kinship_avg} fmt={(v) => `${Math.round(v)} / ${Math.round(p.latest.kinship_median ?? 0)}`} />
            </div>
            <RealityLever verdicts={p.verdicts} keys={["summons", "petting"]} />
          </GlowCard>

          {/* Lending section */}
          <GlowCard accent="bg-[hsl(var(--cyan))]/12" className="p-5 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Lending agreements / day</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slice("lendings_agreed")} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="lend-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--cyan))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--cyan))" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={36} allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${Number(v)} agreements`, "lendings"]} contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--cyan))" fill="url(#lend-fill)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <MiniChart title="Unique borrowers / day" data={slice("lending_borrowers")} color="hsl(var(--ghst-pink))" />
              <MiniChart title="Upfront GHST / day" data={slice("lending_upfront_ghst")} color="hsl(var(--gold))" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 mt-4">
              <Accruing label="30d lendings" value={p.windows.lendings_agreed_30d} fmt={(v) => v.toLocaleString()} />
              <Accruing label="Channeled last 7d" value={p.latest.gotchis_channeled_7d} since={p.trackingSince.gotchis_channeled_7d} fmt={(v) => `${v.toLocaleString()} gotchis`} />
            </div>
            <RealityLever verdicts={p.verdicts} keys={["lending", "channeling"]} />
          </GlowCard>

          {/* DAO section */}
          <GlowCard accent="bg-[hsl(var(--gold))]/12" className="p-5 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">DAO turnout: VP cast per proposal close day (line = 7.2M quorum)</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slice("dao_turnout_vp")} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="dao-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={44} tickFormatter={(v: number) => fmtGhst(v)} />
                  <Tooltip formatter={(v) => [`${fmtGhst(Number(v))} VP`, "turnout"]} contentStyle={TOOLTIP_STYLE} />
                  <ReferenceLine y={7_200_000} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--gold))" fill="url(#dao-fill)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
              <Accruing label="Votable VP (live quorum calc)" value={p.latest.quorum_total_vp} since={p.trackingSince.quorum_total_vp} fmt={(v) => fmtGhst(v)} />
              <Accruing label="DAO treasury GHST" value={p.latest.treasury_ghst} since={p.trackingSince.treasury_ghst} fmt={(v) => `${fmtGhst(v)} GHST`} />
              <MiniStat label="Quorum requirement" value="7.2M VP" />
            </div>
            <RealityLever verdicts={p.verdicts} keys={["dao-turnout"]} />
          </GlowCard>

          {/* GHST section */}
          <GlowCard accent="bg-[hsl(var(--cyan))]/12" className="p-5 mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">GHST price (USD)</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slice("ghst_price_usd")} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="ghst-price-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--spectral))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--spectral))" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} width={48} domain={["auto", "auto"]} />
                  <Tooltip formatter={(v) => [`$${Number(v).toFixed(4)}`, "GHST"]} contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="value" stroke="hsl(var(--spectral))" fill="url(#ghst-price-fill)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 mt-4">
              <Accruing label="GHST supply (Base)" value={p.latest.ghst_supply} since={p.trackingSince.ghst_supply} fmt={(v) => `${fmtGhst(v)} GHST`} />
              <Accruing label="Holders (Base)" value={p.latest.ghst_holders} since={p.trackingSince.ghst_holders} fmt={(v) => v.toLocaleString()} />
              <Accruing label="Gotchi floor" value={p.latest.gotchi_floor_ghst} since={p.trackingSince.gotchi_floor_ghst} fmt={(v) => `${fmtGhst(v)} GHST`} />
            </div>
            <RealityLever verdicts={p.verdicts} keys={["ghst-price", "holders"]} />
          </GlowCard>

          {/* Methodology */}
          <details className="mt-4 rounded-2xl border border-border/40 bg-muted/10 p-5">
            <summary className="text-sm font-semibold cursor-pointer inline-flex items-center gap-2"><Info className="w-4 h-4" /> Methodology & data sources</summary>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <p>Sales: settled Baazaar ERC721/ERC1155 listings + settled GBM auctions on Base (Goldsky subgraphs), bucketed by UTC day. ERC1155 volume is price × quantity. Historical USD uses that day's GHST price (DefiLlama), never today's.</p>
              <p>"Unique buyers" windows sum daily unique addresses (an address active on N days counts N times). Supply via Base RPC; holders via Blockscout; floor = cheapest active gotchi listing. Supply, holders and floor accrue forward from the tracking-since date. No history exists before it.</p>
              <p>Engagement: summons = portals claimed on Base by claim timestamp (backfilled). Petting, population and kinship stats come from a nightly full scan of claimed gotchis (kinship + last-interacted) and accrue forward from their tracking-since date.</p>
              <p>Lending: agreements by timeAgreed with upfront cost and unique borrowers (backfilled). Channeling = gotchiverse gotchis with lastChanneledAlchemica within 7 days (nightly count, accruing). DAO: turnout VP and vote counts by proposal close day from the aavegotchi.eth Snapshot space (backfilled); votable-VP and treasury snapshots come from this site's live-quorum pipeline.</p>
              <p className="font-semibold text-foreground">Verdict rules (computed, transparent):</p>
              <ul className="list-disc pl-5 space-y-1">
                {p.verdicts.map((v) => (<li key={v.key}><span className="font-medium text-foreground">{v.label}:</span> {v.ruleText}</li>))}
              </ul>
              <p>Levers are hand-written opinion about what would move each metric, aspirational by design, and labeled as such.</p>
              <p>Updated {new Date(p.updatedAt).toUTCString()}. Refreshes nightly at 03:10 UTC.</p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function MiniChart({ title, data, color }: { title: string; data: { day: string; value: number }[]; color: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-1">{title}</div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} minTickGap={50} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={36} tickFormatter={(v: number) => fmtGhst(v)} />
            <Tooltip formatter={(v) => [fmtGhst(Number(v)), title]} contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function Accruing({ label, value, since, fmt }: { label: string; value?: number; since?: string; fmt: (v: number) => string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value != null ? fmt(value) : "None"}</div>
      {since && <div className="text-[10px] text-muted-foreground">tracking since {since}</div>}
    </div>
  );
}
