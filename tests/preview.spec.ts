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
const fixtureSrc = path.join(repoRoot, 'tests/fixtures/sample-gallery');

let app: ElectronApplication;
let page: Page;
let fixtureCopy: string;
let userDataDir: string;

test.beforeAll(async () => {
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-prev-'));
	fs.cpSync(fixtureSrc, fixtureCopy, { recursive: true });
	userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-userdata-'));

	app = await electron.launch({
		args: [path.join(repoRoot, 'dist-electron/main.js'), `--user-data-dir=${userDataDir}`],
		cwd: repoRoot,
		env: {
			...process.env,
			NODE_ENV: 'production',
			SIMPLE_GAL_PATH: process.env.SIMPLE_GAL_PATH ?? '',
			SGUI_INITIAL_HOME: fixtureCopy
		}
	});
	page = await app.firstWindow();
	await page.waitForLoadState('domcontentloaded');
	await expect(page.getByTestId('site-tree')).toBeVisible({ timeout: 10_000 });
});

test.afterAll(async () => {
	await app?.close();
	if (fixtureCopy && fs.existsSync(fixtureCopy)) fs.rmSync(fixtureCopy, { recursive: true });
	if (userDataDir && fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true });
});

test('preview pane shows build button before first build', async () => {
	await expect(page.getByTestId('preview-pane')).toBeVisible();
	// Build button now lives in the top header, not the preview pane.
	const header = page.getByTestId('app-header');
	await expect(header.getByTestId('preview-build-btn')).toBeVisible();
	// The preview pane itself no longer has its own build button.
	await expect(page.getByTestId('preview-pane').getByTestId('preview-build-btn')).toHaveCount(0);
});

test('status bar starts in ready/idle state', async () => {
	await expect(page.getByTestId('status-bar')).toBeVisible();
	const label = page.getByTestId('status-label');
	await expect(label).toBeVisible();
});

test('clicking Build produces an iframe preview of the rendered site', async () => {
	await page.getByTestId('preview-build-btn').first().click();

	// Wait for build to transition to ready (may take a few seconds on first run
	// due to image encoding).
	await expect(page.getByTestId('status-label')).toHaveText('preview ready', {
		timeout: 90_000
	});
	await expect(page.getByTestId('preview-iframe')).toBeVisible();

	const iframeEl = page.getByTestId('preview-iframe');
	const src = await iframeEl.getAttribute('src');
	expect(src).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);

	// Fetch the URL from the test host directly — the preview server binds to
	// 127.0.0.1 on an ephemeral port and is reachable from the same machine.
	const res = await fetch(src!);
	expect(res.status).toBe(200);
	const html = await res.text();
	expect(html).toContain('Landscapes');
});

test('preview.cancel IPC exists and returns cleanly when no build is in flight', async () => {
	// Idle case: cancel should return false (nothing to cancel) and not throw.
	const cancelled = await page.evaluate(() => (window as typeof window).api.preview.cancel());
	expect(typeof cancelled).toBe('boolean');
});

test('captures preview screenshot', async () => {
	const outDir = path.join(repoRoot, 'tests/__screenshots__/pr3');
	fs.mkdirSync(outDir, { recursive: true });
	await page.screenshot({ path: path.join(outDir, 'preview-ready.png'), fullPage: true });
});
