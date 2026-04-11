import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSimpleGalBin, getSimpleGalVersion } from './binPath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RENDERER_DEV_URL = process.env.VITE_DEV_SERVER_URL;
const IS_DEV = !!RENDERER_DEV_URL;

function createMainWindow(): BrowserWindow {
	const win = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		backgroundColor: '#0a0a0a',
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
		webPreferences: {
			preload: path.join(__dirname, 'preload.mjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false
		}
	});

	if (IS_DEV && RENDERER_DEV_URL) {
		win.loadURL(RENDERER_DEV_URL);
		win.webContents.openDevTools({ mode: 'detach' });
	} else {
		win.loadFile(path.join(__dirname, '../dist/index.html'));
	}

	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: 'deny' };
	});

	return win;
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
}

app.whenReady().then(() => {
	registerIpcHandlers();
	createMainWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
