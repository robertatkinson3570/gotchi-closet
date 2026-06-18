import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Landmark, ExternalLink, Vote, Wrench, BookOpen, Megaphone, Bot, BarChart3, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { GHST_TOKEN_BASE, GLTR_TOKEN_BASE, ALCHEMICA_TOKENS_BASE, ERC20_ABI } from "@/lib/lending/contracts";

// AavegotchiDAO foundation liquidity address on Base (from the dapp config).
const DAO_TREASURY = "0x62DE034b1A69eF853c9d0D8a33D26DF5cF26682E" as const;

const TREASURY_TOKENS = [
  { symbol: "GHST", address: GHST_TOKEN_BASE, color: "text-purple-400" },
  { symbol: "GLTR", address: GLTR_TOKEN_BASE, color: "text-teal-400" },
  ...ALCHEMICA_TOKENS_BASE.map((t, i) => ({ symbol: t.symbol, address: t.address, color: ["text-pink-400", "text-sky-400", "text-emerald-400", "text-amber-400"][i] })),
];

const fmt = (wei: bigint) => {
  const v = Number(wei) / 1e18;
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  if (v >= 1000) return `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const GOVERNANCE = [
  { label: "Snapshot — vote on proposals", href: "https://snapshot.org/#/aavegotchi.eth", icon: Vote },
  { label: "Governance docs", href: "https://docs.aavegotchi.com", icon: BookOpen },
];
const COMMUNITY = [
  { label: "Tools & dashboards", href: "https://dapp.aavegotchi.com/tools", icon: Wrench },
  { label: "Announcements", href: "https://blog.aavegotchi.com", icon: Megaphone },
  { label: "Wiki & FAQ", href: "https://wiki.aavegotchi.com", icon: BookOpen },
  { label: "Agents", href: "https://dapp.aavegotchi.com/agents", icon: Bot },
];

// Live AavegotchiDAO governance via the Snapshot public GraphQL API (the same
// data the Snapshot MCP exposes; the browser uses the public hub directly).
const SNAPSHOT_SPACE = "aavegotchi.eth";
type Proposal = { id: string; title: string; state: string; votes: number; end: number; scoresTotal: number };

async function fetchProposals(): Promise<Proposal[]> {
  const query = `{ proposals(first: 6, where: { space: "${SNAPSHOT_SPACE}" }, orderBy: "created", orderDirection: desc){ id title state votes end scores_total } }`;
  const res = await fetch("https://hub.snapshot.org/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "snapshot error");
  return (json.data?.proposals ?? []).map((p: any) => ({ id: p.id, title: p.title, state: p.state, votes: Number(p.votes) || 0, end: Number(p.end) || 0, scoresTotal: Number(p.scores_total) || 0 }));
}

function proposalAgo(end: number, state: string): string {
  const now = Math.floor(Date.now() / 1000);
  if (state === "active") {
    const s = end - now;
    if (s <= 0) return "ending";
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
    return d > 0 ? `ends in ${d}d` : `ends in ${h}h`;
  }
  return state === "pending" ? "pending" : "closed";
}

function ProposalsSection() {
  const { data, isLoading } = useQuery({ queryKey: ["snapshot-proposals", SNAPSHOT_SPACE], queryFn: fetchProposals, staleTime: 5 * 60_000 });
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5"><Vote className="w-4 h-4 text-primary" /> Live proposals</div>
        <a href={`https://snapshot.org/#/${SNAPSHOT_SPACE}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">All on Snapshot <ExternalLink className="w-3 h-3" /></a>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : !data || data.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No proposals found.</p>
      ) : (
        <div className="space-y-2">
          {data.map((p) => (
            <a key={p.id} href={`https://snapshot.org/#/${SNAPSHOT_SPACE}/proposal/${p.id}`} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-xl border border-border/40 bg-background/60 p-3 hover:border-primary/40 hover:-translate-y-0.5 transition-all">
              <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${p.state === "active" ? "bg-emerald-500/15 text-emerald-500" : p.state === "pending" ? "bg-amber-500/15 text-amber-500" : "bg-muted/50 text-muted-foreground"}`}>{p.state}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{p.title}</div>
                <div className="text-[10px] text-muted-foreground">{p.votes.toLocaleString()} votes · {proposalAgo(p.end, p.state)}</div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkCard({ label, href, icon: Icon }: { label: string; href: string; icon: typeof Vote }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2.5 rounded-xl border border-border/40 bg-background/60 p-3 hover:border-primary/40 hover:-translate-y-0.5 transition-all">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary"><Icon className="w-4 h-4" /></span>
      <span className="text-sm font-medium flex-1">{label}</span>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
    </a>
  );
}

export default function DaoPage() {
  const { data } = useReadContracts({
    contracts: TREASURY_TOKENS.map((t) => ({ address: t.address as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [DAO_TREASURY], chainId: BASE_CHAIN_ID })),
  });
  const balances = useMemo(
    () => TREASURY_TOKENS.map((t, i) => ({ ...t, bal: data?.[i]?.status === "success" ? (data[i].result as bigint) : 0n })),
    [data]
  );

  return (
    <div className="container mx-auto max-w-[1000px] px-4 py-6">
      <Seo title="AavegotchiDAO — GotchiCloset" description="AavegotchiDAO treasury, governance and community resources on Base." canonical={siteUrl("/dao")} />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2"><Landmark className="w-6 h-6 text-primary" /> AavegotchiDAO</h1>
        <Link to="/stats" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-muted/40"><BarChart3 className="w-3.5 h-3.5" /> Stats</Link>
      </div>

      {/* Treasury */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 p-5 ring-1 ring-primary/5 mb-5">
        <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl bg-primary/20" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3"><Landmark className="w-4 h-4" /> Foundation treasury (Base)</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {balances.map((t) => (
              <div key={t.symbol} className="rounded-xl border border-border/40 bg-background/50 p-2.5">
                <div className={`text-[11px] font-semibold ${t.color}`}>{t.symbol}</div>
                <div className="text-lg font-bold tabular-nums">{fmt(t.bal)}</div>
              </div>
            ))}
          </div>
          <a href={`https://basescan.org/address/${DAO_TREASURY}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            View on BaseScan <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <ProposalsSection />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5"><Vote className="w-4 h-4 text-primary" /> Governance</div>
          <div className="space-y-2">{GOVERNANCE.map((g) => <LinkCard key={g.label} {...g} />)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5"><Wrench className="w-4 h-4 text-primary" /> Community & resources</div>
          <div className="space-y-2">{COMMUNITY.map((c) => <LinkCard key={c.label} {...c} />)}</div>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground text-center">Treasury shows the AavegotchiDAO foundation liquidity address on Base. Governance happens on Snapshot.</p>
    </div>
  );
}
