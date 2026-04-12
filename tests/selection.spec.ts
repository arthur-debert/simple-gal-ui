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
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-sel-'));
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

test('single click selects a thumbnail (data-selected=true)', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();

	const first = page.getByTestId('album-thumb').first();
	await first.click();
	await expect(first).toHaveAttribute('data-selected', 'true');
});

test('cmd/ctrl+click toggles selection of individual thumbs', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	const thumbs = page.getByTestId('album-thumb');
	const first = thumbs.nth(0);
	const second = thumbs.nth(1);

	await first.click();
	await expect(first).toHaveAttribute('data-selected', 'true');

	// Modifier-click the second: both should now be selected.
	await second.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
	await expect(first).toHaveAttribute('data-selected', 'true');
	await expect(second).toHaveAttribute('data-selected', 'true');

	// Header delete button label reflects count.
	const headerX = page.getByTestId('album-delete-btn');
	await expect(headerX).toHaveAttribute('data-selection-count', '2');
});

test('double-click on a thumb opens the image detail editor', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page.getByTestId('album-thumb').first().dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();
});

test('inline rename on the album header renames the directory', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Japan' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();

	// Double-click the title to enter edit mode
	await page.getByTestId('inline-title-display').dblclick();
	const input = page.getByTestId('inline-title-input');
	await expect(input).toBeVisible();
	await input.fill('Nippon');
	await input.press('Enter');

	// The directory under 020-Travel/ should be renamed preserving the 010- prefix.
	const renamed = path.join(fixtureCopy, '020-Travel/010-Nippon');
	await expect.poll(() => fs.existsSync(renamed), { timeout: 5000 }).toBe(true);
	expect(fs.existsSync(path.join(fixtureCopy, '020-Travel/010-Japan'))).toBe(false);
});
