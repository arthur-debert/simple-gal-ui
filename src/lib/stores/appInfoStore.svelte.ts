/**
 * Tiny shared state for app-level chrome info (app version, simple-gal
 * version, platform). Populated once by App.svelte on mount and read by
 * StatusBar.svelte for display in the bottom-right of the footer.
 */

interface AppInfoState {
	appVersion: string;
	simpleGalVersion: string;
	simpleGalMissing: string | null;
	platform: 'darwin' | 'linux' | 'win32' | 'unknown';
}

const state = $state<AppInfoState>({
	appVersion: '',
	simpleGalVersion: '',
	simpleGalMissing: null,
	platform: 'unknown'
});

export const appInfo = {
	get appVersion() {
		return state.appVersion;
	},
	get simpleGalVersion() {
		return state.simpleGalVersion;
	},
	get simpleGalMissing() {
		return state.simpleGalMissing;
	},
	get platform() {
		return state.platform;
	}
};

export function setAppVersion(v: string): void {
	state.appVersion = v;
}

export function setSimpleGalVersion(v: string, missing: string | null): void {
	state.simpleGalVersion = v;
	state.simpleGalMissing = missing;
}

export function setPlatform(p: AppInfoState['platform']): void {
	state.platform = p;
}
