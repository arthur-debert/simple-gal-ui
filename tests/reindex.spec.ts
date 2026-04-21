/**
 * PR1 — re-index CLI integration test.
 *
 * Covers the thin layer between the UI and `simple-gal reindex`: the IPC
 * wrapper, the JSON envelope shape, and the renderer's rename-map logic
 * that re-pins the image-detail selection when the currently-open photo's
 * filename gets renumbered.
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

test.beforeAll(async () => {
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-reindex-'));
	fs.cpSync(fixtureSrc, fixtureCopy, { recursive: true });

	// Introduce sparse gaps at the album level (005-Landscapes, 030-Minimal,
	// 020-Travel stays put) and inside Landscapes so reindex has work to do.
	fs.renameSync(path.join(fixtureCopy, '010-Landscapes'), path.join(fixtureCopy, '005-Landscapes'));
	fs.renameSync(
		path.join(fixtureCopy, '005-Landscapes/002-dusk.jpg'),
		path.join(fixtureCopy, '005-Landscapes/007-dusk.jpg')
	);

	userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-reindex-userdata-'));

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

test('reindex dry-run reports the rename plan without touching disk', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	const before = fs.readdirSync(fixtureCopy).sort();
	const landscapesBefore = fs.readdirSync(path.join(fixtureCopy, '005-Landscapes')).sort();

	const result = await page.evaluate(
		async ({ home }) => (window as typeof window).api.fs.reindex({ home, dryRun: true }),
		{ home }
	);

	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.data.dry_run).toBe(true);
	expect(result.data.totals.total_renames).toBeGreaterThan(0);

	// Dry-run must not mutate the filesystem.
	expect(fs.readdirSync(fixtureCopy).sort()).toEqual(before);
	expect(fs.readdirSync(path.join(fixtureCopy, '005-Landscapes')).sort()).toEqual(landscapesBefore);

	// The home-relative rename map is the shape the UI actually consumes: it
	// composes ancestor directory renames into each child's new full path.
	expect(result.renameMap['005-Landscapes']).toBe('010-Landscapes');
	expect(result.renameMap['005-Landscapes/007-dusk.jpg']).toBe('010-Landscapes/030-dusk.jpg');
	expect(result.renameMap['005-Landscapes/001-dawn.txt']).toBe('010-Landscapes/010-dawn.txt');
});

test('reindex applies renames on disk and produces a home-relative renameMap', async () => {
	const home = await page.evaluate(() =>
		decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1])
	);

	const applied = await page.evaluate(
		async ({ home }) => (window as typeof window).api.fs.reindex({ home, dryRun: false }),
		{ home }
	);

	expect(applied.ok).toBe(true);
	if (!applied.ok) return;
	expect(applied.data.dry_run).toBe(false);
	expect(applied.data.totals.total_renames).toBeGreaterThan(0);

	// Files are actually renamed on disk.
	expect(fs.existsSync(path.join(fixtureCopy, '010-Landscapes/030-dusk.jpg'))).toBe(true);
	expect(fs.existsSync(path.join(fixtureCopy, '005-Landscapes'))).toBe(false);
	// Sidecars follow their image.
	expect(fs.existsSync(path.join(fixtureCopy, '010-Landscapes/010-dawn.txt'))).toBe(true);

	// The renameMap the modal uses to re-pin selection: ancestor renames are
	// composed in so a child whose parent got renumbered maps to its new
	// full path in one lookup.
	expect(applied.renameMap['005-Landscapes']).toBe('010-Landscapes');
	expect(applied.renameMap['005-Landscapes/007-dusk.jpg']).toBe('010-Landscapes/030-dusk.jpg');
});
