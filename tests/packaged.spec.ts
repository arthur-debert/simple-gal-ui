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
import os from 'node:os';
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

test('bootstrap handler writes a log file and exits cleanly on startup error', async () => {
	// Don't use `electron.launch()` here — when we force a startup error,
	// no window ever opens and Playwright's launcher hangs waiting. Spawn
	// the binary directly via Node instead and wait for it to exit.
	const { spawn } = await import('node:child_process');
	const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-crash-'));
	try {
		const proc = spawn(appPath, [], {
			env: {
				...process.env,
				SIMPLE_GAL_PATH: '',
				SGUI_STARTUP_LOG: logDir,
				SGUI_FORCE_STARTUP_ERROR: 'synthetic startup failure for tests'
			},
			stdio: 'ignore'
		});

		const exitCode = await new Promise<number | null>((resolve) => {
			const t = setTimeout(() => {
				proc.kill('SIGKILL');
				resolve(null);
			}, 10_000);
			proc.on('exit', (code) => {
				clearTimeout(t);
				resolve(code);
			});
		});

		expect(exitCode).toBe(1); // app.exit(1) from handleFatal

		const logPath = path.join(logDir, 'last-error.log');
		expect(fs.existsSync(logPath)).toBe(true);
		const contents = fs.readFileSync(logPath, 'utf8');
		expect(contents).toContain('bootstrap-failed');
		expect(contents).toContain('synthetic startup failure for tests');
		expect(contents).toMatch(/versions:/); // sanity — full metadata present
	} finally {
		try {
			fs.rmSync(logDir, { recursive: true });
		} catch {
			// ignore
		}
	}
});
