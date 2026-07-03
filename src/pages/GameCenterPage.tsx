// src/pages/GameCenterPage.tsx
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CATEGORIES, type Category, type GamePublic } from "@/lib/games/types";
import { listGames, checkAdmin } from "@/lib/games/api";
import { GameCard } from "@/components/games/GameCard";
import { SubmitGameDialog } from "@/components/games/SubmitGameDialog";
import { AdminReviewTab } from "@/components/games/AdminReviewTab";
import { Button } from "@/ui/button";

type Filter = "All" | Category;
type View = "browse" | "review";

export default function GameCenterPage() {
  const { address } = useAccount();
  const [games, setGames] = useState<GamePublic[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [showSubmit, setShowSubmit] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [view, setView] = useState<View>("browse");

  const load = useCallback(() => {
    listGames(filter === "All" ? undefined : filter).then(setGames).catch(() => setGames([]));
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (address) checkAdmin(address).then(setAdmin); else setAdmin(false); }, [address]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Game Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A community directory of Aavegotchi games, tools, and dashboards. Anyone who owns an Aavegotchi can submit —
            each entry is reviewed before it goes live. Connect your wallet, hit Submit, and add yours.
          </p>
        </div>
        <Button onClick={() => setShowSubmit(true)}>Submit</Button>
      </div>

      {admin && (
        <div className="mt-6 flex gap-2">
          <Button size="sm" variant={view === "browse" ? "default" : "ghost"} onClick={() => setView("browse")}>Browse</Button>
          <Button size="sm" variant={view === "review" ? "default" : "ghost"} onClick={() => setView("review")}>Pending review</Button>
        </div>
      )}

      {view === "review" && admin ? (
        <div className="mt-6"><AdminReviewTab onChanged={load} /></div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {(["All", ...CATEGORIES] as Filter[]).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full border px-3 py-1 text-sm ${filter === c ? "border-primary bg-primary/15 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>

          {games.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">Nothing here yet — be the first to submit.</p>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => <GameCard key={g.id} game={g} />)}
            </div>
          )}
        </>
      )}

      {showSubmit && <SubmitGameDialog onClose={() => setShowSubmit(false)} onSubmitted={load} />}
    </div>
  );
}
