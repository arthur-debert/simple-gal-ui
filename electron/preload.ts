import { contextBridge, ipcRenderer } from 'electron';
import type { SimpleGalResult, ScanData } from './simpleGal.js';

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
	}
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
