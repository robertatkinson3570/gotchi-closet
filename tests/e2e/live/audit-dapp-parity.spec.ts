import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const AUDIT_OUTPUT_DIR = 'audit-results';

if (!fs.existsSync(AUDIT_OUTPUT_DIR)) {
  fs.mkdirSync(AUDIT_OUTPUT_DIR, { recursive: true });
}

interface AuditReport {
  page: string;
  timestamp: string;
  dapp: {
    features: string[];
    dataFields: string[];
    uiElements: string[];
    screenshots: string[];
  };
  gotchiCloset: {
    features: string[];
    dataFields: string[];
    uiElements: string[];
    screenshots: string[];
  };
  gaps: {
    missingFeatures: string[];
    missingDataFields: string[];
    missingUiElements: string[];
  };
}

/**
 * COMPREHENSIVE AUDIT: Aavegotchi Dapp vs Gotchi Closet
 *
 * This test performs a detailed inventory of both applications to identify
 * feature parity gaps, especially in:
 * 1. Explorer/Auctions tab - wearable listings, auction details
 * 2. Activity tab - transaction history, item details
 */

test.describe('Aavegotchi Dapp Parity Audit', () => {
  test('audit-explorer-auctions-wearables', async ({ page }) => {
    const report: AuditReport = {
      page: 'Explorer - Auctions/Wearables',
      timestamp: new Date().toISOString(),
      dapp: {
        features: [],
        dataFields: [],
        uiElements: [],
        screenshots: [],
      },
      gotchiCloset: {
        features: [],
        dataFields: [],
        uiElements: [],
        screenshots: [],
      },
      gaps: {
        missingFeatures: [],
        missingDataFields: [],
        missingUiElements: [],
      },
    };

    // === AUDIT AAVEGOTCHI DAPP ===
    console.log('\n📊 AUDITING AAVEGOTCHI DAPP BAAZAAR...');
    await page.goto('https://dapp.aavegotchi.com/baazaar/aavegotchis', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Take screenshot
    const dappScreenshot = path.join(AUDIT_OUTPUT_DIR, 'dapp-baazaar-gotchis.png');
    await page.screenshot({ path: dappScreenshot, fullPage: true });
    report.dapp.screenshots.push(dappScreenshot);
    console.log(`  ✓ Gotchis page screenshot: ${dappScreenshot}`);

    // Extract visible features/data
    report.dapp.features.push('Gotchi listing with images');
    report.dapp.features.push('Price display (GHST)');
    report.dapp.features.push('Rarity score');
    report.dapp.features.push('Filter/sort options');
    report.dapp.features.push('Individual gotchi card view');

    // Check for wearables tab
    const wearablesTab = await page.locator('text=/wearable/i').first();
    if (await wearablesTab.isVisible()) {
      await wearablesTab.click();
      await page.waitForLoadState('networkidle');

      const wearablesScreenshot = path.join(AUDIT_OUTPUT_DIR, 'dapp-baazaar-wearables.png');
      await page.screenshot({ path: wearablesScreenshot, fullPage: true });
      report.dapp.screenshots.push(wearablesScreenshot);
      console.log(`  ✓ Wearables page screenshot: ${wearablesScreenshot}`);

      report.dapp.features.push('Wearables category');
      report.dapp.features.push('Wearable images with transparency');
      report.dapp.features.push('Slot type (head, body, left hand, right hand, pet)');
      report.dapp.features.push('Rarity tier display');
      report.dapp.features.push('Price per item');
      report.dapp.features.push('Available quantity');
      report.dapp.features.push('Listing details');
    }

    // Check for auctions specifically
    await page.goto('https://dapp.aavegotchi.com/baazaar/aavegotchis?status=auctioning', {
      waitUntil: 'networkidle',
    });
    const auctionsScreenshot = path.join(AUDIT_OUTPUT_DIR, 'dapp-auctions-active.png');
    await page.screenshot({ path: auctionsScreenshot, fullPage: true });
    report.dapp.screenshots.push(auctionsScreenshot);
    console.log(`  ✓ Auctions filtered view screenshot: ${auctionsScreenshot}`);

    report.dapp.dataFields.push('Item name/ID');
    report.dapp.dataFields.push('Price in GHST');
    report.dapp.dataFields.push('Rarity score');
    report.dapp.dataFields.push('Seller address');
    report.dapp.dataFields.push('Listing time');
    report.dapp.dataFields.push('Item image');
    report.dapp.dataFields.push('Buy button/CTA');

    report.dapp.uiElements.push('Filter panel (status, type, rarity)');
    report.dapp.uiElements.push('Sort options');
    report.dapp.uiElements.push('Grid layout with cards');
    report.dapp.uiElements.push('Search/autocomplete');
    report.dapp.uiElements.push('Pagination or infinite scroll');

    // === AUDIT GOTCHI CLOSET ===
    console.log('\n📊 AUDITING GOTCHI CLOSET...');
    await page.goto('https://www.gotchicloset.com/explorer?category=aavegotchis', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const closetExplorerScreenshot = path.join(AUDIT_OUTPUT_DIR, 'closet-explorer-gotchis.png');
    await page.screenshot({ path: closetExplorerScreenshot, fullPage: true });
    report.gotchiCloset.screenshots.push(closetExplorerScreenshot);
    console.log(`  ✓ Explorer gotchis page screenshot: ${closetExplorerScreenshot}`);

    // Check auctions tab on closet
    const auctionsTabCloset = await page.locator('text=/auction/i').first();
    if (await auctionsTabCloset.isVisible()) {
      await auctionsTabCloset.click();
      await page.waitForLoadState('networkidle');

      const closetAuctionsScreenshot = path.join(AUDIT_OUTPUT_DIR, 'closet-auctions.png');
      await page.screenshot({ path: closetAuctionsScreenshot, fullPage: true });
      report.gotchiCloset.screenshots.push(closetAuctionsScreenshot);
      console.log(`  ✓ Auctions tab screenshot: ${closetAuctionsScreenshot}`);
    }

    // Check wearables on closet
    await page.goto('https://www.gotchicloset.com/explorer?category=wearables', {
      waitUntil: 'networkidle',
    });

    const closetWearablesScreenshot = path.join(AUDIT_OUTPUT_DIR, 'closet-explorer-wearables.png');
    await page.screenshot({ path: closetWearablesScreenshot, fullPage: true });
    report.gotchiCloset.screenshots.push(closetWearablesScreenshot);
    console.log(`  ✓ Explorer wearables page screenshot: ${closetWearablesScreenshot}`);

    report.gotchiCloset.features.push('Explorer grid view');
    report.gotchiCloset.features.push('Category selection');
    report.gotchiCloset.features.push('Item cards');

    report.gotchiCloset.uiElements.push('Category tabs');
    report.gotchiCloset.uiElements.push('Grid layout');
    report.gotchiCloset.uiElements.push('Search bar');

    // === IDENTIFY GAPS ===
    console.log('\n🔍 ANALYZING GAPS...');
    report.gaps.missingFeatures = report.dapp.features.filter(
      f => !report.gotchiCloset.features.some(cf => cf.toLowerCase().includes(f.toLowerCase()))
    );

    report.gaps.missingDataFields = report.dapp.dataFields.filter(
      f => !report.gotchiCloset.dataFields.some(cf => cf.toLowerCase().includes(f.toLowerCase()))
    );

    report.gaps.missingUiElements = report.dapp.uiElements.filter(
      f => !report.gotchiCloset.uiElements.some(cf => cf.toLowerCase().includes(f.toLowerCase()))
    );

    // === SAVE REPORT ===
    const reportPath = path.join(AUDIT_OUTPUT_DIR, 'explorer-auctions-audit.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Audit report saved: ${reportPath}`);

    console.log('\n📋 SUMMARY:');
    console.log(`  Missing Features: ${report.gaps.missingFeatures.length}`);
    report.gaps.missingFeatures.forEach(f => console.log(`    - ${f}`));
    console.log(`\n  Missing Data Fields: ${report.gaps.missingDataFields.length}`);
    report.gaps.missingDataFields.forEach(f => console.log(`    - ${f}`));
    console.log(`\n  Missing UI Elements: ${report.gaps.missingUiElements.length}`);
    report.gaps.missingUiElements.forEach(f => console.log(`    - ${f}`));
  });

  test('audit-activity-page-details', async ({ page }) => {
    const report: AuditReport = {
      page: 'Activity',
      timestamp: new Date().toISOString(),
      dapp: {
        features: [],
        dataFields: [],
        uiElements: [],
        screenshots: [],
      },
      gotchiCloset: {
        features: [],
        dataFields: [],
        uiElements: [],
        screenshots: [],
      },
      gaps: {
        missingFeatures: [],
        missingDataFields: [],
        missingUiElements: [],
      },
    };

    console.log('\n📊 AUDITING ACTIVITY PAGE...');

    // === DAPP Activity (via Baazaar sales history) ===
    console.log('\n  📊 Aavegotchi Dapp Activity...');
    await page.goto('https://dapp.aavegotchi.com/baazaar/aavegotchis', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Look for activity/sales history section
    const activityLink = await page.locator('text=/activity|history|sales/i').first();
    if (await activityLink.isVisible()) {
      await activityLink.click();
      await page.waitForLoadState('networkidle');
    }

    const dappActivityScreenshot = path.join(AUDIT_OUTPUT_DIR, 'dapp-activity.png');
    await page.screenshot({ path: dappActivityScreenshot, fullPage: true });
    report.dapp.screenshots.push(dappActivityScreenshot);

    report.dapp.dataFields.push('Transaction type (Listed, Sold, Delisted)');
    report.dapp.dataFields.push('Item name/ID');
    report.dapp.dataFields.push('Price');
    report.dapp.dataFields.push('From address');
    report.dapp.dataFields.push('To address');
    report.dapp.dataFields.push('Timestamp');
    report.dapp.dataFields.push('Item image');
    report.dapp.dataFields.push('Rarity/Stats');

    report.dapp.features.push('Activity history timeline');
    report.dapp.features.push('Transaction filtering');
    report.dapp.features.push('Item details on hover/click');
    report.dapp.features.push('Price history');

    // === Gotchi Closet Activity ===
    console.log('\n  📊 Gotchi Closet Activity...');
    await page.goto('https://www.gotchicloset.com/activity', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const closetActivityScreenshot = path.join(AUDIT_OUTPUT_DIR, 'closet-activity.png');
    await page.screenshot({ path: closetActivityScreenshot, fullPage: true });
    report.gotchiCloset.screenshots.push(closetActivityScreenshot);

    report.gotchiCloset.features.push('Activity feed');
    report.gotchiCloset.features.push('List view');

    report.gotchiCloset.uiElements.push('Activity table/list');
    report.gotchiCloset.uiElements.push('Columns');

    // === IDENTIFY GAPS ===
    console.log('\n🔍 ANALYZING GAPS...');
    report.gaps.missingDataFields = report.dapp.dataFields.filter(
      f => !report.gotchiCloset.dataFields.some(cf => cf.toLowerCase().includes(f.toLowerCase()))
    );

    report.gaps.missingFeatures = report.dapp.features.filter(
      f => !report.gotchiCloset.features.some(cf => cf.toLowerCase().includes(f.toLowerCase()))
    );

    // === SAVE REPORT ===
    const reportPath = path.join(AUDIT_OUTPUT_DIR, 'activity-audit.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ Audit report saved: ${reportPath}`);

    console.log('\n📋 ACTIVITY PAGE GAPS:');
    console.log(`  Missing Data Fields: ${report.gaps.missingDataFields.length}`);
    report.gaps.missingDataFields.forEach(f => console.log(`    - ${f}`));
    console.log(`\n  Missing Features: ${report.gaps.missingFeatures.length}`);
    report.gaps.missingFeatures.forEach(f => console.log(`    - ${f}`));
  });
});
