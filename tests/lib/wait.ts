import type { Page } from '@playwright/test';

/**
 * Wait for the app to mount (`window.__e2e.ready.app === true`).
 * Replaces the brittle `page.waitForLoadState('domcontentloaded')` pattern,
 * which fires before Svelte's first $effect — leaving the test racing
 * against component mount + store hydration.
 */
export async function waitForApp(page: Page, timeout = 15_000): Promise<void> {
	await page.waitForFunction(() => window.__e2e?.ready?.app === true, null, { timeout });
}
