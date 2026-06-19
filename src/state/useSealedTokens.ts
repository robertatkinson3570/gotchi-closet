import { create } from "zustand";

// Tokens the user has sealed during THIS session. A seal is monotonic on-chain
// (once sealed, always sealed), so once we've seen a successful seal we can flip
// the badge/certificate to "sealed" immediately — without waiting for the cached
// seal-status query to refetch, and immune to RPC read-replica lag that could
// briefly still report "unsealed". Cleared on reload (the server read takes over).
interface SealedTokensState {
  sealed: Record<string, true>;
  markSealed: (tokenId: string) => void;
}

export const useSealedTokens = create<SealedTokensState>((set) => ({
  sealed: {},
  markSealed: (tokenId) =>
    set((s) =>
      s.sealed[String(tokenId)] ? s : { sealed: { ...s.sealed, [String(tokenId)]: true } }
    ),
}));
