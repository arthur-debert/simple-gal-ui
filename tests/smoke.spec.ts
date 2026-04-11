import {
	_electron as electron,
	expect,
	test,
	type ElectronApplication,
	type Page
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
	app = await electron.launch({
		args: [path.join(repoRoot, 'dist-electron/main.js')],
		cwd: repoRoot,
		env: {
			...process.env,
			NODE_ENV: 'production',
			SIMPLE_GAL_PATH: process.env.SIMPLE_GAL_PATH ?? ''
		}
	});
	page = await app.firstWindow();
	await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
	await app?.close();
});

test('window opens and renders three panes', async () => {
	await expect(page.getByTestId('app-header')).toBeVisible();
	await expect(page.getByTestId('pane-left')).toBeVisible();
	await expect(page.getByTestId('pane-center')).toBeVisible();
	await expect(page.getByTestId('pane-right')).toBeVisible();
	await expect(page.getByTestId('status-bar')).toBeVisible();
});

test('app header is draggable for native window move', async () => {
	const headerStyle = await page.getByTestId('app-header').getAttribute('style');
	expect(headerStyle ?? '').toContain('app-region: drag');
});

test('status bar shows app version and simple-gal version on the right', async () => {
	await expect(page.getByTestId('footer-app-version')).toBeVisible();
	await expect(page.getByTestId('footer-sg-version')).toBeVisible();
});

test('welcome message is present', async () => {
	await expect(page.getByText('Welcome to simple-gal-ui')).toBeVisible();
});

test('captures screenshot of initial state', async () => {
	const outDir = path.join(repoRoot, 'tests/__screenshots__/pr1');
	await page.screenshot({ path: path.join(outDir, 'initial.png'), fullPage: true });
});
