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
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-img-'));
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

test('importing images via IPC copies them into the album with NNN- prefix', async () => {
	// Navigate to Landscapes
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();

	// Prepare an "external" image to import
	const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-ext-'));
	const ext1 = path.join(extDir, 'my holiday.jpg');
	fs.copyFileSync(path.join(fixtureCopy, '010-Landscapes/001-dawn.jpg'), ext1);

	// Drive the import through the IPC directly (Playwright can't synthesize
	// a real OS file drag-drop into an Electron BrowserWindow).
	const result = await page.evaluate(
		async ({ sourcePaths }) => {
			return (window as typeof window).api.fs.importImages({
				home: (window as typeof window).location.search.match(/home=([^&]+)/)?.[1]
					? decodeURIComponent((window as typeof window).location.search.match(/home=([^&]+)/)![1])
					: '',
				albumPath: '010-Landscapes',
				sourcePaths
			});
		},
		{ sourcePaths: [ext1] }
	);

	expect(result.imported.length).toBe(1);
	const destFile = result.imported[0].filename;
	expect(destFile).toMatch(/^\d+-my-holiday\.jpg$/);
	expect(fs.existsSync(path.join(fixtureCopy, '010-Landscapes', destFile))).toBe(true);

	fs.rmSync(extDir, { recursive: true });
});

test('deleting an image moves it to OS trash', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Minimal' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();

	const soloPath = path.join(fixtureCopy, '030-Minimal/001-solo.jpg');
	expect(fs.existsSync(soloPath)).toBe(true);

	const result = await page.evaluate(async () => {
		return (window as typeof window).api.fs.deleteImage({
			home: decodeURIComponent((window as typeof window).location.search.match(/home=([^&]+)/)![1]),
			imageSourcePath: '030-Minimal/001-solo.jpg'
		});
	});

	expect(result.ok).toBe(true);
	expect(fs.existsSync(soloPath)).toBe(false);
});

test('writing an album description creates description.md', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Italy' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();

	const result = await page.evaluate(async () => {
		return (window as typeof window).api.fs.writeDescription({
			home: decodeURIComponent((window as typeof window).location.search.match(/home=([^&]+)/)![1]),
			albumPath: '020-Travel/020-Italy',
			body: '# Italy\n\nA week in Rome.'
		});
	});

	expect(result.ok).toBe(true);
	const mdPath = path.join(fixtureCopy, '020-Travel/020-Italy/description.md');
	expect(fs.existsSync(mdPath)).toBe(true);
	const body = fs.readFileSync(mdPath, 'utf8');
	expect(body).toContain('# Italy');
});

test('reordering images renumbers them with sparse prefixes', async () => {
	// Landscapes now has: 001-dawn.jpg, 002-dusk.jpg (renamed earlier? no, this is a fresh
	// beforeAll fixture) + others. Actually this spec uses its own fresh fixture. Let's check
	// the initial ordering and reverse the first two.
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();

	const before = fs.readdirSync(path.join(fixtureCopy, '010-Landscapes')).sort();
	const imagesBefore = before.filter((f) => /\.(jpg|jpeg|png|webp|avif)$/i.test(f));
	expect(imagesBefore.length).toBeGreaterThanOrEqual(2);

	// Reverse the image order and push through reorder API
	const ordered = imagesBefore.map((f) => `010-Landscapes/${f}`).reverse();
	const result = await page.evaluate(
		async ({ ordered }) => {
			return (window as typeof window).api.fs.reorderImages({
				home: decodeURIComponent(
					(window as typeof window).location.search.match(/home=([^&]+)/)![1]
				),
				albumPath: '010-Landscapes',
				orderedSourcePaths: ordered
			});
		},
		{ ordered }
	);

	expect(result.ok).toBe(true);

	// New files should have prefixes 010, 020, 030, ...
	const after = fs.readdirSync(path.join(fixtureCopy, '010-Landscapes')).sort();
	const imagesAfter = after.filter((f) => /\.(jpg|jpeg|png|webp|avif)$/i.test(f));
	expect(imagesAfter.length).toBe(imagesBefore.length);
	const prefixes = imagesAfter
		.map((f) => f.match(/^(\d+)-/)?.[1])
		.filter(Boolean)
		.map((s) => parseInt(s!, 10))
		.sort((a, b) => a - b);
	// Expect all multiples of 10
	expect(prefixes.every((n) => n % 10 === 0)).toBe(true);
});

test('captures images screenshot', async () => {
	const outDir = path.join(repoRoot, 'tests/__screenshots__/pr5');
	fs.mkdirSync(outDir, { recursive: true });
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();
	await page.screenshot({ path: path.join(outDir, 'album-management.png'), fullPage: true });
});

test('album header shows a delete button; deleteEntry IPC trashes the directory', async () => {
	// UI presence: header X button is visible in the album view.
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();
	await expect(page.getByTestId('album-delete-btn')).toBeVisible();

	// Backend path: create a throwaway album, call deleteEntry through the
	// same IPC the button click invokes, assert it's trashed.
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);
	const created = await page.evaluate(
		async ({ home }) =>
			(window as typeof window).api.fs.createAlbum({
				home,
				parentPath: '',
				title: 'Throwaway'
			}),
		{ home }
	);
	expect(created.ok).toBe(true);
	const dirAbs = path.join(fixtureCopy, created.dirName);
	expect(fs.existsSync(dirAbs)).toBe(true);

	const deleteResult = await page.evaluate(
		async ({ home, entryPath }) =>
			(window as typeof window).api.fs.deleteEntry({ home, entryPath }),
		{ home, entryPath: created.dirName }
	);
	expect(deleteResult.ok).toBe(true);
	expect(fs.existsSync(dirAbs)).toBe(false);
});

test('page editor shows a delete button', async () => {
	await page.getByTestId('tree-page').first().click();
	await expect(page.getByTestId('page-editor')).toBeVisible();
	await expect(page.getByTestId('page-delete-btn')).toBeVisible();
});
