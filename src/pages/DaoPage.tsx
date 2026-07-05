import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { Landmark, ExternalLink, Vote, Wrench, BookOpen, Megaphone, Bot, BarChart3, Loader2, Zap, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import LazySnapshotVotePanel from "@/components/dao/LazySnapshotVotePanel";
import { QuorumPanel } from "@/components/dao/QuorumPanel";
import { SNAPSHOT_QUORUM_VP } from "@/lib/quorumVp";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { shortAddress as short } from "@/lib/format";

const SNAPSHOT_SPACE = "aavegotchi.eth";
const DAO_TREASURY_BASE = "0x62DE034b1A69eF853c9d0D8a33D26DF5cF26682E" as const;

// ---- Voting power + breakdown by strategy (Snapshot, for the connected wallet) ----
type VotingPower = { total: number; byStrategy: { name: string; vp: number }[] };
function useVotingPower(address?: string) {
  return useQuery<VotingPower>({
    queryKey: ["snapshot-vp", address?.toLowerCase()],
    enabled: !!address,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const query = `{ vp(voter: "${address}", space: "${SNAPSHOT_SPACE}"){ vp vp_by_strategy } space(id: "${SNAPSHOT_SPACE}"){ strategies { name } } }`;
      const res = await fetch("https://hub.snapshot.org/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const json = await res.json();
      const byVp: number[] = json?.data?.vp?.vp_by_strategy ?? [];
      const names: string[] = (json?.data?.space?.strategies ?? []).map((s: any) => s.name);
      const byStrategy = byVp.map((v, i) => ({ name: names[i] || `Strategy ${i + 1}`, vp: Number(v) || 0 })).filter((s) => s.vp > 0);
      return { total: Number(json?.data?.vp?.vp ?? 0), byStrategy };
    },
  });
}

// ---- Multi-chain treasury: sum each token across ALL DAO wallets per chain ----
// (the dapp aggregates every DAO-controlled address, not a single treasury).
const TREASURY_CHAINS = [
  {
    name: "Base", rpc: "https://mainnet.base.org", explorer: "https://basescan.org/address/",
    wallets: ["0x62DE034b1A69eF853c9d0D8a33D26DF5cF26682E"],
    tokens: [
      { sym: "GHST", addr: "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB", dec: 18 },
      { sym: "USDC", addr: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", dec: 6 },
    ],
  },
  {
    name: "Polygon", rpc: "https://polygon-bor-rpc.publicnode.com", explorer: "https://polygonscan.com/address/",
    wallets: ["0xb208f8BB431f580CC4b216826AFfB128cd1431aB", "0x27DF5C6dcd360f372e23d5e63645eC0072D0C098", "0x939b67F6F6BE63E09B0258621c5A24eecB92631c", "0x62DE034b1A69eF853c9d0D8a33D26DF5cF26682E", "0x8c8E076Cd7D2A17Ba2a5e5AF7036c2b2B7F790f6", "0x48eA1d45142fC645fDcf78C133Ac082eF159Fe14", "0x921D8FDF089775D5AC61b2d6e8f34F1edd554D8f"],
    tokens: [
      { sym: "GHST", addr: "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7", dec: 18 },
      { sym: "USDC", addr: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", dec: 6 },
    ],
  },
  {
    name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io/address/",
    wallets: ["0x854dfAAb274E756f8e792E42AdA416786548FA07", "0x578580F4700A9721Eb965B151Ac0941fa2afcC6c", "0xFFE6280ae4E864D9aF836B562359FD828EcE8020", "0x53c3CA81EA03001a350166D2Cc0fcd9d4c1b7B62"],
    tokens: [
      { sym: "GHST", addr: "0x3F382DbD960E3a9bbCeaE22651E88158d2791550", dec: 18 },
      { sym: "DAI", addr: "0x6B175474E89094C44Da98b954EedeAC495271d0F", dec: 18 },
      { sym: "USDC", addr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", dec: 6 },
    ],
  },
] as const;

const BAL_ABI = [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

function useTreasury() {
  return useQuery({
    queryKey: ["dao-treasury-summed"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: Record<string, Record<string, number | null>> = {};
      await Promise.all(
        TREASURY_CHAINS.map(async (c) => {
          out[c.name] = {};
          const client = createPublicClient({ transport: http(c.rpc, { retryCount: 1 }) });
          await Promise.all(
            c.tokens.map(async (t) => {
              try {
                const bals = await Promise.all(
                  c.wallets.map((w) => client.readContract({ address: t.addr as `0x${string}`, abi: BAL_ABI, functionName: "balanceOf", args: [w as `0x${string}`] }) as Promise<bigint>)
                );
                out[c.name][t.sym] = bals.reduce((s, b) => s + Number(b) / 10 ** t.dec, 0);
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
  { label: "Snapshot: vote on proposals", href: `https://snapshot.org/#/${SNAPSHOT_SPACE}`, icon: Vote },
  { label: "How to use the DAO / docs", href: "https://docs.aavegotchi.com", icon: BookOpen },
];
const COMMUNITY = [
  { label: "Tools & dashboards", href: "https://dapp.aavegotchi.com/tools", icon: Wrench },
  { label: "Announcements", href: "https://blog.aavegotchi.com", icon: Megaphone },
  { label: "Wiki & FAQ", href: "https://wiki.aavegotchi.com", icon: BookOpen },
  { label: "Agents", href: "https://dapp.aavegotchi.com/agents", icon: Bot },
];

const num = (v: number | null | undefined) => (v == null ? "None" : v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M` : v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : v.toLocaleString(undefined, { maximumFractionDigits: 0 }));

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
type Proposal = { id: string; title: string; state: string; votes: number; end: number; choices: string[]; scores: number[]; scoresTotal: number; quorum: number; type: string };
async function fetchProposals(): Promise<Proposal[]> {
  const query = `{ proposals(first: 6, where: { space: "${SNAPSHOT_SPACE}" }, orderBy: "created", orderDirection: desc){ id title state votes end choices scores scores_total quorum type } }`;
  const res = await fetch("https://hub.snapshot.org/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "snapshot error");
  return (json.data?.proposals ?? []).map((p: any) => ({ id: p.id, title: p.title, state: p.state, votes: Number(p.votes) || 0, end: Number(p.end) || 0, choices: p.choices ?? [], scores: (p.scores ?? []).map(Number), scoresTotal: Number(p.scores_total) || 0, quorum: Number(p.quorum) || 0, type: p.type ?? "" }));
}

// Which of these proposals has the connected wallet already voted on?
async function fetchMyVotes(voter: string, proposalIds: string[]): Promise<Set<string>> {
  if (!voter || proposalIds.length === 0) return new Set();
  const ids = proposalIds.map((i) => `"${i}"`).join(",");
  const query = `{ votes(first: 100, where: { space: "${SNAPSHOT_SPACE}", voter: "${voter}", proposal_in: [${ids}] }){ proposal { id } } }`;
  const res = await fetch("https://hub.snapshot.org/graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const json = await res.json();
  return new Set((json?.data?.votes ?? []).map((v: any) => v.proposal.id));
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

function ProposalsSection({ address }: { address?: string }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["snapshot-proposals", SNAPSHOT_SPACE], queryFn: fetchProposals, staleTime: 5 * 60_000 });
  const proposalIds = useMemo(() => (data ?? []).map((p) => p.id), [data]);
  const { data: myVotes, refetch: refetchVotes } = useQuery({
    queryKey: ["snapshot-my-votes", address?.toLowerCase(), proposalIds.join(",")],
    enabled: !!address && proposalIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchMyVotes(address!.toLowerCase(), proposalIds),
  });
  const [openId, setOpenId] = useState<string | null>(null);

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
          {data.map((p) => {
            const voted = myVotes?.has(p.id);
            const canVote = p.state === "active" && !!address;
            const open = openId === p.id;
            return (
              <div key={p.id} className="rounded-xl border border-border/40 bg-background/60 p-3">
                <div className="flex items-center gap-3">
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${p.state === "active" ? "bg-emerald-500/15 text-emerald-500" : p.state === "pending" ? "bg-amber-500/15 text-amber-500" : "bg-muted/50 text-muted-foreground"}`}>{p.state}</span>
                  <a href={`https://snapshot.org/#/${SNAPSHOT_SPACE}/proposal/${p.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 group">
                    <div className="text-sm font-medium truncate group-hover:text-primary">{p.title}</div>
                    <div className="text-[10px] text-muted-foreground">{p.votes.toLocaleString()} votes · {proposalAgo(p.end, p.state)}{leadingChoice(p) ? ` · leading: ${leadingChoice(p)}` : ""}</div>
                  </a>
                  {p.state === "active" && voted ? (
                    <span className="text-[10px] font-semibold text-emerald-500 inline-flex items-center gap-1 shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> Voted</span>
                  ) : canVote ? (
                    <button onClick={() => setOpenId(open ? null : p.id)} className="h-7 px-3 rounded-md bg-primary/15 text-primary border border-primary/40 text-[11px] font-semibold shrink-0">{open ? "Close" : "Vote"}</button>
                  ) : null}
                </div>
                {p.state === "active" && (() => {
                  // quorum progress: proposal.quorum when set, else the space default
                  const q = p.quorum > 0 ? p.quorum : SNAPSHOT_QUORUM_VP;
                  const pct = Math.min(100, Math.round((p.scoresTotal / q) * 100));
                  return (
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-muted-foreground gap-2">
                        <span>quorum {pct}%</span>
                        <span className="tabular-nums">{Math.round(p.scoresTotal).toLocaleString()} / {q.toLocaleString()} VP</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500/80" : "bg-amber-500/70"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                {p.scores.some((s) => s > 0) && (
                  <div className="mt-2 space-y-1">
                    {p.choices.map((c, i) => ({ c, score: p.scores[i] || 0, i })).sort((a, b) => b.score - a.score).slice(0, 4).map(({ c, score, i }) => {
                      const total = p.scores.reduce((s, v) => s + v, 0) || 1;
                      const pct = Math.round((score / total) * 100);
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-[10px] text-muted-foreground gap-2"><span className="truncate">{c}</span><span className="shrink-0">{pct}%</span></div>
                          <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden"><div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {open && canVote && !voted && (
                  <LazySnapshotVotePanel proposalId={p.id} type={p.type} choices={p.choices} onVoted={() => { setOpenId(null); refetchVotes(); refetch(); }} />
                )}
              </div>
            );
          })}
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
  const { data: treasury } = useTreasury();

  return (
    <div className="container mx-auto max-w-[1000px] px-4 py-6">
      <Seo title="AavegotchiDAO · GotchiCloset" description="AavegotchiDAO voting power, treasury and governance on Base, Polygon and Ethereum." canonical={siteUrl("/dao")} />

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
          <>
            <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-bold tracking-tight">{(vp?.total ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span><span className="text-sm text-muted-foreground">voting power (GHST-equivalent)</span></div>
            {vp && vp.byStrategy.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {vp.byStrategy.map((s) => (
                  <span key={s.name} className="text-[10px] rounded-full bg-background/60 border border-border/40 px-2 py-0.5"><span className="text-muted-foreground capitalize">{s.name}:</span> <span className="font-semibold">{s.vp.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* DAO-wide votable VP + quorum (community-requested "Live Quorum") */}
      <QuorumPanel yourVp={vp?.total ?? null} />

      {/* Treasury */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-muted/10 to-muted/30 p-5 ring-1 ring-primary/5 mb-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3"><Landmark className="w-4 h-4" /> DAO treasury</div>
        <div className="space-y-4">
          {TREASURY_CHAINS.map((c) => (
            <div key={c.name}>
              <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">{c.name} <span className="text-muted-foreground/60">· {c.wallets.length} wallet{c.wallets.length > 1 ? "s" : ""}</span></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {c.tokens.map((t) => (
                  <div key={t.sym} className="rounded-xl border border-border/40 bg-background/50 p-2.5"><div className="text-[11px] font-semibold text-primary">{t.sym}</div><div className="text-base font-bold tabular-nums">{treasury ? num(treasury[c.name]?.[t.sym]) : "…"}</div></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ProposalsSection address={address} />

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
