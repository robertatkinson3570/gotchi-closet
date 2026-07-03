// src/hooks/useSteward.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWalletClient } from "wagmi";
import { stewardApi } from "@/lib/steward/api";
import { mutateMessage, type StewardAction } from "@/lib/steward/enrollAuth";
import type { Chores } from "@/lib/steward/cardState";
import { env } from "@/lib/env";

// Steward routes live on the VPS in prod (not Vercel); empty in dev so the Vite proxy handles it.
const API = env.companionApiUrl;

export function useStewardStatus(owner?: string) {
  return useQuery({ queryKey: ["steward", "status", owner], queryFn: () => stewardApi.status(owner!), enabled: !!owner });
}
export function useStewardLog(owner?: string) {
  return useQuery({ queryKey: ["steward", "log", owner], queryFn: () => stewardApi.log(owner!), enabled: !!owner });
}
// Path 2: what's due across the connected wallet + the calls to self-execute. Short staleTime
// since it reflects live cooldowns; refetched after a run.
export function useUpkeep(owner?: string) {
  return useQuery({ queryKey: ["steward", "upkeep", owner], queryFn: () => stewardApi.upkeep(owner!), enabled: !!owner, staleTime: 30_000 });
}
// Which of the owner's gotchis hold a minted soul cert (on-chain SoulSeal). One batched call.
export function useGotchiSouls(owner?: string, ids?: number[]) {
  const key = (ids ?? []).slice().sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: ["steward", "souls", owner, key],
    queryFn: async () => {
      const r = await fetch(`${API}/api/steward/souls?owner=${owner}&ids=${key}`);
      if (!r.ok) throw new Error("soul certs failed");
      const d = (await r.json()) as { sealed: number[]; configured: boolean };
      return { sealed: new Set<number>(d.sealed), configured: d.configured };
    },
    enabled: !!owner && !!key,
    staleTime: 60_000,
  });
}
export function useSoulStats(owner?: string, gotchiId?: number) {
  return useQuery({
    queryKey: ["steward", "soul", owner, gotchiId],
    queryFn: async () => {
      const r = await fetch(`${API}/api/steward/soul?owner=${owner}&gotchiId=${gotchiId}`);
      if (!r.ok) throw new Error("soul stats failed");
      return r.json() as Promise<{ level: string; xpPct: number; memories: number }>;
    },
    enabled: !!owner && gotchiId !== undefined,
  });
}
export function useStewardMutations(owner?: string) {
  const qc = useQueryClient();
  const { data: walletClient } = useWalletClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["steward", "status", owner] });
  // Management actions are owner-signature gated server-side: sign the action message with
  // the connected wallet and send ownerSig/signedAt along (one popup per action).
  async function signed(action: StewardAction, id: number, chores?: Chores) {
    if (!walletClient || !owner) throw new Error("Connect your wallet first.");
    const signedAt = Date.now();
    const ownerSig = await walletClient.signMessage({ message: mutateMessage({ action, id, owner, signedAt, chores }) });
    return { id, ownerSig, signedAt };
  }
  return {
    enroll: useMutation({ mutationFn: stewardApi.enroll, onSuccess: invalidate }),
    pause: useMutation({ mutationFn: async (id: number) => stewardApi.pause(await signed("pause", id)), onSuccess: invalidate }),
    resume: useMutation({ mutationFn: async (id: number) => stewardApi.resume(await signed("resume", id)), onSuccess: invalidate }),
    revoke: useMutation({ mutationFn: async (id: number) => stewardApi.revoke(await signed("revoke", id)), onSuccess: invalidate }),
    editChores: useMutation({
      mutationFn: async (v: { id: number; chores: Chores }) => stewardApi.editChores({ ...(await signed("edit-chores", v.id, v.chores)), chores: v.chores }),
      onSuccess: invalidate,
    }),
    runNow: useMutation({
      mutationFn: async (id: number) => stewardApi.runNow(await signed("run-now", id)),
      onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["steward", "log", owner] }); },
    }),
  };
}
