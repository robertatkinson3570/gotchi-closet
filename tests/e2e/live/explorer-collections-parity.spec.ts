import { test, expect } from "@playwright/test";

// Live parity: Portals tab lists BOTH closed (cat 0) and open (cat 2)
// portal listings with haunt/status detail; FAKE Gotchi cards carry the
// artwork name + artist from on-chain metadata.

const CORE = "https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn";

async function gql(query: string) {
  const res = await fetch(CORE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  return (await res.json()).data;
}

async function openTab(page: import("@playwright/test").Page, label: string) {
  await page.goto("/explorer");
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
}

test("portals tab shows closed + open portal listings with haunt badges", async ({ page }) => {
  const d = await gql(`{ erc721Listings(first: 1000, where: { category_in: [0, 2], cancelled: false, timePurchased: "0" }) { category } }`);
  const listings: { category: string }[] = d?.erc721Listings ?? [];
  test.skip(listings.length === 0, "no live portal listings");
  const openCount = listings.filter((l) => Number(l.category) === 2).length;

  await openTab(page, "Portals");
  const text = await page.locator("main").first().innerText();

  expect(text, `expected all ${listings.length} portal listings`).toContain(`${listings.length} of ${listings.length}`);
  expect(text).toContain("Closed Portal");
  if (openCount > 0) {
    expect(text, "open portal listings must be visible").toContain("Open Portal");
    expect(text, "open portals show their best summon option").toMatch(/Top rarity: \d+/);
  }
  expect(text, "haunt badges on portal cards").toMatch(/H[12]/);
});

test("FAKE Gotchi cards show artwork name and artist", async ({ page }) => {
  const d = await gql(`{ erc721Listings(first: 5, where: { category: 5, cancelled: false, timePurchased: "0" }, orderBy: timeCreated, orderDirection: desc) { tokenId } }`);
  const listings: { tokenId: string }[] = d?.erc721Listings ?? [];
  test.skip(listings.length === 0, "no live FAKE listings");

  const ids = listings.map((l) => `"${l.tokenId}"`).join(",");
  const meta = await gql(`{ fakeGotchiNFTTokens(first: 5, where: { identifier_in: [${ids}] }) { identifier name artistName } }`);
  const tokens: { identifier: string; name: string; artistName: string }[] = meta?.fakeGotchiNFTTokens ?? [];
  test.skip(tokens.length === 0, "no FAKE metadata resolvable");

  await openTab(page, "FAKE Gotchis");
  // Metadata arrives in a second query after the listings — wait for the
  // first known title to paint before snapshotting the grid.
  const first = tokens.find((t) => t.name);
  if (first) await expect(page.getByText(first.name).first()).toBeVisible({ timeout: 25000 });
  const text = await page.locator("main").first().innerText();

  for (const t of tokens.slice(0, 3)) {
    if (t.name) expect(text, `FAKE #${t.identifier} should show its title`).toContain(t.name);
    if (t.artistName) expect(text, `FAKE #${t.identifier} should credit the artist`).toContain(t.artistName);
  }
});
