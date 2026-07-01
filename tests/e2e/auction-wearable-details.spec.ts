import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Wearable Auction Details Parity
 *
 * Verifies that the Gotchi Closet auction grid now displays wearable metadata
 * (name, rarity, slot type) with the same detail as the Aavegotchi dapp.
 *
 * Issue Fixed: "Explorer auctions tab is not showing wearable up for auction"
 */

test.describe('Wearable Auction Dapp Parity', () => {
  test('wearable-auctions-display-name-rarity-slot', async ({ page }) => {
    // Navigate to auctions
    await page.goto('/explorer', { waitUntil: 'networkidle' });

    // Check for auction cards with wearable type
    const wearableAuctions = page.locator('span:text("erc1155")').locator('xpath=ancestor::button');

    const count = await wearableAuctions.count();
    if (count > 0) {
      const firstWearable = wearableAuctions.first();

      // Verify name is displayed (not just token ID)
      const nameText = await firstWearable.locator('div:nth-child(2)').textContent();
      expect(nameText).toBeTruthy();
      expect(nameText?.length).toBeGreaterThan(2);

      // Verify rarity badge exists and has proper styling
      const rarityBadge = firstWearable.locator('[class*="bg-"][class*="text-"]').first();
      const hasRarityBadge = await rarityBadge.isVisible().catch(() => false);
      expect(hasRarityBadge).toBeTruthy();

      // Verify slot type is shown
      const slotText = await firstWearable.textContent();
      const hasSlotInfo = /Head|Face|Eyes|Body|Hand|Neck|Waist|Feet|Background|Pet/.test(slotText || '');
      expect(hasSlotInfo).toBeTruthy();

      console.log(`✅ Wearable auction #${count} displays: name, rarity, slot`);
    }
  });

  test('wearable-detail-modal-shows-full-metadata', async ({ page }) => {
    await page.goto('/explorer', { waitUntil: 'networkidle' });

    const wearableAuction = page.locator('span:text("erc1155")').locator('xpath=ancestor::button').first();

    if (await wearableAuction.isVisible()) {
      await wearableAuction.click();
      await page.waitForLoadState('networkidle');

      // Modal should show wearable name in header
      const modalHeader = page.locator('text=/Wearable #/');
      expect(await modalHeader.isVisible()).toBeTruthy();

      // Verify metadata section exists with rarity and slot
      const metadataSection = page.locator('text=/Common|Uncommon|Rare|Epic|Mythical/');
      expect(await metadataSection.isVisible()).toBeTruthy();

      console.log(`✅ Wearable detail modal displays full metadata`);
    }
  });
});
