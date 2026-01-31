import { test, expect } from "@playwright/test";
import crypto from "crypto";

const TEST_GOTCHI_ID = "1455";
const PREVIEW_URL = "**/api/gotchis/preview";

// Helper to hash image data for comparison
function hashImageData(data: Buffer): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

// Helper to sample pixels from screenshot
async function sampleImageHash(
  page: any,
  locator: any
): Promise<string | null> {
  try {
    const screenshot = await locator.screenshot();
    if (!screenshot) return null;
    return hashImageData(screenshot);
  } catch {
    return null;
  }
}

test.beforeEach(async ({ page }) => {
  // Mock preview API to return consistent SVG with pink outline
  await page.route(PREVIEW_URL, async (route) => {
    const body = route.request().postDataJSON();
    const isNaked = body?.wearableIds?.every((id: number) => id === 0);
    
    // Return SVG with pink outline for naked (UNI collateral)
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

test("Explorer gotchi: no visual flash after first paint", async ({ page }) => {
  await page.goto("/explorer");
  
  // Wait for gotchi card to exist (but don't wait for it to be "stable")
  const cardLocator = page.locator(`[data-gotchi-id="${TEST_GOTCHI_ID}"]`).first();
  await expect(cardLocator).toBeVisible({ timeout: 20000 });
  
  // Get the SVG container
  const svgContainer = cardLocator.locator('[data-testid^="gotchi-svg"]').first();
  await expect(svgContainer).toBeVisible();
  
  // PART A: Start sampling immediately - no "wait for stable"
  const samples: Array<{ time: number; hash: string | null; isSkeleton: boolean }> = [];
  const timePoints = [0, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000];
  
  for (const timeMs of timePoints) {
    if (timeMs > 0) {
      const prevTime = samples.length > 0 ? samples[samples.length - 1].time : 0;
      await page.waitForTimeout(timeMs - prevTime);
    }
    
    // Check if skeleton is visible
    const skeletonVisible = await svgContainer
      .locator('[data-testid$="-skeleton"]')
      .isVisible()
      .catch(() => false);
    
    // Sample image hash
    const hash = await sampleImageHash(page, svgContainer);
    
    samples.push({
      time: timeMs,
      hash,
      isSkeleton: skeletonVisible,
    });
  }
  
  // PART B: Find when real SVG appears (not skeleton)
  const skeletonSamples = samples.filter((s) => s.isSkeleton);
  const realSvgSamples = samples.filter((s) => !s.isSkeleton && s.hash !== null);
  
  // If we have real SVG samples, they must all have the same hash
  if (realSvgSamples.length > 1) {
    const firstRealHash = realSvgSamples[0].hash;
    for (let i = 1; i < realSvgSamples.length; i++) {
      const currentHash = realSvgSamples[i].hash;
      if (currentHash !== firstRealHash) {
        console.error("Color flash detected!");
        console.error("Samples:", samples);
        console.error(`Hash changed from ${firstRealHash} to ${currentHash} at ${realSvgSamples[i].time}ms`);
        throw new Error(
          `Visual flash detected: SVG hash changed from ${firstRealHash?.substring(0, 8)} to ${currentHash?.substring(0, 8)} at ${realSvgSamples[i].time}ms`
        );
      }
    }
  }
  
  // PART C: Verify only one SVG in DOM
  const svgCount = await svgContainer.locator("svg").count();
  expect(svgCount).toBeLessThanOrEqual(1);
  
  // Verify no hidden layers
  const allSvgContainers = await cardLocator.locator('[data-testid^="gotchi-svg"]').count();
  expect(allSvgContainers).toBe(1);
});

test("Explorer gotchi: DOM correctness - single SVG, no hidden layers", async ({ page }) => {
  await page.goto("/explorer");
  
  // Wait for any gotchi card
  const firstCard = page.locator('[data-gotchi-id]').first();
  await expect(firstCard).toBeVisible({ timeout: 20000 });
  
  // Count all GotchiSvg instances in the card
  const svgContainers = firstCard.locator('[data-testid^="gotchi-svg"]');
  const count = await svgContainers.count();
  
  // Should be exactly 1
  expect(count).toBe(1);
  
  // Verify no opacity-0 hidden layers
  const hiddenLayers = await firstCard.locator('[data-testid^="gotchi-svg"]').evaluateAll((elements) => {
    return elements.filter((el) => {
      const style = window.getComputedStyle(el);
      return style.opacity === "0" || style.display === "none";
    }).length;
  });
  
  expect(hiddenLayers).toBe(0);
  
  // Verify only one SVG element when loaded
  const svgElement = firstCard.locator('[data-testid^="gotchi-svg"] svg');
  const svgCount = await svgElement.count();
  expect(svgCount).toBeLessThanOrEqual(1);
});
