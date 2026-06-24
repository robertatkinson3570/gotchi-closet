# Steward — Plan 3: Beast-Mode Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Depends on Plans 1-2 (the `/api/steward/*` endpoints must exist).

**Goal:** Build the Steward page: a gotchi-centric "mission control" that routes each gotchi to recruit / manage / soul-mint, with a 4-step wizard and an on-duty dashboard, in a premium "beast-mode" visual style.

**Architecture:** Pure routing/availability logic lives in `src/lib/steward/cardState.ts` (unit-tested). `useSteward.ts` wraps the API in react-query. `StewardPage` renders the grid + summary; `StewardCard` renders one of three states; `RecruitWizard` runs the 4-step enroll flow (including client-side 7702 + session-key issuance); `ManageView` is the dashboard. Visual polish uses framer-motion (already a dependency). Component bodies are verified by manual + Playwright; the pure helpers are unit-tested.

**Tech Stack:** React 18, react-router-dom v6, wagmi v3, @tanstack/react-query, framer-motion, tailwind, lucide-react. The AA client (7702 + session key) is the same `permissionless` stack chosen in Plan 2, used client-side in the wizard.

**Note on testing:** this repo has no React Testing Library set up, so component logic that matters is extracted into pure functions and unit-tested with vitest; the components themselves get manual + Playwright verification (the repo already has `pnpm test:e2e`).

---

## File Structure

- `src/lib/steward/cardState.ts` (create) — `deriveCardState`, `freeChores` (pure).
- `src/lib/steward/cardState.test.ts` (create).
- `src/lib/steward/api.ts` (create) — typed fetch wrappers for `/api/steward/*`.
- `src/hooks/useSteward.ts` (create) — react-query hooks (status, log, enroll, pause/resume/revoke, edit).
- `src/components/steward/StewardCard.tsx` (create) — one card, three states, badge + soul-xp bar + motion.
- `src/components/steward/RecruitWizard.tsx` (create) — 4-step enroll flow.
- `src/components/steward/ManageView.tsx` (create) — dashboard/report.
- `src/pages/StewardPage.tsx` (create) — grid + summary strip + per-card routing.
- App router (modify) — register the `/steward` route + nav entry (follow the existing route registration pattern).

---

## Task 1: Pure card-state + chore-availability helpers

**Files:**
- Create: `src/lib/steward/cardState.ts`, `src/lib/steward/cardState.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/steward/cardState.test.ts
import { describe, it, expect } from "vitest";
import { deriveCardState, freeChores } from "./cardState";

const active = (gotchiId: number, chores: any) => ({ gotchiId, status: "active", chores });

describe("deriveCardState", () => {
  it("is on-duty when the gotchi has an active enrollment", () => {
    expect(deriveCardState({ id: 7, hasSoul: true }, [active(7, { pet: true, channel: false, claim: false })])).toBe("on-duty");
  });
  it("is soul-idle when it has a soul but no active enrollment", () => {
    expect(deriveCardState({ id: 7, hasSoul: true }, [])).toBe("soul-idle");
  });
  it("is no-soul when it lacks a soul cert", () => {
    expect(deriveCardState({ id: 7, hasSoul: false }, [])).toBe("no-soul");
  });
  it("ignores revoked enrollments", () => {
    expect(deriveCardState({ id: 7, hasSoul: true }, [{ gotchiId: 7, status: "revoked", chores: {} }])).toBe("soul-idle");
  });
});

describe("freeChores", () => {
  it("marks every chore free when there are no active enrollments", () => {
    expect(freeChores([])).toEqual({ pet: true, channel: true, claim: true });
  });
  it("marks a chore taken when an active enrollment holds it", () => {
    expect(freeChores([active(1, { pet: true, channel: false, claim: false })])).toEqual({ pet: false, channel: true, claim: true });
  });
  it("aggregates across multiple active stewards", () => {
    expect(freeChores([
      active(1, { pet: true, channel: false, claim: false }),
      active(2, { pet: false, channel: true, claim: false }),
    ])).toEqual({ pet: false, channel: false, claim: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/steward/cardState.test.ts`
