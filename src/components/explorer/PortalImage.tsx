import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { Aperture } from "lucide-react";
import { BASE_CHAIN_ID } from "@/lib/chains";
import { AAVEGOTCHI_DIAMOND_BASE } from "@/lib/lending/contracts";
import { InlineSvg } from "./InlineSvg";

// The diamond renders portal (and gotchi) art on-chain. Unlike the svg subgraph
// (which only has claimed gotchis), getAavegotchiSvg returns the closed/open
// portal art too — so it's the reliable source for portal images.
const SVG_ABI = [
  { name: "getAavegotchiSvg", type: "function", stateMutability: "view", inputs: [{ name: "_tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
] as const;

export function PortalImage({ tokenId, className }: { tokenId: string; className?: string }) {
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const { data } = useQuery({
    queryKey: ["portal-svg", tokenId],
    enabled: !!publicClient,
    staleTime: 30 * 60_000, // portal art is static
    queryFn: () => publicClient!.readContract({ address: AAVEGOTCHI_DIAMOND_BASE, abi: SVG_ABI, functionName: "getAavegotchiSvg", args: [BigInt(tokenId)] }) as Promise<string>,
  });
  // Stable element identity: the InlineSvg <span> is ALWAYS rendered (it manages
  // its own SVG children imperatively, so unmounting it can never desync React's
  // reconciler). The fallback icon is an overlay shown only while empty — never
  // an element-type swap with the SVG node, which previously threw removeChild
  // when switching tabs away from the Portals grid.
  return (
    <span className="relative flex items-center justify-center w-full h-full">
      {!data && <Aperture className="w-9 h-9 text-fuchsia-400 drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]" />}
      <InlineSvg svg={data} className={className ?? "w-full h-full [&>svg]:w-full [&>svg]:h-full"} />
    </span>
  );
}
