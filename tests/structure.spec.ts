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

test('new album / new page buttons live inside their own section headers', async () => {
	const albumsSection = page.getByTestId('tree-section-albums');
	const pagesSection = page.getByTestId('tree-section-pages');
	await expect(albumsSection.getByTestId('new-album-btn')).toBeVisible();
	await expect(pagesSection.getByTestId('new-page-btn')).toBeVisible();
	await expect(page.getByTestId('tree-section-divider')).toBeVisible();
});

test('+ album button reveals inline input and creates the directory on Enter', async () => {
	await page.getByTestId('new-album-btn').click();
	const input = page.getByTestId('new-album-input');
	await expect(input).toBeVisible();
	await input.fill('Button Flow Album');
	await input.press('Enter');
	// Give the scan pipeline a tick to settle and the on-disk write to land.
	await expect
		.poll(() => fs.existsSync(path.join(fixtureCopy, '040-Button Flow Album')), { timeout: 5000 })
		.toBe(true);
});

test('+ page button reveals inline input and creates the markdown file on Enter', async () => {
	await page.getByTestId('new-page-btn').click();
	const input = page.getByTestId('new-page-input');
	await expect(input).toBeVisible();
	await input.fill('Button Flow Page');
	await input.press('Enter');
	await expect
		.poll(() => fs.readdirSync(fixtureCopy).some((f) => /^\d+-Button-Flow-Page\.md$/.test(f)), {
			timeout: 5000
		})
		.toBe(true);
});

test('Travel renders as a group with Japan and Italy nested inside', async () => {
	const travel = page.getByTestId('tree-group-row').filter({ hasText: 'Travel' });
	await expect(travel).toBeVisible();
	await expect(page.getByTestId('tree-album').filter({ hasText: 'Japan' })).toBeVisible();
	await expect(page.getByTestId('tree-album').filter({ hasText: 'Italy' })).toBeVisible();
});

test('clicking the Travel group caret collapses and expands its children', async () => {
	const travel = page.getByTestId('tree-group-row').filter({ hasText: 'Travel' });
	const japan = page.getByTestId('tree-album').filter({ hasText: 'Japan' });

	await expect(japan).toBeVisible();
	await expect(travel).toHaveAttribute('data-collapsed', 'false');

	await travel.click();
	await expect(travel).toHaveAttribute('data-collapsed', 'true');
	await expect(japan).toHaveCount(0);

	await travel.click();
	await expect(travel).toHaveAttribute('data-collapsed', 'false');
	await expect(japan).toBeVisible();
});

test('unnumbered albums render in the Hidden section', async () => {
	const hidden = page.getByTestId('tree-section-hidden');
	await expect(hidden).toBeVisible();
	await expect(
		hidden.getByTestId('tree-album-hidden').filter({ hasText: 'wip-drafts' })
	).toBeVisible();
});

test('create → edit → delete a page through the page editor', async () => {
	// Stub confirm so the delete confirmation auto-accepts.
	await page.evaluate(() => {
		(window as typeof window).confirm = () => true;
	});

	// Create via the + page button
	await page.getByTestId('new-page-btn').click();
	const createInput = page.getByTestId('new-page-input');
	await expect(createInput).toBeVisible();
	await createInput.fill('My Images');
	await createInput.press('Enter');

	// The file lands on disk with the hyphen-slug filename.
	let createdFilename: string | null = null;
	await expect
		.poll(
			() => {
				const match = fs.readdirSync(fixtureCopy).find((f) => /^\d+-My-Images\.md$/.test(f));
				if (match) createdFilename = match;
				return !!match;
			},
			{ timeout: 5000 }
		)
		.toBe(true);
	expect(createdFilename).not.toBeNull();
	const createdAbs = path.join(fixtureCopy, createdFilename!);
	expect(fs.existsSync(createdAbs)).toBe(true);

	// Open the page in the editor (click its row in the tree)
	await page.getByTestId('tree-page').filter({ hasText: 'My Images' }).click();
	await expect(page.getByTestId('page-editor')).toBeVisible();

	// Edit and save
	await page.getByTestId('page-body-input').fill('# My Images\n\nSome body text.');
	await page.getByTestId('page-save-btn').click();
	await expect
		.poll(() => fs.readFileSync(createdAbs, 'utf8').includes('Some body text'), { timeout: 5000 })
		.toBe(true);

	// Delete via the trash button
	await page.getByTestId('page-delete-btn').click();
	await expect.poll(() => fs.existsSync(createdAbs), { timeout: 5000 }).toBe(false);
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

// --- Reorder specs are last because they renumber everything at root -----

test('reorderTreeEntries IPC renumbers albums with sparse 10/20/30 prefixes', async () => {
	const home = await getHome();
	const before = fs
		.readdirSync(fixtureCopy, { withFileTypes: true })
		.filter((d) => d.isDirectory() && /^\d+-/.test(d.name))
		.map((d) => d.name)
		.sort();
	expect(before.length).toBeGreaterThanOrEqual(2);

	const reversed = [...before].reverse();
	const result = await page.evaluate(
		async ({ home, orderedNames }) =>
			(window as typeof window).api.fs.reorderTreeEntries({
				home,
				parentPath: '',
				kind: 'dir',
				orderedNames
			}),
		{ home, orderedNames: reversed }
	);
	expect(result.ok).toBe(true);

	const after = fs
		.readdirSync(fixtureCopy, { withFileTypes: true })
		.filter((d) => d.isDirectory() && /^\d+-/.test(d.name))
		.map((d) => d.name)
		.sort();
	const prefixes = after
		.map((n) => parseInt(n.match(/^(\d+)-/)?.[1] ?? '0', 10))
		.sort((a, b) => a - b);
	expect(prefixes.every((n) => n % 10 === 0)).toBe(true);
	expect(after.length).toBe(before.length);
});

test('reorderTreeEntries IPC renumbers page files with sparse prefixes', async () => {
	const home = await getHome();
	const before = fs
		.readdirSync(fixtureCopy)
		.filter((f) => /^\d+-.*\.md$/.test(f))
		.sort();
	if (before.length < 2) {
		test.skip();
		return;
	}
	const reversed = [...before].reverse();
	const result = await page.evaluate(
		async ({ home, orderedNames }) =>
			(window as typeof window).api.fs.reorderTreeEntries({
				home,
				parentPath: '',
				kind: 'file',
				orderedNames
			}),
		{ home, orderedNames: reversed }
	);
	expect(result.ok).toBe(true);

	const after = fs
		.readdirSync(fixtureCopy)
		.filter((f) => /^\d+-.*\.md$/.test(f))
		.sort();
	const prefixes = after
		.map((n) => parseInt(n.match(/^(\d+)-/)?.[1] ?? '0', 10))
		.sort((a, b) => a - b);
	expect(prefixes.every((n) => n % 10 === 0)).toBe(true);
});
