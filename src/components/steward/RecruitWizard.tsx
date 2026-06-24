// src/components/steward/RecruitWizard.tsx
// 4-step recruit flow. Every step says plainly what is about to happen and, at the authorize
// step, exactly what the session key CAN and CANNOT do. Step 1 shows who you're hiring using
// the same soul + personality panels as the companion chat.
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Ban, Check } from "lucide-react";
import { useStewardMutations } from "@/hooks/useSteward";
import { useCompanion } from "@/state/useCompanion";
import { buildPersonality } from "@/lib/companion/personality";
import { PersonalityCard } from "@/components/companion/PersonalityCard";
import { SoulDepthMeter } from "@/components/companion/SoulDepthMeter";
import { GotchiSvgById } from "@/components/explorer/GotchiSvgById";
import type { Chores } from "@/lib/steward/cardState";

interface Props {
  owner: string;
  gotchi: { id: number; name: string } & Record<string, any>; // raw gotchi (traits) for personality
  available: Chores;
  onDone: () => void;
  issueSessionKey: (owner: string, gotchiId: number, chores: Chores) => Promise<{ smartAccount: string; sessionKey: string; ownerSig?: string; signedAt?: number }>;
  fundGasFloat: (smartAccount: string) => Promise<void>;
  // Ledger-friendly pet-only path (one setPetOperatorForAll approval, no 7702). Optional.
  // Currently HIDDEN (operator mode would make us pay others' gas) — gated off below.
  approveGaslessPetting?: (owner: string, gotchiId: number, chores: Chores) => Promise<{ smartAccount: string; ownerSig?: string; signedAt?: number; authMode: "operator" }>;
}

const INTERVALS = [8, 12, 24] as const;
const CHORE_INFO: { key: keyof Chores; title: string; blurb: string }[] = [
  { key: "pet", title: "Pet", blurb: "Pets all your gotchis every 12h so kinship keeps climbing across your whole collection." },
  { key: "channel", title: "Channel", blurb: "Pairs your highest-kinship gotchis with your highest-level parcel altars each run (same as Land Management), until it runs out of ready gotchis or parcels." },
  { key: "claim", title: "Empty reservoirs", blurb: "Claims ready alchemica from your parcels straight to your own wallet." },
];