Expected: FAIL — `Cannot find module './cardState'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/steward/cardState.ts
// Pure UI logic for the Steward page. Keeps the components dumb + testable.
export type CardState = "on-duty" | "soul-idle" | "no-soul";
export interface Chores { pet: boolean; channel: boolean; claim: boolean; }
export interface EnrollmentLite { gotchiId: number; status: string; chores: Chores; }
const KEYS = ["pet", "channel", "claim"] as const;

export function deriveCardState(gotchi: { id: number; hasSoul: boolean }, enrollments: EnrollmentLite[]): CardState {
  const onDuty = enrollments.some((e) => e.gotchiId === gotchi.id && e.status === "active");
  if (onDuty) return "on-duty";
  return gotchi.hasSoul ? "soul-idle" : "no-soul";
}

export function freeChores(enrollments: EnrollmentLite[]): Chores {
  const taken: Chores = { pet: false, channel: false, claim: false };
  for (const e of enrollments) {
    if (e.status !== "active") continue;
    for (const k of KEYS) if (e.chores?.[k]) taken[k] = true;
  }
  return { pet: !taken.pet, channel: !taken.channel, claim: !taken.claim };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/steward/cardState.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/steward/cardState.ts src/lib/steward/cardState.test.ts
git commit -m "feat(steward-ui): pure card-state + chore-availability helpers"
```

---

## Task 2: API client + react-query hooks

**Files:**
- Create: `src/lib/steward/api.ts`, `src/hooks/useSteward.ts`

- [ ] **Step 1: Implement the API client**

```ts
// src/lib/steward/api.ts
import type { Chores } from "./cardState";

export interface Enrollment {
  id: number; owner: string; gotchiId: number; chores: Chores; intervalSec: number;
  smartAccount: string | null; sessionKey: string | null; status: "active" | "paused" | "revoked";
  createdAt: number; lastRunAt: number | null;
}
export interface LogEntry { action: string; detail: string; txHash: string | null; ts: number; }

async function post(path: string, body: unknown) {
  const r = await fetch(`/api/steward/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).error || r.statusText), { status: r.status });
  return r.json();
}
async function get(path: string) {
  const r = await fetch(`/api/steward/${path}`);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

export const stewardApi = {
  status: (owner: string) => get(`status?owner=${owner}`).then((d) => d.enrollments as Enrollment[]),
  log: (owner: string) => get(`log?owner=${owner}`).then((d) => d.log as LogEntry[]),
  enroll: (body: { owner: string; gotchiId: number; chores: Chores; intervalSec: number; smartAccount?: string; sessionKey?: string }) =>
    post("enroll", body) as Promise<Enrollment>,
  pause: (id: number) => post("pause", { id }),
  resume: (id: number) => post("resume", { id }),
  revoke: (id: number) => post("revoke", { id }),
  editChores: (id: number, chores: Chores) => post("edit-chores", { id, chores }),
};
```

- [ ] **Step 2: Implement the hooks**

```ts
// src/hooks/useSteward.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stewardApi } from "@/lib/steward/api";

export function useStewardStatus(owner?: string) {
  return useQuery({ queryKey: ["steward", "status", owner], queryFn: () => stewardApi.status(owner!), enabled: !!owner });
}
export function useStewardLog(owner?: string) {
  return useQuery({ queryKey: ["steward", "log", owner], queryFn: () => stewardApi.log(owner!), enabled: !!owner });
}
export function useStewardMutations(owner?: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["steward", "status", owner] });
  return {
    enroll: useMutation({ mutationFn: stewardApi.enroll, onSuccess: invalidate }),
    pause: useMutation({ mutationFn: stewardApi.pause, onSuccess: invalidate }),
    resume: useMutation({ mutationFn: stewardApi.resume, onSuccess: invalidate }),
    revoke: useMutation({ mutationFn: stewardApi.revoke, onSuccess: invalidate }),
    editChores: useMutation({ mutationFn: (v: { id: number; chores: any }) => stewardApi.editChores(v.id, v.chores), onSuccess: invalidate }),
  };
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm typecheck`
Expected: exit 0.
```bash
git add src/lib/steward/api.ts src/hooks/useSteward.ts
git commit -m "feat(steward-ui): api client + react-query hooks"
```

---

## Task 3: StewardCard (3 states, beast-mode)

**Files:**
- Create: `src/components/steward/StewardCard.tsx`

- [ ] **Step 1: Implement the card**

```tsx
// src/components/steward/StewardCard.tsx
// One gotchi card. Three states via deriveCardState. Beast-mode: dark card, animated
// "On Duty" pulse, soul-xp bar, hover lift. Click routes to the right destination.
import { motion } from "framer-motion";
import { Zap, Sparkles, Lock } from "lucide-react";
import type { CardState } from "@/lib/steward/cardState";

