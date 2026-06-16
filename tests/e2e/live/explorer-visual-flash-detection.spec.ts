import { test, expect } from "@playwright/test";

const PREVIEW_URL = "**/api/gotchis/preview";

test("Explorer: Detect visual flash where all gotchis converge to same color", async ({ page }) => {
  // Track what SVGs are being returned for each gotchi
  const svgResponses: Map<string, { tokenId: string; collateral: string; svg: string; timestamp: number }> = new Map();
  
  await page.route(PREVIEW_URL, async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    
    if (body) {
      const tokenId = String(body.tokenId || "");
      const collateral = String(body.collateral || "");
      const requestKey = `${tokenId}-${collateral}`;
      
      // Continue with actual request
      const response = await route.fetch();
      const json = await response.json();
      const svg = json.svg || "";
      
      // Store the response
      svgResponses.set(requestKey, {
        tokenId,
        collateral,
        svg,
        timestamp: Date.now(),
      });
      
      // Extract color from SVG for logging
      const colorMatch = svg.match(/fill="([^"]+)"/) || svg.match(/stroke="([^"]+)"/);
      const color = colorMatch ? colorMatch[1] : "unknown";
      
      console.log(`[Test] SVG response for ${tokenId}`, {
        collateral: collateral.substring(0, 20) + "...",
        color: color.substring(0, 30),
        svgLength: svg.length,
      });
      
      await route.fulfill({
        status: response.status(),
        contentType: response.headers()["content-type"] || "application/json",
        body: JSON.stringify(json),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto("/explorer");
  
  // Wait for gotchi cards to appear
  const cards = page.locator('[data-gotchi-id]');
  await expect(cards.first()).toBeVisible({ timeout: 20000 });
  
  // Wait a bit for initial render
  await page.waitForTimeout(2000);
  
  // Get first 10 gotchi cards
  const cardCount = await cards.count();
  const cardsToTest = Math.min(10, cardCount);
  
  console.log(`Testing ${cardsToTest} gotchi cards for color stability`);
  
  // Sample images over 8 seconds - this should catch the flash
  const samples: Array<{
    time: number;
    cards: Array<{
      gotchiId: string;
      screenshot: Buffer | null;
      isSkeleton: boolean;
    }>;
  }> = [];
  
  const timePoints = [0, 500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
  
  for (const timeMs of timePoints) {
    if (timeMs > 0) {
      const elapsed = timeMs - (samples.length > 0 ? samples[samples.length - 1].time : 0);
      await page.waitForTimeout(elapsed);
    }
    
    const cardData: Array<{ gotchiId: string; screenshot: Buffer | null; isSkeleton: boolean }> = [];
    
    for (let i = 0; i < cardsToTest; i++) {
      const card = cards.nth(i);
      const svgContainer = card.locator('[data-testid^="gotchi-svg"]').first();
      
      try {
        const gotchiId = await card.getAttribute("data-gotchi-id") || `card-${i}`;
        const isSkeleton = (await svgContainer.locator('[data-testid$="-skeleton"]').count()) > 0;
        
        let screenshot: Buffer | null = null;
        if (!isSkeleton) {
          // Take screenshot of the SVG container
          screenshot = await svgContainer.screenshot();
        }
        
        cardData.push({
          gotchiId,
          screenshot,
          isSkeleton,
        });
      } catch (err) {
        console.error(`Error sampling card ${i}:`, err);
        cardData.push({
          gotchiId: `card-${i}`,
          screenshot: null,
          isSkeleton: true,
        });
      }
    }
    
    samples.push({ time: timeMs, cards: cardData });
    
    // Log progress
    const nonSkeletonCount = cardData.filter(c => !c.isSkeleton).length;
    console.log(`Time ${timeMs}ms: ${nonSkeletonCount}/${cardsToTest} cards have SVGs`);
  }
  
  // ANALYSIS: Check for color convergence bug
  const finalSample = samples[samples.length - 1];
  const finalCards = finalSample.cards.filter(c => !c.isSkeleton && c.screenshot);
  
  if (finalCards.length < 2) {
    console.warn("Not enough cards with SVGs to test color convergence");
    return;
  }
  
  // Compare screenshots to detect if they're all the same
  const screenshotHashes: string[] = [];
  for (const card of finalCards) {
    if (card.screenshot) {
      // Simple hash: just use first 100 bytes as signature
      const hash = card.screenshot.subarray(0, 100).toString("base64").substring(0, 50);
      screenshotHashes.push(hash);
    }
  }
  
  const uniqueHashes = new Set(screenshotHashes);
  console.log(`Final state: ${finalCards.length} cards, ${uniqueHashes.size} unique image signatures`);
  
  // BUG DETECTION 1: All gotchis have identical images (convergence bug)
  if (uniqueHashes.size === 1 && finalCards.length > 1) {
    console.error("🚨 BUG DETECTED: All gotchis have identical images!");
    console.error("Screenshot hashes:", screenshotHashes);
    throw new Error(
      `Color convergence bug: All ${finalCards.length} gotchis have identical images. They should have different colors based on collateral.`
    );
  }
  
  // BUG DETECTION 2: Check if images changed over time (flash)
  const firstNonSkeletonSample = samples.find(s => s.cards.some(c => !c.isSkeleton && c.screenshot));
  if (firstNonSkeletonSample && finalSample) {
    for (let i = 0; i < cardsToTest; i++) {
      const firstCard = firstNonSkeletonSample.cards[i];
      const finalCard = finalSample.cards[i];
      
      if (firstCard && finalCard && 
          !firstCard.isSkeleton && !finalCard.isSkeleton &&
          firstCard.screenshot && finalCard.screenshot) {
        
        const firstHash = firstCard.screenshot.subarray(0, 100).toString("base64").substring(0, 50);
        const finalHash = finalCard.screenshot.subarray(0, 100).toString("base64").substring(0, 50);
        
        if (firstHash !== finalHash) {
          console.error(`🚨 BUG DETECTED: Gotchi ${firstCard.gotchiId} image changed over time!`);
          console.error(`First hash: ${firstHash}`);
          console.error(`Final hash: ${finalHash}`);
          throw new Error(
            `Visual flash detected: Gotchi ${firstCard.gotchiId} image changed from first render to final state`
          );
        }
      }
    }
  }
  
  // BUG DETECTION 3: Check if API returned same SVG for different collaterals
  const collateralsBySvg = new Map<string, string[]>();
  for (const [key, response] of svgResponses.entries()) {
    const svgHash = response.svg.substring(0, 200); // Use first 200 chars as signature
    if (!collateralsBySvg.has(svgHash)) {
      collateralsBySvg.set(svgHash, []);
    }
    collateralsBySvg.get(svgHash)!.push(response.collateral);
  }
  
  for (const [svgHash, collaterals] of collateralsBySvg.entries()) {
    if (collaterals.length > 1) {
      const uniqueCollaterals = new Set(collaterals);
      if (uniqueCollaterals.size > 1) {
        console.error(`🚨 BUG: Same SVG returned for ${uniqueCollaterals.size} different collaterals!`);
        console.error("Collaterals:", Array.from(uniqueCollaterals).map(c => c.substring(0, 20) + "..."));
        throw new Error(
          `API bug: Same SVG returned for ${uniqueCollaterals.size} different collaterals - this causes color convergence`
        );
      }
    }
  }
  
  console.log("✅ No visual flash or convergence bugs detected");
});
