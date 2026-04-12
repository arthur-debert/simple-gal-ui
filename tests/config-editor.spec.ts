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

test('editing a field changes the save button from disabled to enabled', async () => {
	await page.getByTestId('configure-root-btn').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();
	const save = page.getByTestId('config-editor-save');
	await expect(save).toBeDisabled();
	const input = page
		.locator('[data-testid="config-field-input"][data-config-key="site_title"]')
		.first();
	await input.fill('Regression Title');
	await expect(save).toBeEnabled();
});

test('saving a single edit writes ONLY that key to disk (sparse file)', async () => {
	// Open an album that does NOT have a local config.toml — Japan.
	const japanRow = page.getByTestId('tree-album').filter({ hasText: 'Japan' });
	await japanRow.click({ button: 'right' });
	await page.getByTestId('menu-configure').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();

	const japanConfig = path.join(fixtureCopy, '020-Travel', '010-Japan', 'config.toml');
	expect(fs.existsSync(japanConfig)).toBe(false);

	// Change one number: images.quality.
	const qualityInput = page
		.locator('[data-testid="config-field-input"][data-config-key="images.quality"]')
		.first();
	await qualityInput.fill('92');
	await page.getByTestId('config-editor-save').click();

	// Wait for save toast / reload to settle: the cascade is re-fetched so
	// the source of images.quality flips to 'local'.
	await expect(
		page.locator('[data-testid="config-field"][data-config-key="images.quality"]').first()
	).toHaveAttribute('data-config-source', 'local');

	// Check the on-disk file: exists, contains ONLY images.quality, NOT
	// any other root keys like site_title or colors.
	expect(fs.existsSync(japanConfig)).toBe(true);
	const contents = fs.readFileSync(japanConfig, 'utf8');
	expect(contents).toContain('quality = 92');
	expect(contents).not.toContain('site_title');
	expect(contents).not.toContain('[colors');
	expect(contents).not.toContain('background');
	expect(contents).not.toContain('aspect_ratio');
});

test('sparse cascade regression: album edit + later parent edit both propagate', async () => {
	// The critical scenario the user flagged:
	//
	//   1. Album's config.toml is absent (inherits everything from root).
	//   2. User saves ONE key at the album level (images.quality = 92).
	//   3. Without touching the album again, the user saves a DIFFERENT key
	//      at the root level (site_title = "Regression Title").
	//   4. Re-opening the album's config editor must show the new site_title
	//      inherited from root, NOT the old value frozen into the album file.
	//   5. The album's on-disk file should still contain ONLY
	//      `images.quality = 92` — nothing else copied down during step 2.
	//
	// If the sparse save rule were broken (e.g. the album wrote every
	// effective value on step 2), step 4 would show the OLD site_title.
	// Japan is the nested album we use because it has no config.toml in
	// the fixture.

	const japanConfig = path.join(fixtureCopy, '020-Travel', '010-Japan', 'config.toml');
	const rootConfig = path.join(fixtureCopy, 'config.toml');

	// Clean-slate Japan for this test (earlier sparse test also wrote there).
	if (fs.existsSync(japanConfig)) fs.rmSync(japanConfig);

	// Step 1+2: save images.quality=92 at the album level.
	const japanRow = page.getByTestId('tree-album').filter({ hasText: 'Japan' });
	await japanRow.click({ button: 'right' });
	await page.getByTestId('menu-configure').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();
	await expect(page.getByTestId('config-editor-title')).toHaveText('Travel / Japan');
	const japanQuality = page
		.locator('[data-testid="config-field-input"][data-config-key="images.quality"]')
		.first();
	await japanQuality.fill('92');
	await page.getByTestId('config-editor-save').click();
	await expect(
		page.locator('[data-testid="config-field"][data-config-key="images.quality"]').first()
	).toHaveAttribute('data-config-source', 'local');

	// Assert the on-disk Japan config is sparse: ONLY the quality key.
	const japanBody = fs.readFileSync(japanConfig, 'utf8');
	expect(japanBody).toContain('quality = 92');
	expect(japanBody).not.toContain('site_title');
	expect(japanBody).not.toContain('[colors');
	expect(japanBody).not.toContain('aspect_ratio');

	// Step 3: edit site_title at the root level.
	await page.getByTestId('configure-root-btn').click();
	await expect(page.getByTestId('config-editor-title')).toHaveText('root');
	const rootTitle = page
		.locator('[data-testid="config-field-input"][data-config-key="site_title"]')
		.first();
	await rootTitle.fill('Regression Title');
	await page.getByTestId('config-editor-save').click();
	await expect(
		page.locator('[data-testid="config-field"][data-config-key="site_title"]').first()
	).toHaveAttribute('data-config-source', 'local');

	const rootBody = fs.readFileSync(rootConfig, 'utf8');
	expect(rootBody).toContain('Regression Title');

	// Step 4: re-open Japan config. site_title must inherit the new root
	// value; quality must still be local (unchanged).
	await japanRow.click({ button: 'right' });
	await page.getByTestId('menu-configure').click();
	await expect(page.getByTestId('config-editor-title')).toHaveText('Travel / Japan');
	const inheritedTitleField = page
		.locator('[data-testid="config-field"][data-config-key="site_title"]')
		.first();
	await expect(inheritedTitleField).toHaveAttribute('data-config-source', 'root');
	const inheritedTitleInput = page
		.locator('[data-testid="config-field-input"][data-config-key="site_title"]')
		.first();
	await expect(inheritedTitleInput).toHaveValue('Regression Title');

	// Step 5: Japan's file is still sparse.
	const japanAfter = fs.readFileSync(japanConfig, 'utf8');
	expect(japanAfter).toContain('quality = 92');
	expect(japanAfter).not.toContain('site_title');
});

test('resetting a field removes it from the target file, restoring inheritance', async () => {
	// Landscapes has its own [images] quality AND thumbnails.aspect_ratio.
	// Reset images.quality: the save should strip it from the file while
	// leaving thumbnails.aspect_ratio intact.
	const landscapes = page.getByTestId('tree-album').filter({ hasText: 'Landscapes' });
	await landscapes.click({ button: 'right' });
	await page.getByTestId('menu-configure').click();
	await expect(page.getByTestId('config-editor')).toBeVisible();

	const landscapesConfig = path.join(fixtureCopy, '010-Landscapes', 'config.toml');
	const before = fs.readFileSync(landscapesConfig, 'utf8');
	expect(before).toContain('quality');
	expect(before).toContain('aspect_ratio');

	const resetBtn = page
		.locator('[data-testid="config-field-reset"][data-config-key="images.quality"]')
		.first();
	await resetBtn.click();
	await page.getByTestId('config-editor-save').click();

	// After save, reloaded cascade should show images.quality inherited
	// (not local).
	await expect(
		page.locator('[data-testid="config-field"][data-config-key="images.quality"]').first()
	).not.toHaveAttribute('data-config-source', 'local');

	const after = fs.readFileSync(landscapesConfig, 'utf8');
	expect(after).not.toMatch(/\bquality\s*=/);
	expect(after).toContain('aspect_ratio');
});
