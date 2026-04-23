import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { SimpleGalResult, ScanData } from './simpleGal.js';
import type { BuildRunResult, BuildProgress } from './build.js';
import type { FetchSchemaResult } from './configSchema.js';
import type { LoadCascadeArgs, LoadCascadeResult } from './configLoader.js';
import type { SaveConfigArgs, SaveConfigResult } from './configSave.js';
import type {
	WriteSidecarArgs,
	WriteSidecarResult,
	RenameImageArgs,
	RenameImageResult,
	ImportImagesArgs,
	ImportImagesResult,
	DeleteImageArgs,
	DeleteImageResult,
	ReorderImagesArgs,
	ReorderImagesResult,
	ReplaceImagesArgs,
	ReplaceImagesResult,
	WriteDescriptionArgs,
	WriteDescriptionResult,
	CreateAlbumArgs,
	CreateAlbumResult,
	CreatePageArgs,
	CreatePageResult,
	RenameEntryArgs,
	RenameEntryResult,
	DeleteEntryArgs,
	DeleteEntryResult,
	WritePageArgs,
	WritePageResult,
	ReorderTreeEntriesArgs,
	ReorderTreeEntriesResult,
	FindPageFileArgs,
	FindPageFileResult,
	SetAlbumThumbnailArgs,
	SetAlbumThumbnailResult
} from './fs.js';
import type { ReindexArgs, ReindexResult } from './reindex.js';

export interface SimpleGalVersionResult {
	ok: boolean;
	binPath?: string;
	version?: string;
	error?: string;
}

interface PaneState {
	leftWidth: number;
	rightWidth: number;
	leftCollapsed: boolean;
	rightCollapsed: boolean;
}

export interface PersistedSelection {
	home: string;
	kind: 'album' | 'image';
	albumTitle: string;
	imageFilename?: string;
}

