import type { ExplorerGotchi } from "./types";

/**
 * Checks if a gotchi has all required fields for rendering GotchiSvg.
 * Returns false if any required field is missing, undefined, or invalid.
 */
export function isGotchiRenderReady(gotchi: ExplorerGotchi): boolean {
  // tokenId must exist and be non-empty
  if (!gotchi.tokenId || typeof gotchi.tokenId !== "string" || gotchi.tokenId.trim() === "") {
    return false;
  }

  // hauntId must exist and be a finite number
  if (typeof gotchi.hauntId !== "number" || !Number.isFinite(gotchi.hauntId)) {
    return false;
  }

  // collateral must exist and be a valid address string
  // CRITICAL: Empty collateral causes all gotchis to share same requestKey
  if (!gotchi.collateral || typeof gotchi.collateral !== "string" || gotchi.collateral.trim() === "") {
    return false;
  }
  // Basic validation: should look like an address (starts with 0x and has reasonable length)
  const trimmed = gotchi.collateral.trim();
  if (!trimmed.startsWith("0x") || trimmed.length < 10) {
    return false;
  }

  // numericTraits must be a 6-element array with all finite numbers
  if (!Array.isArray(gotchi.numericTraits) || gotchi.numericTraits.length !== 6) {
    return false;
  }
  if (!gotchi.numericTraits.every((t) => typeof t === "number" && Number.isFinite(t))) {
    return false;
  }

  // equippedWearables must be a fixed-length array (16 slots) with all finite numbers
  if (!Array.isArray(gotchi.equippedWearables) || gotchi.equippedWearables.length !== 16) {
    return false;
  }
  if (!gotchi.equippedWearables.every((w) => typeof w === "number" && Number.isFinite(w))) {
    return false;
  }

  return true;
}
