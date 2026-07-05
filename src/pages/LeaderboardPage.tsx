import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Trophy, Heart, Zap, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Seo } from "@/components/Seo";
import { siteUrl } from "@/lib/site";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { fetchLeaderboard, LEADERBOARD_PAGE_SIZE, type LeaderboardSort } from "@/lib/leaderboard";
import { timeAgo, shortAddress } from "@/lib/format";
import { qk } from "@/lib/queryKeys";

const SORTS: { key: LeaderboardSort; label: string; icon: typeof Heart }[] = [
  { key: "kinship", label: "Kinship", icon: Heart },
  { key: "experience", label: "XP", icon: Zap },
];

// Subgraph skip is capped at 5000; 10 pages of 100 is plenty for a leaderboard.
const MAX_PAGE = 9;

export default function LeaderboardPage() {
  const [sort, setSort] = useState<LeaderboardSort>("kinship");
  const [page, setPage] = useState(0);

  const { data: rows, isLoading, error } = useQuery({
    queryKey: qk.leaderboard(sort, page),
    queryFn: () => fetchLeaderboard(sort, page),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const pick = (s: LeaderboardSort) => { setSort(s); setPage(0); };

  return (
    <div className="container mx-auto max-w-[900px] px-4 py-6">
      <Seo
        title="Kinship & XP Leaderboard · GotchiCloset"
        description="Live Aavegotchi kinship and XP leaderboards on Base. See the most loved and most experienced gotchis."
        canonical={siteUrl("/leaderboard")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <Trophy className="w-6 h-6 text-primary" /> Leaderboard
        </h1>
        <div className="flex items-center gap-1.5 text-xs">
          {SORTS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => pick(key)}
              className={`h-8 px-3.5 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold border ${sort === key ? "bg-primary/15 text-primary border-primary/40" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Kinship grows when a gotchi is petted (every 12h) and decays when neglected. XP comes from DAO
        voting and community events. Live from the Base subgraph, summoned gotchis only.
      </p>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm mb-3">
          {(error as Error).message}
        </div>
      )}

      {isLoading || !rows ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-muted/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/40">
                  <th className="text-left font-semibold px-3 py-2 w-12">#</th>
                  <th className="text-left font-semibold px-3 py-2">Gotchi</th>
                  <th className="text-right font-semibold px-3 py-2">Kinship</th>
                  <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">XP</th>
                  <th className="text-right font-semibold px-3 py-2 hidden md:table-cell">Last pet</th>
                  <th className="text-right font-semibold px-3 py-2 hidden md:table-cell">Owner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g, i) => {
                  const rank = page * LEADERBOARD_PAGE_SIZE + i + 1;
                  return (
                    <tr key={g.id} className="border-b border-border/20 last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{rank}</td>
                      <td className="px-3 py-2">
                        <Link to={`/gotchi/${g.gotchiId}`} className="inline-flex items-center gap-2.5 hover:text-primary">
                          <span className="w-9 h-9 shrink-0 rounded-lg bg-muted/30 overflow-hidden [&_svg]:w-full [&_svg]:h-full">
                            <GotchiSvgById id={g.gotchiId} />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold truncate max-w-[180px] sm:max-w-[260px]">{g.name}</span>
                            <span className="block text-[11px] text-muted-foreground">#{g.gotchiId} · lvl {g.level}</span>
                          </span>
                        </Link>
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${sort === "kinship" ? "font-bold" : ""}`}>{g.kinship.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right tabular-nums hidden sm:table-cell ${sort === "experience" ? "font-bold" : ""}`}>{g.experience.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground hidden md:table-cell">{timeAgo(g.lastInteracted)}</td>
                      <td className="px-3 py-2 text-right hidden md:table-cell">
                        <Link to={`/u/${g.owner}`} className="text-muted-foreground hover:text-primary">{shortAddress(g.owner)}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 px-3 inline-flex items-center gap-1 rounded-lg border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {page * LEADERBOARD_PAGE_SIZE + 1}–{page * LEADERBOARD_PAGE_SIZE + rows.length}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(MAX_PAGE, p + 1))}
              disabled={page >= MAX_PAGE || rows.length < LEADERBOARD_PAGE_SIZE}
              className="h-8 px-3 inline-flex items-center gap-1 rounded-lg border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-muted/40 disabled:opacity-40 disabled:pointer-events-none"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
