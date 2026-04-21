/**
 * PR2a — image replace (button flow) tests.
 *
 * Drives the replace IPC directly (Playwright can't synthesize the native
 * file-open dialog into an Electron window). Covers the two slot-indexing
 * rules spelled out in the feature spec:
 *   - replacement with no NNN- prefix inherits the slot's prefix
 *   - replacement with its own NNN- prefix yields either the slot prefix
 *     (strategy: "slot") or the filename prefix (strategy: "filename"),
 *     depending on what the user picks in the mode dialog.
 *
 * Also verifies the album header and image-detail Replace buttons are
 * present in the DOM with the expected test-id hooks.
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
let extDir: string;

test.beforeAll(async () => {
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-replace-'));
	fs.cpSync(fixtureSrc, fixtureCopy, { recursive: true });
	userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-replace-userdata-'));
	extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-replace-ext-'));

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
	if (extDir && fs.existsSync(extDir)) fs.rmSync(extDir, { recursive: true });
});

test('replace button shows up when images are selected in the album header', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();
	await expect(page.getByTestId('album-replace-btn')).not.toBeVisible();
	// Click the first thumb to select one image.
	await page.getByTestId('album-thumb').first().click();
	await expect(page.getByTestId('album-replace-btn')).toBeVisible();
	await expect(page.getByTestId('album-replace-btn')).toHaveAttribute('data-selection-count', '1');
});

test('replace button shows up on the image detail editor', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page.getByTestId('album-thumb').first().dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();
	await expect(page.getByTestId('image-replace-btn')).toBeVisible();
});

test('replace with no-prefix source inherits the slot prefix', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	// Create a replacement source file with no NNN- prefix.
	const replacementSrc = path.join(extDir, 'My Sunset.jpg');
	fs.copyFileSync(path.join(fixtureCopy, '010-Landscapes/001-dawn.jpg'), replacementSrc);

	// The Minimal album has 001-solo.jpg — we'll replace that slot.
	const targetPath = path.join(fixtureCopy, '030-Minimal/001-solo.jpg');
	expect(fs.existsSync(targetPath)).toBe(true);

	const result = await page.evaluate(
		async ({ home, replacement }) =>
			(window as typeof window).api.fs.replaceImages({
				home,
				albumPath: '030-Minimal',
				pairs: [
					{
						targetSourcePath: '030-Minimal/001-solo.jpg',
						replacementPath: replacement
					}
				],
				indexStrategy: 'slot'
			}),
		{ home, replacement: replacementSrc }
	);

	expect(result.ok).toBe(true);
	expect(result.replaced.length).toBe(1);
	// Slot prefix preserved, slug derived from the picked file.
	expect(result.replaced[0].filename).toBe('001-My-Sunset.jpg');
	expect(fs.existsSync(targetPath)).toBe(false);
	expect(fs.existsSync(path.join(fixtureCopy, '030-Minimal/001-My-Sunset.jpg'))).toBe(true);
});

test('replace with prefix source and "filename" strategy uses the filename prefix', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	// A picked file that carries its own NNN- prefix.
	const replacementSrc = path.join(extDir, '042-IMG.jpg');
	fs.copyFileSync(path.join(fixtureCopy, '010-Landscapes/005-thumb.jpg'), replacementSrc);

	// Seed a fresh slot to replace.
	fs.copyFileSync(
		path.join(fixtureCopy, '010-Landscapes/010-night.jpg'),
		path.join(fixtureCopy, '030-Minimal/010-placeholder.jpg')
	);

	const result = await page.evaluate(
		async ({ home, replacement }) =>
			(window as typeof window).api.fs.replaceImages({
				home,
				albumPath: '030-Minimal',
				pairs: [
					{
						targetSourcePath: '030-Minimal/010-placeholder.jpg',
						replacementPath: replacement
					}
				],
				indexStrategy: 'filename'
			}),
		{ home, replacement: replacementSrc }
	);

	expect(result.ok).toBe(true);
	expect(result.replaced[0].filename).toBe('042-IMG.jpg');
	expect(fs.existsSync(path.join(fixtureCopy, '030-Minimal/042-IMG.jpg'))).toBe(true);
	expect(fs.existsSync(path.join(fixtureCopy, '030-Minimal/010-placeholder.jpg'))).toBe(false);
});

test('replace drops the old sidecar (caption is tied to the old photo)', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	// 010-Landscapes/001-dawn.jpg has a 001-dawn.txt sidecar in the fixture.
	const sidecarPath = path.join(fixtureCopy, '010-Landscapes/001-dawn.txt');
	expect(fs.existsSync(sidecarPath)).toBe(true);

	const replacementSrc = path.join(extDir, 'fresh.jpg');
	fs.copyFileSync(path.join(fixtureCopy, '010-Landscapes/010-night.jpg'), replacementSrc);

	const result = await page.evaluate(
		async ({ home, replacement }) =>
			(window as typeof window).api.fs.replaceImages({
				home,
				albumPath: '010-Landscapes',
				pairs: [
					{
						targetSourcePath: '010-Landscapes/001-dawn.jpg',
						replacementPath: replacement
					}
				],
				indexStrategy: 'slot'
			}),
		{ home, replacement: replacementSrc }
	);

	expect(result.ok).toBe(true);
	expect(fs.existsSync(sidecarPath)).toBe(false);
	// New file under the slot prefix exists.
	expect(fs.existsSync(path.join(fixtureCopy, '010-Landscapes/001-fresh.jpg'))).toBe(true);
});

test('skipping an unsupported extension surfaces a `skipped` entry', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	const bogus = path.join(extDir, 'notes.txt');
	fs.writeFileSync(bogus, 'not an image');

	// Use 030-Minimal/001-My-Sunset.jpg as the target (still exists from the
	// first test). Fall back gracefully if the filesystem state shifted.
	const existing = fs
		.readdirSync(path.join(fixtureCopy, '030-Minimal'))
		.find((n) => n.endsWith('.jpg'));
	if (!existing) throw new Error('no image in 030-Minimal');

	const result = await page.evaluate(
		async ({ home, replacement, target }) =>
			(window as typeof window).api.fs.replaceImages({
				home,
				albumPath: '030-Minimal',
				pairs: [{ targetSourcePath: `030-Minimal/${target}`, replacementPath: replacement }],
				indexStrategy: 'slot'
			}),
		{ home, replacement: bogus, target: existing }
	);

	expect(result.ok).toBe(true);
	expect(result.replaced.length).toBe(0);
	expect(result.skipped.length).toBe(1);
	expect(result.skipped[0].reason).toBe('not an image');
	// Target still on disk.
	expect(fs.existsSync(path.join(fixtureCopy, '030-Minimal', existing))).toBe(true);
});

test('batch destination collision: two pairs mapping to the same filename are both skipped', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	// Seed two slots we can swap, plus two replacement files whose filename
	// strategies would both produce `042-IMG.jpg` (same prefix and same
	// slug) under the filename strategy → collision.
	fs.copyFileSync(
		path.join(fixtureCopy, '010-Landscapes/010-night.jpg'),
		path.join(fixtureCopy, '030-Minimal/200-a.jpg')
	);
	fs.copyFileSync(
		path.join(fixtureCopy, '010-Landscapes/010-night.jpg'),
		path.join(fixtureCopy, '030-Minimal/201-b.jpg')
	);
	const rep1 = path.join(extDir, '042-IMG.jpg');
	const rep2 = path.join(extDir, 'other/042-IMG.jpg');
	fs.copyFileSync(path.join(fixtureCopy, '010-Landscapes/010-night.jpg'), rep1);
	fs.mkdirSync(path.dirname(rep2), { recursive: true });
	fs.copyFileSync(path.join(fixtureCopy, '010-Landscapes/010-night.jpg'), rep2);

	const result = await page.evaluate(
		async ({ home, r1, r2 }) =>
			(window as typeof window).api.fs.replaceImages({
				home,
				albumPath: '030-Minimal',
				pairs: [
					{ targetSourcePath: '030-Minimal/200-a.jpg', replacementPath: r1 },
					{ targetSourcePath: '030-Minimal/201-b.jpg', replacementPath: r2 }
				],
				indexStrategy: 'filename'
			}),
		{ home, r1: rep1, r2: rep2 }
	);

	expect(result.ok).toBe(true);
	expect(result.replaced.length).toBe(0);
	expect(result.skipped.length).toBe(2);
	expect(result.skipped.every((s) => s.reason.includes('destination conflict'))).toBe(true);
	// Both targets preserved on disk.
	expect(fs.existsSync(path.join(fixtureCopy, '030-Minimal/200-a.jpg'))).toBe(true);
	expect(fs.existsSync(path.join(fixtureCopy, '030-Minimal/201-b.jpg'))).toBe(true);
});

test('replace of a missing target yields a `target missing` skip without aborting other pairs', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	// Seed one real target; reference a second target that does not exist.
	fs.copyFileSync(
		path.join(fixtureCopy, '010-Landscapes/010-night.jpg'),
		path.join(fixtureCopy, '030-Minimal/300-real.jpg')
	);
	const rep1 = path.join(extDir, 'fresh1.jpg');
	const rep2 = path.join(extDir, 'fresh2.jpg');
	fs.copyFileSync(path.join(fixtureCopy, '010-Landscapes/010-night.jpg'), rep1);
	fs.copyFileSync(path.join(fixtureCopy, '010-Landscapes/010-night.jpg'), rep2);

	const result = await page.evaluate(
		async ({ home, r1, r2 }) =>
			(window as typeof window).api.fs.replaceImages({
				home,
				albumPath: '030-Minimal',
				pairs: [
					{ targetSourcePath: '030-Minimal/300-real.jpg', replacementPath: r1 },
					{ targetSourcePath: '030-Minimal/999-missing.jpg', replacementPath: r2 }
				],
				indexStrategy: 'slot'
			}),
		{ home, r1: rep1, r2: rep2 }
	);

	expect(result.ok).toBe(true);
	expect(result.replaced.length).toBe(1);
	expect(result.replaced[0].filename).toBe('300-fresh1.jpg');
	expect(result.skipped.length).toBe(1);
	expect(result.skipped[0].reason).toBe('target missing');
});
