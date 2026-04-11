import { spawnSimpleGal, type SimpleGalHandle, type SimpleGalResult } from './simpleGal.js';
import { workPathsForHome } from './paths.js';

export interface BuildCounts {
	albums: number;
	image_pages: number;
	pages: number;
}

export interface BuildCache {
	cached: number;
	copied: number;
	encoded: number;
	total: number;
}

export interface BuildData {
	source: string;
	output: string;
	counts?: BuildCounts;
	cache?: BuildCache;
}

export interface BuildRunResult {
	ok: boolean;
	distPath: string;
	tempPath: string;
	durationMs: number;
	envelope: SimpleGalResult<BuildData>;
}

let inflight: {
	promise: Promise<BuildRunResult>;
	handle: SimpleGalHandle<BuildData>;
} | null = null;

/**
 * Run `simple-gal build` on `home` into a stable per-home tmp dir.
 *
 * Concurrent builds are coalesced: a second caller during an in-flight build
 * gets the same Promise, so rapid change bursts don't stack up builds.
 */
export function build(home: string): Promise<BuildRunResult> {
	if (inflight) return inflight.promise;
	const { dist, temp } = workPathsForHome(home);
	const started = Date.now();
	const handle = spawnSimpleGal<BuildData>('build', {
		source: home,
		output: dist,
		tempDir: temp
	});
	const promise = handle.result
		.then<BuildRunResult>((envelope) => ({
			ok: envelope.ok,
			distPath: dist,
			tempPath: temp,
			durationMs: Date.now() - started,
			envelope
		}))
		.finally(() => {
			inflight = null;
		});
	inflight = { promise, handle };
	return promise;
}

/**
 * Cancel the currently in-flight build (if any). The pending `build()`
 * Promise resolves with a `{kind: 'cancelled'}` envelope.
 */
export function cancelBuild(): boolean {
	if (!inflight) return false;
	inflight.handle.cancel();
	return true;
}