export interface StewardCardProps {
  gotchi: { id: number; name: string; image: string };
  state: CardState;
  soulXpPct?: number;
  chipChores?: string[];
  onClick: () => void;
}

export function StewardCard({ gotchi, state, soulXpPct = 0, chipChores = [], onClick }: StewardCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="relative flex w-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/80 p-4 text-left shadow-lg backdrop-blur"
    >
      {state === "on-duty" && (
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300"
        >
          <Zap size={12} /> On Duty
        </motion.span>
      )}
      <img src={gotchi.image} alt={gotchi.name} className="h-24 w-24 object-contain" />
      <div className="font-bold">{gotchi.name}</div>

      {state === "on-duty" && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-emerald-400" style={{ width: `${soulXpPct}%` }} />
          </div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-400">{chipChores.join(" · ")}</div>
        </>
      )}
      {state === "soul-idle" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/15 px-2 py-1 text-sm text-fuchsia-300">
          <Sparkles size={14} /> Put to work
        </span>
      )}
      {state === "no-soul" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-sm text-zinc-400">
          <Lock size={14} /> Awaken soul
        </span>
      )}
    </motion.button>
  );
}
```

- [ ] **Step 2: Visual verification (after Task 6 wiring)**

Render the page (Task 6) and confirm: on-duty cards show the pulsing badge + xp bar + chore chips; soul-idle shows "Put to work"; no-soul shows the locked "Awaken soul"; hover lifts the card.

- [ ] **Step 3: Commit**

```bash
git add src/components/steward/StewardCard.tsx
git commit -m "feat(steward-ui): StewardCard with 3 states + motion"
```

---

## Task 4: RecruitWizard (4 steps)

**Files:**
- Create: `src/components/steward/RecruitWizard.tsx`

The auth step issues the 7702 delegation + scoped session key client-side using the same `permissionless` stack as Plan 2. Keep that SDK call confined to the injected `issueSessionKey`.

- [ ] **Step 1: Implement the wizard**

```tsx
// src/components/steward/RecruitWizard.tsx
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStewardMutations } from "@/hooks/useSteward";
import type { Chores } from "@/lib/steward/cardState";

interface Props {
  owner: string;
  gotchi: { id: number; name: string; image: string; soulBlurb: string };
  available: Chores;
  onDone: () => void;
  issueSessionKey: (owner: string, gotchiId: number, chores: Chores) => Promise<{ smartAccount: string; sessionKey: string }>;
  fundGasFloat: (smartAccount: string) => Promise<void>;
}

const INTERVALS = [8, 12, 24] as const;

export function RecruitWizard({ owner, gotchi, available, onDone, issueSessionKey, fundGasFloat }: Props) {
  const [step, setStep] = useState(0);
  const [chores, setChores] = useState<Chores>({ pet: available.pet, channel: false, claim: false });
  const [hours, setHours] = useState<number>(8);
  const [keys, setKeys] = useState<{ smartAccount: string; sessionKey: string } | null>(null);
  const { enroll } = useStewardMutations(owner);

  const toggle = (k: keyof Chores) => available[k] && setChores((c) => ({ ...c, [k]: !c[k] }));

  async function authorize() {
    const k = await issueSessionKey(owner, gotchi.id, chores);
    setKeys(k);
    setStep(3);
  }
  async function finish() {
    if (!keys) return;
    await fundGasFloat(keys.smartAccount);
    await enroll.mutateAsync({ owner, gotchiId: gotchi.id, chores, intervalSec: hours * 3600, ...keys });
    onDone();
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6">
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
          {step === 0 && (
            <div>
              <img src={gotchi.image} className="mx-auto h-28" alt={gotchi.name} />
              <h2 className="mt-2 text-center text-xl font-bold">{gotchi.name}</h2>
              <p className="mt-2 text-sm text-zinc-400">{gotchi.soulBlurb}</p>
              <button className="mt-4 w-full rounded-lg bg-fuchsia-600 py-2 font-semibold" onClick={() => setStep(1)}>Meet your steward →</button>
            </div>
          )}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-bold">Pick the chores</h2>
              {(["pet", "channel", "claim"] as const).map((k) => (
                <label key={k} className={`mt-2 flex items-center gap-2 ${available[k] ? "" : "opacity-40"}`}>
                  <input type="checkbox" checked={chores[k]} disabled={!available[k]} onChange={() => toggle(k)} />
                  <span className="capitalize">{k === "claim" ? "empty reservoirs" : k}</span>
                  {!available[k] && <span className="text-xs text-zinc-500">(another steward)</span>}
                </label>
              ))}
              <div className="mt-4">
                <div className="text-sm text-zinc-400">Parcel interval</div>
                <div className="mt-1 flex gap-2">
                  {INTERVALS.map((h) => (
                    <button key={h} onClick={() => setHours(h)} className={`rounded-lg px-3 py-1 ${hours === h ? "bg-emerald-600" : "bg-white/10"}`}>{h}h</button>
                  ))}
                </div>
              </div>
              <button className="mt-4 w-full rounded-lg bg-fuchsia-600 py-2 font-semibold disabled:opacity-40"
                disabled={!chores.pet && !chores.channel && !chores.claim} onClick={() => setStep(2)}>Next →</button>
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-bold">Authorize</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Hiring <b>{gotchi.name}</b> to {(["pet", "channel", "claim"] as const).filter((k) => chores[k]).join(" / ")}.
                It can ONLY do these. Revoke anytime.
              </p>
              <button className="mt-4 w-full rounded-lg bg-fuchsia-600 py-2 font-semibold" onClick={authorize}>Authorize (1 tap)</button>
            </div>
          )}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-bold">Fund gas float</h2>
              <p className="mt-2 text-sm text-zinc-400">A couple dollars of ETH covers months of upkeep. {gotchi.name} pays its own gas from here.</p>
              <button className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-semibold" onClick={finish}>Fund &amp; go On Duty ⚡</button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Wire `issueSessionKey` / `fundGasFloat`**

