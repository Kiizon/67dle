import { test, expect } from '../fixtures.js';
import { openGame } from '../helpers.js';

for (const viewport of [
  { width: 375, height: 667 }, // iPhone SE
  { width: 390, height: 844 }, // iPhone 14
  { width: 1280, height: 800 },
]) {
  test(`board and keyboard fit a ${viewport.width}x${viewport.height} screen`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openGame(page);

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowX).toBe(false);

    for (const selector of ['.grid-container', '.keyboard-container']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });
}
