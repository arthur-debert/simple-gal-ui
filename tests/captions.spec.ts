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
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-cap-'));
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

test('editing description writes sidecar on disk', async () => {
	// Navigate to Landscapes → dusk (no existing sidecar — has .jpg only).
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page
		.getByTestId('album-thumb')
		.filter({ has: page.locator('text=dusk') })
		.dblclick();

	await expect(page.getByTestId('image-detail-editor')).toBeVisible();

	// Hover the description area to reveal the pencil, then click to edit
	const editor = page.getByTestId('image-detail-editor').getByTestId('description-editor');
	await editor.hover();
	await editor.getByTestId('description-edit-btn').click();

	const newCaption = 'Evening light across the ridge (test caption)';
	await editor.getByTestId('description-input').fill(newCaption);
	await editor.getByTestId('description-save-btn').click();

	// The save should create 002-dusk.txt in the fixture dir.
	const sidecar = path.join(fixtureCopy, '010-Landscapes/002-dusk.txt');
	await expect.poll(() => fs.existsSync(sidecar), { timeout: 5000 }).toBe(true);
	const content = fs.readFileSync(sidecar, 'utf8').trim();
	expect(content).toBe(newCaption);
});

test('editing title renames the image file', async () => {
	// Navigate to Landscapes → thumb (005-thumb.jpg has no sidecar)
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page
		.getByTestId('album-thumb')
		.filter({ has: page.locator('text=thumb') })
		.dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();

	// Use InlineTitleEdit: double-click to edit, type new name, press Enter
	await page.getByTestId('inline-title-display').dblclick();
	const input = page.getByTestId('inline-title-input');
	await expect(input).toBeVisible();
	await input.fill('The Hero Shot');
	await input.press('Enter');

	const renamed = path.join(fixtureCopy, '010-Landscapes/005-The-Hero-Shot.jpg');
	const old = path.join(fixtureCopy, '010-Landscapes/005-thumb.jpg');
	await expect.poll(() => fs.existsSync(renamed), { timeout: 5000 }).toBe(true);
	expect(fs.existsSync(old)).toBe(false);
});

test('emptying description removes sidecar', async () => {
	// dawn has an existing sidecar at 001-dawn.txt
	const sidecar = path.join(fixtureCopy, '010-Landscapes/001-dawn.txt');
	expect(fs.existsSync(sidecar)).toBe(true);

	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page
		.getByTestId('album-thumb')
		.filter({ has: page.locator('text=dawn') })
		.dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();

	// Hover the description area to reveal the pencil, then click to edit and clear
	const editor = page.getByTestId('image-detail-editor').getByTestId('description-editor');
	await editor.hover();
	await editor.getByTestId('description-edit-btn').click();
	await editor.getByTestId('description-input').fill('');
	await editor.getByTestId('description-save-btn').click();

	await expect.poll(() => fs.existsSync(sidecar), { timeout: 5000 }).toBe(false);
});

test('captures editor screenshot', async () => {
	const outDir = path.join(repoRoot, 'tests/__screenshots__/pr4');
	fs.mkdirSync(outDir, { recursive: true });
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page.getByTestId('album-thumb').first().dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();
	await page.screenshot({ path: path.join(outDir, 'editor.png'), fullPage: true });
});
