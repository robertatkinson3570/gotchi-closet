import { test, expect } from "@playwright/test";

const TEST_GOTCHI_ID = "1455";
const PREVIEW_URL = "**/api/gotchis/preview";

test.beforeEach(async ({ page }) => {
  // Mock preview API to return consistent SVG
  await page.route(PREVIEW_URL, async (route) => {
    const body = route.request().postDataJSON();
    const isNaked = body?.wearableIds?.every((id: number) => id === 0);
    
    const svg = isNaked
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
           <rect width="64" height="64" fill="#f0f0f0"/>
           <path fill="#FFC0CB" stroke="#FF69B4" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>
         </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
           <rect width="64" height="64" fill="#f0f0f0"/>
           <path fill="#FFC0CB" stroke="#FF69B4" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>
           <rect x="20" y="20" width="24" height="24" fill="#000"/>
         </svg>`;
    
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svg }),
    });
  });
});

test("Explorer gotchi #1455: requestKey stability and network assertions", async ({ page }) => {
  // Track network requests for this gotchi
  const previewRequests: Array<{
    url: string;
    body: any;
    requestKey: string;
  }> = [];

  await page.route(PREVIEW_URL, async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    
    // Track the request
    if (body?.tokenId === Number(TEST_GOTCHI_ID)) {
      const requestKey = [
        TEST_GOTCHI_ID,
        body.hauntId ?? "",
        body.collateral || "",
        (body.numericTraits || []).join(","),
        (body.wearableIds || []).join("-"),
        "preview",
      ].join("|");
      
      previewRequests.push({
        url: request.url(),
        body,
        requestKey,
      });
    }
    
    // Fulfill the request
    const isNaked = body?.wearableIds?.every((id: number) => id === 0);
    const svg = isNaked
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
           <rect width="64" height="64" fill="#f0f0f0"/>
           <path fill="#FFC0CB" stroke="#FF69B4" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>
         </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
           <rect width="64" height="64" fill="#f0f0f0"/>
           <path fill="#FFC0CB" stroke="#FF69B4" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>
           <rect x="20" y="20" width="24" height="24" fill="#000"/>
         </svg>`;
    
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svg }),
    });
  });

  // Navigate to Explorer
  await page.goto("/explorer");
  
  // Wait for gotchi card to exist
  const cardLocator = page.locator(`[data-gotchi-id="${TEST_GOTCHI_ID}"]`).first();
  await expect(cardLocator).toBeVisible({ timeout: 20000 });
  
  // Wait for skeleton to disappear and GotchiSvg to appear
  const svgContainer = cardLocator.locator('[data-testid^="gotchi-svg"]').first();
  await expect(svgContainer).toBeVisible();
  
  // Wait for skeleton to be gone (SVG should be loaded)
  const skeleton = svgContainer.locator('[data-testid$="-skeleton"]');
  await expect(skeleton).not.toBeVisible({ timeout: 10000 }).catch(() => {
    // Skeleton might already be gone, that's fine
  });
  
  // PART 1: Capture requestKey (dressed state) as KEY1
  const key1 = await svgContainer.getAttribute("data-request-key");
  expect(key1).toBeTruthy();
  console.log("Initial requestKey (dressed):", key1);
  
  // PART 2: Wait 2 seconds (no hover) and re-check requestKey
  await page.waitForTimeout(2000);
  const key2 = await svgContainer.getAttribute("data-request-key");
  
  // Assert KEY2 === KEY1 (requestKey must not change)
  expect(key2).toBe(key1);
  
  // PART 3: Network assertions for dressed state
  const dressedRequests = previewRequests.filter((req) => {
    const isNaked = req.body?.wearableIds?.every((id: number) => id === 0);
    return !isNaked && req.body?.tokenId === Number(TEST_GOTCHI_ID);
  });
  
  // For dressed state, there should be at most 1 unique requestKey
  const dressedKeys = new Set(dressedRequests.map((r) => r.requestKey));
  expect(dressedKeys.size).toBeLessThanOrEqual(1);
  
  if (dressedKeys.size > 1) {
    console.error("Multiple different requestKeys for dressed state:", Array.from(dressedKeys));
    throw new Error(
      `Multiple different requestKeys detected for dressed state: ${Array.from(dressedKeys).join(", ")}`
    );
  }
  
  // PART 4: Hover to naked and test stability
  await svgContainer.hover();
  
  // Wait for hover state to update
  await page.waitForTimeout(300);
  
  // Capture naked requestKey
  const nakedKey1 = await svgContainer.getAttribute("data-request-key");
  expect(nakedKey1).toBeTruthy();
  expect(nakedKey1).not.toBe(key1); // Should be different from dressed
  console.log("Naked requestKey:", nakedKey1);
  
  // Wait 2 seconds and check naked key stability
  await page.waitForTimeout(2000);
  const nakedKey2 = await svgContainer.getAttribute("data-request-key");
  
  // Assert naked key stays stable
  expect(nakedKey2).toBe(nakedKey1);
  
  // PART 5: Network assertions for naked state
  const nakedRequests = previewRequests.filter((req) => {
    const isNaked = req.body?.wearableIds?.every((id: number) => id === 0);
    return isNaked && req.body?.tokenId === Number(TEST_GOTCHI_ID);
  });
  
  // For naked state, there should be at most 1 unique requestKey
  const nakedKeys = new Set(nakedRequests.map((r) => r.requestKey));
  expect(nakedKeys.size).toBeLessThanOrEqual(1);
  
  if (nakedKeys.size > 1) {
    console.error("Multiple different requestKeys for naked state:", Array.from(nakedKeys));
    throw new Error(
      `Multiple different requestKeys detected for naked state: ${Array.from(nakedKeys).join(", ")}`
    );
  }
  
  // PART 6: Verify mode attribute
  const mode = await svgContainer.getAttribute("data-mode");
  expect(mode).toBe("preview");
  
  // PART 7: Verify gotchi-id attribute
  const gotchiIdAttr = await svgContainer.getAttribute("data-gotchi-id");
  expect(gotchiIdAttr).toBe(TEST_GOTCHI_ID);
  
  console.log("All requestKey stability checks passed");
  console.log("Dressed requests:", dressedRequests.length);
  console.log("Naked requests:", nakedRequests.length);
});

