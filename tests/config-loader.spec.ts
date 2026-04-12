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
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-cfg-'));
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
});

test.afterAll(async () => {
	await app?.close();
	if (fixtureCopy && fs.existsSync(fixtureCopy)) fs.rmSync(fixtureCopy, { recursive: true });
	if (userDataDir && fs.existsSync(userDataDir)) fs.rmSync(userDataDir, { recursive: true });
});

test('config.schema() returns the simple-gal schema with expected top-level keys', async () => {
	const result = await page.evaluate(() => window.api.config.schema());
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.schema.type).toBe('object');
	const topKeys = Object.keys(result.schema.properties).sort();
	for (const expected of [
		'assets_dir',
		'colors',
		'font',
		'images',
		'site_title',
		'theme',
		'thumbnails'
	]) {
		expect(topKeys).toContain(expected);
	}
});

test('config.loadCascade() at root returns a chain of length 1 with the root config file', async () => {
	const result = await page.evaluate(async (home) => {
		return window.api.config.loadCascade({ home, dirPath: home });
	}, fixtureCopy);
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.cascade.chain.length).toBe(1);
	const root = result.cascade.chain[0];
	expect(root.level.kind).toBe('root');
	expect(root.level.label).toBe('root');
	expect(root.exists).toBe(true);
	// Root fixture config has [images] quality = 85 → dotted key present.
	expect(root.loadedKeys).toContain('images.quality');
	// Nested color keys should flatten.
	expect(root.loadedKeys).toContain('colors.light.background');
});

test('config.loadCascade() at a nested album returns the full chain root → group → album', async () => {
	const japanDir = path.join(fixtureCopy, '020-Travel', '010-Japan');
	const result = await page.evaluate(async (args) => window.api.config.loadCascade(args), {
		home: fixtureCopy,
		dirPath: japanDir
	});
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	// root → Travel (group) → Japan (album)
	expect(result.cascade.chain.length).toBe(3);
	expect(result.cascade.chain[0].level.kind).toBe('root');
	expect(result.cascade.chain[1].level.kind).toBe('group');
	expect(result.cascade.chain[1].level.label).toBe('Travel');
	expect(result.cascade.chain[2].level.kind).toBe('album');
	expect(result.cascade.chain[2].level.label).toBe('Travel / Japan');
	// Japan album doesn't have its own config.toml in the fixture.
	expect(result.cascade.chain[2].exists).toBe(false);
	expect(result.cascade.chain[2].loadedKeys).toEqual([]);
});

test('config.loadCascade() at an album WITH a local config returns non-empty loadedKeys', async () => {
	const landscapes = path.join(fixtureCopy, '010-Landscapes');
	const result = await page.evaluate(async (args) => window.api.config.loadCascade(args), {
		home: fixtureCopy,
		dirPath: landscapes
	});
	expect(result.ok).toBe(true);
	if (!result.ok) return;
	expect(result.cascade.chain.length).toBe(2);
	const album = result.cascade.chain[1];
	expect(album.exists).toBe(true);
	// Landscapes config sets images.quality + thumbnails.aspect_ratio.
	expect(album.loadedKeys).toContain('images.quality');
	expect(album.loadedKeys).toContain('thumbnails.aspect_ratio');
});

test('config.loadCascade() rejects a dirPath outside the home', async () => {
	const outside = path.dirname(fixtureCopy);
	const result = await page.evaluate(async (args) => window.api.config.loadCascade(args), {
		home: fixtureCopy,
		dirPath: outside
	});
	expect(result.ok).toBe(false);
});
