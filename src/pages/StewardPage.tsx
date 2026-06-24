// src/pages/StewardPage.tsx
// Mission-control grid: the connected wallet's gotchis as cards, routed by state.
//
// Drift notes vs the plan (adapted to the real repo):
// - useGotchisByOwner returns { gotchis, isLoading } (not a react-query { data }); Gotchi.id
//   is a string and has no image/soul fields. We map each gotchi to a card view-model with
//   the on-chain SVG endpoint (/api/gotchis/:id/svg) and numeric id.
// - `hasSoul` is not yet provided by any hook; default true (recruit-first). The real
//   per-gotchi soul-cert gate + soul XP land with the soul wiring (Plan 4 / follow-up); the
//   no-soul branch routes to the existing /soul/verify/:tokenId flow once that signal exists.
// - issueSessionKey / fundGasFloat are the client AA seam (EIP-7702 + scoped session key +
//   gas-float deposit), verified on Base Sepolia before prod — same SDK seam as server aa.ts.
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useStewardStatus } from "@/hooks/useSteward";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import { deriveCardState, freeChores } from "@/lib/steward/cardState";
import { StewardCard } from "@/components/steward/StewardCard";
import { RecruitWizard } from "@/components/steward/RecruitWizard";
import { ManageView } from "@/components/steward/ManageView";
import type { Enrollment } from "@/lib/steward/api";

interface CardGotchi { id: number; name: string; image: string; hasSoul: boolean; soulBlurb: string; soulXpPct: number; }

export default function StewardPage() {
  const { address } = useAccount();
  const owner = address?.toLowerCase();
  const { gotchis: rawGotchis } = useGotchisByOwner(owner);
  const { data: enrollments = [] } = useStewardStatus(owner);
  const [selected, setSelected] = useState<number | null>(null);

  const gotchis = useMemo<CardGotchi[]>(
    () =>
      rawGotchis.map((g) => ({
        id: Number(g.id),
        name: g.name,
        image: `/api/gotchis/${g.id}/svg`,
        hasSoul: true, // Plan-4 / soul-wiring follow-up supplies the real per-gotchi cert signal.
        soulBlurb: "A soul ready to work.",
        soulXpPct: 0,
      })),
    [rawGotchis]
  );
  const available = useMemo(() => freeChores(enrollments as any), [enrollments]);

  if (!owner) return <div className="p-8 text-center text-zinc-400">Connect your wallet to manage Stewards.</div>;

  const selectedGotchi = gotchis.find((g) => g.id === selected);
  const selectedEnrollment = (enrollments as Enrollment[]).find((e) => e.gotchiId === selected && e.status === "active");

  if (selectedGotchi) {
    const state = deriveCardState({ id: selectedGotchi.id, hasSoul: selectedGotchi.hasSoul }, enrollments as any);
    if (state === "no-soul") { window.location.href = `/soul/verify/${selectedGotchi.id}`; return null; }
    if (state === "on-duty" && selectedEnrollment) {
      return <div className="min-h-screen bg-zinc-950 p-6 text-white"><ManageView owner={owner} enrollment={selectedEnrollment} gotchi={selectedGotchi} onBack={() => setSelected(null)} /></div>;
    }
    return (
      <div className="min-h-screen bg-zinc-950 p-6 text-white">
        <RecruitWizard
          owner={owner}
          gotchi={selectedGotchi}
          available={available}
          onDone={() => setSelected(null)}
          issueSessionKey={async () => { throw new Error("wire issueSessionKey (permissionless 7702 + scoped session key)"); }}
          fundGasFloat={async () => { throw new Error("wire fundGasFloat (deposit ETH float / attach paymaster)"); }}
        />
      </div>
    );
  }

  const onDuty = (enrollments as Enrollment[]).filter((e) => e.status === "active").length;
  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-white">
      <header className="mb-4">
        <h1 className="text-2xl font-black tracking-tight">STEWARD</h1>
        <p className="text-zinc-400">Put your gotchis to work.</p>
        <div className="mt-2 text-sm text-zinc-500">{onDuty} on duty</div>
      </header>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {gotchis.map((g) => {
          const state = deriveCardState({ id: g.id, hasSoul: g.hasSoul }, enrollments as any);
          const e = (enrollments as Enrollment[]).find((x) => x.gotchiId === g.id && x.status === "active");
          const chores = e ? Object.entries(e.chores).filter(([, v]) => v).map(([k]) => k) : [];
          return (
            <StewardCard
              key={g.id}
              gotchi={{ id: g.id, name: g.name, image: g.image }}
              state={state}
              chipChores={chores}
              soulXpPct={g.soulXpPct}
              onClick={() => setSelected(g.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
