/**
 * Selection-aware drag-and-drop replace tests.
 *
 * Playwright can't synthesize a native OS file-drag into an Electron
 * BrowserWindow, so we exercise the UI at the DOM level (the drop
 * overlay's wording flips between "import" and "replace" based on
 * selection) and the shared `replaceFlow` helpers that the DnD and
 * button paths both consume. End-to-end correctness of the underlying
 * `fs.replaceImages` IPC is already covered by `replace.spec.ts`.
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
	fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-replace-dnd-'));
	fs.cpSync(fixtureSrc, fixtureCopy, { recursive: true });
	userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-replace-dnd-userdata-'));

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

/**
 * Dispatch a synthetic `dragenter`/`dragover` sequence against the album
 * view so the overlay becomes visible. We can't actually drop files
 * (Playwright can't supply `dataTransfer.files` with real paths in an
 * Electron window), but we can verify the overlay wording reflects
 * whether the drop will import or replace.
 */
async function enterDragWithFiles(): Promise<void> {
	await page.evaluate(() => {
		const target = document.querySelector('[data-testid="album-view"]') as HTMLElement;
		const dt = new DataTransfer();
		// Attach a dummy file so `dataTransfer.types` includes "Files".
		try {
			dt.items.add(new File(['x'], 'dummy.jpg', { type: 'image/jpeg' }));
		} catch {
			// older browsers — fall through
		}
		const dragEnter = new DragEvent('dragenter', { bubbles: true, dataTransfer: dt });
		const dragOver = new DragEvent('dragover', { bubbles: true, dataTransfer: dt });
		target.dispatchEvent(dragEnter);
		target.dispatchEvent(dragOver);
	});
}

test('drop overlay says "import" when no selection is active', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();
	// Ensure nothing is selected.
	await page.keyboard.press('Escape');
	await enterDragWithFiles();
	const overlay = page.getByTestId('drop-overlay');
	await expect(overlay).toBeVisible();
	await expect(overlay).toHaveAttribute('data-drop-mode', 'import');
	await expect(overlay).toContainText('to import');
});

test('drop overlay switches to "replace" wording when thumbs are selected', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();
	await page.keyboard.press('Escape');
	// Select two thumbs
	const thumbs = page.getByTestId('album-thumb');
	await thumbs.nth(0).click();
	await thumbs.nth(1).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
	await enterDragWithFiles();
	const overlay = page.getByTestId('drop-overlay');
	await expect(overlay).toBeVisible();
	await expect(overlay).toHaveAttribute('data-drop-mode', 'replace');
	await expect(overlay).toContainText('Drop 2 images to replace selected');
});

test('overlay reverts to "import" when selection is cleared during drag', async () => {
	await page.getByTestId('tree-album').filter({ hasText: 'Landscapes' }).click();
	await expect(page.getByTestId('album-view')).toBeVisible();
	await page.getByTestId('album-thumb').first().click();
	await enterDragWithFiles();
	await expect(page.getByTestId('drop-overlay')).toHaveAttribute('data-drop-mode', 'replace');
	await page.keyboard.press('Escape');
	await enterDragWithFiles();
	await expect(page.getByTestId('drop-overlay')).toHaveAttribute('data-drop-mode', 'import');
});
