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
  // Auto-renew service fee — paid in GHST via the protocol's splitOther mechanism.
  // Default: 5% of revenue split goes to GotchiCloset operator wallet on every rental
  // of an auto-renewed listing. Owner can opt out (then auto-renew is disallowed).
  autoRenewFeeAddress: resolveEnv(
    "VITE_AUTORENEW_FEE_ADDRESS",
    "0xc4Cb6cB969e8b4e309Ab98E4Da51b77887aFaD96"
  ),
  autoRenewFeePct: resolveEnv("VITE_AUTORENEW_FEE_PCT", "5"),
};

