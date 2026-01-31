import { test, expect } from "@playwright/test";
import crypto from "crypto";

/**
 * Test to prove no flash/color shift after first paint when using blob URLs.
 * This test asserts:
 * 1. Once <img> src is set, it does NOT change over time (no replacements)
 * 2. Commit count does NOT increase after first non-skeleton paint
 * 3. No visual flash by sampling image hashes over time
 */
test("Explorer: No flash after first paint with blob URLs", async ({ page }) => {
  await page.goto("/explorer");
  await page.waitForLoadState("networkidle");

  // Find a specific gotchi card (use first visible one)
  const firstCard = page.locator('[data-gotchi-id]').first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });
  
  const gotchiId = await firstCard.getAttribute("data-gotchi-id");
  expect(gotchiId).toBeTruthy();
  
  // Wait for skeleton to disappear and image to appear
  const skeleton = firstCard.locator('[data-testid*="skeleton"]');
  const imageContainer = firstCard.locator('[data-testid*="gotchi-svg"]');
  const img = imageContainer.locator('img[src^="blob:"]');
  
  // Wait for skeleton to disappear
  await expect(skeleton).not.toBeVisible({ timeout: 5000 }).catch(() => {
    // Skeleton might already be gone
  });
  
  // Wait for image to appear
  await expect(img).toBeVisible({ timeout: 10000 });
  
  // Capture initial state
  const initialSrc = await img.getAttribute("src");
  const initialCommitCount = await imageContainer.getAttribute("data-commit-count");
  const initialRequestKey = await imageContainer.getAttribute("data-request-key");
  
  expect(initialSrc).toBeTruthy();
  expect(initialSrc).toContain("blob:");
  expect(initialCommitCount).toBeTruthy();
  expect(initialRequestKey).toBeTruthy();
  
  // Sample image hash and src over 2 seconds (every 200ms)
  const samples: Array<{
    time: number;
    src: string | null;
    commitCount: string | null;
    requestKey: string | null;
    imageHash: string | null;
  }> = [];
  
  const timePoints = [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000];
  
  for (const timeMs of timePoints) {
    if (timeMs > 0) {
      await page.waitForTimeout(200);
    }
    
    const src = await img.getAttribute("src");
    const commitCount = await imageContainer.getAttribute("data-commit-count");
    const requestKey = await imageContainer.getAttribute("data-request-key");
    
    // Sample image hash
    let imageHash: string | null = null;
    try {
      const screenshot = await img.screenshot();
      if (screenshot) {
        imageHash = crypto.createHash("sha256").update(screenshot).digest("hex");
      }
    } catch {
      // Image might not be ready yet
    }
    
    samples.push({
      time: timeMs,
      src,
      commitCount,
      requestKey,
      imageHash,
    });
  }
  
  // ANALYSIS: Assert stability
  console.log("\n=== STABILITY ANALYSIS ===");
  console.log(`Gotchi ID: ${gotchiId}`);
  console.log(`Initial src: ${initialSrc?.substring(0, 50)}...`);
  console.log(`Initial commit count: ${initialCommitCount}`);
  console.log(`Initial request key: ${initialRequestKey?.substring(0, 60)}...`);
  
  // 1. Assert src does NOT change after first paint
  const uniqueSrcs = new Set(samples.map(s => s.src).filter(Boolean));
  if (uniqueSrcs.size > 1) {
    console.error("🚨 FAIL: Image src changed after first paint!", {
      uniqueSrcs: Array.from(uniqueSrcs),
      samples: samples.map(s => ({ time: s.time, src: s.src?.substring(0, 50) })),
    });
  }
  expect(uniqueSrcs.size).toBe(1);
  
  // 2. Assert commit count does NOT increase after first paint
  const commitCounts = samples.map(s => s.commitCount).filter(Boolean);
  const uniqueCommitCounts = new Set(commitCounts);
  if (uniqueCommitCounts.size > 1) {
    console.error("🚨 FAIL: Commit count increased after first paint!", {
      uniqueCommitCounts: Array.from(uniqueCommitCounts),
      samples: samples.map(s => ({ time: s.time, commitCount: s.commitCount })),
    });
  }
  expect(uniqueCommitCounts.size).toBe(1);
  expect(commitCounts[0]).toBe(initialCommitCount);
  
  // 3. Assert requestKey does NOT change (except on hover, which we're not testing here)
  const uniqueRequestKeys = new Set(samples.map(s => s.requestKey).filter(Boolean));
  if (uniqueRequestKeys.size > 1) {
    console.error("🚨 FAIL: Request key changed after first paint!", {
      uniqueRequestKeys: Array.from(uniqueRequestKeys),
      samples: samples.map(s => ({ time: s.time, requestKey: s.requestKey?.substring(0, 60) })),
    });
  }
  expect(uniqueRequestKeys.size).toBe(1);
  expect(samples[0].requestKey).toBe(initialRequestKey);
  
  // 4. Assert image hash does NOT change (no visual flash)
  const nonNullHashes = samples.filter(s => s.imageHash !== null);
  if (nonNullHashes.length > 1) {
    const firstHash = nonNullHashes[0].imageHash;
    const hasFlash = nonNullHashes.some(s => s.imageHash !== firstHash);
    if (hasFlash) {
      console.error("🚨 FAIL: Visual flash detected - image hash changed!", {
        firstHash: firstHash?.substring(0, 20),
        uniqueHashes: new Set(nonNullHashes.map(s => s.imageHash)),
        samples: nonNullHashes.map(s => ({ time: s.time, hash: s.imageHash?.substring(0, 20) })),
      });
    }
    expect(hasFlash).toBe(false);
  }
  
  console.log("✅ All stability checks passed!");
});

test("Explorer: No flash on hover (blob URL src stability)", async ({ page }) => {
  await page.goto("/explorer");
  await page.waitForLoadState("networkidle");

  const firstCard = page.locator('[data-gotchi-id]').first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });
  
  const imageContainer = firstCard.locator('[data-testid*="gotchi-svg"]');
  const img = imageContainer.locator('img[src^="blob:"]');
  
  // Wait for image to appear
  await expect(img).toBeVisible({ timeout: 10000 });
  
  // Capture initial state (dressed)
  const initialSrc = await img.getAttribute("src");
  const initialCommitCount = await imageContainer.getAttribute("data-commit-count");
  
  expect(initialSrc).toBeTruthy();
  expect(initialCommitCount).toBeTruthy();
  
  // Hover to show naked
  await firstCard.hover();
  await page.waitForTimeout(500); // Wait for hover transition
  
  // Capture hover state
  const hoverSrc = await img.getAttribute("src");
  const hoverCommitCount = await imageContainer.getAttribute("data-commit-count");
  
  // Hover should change src (different blob URL for naked state)
  // But commit count should NOT increase if blob URL was prewarmed
  // (Actually, commit count might increase by 1 for the naked state, which is OK)
  
  // Unhover
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  
  // Capture final state (should be back to dressed)
  const finalSrc = await img.getAttribute("src");
  const finalCommitCount = await imageContainer.getAttribute("data-commit-count");
  
  // Assert: src should return to initial (dressed) state
  expect(finalSrc).toBe(initialSrc);
  
  // Assert: commit count should be stable (no new commits after hover)
  // It's OK if commit count increased by 1 for the naked state, but it shouldn't keep increasing
  const commitCountDiff = Number(finalCommitCount) - Number(initialCommitCount);
  expect(commitCountDiff).toBeLessThanOrEqual(2); // Allow 1 for naked, 1 for dressed if needed
});
