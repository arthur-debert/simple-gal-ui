/**
 * Typed wrapper around the `window.api` surface exposed by the preload script.
 *
 * This is the only place in the renderer that references `window.api` directly.
 * Components and stores should import from here so test doubles can be
 * substituted cleanly.
 */
import type { SimpleGalResult, ScanData } from './types/manifest';
import type { ConfigSchemaRoot } from './types/configSchema';

export interface FetchSchemaOk {
	ok: true;
	schema: ConfigSchemaRoot;
	binPath: string;
}
export interface FetchSchemaErr {
	ok: false;
	error: string;
}
export type FetchSchemaResult = FetchSchemaOk | FetchSchemaErr;

export interface PaneState {
	leftWidth: number;
	rightWidth: number;
	leftCollapsed: boolean;
	rightCollapsed: boolean;
}

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

export interface CreateAlbumArgs {
	home: string;
	parentPath: string;
	title: string;
}

export interface CreateAlbumResult {
	ok: boolean;
	albumPath: string;
	dirName: string;
}

export interface CreatePageArgs {
	home: string;
	title: string;
	body?: string;
}

export interface CreatePageResult {
	ok: boolean;
	pagePath: string;
	fileName: string;
}

export interface RenameEntryArgs {
	home: string;
	entryPath: string;
	newTitle: string;
}

export interface RenameEntryResult {
	ok: boolean;
	oldPath: string;
	newPath: string;
	newName: string;
}

export interface DeleteEntryArgs {
	home: string;
	entryPath: string;
}

export interface DeleteEntryResult {
	ok: boolean;
}

export interface WritePageArgs {
	home: string;
	pagePath: string;
	body: string;
}

export interface WritePageResult {
	ok: boolean;
}

export interface ReorderTreeEntriesArgs {
	home: string;
	parentPath: string;
	kind: 'dir' | 'file';
	orderedNames: string[];
}

export interface ReorderTreeEntriesResult {
	ok: boolean;
	renames: { old: string; new: string }[];
}

export interface FindPageFileArgs {
	home: string;
	slug: string;
}

export interface FindPageFileResult {
	ok: boolean;
	filename: string | null;
}

export interface SetAlbumThumbnailArgs {
	home: string;
	albumPath: string;
	imageSourcePath: string;
}

export interface SetAlbumThumbnailResult {
	ok: boolean;
	previousThumb: { old: string; new: string } | null;
	newThumb: { old: string; new: string };
	noOp: boolean;
}

export const api = {
	app: {
		version: () => window.api.app.version(),
		getPaneState: (id: string): Promise<PaneState | null> =>
			window.api.app.getPaneState(id) as Promise<PaneState | null>,
		setPaneState: (id: string, state: PaneState): Promise<void> =>
			window.api.app.setPaneState(id, state)
	},
	get platform(): 'darwin' | 'linux' | 'win32' {
		return window.api.platform;
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
		cancel: (): Promise<boolean> => window.api.preview.cancel(),
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
		createAlbum: (args: CreateAlbumArgs): Promise<CreateAlbumResult> =>
			window.api.fs.createAlbum(args) as Promise<CreateAlbumResult>,
		createPage: (args: CreatePageArgs): Promise<CreatePageResult> =>
			window.api.fs.createPage(args) as Promise<CreatePageResult>,
		renameEntry: (args: RenameEntryArgs): Promise<RenameEntryResult> =>
			window.api.fs.renameEntry(args) as Promise<RenameEntryResult>,
		deleteEntry: (args: DeleteEntryArgs): Promise<DeleteEntryResult> =>
			window.api.fs.deleteEntry(args) as Promise<DeleteEntryResult>,
		writePage: (args: WritePageArgs): Promise<WritePageResult> =>
			window.api.fs.writePage(args) as Promise<WritePageResult>,
		reorderTreeEntries: (args: ReorderTreeEntriesArgs): Promise<ReorderTreeEntriesResult> =>
			window.api.fs.reorderTreeEntries(args) as Promise<ReorderTreeEntriesResult>,
		findPageFile: (args: FindPageFileArgs): Promise<FindPageFileResult> =>
			window.api.fs.findPageFile(args) as Promise<FindPageFileResult>,
		setAlbumThumbnail: (args: SetAlbumThumbnailArgs): Promise<SetAlbumThumbnailResult> =>
			window.api.fs.setAlbumThumbnail(args) as Promise<SetAlbumThumbnailResult>,
		getPathForFile: (file: File): string => window.api.fs.getPathForFile(file)
	},
	watch: {
		start: (home: string): Promise<void> => window.api.watch.start(home),
		stop: (): Promise<void> => window.api.watch.stop(),
		onChanged: (cb: (payload: { home: string; paths: string[] }) => void): (() => void) =>
			window.api.watch.onChanged(cb)
	},
	config: {
		schema: (): Promise<FetchSchemaResult> =>
			window.api.config.schema() as Promise<FetchSchemaResult>
	}
};
