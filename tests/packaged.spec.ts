/**
 * Smoke test for the packaged .app. NOT run by default `pnpm run test:e2e`
 * because it requires `pnpm run package:dir` to have produced an unpacked
 * build at `release/mac-arm64/simple-gal-ui.app`. CI's release workflow
 * runs this spec explicitly after packaging.
 *
 * The point is to catch coarse failures: binPath resolution, preload load,
 * renderer mount, simple-gal bundling. It does NOT drive any UI flow
 * beyond verifying the three panes render and the bundled simple-gal
 * binary reports its version in the status bar.
 */
import {
	_electron as electron,
	expect,
	test,
	type ElectronApplication,
	type Page
} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appPath = path.join(
	repoRoot,
	'release/mac-arm64/simple-gal-ui.app/Contents/MacOS/simple-gal-ui'
);

test.skip(
	!fs.existsSync(appPath),
	`packaged app not found at ${appPath}; run pnpm run package:dir first`
);

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
	app = await electron.launch({
		executablePath: appPath,
		args: [],
		env: {
			...process.env,
			// Packaged mode must not inherit SIMPLE_GAL_PATH from the dev env;
			// we want to verify the bundled binary actually resolves.
			SIMPLE_GAL_PATH: ''
		}
	});
	page = await app.firstWindow();
	await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
	await app?.close();
});

test('packaged app opens and renders the three-pane shell', async () => {
	await expect(page.getByTestId('app-header')).toBeVisible();
	await expect(page.getByTestId('pane-left')).toBeVisible();
	await expect(page.getByTestId('pane-center')).toBeVisible();
	await expect(page.getByTestId('pane-right')).toBeVisible();
	await expect(page.getByTestId('status-bar')).toBeVisible();
});

test('packaged app reports the bundled simple-gal version (not "not found")', async () => {
	const sg = page.getByTestId('footer-sg-version');
	await expect(sg).toBeVisible();
	await expect(sg).toHaveText(/simple-gal \d+\.\d+\.\d+/);
});

test('packaged app captures a screenshot of its initial state', async () => {
	const outDir = path.join(repoRoot, 'tests/__screenshots__/fb2');
	fs.mkdirSync(outDir, { recursive: true });
	await page.screenshot({ path: path.join(outDir, 'packaged-initial.png'), fullPage: true });
});
