import Store from 'electron-store';

interface PersistedState {
	recentGalleryHomes: string[];
	lastGalleryHome?: string;
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
