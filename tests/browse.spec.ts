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

test.beforeAll(async () => {
	// Copy the fixture into a tmp dir so tests are isolated from mutations.
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-fix-'));
	fs.cpSync(fixtureSrc, fixtureCopy, { recursive: true });

	app = await electron.launch({
		args: [path.join(repoRoot, 'dist-electron/main.js')],
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
});

test.afterAll(async () => {
	await app?.close();
	if (fixtureCopy && fs.existsSync(fixtureCopy)) fs.rmSync(fixtureCopy, { recursive: true });
});

test('renders site tree with fixture albums and pages', async () => {
	await expect(page.getByTestId('site-tree')).toBeVisible({ timeout: 10_000 });
	const albums = page.getByTestId('tree-album');
	// Fixture has 5 albums: 10-Landscapes, 30-Minimal, 20-Travel/10-Japan,
	// 20-Travel/20-Italy, and wip-drafts (unnumbered, hidden from nav but
	// still scanned as an album).
	expect(await albums.count()).toBeGreaterThanOrEqual(4);
	await expect(page.getByTestId('tree-page').first()).toBeVisible();
});

test('selecting an album shows the thumbnail grid', async () => {
	const landscapes = page.getByTestId('tree-album').filter({ hasText: 'Landscapes' });
	await landscapes.click();
	await expect(page.getByTestId('album-view')).toBeVisible();
	const thumbs = page.getByTestId('album-thumb');
	expect(await thumbs.count()).toBeGreaterThan(0);
});

test('selecting a thumbnail shows the image detail view', async () => {
	const landscapes = page.getByTestId('tree-album').filter({ hasText: 'Landscapes' });
	await landscapes.click();
	await page.getByTestId('album-thumb').first().click();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();
});

test('selecting a page shows the page editor', async () => {
	const firstPage = page.getByTestId('tree-page').first();
	await firstPage.click();
	await expect(page.getByTestId('page-editor')).toBeVisible();
});

test('captures browse screenshots', async () => {
	const outDir = path.join(repoRoot, 'tests/__screenshots__/pr2');
	const landscapes = page.getByTestId('tree-album').filter({ hasText: 'Landscapes' });
	await landscapes.click();
	await page.screenshot({ path: path.join(outDir, 'album.png'), fullPage: true });

	await page.getByTestId('album-thumb').first().click();
	await page.screenshot({ path: path.join(outDir, 'image-detail.png'), fullPage: true });

	await page.getByTestId('tree-page').first().click();
	await page.screenshot({ path: path.join(outDir, 'page.png'), fullPage: true });
});
