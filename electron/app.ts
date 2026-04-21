import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolveSimpleGalBin, getSimpleGalVersion } from './binPath.js';
import { scan, type SimpleGalResult, type ScanData } from './simpleGal.js';
import {
	getLastGalleryHome,
	getRecentGalleryHomes,
	recordGalleryHome,
	getPaneState,
	setPaneState,
	type PaneState
} from './store.js';
import { build, cancelBuild, type BuildRunResult, type BuildProgress } from './build.js';
import { ensureServer, stopServer } from './previewServer.js';
import {
	writeSidecar,
	renameImage,
	importImages,
	deleteImage,
	reorderImages,
	replaceImages,
	writeDescription,
	createAlbum,
	createPage,
	renameEntry,
	deleteEntry,
	writePage,
	reorderTreeEntries,
	findPageFile,
	setAlbumThumbnail,
	IMAGE_FILTER_EXTENSIONS,
	type WriteSidecarArgs,
	type WriteSidecarResult,
	type RenameImageArgs,
	type RenameImageResult,
	type ImportImagesArgs,
	type ImportImagesResult,
	type DeleteImageArgs,
	type DeleteImageResult,
	type ReorderImagesArgs,
	type ReorderImagesResult,
	type ReplaceImagesArgs,
	type ReplaceImagesResult,
	type WriteDescriptionArgs,
	type WriteDescriptionResult,
	type CreateAlbumArgs,
	type CreateAlbumResult,
	type CreatePageArgs,
	type CreatePageResult,
	type RenameEntryArgs,
	type RenameEntryResult,
	type DeleteEntryArgs,
	type DeleteEntryResult,
	type WritePageArgs,
	type WritePageResult,
	type ReorderTreeEntriesArgs,
	type ReorderTreeEntriesResult,
	type FindPageFileArgs,
	type FindPageFileResult,
	type SetAlbumThumbnailArgs,
	type SetAlbumThumbnailResult
} from './fs.js';
import { watchHome, stopWatching } from './watch.js';
import { fetchConfigSchema, type FetchSchemaResult } from './configSchema.js';
import { loadCascade, type LoadCascadeArgs, type LoadCascadeResult } from './configLoader.js';
import { saveConfig, type SaveConfigArgs, type SaveConfigResult } from './configSave.js';
import { reindex, type ReindexArgs, type ReindexResult } from './reindex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RENDERER_DEV_URL = process.env.VITE_DEV_SERVER_URL;
const IS_DEV = !!RENDERER_DEV_URL;

/**
 * Read the app's own version from package.json rather than using
 * `app.getVersion()`, which returns Electron's runtime version in dev mode
 * (when the app is unpackaged). We read from the repo root in dev, and from
 * the asar / resources dir in packaged builds.
 */
function readAppVersion(): string {
	const candidates = [
		path.join(__dirname, '..', 'package.json'), // dist-electron → repo root
		path.join(app.getAppPath(), 'package.json')
	];
	for (const p of candidates) {
		try {
			const parsed = JSON.parse(readFileSync(p, 'utf8')) as { version?: string };
			if (parsed.version) return parsed.version;
		} catch {
			// try the next one
		}
	}
	// Final fallback: whatever Electron thinks
	return app.getVersion();
}
const APP_VERSION = readAppVersion();

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
	await watchHome(picked, win);
	win.webContents.send('gallery:home-changed', picked);
	return picked;
}

