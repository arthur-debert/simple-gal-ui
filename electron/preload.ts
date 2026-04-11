import { contextBridge, ipcRenderer } from 'electron';

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
	}
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
