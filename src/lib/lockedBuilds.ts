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
const GLOBAL_NS = "global";

function getStorageKey(chainId: number): string {
  return `${STORAGE_KEY_PREFIX}:${chainId}:${GLOBAL_NS}`;
}

/** One-time migration: merge any legacy per-wallet(-combo) keys into the global key. */
function migrateLegacyKeys(chainId: number): void {
  try {
    const globalKey = getStorageKey(chainId);
    if (localStorage.getItem(globalKey)) return;
    const merged: LockedBuildsData = { version: 1, lockedById: {}, overridesById: {} };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${STORAGE_KEY_PREFIX}:${chainId}:`) || key === globalKey) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "");
        if (parsed?.version === 1) {
          Object.assign(merged.lockedById, parsed.lockedById || {});
          Object.assign(merged.overridesById, parsed.overridesById || {});
        }
      } catch { /* skip corrupt entries */ }
    }
    if (Object.keys(merged.lockedById).length > 0) {
      localStorage.setItem(globalKey, JSON.stringify(merged));
    }
  } catch { /* storage unavailable */ }
}

export function loadLockedBuilds(chainId: number): LockedBuildsData {
  migrateLegacyKeys(chainId);
  const key = getStorageKey(chainId);
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
  data: LockedBuildsData
): void {
  const key = getStorageKey(chainId);
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
