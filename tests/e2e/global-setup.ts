/**
 * Global E2E test setup.
 *
 * Adds an init script to every test page that sets the 'coi-reloaded'
 * sessionStorage flag so the COI service worker skips its one-time
 * page reload.  Without this the SW would call location.reload() mid-test
 * on first activation, breaking page.evaluate() and DOM assertions.
 *
 * Tests that explicitly want to verify COI reload behaviour should clear
 * this flag via page.evaluate(() => sessionStorage.removeItem('coi-reloaded'))
 * after goto.
 */

import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Suppress COI service worker reload for all tests.
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('coi-reloaded', '1');
      } catch {
        // sessionStorage may be unavailable in some contexts — ignore.
      }
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
