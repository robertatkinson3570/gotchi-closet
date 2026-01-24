import { Interface } from "ethers";
import { requireEnv } from "./env.js";

const SVG_FACET_ABI = [
  "function getAavegotchiSvg(uint256 _tokenId) external view returns (string)",
  "function previewAavegotchi(uint256 _hauntId, address _collateralType, int16[6] _numericTraits, uint16[16] _equippedWearables) external view returns (string)",
];

const svgFacet = new Interface(SVG_FACET_ABI);
const RPC_TIMEOUT_MS = 8000;
const MAX_RPC_ATTEMPTS = 3;

function getRpcUrls(): string[] {
  const list = process.env.VITE_BASE_RPC_URLS || "";
  const urls = list
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (urls.length > 0) return urls;
  return [requireEnv("VITE_BASE_RPC_URL")];
}

function getDiamondAddress() {
  return requireEnv("VITE_GOTCHI_DIAMOND_ADDRESS");
}

function normalizeTraits(traits: number[]): number[] {
  const normalized = new Array(6).fill(0);
  for (let i = 0; i < 6; i++) {
    const value = Number(traits[i]) || 0;
    normalized[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
  }
  return normalized;
}

function normalizeWearables(wearableIds: number[]): number[] {
  const normalized = new Array(16).fill(0);
  for (let i = 0; i < Math.min(16, wearableIds.length); i++) {
    const value = Number(wearableIds[i]) || 0;
    normalized[i] = Math.max(0, Math.min(65535, Math.round(value)));
  }
  return normalized;
}

async function callRpcOnce<T>(
  url: string,
  payload: { method: string; params: unknown[] }
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 100000),
        method: payload.method,
        params: payload.params,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`RPC HTTP ${response.status}: ${errorBody}`);
    }
    const json = await response.json();
    if (json.error) {
      throw new Error(`RPC error: ${json.error.message}`);
    }
    return json.result as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callRpc<T>(payload: { method: string; params: unknown[] }): Promise<T> {
  const urls = getRpcUrls();
  const attempts = Math.min(MAX_RPC_ATTEMPTS, urls.length);
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const url = urls[i];
    try {
      return await callRpcOnce<T>(url, payload);
    } catch (error) {
      const message = (error as Error).message || "";
      lastError = error as Error;
      if (message.includes("429") || message.includes("over rate limit")) {
        continue;
      }
      if (attempts === 1) break;
    }
  }
  throw lastError || new Error("RPC request failed");
}

export function getPlaceholderSvg(seed: string): string {
  const hue =
    seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return `
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" fill="hsl(${hue} 50% 96%)"/>
      <circle cx="32" cy="28" r="16" fill="hsl(${hue} 40% 85%)"/>
      <circle cx="26" cy="26" r="3" fill="hsl(${hue} 40% 30%)"/>
      <circle cx="38" cy="26" r="3" fill="hsl(${hue} 40% 30%)"/>
      <path d="M22 36c4-4 16-4 20 0" stroke="hsl(${hue} 40% 30%)" stroke-width="3" stroke-linecap="round" fill="none"/>
    </svg>
  `;
}

export async function getGotchiSvg(tokenId: string): Promise<string> {
  const callData = svgFacet.encodeFunctionData("getAavegotchiSvg", [
    BigInt(tokenId),
  ]);
  const result = await callRpc<string>({
    method: "eth_call",
    params: [
      {
        to: getDiamondAddress(),
        data: callData,
      },
      "latest",
    ],
  });
  return svgFacet.decodeFunctionResult("getAavegotchiSvg", result)[0];
}

export async function getGotchiSvgs(tokenIds: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(
    tokenIds.map(async (tokenId) => {
      result[tokenId] = await getGotchiSvg(tokenId);
    })
  );
  return result;
}

export async function previewGotchiSvg(input: {
  hauntId: number;
  collateral: string;
  numericTraits: number[];
  wearableIds: number[];
}): Promise<string> {
  const callData = svgFacet.encodeFunctionData("previewAavegotchi", [
    BigInt(input.hauntId),
    input.collateral,
    normalizeTraits(input.numericTraits),
    normalizeWearables(input.wearableIds),
  ]);
  const result = await callRpc<string>({
    method: "eth_call",
    params: [
      {
        to: getDiamondAddress(),
        data: callData,
      },
      "latest",
    ],
  });
  return svgFacet.decodeFunctionResult("previewAavegotchi", result)[0];
}

export async function getWearableThumbs(
  input: { hauntId: number; collateral: string; numericTraits: number[] },
  wearableIds: number[]
): Promise<Record<number, string>> {
  const thumbs: Record<number, string> = {};
  await Promise.all(
    wearableIds.map(async (wearableId) => {
      const wearableValues = new Array(16).fill(0).map((_, idx) =>
        idx === 0 ? wearableId : 0
      );
      const svg = await previewGotchiSvg({
        hauntId: input.hauntId,
        collateral: input.collateral,
        numericTraits: input.numericTraits,
        wearableIds: wearableValues,
      });
      thumbs[wearableId] = svg;
    })
  );
  return thumbs;
}

