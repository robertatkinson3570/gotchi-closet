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
    "https://gotchicloset.xyz"
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
};

