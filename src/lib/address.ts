import { isAddress } from "viem";

export function isValidAddress(address: string): boolean {
  return isAddress(address);
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

