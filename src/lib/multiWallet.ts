import { normalizeAddress, isValidAddress } from "./address";

const STORAGE_KEY = "gc_multiWallet";
const MAX_WALLETS = 3;

export interface MultiWalletState {
  wallets: string[];
}

export function loadMultiWallets(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as MultiWalletState;
    return (parsed.wallets || []).filter(isValidAddress).slice(0, MAX_WALLETS);
  } catch {
    return [];
  }
}

export function saveMultiWallets(wallets: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = wallets
      .filter(isValidAddress)
      .map(normalizeAddress)
      .slice(0, MAX_WALLETS);
    const unique = [...new Set(normalized)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ wallets: unique }));
  } catch {
  }
}

export function addWallet(address: string): string[] {
  if (!isValidAddress(address)) return loadMultiWallets();
  const normalized = normalizeAddress(address);
  const current = loadMultiWallets();
  if (current.includes(normalized)) return current;
  if (current.length >= MAX_WALLETS) return current;
  const updated = [...current, normalized];
  saveMultiWallets(updated);
  return updated;
}

export function removeWallet(address: string): string[] {
  const normalized = normalizeAddress(address);
  const current = loadMultiWallets();
  const updated = current.filter((w) => w !== normalized);
  saveMultiWallets(updated);
  return updated;
}

export function clearAllWallets(): void {
  saveMultiWallets([]);
}
