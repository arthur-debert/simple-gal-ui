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

export interface WriteSidecarArgs {
	home: string;
	imageSourcePath: string;
	caption: string;
}

export interface WriteSidecarResult {
	ok: boolean;
	sidecarPath: string;
	existed: boolean;
	deleted: boolean;
}

export interface RenameImageArgs {
	home: string;
	imageSourcePath: string;
	newTitle: string;
}

export interface RenameImageResult {
	ok: boolean;
	oldPath: string;
	newPath: string;
	newFilename: string;
	renamedSidecar: boolean;
}

export interface ImportImagesArgs {
	home: string;
	albumPath: string;
	sourcePaths: string[];
}

export interface ImportImagesResult {
	ok: boolean;
	imported: { source: string; dest: string; filename: string }[];
	skipped: { source: string; reason: string }[];
}

export interface DeleteImageArgs {
	home: string;
	imageSourcePath: string;
}

export interface DeleteImageResult {
	ok: boolean;
	trashedSidecar: boolean;
}

export interface ReorderImagesArgs {
	home: string;
	albumPath: string;
	orderedSourcePaths: string[];
}

export interface ReorderImagesResult {
	ok: boolean;
	renames: { old: string; new: string }[];
}

export interface WriteDescriptionArgs {
	home: string;
	albumPath: string;
	body: string;
	preferMarkdown?: boolean;
}

export interface WriteDescriptionResult {
	ok: boolean;
	writtenPath: string | null;
	removedPaths: string[];
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
	},
	fs: {
		writeSidecar: (args: WriteSidecarArgs): Promise<WriteSidecarResult> =>
			window.api.fs.writeSidecar(args) as Promise<WriteSidecarResult>,
		renameImage: (args: RenameImageArgs): Promise<RenameImageResult> =>
			window.api.fs.renameImage(args) as Promise<RenameImageResult>,
		importImages: (args: ImportImagesArgs): Promise<ImportImagesResult> =>
			window.api.fs.importImages(args) as Promise<ImportImagesResult>,
		deleteImage: (args: DeleteImageArgs): Promise<DeleteImageResult> =>
			window.api.fs.deleteImage(args) as Promise<DeleteImageResult>,
		reorderImages: (args: ReorderImagesArgs): Promise<ReorderImagesResult> =>
			window.api.fs.reorderImages(args) as Promise<ReorderImagesResult>,
		writeDescription: (args: WriteDescriptionArgs): Promise<WriteDescriptionResult> =>
			window.api.fs.writeDescription(args) as Promise<WriteDescriptionResult>,
		getPathForFile: (file: File): string => window.api.fs.getPathForFile(file)
	},
	watch: {
		start: (home: string): Promise<void> => window.api.watch.start(home),
		stop: (): Promise<void> => window.api.watch.stop(),
		onChanged: (cb: (payload: { home: string; paths: string[] }) => void): (() => void) =>
			window.api.watch.onChanged(cb)
	}
};
