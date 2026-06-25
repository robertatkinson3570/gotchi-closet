// src/pages/StewardPage.tsx
// Mission-control grid: the connected wallet's gotchis as cards, routed by state.
// - Soul cert is the REAL on-chain SoulSeal (useGotchiSouls, one batched read). A gotchi
//   without a cert routes to /soul/verify (mint) instead of the recruit wizard.
// - Cards are ordered soul-cert-first, then by highest BRS.
// - issueSessionKey / fundGasFloat are the client AA seam (EIP-7702 + scoped session key +
//   gas-float deposit), verified on Base Sepolia before prod, same seam as server aa.ts.
import { useMemo, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useStewardStatus, useGotchiSouls } from "@/hooks/useSteward";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { useCompanion } from "@/state/useCompanion";
import { deriveCardState, freeChores } from "@/lib/steward/cardState";
import { StewardCard } from "@/components/steward/StewardCard";
import { RecruitWizard } from "@/components/steward/RecruitWizard";
import { ManageView } from "@/components/steward/ManageView";
import { EstateUpkeep } from "@/components/steward/EstateUpkeep";
import { SoulCertificate } from "@/components/soul/SoulCertificate";
import { issueSessionKey as aaIssueSessionKey, fundGasFloat as aaFundGasFloat, approveGaslessPetting as aaApproveGaslessPetting } from "@/lib/steward/aaClient";
import type { Enrollment } from "@/lib/steward/api";
import type { Gotchi } from "@/types";

const brsOf = (g: Gotchi) => g.withSetsRarityScore ?? g.modifiedRarityScore ?? g.baseRarityScore ?? 0;

// First-person openers that ALSO explain what a steward does (shown when you tap to recruit).
const RECRUIT_GREETINGS = [
  "ooo putting me to work?? as your steward I auto-pet your gotchis, channel your parcels + empty reservoirs on a schedule 🔥",
  "psst… make me your steward and I'll keep your whole estate tidy hands-off. you keep full custody 👀",
  "an estate to run?? I'll pet, channel, and claim for you automatically, non-custodial. let's set it up ⚡",
  "hire me as your steward 🙇 I handle the daily upkeep across all your gotchis + parcels so you don't have to",
];
const pickGreeting = () => RECRUIT_GREETINGS[Math.floor(Math.random() * RECRUIT_GREETINGS.length)];

// Path 1 (EIP-7702 session-key automation) is built but not yet verified on-chain, so it's gated
// OFF in prod. Path 2 (EstateUpkeep — run from your own wallet) is the shipped path. Flip
// VITE_STEWARD_AUTOMATION=1 to re-enable the recruit wizard once session mode is verified.
const AUTOMATION_ENABLED = import.meta.env.VITE_STEWARD_AUTOMATION === "1";

