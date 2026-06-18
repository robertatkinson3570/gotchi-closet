import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useCompanion } from "@/state/useCompanion";
import { globalRoomMessage, PREMIUM_SIG_TTL_MS } from "@/lib/companion/premiumAuth";
import {
  getRoastQueue,
  getLeaderboard,
  getRoastBattles,
  getRoastBattle,
  enterQueue,
  leaveQueue,
  startBattle,
  type RoastQueueEntry,
  type RoastBattle,
  type RoastStatRow,
} from "@/lib/roast/api";

export interface UseRoastArenaReturn {
  queue: RoastQueueEntry[];
  leaderboard: RoastStatRow[];
  battles: RoastBattle[];
  refresh(): void;
  enter(tokenId: string): Promise<void>;
  leave(tokenId: string): Promise<void>;
  battle(opponentTokenId: string): Promise<string>;
  loadBattle(id: string): Promise<RoastBattle | null>;
  busy: boolean;
  error: string | null;
}

export function useRoastArena(): UseRoastArenaReturn {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const selectedTokenId = useCompanion((s) => s.selectedTokenId);

  const [queue, setQueue] = useState<RoastQueueEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<RoastStatRow[]>([]);
  const [battles, setBattles] = useState<RoastBattle[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Signature — sign-once pattern (same as GlobalChatTab joinSig())
  // ---------------------------------------------------------------------------
  async function getSignature(): Promise<{ signature: string; signedAt: number }> {
    if (!address) throw new Error("wallet not connected");
    const key = `companion.roomSig.${address.toLowerCase()}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || "null");
      if (cached?.signature && Date.now() - cached.signedAt < PREMIUM_SIG_TTL_MS) return cached;
    } catch { /* ignore */ }
    const signedAt = Date.now();
    const signature = await signMessageAsync({ message: globalRoomMessage(address, signedAt) });
    const sig = { signature, signedAt };
    try { localStorage.setItem(key, JSON.stringify(sig)); } catch { /* ignore */ }
    return sig;
  }

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------
  const refresh = useCallback(() => {
    getRoastQueue().then(setQueue).catch(() => {});
    getLeaderboard(50).then(setLeaderboard).catch(() => {});
    if (selectedTokenId) {
      getRoastBattles(selectedTokenId).then(setBattles).catch(() => {});
    } else {
      setBattles([]);
    }
  }, [selectedTokenId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function enter(tokenId: string): Promise<void> {
    if (!address) throw new Error("wallet not connected");
    setBusy(true); setError(null);
    try {
      const { signature, signedAt } = await getSignature();
      const r = await enterQueue({ tokenId, wallet: address, signature, signedAt });
      if (!r.ok) throw new Error(r.error || "could not enter queue");
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "enter failed";
      setError(msg); throw e;
    } finally {
      setBusy(false);
    }
  }

  async function leave(tokenId: string): Promise<void> {
    if (!address) throw new Error("wallet not connected");
    setBusy(true); setError(null);
    try {
      const { signature, signedAt } = await getSignature();
      const r = await leaveQueue({ tokenId, wallet: address, signature, signedAt });
      if (!r.ok) throw new Error(r.error || "could not leave queue");
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "leave failed";
      setError(msg); throw e;
    } finally {
      setBusy(false);
    }
  }

  async function battle(opponentTokenId: string): Promise<string> {
    if (!address) throw new Error("wallet not connected");
    if (!selectedTokenId) throw new Error("no gotchi selected");
    setBusy(true); setError(null);
    try {
      const { signature, signedAt } = await getSignature();
      const r = await startBattle({
        challengerTokenId: selectedTokenId,
        opponentTokenId,
        wallet: address,
        signature,
        signedAt,
      });
      if (!r.ok || !r.battleId) throw new Error(r.error || "battle failed");
      refresh();
      return r.battleId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "battle failed";
      setError(msg); throw e;
    } finally {
      setBusy(false);
    }
  }

  async function loadBattle(id: string): Promise<RoastBattle | null> {
    return getRoastBattle(id);
  }

  return { queue, leaderboard, battles, refresh, enter, leave, battle, loadBattle, busy, error };
}
