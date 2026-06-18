import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useSnapshotVote } from "@/hooks/useSnapshotVote";

type Props = {
  proposalId: string;
  type: string;
  choices: string[];
  onVoted?: () => void;
};

const SPACE = "aavegotchi.eth";

/**
 * In-app AavegotchiDAO voting. Renders the choice UI for the proposal's voting
 * system and casts an off-chain (gasless) Snapshot vote. Ranked-choice falls back
 * to Snapshot since it needs a full ordering UI.
 */
export function SnapshotVotePanel({ proposalId, type, choices, onVoted }: Props) {
  const { vote, step, error } = useSnapshotVote();
  const [single, setSingle] = useState<number | null>(null);
  const [approval, setApproval] = useState<Set<number>>(new Set());
  const [weights, setWeights] = useState<Record<number, number>>({});

  const isWeighted = type === "weighted" || type === "quadratic";
  const isApproval = type === "approval";
  const isSingle = type === "single-choice" || type === "basic";
  const busy = step === "signing";

  if (type === "ranked-choice") {
    return <a href={`https://snapshot.org/#/${SPACE}/proposal/${proposalId}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline">Rank choices on Snapshot →</a>;
  }

  const submit = async () => {
    let choice: number | number[] | Record<string, number> | null = null;
    if (isSingle) { if (single == null) return; choice = single + 1; }
    else if (isApproval) { if (approval.size === 0) return; choice = [...approval].map((i) => i + 1); }
    else if (isWeighted) {
      const c: Record<string, number> = {};
      for (const [i, w] of Object.entries(weights)) if (w > 0) c[String(Number(i) + 1)] = w;
      if (Object.keys(c).length === 0) return;
      choice = c;
    }
    if (choice == null) return;
    const ok = await vote(proposalId, type, choice);
    if (ok) onVoted?.();
  };

  if (step === "success") {
    return <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-500"><CheckCircle2 className="w-3.5 h-3.5" /> Vote submitted to Snapshot</div>;
  }

  return (
    <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {choices.map((c, i) => (
        <label key={i} className="flex items-center gap-2 rounded-md border border-border/40 bg-background/50 px-2 py-1 text-xs cursor-pointer hover:border-primary/40">
          {isSingle && <input type="radio" name={`p-${proposalId}`} checked={single === i} onChange={() => setSingle(i)} className="accent-primary" />}
          {isApproval && <input type="checkbox" checked={approval.has(i)} onChange={() => setApproval((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="accent-primary" />}
          <span className="flex-1 truncate">{c}</span>
          {isWeighted && (
            <input type="number" min={0} value={weights[i] ?? 0} onChange={(e) => setWeights((w) => ({ ...w, [i]: Math.max(0, Number(e.target.value) || 0) }))} className="h-6 w-14 rounded border border-border/60 bg-background px-1.5 text-[11px]" />
          )}
        </label>
      ))}
      {error && <div className="text-[10px] text-destructive">{error}</div>}
      <button disabled={busy} onClick={submit} className="h-7 w-full rounded-md bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-[11px] font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
        {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sign in wallet…</> : "Cast vote (gasless)"}
      </button>
    </div>
  );
}
