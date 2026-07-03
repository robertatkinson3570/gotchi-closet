// src/components/games/AdminReviewTab.tsx
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { adminMessage } from "@/lib/games/auth";
import { listPending, reviewGame, pendingImageUrl, type PendingGame, type Sig } from "@/lib/games/api";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";

export function AdminReviewTab({ onChanged }: { onChanged: () => void }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [items, setItems] = useState<PendingGame[]>([]);
  const [sig, setSig] = useState<Sig | null>(null);

  const authAndLoad = useCallback(async () => {
    if (!address) return;
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: adminMessage(address, signedAt) });
    const s = { wallet: address, signature, signedAt };
    setSig(s);
    setItems(await listPending(s));
  }, [address, signMessageAsync]);

  useEffect(() => { authAndLoad().catch(() => toast({ title: "Could not authorize", variant: "destructive" })); }, [authAndLoad, toast]);

  async function act(id: number, action: "approve" | "reject") {
    if (!sig) return;
    try {
      await reviewGame(id, action, sig);
      setItems((xs) => xs.filter((x) => x.id !== id));
      onChanged();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    }
  }

  if (!items.length) return <p className="text-sm text-muted-foreground">No submissions awaiting review.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((g) => (
        <div key={g.id} className="rounded-xl border border-white/10 p-4">
          {sig && <img src={pendingImageUrl(g.id, sig)} alt={g.title} className="rounded-lg aspect-video w-full object-cover bg-black/30" />}
          <div className="mt-2 font-semibold">{g.title} <span className="text-xs text-muted-foreground">({g.category})</span></div>
          <p className="text-sm text-muted-foreground line-clamp-2">{g.description}</p>
          <a href={g.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary break-all">{g.url}</a>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => act(g.id, "approve")}>Approve</Button>
            <Button size="sm" variant="ghost" onClick={() => act(g.id, "reject")}>Reject</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
