// src/components/games/MySubmissionsTab.tsx
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { submitMessage } from "@/lib/games/auth";
import { listMine, signedImageUrl, type MyGame, type Sig } from "@/lib/games/api";
import { SubmitGameDialog } from "./SubmitGameDialog";
import { Button } from "@/ui/button";
import { useToast } from "@/ui/use-toast";

const STATUS_STYLE: Record<MyGame["status"], string> = {
  pending: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  approved: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  rejected: "border-red-500/40 text-red-300 bg-red-500/10",
};

export function MySubmissionsTab({ onChanged }: { onChanged: () => void }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { toast } = useToast();
  const [items, setItems] = useState<MyGame[]>([]);
  const [sig, setSig] = useState<Sig | null>(null);
  const [editing, setEditing] = useState<MyGame | null>(null);

  const authAndLoad = useCallback(async () => {
    if (!address) return;
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: submitMessage(address, signedAt) });
    const s = { wallet: address, signature, signedAt };
    setSig(s);
    setItems(await listMine(s));
  }, [address, signMessageAsync]);

  useEffect(() => { authAndLoad().catch(() => toast({ title: "Could not load your submissions", variant: "destructive" })); }, [authAndLoad, toast]);

  const refresh = useCallback(() => {
    if (sig) listMine(sig).then(setItems).catch(() => {});
    onChanged();
  }, [sig, onChanged]);

  if (!items.length) return <p className="text-sm text-muted-foreground">You haven't submitted anything yet.</p>;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((g) => (
          <div key={g.id} className="rounded-xl border border-white/10 p-4">
            {sig && <img src={signedImageUrl(g.id, sig)} alt={g.title} className="rounded-lg aspect-video w-full object-cover bg-black/30" />}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-semibold truncate">{g.title}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLE[g.status]}`}>{g.status}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{g.description}</p>
            <div className="mt-3">
              <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>Edit &amp; resubmit</Button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <SubmitGameDialog
          editing={{
            id: editing.id,
            title: editing.title,
            description: editing.description,
            url: editing.url,
            category: editing.category,
            currentImageUrl: sig ? signedImageUrl(editing.id, sig) : undefined,
          }}
          onClose={() => setEditing(null)}
          onSubmitted={refresh}
        />
      )}
    </>
  );
}
