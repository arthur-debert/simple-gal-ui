import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? 'github' : 'list',
	timeout: 60_000,
	use: {
		trace: 'on-first-retry'
	},
	// Two projects: the default "dev" project runs the full UI suite against
	// `dist-electron/main.js`; the opt-in "packaged" project smoke-tests a
	// built `.app` under `release/mac-arm64/`. Run the packaged project via
	// `pnpm exec playwright test --project=packaged` after `pnpm run package:dir`.
	projects: [
		{
			name: 'dev',
			testIgnore: [/packaged\.spec\.ts$/]
		},
		{
			name: 'packaged',
			testMatch: [/packaged\.spec\.ts$/]
		}
	]
});
