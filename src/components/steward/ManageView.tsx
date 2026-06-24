// src/components/steward/ManageView.tsx
// On-duty dashboard. Soul detail is the EXACT companion-chat panel (SoulDepthMeter) so the
// number/level/breakdown match the chat 1:1 and the certificate is one tap away.
import { useMemo } from "react";
import { useStewardLog, useStewardMutations } from "@/hooks/useSteward";
import { SoulDepthMeter } from "@/components/companion/SoulDepthMeter";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import { summarizeWeek } from "@/lib/steward/logSummary";
import type { Chores } from "@/lib/steward/cardState";
import type { Enrollment } from "@/lib/steward/api";

interface Props {
  owner: string;
  enrollment: Enrollment;
  gotchi: { id: number; name: string };
  onBack: () => void;
}

const CHORE_KEYS: (keyof Chores)[] = ["pet", "channel", "claim"];
const CHORE_LABEL: Record<string, string> = { pet: "Pet", channel: "Channel", claim: "Empty reservoirs" };

function nextRunLabel(e: Enrollment, nowSec: number): string {
  if (e.status !== "active") return "paused";
  if (e.lastRunAt === null) return "due now";
  const remaining = e.lastRunAt + e.intervalSec - nowSec;
  if (remaining <= 0) return "due now";
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export function ManageView({ owner, enrollment, gotchi, onBack }: Props) {
  const { data: log = [] } = useStewardLog(owner);
  const { pause, resume, revoke, editChores } = useStewardMutations(owner);
  const active = enrollment.status === "active";
  const intervalH = Math.round(enrollment.intervalSec / 3600);

  const week = useMemo(() => summarizeWeek(log, Date.now()), [log]);
  const sinceDate = new Date(enrollment.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const nextRun = nextRunLabel(enrollment, Math.floor(Date.now() / 1000));

  function toggleChore(k: keyof Chores) {
    const next = { ...enrollment.chores, [k]: !enrollment.chores[k] };
    if (!next.pet && !next.channel && !next.claim) return; // keep at least one chore
    editChores.mutate({ id: enrollment.id, chores: next });
  }

  return (
    <div className="mx-auto max-w-lg">
      <button onClick={onBack} className="text-sm text-zinc-400 hover:text-zinc-200">← back</button>
      <div className="mt-2 flex items-center gap-4">
        <GotchiSvgById id={String(gotchi.id)} className="h-20 w-20 [&>svg]:h-full [&>svg]:w-full" />
        <div>
          <div className="text-xl font-bold">{gotchi.name}</div>
          <div className="text-sm text-emerald-300">{active ? "⚡ On Duty" : enrollment.status === "paused" ? "😴 In time-out" : "👋 Fired"}</div>
          <div className="mt-0.5 text-xs text-zinc-400">On duty since {sinceDate} · next run {nextRun}</div>
        </div>
      </div>

      {/* This week */}
      <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl border border-white/10 bg-white/5 p-2 text-center">
        {([["runs", week.runs], ["pet", week.pet], ["channel", week.channel], ["claim", week.claim]] as const).map(([label, n]) => (
          <div key={label}>
            <div className="text-base font-bold tabular-nums">{n}</div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label === "claim" ? "claims" : label} {label !== "runs" && "/wk"}</div>
          </div>
        ))}
      </div>

      {/* Same soul panel the companion chat shows, single source of truth. */}
      <SoulDepthMeter tokenId={String(gotchi.id)} />

      {/* Edit chores */}
      <h3 className="mt-5 text-sm font-semibold uppercase text-zinc-400">Chores · every {intervalH}h</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {CHORE_KEYS.map((k) => {
          const on = enrollment.chores[k];
          return (
            <button
              key={k}
              onClick={() => toggleChore(k)}
              disabled={editChores.isPending}
              className={`rounded-lg px-3 py-1 text-sm transition-colors disabled:opacity-50 ${on ? "bg-fuchsia-600 text-white" : "bg-white/10 text-zinc-300 hover:bg-white/15"}`}
            >
              {on ? "✓ " : ""}{CHORE_LABEL[k]}
            </button>
          );
        })}
      </div>
      {editChores.isError && <p className="mt-1 text-xs text-red-400">Another steward already covers that chore.</p>}

      <h3 className="mt-5 text-sm font-semibold uppercase text-zinc-400">Steward's log</h3>
      {log.length === 0 && <p className="mt-1 text-xs text-zinc-500">No runs yet, work appears here with a tx link each time {gotchi.name} acts.</p>}
      <ul className="mt-2 space-y-1 font-mono text-xs">
        {log.slice(0, 20).map((l, i) => (
          <li key={i} className="flex justify-between gap-2 text-zinc-300">
            <span>{l.action}: {l.detail}</span>
            {l.txHash && <a className="text-emerald-400" href={`https://basescan.org/tx/${l.txHash}`} target="_blank" rel="noreferrer">tx</a>}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-2">
        {active
          ? <button onClick={() => pause.mutate(enrollment.id)} className="rounded-lg bg-white/10 px-3 py-1" title="Pause, sit in the corner and think about what you did">😤 Time-out</button>
          : <button onClick={() => resume.mutate(enrollment.id)} className="rounded-lg bg-emerald-600 px-3 py-1" title="Resume duty">🫡 Back to work</button>}
        <button
          onClick={() => { if (confirm(`Fire ${gotchi.name}? It hands back the keys and stops all work. (You can always re-hire it.)`)) revoke.mutate(enrollment.id); }}
          className="rounded-lg bg-red-600/80 px-3 py-1"
          title="Revoke the session key and end the job"
        >
          🔥 Fire {gotchi.name}
        </button>
      </div>
    </div>
  );
}
