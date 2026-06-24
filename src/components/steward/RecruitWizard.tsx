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
