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

/**
 * Screenshot capture for PR #visual-adj. Exercises each of the refinements
 * in the branch so the PR body can link to one screenshot per change:
 *
 *   1. header-title.png           — "SimpleGal: <path>" header + Update button
 *   2. album-thumbnail-avatar.png — AlbumView with thumb avatar + pencil
 *   3. image-detail-thumb-badge.png — detail view "Album thumbnail" badge
 *   4. config-editor-back.png     — ConfigEditor with Back button
 *   5. config-unsaved-modal.png   — unsaved-changes confirm dialog
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fixtureSrc = path.join(repoRoot, 'tests/fixtures/sample-gallery');
const screenshotDir = path.join(repoRoot, 'tests/__screenshots__/visual-adj');

let app: ElectronApplication;
let page: Page;
let fixtureCopy: string;

test.beforeAll(async () => {
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-visualadj-'));
	fs.cpSync(fixtureSrc, fixtureCopy, { recursive: true });
	fs.mkdirSync(screenshotDir, { recursive: true });

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
	await expect(page.getByTestId('site-tree')).toBeVisible({ timeout: 10_000 });
});

test.afterAll(async () => {
	await app?.close();
	if (fixtureCopy && fs.existsSync(fixtureCopy)) fs.rmSync(fixtureCopy, { recursive: true });
});

test('header shows SimpleGal: <path> and Update button', async () => {
	await expect(page.getByTestId('app-title')).toBeVisible();
	await expect(page.getByTestId('app-title')).toContainText('SimpleGal');
	await expect(page.getByTestId('preview-build-btn')).toContainText('Update');
	await page.screenshot({ path: path.join(screenshotDir, 'header-title.png'), fullPage: false });
});

test('album view shows the thumbnail avatar + pencil', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();
	await expect(page.getByTestId('album-thumb-avatar')).toBeVisible();
	await expect(page.getByTestId('album-thumb-pencil')).toBeVisible();
	await page.screenshot({ path: path.join(screenshotDir, 'album-thumbnail-avatar.png') });
});

test('image detail view shows the corner mark on the album thumbnail', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	// 005-thumb.jpg is the fixture thumbnail.
	const thumbTile = page
		.locator('[data-testid="album-thumb"][data-image-path$="005-thumb.jpg"]')
		.first();
	await thumbTile.dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();
	await expect(
		page.getByTestId('image-detail-editor').getByTestId('thumb-corner-mark')
	).toBeVisible();
	await page.screenshot({ path: path.join(screenshotDir, 'image-detail-thumb-corner.png') });
});

test('config editor exposes a Back button', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click({ button: 'right' });
	await page.getByTestId('menu-configure').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();
	await expect(page.getByTestId('config-editor-back')).toBeVisible();
	await page.screenshot({ path: path.join(screenshotDir, 'config-editor-back.png') });
});

test('leaving with unsaved edits opens the confirm modal with changed keys', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click({ button: 'right' });
	await page.getByTestId('menu-configure').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();

	const input = page
		.locator('[data-testid="config-field-input"][data-config-key="images.quality"]')
		.first();
	await input.fill('55');
	await page.getByTestId('config-editor-back').click();
	await expect(page.getByTestId('config-unsaved-modal')).toBeVisible();
	await expect(page.getByTestId('config-unsaved-keys')).toContainText('images.quality');
	await page.screenshot({ path: path.join(screenshotDir, 'config-unsaved-modal.png') });

	// Close modal cleanly to avoid leaking state to subsequent tests (none in
	// this file, but keep the teardown clean).
	await page.getByTestId('config-unsaved-discard').click();
});
