import { test as base, expect } from 'playwright/test';

// Set E2E_SANDBOX=1 when running inside a restricted sandbox (e.g. macOS
// Seatbelt) where Chromium must run with --single-process. Single-process
// Chromium does not survive closing a context, so each test gets its own
// browser instead of sharing one per worker.
const sandboxed = !!process.env.E2E_SANDBOX;

export const test = sandboxed
  ? base.extend({
      context: async ({ playwright, baseURL, viewport }, use) => {
        const browser = await playwright.chromium.launch({
          executablePath: process.env.PW_CHROMIUM_PATH || undefined,
          args: ['--single-process', '--no-proxy-server'],
        });
        const context = await browser.newContext({ baseURL, viewport });
        await use(context);
        await browser.close();
      },
    })
  : base;

export { expect };
