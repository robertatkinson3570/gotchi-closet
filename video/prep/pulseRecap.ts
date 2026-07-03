// Usage: pnpm exec tsx video/prep/pulseRecap.ts
// PULSE_URL env overrides the prod endpoint (e.g. http://localhost:8787/api/pulse).
import { getGotchiSvg } from "../../server/aavegotchi/serverSvgService";
import type { PulseCameo, PulseRecapProps, PulseStat } from "../src/types";
import { cachedSvg, coreQuery, fetchGotchi, writeProps } from "./lib";
import { ghstFromWei, sumLastDays, weekLabel, type SeriesPoint } from "./shape";

type PulsePayloadLite = {
  updatedAt: number;
  series: Record<string, SeriesPoint[]>;
  deltas: Record<string, { wow: number | null; mom: number | null }>;
  verdicts: { verdict: string }[];
};

async function main() {
  const url = process.env.PULSE_URL ?? "https://www.gotchicloset.com/api/pulse";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pulse fetch ${res.status}`);
  const pulse = (await res.json()) as PulsePayloadLite;

  const stat = (key: string, label: string, unit: string): PulseStat => ({
    label,
    value: Math.round(sumLastDays(pulse.series[key], 7)),
    unit,
    wow: pulse.deltas[key]?.wow ?? null,
  });
  const stats = [
    stat("sales_volume_ghst", "GHST TRADED", " GHST"),
    stat("sales_count", "SALES", ""),
    stat("sales_buyers", "UNIQUE BUYERS", ""),
    stat("lendings_agreed", "NEW RENTALS", ""),
  ];

  // top sale of the week as the cameo
  const since = Math.floor(Date.now() / 1000) - 7 * 86_400;
  const sales = await coreQuery<{ erc721Listings: { tokenId: string; priceInWei: string }[] }>(
    `query ($since: BigInt!) {
      erc721Listings(first: 3, where: { timePurchased_gt: $since, category: 3 },
        orderBy: priceInWei, orderDirection: desc) { tokenId priceInWei }
    }`,
    { since: String(since) },
  );
  const cameos: PulseCameo[] = [];
  for (const s of sales.erc721Listings.slice(0, 1)) {
    try {
      const { gotchi } = await fetchGotchi(s.tokenId);
      const svg = await cachedSvg(`gotchi-${s.tokenId}`, () => getGotchiSvg(s.tokenId));
      cameos.push({
        svg,
        name: gotchi.name || `Gotchi #${s.tokenId}`,
        caption: `sold for ${ghstFromWei(s.priceInWei).toLocaleString("en-US")} GHST`,
      });
    } catch (e) {
      console.warn(`cameo skipped for ${s.tokenId}:`, e);
    }
  }

  const greens = pulse.verdicts.filter((v) => v.verdict === "green").length;
  const reds = pulse.verdicts.filter((v) => v.verdict === "red").length;

  const props: PulseRecapProps = {
    videoId: `pulserecap-${new Date(pulse.updatedAt).toISOString().slice(0, 10)}`,
    weekLabel: weekLabel(pulse.updatedAt),
    stats,
    cameos,
    greens,
    reds,
  };
  writeProps(props.videoId, props);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
