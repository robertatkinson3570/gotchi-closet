import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { Landmark, ExternalLink, Vote, Wrench, BookOpen, Megaphone, Bot, BarChart3, Loader2, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { GHST_TOKEN_BASE, ALCHEMICA_TOKENS_BASE, ERC20_ABI } from "@/lib/lending/contracts";

const SNAPSHOT_SPACE = "aavegotchi.eth";
const DAO_TREASURY_BASE = "0x62DE034b1A69eF853c9d0D8a33D26DF5cF26682E" as const;

// ---- Voting power (Snapshot, for the connected wallet) ----
function useVotingPower(address?: string) {
  return useQuery({
    queryKey: ["snapshot-vp", address?.toLowerCase()],
    enabled: !!address,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const query = `{ vp(voter: "${address}", space: "${SNAPSHOT_SPACE}"){ vp } }`;
      const res = await fetch("https://hub.snapshot.org/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const json = await res.json();
      return Number(json?.data?.vp?.vp ?? 0);
    },
  });
}

// ---- Multi-chain treasury (best-effort; Ethereum/Polygon can rate-limit) ----
const TREASURY_CHAINS = [
  {
    name: "Ethereum", rpc: "https://eth.llamarpc.com", explorer: "https://etherscan.io/address/",
    treasury: "0x53c3CA81EA03001a350166D2Cc0fcd9d4c1b7B62",
    tokens: [
      { sym: "GHST", addr: "0x3F382DbD960E3a9bbCeaE22651E88158d2791550", dec: 18 },
      { sym: "DAI", addr: "0x6B175474E89094C44Da98b954EedeAC495271d0F", dec: 18 },
      { sym: "USDC", addr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", dec: 6 },
    ],
  },
  {
    name: "Polygon", rpc: "https://polygon-rpc.com", explorer: "https://polygonscan.com/address/",
    treasury: "0x939b67F6F6BE63E09B0258621c5A24eecB92631c",
    tokens: [
      { sym: "GHST", addr: "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7", dec: 18 },
      { sym: "USDC", addr: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", dec: 6 },
    ],
  },
] as const;

const BAL_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

function useMultiChainTreasury() {
  return useQuery({
    queryKey: ["dao-treasury-multichain"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: Record<string, Record<string, number | null>> = {};
      await Promise.all(
        TREASURY_CHAINS.map(async (c) => {
          out[c.name] = {};
          const client = createPublicClient({ transport: http(c.rpc) });
          await Promise.all(
            c.tokens.map(async (t) => {
              try {
                const b = (await client.readContract({ address: t.addr as `0x${string}`, abi: BAL_ABI, functionName: "balanceOf", args: [c.treasury as `0x${string}`] })) as bigint;
                out[c.name][t.sym] = Number(b) / 10 ** t.dec;
              } catch {
                out[c.name][t.sym] = null;
              }
            })
          );
        })
      );
      return out;
    },
  });
}

// ---- DAO addresses (labelled, from the dapp) ----
const DAO_ADDRESSES: { chain: string; explorer: string; rows: { label: string; addr: string; empty?: boolean }[] }[] = [
  {
    chain: "Ethereum", explorer: "https://etherscan.io/address/",
    rows: [
      { label: "DAO Foundation Liquidity", addr: "0x854dfAAb274E756f8e792E42AdA416786548FA07", empty: true },
      { label: "DAO Foundation Rewards", addr: "0x578580F4700A9721Eb965B151Ac0941fa2afcC6c", empty: true },
      { label: "Curve Fees", addr: "0xFFE6280ae4E864D9aF836B562359FD828EcE8020" },
      { label: "DAO Foundation Treasury", addr: "0x53c3CA81EA03001a350166D2Cc0fcd9d4c1b7B62" },
    ],
  },
  {
    chain: "Polygon", explorer: "https://polygonscan.com/address/",
    rows: [
      { label: "Old Polygon Treasury (Crafting + Baazaar Fees)", addr: "0xb208f8BB431f580CC4b216826AFfB128cd1431aB" },
      { label: "Rarity Farming Rewards", addr: "0x27DF5C6dcd360f372e23d5e63645eC0072D0C098" },
      { label: "DAO Foundation Treasury", addr: "0x939b67F6F6BE63E09B0258621c5A24eecB92631c" },
      { label: "DAO Foundation Liquidity", addr: "0x62DE034b1A69eF853c9d0D8a33D26DF5cF26682E" },
      { label: "DAO Foundation Rewards", addr: "0x8c8E076Cd7D2A17Ba2a5e5AF7036c2b2B7F790f6" },
      { label: "Gotchiverse Player Rewards", addr: "0x48eA1d45142fC645fDcf78C133Ac082eF159Fe14" },
      { label: "ATF Wallet – player rewards", addr: "0x921D8FDF089775D5AC61b2d6e8f34F1edd554D8f" },
    ],
  },
  {
    chain: "Base", explorer: "https://basescan.org/address/",
    rows: [{ label: "DAO Foundation Liquidity", addr: DAO_TREASURY_BASE }],
  },
];

const GOVERNANCE = [
  { label: "Snapshot — vote on proposals", href: `https://snapshot.org/#/${SNAPSHOT_SPACE}`, icon: Vote },
  { label: "How to use the DAO / docs", href: "https://docs.aavegotchi.com", icon: BookOpen },
];
const COMMUNITY = [
  { label: "Tools & dashboards", href: "https://dapp.aavegotchi.com/tools", icon: Wrench },
  { label: "Announcements", href: "https://blog.aavegotchi.com", icon: Megaphone },
  { label: "Wiki & FAQ", href: "https://wiki.aavegotchi.com", icon: BookOpen },
  { label: "Agents", href: "https://dapp.aavegotchi.com/agents", icon: Bot },
];

const num = (v: number | null | undefined) => (v == null ? "—" : v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M` : v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : v.toLocaleString(undefined, { maximumFractionDigits: 0 }));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---- Snapshot space stats ----
function useSpaceStats() {
  return useQuery({
    queryKey: ["snapshot-space", SNAPSHOT_SPACE],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const res = await fetch("https://hub.snapshot.org/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: `{ space(id: "${SNAPSHOT_SPACE}"){ followersCount proposalsCount } }` }) });
      const json = await res.json();
      return { followers: Number(json?.data?.space?.followersCount ?? 0), proposals: Number(json?.data?.space?.proposalsCount ?? 0) };
    },
  });
}

// ---- Snapshot proposals (with results: leading choice) ----
type Proposal = { id: string; title: string; state: string; votes: number; end: number; choices: string[]; scores: number[] };
async function fetchProposals(): Promise<Proposal[]> {
  const query = `{ proposals(first: 6, where: { space: "${SNAPSHOT_SPACE}" }, orderBy: "created", orderDirection: desc){ id title state votes end choices scores } }`;
  const res = await fetch("https://hub.snapshot.org/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "snapshot error");
  return (json.data?.proposals ?? []).map((p: any) => ({ id: p.id, title: p.title, state: p.state, votes: Number(p.votes) || 0, end: Number(p.end) || 0, choices: p.choices ?? [], scores: (p.scores ?? []).map(Number) }));
}
function leadingChoice(p: Proposal): string | null {
  if (!p.scores.length || !p.choices.length) return null;
  let mi = 0; for (let i = 1; i < p.scores.length; i++) if (p.scores[i] > p.scores[mi]) mi = i;
  const total = p.scores.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const pct = Math.round((p.scores[mi] / total) * 100);
  return `${p.choices[mi]} · ${pct}%`;
}
function proposalAgo(end: number, state: string): string {
  const now = Math.floor(Date.now() / 1000);
  if (state === "active") { const s = end - now; if (s <= 0) return "ending"; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d > 0 ? `ends in ${d}d` : `ends in ${h}h`; }
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
              <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{p.title}</div><div className="text-[10px] text-muted-foreground">{p.votes.toLocaleString()} votes · {proposalAgo(p.end, p.state)}{leadingChoice(p) ? ` · leading: ${leadingChoice(p)}` : ""}</div></div>
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
  const { address, isConnected } = useAccount();
  const { data: vp, isLoading: vpLoading } = useVotingPower(address);
  const { data: stats } = useSpaceStats();

  // Base treasury (reliable, via wagmi) — GHST + USDC + alchemica.
  const baseTokens = useMemo(() => [
    { sym: "GHST", address: GHST_TOKEN_BASE },
    { sym: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
    ...ALCHEMICA_TOKENS_BASE.map((t) => ({ sym: t.symbol, address: t.address })),
  ], []);
  const { data: baseData } = useReadContracts({
    contracts: baseTokens.map((t) => ({ address: t.address as `0x${string}`, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [DAO_TREASURY_BASE], chainId: BASE_CHAIN_ID })),
  });
  const baseBalances = useMemo(() => baseTokens.map((t, i) => ({ sym: t.sym, bal: baseData?.[i]?.status === "success" ? Number(baseData[i].result as bigint) / 1e18 : null })), [baseTokens, baseData]);

  const { data: multi } = useMultiChainTreasury();

  return (
    <div className="container mx-auto max-w-[1000px] px-4 py-6">
      <Seo title="AavegotchiDAO — GotchiCloset" description="AavegotchiDAO voting power, treasury and governance on Base, Polygon and Ethereum." canonical={siteUrl("/dao")} />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2"><Landmark className="w-6 h-6 text-primary" /> AavegotchiDAO</h1>
          {stats && <div className="text-[11px] text-muted-foreground mt-0.5">{stats.followers.toLocaleString()} members · {stats.proposals.toLocaleString()} proposals</div>}
        </div>
        <Link to="/stats" className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-muted/40"><BarChart3 className="w-3.5 h-3.5" /> Stats</Link>
      </div>

      {/* Voting power */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-primary/15 to-transparent p-5 ring-1 ring-primary/10 mb-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Zap className="w-4 h-4 text-primary" /> Your total voting power</div>
        {!isConnected ? (
          <div className="mt-1 text-sm text-muted-foreground">Connect your wallet to see your AavegotchiDAO voting power.</div>
        ) : vpLoading ? (
          <div className="mt-1"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-bold tracking-tight">{(vp ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span><span className="text-sm text-muted-foreground">voting power (GHST-equivalent)</span></div>
        )}
      </div>

      {/* Treasury */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 p-5 ring-1 ring-primary/5 mb-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3"><Landmark className="w-4 h-4" /> DAO treasury</div>
        <div className="space-y-4">
          {/* Base */}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Base</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {baseBalances.map((t) => (
                <div key={t.sym} className="rounded-xl border border-border/40 bg-background/50 p-2.5"><div className="text-[11px] font-semibold text-primary">{t.sym}</div><div className="text-base font-bold tabular-nums">{num(t.bal)}</div></div>
              ))}
            </div>
          </div>
          {/* Ethereum + Polygon (best-effort) */}
          {TREASURY_CHAINS.map((c) => (
            <div key={c.name}>
              <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">{c.name}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {c.tokens.map((t) => (
                  <div key={t.sym} className="rounded-xl border border-border/40 bg-background/50 p-2.5"><div className="text-[11px] font-semibold text-primary">{t.sym}</div><div className="text-base font-bold tabular-nums">{multi ? num(multi[c.name]?.[t.sym]) : "…"}</div></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ProposalsSection />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5"><Vote className="w-4 h-4 text-primary" /> Governance</div>
          <div className="space-y-2">{GOVERNANCE.map((g) => <LinkCard key={g.label} {...g} />)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1.5"><Wrench className="w-4 h-4 text-primary" /> Community & resources</div>
          <div className="space-y-2">{COMMUNITY.map((c) => <LinkCard key={c.label} {...c} />)}</div>
        </div>
      </div>

      {/* DAO addresses */}
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">DAO addresses</div>
      <div className="space-y-3">
        {DAO_ADDRESSES.map((grp) => (
          <div key={grp.chain}>
            <div className="text-[11px] font-semibold text-muted-foreground mb-1">{grp.chain}</div>
            <div className="rounded-xl border border-border/40 bg-background/50 divide-y divide-border/30">
              {grp.rows.map((r) => (
                <a key={r.addr} href={`${grp.explorer}${r.addr}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/30">
                  <span className="text-xs truncate">{r.label}{r.empty && <span className="text-muted-foreground"> (empty)</span>}</span>
                  <span className="text-[11px] font-mono text-primary inline-flex items-center gap-1 shrink-0">{short(r.addr)} <ExternalLink className="w-3 h-3" /></span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground text-center">Voting power via Snapshot ({SNAPSHOT_SPACE}). Ethereum/Polygon balances are best-effort over public RPCs.</p>
    </div>
  );
}
