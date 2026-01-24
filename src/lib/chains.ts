import { BASE_RPC_URL } from "@/lib/config";

export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_HEX = "0x2105";

export const BASE_CHAIN_PARAMS = {
  chainId: BASE_CHAIN_HEX,
  chainName: "Base",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: [BASE_RPC_URL],
  blockExplorerUrls: ["https://basescan.org"],
};

export async function switchToBaseChain(): Promise<void> {
  if (typeof window === "undefined") return;
  const provider = (window as any).ethereum;
  if (!provider?.request) {
    throw new Error("No wallet provider found");
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_HEX }],
    });
  } catch (error: any) {
    if (error?.code === 4902 || error?.data?.originalError?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [BASE_CHAIN_PARAMS],
      });
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_CHAIN_HEX }],
      });
      return;
    }
    throw error;
  }
}

