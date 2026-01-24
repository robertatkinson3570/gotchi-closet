const DEFAULT_DIAMOND_ADDRESS =
  "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF";

function requireAddress(value: string, key: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`[env] Invalid ${key}: ${value}`);
  }
}

export function getServerEnv() {
  const diamondAddress =
    process.env.VITE_GOTCHI_DIAMOND_ADDRESS || DEFAULT_DIAMOND_ADDRESS;
  requireAddress(diamondAddress, "VITE_GOTCHI_DIAMOND_ADDRESS");
  return {
    diamondAddress,
  };
}

