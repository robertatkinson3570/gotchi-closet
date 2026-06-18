import { useAccount } from "wagmi";
import { normalizeAddress } from "@/lib/address";
import { useGotchisByOwner } from "@/lib/hooks/useGotchisByOwner";
import type { Gotchi } from "@/types";

// The companion is mounted globally, but the app store's `gotchis` is only
// populated by the Dress/Explorer pages. Fetch the connected wallet's gotchis
// directly (react-query — shared/deduped with those pages) so the companion
// works on every route.
export function useCompanionGotchis(): Gotchi[] {
  const { address, isConnected } = useAccount();
  const owner = isConnected && address ? normalizeAddress(address) : undefined;
  return useGotchisByOwner(owner).gotchis;
}
