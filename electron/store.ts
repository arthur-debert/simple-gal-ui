import Store from 'electron-store';

export interface PaneState {
	leftWidth: number;
	rightWidth: number;
	leftCollapsed: boolean;
	rightCollapsed: boolean;
}

/**
 * Remembered selection for a given gallery home. Titles/filenames are
 * compared exactly — if the user renamed an album between sessions we just
 * fall back to no selection rather than guess.
 */
export interface PersistedSelection {
	home: string;
	kind: 'album' | 'image';
	albumTitle: string;
	imageFilename?: string;
}

interface PersistedState {
	recentGalleryHomes: string[];
	lastGalleryHome?: string;
	panes?: Record<string, PaneState>;
	lastSelection?: PersistedSelection;
}

const store = new Store<PersistedState>({
	name: 'simple-gal-ui',
	defaults: {
		recentGalleryHomes: []
	}
});

const MAX_RECENT = 10;

export function getLastGalleryHome(): string | undefined {
	return store.get('lastGalleryHome');
}

export function getRecentGalleryHomes(): string[] {
	return store.get('recentGalleryHomes');
}

export function recordGalleryHome(path: string): void {
	store.set('lastGalleryHome', path);
	const existing = store.get('recentGalleryHomes').filter((p) => p !== path);
	existing.unshift(path);
	store.set('recentGalleryHomes', existing.slice(0, MAX_RECENT));
}

export function getPaneState(id: string): PaneState | null {
	const all = store.get('panes') ?? {};
	return all[id] ?? null;
}

export function setPaneState(id: string, state: PaneState): void {
	const all = store.get('panes') ?? {};
	all[id] = state;
	store.set('panes', all);
}

export function getLastSelection(home: string): PersistedSelection | null {
	const sel = store.get('lastSelection');
	if (!sel || sel.home !== home) return null;
	return sel;
}

export function setLastSelection(sel: PersistedSelection | null): void {
	if (sel === null) {
		store.delete('lastSelection');
	} else {
		store.set('lastSelection', sel);
	}
}