Implement these two callbacks (passed by `StewardPage`) against the `permissionless` 7702 + smart-session client and a small deposit flow. Verify on Base Sepolia: completing the wizard issues a scoped key, funds a float, and `POST /api/steward/enroll` returns an active enrollment.

- [ ] **Step 3: Commit**

```bash
git add src/components/steward/RecruitWizard.tsx
git commit -m "feat(steward-ui): 4-step recruit wizard"
```

---

## Task 5: ManageView (dashboard / report)

**Files:**
- Create: `src/components/steward/ManageView.tsx`

- [ ] **Step 1: Implement the dashboard**

```tsx
// src/components/steward/ManageView.tsx
import { useStewardLog, useStewardMutations } from "@/hooks/useSteward";
import type { Enrollment } from "@/lib/steward/api";

interface Props {
  owner: string;
  enrollment: Enrollment;
  gotchi: { id: number; name: string; image: string };
  soul?: { level: number; xpPct: number; memories: number }; // SAME object the companion chat shows (wired in Plan 4)
  onBack: () => void;
}

export function ManageView({ owner, enrollment, gotchi, soul, onBack }: Props) {
  const { data: log = [] } = useStewardLog(owner);
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
          <div className="text-xs uppercase text-zinc-400">Soul · Lv{soul.level} · {soul.memories} memories</div>
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/steward/ManageView.tsx
git commit -m "feat(steward-ui): manage view / dashboard"
```

---

## Task 6: StewardPage + route registration

**Files:**
- Create: `src/pages/StewardPage.tsx`
- Modify: the app router (register `/steward`) + the nav (add a "Steward" entry)

- [ ] **Step 1: Implement the page**

