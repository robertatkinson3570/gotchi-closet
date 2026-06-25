// src/hooks/useSteward.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { stewardApi } from "@/lib/steward/api";
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
  const invalidate = () => qc.invalidateQueries({ queryKey: ["steward", "status", owner] });
  return {
    enroll: useMutation({ mutationFn: stewardApi.enroll, onSuccess: invalidate }),
    pause: useMutation({ mutationFn: stewardApi.pause, onSuccess: invalidate }),
    resume: useMutation({ mutationFn: stewardApi.resume, onSuccess: invalidate }),
    revoke: useMutation({ mutationFn: stewardApi.revoke, onSuccess: invalidate }),
    editChores: useMutation({ mutationFn: (v: { id: number; chores: any }) => stewardApi.editChores(v.id, v.chores), onSuccess: invalidate }),
    runNow: useMutation({ mutationFn: stewardApi.runNow, onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["steward", "log", owner] }); } }),
  };
}