const api = {
	app: {
		version: (): Promise<string> => ipcRenderer.invoke('app:version'),
		getPaneState: (id: string): Promise<PaneState | null> =>
			ipcRenderer.invoke('app:getPaneState', id),
		setPaneState: (id: string, state: PaneState): Promise<void> =>
			ipcRenderer.invoke('app:setPaneState', id, state),
		getLastSelection: (home: string): Promise<PersistedSelection | null> =>
			ipcRenderer.invoke('app:getLastSelection', home),
		setLastSelection: (sel: PersistedSelection | null): Promise<void> =>
			ipcRenderer.invoke('app:setLastSelection', sel)
	},
	platform: process.platform as 'darwin' | 'linux' | 'win32',
	simpleGal: {
		version: (): Promise<SimpleGalVersionResult> => ipcRenderer.invoke('simpleGal:version')
	},
	gallery: {
		openDialog: (): Promise<string | null> => ipcRenderer.invoke('gallery:openDialog'),
		last: (): Promise<string | null> => ipcRenderer.invoke('gallery:last'),
		recent: (): Promise<string[]> => ipcRenderer.invoke('gallery:recent'),
		scan: (home: string): Promise<SimpleGalResult<ScanData>> =>
			ipcRenderer.invoke('gallery:scan', home),
		onHomeChanged: (cb: (path: string) => void): (() => void) => {
			const handler = (_ev: Electron.IpcRendererEvent, p: string) => cb(p);
			ipcRenderer.on('gallery:home-changed', handler);
			return () => ipcRenderer.off('gallery:home-changed', handler);
		}
	},
	preview: {
		build: (home: string): Promise<BuildRunResult> => ipcRenderer.invoke('preview:build', home),
		stop: (): Promise<void> => ipcRenderer.invoke('preview:stop'),
		cancel: (): Promise<boolean> => ipcRenderer.invoke('preview:cancel'),
		onReady: (cb: (payload: { url: string; token: number }) => void): (() => void) => {
			const handler = (_ev: Electron.IpcRendererEvent, p: { url: string; token: number }) => cb(p);
			ipcRenderer.on('preview:ready', handler);
			return () => ipcRenderer.off('preview:ready', handler);
		},
		onBuildProgress: (cb: (progress: BuildProgress) => void): (() => void) => {
			const handler = (_ev: Electron.IpcRendererEvent, p: BuildProgress) => cb(p);
			ipcRenderer.on('preview:build-progress', handler);
			return () => ipcRenderer.off('preview:build-progress', handler);
		}
	},
	fs: {
		writeSidecar: (args: WriteSidecarArgs): Promise<WriteSidecarResult> =>
			ipcRenderer.invoke('fs:writeSidecar', args),
		renameImage: (args: RenameImageArgs): Promise<RenameImageResult> =>
			ipcRenderer.invoke('fs:renameImage', args),
		importImages: (args: ImportImagesArgs): Promise<ImportImagesResult> =>
			ipcRenderer.invoke('fs:importImages', args),
		deleteImage: (args: DeleteImageArgs): Promise<DeleteImageResult> =>
			ipcRenderer.invoke('fs:deleteImage', args),
		reorderImages: (args: ReorderImagesArgs): Promise<ReorderImagesResult> =>
			ipcRenderer.invoke('fs:reorderImages', args),
		writeDescription: (args: WriteDescriptionArgs): Promise<WriteDescriptionResult> =>
			ipcRenderer.invoke('fs:writeDescription', args),
		createAlbum: (args: CreateAlbumArgs): Promise<CreateAlbumResult> =>
			ipcRenderer.invoke('fs:createAlbum', args),
		createPage: (args: CreatePageArgs): Promise<CreatePageResult> =>
			ipcRenderer.invoke('fs:createPage', args),
		renameEntry: (args: RenameEntryArgs): Promise<RenameEntryResult> =>
			ipcRenderer.invoke('fs:renameEntry', args),
		deleteEntry: (args: DeleteEntryArgs): Promise<DeleteEntryResult> =>
			ipcRenderer.invoke('fs:deleteEntry', args),
		writePage: (args: WritePageArgs): Promise<WritePageResult> =>
			ipcRenderer.invoke('fs:writePage', args),
		reorderTreeEntries: (args: ReorderTreeEntriesArgs): Promise<ReorderTreeEntriesResult> =>
			ipcRenderer.invoke('fs:reorderTreeEntries', args),
		findPageFile: (args: FindPageFileArgs): Promise<FindPageFileResult> =>
			ipcRenderer.invoke('fs:findPageFile', args),
		setAlbumThumbnail: (args: SetAlbumThumbnailArgs): Promise<SetAlbumThumbnailResult> =>
			ipcRenderer.invoke('fs:setAlbumThumbnail', args),
		replaceImages: (args: ReplaceImagesArgs): Promise<ReplaceImagesResult> =>
			ipcRenderer.invoke('fs:replaceImages', args),
		pickImages: (opts: { multi: boolean }): Promise<string[]> =>
			ipcRenderer.invoke('fs:pickImages', opts),
		reindex: (args: ReindexArgs): Promise<ReindexResult> => ipcRenderer.invoke('fs:reindex', args),
		getPathForFile: (file: File): string => webUtils.getPathForFile(file)
	},
	config: {
		schema: (): Promise<FetchSchemaResult> => ipcRenderer.invoke('config:schema'),
		loadCascade: (args: LoadCascadeArgs): Promise<LoadCascadeResult> =>
			ipcRenderer.invoke('config:loadCascade', args),
		save: (args: SaveConfigArgs): Promise<SaveConfigResult> =>
			ipcRenderer.invoke('config:save', args)
	},
	watch: {
		start: (home: string): Promise<void> => ipcRenderer.invoke('watch:start', home),
		stop: (): Promise<void> => ipcRenderer.invoke('watch:stop'),
		onChanged: (cb: (payload: { home: string; paths: string[] }) => void): (() => void) => {
			const handler = (_ev: Electron.IpcRendererEvent, p: { home: string; paths: string[] }) =>
				cb(p);
			ipcRenderer.on('watch:changed', handler);
			return () => ipcRenderer.off('watch:changed', handler);
		}
	}
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
