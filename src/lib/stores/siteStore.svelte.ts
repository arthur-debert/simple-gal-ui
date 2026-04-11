import { api } from '$lib/api';
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
}

const state = $state<SiteState>({
	home: null,
	manifest: null,
	loading: false,
	lastError: null,
	selection: { kind: 'none' }
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
		state.selection = value;
	}
};

export async function loadGalleryHome(home: string): Promise<void> {
	state.home = home;
	state.loading = true;
	state.lastError = null;
	try {
		const result = await api.gallery.scan(home);
		if (result.ok) {
			state.manifest = (result.data as ScanData).manifest;
			state.selection = { kind: 'none' };
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
	if (last) await loadGalleryHome(last);
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
