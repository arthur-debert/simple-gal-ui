import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	// `packaged.spec.ts` is only run by the release workflow via an explicit
	// `playwright test tests/packaged.spec.ts` invocation after the .app is
	// built. Exclude it from the default `pnpm run test:e2e` glob so
	// contributors don't need to run `pnpm run package:dir` first.
	testIgnore: [/packaged\.spec\.ts$/],
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? 'github' : 'list',
	timeout: 60_000,
	use: {
		trace: 'on-first-retry'
	}
});
