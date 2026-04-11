/**
 * Typed wrapper around the `window.api` surface exposed by the preload script.
 *
 * This is the only place in the renderer that references `window.api` directly.
 * Components and stores should import from here so test doubles can be
 * substituted cleanly.
 */
import type { SimpleGalResult, ScanData } from './types/manifest';

export interface BuildRunResult {
	ok: boolean;
	distPath: string;
	tempPath: string;
	durationMs: number;
	envelope: SimpleGalResult<{
		source: string;
		output: string;
		counts?: { albums: number; image_pages: number; pages: number };
		cache?: { cached: number; copied: number; encoded: number; total: number };
	}>;
}

export const api = {
	app: {
		version: () => window.api.app.version()
	},
	simpleGal: {
		version: () => window.api.simpleGal.version()
	},
	gallery: {
		openDialog: () => window.api.gallery.openDialog(),
		last: () => window.api.gallery.last(),
		recent: () => window.api.gallery.recent(),
		scan: (home: string): Promise<SimpleGalResult<ScanData>> =>
			window.api.gallery.scan(home) as Promise<SimpleGalResult<ScanData>>,
		onHomeChanged: (cb: (path: string) => void) => window.api.gallery.onHomeChanged(cb)
	},
	preview: {
		build: (home: string): Promise<BuildRunResult> =>
			window.api.preview.build(home) as Promise<BuildRunResult>,
		stop: (): Promise<void> => window.api.preview.stop(),
		onReady: (cb: (payload: { url: string; token: number }) => void): (() => void) =>
			window.api.preview.onReady(cb)
	}
};