// As you click through, the gotchi chats about each step in the companion: in-character, but it
// also explains what that step actually does.
const STEP_LINES: Record<number, string[]> = {
  1: [
    "step 1: pick my chores 👀 pet your gotchis, channel your best gotchis on your top altars, empty reservoirs. tick what you want + set how often I run.",
    "what am I on? choose my chores (pet / channel / claim) and the interval. for channeling I pair your highest-kinship gotchis with your highest-level altars.",
  ],
  2: [
    "step 2: one signature grants me a scoped key 🫡 I can ONLY pet/channel/claim, never move, sell, or spend your stuff. revoke anytime.",
    "this sig locks my powers to pet/channel/claim. your assets never move and you can fire me whenever.",
  ],
  3: [
    "step 3: fund a tiny ETH float so I pay my own gas each run 🔥 a couple bucks covers months. top up or withdraw anytime.",
    "last bit: drop a little ETH and I cover my own gas from it, never you directly. pull it back whenever.",
  ],
};
const FINISH_LINES = [
  "done! I'm on duty ⚡ I'll pet/channel/claim on schedule. manage or fire me here anytime.",
  "hired 😎 your estate is handled now, I'll work quietly in the background.",
];
const pickLine = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export function RecruitWizard({ owner, gotchi, available, onDone, issueSessionKey, fundGasFloat, approveGaslessPetting }: Props) {
  const [step, setStep] = useState(0);
  const [chores, setChores] = useState<Chores>({ pet: available.pet, channel: false, claim: false });
  const [hours, setHours] = useState<number>(8);
  const [keys, setKeys] = useState<{ smartAccount: string; sessionKey: string; ownerSig?: string; signedAt?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { enroll } = useStewardMutations(owner);
  const say = useCompanion((s) => s.say);

  // The gotchi reacts in the companion as you advance (step 0's opener is set on card click).
  useEffect(() => { const lines = STEP_LINES[step]; if (lines) say(pickLine(lines)); }, [step]);

  const profile = useMemo(() => { try { return buildPersonality(gotchi as any); } catch { return null; } }, [gotchi]);
  const picked = (["pet", "channel", "claim"] as const).filter((k) => chores[k]).map((k) => CHORE_INFO.find((c) => c.key === k)!.title.toLowerCase());
  const toggle = (k: keyof Chores) => available[k] && setChores((c) => ({ ...c, [k]: !c[k] }));

  async function authorize() {
    setBusy(true); setErr(null);
    try { setKeys(await issueSessionKey(owner, gotchi.id, chores)); setStep(3); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }
  async function finish() {
    if (!keys) return;
    setBusy(true); setErr(null);
    try {
      await fundGasFloat(keys.smartAccount);
      await enroll.mutateAsync({ owner, gotchiId: gotchi.id, chores, intervalSec: hours * 3600, ...keys });
      say(pickLine(FINISH_LINES));
      onDone();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  // Ledger-friendly, pet-only path: one approval, relayer pets, no gas float to fund.
  const petOnly = chores.pet && !chores.channel && !chores.claim;
  async function authorizeOperator() {
    if (!approveGaslessPetting) return;
    setBusy(true); setErr(null);
    try {
      const a = await approveGaslessPetting(owner, gotchi.id, chores);
      await enroll.mutateAsync({ owner, gotchiId: gotchi.id, chores, intervalSec: hours * 3600, smartAccount: a.smartAccount, ownerSig: a.ownerSig, signedAt: a.signedAt, authMode: a.authMode });
      say(pickLine(FINISH_LINES));
      onDone();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6">
      <div className="mb-3 text-[11px] uppercase tracking-widest text-zinc-500">Step {step + 1} of 4</div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
          {step === 0 && (
            <div>
              <GotchiSvgById id={String(gotchi.id)} className="mx-auto h-28 w-28 [&>svg]:h-full [&>svg]:w-full" />
              <h2 className="mt-2 text-center text-xl font-bold">{gotchi.name}</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Hire <b>{gotchi.name}</b> as your estate steward. It handles daily upkeep across <b>all</b> your gotchis and
                parcels automatically, you keep full custody and pay only your own gas.
              </p>
              {profile && <div className="mt-3"><PersonalityCard profile={profile} /></div>}
              <SoulDepthMeter tokenId={String(gotchi.id)} />
              <button className="mt-4 w-full rounded-lg bg-fuchsia-600 py-2 font-semibold" onClick={() => setStep(1)}>Continue →</button>
            </div>
          )}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-bold">What should {gotchi.name} do?</h2>
              <div className="mt-2 space-y-2">
                {CHORE_INFO.map(({ key, title, blurb }) => (
                  <label key={key} className={`flex gap-2 rounded-lg border border-white/10 p-2 ${available[key] ? "cursor-pointer hover:bg-white/5" : "opacity-40"}`}>
                    <input type="checkbox" className="mt-1" checked={chores[key]} disabled={!available[key]} onChange={() => toggle(key)} />
                    <span>
                      <span className="font-semibold">{title}</span>
                      {!available[key] && <span className="ml-1 text-xs text-zinc-500">(another steward covers this)</span>}
                      <span className="block text-xs text-zinc-400">{blurb}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <div className="text-sm text-zinc-300">How often should parcel work run?</div>
                <div className="mt-1 flex gap-2">
                  {INTERVALS.map((h) => (
                    <button key={h} onClick={() => setHours(h)} className={`rounded-lg px-3 py-1 ${hours === h ? "bg-emerald-600" : "bg-white/10"}`}>{h}h</button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-zinc-500">8h is the on-chain cooldown floor. Longer = fewer transactions = less gas.</p>
              </div>
              <button className="mt-4 w-full rounded-lg bg-fuchsia-600 py-2 font-semibold disabled:opacity-40"
                disabled={!chores.pet && !chores.channel && !chores.claim} onClick={() => setStep(2)}>Continue →</button>
            </div>
          )}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-bold">Authorize {gotchi.name}</h2>
              <p className="mt-2 text-sm text-zinc-400">
                <b>One signature.</b> It upgrades your wallet to a smart account (EIP-7702: same address, your assets never move)
                and grants {gotchi.name} a <b>limited session key</b>. After this it runs hands-off, no more popups.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                <li>✍️ You sign <b>once</b> now. The steward signs every run after that, never you.</li>
                <li>⛽ Gas comes from <b>your own ETH</b> (you fund it next). We never pay or touch it.</li>
                <li>↩️ <b>Revoke anytime</b> from the dashboard, the key dies instantly.</li>
              </ul>
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300"><ShieldCheck size={15} /> It can ONLY</div>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">
                  {picked.map((p) => <li key={p} className="flex items-center gap-1"><Check size={12} className="text-emerald-400" /> {p === "empty reservoirs" ? "claim alchemica to your wallet" : `${p} your assets`}</li>)}
                </ul>
              </div>
              <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-red-300"><Ban size={15} /> It can NEVER</div>
                <p className="mt-1 text-xs text-zinc-300">transfer, sell, list, swap, or spend anything, ever. You stay in full custody and can revoke instantly, anytime.</p>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-amber-300/80">
                🔐 Hardware wallet (Ledger)? The one-time upgrade uses EIP-7702, which some hardware wallets don&rsquo;t support yet. If it won&rsquo;t sign, do this one step from a 7702-capable wallet (MetaMask/Rabby), then your cold wallet isn&rsquo;t needed and your funds stay put.
              </p>
              {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
              <button className="mt-4 w-full rounded-lg bg-fuchsia-600 py-2 font-semibold disabled:opacity-50" disabled={busy} onClick={authorize}>
                {busy ? "Waiting for signature…" : "Sign & authorize (you pay gas, needs a 7702 wallet)"}
              </button>
              {import.meta.env.VITE_STEWARD_GASLESS === "1" && petOnly && approveGaslessPetting && (
                <>
                  <div className="my-2 text-center text-[11px] text-zinc-500">or, works with any wallet incl. Ledger</div>
                  <button className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-50" disabled={busy} onClick={authorizeOperator}>
                    {busy ? "Approving…" : "Approve gasless petting"}
                  </button>
                  <p className="mt-1 text-[10px] text-zinc-500">One normal approval, no 7702. The steward pets for you and we cover the (pennies) gas. Pet-only; channel/claim need the session key above.</p>
                </>
              )}
            </div>
          )}
          {step === 3 && (
            <div>
              <h2 className="text-lg font-bold">Fund the gas float</h2>
              <p className="mt-2 text-sm text-zinc-400">
                {gotchi.name} pays its <b>own</b> gas from a small ETH float on your smart account, a couple of dollars covers
                months of upkeep. You fund it and only you; we never pay or touch your gas. Top up or withdraw anytime.
              </p>
              {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
              <button className="mt-4 w-full rounded-lg bg-emerald-600 py-2 font-semibold disabled:opacity-50" disabled={busy} onClick={finish}>
                {busy ? "Funding…" : `Fund & put ${gotchi.name} on duty ⚡`}
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
