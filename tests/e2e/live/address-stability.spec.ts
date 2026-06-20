import { test, expect } from "@playwright/test";

// CURRENT APP NOTES
// - HomePage (/) is a wallet picker. You add manual wallet(s) via the 0x input +
//   the (+) button (persisted to localStorage["gc_multiWallet"]) and/or connect a
//   wallet, then click "Dress Gotchis" which navigates to /dress (NO ?view param).
// - On /dress the editor fetches gotchis for BOTH the connected wallet and the
//   manual wallets at once and shows them together. The owner marker
//   `gotchi-list-owner` is the pipe-joined ownersKey `connected|manual` (NOT the
//   old literal "both").
// - `query GotchisByOwner` hits the CORE subgraph; owner is lowercased in
//   variables.owner. Art is server-rendered via /api/gotchis/preview.

const CONNECTED_ADDRESS = "0x1111111111111111111111111111111111111111";
const MANUAL_ADDRESS = "0x2222222222222222222222222222222222222222";
const SUBGRAPH_URL = "**/subgraphs/aavegotchi-core-base/prod/gn";

function normalize(address: string) {
  return address.toLowerCase();
}

function gotchi(id: string, name: string, traits: number[], brs: string) {
  return {
    id,
    name,
    level: "1",
    numericTraits: traits,
    modifiedNumericTraits: traits,
    withSetsNumericTraits: traits,
    equippedWearables: [0, 0, 0, 0, 0, 0, 0, 0],
    baseRarityScore: brs,
    hauntId: "1",
    collateral: "0x0000000000000000000000000000000000000000",
    createdAt: "1",
  };
}

test("home routes to editor with manual + connected wallets, both load together", async ({
  page,
}) => {
  const requestedOwners: string[] = [];

  // Injected wallet on Base (chainId 0x2105 = 8453) so useAddressState treats the
  // connected wallet as an owner.
  await page.addInitScript(({ connectedAddress }) => {
    const listeners: Record<string, Array<(args?: any) => void>> = {};
    (window as any).ethereum = {
      isMetaMask: true,
      request: async ({ method, params }: { method: string; params?: any[] }) => {
        switch (method) {
          case "eth_chainId":
            return "0x2105";
          case "eth_accounts":
          case "eth_requestAccounts":
            return [connectedAddress];
          case "wallet_switchEthereumChain":
            if (params && params[0]?.chainId === "0x2105") return null;
            throw new Error("Unsupported chain");
          default:
            return null;
        }
      },
      on: (event: string, handler: (args?: any) => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(handler);
      },
      removeListener: (event: string, handler: (args?: any) => void) => {
        listeners[event] = (listeners[event] || []).filter((h) => h !== handler);
      },
    };
  }, { connectedAddress: CONNECTED_ADDRESS });

  await page.route(SUBGRAPH_URL, async (route) => {
    const body = route.request().postDataJSON() as any;
    const query: string = body?.query || "";

    if (query.includes("itemTypes")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { itemTypes: [] } }),
      });
      return;
    }
    if (query.includes("erc721Listings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { erc721Listings: [] } }),
      });
      return;
    }

    const owner = body?.variables?.owner?.toLowerCase?.();
    if (owner) requestedOwners.push(owner);

    const gotchisOwned =
      owner === normalize(CONNECTED_ADDRESS)
        ? [gotchi("1", "ConnectedGotchi", [50, 50, 50, 50, 50, 50], "306")]
        : owner === normalize(MANUAL_ADDRESS)
        ? [
            gotchi("2", "ManualGotchi", [55, 55, 55, 55, 50, 50], "326"),
            gotchi("3", "ManualGotchi2", [40, 40, 40, 40, 50, 50], "346"),
          ]
        : [];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user: { id: owner || "", gotchisOwned, gotchisLentOut: [] },
          _meta: { block: { number: 1 } },
        },
      }),
    });
  });

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

  await page.goto("/");

  // Connect the injected wallet.
  await page.getByRole("button", { name: "Connect Wallet" }).first().click();
  await page
    .getByRole("button", { name: "Injected Wallet (MetaMask/Rabby)" })
    .click();

  // Add the manual wallet (persists to gc_multiWallet) and go to the editor.
  await page.getByTestId("home-manual-input").fill(MANUAL_ADDRESS);
  await page.getByTestId("home-manual-input").press("Enter");

  await expect(page.getByTestId("home-dress-btn")).toBeEnabled();
  await page.getByTestId("home-dress-btn").click();

  // The editor route is /dress (no ?view query param anymore).
  await expect(page).toHaveURL(/\/dress$/);

  // Owner marker is the pipe-joined ownersKey: connected|manual.
  await expect(page.getByTestId("gotchi-list-owner")).toHaveText(
    `${normalize(CONNECTED_ADDRESS)}|${normalize(MANUAL_ADDRESS)}`,
    { timeout: 20000 }
  );

  // Both wallets' gotchis are loaded together — address stability across owners.
  await expect(page.getByTestId("gotchi-list")).toContainText("ConnectedGotchi");
  await expect(page.getByTestId("gotchi-list")).toContainText("ManualGotchi");

  expect(requestedOwners).toContain(normalize(CONNECTED_ADDRESS));
  expect(requestedOwners).toContain(normalize(MANUAL_ADDRESS));
});
