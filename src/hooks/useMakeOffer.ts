import { useCallback, useState } from "react";
import { qk } from "@/lib/queryKeys";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  AAVEGOTCHI_DIAMOND_BASE,
  GHST_TOKEN_BASE,
  ERC20_ABI,
  ERC721_BUY_ORDER_ABI,
  ERC1155_BUY_ORDER_ABI,
  BAAZAAR_CATEGORY,
  MAX_UINT256,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";

export type OfferStep = "idle" | "approving" | "submitting" | "confirming" | "success" | "error";

export type OfferParams = {
  /** ERC721 = gotchis/parcels, ERC1155 = wearables/items/installations/tiles. */
  kind: "erc721" | "erc1155";
  /** Baazaar category (BAAZAAR_CATEGORY): 0 wearable, 2 consumable, 3 gotchi, 4 realm/installation, 5 tile. */
  category: number;
  /** NFT/item token id. */
  tokenId: string;
  /** The token contract (gotchi diamond for gotchis & wearables/items). */
  contractAddress: `0x${string}`;
  /** Offer price in wei. For ERC1155 this is the per-unit price. */
  priceInWei: bigint;
  /** ERC1155 only: quantity wanted (defaults to 1). */
  quantity?: number;
  /** Offer lifetime in seconds; 0 = no expiry. */
  durationSeconds?: number;
};

/**
 * Place a Baazaar buy order ("make an offer"), signed in the browser wallet.
 * Escrows GHST to the Aavegotchi diamond, so we ensure allowance first, then
 * call placeERC721BuyOrder / placeERC1155BuyOrder. Gotchi (category 3) orders
 * require exactly 3 bool validation options — all false means "fill regardless
 * of the gotchi's current rarity/kinship". ERC1155 escrows price × quantity.
 */
export function useMakeOffer() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<OfferStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setErrorMsg(null);
  }, []);

  const makeOffer = useCallback(
    async (p: OfferParams) => {
      if (!isConnected || !address || !publicClient) return;
      if (!isOnBase) {
        setStep("error");
        setErrorMsg("Switch to Base to make an offer.");
        return;
      }
      setErrorMsg(null);
      const qty = BigInt(p.quantity ?? 1);
      // ERC1155 escrows the full quantity; ERC721 is a single token.
      const totalCost = p.kind === "erc1155" ? p.priceInWei * qty : p.priceInWei;
      const duration = BigInt(Math.max(0, Math.floor(p.durationSeconds ?? 0)));
      try {
        // 1. Ensure GHST allowance to the diamond covers the escrowed total.
        const allowance = (await publicClient.readContract({
          address: GHST_TOKEN_BASE,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, AAVEGOTCHI_DIAMOND_BASE],
        })) as bigint;

        if (allowance < totalCost) {
          setStep("approving");
          const approveHash = await writeContractAsync({
            chainId: BASE_CHAIN_ID,
            address: GHST_TOKEN_BASE,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [AAVEGOTCHI_DIAMOND_BASE, MAX_UINT256],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash, confirmations: 1 });
        }

        // 2. Place the buy order.
        setStep("submitting");
        const hash =
          p.kind === "erc721"
            ? await writeContractAsync({
                chainId: BASE_CHAIN_ID,
                address: AAVEGOTCHI_DIAMOND_BASE,
                abi: ERC721_BUY_ORDER_ABI,
                functionName: "placeERC721BuyOrder",
                args: [
                  p.contractAddress,
                  BigInt(p.tokenId),
                  BigInt(p.category),
                  p.priceInWei,
                  duration,
                  p.category === BAAZAAR_CATEGORY.AAVEGOTCHI ? [false, false, false] : [],
                ],
              })
            : await writeContractAsync({
                chainId: BASE_CHAIN_ID,
                address: AAVEGOTCHI_DIAMOND_BASE,
                abi: ERC1155_BUY_ORDER_ABI,
                functionName: "placeERC1155BuyOrder",
                args: [p.contractAddress, BigInt(p.tokenId), BigInt(p.category), p.priceInWei, qty, duration],
              });
        setStep("confirming");
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

        setStep("success");
        queryClient.invalidateQueries({ queryKey: qk.baazaar() });
      } catch (e) {
        setStep("error");
        setErrorMsg(parseRevert(e));
      }
    },
    [isConnected, address, isOnBase, publicClient, writeContractAsync, queryClient]
  );

  return { makeOffer, step, errorMsg, reset, isOnBase, isConnected };
}
