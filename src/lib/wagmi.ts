import { createConfig, http } from "wagmi";
import { fallback } from "viem";
import { base } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { BASE_RPC_URL, WALLETCONNECT_PROJECT_ID } from "@/lib/config";

const projectId = WALLETCONNECT_PROJECT_ID;
const rpcUrl = BASE_RPC_URL;

const metadata = {
  name: "GotchiCloset",
  description: "Dress and optimize your Aavegotchis on Base.",
  url:
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.gotchicloset.com",
  icons: ["https://www.gotchicloset.com/icon.png"],
};

const connectors = [
  injected({ shimDisconnect: true }),
  ...(projectId
    ? [
        walletConnect({
          projectId,
          showQrModal: true,
          metadata,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  // Multi-RPC fallback: the configured RPC (often the rate-limited public
  // mainnet.base.org) can't handle the land page's 79-parcel multicalls, which
  // left data blank and claim-all partial. Fall back across lenient public RPCs
  // so reads/writes survive any single endpoint rate-limiting.
  transports: {
    [base.id]: fallback([
      http("https://base-rpc.publicnode.com"),
      http("https://base.llamarpc.com"),
      http("https://base.drpc.org"),
      http(rpcUrl),
      http("https://mainnet.base.org"),
    ]),
  },
});

