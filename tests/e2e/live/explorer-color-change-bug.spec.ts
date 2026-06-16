import { test, expect } from "@playwright/test";

test("Explorer: Detect why all cards change color when fetching next gotchi", async ({ page }) => {
  const PREVIEW_URL = "**/api/gotchis/preview";
  
  // Track all SVG requests and responses
  const svgRequests: Map<string, {
    tokenId: string;
    collateral: string;
    requestKey: string;
    timestamp: number;
    responseSvg: string;
  }> = new Map();
  
  // Track requestKeys in the DOM over time
  const domRequestKeys: Map<string, Array<{ time: number; requestKey: string; gotchiId: string }>> = new Map();
  
  await page.route(PREVIEW_URL, async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    
    if (body) {
      const tokenId = String(body.tokenId || "");
      const collateral = String(body.collateral || "");
      const requestKey = `${tokenId}|${body.hauntId}|${collateral}|${(body.numericTraits || []).join(",")}|${(body.wearableIds || []).join("-")}|preview`;
      
      // Continue with actual request
      const response = await route.fetch();
      const json = await response.json();
      const svg = json.svg || "";
      
      svgRequests.set(requestKey, {
        tokenId,
        collateral,
        requestKey,
        timestamp: Date.now(),
        responseSvg: svg,
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
  
  // Wait for initial render
  await page.waitForTimeout(1000);
  
  // Get first 10 gotchi cards
  const cardCount = await cards.count();
  const cardsToTest = Math.min(10, cardCount);
  
  console.log(`Monitoring ${cardsToTest} gotchi cards for color stability`);
  
  // Sample DOM requestKeys and take screenshots over 5 seconds
  const samples: Array<{
    time: number;
    cards: Array<{
      gotchiId: string;
      requestKey: string | null;
      screenshot: Buffer | null;
    }>;
  }> = [];
  
  const timePoints = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000];
  
  for (const timeMs of timePoints) {
    if (timeMs > 0) {
      const elapsed = timeMs - (samples.length > 0 ? samples[samples.length - 1].time : 0);
      await page.waitForTimeout(elapsed);
    }
    
    const cardData: Array<{ gotchiId: string; requestKey: string | null; screenshot: Buffer | null }> = [];
    
    for (let i = 0; i < cardsToTest; i++) {
      const card = cards.nth(i);
      
      try {
        const gotchiId = await card.getAttribute("data-gotchi-id") || `card-${i}`;
        
        // Try to find the SVG container - it might be nested
        const svgContainer = card.locator('[data-testid*="gotchi-svg"]').first();
        const isVisible = await svgContainer.isVisible().catch(() => false);
        
        let requestKey: string | null = null;
        let screenshot: Buffer | null = null;
        
        if (isVisible) {
          try {
            requestKey = await svgContainer.getAttribute("data-request-key");
          } catch {
            // Attribute might not exist yet
          }
          
          try {
            screenshot = await svgContainer.screenshot({ timeout: 1000 });
          } catch {
            // Screenshot failed, continue
          }
        }
        
        cardData.push({
          gotchiId,
          requestKey,
          screenshot,
        });
        
        // Track requestKey changes over time
        if (!domRequestKeys.has(gotchiId)) {
          domRequestKeys.set(gotchiId, []);
        }
        domRequestKeys.get(gotchiId)!.push({ time: timeMs, requestKey: requestKey || "", gotchiId });
      } catch (err) {
        // Card might not be ready yet
        cardData.push({
          gotchiId: `card-${i}`,
          requestKey: null,
          screenshot: null,
        });
      }
    }
    
    samples.push({ time: timeMs, cards: cardData });
    
    // Log progress
    const cardsWithRequestKey = cardData.filter(c => c.requestKey).length;
    console.log(`Time ${timeMs}ms: ${cardsWithRequestKey}/${cardsToTest} cards have requestKeys`);
  }
  
  // ANALYSIS: Check for requestKey changes and color changes
  console.log("\n=== ANALYSIS ===");
  
  // 1. Check if requestKeys are changing over time (should be stable)
  for (const [gotchiId, keyHistory] of domRequestKeys.entries()) {
    const uniqueKeys = new Set(keyHistory.map(k => k.requestKey).filter(Boolean));
    if (uniqueKeys.size > 1) {
      console.error(`🚨 Gotchi ${gotchiId} has ${uniqueKeys.size} different requestKeys!`, {
        keys: Array.from(uniqueKeys),
        history: keyHistory,
      });
    }
  }
  
  // 2. Check if multiple gotchis share the same requestKey (cache collision)
  const requestKeyToGotchis = new Map<string, string[]>();
  for (const [gotchiId, keyHistory] of domRequestKeys.entries()) {
    const finalKey = keyHistory[keyHistory.length - 1]?.requestKey;
    if (finalKey) {
      if (!requestKeyToGotchis.has(finalKey)) {
        requestKeyToGotchis.set(finalKey, []);
      }
      requestKeyToGotchis.get(finalKey)!.push(gotchiId);
    }
  }
  
  for (const [requestKey, gotchiIds] of requestKeyToGotchis.entries()) {
    if (gotchiIds.length > 1) {
      console.error(`🚨 CACHE COLLISION: ${gotchiIds.length} gotchis share the same requestKey!`, {
        requestKey: requestKey.substring(0, 100) + "...",
        gotchiIds,
      });
    }
  }
  
  // 3. Check if SVGs are changing over time (compare screenshots)
  const firstSample = samples[0];
  const finalSample = samples[samples.length - 1];
  
  for (let i = 0; i < cardsToTest; i++) {
    const firstCard = firstSample.cards[i];
    const finalCard = finalSample.cards[i];
    
    if (firstCard && finalCard && 
        firstCard.screenshot && finalCard.screenshot &&
        firstCard.gotchiId === finalCard.gotchiId) {
      
      // Compare screenshots
      const firstHash = firstCard.screenshot.subarray(0, 100).toString("base64").substring(0, 50);
      const finalHash = finalCard.screenshot.subarray(0, 100).toString("base64").substring(0, 50);
      
      if (firstHash !== finalHash) {
        console.error(`🚨 Gotchi ${firstCard.gotchiId} image changed over time!`, {
          firstRequestKey: firstCard.requestKey?.substring(0, 80) + "...",
          finalRequestKey: finalCard.requestKey?.substring(0, 80) + "...",
          requestKeyChanged: firstCard.requestKey !== finalCard.requestKey,
        });
      }
    }
  }
  
  // 4. Check if API returned same SVG for different gotchis
  // Use FULL SVG content, not just first 500 chars (which might be the same structure)
  const svgToGotchis = new Map<string, string[]>();
  for (const [requestKey, response] of svgRequests.entries()) {
    // Use full SVG length + first 1000 chars + last 500 chars as signature
    const svgSignature = `${response.responseSvg.length}:${response.responseSvg.substring(0, 1000)}:${response.responseSvg.substring(Math.max(0, response.responseSvg.length - 500))}`;
    if (!svgToGotchis.has(svgSignature)) {
      svgToGotchis.set(svgSignature, []);
    }
    svgToGotchis.get(svgSignature)!.push(response.tokenId);
  }
  
  for (const [svgSignature, tokenIds] of svgToGotchis.entries()) {
    if (tokenIds.length > 1) {
      const uniqueTokenIds = new Set(tokenIds);
      if (uniqueTokenIds.size > 1) {
        const svgLength = svgSignature.split(':')[0];
        const svgPreview = svgSignature.split(':')[1].substring(0, 200);
        console.error(`🚨 API BUG: IDENTICAL SVG returned for ${uniqueTokenIds.size} different gotchis!`, {
          tokenIds: Array.from(uniqueTokenIds).slice(0, 10),
          svgLength,
          svgPreview,
          isPlaceholder: svgLength === '200' || svgLength === '300', // Placeholders are short
        });
      }
    }
  }
  
  // ASSERTIONS
  let failures: string[] = [];
  
  // Assert: requestKeys should be stable
  for (const [gotchiId, keyHistory] of domRequestKeys.entries()) {
    const uniqueKeys = new Set(keyHistory.map(k => k.requestKey).filter(Boolean));
    if (uniqueKeys.size > 1) {
      failures.push(`Gotchi ${gotchiId} requestKey changed: ${Array.from(uniqueKeys).join(" -> ")}`);
    }
  }
  
  // Assert: no cache collisions
  for (const [requestKey, gotchiIds] of requestKeyToGotchis.entries()) {
    if (gotchiIds.length > 1) {
      failures.push(`Cache collision: gotchis ${gotchiIds.join(", ")} share requestKey ${requestKey.substring(0, 50)}...`);
    }
  }
  
  // Assert: images should not change after first render
  for (let i = 0; i < cardsToTest; i++) {
    const firstCard = firstSample.cards[i];
    const finalCard = finalSample.cards[i];
    
    if (firstCard && finalCard && 
        firstCard.screenshot && finalCard.screenshot &&
        firstCard.gotchiId === finalCard.gotchiId) {
      const firstHash = firstCard.screenshot.subarray(0, 100).toString("base64").substring(0, 50);
      const finalHash = finalCard.screenshot.subarray(0, 100).toString("base64").substring(0, 50);
      
      if (firstHash !== finalHash && firstCard.requestKey === finalCard.requestKey) {
        failures.push(`Gotchi ${firstCard.gotchiId} image changed even though requestKey stayed the same`);
      }
    }
  }
  
  if (failures.length > 0) {
    console.error("\n=== FAILURES ===");
    failures.forEach(f => console.error(f));
    throw new Error(`Found ${failures.length} issues:\n${failures.join("\n")}`);
  }
  
  console.log("✅ No issues detected");
});
