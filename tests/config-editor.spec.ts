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
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-cfgedit-'));
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
	await page.getByTestId('site-tree').waitFor({ state: 'visible', timeout: 10_000 });
});

test.afterAll(async () => {
	await app?.close();
	if (fixtureCopy && fs.existsSync(fixtureCopy)) fs.rmSync(fixtureCopy, { recursive: true });
});

test('clicking the root configure button opens the config editor for the root', async () => {
	await page.getByTestId('configure-root-btn').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();
	await expect(page.getByTestId('config-editor-title')).toHaveText('root');
	// Every top-level schema property renders a ConfigSection except the
	// scalar ones (assets_dir, site_title, site_description_file).
	const sections = page.getByTestId('config-section');
	expect(await sections.count()).toBeGreaterThanOrEqual(5);
});

test('root editor shows images.quality with source=local since the fixture sets it', async () => {
	await page.getByTestId('configure-root-btn').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();
	const field = page
		.locator('[data-testid="config-field"][data-config-key="images.quality"]')
		.first();
	await expect(field).toBeVisible();
	await expect(field).toHaveAttribute('data-config-source', 'local');
});

test('root editor shows processing.max_processes with source=default since the fixture omits it', async () => {
	await page.getByTestId('configure-root-btn').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();
	// Expand the Processing section if collapsed (defaults open, but be safe).
	const field = page
		.locator('[data-testid="config-field"][data-config-key="processing.max_processes"]')
		.first();
	await expect(field).toBeVisible();
	await expect(field).toHaveAttribute('data-config-source', 'default');
});

test('album editor inherits from root when the album lacks an override', async () => {
	// 020-Travel/010-Japan has no config.toml — every local fixture key is
	// inherited from root. Groups default to expanded so Japan is already
	// visible in the tree.
	const japanRow = page.getByTestId('tree-album').filter({ hasText: 'Japan' });
	await expect(japanRow).toBeVisible();
	await japanRow.click({ button: 'right' });
	await page.getByTestId('menu-configure').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();
	await expect(page.getByTestId('config-editor-title')).toHaveText('Travel / Japan');
	// Japan inherits from root → the 'root' label appears as source.
	const field = page
		.locator('[data-testid="config-field"][data-config-key="images.quality"]')
		.first();
	await expect(field).toBeVisible();
	await expect(field).toHaveAttribute('data-config-source', 'root');
});

test('album editor uses local source when the album has its own config.toml', async () => {
	// 010-Landscapes has its own [images] quality override.
	const landscapes = page.getByTestId('tree-album').filter({ hasText: 'Landscapes' });
	await landscapes.click({ button: 'right' });
	await page.getByTestId('menu-configure').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();
	await expect(page.getByTestId('config-editor-title')).toHaveText('Landscapes');
	const field = page
		.locator('[data-testid="config-field"][data-config-key="images.quality"]')
		.first();
	await expect(field).toHaveAttribute('data-config-source', 'local');
});
