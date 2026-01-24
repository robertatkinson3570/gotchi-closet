import { test, expect } from "@playwright/test";

const CONNECTED_ADDRESS = "0x1111111111111111111111111111111111111111";
const MANUAL_ADDRESS = "0x2222222222222222222222222222222222222222";
const SUBGRAPH_URL = "**/subgraphs/aavegotchi-core-base/prod/gn";

function normalize(address: string) {
  return address.toLowerCase();
}

test("editor shows both manual and connected gotchis without toggling", async ({ page }) => {
  const requestedOwners: string[] = [];

  await page.addInitScript(({ connectedAddress }) => {
    const listeners: Record<string, Array<(args?: any) => void>> = {};
    const emit = (event: string, payload?: any) => {
      (listeners[event] || []).forEach((handler) => handler(payload));
    };

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
      _emit: emit,
    };
  }, { connectedAddress: CONNECTED_ADDRESS });

  await page.route(SUBGRAPH_URL, async (route) => {
    const body = route.request().postDataJSON() as any;
    const owner = body?.variables?.owner?.toLowerCase?.();
    if (owner) {
      requestedOwners.push(owner);
    }

    const gotchisOwned =
      owner === normalize(CONNECTED_ADDRESS)
        ? [
            {
              id: "1",
              name: "ConnectedGotchi",
              level: "1",
              numericTraits: [50, 50, 50, 50, 50, 50],
              modifiedNumericTraits: [50, 50, 50, 50, 50, 50],
              equippedWearables: [0, 0, 0, 0, 0, 0, 0, 0],
              baseRarityScore: "306",
              hauntId: "1",
              collateral: "0x0000000000000000000000000000000000000000",
            },
          ]
        : owner === normalize(MANUAL_ADDRESS)
        ? [
            {
              id: "2",
              name: "ManualGotchi",
              level: "1",
              numericTraits: [55, 55, 55, 55, 50, 50],
              modifiedNumericTraits: [55, 55, 55, 55, 50, 50],
              equippedWearables: [0, 0, 0, 0, 0, 0, 0, 0],
              baseRarityScore: "326",
              hauntId: "1",
              collateral: "0x0000000000000000000000000000000000000000",
            },
          ]
        : [];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user: {
            id: owner || "",
            gotchisOwned,
          },
        },
      }),
    });
  });

  await page.goto(`/dress?view=${MANUAL_ADDRESS}`);

  const connectButton = page.getByRole("button", { name: "Connect Wallet" });
  if (await connectButton.count()) {
    await connectButton.click();
    await page
      .getByRole("button", { name: "Injected Wallet (MetaMask/Rabby)" })
      .click();
  }

  await expect(page.getByTestId("gotchi-list-owner")).toHaveText("both");
  await expect(page.getByTestId("gotchi-list")).toContainText("ConnectedGotchi");
  await expect(page.getByTestId("gotchi-list")).toContainText("ManualGotchi");

  await page.getByRole("button", { name: "Use Connected" }).click();
  await expect(page.getByTestId("gotchi-list-owner")).toHaveText(
    normalize(CONNECTED_ADDRESS)
  );
  await expect(page.getByTestId("gotchi-list")).toContainText("ConnectedGotchi");
  await expect(page.getByTestId("gotchi-list")).not.toContainText("ManualGotchi");

  await page.goto(`/dress?view=${MANUAL_ADDRESS}`);
  await expect(page.getByTestId("gotchi-list-owner")).toHaveText("both");
  await page.getByRole("button", { name: "Clear Manual" }).click();
  await expect(page.getByTestId("gotchi-list-owner")).toHaveText(
    normalize(CONNECTED_ADDRESS)
  );

  await page.waitForTimeout(1200);
  await expect(page.getByTestId("gotchi-list")).toContainText("ConnectedGotchi");
  await expect(page.getByTestId("gotchi-list")).not.toContainText("ManualGotchi");

  expect(requestedOwners).toContain(normalize(CONNECTED_ADDRESS));
  expect(requestedOwners).toContain(normalize(MANUAL_ADDRESS));
});

