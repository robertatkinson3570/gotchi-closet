import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

// CURRENT APP NOTES
// - The editor lives at /dress. `?view=<addr>` is no longer parsed; owners come
//   from the connected wallet and from localStorage["gc_multiWallet"]. We seed a
//   manual wallet via addInitScript and navigate to /dress.
// - Owned gotchis are fetched with urql `query GotchisByOwner` against the CORE
//   subgraph (env.gotchiSubgraphUrl, default goldsky aavegotchi-core-base/prod/gn,
//   matched by **/subgraphs/aavegotchi-core-base/prod/gn). Response shape:
//   { data: { user: { id, gotchisOwned: [...] }, _meta } }.
// - Card art is server-rendered: POST /api/gotchis/preview -> { svg }.
// - The trait rows live in GotchiCard: trait-value-<LABEL> shows "base (modified)"
//   (the parenthesised modified value only renders when modified !== base). The
//   BrsSummary line is `Rarity Score <totalBrs> (<traitBase>)`.

const SUBGRAPH_URL = "**/subgraphs/aavegotchi-core-base/prod/gn";
const OWNER = "0x0000000000000000000000000000000000000000";

const fixturePath = join(
  process.cwd(),
  "tests",
  "fixtures",
  "gotchi_modified_traits_case.json"
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const gotchi = fixture.data.user.gotchisOwned[0];

function traitToBRS(value: number) {
  return value < 50 ? 100 - value : value + 1;
}

function traitsToBRS(traits: number[]) {
  return traits.reduce((sum, t) => sum + traitToBRS(t), 0);
}

test("traits display base vs modified when modifiedNumericTraits present", async ({
  page,
}) => {
  // Seed the manual wallet so DressPage fetches this owner's gotchis.
  await page.addInitScript((owner) => {
    localStorage.setItem("gc_multiWallet", JSON.stringify({ wallets: [owner] }));
  }, OWNER);

  await page.route(SUBGRAPH_URL, async (route) => {
    const body = route.request().postDataJSON() as any;
    const query: string = body?.query || "";

    // Wearables catalogue (paginated `query Wearables` -> itemTypes). Return empty
    // so the editor still renders; the fixture gotchi has no equipped wearables.
    if (query.includes("itemTypes")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { itemTypes: [] } }),
      });
      return;
    }

    // Baazaar listing lookups (owner / token-id price badges).
    if (query.includes("erc721Listings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { erc721Listings: [] } }),
      });
      return;
    }

    // GotchisByOwner -> the modified-traits fixture.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    });
  });

  // Server-rendered art.
  await page.route("**/api/gotchis/preview", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svg: "<svg xmlns='http://www.w3.org/2000/svg'/>" }),
    })
  );
  await page.route("**/api/gotchis/*/svg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svg: "<svg xmlns='http://www.w3.org/2000/svg'/>" }),
    })
  );
  await page.route("**/api/wearables/thumbs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ thumbs: {} }),
    })
  );
  await page.route("**/api/soul/seals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ configured: false, sealed: {} }),
    })
  );

  await page.goto("/dress");

  // The carousel must show the fixture gotchi's card.
  await expect(page.getByTestId("gotchi-card").first()).toBeVisible({
    timeout: 20000,
  });

  const expectedBase = gotchi.numericTraits.slice(0, 4);
  const expectedModified = gotchi.modifiedNumericTraits.slice(0, 4);

  for (const [idx, label] of ["NRG", "AGG", "SPK", "BRN"].entries()) {
    const valueCell = page.getByTestId(`trait-value-${label}`).first();
    const text = await valueCell.innerText();
    // Base shown plain, modified shown in parens (because it differs from base).
    expect(text).toContain(`${expectedBase[idx]} (${expectedModified[idx]})`);
    expect(text).not.toContain(`${expectedBase[idx]} (${expectedBase[idx]})`);
  }

  // BRS line: totalBrs (= BRS of modified traits, no wearables) and the base trait
  // BRS in parens. baseRarityScore is null in the fixture, so traitBase is computed.
  const expectedBaseBrs = traitsToBRS(gotchi.numericTraits);
  const expectedTotal = traitsToBRS(gotchi.modifiedNumericTraits);
  await expect(page.getByTestId("rarity-score").first()).toHaveText(
    `Rarity Score ${expectedTotal} (${expectedBaseBrs})`
  );
});
