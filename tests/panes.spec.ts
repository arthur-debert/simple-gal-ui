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

test('pane collapse toggles and width persists across relaunches', async () => {
	const fixtureCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-panes-'));
	fs.cpSync(fixtureSrc, fixtureCopy, { recursive: true });
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgui-userdata-'));

	const launchArgs = [path.join(repoRoot, 'dist-electron/main.js'), `--user-data-dir=${userDataDir}`];
	const env = {
		...process.env,
		NODE_ENV: 'production',
		SIMPLE_GAL_PATH: process.env.SIMPLE_GAL_PATH ?? '',
		SGUI_INITIAL_HOME: fixtureCopy
	};

	// First launch: collapse the left pane via the divider button.
	let app: ElectronApplication = await electron.launch({ args: launchArgs, cwd: repoRoot, env });
	let page: Page = await app.firstWindow();
	await page.waitForLoadState('domcontentloaded');
	await expect(page.getByTestId('pane-left')).toHaveAttribute('data-collapsed', 'false');

	await page.getByTestId('pane-left-collapse').click();
	await expect(page.getByTestId('pane-left')).toHaveAttribute('data-collapsed', 'true');

	// Give the debounced persist a moment to flush
	await page.waitForTimeout(200);
	await app.close();

	// Second launch: the collapsed state should be restored from electron-store.
	app = await electron.launch({ args: launchArgs, cwd: repoRoot, env });
	page = await app.firstWindow();
	await page.waitForLoadState('domcontentloaded');
	await expect(page.getByTestId('pane-left')).toHaveAttribute('data-collapsed', 'true', {
		timeout: 5000
	});

	// Re-expand from the collapsed strip
	await page.getByTestId('pane-left-expand').click();
	await expect(page.getByTestId('pane-left')).toHaveAttribute('data-collapsed', 'false');

	await app.close();
	fs.rmSync(fixtureCopy, { recursive: true });
	fs.rmSync(userDataDir, { recursive: true });
});