function registerIpcHandlers(): void {
	ipcMain.handle('app:version', () => APP_VERSION);

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

	ipcMain.handle('app:getPaneState', (_ev, id: string) => getPaneState(id));
	ipcMain.handle('app:setPaneState', (_ev, id: string, state: PaneState) => {
		setPaneState(id, state);
	});

	ipcMain.handle('gallery:scan', async (_ev, home: string): Promise<SimpleGalResult<ScanData>> => {
		return scan(home);
	});

	ipcMain.handle('preview:build', async (ev, home: string): Promise<BuildRunResult> => {
		const result = await build(home, (p: BuildProgress) => {
			ev.sender.send('preview:build-progress', p);
		});
		if (result.ok) {
			const url = await ensureServer(result.distPath);
			ev.sender.send('preview:ready', { url, token: Date.now() });
		}
		return result;
	});

	ipcMain.handle('preview:url', async (): Promise<string | null> => {
		return null; // url is delivered via preview:ready event; renderer tracks it
	});

	ipcMain.handle('preview:stop', async () => {
		await stopServer();
	});

	ipcMain.handle('preview:cancel', () => {
		return cancelBuild();
	});

	ipcMain.handle(
		'fs:writeSidecar',
		async (_ev, args: WriteSidecarArgs): Promise<WriteSidecarResult> => {
			return writeSidecar(args);
		}
	);

	ipcMain.handle(
		'fs:renameImage',
		async (_ev, args: RenameImageArgs): Promise<RenameImageResult> => {
			return renameImage(args);
		}
	);

	ipcMain.handle('watch:start', async (ev, home: string) => {
		const win = BrowserWindow.fromWebContents(ev.sender);
		if (!win) return;
		await watchHome(home, win);
	});

	ipcMain.handle('watch:stop', async () => {
		await stopWatching();
	});

	ipcMain.handle(
		'fs:importImages',
		async (_ev, args: ImportImagesArgs): Promise<ImportImagesResult> => {
			return importImages(args);
		}
	);

	ipcMain.handle(
		'fs:deleteImage',
		async (_ev, args: DeleteImageArgs): Promise<DeleteImageResult> => {
			return deleteImage(args);
		}
	);

	ipcMain.handle(
		'fs:reorderImages',
		async (_ev, args: ReorderImagesArgs): Promise<ReorderImagesResult> => {
			return reorderImages(args);
		}
	);

	ipcMain.handle(
		'fs:writeDescription',
		async (_ev, args: WriteDescriptionArgs): Promise<WriteDescriptionResult> => {
			return writeDescription(args);
		}
	);

	ipcMain.handle(
		'fs:createAlbum',
		async (_ev, args: CreateAlbumArgs): Promise<CreateAlbumResult> => createAlbum(args)
	);

	ipcMain.handle(
		'fs:createPage',
		async (_ev, args: CreatePageArgs): Promise<CreatePageResult> => createPage(args)
	);

	ipcMain.handle(
		'fs:renameEntry',
		async (_ev, args: RenameEntryArgs): Promise<RenameEntryResult> => renameEntry(args)
	);

	ipcMain.handle(
		'fs:deleteEntry',
		async (_ev, args: DeleteEntryArgs): Promise<DeleteEntryResult> => deleteEntry(args)
	);

	ipcMain.handle(
		'fs:writePage',
		async (_ev, args: WritePageArgs): Promise<WritePageResult> => writePage(args)
	);

	ipcMain.handle(
		'fs:reorderTreeEntries',
		async (_ev, args: ReorderTreeEntriesArgs): Promise<ReorderTreeEntriesResult> =>
			reorderTreeEntries(args)
	);

	ipcMain.handle(
		'fs:findPageFile',
		async (_ev, args: FindPageFileArgs): Promise<FindPageFileResult> => findPageFile(args)
	);

	ipcMain.handle(
		'fs:setAlbumThumbnail',
		async (_ev, args: SetAlbumThumbnailArgs): Promise<SetAlbumThumbnailResult> =>
			setAlbumThumbnail(args)
	);

	ipcMain.handle(
		'fs:replaceImages',
		async (_ev, args: ReplaceImagesArgs): Promise<ReplaceImagesResult> => replaceImages(args)
	);

	ipcMain.handle('fs:pickImages', async (ev, opts: { multi: boolean }): Promise<string[]> => {
		const focused = BrowserWindow.fromWebContents(ev.sender) ?? mainWindow;
		if (!focused) return [];
		const result = await dialog.showOpenDialog(focused, {
			title: opts.multi ? 'Choose replacement images' : 'Choose replacement image',
			properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'],
			filters: [{ name: 'Images', extensions: IMAGE_FILTER_EXTENSIONS }]
		});
		if (result.canceled) return [];
		return result.filePaths;
	});

	ipcMain.handle('config:schema', async (): Promise<FetchSchemaResult> => fetchConfigSchema());

	ipcMain.handle(
		'fs:reindex',
		async (_ev, args: ReindexArgs): Promise<ReindexResult> => reindex(args)
	);

	ipcMain.handle(
		'config:loadCascade',
		async (_ev, args: LoadCascadeArgs): Promise<LoadCascadeResult> => loadCascade(args)
	);

	ipcMain.handle(
		'config:save',
		async (_ev, args: SaveConfigArgs): Promise<SaveConfigResult> => saveConfig(args)
	);
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

app.on('before-quit', async (e) => {
	try {
		e.preventDefault();
	} catch {
		// ignore
	}
	await stopWatching();
	await stopServer();
	app.exit(0);
});
