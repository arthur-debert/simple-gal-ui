import { contextBridge, ipcRenderer } from 'electron';
import type { SimpleGalResult, ScanData } from './simpleGal.js';
import type { BuildRunResult } from './build.js';

export interface SimpleGalVersionResult {
	ok: boolean;
	binPath?: string;
	version?: string;
	error?: string;
}

const api = {
	app: {
		version: (): Promise<string> => ipcRenderer.invoke('app:version')
	},
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
		onReady: (cb: (payload: { url: string; token: number }) => void): (() => void) => {
			const handler = (_ev: Electron.IpcRendererEvent, p: { url: string; token: number }) => cb(p);
			ipcRenderer.on('preview:ready', handler);
			return () => ipcRenderer.off('preview:ready', handler);
		}
	}
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
