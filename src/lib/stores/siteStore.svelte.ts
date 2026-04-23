import { api, type PersistedSelection } from '$lib/api';
import type { Manifest, ScanData, Selection } from '$lib/types/manifest';
import { showToast } from './toastStore.svelte';

/**
 * Global site store. Holds the active gallery home and its most recent
 * manifest, plus the current tree selection.
 *
 * Using a single object + getter/setter exports keeps a module-scoped piece of
 * $state reactive across components without the Svelte 4 "writable store"
 * boilerplate.
 */

interface SiteState {
	home: string | null;
	manifest: Manifest | null;
	loading: boolean;
	lastError: string | null;
	selection: Selection;
	/**
	 * The most recent non-config selection. The config editor's Back button
	 * uses this to return where the user came from.
	 */
	previousNonConfigSelection: Selection;
}

const state = $state<SiteState>({
	home: null,
	manifest: null,
	loading: false,
	lastError: null,
	selection: { kind: 'none' },
	previousNonConfigSelection: { kind: 'none' }
});

export const site = {
	get home() {
		return state.home;
	},
	get manifest() {
		return state.manifest;
	},
	get loading() {
		return state.loading;
	},
	get lastError() {
		return state.lastError;
	},
	get selection() {
		return state.selection;
	},
	set selection(value: Selection) {
		// Snapshot the outgoing non-config selection so the config editor's
		// Back button can restore it.
		if (value.kind === 'config' && state.selection.kind !== 'config') {
			state.previousNonConfigSelection = state.selection;
		}
		state.selection = value;
	},
	get previousNonConfigSelection() {
		return state.previousNonConfigSelection;
	}
};

interface LoadOptions {
	/** If true, try to restore the persisted selection after the scan succeeds. */
	restoreSelection?: boolean;
}

function resolveStoredSelection(manifest: Manifest, stored: PersistedSelection): Selection {
	const album = manifest.albums.find((a) => a.title === stored.albumTitle);
	if (!album) return { kind: 'none' };
	if (stored.kind === 'album') {
		return { kind: 'album', albumPath: album.path };
	}
	const img = album.images.find((i) => i.filename === stored.imageFilename);
	if (!img) return { kind: 'album', albumPath: album.path };
	return { kind: 'image', albumPath: album.path, imageSourcePath: img.source_path };
}

export async function loadGalleryHome(home: string, opts: LoadOptions = {}): Promise<void> {
	state.home = home;
	state.loading = true;
	state.lastError = null;
	try {
		const result = await api.gallery.scan(home);
		if (result.ok) {
			const manifest = (result.data as ScanData).manifest;
			state.manifest = manifest;
			if (opts.restoreSelection) {
				const stored = await api.app.getLastSelection(home);
				state.selection = stored ? resolveStoredSelection(manifest, stored) : { kind: 'none' };
			} else {
				state.selection = { kind: 'none' };
			}
		} else {
			state.manifest = null;
			state.lastError = result.message;
			showToast({
				kind: 'error',
				title: `simple-gal scan failed (${result.kind})`,
				body: result.message
			});
		}
	} catch (err) {
		state.manifest = null;
		state.lastError = (err as Error).message;
		showToast({ kind: 'error', title: 'scan failed', body: (err as Error).message });
	} finally {
		state.loading = false;
	}
}

export async function openGalleryHomeDialog(): Promise<void> {
	const picked = await api.gallery.openDialog();
	if (picked) await loadGalleryHome(picked);
}

export async function restoreLastGalleryHome(): Promise<void> {
	const last = await api.gallery.last();
	if (last) await loadGalleryHome(last, { restoreSelection: true });
}

/**
 * Persist the current selection. Called from App.svelte on every selection
 * change — exact title/filename matching means a rename between sessions
 * simply falls back to no selection rather than picking a wrong target.
 */
export async function persistCurrentSelection(): Promise<void> {
	const home = state.home;
	if (!home) return;
	const manifest = state.manifest;
	const sel = state.selection;
	if (!manifest) {
		await api.app.setLastSelection(null);
		return;
	}
	if (sel.kind === 'album') {
		const album = manifest.albums.find((a) => a.path === sel.albumPath);
		if (album) {
			await api.app.setLastSelection({ home, kind: 'album', albumTitle: album.title });
			return;
		}
	} else if (sel.kind === 'image') {
		const album = manifest.albums.find((a) => a.path === sel.albumPath);
		const img = album?.images.find((i) => i.source_path === sel.imageSourcePath);
		if (album && img) {
			await api.app.setLastSelection({
				home,
				kind: 'image',
				albumTitle: album.title,
				imageFilename: img.filename
			});
			return;
		}
	}
	await api.app.setLastSelection(null);
}

/**
 * Re-scan the currently-loaded gallery home without clearing selection. Used
 * after local writes (sidecar edit, rename, import) to pick up the new state.
 */
export async function rescanCurrentHome(): Promise<void> {
	if (!state.home) return;
	const prevSelection = state.selection;
	const result = await api.gallery.scan(state.home);
	if (result.ok) {
		state.manifest = result.data.manifest;
		state.selection = prevSelection;
	}
}
