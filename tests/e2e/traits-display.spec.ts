import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

const SUBGRAPH_URL = "**/subgraphs/aavegotchi-core-base/prod/gn";
const SVG_URL = "**/api/gotchis/svgs";
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

test("traits display base vs modified when modifiedNumericTraits present", async ({ page }) => {
  await page.route(SUBGRAPH_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    });
  });

  await page.route(SVG_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svgs: {} }),
    });
  });

  await page.goto(`/dress?view=${OWNER}`);

  const expectedBase = gotchi.numericTraits.slice(0, 4);
  const expectedModified = gotchi.modifiedNumericTraits.slice(0, 4);

  for (const [idx, label] of ["NRG", "AGG", "SPK", "BRN"].entries()) {
    const text = await page.getByTestId(`trait-value-${label}`).innerText();
    expect(text).toContain(`${expectedBase[idx]} (${expectedModified[idx]})`);
    expect(text).not.toContain(`${expectedBase[idx]} (${expectedBase[idx]})`);
  }

  const expectedBaseBrs = traitsToBRS(gotchi.numericTraits);
  const expectedTotal = traitsToBRS(gotchi.modifiedNumericTraits);
  await expect(page.getByTestId("rarity-score")).toHaveText(
    `Rarity Score ${expectedTotal} (${expectedBaseBrs})`
  );
});

