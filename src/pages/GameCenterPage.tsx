// src/pages/GameCenterPage.tsx
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { CATEGORIES, type Category, type GamePublic } from "@/lib/games/types";
import { adminMessage } from "@/lib/games/auth";
import { listGames, checkAdmin, deleteGame } from "@/lib/games/api";
import { GameCard } from "@/components/games/GameCard";
import { SubmitGameDialog } from "@/components/games/SubmitGameDialog";
import { AdminReviewTab } from "@/components/games/AdminReviewTab";
import { MySubmissionsTab } from "@/components/games/MySubmissionsTab";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";

type Filter = "All" | Category;
type View = "browse" | "mine" | "review";

export default function GameCenterPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [games, setGames] = useState<GamePublic[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [showSubmit, setShowSubmit] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [view, setView] = useState<View>("browse");

  const load = useCallback(() => {
    listGames(filter === "All" ? undefined : filter).then(setGames).catch(() => setGames([]));
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (address) checkAdmin(address).then(setAdmin); else { setAdmin(false); setView("browse"); } }, [address]);

  const removeGame = useCallback(async (id: number) => {
    if (!address) return;
    try {
      const signedAt = Date.now();
      const signature = await signMessageAsync({ message: adminMessage(address, signedAt) });
      await deleteGame(id, { wallet: address, signature, signedAt });
      toast({ title: "Removed" });
      load();
    } catch (err) {
      toast({ title: "Remove failed", description: (err as Error).message, variant: "destructive" });
    }
  }, [address, signMessageAsync, toast, load]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Game Center</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A community directory of Aavegotchi games, tools, and dashboards. Anyone who owns an Aavegotchi can submit.
            Each entry is reviewed before it goes live. Connect your wallet, hit Submit, and add yours. You can edit and
            resubmit your own entries anytime from “My submissions”.
          </p>
        </div>
        <Button onClick={() => setShowSubmit(true)}>Submit</Button>
      </div>

      <div className="mt-6 flex gap-2">
        <Button size="sm" variant={view === "browse" ? "default" : "ghost"} onClick={() => setView("browse")}>Browse</Button>
        {isConnected && <Button size="sm" variant={view === "mine" ? "default" : "ghost"} onClick={() => setView("mine")}>My submissions</Button>}
        {admin && <Button size="sm" variant={view === "review" ? "default" : "ghost"} onClick={() => setView("review")}>Pending review</Button>}
      </div>

      {view === "review" && admin ? (
        <div className="mt-6"><AdminReviewTab onChanged={load} /></div>
      ) : view === "mine" && isConnected ? (
        <div className="mt-6"><MySubmissionsTab onChanged={load} /></div>
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
            <p className="mt-10 text-center text-sm text-muted-foreground">Nothing here yet, be the first to submit.</p>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => <GameCard key={g.id} game={g} onRemove={admin ? removeGame : undefined} />)}
            </div>
          )}
        </>
      )}

      {showSubmit && <SubmitGameDialog onClose={() => setShowSubmit(false)} onSubmitted={load} />}
    </div>
  );
}
