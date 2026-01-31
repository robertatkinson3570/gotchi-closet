import { test, expect } from "@playwright/test";

const PREVIEW_URL = "**/api/gotchis/preview";

// Helper to extract color from SVG element
async function getSvgOutlineColor(page: any, svgLocator: any): Promise<string | null> {
  try {
    // Get the SVG element and find the outline path
    const color = await svgLocator.evaluate((el: Element) => {
      const svg = el.querySelector("svg");
      if (!svg) return null;
      
      // Find the first path element (usually the outline)
      const path = svg.querySelector("path");
      if (!path) return null;
      
      // Get computed fill or stroke color
      const style = window.getComputedStyle(path);
      const fill = style.fill || path.getAttribute("fill");
      const stroke = style.stroke || path.getAttribute("stroke");
      
      return fill || stroke || null;
    });
    
    return color;
  } catch {
    return null;
  }
}

// Helper to get screenshot and analyze colors
async function sampleCardColors(page: any, cardLocator: any, svgLocator: any): Promise<{
  color: string | null;
  screenshotHash: string | null;
}> {
  try {
    const color = await getSvgOutlineColor(page, svgLocator);
    const screenshot = await svgLocator.screenshot();
    const hash = screenshot ? Buffer.from(screenshot).toString("base64").substring(0, 50) : null;
    return { color, screenshotHash: hash };
  } catch {
    return { color: null, screenshotHash: null };
  }
}

