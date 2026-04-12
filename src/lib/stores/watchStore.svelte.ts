import { api } from '$lib/api';
import { site, rescanCurrentHome } from './siteStore.svelte';
import { runBuild } from './previewStore.svelte';

/**
 * Subscribes to main-process watcher events for the active home, rescans,
 * and debounces a follow-up preview build.
 */

let buildDebounce: ReturnType<typeof setTimeout> | null = null;
let unsubChanged: (() => void) | null = null;
let unsubHome: (() => void) | null = null;

const REBUILD_DEBOUNCE_MS = 500;

function scheduleBuild(): void {
	if (buildDebounce) clearTimeout(buildDebounce);
	buildDebounce = setTimeout(() => {
		buildDebounce = null;
		if (site.home) runBuild();
	}, REBUILD_DEBOUNCE_MS);
}

async function startWatchingCurrent(): Promise<void> {
	if (site.home) {
		await api.watch.start(site.home);
	} else {
		await api.watch.stop();
	}
}

export function initWatchStore(): () => void {
	void startWatchingCurrent().catch(() => {});

	unsubChanged = api.watch.onChanged(async ({ home }) => {
		if (home !== site.home) return;
		await rescanCurrentHome();
		scheduleBuild();
	});

	unsubHome = api.gallery.onHomeChanged(() => {
		void startWatchingCurrent().catch(() => {});
	});

	return () => {
		unsubChanged?.();
		unsubHome?.();
		unsubChanged = null;
		unsubHome = null;
		if (buildDebounce) clearTimeout(buildDebounce);
		buildDebounce = null;
	};
}