export default function StewardPage() {
  const { address } = useAccount();
  const owner = address?.toLowerCase();
  const { gotchis: rawGotchis, isLoading } = useGotchisByOwner(owner);
  const { data: enrollments = [] } = useStewardStatus(owner);
  const ids = useMemo(() => rawGotchis.map((g) => Number(g.id)), [rawGotchis]);
  const { data: souls } = useGotchiSouls(owner, ids);
  const { data: walletClient } = useWalletClient();
  const openCompanion = useCompanion((s) => s.openWith);
  const [selected, setSelected] = useState<number | null>(null);

  const certConfigured = souls?.configured ?? false;
  // hasSoul = holds an on-chain soul cert. When the seal contract isn't configured we can't
  // verify, so treat all as eligible (page stays usable) rather than blocking everyone.
  const hasSoul = (id: number) => (certConfigured ? !!souls?.sealed.has(id) : true);

  // Soul-cert first, then highest BRS.
  const ordered = useMemo(
    () => [...rawGotchis].sort((a, b) => (Number(hasSoul(Number(b.id))) - Number(hasSoul(Number(a.id)))) || (brsOf(b) - brsOf(a))),
    [rawGotchis, souls, certConfigured]
  );
  const available = useMemo(() => freeChores(enrollments as any), [enrollments]);

  if (!owner) return <div className="min-h-screen bg-zinc-950 p-8 text-center text-zinc-400">Connect your wallet to manage Stewards.</div>;

  const selRaw = rawGotchis.find((g) => Number(g.id) === selected);
  const selEnrollment = (enrollments as Enrollment[]).find((e) => e.gotchiId === selected && e.status === "active");

  if (selRaw) {
    const sid = Number(selRaw.id);
    const state = deriveCardState({ id: sid, hasSoul: hasSoul(sid) }, enrollments as any);
    // No soul cert yet → open the real seal/mint flow (same modal the explorer uses). It can
    // actually seal in prod; locally it shows the cert + "coming soon" (sealing needs the
    // server attestor key, a deploy-only secret — on-chain reads still work here).
    if (state === "no-soul") {
      return <div className="min-h-screen bg-zinc-950"><SoulCertificate tokenId={String(sid)} onClose={() => setSelected(null)} /></div>;
    }
    if (state === "on-duty" && selEnrollment) {
      return <div className="min-h-screen bg-zinc-950 p-6 text-white"><ManageView owner={owner} enrollment={selEnrollment} gotchi={{ id: sid, name: selRaw.name }} onBack={() => setSelected(null)} /></div>;
    }
    return (
      <div className="min-h-screen bg-zinc-950 p-6 text-white">
        <button onClick={() => setSelected(null)} className="mb-3 text-sm text-zinc-400 hover:text-zinc-200">← back</button>
        {AUTOMATION_ENABLED ? (
          <RecruitWizard
            owner={owner}
            gotchi={{ ...selRaw, id: sid, name: selRaw.name }}
            available={available}
            onDone={() => setSelected(null)}
            issueSessionKey={async (o, id, chores) => {
              if (!walletClient) throw new Error("Connect your wallet first.");
              return aaIssueSessionKey(walletClient, o, id, chores);
            }}
            fundGasFloat={aaFundGasFloat}
            approveGaslessPetting={async (o, id, chores) => {
              if (!walletClient) throw new Error("Connect your wallet first.");
              return aaApproveGaslessPetting(walletClient, o, id, chores);
            }}
          />
        ) : (
          <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 text-center">
            <h2 className="text-lg font-bold">Hands-off automation is coming soon</h2>
            <p className="mt-2 text-sm text-zinc-400">
              For now, use <b className="text-emerald-300">Run upkeep</b> on the main page to pet, channel, and claim
              across your whole estate in one click, from your own wallet, your gas.
            </p>
            <button onClick={() => setSelected(null)} className="mt-4 rounded-lg bg-fuchsia-600 px-4 py-2 font-semibold">Back</button>
          </div>
        )}
      </div>
    );
  }

  const onDuty = (enrollments as Enrollment[]).filter((e) => e.status === "active").length;
  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-white">
      <header className="mb-5 max-w-3xl">
        <h1 className="text-2xl font-black tracking-tight">STEWARD</h1>
        <p className="mt-1 text-zinc-300">Keep your whole estate maintained in one click.</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Steward finds everything that's due across your wallet, <b className="text-zinc-200">pet every gotchi</b>, <b className="text-zinc-200">channel every parcel</b>, and
          <b className="text-zinc-200"> empty every reservoir</b>, then runs it from <b className="text-zinc-200">your own wallet</b> when you hit
          <b className="text-emerald-300"> Run upkeep</b>. Fully <b className="text-zinc-200">non-custodial</b>, you pay only your own gas, nothing moves but the chores.
        </p>
        <div className="mt-3 flex gap-4 text-xs text-zinc-500">
          <span><b className="text-emerald-300">{onDuty}</b> on duty</span>
          <span><b className="text-zinc-300">{rawGotchis.length}</b> gotchis</span>
          {certConfigured && <span><b className="text-fuchsia-300">{ids.filter(hasSoul).length}</b> with soul cert</span>}
          <span className="text-zinc-600">sorted: soul cert → BRS</span>
        </div>
      </header>

      <div className="mb-5 max-w-3xl">
        <EstateUpkeep owner={owner} />
      </div>

      {isLoading && <div className="text-sm text-zinc-500">Loading your gotchis…</div>}
      {!isLoading && rawGotchis.length === 0 && <div className="text-sm text-zinc-500">No gotchis in this wallet.</div>}

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {ordered.map((g) => {
          const id = Number(g.id);
          const state = deriveCardState({ id, hasSoul: hasSoul(id) }, enrollments as any);
          const e = (enrollments as Enrollment[]).find((x) => x.gotchiId === id && x.status === "active");
          const chores = e ? Object.entries(e.chores).filter(([, v]) => v).map(([k]) => k) : [];
          return (
            <StewardCard
              key={id}
              gotchi={{ id, name: g.name }}
              state={state}
              brs={brsOf(g)}
              chipChores={chores}
              lentOut={!!(g as any).lentOut}
              onClick={() => {
                setSelected(id);
                // The gotchi pops open the companion and playfully begs for a job.
                if (state === "soul-idle") openCompanion(String(id), pickGreeting());
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
