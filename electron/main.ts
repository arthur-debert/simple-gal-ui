import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSimpleGalBin, getSimpleGalVersion } from './binPath.js';
import { scan, type SimpleGalResult, type ScanData } from './simpleGal.js';
import { getLastGalleryHome, getRecentGalleryHomes, recordGalleryHome } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RENDERER_DEV_URL = process.env.VITE_DEV_SERVER_URL;
const IS_DEV = !!RENDERER_DEV_URL;

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
	const win = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		backgroundColor: '#0a0a0a',
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		}
	});

	const initialHome = process.env.SGUI_INITIAL_HOME;

	if (IS_DEV && RENDERER_DEV_URL) {
		const query = initialHome ? `?home=${encodeURIComponent(initialHome)}` : '';
		win.loadURL(RENDERER_DEV_URL + query);
		win.webContents.openDevTools({ mode: 'detach' });
	} else {
		win.loadFile(path.join(__dirname, '../dist/index.html'), {
			query: initialHome ? { home: initialHome } : undefined
		});
	}

	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: 'deny' };
	});

	mainWindow = win;
	win.on('closed', () => {
		if (mainWindow === win) mainWindow = null;
	});

	return win;
}

function buildMenu(): void {
	const template: Electron.MenuItemConstructorOptions[] = [
		...(process.platform === 'darwin'
			? ([{ role: 'appMenu' }] as Electron.MenuItemConstructorOptions[])
			: []),
		{
			label: 'File',
			submenu: [
				{
					label: 'Open Gallery Home…',
					accelerator: 'CmdOrCtrl+O',
					click: async () => {
						if (mainWindow) await openGalleryHomeDialog(mainWindow);
					}
				},
				{ type: 'separator' },
				process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
			]
		},
		{ role: 'editMenu' },
		{ role: 'viewMenu' },
		{ role: 'windowMenu' }
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function openGalleryHomeDialog(win: BrowserWindow): Promise<string | null> {
	const result = await dialog.showOpenDialog(win, {
		title: 'Open Gallery Home',
		properties: ['openDirectory', 'createDirectory'],
		buttonLabel: 'Open'
	});
	if (result.canceled || result.filePaths.length === 0) return null;
	const picked = result.filePaths[0];
	recordGalleryHome(picked);
	win.webContents.send('gallery:home-changed', picked);
	return picked;
}

function registerIpcHandlers(): void {
	ipcMain.handle('app:version', () => app.getVersion());

	ipcMain.handle('simpleGal:version', async () => {
		try {
			const bin = resolveSimpleGalBin();
			const version = await getSimpleGalVersion(bin);
			return { ok: true, binPath: bin, version };
		} catch (err) {
			return { ok: false, error: (err as Error).message };
		}
	});

	ipcMain.handle('gallery:openDialog', async () => {
		const focused = BrowserWindow.getFocusedWindow() ?? mainWindow;
		if (!focused) return null;
		return openGalleryHomeDialog(focused);
	});

	ipcMain.handle('gallery:last', () => getLastGalleryHome() ?? null);
	ipcMain.handle('gallery:recent', () => getRecentGalleryHomes());

	ipcMain.handle('gallery:scan', async (_ev, home: string): Promise<SimpleGalResult<ScanData>> => {
		return scan(home);
	});
}

app.whenReady().then(() => {
	registerIpcHandlers();
	buildMenu();
	createMainWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
