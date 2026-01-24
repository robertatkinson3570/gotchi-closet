import { createConfig, http } from "wagmi";
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
      : "https://gotchicloset.xyz",
  icons: ["https://gotchicloset.xyz/icon.png"],
};

const connectors = [injected({ shimDisconnect: true })];
if (projectId) {
  connectors.push(
    walletConnect({
      projectId,
      showQrModal: true,
      metadata,
    })
  );
}

export const wagmiConfig = createConfig({
  chains: [base],
  connectors,
  transports: {
    [base.id]: http(rpcUrl),
  },
});

