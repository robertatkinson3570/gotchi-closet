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
