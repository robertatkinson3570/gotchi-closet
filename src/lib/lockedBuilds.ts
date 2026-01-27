export interface LockedOverride {
  wearablesBySlot: number[];
  respecAllocated: number[] | null;
  timestamp: number;
}

export interface LockedBuildsData {
  version: 1;
  lockedById: Record<string, boolean>;
  overridesById: Record<string, LockedOverride>;
}

const STORAGE_KEY_PREFIX = "gotchicloset.lockedBuilds.v1";

function getStorageKey(chainId: number, walletAddress: string): string {
  const normalized = walletAddress.toLowerCase();
  return `${STORAGE_KEY_PREFIX}:${chainId}:${normalized}`;
}

export function loadLockedBuilds(
  chainId: number,
  walletAddress: string
): LockedBuildsData {
  const key = getStorageKey(chainId, walletAddress);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { version: 1, lockedById: {}, overridesById: {} };
    }
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) {
      return { version: 1, lockedById: {}, overridesById: {} };
    }
    return {
      version: 1,
      lockedById: parsed.lockedById || {},
      overridesById: parsed.overridesById || {},
    };
  } catch {
    return { version: 1, lockedById: {}, overridesById: {} };
  }
}

export function saveLockedBuilds(
  chainId: number,
  walletAddress: string,
  data: LockedBuildsData
): void {
  const key = getStorageKey(chainId, walletAddress);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save locked builds:", err);
  }
}

export function cleanupStaleLockedBuilds(
  data: LockedBuildsData,
  currentGotchiIds: Set<string>
): LockedBuildsData {
  const lockedById: Record<string, boolean> = {};
  const overridesById: Record<string, LockedOverride> = {};

  for (const gotchiId of Object.keys(data.lockedById)) {
    if (currentGotchiIds.has(gotchiId) && data.lockedById[gotchiId]) {
      lockedById[gotchiId] = true;
      if (data.overridesById[gotchiId]) {
        overridesById[gotchiId] = data.overridesById[gotchiId];
      }
    }
  }

  return { version: 1, lockedById, overridesById };
}

export function computeLockedWearableAllocations(
  overridesById: Record<string, LockedOverride>,
  lockedById: Record<string, boolean>
): Record<number, number> {
  const allocations: Record<number, number> = {};

  for (const gotchiId of Object.keys(lockedById)) {
    if (!lockedById[gotchiId]) continue;
    const override = overridesById[gotchiId];
    if (!override?.wearablesBySlot) continue;

    for (const wearableId of override.wearablesBySlot) {
      if (wearableId && wearableId !== 0) {
        allocations[wearableId] = (allocations[wearableId] || 0) + 1;
      }
    }
  }

  return allocations;
}
