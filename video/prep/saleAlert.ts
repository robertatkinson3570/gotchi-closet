// Usage: pnpm exec tsx video/prep/saleAlert.ts [--days 7]
// Finds the biggest gotchi (category 3) baazaar sale in the window and preps props.
import { getGotchiSvg } from "../../server/aavegotchi/serverSvgService";
import { fetchAllWearables } from "../../src/graphql/fetchers";
import { computeBRSBreakdown } from "../../src/lib/rarity";
import type { SaleAlertProps, TraitTuple } from "../src/types";
import { arg, cachedSvg, coreQuery, fetchGotchi, writeProps } from "./lib";
import { ghstFromWei, shortAddr } from "./shape";

type ListingRow = {
  tokenId: string;
  priceInWei: string;
  seller: string;
  buyer: string | null;
  recipient: string;
  timePurchased: string;
};

async function main() {
  const days = Number(arg("--days") ?? 7);
  const since = Math.floor(Date.now() / 1000) - days * 86_400;

  const data = await coreQuery<{ erc721Listings: ListingRow[] }>(
    `query ($since: BigInt!) {
      erc721Listings(
        first: 5
        where: { timePurchased_gt: $since, category: 3 }
        orderBy: priceInWei
        orderDirection: desc
      ) { tokenId priceInWei seller buyer recipient timePurchased }
    }`,
    { since: String(since) },
  );
  const sale = data.erc721Listings[0];
  if (!sale) throw new Error(`no gotchi sales in the last ${days} days`);

  const { gotchi } = await fetchGotchi(sale.tokenId);
  const wearables = await fetchAllWearables();
  const wearablesById = new Map(wearables.map((w) => [Number(w.id), w]));
  const svg = await cachedSvg(`gotchi-${sale.tokenId}`, () => getGotchiSvg(sale.tokenId));
  const brs = computeBRSBreakdown({
    baseTraits: gotchi.numericTraits,
    equippedWearables: gotchi.equippedWearables.filter((id) => id > 0),
    wearablesById,
  }).totalBrs;

  // optional USD via prod pulse
  let priceUsd: number | null = null;
  try {
    const pulseRes = await fetch(process.env.PULSE_URL ?? "https://www.gotchicloset.com/api/pulse");
    const pulse = (await pulseRes.json()) as { latest?: Record<string, number> };
    const ghstUsd = pulse.latest?.ghst_price_usd;
    if (ghstUsd) priceUsd = ghstFromWei(sale.priceInWei) * ghstUsd;
  } catch {
    priceUsd = null;
  }

  const soldAgoDays = Math.floor((Date.now() / 1000 - Number(sale.timePurchased)) / 86_400);
  const props: SaleAlertProps = {
    videoId: `salealert-${sale.tokenId}-${sale.timePurchased}`,
    gotchiId: sale.tokenId,
    name: gotchi.name || `Gotchi #${sale.tokenId}`,
    svg,
    priceGhst: ghstFromWei(sale.priceInWei),
    priceUsd,
    traits: gotchi.modifiedNumericTraits.slice(0, 6) as TraitTuple,
    brs,
    buyerShort: shortAddr(sale.buyer ?? sale.recipient),
    sellerShort: shortAddr(sale.seller),
    whenText: soldAgoDays === 0 ? "TODAY" : `${soldAgoDays}D AGO`,
  };
  writeProps(props.videoId, props);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