test("Explorer: Detect gotchi color flashing and convergence bug", async ({ page }) => {
  // Track all preview requests to see what's being fetched
  const previewRequests: Array<{
    tokenId: number;
    collateral: string;
    numericTraits: number[];
    timestamp: number;
  }> = [];

  await page.route(PREVIEW_URL, async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    
    if (body) {
      previewRequests.push({
        tokenId: body.tokenId,
        collateral: body.collateral || "",
        numericTraits: body.numericTraits || [],
        timestamp: Date.now(),
      });
    }
    
    // Return SVG with color based on collateral (spirit force)
    const collateral = body?.collateral || "";
    let outlineColor = "#FFC0CB"; // default pink
    
    // Different collaterals have different colors
    if (collateral.toLowerCase().includes("0x0000000000000000000000000000000000000000")) {
      // UNI - pink
      outlineColor = "#FFC0CB";
    } else if (collateral.toLowerCase().includes("btc") || collateral.toLowerCase().includes("0x")) {
      // BTC - orange (check first few chars)
      const firstChars = collateral.substring(0, 10).toLowerCase();
      if (firstChars.includes("btc") || collateral.length > 40) {
        outlineColor = "#FFA500"; // Orange for BTC
      }
    }
    
    const isNaked = body?.wearableIds?.every((id: number) => id === 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="#f0f0f0"/>
      <path fill="${outlineColor}" stroke="${outlineColor}" stroke-width="2" d="M32,10 C20,10 10,20 10,32 C10,44 20,54 32,54 C44,54 54,44 54,32 C54,20 44,10 32,10 Z"/>
      ${!isNaked ? '<rect x="20" y="20" width="24" height="24" fill="#000"/>' : ''}
    </svg>`;
    
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ svg }),
    });
  });

  await page.goto("/explorer");
  
  // Wait for gotchi cards to appear
  const cards = page.locator('[data-gotchi-id]');
  await expect(cards.first()).toBeVisible({ timeout: 20000 });
  
  // Wait a bit for initial render
  await page.waitForTimeout(1000);
  
  // Get first 5 gotchi cards
  const cardCount = await cards.count();
  const cardsToTest = Math.min(5, cardCount);
  
  console.log(`Testing ${cardsToTest} gotchi cards for color stability`);
  
  // Sample colors over 10 seconds
  const samples: Array<{
    time: number;
    cards: Array<{ gotchiId: string; color: string | null; hash: string | null }>;
  }> = [];
  
  const timePoints = [0, 500, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
  
  for (const timeMs of timePoints) {
    if (timeMs > 0) {
      await page.waitForTimeout(timeMs - (samples.length > 0 ? samples[samples.length - 1].time : 0));
    }
    
    const cardData: Array<{ gotchiId: string; color: string | null; hash: string | null }> = [];
    
    for (let i = 0; i < cardsToTest; i++) {
      const card = cards.nth(i);
      const svgContainer = card.locator('[data-testid^="gotchi-svg"]').first();
      
      const gotchiId = await card.getAttribute("data-gotchi-id") || `card-${i}`;
      const sample = await sampleCardColors(page, card, svgContainer);
      
      cardData.push({
        gotchiId,
        color: sample.color,
        hash: sample.screenshotHash,
      });
    }
    
    samples.push({ time: timeMs, cards: cardData });
    
    // Log colors at each time point
    const colors = cardData.map(c => c.color).filter(Boolean);
    if (colors.length > 0) {
      console.log(`Time ${timeMs}ms: Colors:`, colors);
    }
  }
  
  // ANALYSIS: Check for color convergence bug
  const finalSample = samples[samples.length - 1];
  const finalColors = finalSample.cards.map(c => c.color).filter(Boolean);
  const uniqueFinalColors = new Set(finalColors);
  
  console.log("Final colors:", Array.from(uniqueFinalColors));
  console.log("Preview requests:", previewRequests.length);
  console.log("Unique collaterals requested:", new Set(previewRequests.map(r => r.collateral)).size);
  
  // BUG DETECTION 1: All gotchis have the same color (convergence bug)
  if (uniqueFinalColors.size === 1 && finalColors.length > 1) {
    console.error("🚨 BUG DETECTED: All gotchis converged to same color:", Array.from(uniqueFinalColors)[0]);
    throw new Error(
      `Color convergence bug: All ${finalColors.length} gotchis have the same outline color ${Array.from(uniqueFinalColors)[0]}. They should have different colors based on collateral.`
    );
  }
  
  // BUG DETECTION 2: Colors changed over time (flashing)
  const firstSample = samples.find(s => s.cards.some(c => c.color !== null));
  if (firstSample && finalSample) {
    for (let i = 0; i < cardsToTest; i++) {
      const firstColor = firstSample.cards[i]?.color;
      const finalColor = finalSample.cards[i]?.color;
      
      if (firstColor && finalColor && firstColor !== finalColor) {
        console.error(`🚨 BUG DETECTED: Gotchi ${firstSample.cards[i]?.gotchiId} color changed from ${firstColor} to ${finalColor}`);
        throw new Error(
          `Color flash detected: Gotchi ${firstSample.cards[i]?.gotchiId} color changed from ${firstColor} to ${finalColor} over time`
        );
      }
    }
  }
  
  // BUG DETECTION 3: Multiple requests for same gotchi with different data
  const requestsByTokenId = new Map<number, Array<typeof previewRequests[0]>>();
  previewRequests.forEach(req => {
    if (!requestsByTokenId.has(req.tokenId)) {
      requestsByTokenId.set(req.tokenId, []);
    }
    requestsByTokenId.get(req.tokenId)!.push(req);
  });
  
  for (const [tokenId, requests] of requestsByTokenId.entries()) {
    if (requests.length > 1) {
      // Check if requests have different collaterals or traits
      const uniqueCollaterals = new Set(requests.map(r => r.collateral));
      const uniqueTraits = new Set(requests.map(r => r.numericTraits.join(",")));
      
      if (uniqueCollaterals.size > 1) {
        console.error(`🚨 BUG: Gotchi ${tokenId} requested with ${uniqueCollaterals.size} different collaterals:`, Array.from(uniqueCollaterals));
        throw new Error(`Gotchi ${tokenId} fetched with multiple different collaterals - data instability bug`);
      }
      
      if (uniqueTraits.size > 1) {
        console.error(`🚨 BUG: Gotchi ${tokenId} requested with ${uniqueTraits.size} different trait sets`);
        throw new Error(`Gotchi ${tokenId} fetched with multiple different trait sets - data instability bug`);
      }
    }
  }
  
  console.log("✅ No color flashing or convergence bugs detected");
});
