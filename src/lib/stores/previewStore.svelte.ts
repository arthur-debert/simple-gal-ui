import { api, type BuildProgress } from '$lib/api';
import { showToast } from './toastStore.svelte';
import { site } from './siteStore.svelte';
import type { SimpleGalConfigError } from '$lib/types/manifest';

export type PreviewStatus = 'idle' | 'building' | 'ready' | 'error';

interface PreviewState {
	status: PreviewStatus;
	url: string | null;
	reloadToken: number;
	lastDurationMs: number | null;
	lastError: string | null;
	configError: (SimpleGalConfigError & { message: string }) | null;
	counts: { albums: number; image_pages: number; pages: number } | null;
	cache: { cached: number; copied: number; encoded: number; total: number } | null;
	progress: BuildProgress | null;
}

const state = $state<PreviewState>({
	status: 'idle',
	url: null,
	reloadToken: 0,
	lastDurationMs: null,
	lastError: null,
	configError: null,
	counts: null,
	cache: null,
	progress: null
});

let homeChangedUnsub: (() => void) | null = null;
let readyUnsub: (() => void) | null = null;
let progressUnsub: (() => void) | null = null;

export const preview = {
	get status() {
		return state.status;
	},
	get url() {
		return state.url;
	},
	get reloadToken() {
		return state.reloadToken;
	},
	get lastDurationMs() {
		return state.lastDurationMs;
	},
	get lastError() {
		return state.lastError;
	},
	get configError() {
		return state.configError;
	},
	get counts() {
		return state.counts;
	},
	get cache() {
		return state.cache;
	},
	get progress() {
		return state.progress;
	},
	clearConfigError() {
		state.configError = null;
	}
};

export function initPreviewStore(): () => void {
	readyUnsub = api.preview.onReady(({ url, token }) => {
		state.url = url;
		state.reloadToken = token;
	});
	homeChangedUnsub = api.gallery.onHomeChanged(() => {
		state.status = 'idle';
		state.url = null;
		state.lastError = null;
		state.configError = null;
		state.counts = null;
		state.cache = null;
		state.progress = null;
	});
	progressUnsub = api.preview.onBuildProgress((p) => {
		state.progress = p;
	});
	return () => {
		readyUnsub?.();
		homeChangedUnsub?.();
		progressUnsub?.();
		readyUnsub = null;
		homeChangedUnsub = null;
		progressUnsub = null;
	};
}

export async function runBuild(): Promise<void> {
	if (!site.home) return;
	if (state.status === 'building') return;

	state.status = 'building';
	state.lastError = null;
	state.configError = null;
	state.progress = null;

	try {
		const result = await api.preview.build(site.home);
		state.lastDurationMs = result.durationMs;
		state.progress = null;
		if (result.envelope.ok) {
			state.status = 'ready';
			state.counts = (result.envelope.data.counts as PreviewState['counts']) ?? null;
			state.cache = (result.envelope.data.cache as PreviewState['cache']) ?? null;
		} else if (result.envelope.kind === 'cancelled') {
			// User-initiated cancel — return cleanly to whatever the previous
			// post-build state was (ready if we had a preview, idle otherwise).
			state.status = state.url ? 'ready' : 'idle';
			showToast({ kind: 'info', title: 'Build cancelled' });
		} else {
			state.status = 'error';
			state.lastError = result.envelope.message;
			if (result.envelope.config) {
				state.configError = {
					...result.envelope.config,
					message: result.envelope.message
				};
			} else {
				showToast({
					kind: 'error',
					title: `build failed (${result.envelope.kind})`,
					body: result.envelope.message
				});
			}
		}
	} catch (err) {
		state.status = 'error';
		state.progress = null;
		state.lastError = (err as Error).message;
		showToast({ kind: 'error', title: 'build failed', body: (err as Error).message });
	}
}

export async function cancelBuild(): Promise<void> {
	if (state.status !== 'building') return;
	await api.preview.cancel();
	// The in-flight runBuild() will transition status via the cancelled
	// envelope branch; no need to mutate state here.
}