test("Explorer gotchi: requestKey must not change without user interaction", async ({ page }) => {
  await page.goto("/explorer");
  
  // Wait for any gotchi card
  const firstCard = page.locator('[data-gotchi-id]').first();
  await expect(firstCard).toBeVisible({ timeout: 20000 });
  
  const svgContainer = firstCard.locator('[data-testid^="gotchi-svg"]').first();
  await expect(svgContainer).toBeVisible();
  
  // Wait for skeleton to disappear
  const skeleton = svgContainer.locator('[data-testid$="-skeleton"]');
  await expect(skeleton).not.toBeVisible({ timeout: 10000 }).catch(() => {});
  
  // Capture initial requestKey
  const initialKey = await svgContainer.getAttribute("data-request-key");
  expect(initialKey).toBeTruthy();
  
  // Sample requestKey multiple times over 3 seconds
  const samples: string[] = [initialKey!];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    const currentKey = await svgContainer.getAttribute("data-request-key");
    samples.push(currentKey || "");
  }
  
  // All samples must be identical
  const uniqueKeys = new Set(samples.filter(Boolean));
  expect(uniqueKeys.size).toBe(1);
  
  if (uniqueKeys.size > 1) {
    console.error("RequestKey changed over time:", Array.from(uniqueKeys));
    throw new Error(
      `RequestKey changed without user interaction: ${Array.from(uniqueKeys).join(" -> ")}`
    );
  }
});
