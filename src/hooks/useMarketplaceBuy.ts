import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BASE_CHAIN_ID } from "@/lib/chains";
import {
  AAVEGOTCHI_DIAMOND_BASE,
  GHST_TOKEN_BASE,
  ERC20_ABI,
  ERC721_MARKETPLACE_ABI,
  ERC1155_MARKETPLACE_ABI,
  MAX_UINT256,
} from "@/lib/lending/contracts";
import { parseRevert } from "@/lib/lending/parseRevert";

export type BuyStep = "idle" | "approving" | "submitting" | "confirming" | "success" | "error";

export type BuyParams = {
  /** Subgraph listing id. Also used as the per-item busy key. */
  listingId: string;
  /** NFT/item token id. */
  tokenId: string;
  /** Listed price in wei (the exact amount the tx is checked against). */
  priceInWei: bigint;
  /** ERC721 = gotchis/parcels, ERC1155 = wearables/items/installations/tiles. */
  kind: "erc721" | "erc1155";
  /** The NFT/item contract address (gotchi diamond, wearable diamond, etc.). */
  contractAddress: `0x${string}`;
  /** ERC1155 only: quantity to buy (defaults to 1). */
  quantity?: number;
};

/**
 * Buy a Baazaar listing, signed in the browser wallet. Ensures GHST is approved
 * to the Aavegotchi diamond (MarketplaceFacet) then executes the listing via the
 * front-run-protected `…ToRecipient` function so the tx reverts if the listing
 * changed. One hook instance drives one card's button via `activeKey`.
 */
export function useMarketplaceBuy() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<BuyStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [bulkStep, setBulkStep] = useState<BuyStep>("idle");
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const reset = useCallback(() => {
    setStep("idle");
    setErrorMsg(null);
    setActiveKey(null);
  }, []);

  const buy = useCallback(
    async (p: BuyParams) => {
      if (!isConnected || !address || !publicClient) return;
      if (!isOnBase) {
        setActiveKey(p.listingId);
        setStep("error");
        setErrorMsg("Switch to Base to buy.");
        return;
      }
      setActiveKey(p.listingId);
      setErrorMsg(null);
      try {
        // 1. Ensure GHST allowance to the diamond covers the price.
        const allowance = (await publicClient.readContract({
          address: GHST_TOKEN_BASE,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, AAVEGOTCHI_DIAMOND_BASE],
        })) as bigint;

        if (allowance < p.priceInWei) {
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

        // 2. Execute the listing.
        setStep("submitting");
        const hash =
          p.kind === "erc721"
            ? await writeContractAsync({
                chainId: BASE_CHAIN_ID,
                address: AAVEGOTCHI_DIAMOND_BASE,
                abi: ERC721_MARKETPLACE_ABI,
                functionName: "executeERC721ListingToRecipient",
                args: [BigInt(p.listingId), p.contractAddress, p.priceInWei, BigInt(p.tokenId), address],
              })
            : await writeContractAsync({
                chainId: BASE_CHAIN_ID,
                address: AAVEGOTCHI_DIAMOND_BASE,
                abi: ERC1155_MARKETPLACE_ABI,
                functionName: "executeERC1155ListingToRecipient",
                args: [
                  BigInt(p.listingId),
                  p.contractAddress,
                  BigInt(p.tokenId),
                  BigInt(p.quantity ?? 1),
                  p.priceInWei,
                  address,
                ],
              });
        setStep("confirming");
        await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

        setStep("success");
        // Listings move to purchased; refresh anything listing-derived.
        queryClient.invalidateQueries({ queryKey: ["baazaar"] });
        queryClient.invalidateQueries({ queryKey: ["gotchis"] });
      } catch (e) {
        setStep("error");
        setErrorMsg(parseRevert(e));
      }
    },
    [isConnected, address, isOnBase, publicClient, writeContractAsync, queryClient]
  );

  // Buy many listings in one flow: approve GHST once for the total, then execute
  // each sequentially (the diamond has no mixed-category batch buy). Bad items
  // are skipped so one failure doesn't strand the rest.
  const bulkBuy = useCallback(
    async (items: BuyParams[]) => {
      if (!isConnected || !address || !publicClient || items.length === 0) return;
      if (!isOnBase) {
        setBulkStep("error");
        setErrorMsg("Switch to Base to buy.");
        return;
      }
      setErrorMsg(null);
      setBulkStep("approving");
      setBulkProgress({ done: 0, total: items.length });
      try {
        const total = items.reduce((s, i) => s + i.priceInWei, 0n);
        const allowance = (await publicClient.readContract({
          address: GHST_TOKEN_BASE,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, AAVEGOTCHI_DIAMOND_BASE],
        })) as bigint;
        if (allowance < total) {
          const ah = await writeContractAsync({
            chainId: BASE_CHAIN_ID,
            address: GHST_TOKEN_BASE,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [AAVEGOTCHI_DIAMOND_BASE, MAX_UINT256],
          });
          await publicClient.waitForTransactionReceipt({ hash: ah, confirmations: 1 });
        }
        setBulkStep("submitting");
        let done = 0;
        let failed = 0;
        for (const p of items) {
          try {
            const hash =
              p.kind === "erc721"
                ? await writeContractAsync({
                    chainId: BASE_CHAIN_ID,
                    address: AAVEGOTCHI_DIAMOND_BASE,
                    abi: ERC721_MARKETPLACE_ABI,
                    functionName: "executeERC721ListingToRecipient",
                    args: [BigInt(p.listingId), p.contractAddress, p.priceInWei, BigInt(p.tokenId), address],
                  })
                : await writeContractAsync({
                    chainId: BASE_CHAIN_ID,
                    address: AAVEGOTCHI_DIAMOND_BASE,
                    abi: ERC1155_MARKETPLACE_ABI,
                    functionName: "executeERC1155ListingToRecipient",
                    args: [BigInt(p.listingId), p.contractAddress, BigInt(p.tokenId), BigInt(p.quantity ?? 1), p.priceInWei, address],
                  });
            await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
          } catch {
            failed++;
          }
          done++;
          setBulkProgress({ done, total: items.length });
        }
        setBulkStep(failed >= items.length ? "error" : "success");
        if (failed > 0 && failed < items.length) setErrorMsg(`Bought ${items.length - failed}/${items.length}; ${failed} failed.`);
        queryClient.invalidateQueries({ queryKey: ["baazaar"] });
      } catch (e) {
        setBulkStep("error");
        setErrorMsg(parseRevert(e));
      }
    },
    [isConnected, address, isOnBase, publicClient, writeContractAsync, queryClient]
  );

  const resetBulk = useCallback(() => {
    setBulkStep("idle");
    setBulkProgress(null);
  }, []);

  return { buy, step, errorMsg, activeKey, reset, isOnBase, isConnected, bulkBuy, bulkStep, bulkProgress, resetBulk };
}
