type EnvKey = keyof ImportMetaEnv | string;

function readEnv(key: EnvKey) {
  return import.meta.env[key as keyof ImportMetaEnv];
}

function resolveEnv(
  key: string,
  fallback: string,
  options?: { required?: boolean }
) {
  const raw = readEnv(key);
  const value = raw ?? "";
  if (!value) {
    if (options?.required) {
      if (import.meta.env.PROD) {
        throw new Error(`[env] Missing required variable: ${key}`);
      }
      if (import.meta.env.DEV) {
        console.warn(`[env] Missing required variable: ${key}`);
      }
    }
    return fallback;
  }
  return value;
}

export const env = {
  siteUrl: resolveEnv(
    "VITE_SITE_URL",
    "https://www.gotchicloset.com"
  ),
  baseRpcUrl: resolveEnv(
    "VITE_BASE_RPC_URL",
    "https://mainnet.base.org"
  ),
  gotchiSubgraphUrl: resolveEnv(
    "VITE_GOTCHI_SUBGRAPH_URL",
    "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn"
  ),
  // Optional backup subgraph endpoint (your self-hosted mirror). Empty = no failover
  // (behaviour unchanged). When set, the client auto-routes to whichever endpoint is
  // fresh/healthy — see src/graphql/subgraphFailover.ts.
  gotchiSubgraphUrlBackup: resolveEnv("VITE_GOTCHI_SUBGRAPH_URL_BACKUP", ""),
  walletConnectProjectId: resolveEnv("VITE_WALLETCONNECT_PROJECT_ID", "", {
    required: true,
  }),
  donationAddress: resolveEnv("VITE_DONATION_ADDRESS", ""),
  grimlabsName: resolveEnv("VITE_GRIMLABS_NAME", "GrimLabs"),
  grimlabsUrl: resolveEnv("VITE_GRIMLABS_URL", "https://grimlabs.xyz"),
  // Address that receives the third-party split on listings created via this UI.
  // Set to your collection wallet to capture the nominal fee. Empty = no third-party.
  lendingFeeAddress: resolveEnv("VITE_LENDING_FEE_ADDRESS", ""),
  // Percentage of revenue split that goes to lendingFeeAddress (0-100, must keep
  // owner+borrower+other = 100). Default 1%.
  lendingFeePct: resolveEnv("VITE_LENDING_FEE_PCT", "1"),
  // Auto-renew operator wallet — backend hot wallet that re-lists gotchis on schedule.
  // Owner must call setLendingOperator(thisAddr, tokenId, true) once to opt in.
  autoRenewOperator: resolveEnv("VITE_AUTORENEW_OPERATOR", ""),
  // Auto-renew backend API URL (where the cron service runs)
  autoRenewApiUrl: resolveEnv("VITE_AUTORENEW_API_URL", ""),
  // Companion backend origin (the same Express server on the VPS). Empty in local
  // dev so the Vite /api proxy handles it; in prod the companion routes live on the
  // VPS (not Vercel), so default to the public API origin. Override per-deploy with
  // VITE_COMPANION_API_URL if the hostname differs.
  companionApiUrl: resolveEnv(
    "VITE_COMPANION_API_URL",
    import.meta.env.PROD ? "https://api.gotchicloset.com" : ""
  ),
  // Wallet that receives GHST premium payments for the companion. Defaults to the
  // GotchiCloset operator wallet (same as the lending fee address).
  companionReceivingWallet: resolveEnv(
    "VITE_COMPANION_RECEIVING_WALLET",
    "0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96"
  ),
  // Premium (OpenAI) tier. Now safe to show: the server has an OpenAI key and the
  // premium tier is gated behind a wallet signature (see server/companion/auth.ts),
  // so a spoofed wallet can't spend the key. Set "false" to hide the CTA again.
  companionPremiumEnabled:
    resolveEnv("VITE_COMPANION_PREMIUM_ENABLED", "true") === "true",
  // Auto-renew service fee — paid in GHST via the protocol's splitOther mechanism.
  // Default: 5% of revenue split goes to GotchiCloset operator wallet on every rental
  // of an auto-renewed listing. Owner can opt out (then auto-renew is disallowed).
  autoRenewFeeAddress: resolveEnv(
    "VITE_AUTORENEW_FEE_ADDRESS",
    "0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96"
  ),
  autoRenewFeePct: resolveEnv("VITE_AUTORENEW_FEE_PCT", "5"),
};

