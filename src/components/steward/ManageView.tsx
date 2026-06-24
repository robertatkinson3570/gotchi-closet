// src/components/steward/ManageView.tsx
import { useStewardLog, useStewardMutations, useSoulStats } from "@/hooks/useSteward";
import type { Enrollment } from "@/lib/steward/api";

interface Props {
  owner: string;
  enrollment: Enrollment;
  gotchi: { id: number; name: string; image: string };
  onBack: () => void;
}

export function ManageView({ owner, enrollment, gotchi, onBack }: Props) {
  const { data: log = [] } = useStewardLog(owner);
  const { data: soul } = useSoulStats(owner, gotchi.id); // SAME single-source stats the companion chat shows
  const { pause, resume, revoke } = useStewardMutations(owner);
  const active = enrollment.status === "active";

  return (
    <div className="mx-auto max-w-lg">
      <button onClick={onBack} className="text-sm text-zinc-400">← back</button>
      <div className="mt-2 flex items-center gap-4">
        <img src={gotchi.image} className="h-20" alt={gotchi.name} />
        <div>
          <div className="text-xl font-bold">{gotchi.name}</div>
          <div className="text-sm text-emerald-300">{active ? "⚡ On Duty" : enrollment.status}</div>
        </div>
      </div>

      {soul && (
        <div className="mt-3">
          <div className="text-xs uppercase text-zinc-400">Soul · {soul.level} · {soul.memories} memories</div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-emerald-400" style={{ width: `${soul.xpPct}%` }} />
          </div>
        </div>
      )}

      <h3 className="mt-5 text-sm font-semibold uppercase text-zinc-400">Steward's log</h3>
      <ul className="mt-2 space-y-1 font-mono text-xs">
        {log.slice(0, 20).map((l, i) => (
          <li key={i} className="flex justify-between gap-2 text-zinc-300">
            <span>{l.action}: {l.detail}</span>
            {l.txHash && <a className="text-emerald-400" href={`https://basescan.org/tx/${l.txHash}`} target="_blank" rel="noreferrer">tx</a>}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex gap-2">
        {active
          ? <button onClick={() => pause.mutate(enrollment.id)} className="rounded-lg bg-white/10 px-3 py-1">Pause</button>
          : <button onClick={() => resume.mutate(enrollment.id)} className="rounded-lg bg-emerald-600 px-3 py-1">Resume</button>}
        <button onClick={() => revoke.mutate(enrollment.id)} className="rounded-lg bg-red-600/80 px-3 py-1">Revoke</button>
      </div>
    </div>
  );
}
