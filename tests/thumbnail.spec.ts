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
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-thumb-'));
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

test.describe.serial('thumbnail operations', () => {
	test('Use as Thumbnail button is hidden when no thumb is selected', async () => {
		await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
		await expect(page.getByTestId('album-view')).toBeVisible();
		await expect(page.getByTestId('album-use-as-thumb-btn')).toHaveCount(0);
	});

	test('Use as Thumbnail button appears when exactly one thumb is selected', async () => {
		await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
		await page.getByTestId('album-thumb').first().click();
		await expect(page.getByTestId('album-use-as-thumb-btn')).toBeVisible();

		// Cmd/ctrl-click a second thumb → selection = 2 → button hides
		await page
			.getByTestId('album-thumb')
			.nth(1)
			.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
		await expect(page.getByTestId('album-use-as-thumb-btn')).toHaveCount(0);
	});

	test('clicking Use as Thumbnail in the album header renames files on disk', async () => {
		// The fixture has 010-Landscapes/005-thumb.jpg as the current thumbnail.
		// Select 001-dawn.jpg and promote it; assert 001-dawn → 001-thumb-dawn and
		// 005-thumb → 005.
		const landscapes = path.join(fixtureCopy, '010-Landscapes');
		expect(fs.existsSync(path.join(landscapes, '005-thumb.jpg'))).toBe(true);
		expect(fs.existsSync(path.join(landscapes, '001-dawn.jpg'))).toBe(true);

		await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
		const dawn = page
			.getByTestId('album-thumb')
			.filter({ has: page.locator('text=dawn') })
			.first();
		await dawn.click();
		await expect(page.getByTestId('album-use-as-thumb-btn')).toBeVisible();
		await page.getByTestId('album-use-as-thumb-btn').click();

		// Promotion and demotion must both land on disk.
		await expect
			.poll(() => fs.existsSync(path.join(landscapes, '001-thumb-dawn.jpg')), { timeout: 5000 })
			.toBe(true);
		await expect
			.poll(() => fs.existsSync(path.join(landscapes, '005.jpg')), { timeout: 5000 })
			.toBe(true);
		expect(fs.existsSync(path.join(landscapes, '001-dawn.jpg'))).toBe(false);
		expect(fs.existsSync(path.join(landscapes, '005-thumb.jpg'))).toBe(false);
	});

	test('Use as Thumbnail from the image detail editor renames files on disk', async () => {
		// After the previous spec, 010-Landscapes now has 001-thumb-dawn.jpg as
		// the thumb. Double-click 002-dusk.jpg to open its editor, click Use as
		// Thumbnail, assert 002-dusk → 002-thumb-dusk and 001-thumb-dawn → 001-dawn.
		const landscapes = path.join(fixtureCopy, '010-Landscapes');

		await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
		const dusk = page
			.getByTestId('album-thumb')
			.filter({ has: page.locator('text=dusk') })
			.first();
		await dusk.dblclick();
		await expect(page.getByTestId('image-detail-editor')).toBeVisible();
		await expect(page.getByTestId('image-use-as-thumb-btn')).toBeVisible();
		await page.getByTestId('image-use-as-thumb-btn').click();

		await expect
			.poll(() => fs.existsSync(path.join(landscapes, '002-thumb-dusk.jpg')), { timeout: 5000 })
			.toBe(true);
		await expect
			.poll(() => fs.existsSync(path.join(landscapes, '001-dawn.jpg')), { timeout: 5000 })
			.toBe(true);
		expect(fs.existsSync(path.join(landscapes, '002-dusk.jpg'))).toBe(false);
		expect(fs.existsSync(path.join(landscapes, '001-thumb-dawn.jpg'))).toBe(false);
	});

	test('setting an already-thumbnail image is a no-op', async () => {
		// After the two previous specs, 002-thumb-dusk.jpg is the current thumb.
		// Double-click it, click Use as Thumbnail, assert no rename happens.
		const landscapes = path.join(fixtureCopy, '010-Landscapes');
		expect(fs.existsSync(path.join(landscapes, '002-thumb-dusk.jpg'))).toBe(true);

		await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
		await page
			.getByTestId('album-thumb')
			.filter({ has: page.locator('text=dusk') })
			.first()
			.dblclick();
		await expect(page.getByTestId('image-detail-editor')).toBeVisible();
		await page.getByTestId('image-use-as-thumb-btn').click();

		// Wait a short beat; assert file still exists under the same name.
		await page.waitForTimeout(300);
		expect(fs.existsSync(path.join(landscapes, '002-thumb-dusk.jpg'))).toBe(true);
	});
}); // end test.describe.serial
