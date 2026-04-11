import { api } from '$lib/api';
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
}

const state = $state<PreviewState>({
	status: 'idle',
	url: null,
	reloadToken: 0,
	lastDurationMs: null,
	lastError: null,
	configError: null,
	counts: null,
	cache: null
});

let homeChangedUnsub: (() => void) | null = null;
let readyUnsub: (() => void) | null = null;

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
	});
	return () => {
		readyUnsub?.();
		homeChangedUnsub?.();
		readyUnsub = null;
		homeChangedUnsub = null;
	};
}

export async function runBuild(): Promise<void> {
	if (!site.home) return;
	if (state.status === 'building') return;

	state.status = 'building';
	state.lastError = null;
	state.configError = null;

	try {
		const result = await api.preview.build(site.home);
		state.lastDurationMs = result.durationMs;
		if (result.envelope.ok) {
			state.status = 'ready';
			state.counts = (result.envelope.data.counts as PreviewState['counts']) ?? null;
			state.cache = (result.envelope.data.cache as PreviewState['cache']) ?? null;
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
		state.lastError = (err as Error).message;
		showToast({ kind: 'error', title: 'build failed', body: (err as Error).message });
	}
}
