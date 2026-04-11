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

test('editing caption writes sidecar on disk', async () => {
	// Navigate to Landscapes → dusk (no existing sidecar — has .jpg only).
	// Single-click now only selects; double-click opens the detail editor.
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page
		.getByTestId('album-thumb')
		.filter({ has: page.locator('text=dusk') })
		.dblclick();

	await expect(page.getByTestId('image-detail-editor')).toBeVisible();

	const newCaption = 'Evening light across the ridge (test caption)';
	await page.getByTestId('image-caption-input').fill(newCaption);
	await page.getByTestId('image-save-btn').click();

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

	await page.getByTestId('image-title-input').fill('The Hero Shot');
	await page.getByTestId('image-save-btn').click();

	const renamed = path.join(fixtureCopy, '010-Landscapes/005-The-Hero-Shot.jpg');
	const old = path.join(fixtureCopy, '010-Landscapes/005-thumb.jpg');
	await expect.poll(() => fs.existsSync(renamed), { timeout: 5000 }).toBe(true);
	expect(fs.existsSync(old)).toBe(false);
});

test('emptying caption removes sidecar', async () => {
	// dawn has an existing sidecar at 001-dawn.txt
	const sidecar = path.join(fixtureCopy, '010-Landscapes/001-dawn.txt');
	expect(fs.existsSync(sidecar)).toBe(true);

	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page
		.getByTestId('album-thumb')
		.filter({ has: page.locator('text=dawn') })
		.dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();

	await page.getByTestId('image-caption-input').fill('');
	await page.getByTestId('image-save-btn').click();

	await expect.poll(() => fs.existsSync(sidecar), { timeout: 5000 }).toBe(false);
});

test('image detail editor shows the metadata behavior note', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page.getByTestId('album-thumb').first().dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();
	const note = page.getByTestId('image-metadata-note');
	await expect(note).toBeVisible();
	await expect(note).toContainText('Title edits rename the file');
	await expect(note).toContainText('sidecar');
	await expect(note).toContainText('IPTC');
});

test('captures editor screenshot', async () => {
	const outDir = path.join(repoRoot, 'tests/__screenshots__/pr4');
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await page.getByTestId('album-thumb').first().dblclick();
	await expect(page.getByTestId('image-detail-editor')).toBeVisible();
	await page.screenshot({ path: path.join(outDir, 'editor.png'), fullPage: true });
});
