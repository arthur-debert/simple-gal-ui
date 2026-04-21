/**
 * Smoke coverage for the v0.20.0 manifest additions: content-addressed
 * `canonical_images` and per-ref `canonical_id`. Both are optional on
 * the emitter side, but if the pinned simple-gal binary stops emitting
 * them, we want CI to tell us before a downstream consumer of the
 * `Manifest` TypeScript types starts silently reading `undefined`.
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
const fixtureSrc = path.join(repoRoot, 'tests/fixtures/sample-gallery');

let app: ElectronApplication;
let page: Page;
let fixtureCopy: string;
let userDataDir: string;

test.beforeAll(async () => {
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-canon-'));
	fs.cpSync(fixtureSrc, fixtureCopy, { recursive: true });
	userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-canon-userdata-'));

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

test('scan manifest includes canonical_images and per-image canonical_id', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	const scan = await page.evaluate(
		async ({ home }) => (window as typeof window).api.gallery.scan(home),
		{ home }
	);

	expect(scan.ok).toBe(true);
	if (!scan.ok) return;

	const manifest = scan.data.manifest;
	expect(Array.isArray(manifest.canonical_images)).toBe(true);
	expect(manifest.canonical_images!.length).toBeGreaterThan(0);

	const entry = manifest.canonical_images![0];
	// SHA-256 hex is 64 chars.
	expect(entry.id).toMatch(/^[0-9a-f]{64}$/);
	expect(typeof entry.source_path).toBe('string');

	// Every image in every album carries a canonical_id that matches some
	// entry in canonical_images. Guards against a future shape change
	// where one side stops emitting.
	const ids = new Set(manifest.canonical_images!.map((c) => c.id));
	for (const album of manifest.albums) {
		for (const img of album.images) {
			expect(typeof img.canonical_id).toBe('string');
			expect(ids.has(img.canonical_id!)).toBe(true);
		}
	}
});
