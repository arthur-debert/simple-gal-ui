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

function getHome(): Promise<string> {
	return page.evaluate(() => decodeURIComponent(window.location.search.match(/home=([^&]+)/)![1]));
}

test.beforeAll(async () => {
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-struct-'));
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

test('new album buttons exist in tree header', async () => {
	await expect(page.getByTestId('new-album-btn')).toBeVisible();
	await expect(page.getByTestId('new-page-btn')).toBeVisible();
});

test('createAlbum IPC creates a new NNN- directory at root', async () => {
	const home = await getHome();
	const result = await page.evaluate(
		async ({ home }) =>
			(window as typeof window).api.fs.createAlbum({
				home,
				parentPath: '',
				title: 'Brand New'
			}),
		{ home }
	);
	expect(result.ok).toBe(true);
	expect(result.dirName).toMatch(/^\d+-Brand New$/);
	expect(fs.existsSync(path.join(fixtureCopy, result.dirName))).toBe(true);
});

test('createPage IPC creates a new NNN- markdown file at root', async () => {
	const home = await getHome();
	const result = await page.evaluate(
		async ({ home }) =>
			(window as typeof window).api.fs.createPage({
				home,
				title: 'Credits'
			}),
		{ home }
	);
	expect(result.ok).toBe(true);
	expect(result.fileName).toMatch(/^\d+-Credits\.md$/);
	const abs = path.join(fixtureCopy, result.fileName);
	expect(fs.existsSync(abs)).toBe(true);
	expect(fs.readFileSync(abs, 'utf8')).toContain('# Credits');
});

test('renameEntry preserves NNN- prefix on a directory', async () => {
	const home = await getHome();
	const result = await page.evaluate(
		async ({ home }) =>
			(window as typeof window).api.fs.renameEntry({
				home,
				entryPath: '030-Minimal',
				newTitle: 'Barely There'
			}),
		{ home }
	);
	expect(result.ok).toBe(true);
	expect(result.newName).toBe('030-Barely There');
	expect(fs.existsSync(path.join(fixtureCopy, '030-Barely There'))).toBe(true);
	expect(fs.existsSync(path.join(fixtureCopy, '030-Minimal'))).toBe(false);
});

test('writePage updates an existing markdown page body', async () => {
	const home = await getHome();
	const result = await page.evaluate(
		async ({ home }) =>
			(window as typeof window).api.fs.writePage({
				home,
				pagePath: '040-about.md',
				body: '# About\n\nRewritten.'
			}),
		{ home }
	);
	expect(result.ok).toBe(true);
	const body = fs.readFileSync(path.join(fixtureCopy, '040-about.md'), 'utf8');
	expect(body).toContain('Rewritten');
});

test('deleteEntry moves a directory to trash', async () => {
	const home = await getHome();
	const renamedMinimal = path.join(fixtureCopy, '030-Barely There');
	expect(fs.existsSync(renamedMinimal)).toBe(true);
	const result = await page.evaluate(
		async ({ home }) =>
			(window as typeof window).api.fs.deleteEntry({
				home,
				entryPath: '030-Barely There'
			}),
		{ home }
	);
	expect(result.ok).toBe(true);
	expect(fs.existsSync(renamedMinimal)).toBe(false);
});

test('selecting a page shows the page editor', async () => {
	await page.getByTestId('tree-page').first().click();
	await expect(page.getByTestId('page-editor')).toBeVisible();
	await expect(page.getByTestId('page-body-input')).toBeVisible();
});

test('captures structure screenshot', async () => {
	const outDir = path.join(repoRoot, 'tests/__screenshots__/pr6');
	await page.screenshot({ path: path.join(outDir, 'tree-with-actions.png'), fullPage: true });
});