```tsx
// src/pages/StewardPage.tsx
// Mission-control grid: the connected wallet's gotchis as cards, routed by state.
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useStewardStatus } from "@/hooks/useSteward";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner"; // existing hook — confirm return shape
import { deriveCardState, freeChores } from "@/lib/steward/cardState";
import { StewardCard } from "@/components/steward/StewardCard";
import { RecruitWizard } from "@/components/steward/RecruitWizard";
import { ManageView } from "@/components/steward/ManageView";

export default function StewardPage() {
  const { address } = useAccount();
  const owner = address?.toLowerCase();
  const { data: gotchis = [] } = useGotchisByOwner(owner);
  const { data: enrollments = [] } = useStewardStatus(owner);
  const [selected, setSelected] = useState<number | null>(null);
  const available = useMemo(() => freeChores(enrollments as any), [enrollments]);

  if (!owner) return <div className="p-8 text-center text-zinc-400">Connect your wallet to manage Stewards.</div>;

  const selectedGotchi = gotchis.find((g: any) => g.id === selected);
  const selectedEnrollment = (enrollments as any[]).find((e) => e.gotchiId === selected && e.status === "active");

  if (selectedGotchi) {
    const state = deriveCardState({ id: selectedGotchi.id, hasSoul: !!selectedGotchi.hasSoul }, enrollments as any);
    if (state === "no-soul") { window.location.href = `/soul/${selectedGotchi.id}`; return null; }
    if (state === "on-duty" && selectedEnrollment) {
      return <div className="p-6"><ManageView owner={owner} enrollment={selectedEnrollment} gotchi={selectedGotchi} onBack={() => setSelected(null)} /></div>;
    }
    return (
      <div className="p-6">
        <RecruitWizard
          owner={owner}
          gotchi={{ ...selectedGotchi, soulBlurb: selectedGotchi.soulBlurb ?? "A soul ready to work." }}
          available={available}
          onDone={() => setSelected(null)}
          issueSessionKey={async () => { throw new Error("wire issueSessionKey (permissionless 7702 + scoped session key)"); }}
          fundGasFloat={async () => { throw new Error("wire fundGasFloat (deposit ETH float / attach paymaster)"); }}
        />
      </div>
    );
  }

  const onDuty = (enrollments as any[]).filter((e) => e.status === "active").length;
  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-white">
      <header className="mb-4">
        <h1 className="text-2xl font-black tracking-tight">STEWARD</h1>
        <p className="text-zinc-400">Put your gotchis to work.</p>
        <div className="mt-2 text-sm text-zinc-500">{onDuty} on duty</div>
      </header>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {gotchis.map((g: any) => {
          const state = deriveCardState({ id: g.id, hasSoul: !!g.hasSoul }, enrollments as any);
          const e = (enrollments as any[]).find((x) => x.gotchiId === g.id && x.status === "active");
          const chores = e ? Object.entries(e.chores).filter(([, v]) => v).map(([k]) => k) : [];
          return (
            <StewardCard
              key={g.id}
              gotchi={{ id: g.id, name: g.name, image: g.image }}
              state={state}
              chipChores={chores}
              soulXpPct={g.soulXpPct ?? 0}
              onClick={() => setSelected(g.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
```

> The `issueSessionKey` / `fundGasFloat` throwers are the two integration seams wired in Task 4 Step 2 (AA SDK + deposit). `useGotchisByOwner` is the existing hook — confirm its return shape and adapt field names (`id`, `name`, `image`, `hasSoul`, `soulBlurb`, `soulXpPct`); `hasSoul`/soul fields come from the soul engine (wired fully in Plan 4).

- [ ] **Step 2: Register the route + nav**

Follow the existing route registration (where other `src/pages/*` are added to the router) and add:
```tsx
import StewardPage from "@/pages/StewardPage";
// in the routes list:
{ path: "/steward", element: <StewardPage /> }
```
Add a "Steward" link to the primary nav next to the other top-level pages.

- [ ] **Step 3: Verify (manual + Playwright)**

Run the app (`pnpm dev`), connect a wallet with gotchis, open `/steward`. Confirm the three card states render and route correctly (wizard / manage / soul redirect). Add a Playwright smoke test under `tests/e2e/` that loads `/steward` and asserts the "STEWARD" heading + at least one card renders.

- [ ] **Step 4: Typecheck, lint, commit**

Run: `pnpm typecheck` (exit 0), `npx eslint src/components/steward src/pages/StewardPage.tsx src/lib/steward --ext ts,tsx` (exit 0).
```bash
git add src/pages/StewardPage.tsx src/components/steward src/lib/steward
git commit -m "feat(steward-ui): StewardPage grid + route + nav"
```

---

## Self-Review

- **Spec coverage:** one gotchi-centric page (Task 6), three card states routing to recruit/manage/soul-mint (Tasks 1+6), 4-step wizard incl. chore picker that disables claimed chores + interval >=8h (Task 4), dashboard with Steward's log + pause/edit/revoke (Task 5), soul XP bar from the shared soul object (Tasks 3+5, data wired in Plan 4), beast-mode visuals via framer-motion (Tasks 3-6).
- **Unit-tested vs manual:** routing/availability logic (`cardState.ts`) is unit-tested; components are manual + Playwright (no RTL in repo).
- **Type consistency:** `Chores`/`CardState`/`EnrollmentLite` defined in `cardState.ts` and reused; `Enrollment`/`LogEntry` defined in `api.ts` and reused by hooks + views.
- **Integration seams flagged:** `issueSessionKey`, `fundGasFloat` (AA SDK), and `useGotchisByOwner`/soul fields (Plan 4) are the only un-wired points, each called out inline.
