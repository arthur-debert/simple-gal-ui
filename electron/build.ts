import { runSimpleGal, type SimpleGalResult } from './simpleGal.js';
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

let inflight: Promise<BuildRunResult> | null = null;

/**
 * Run `simple-gal build` on `home` into a stable per-home tmp dir.
 *
 * Concurrent builds are coalesced: a second caller during an in-flight build
 * gets the same Promise, so rapid change bursts don't stack up builds.
 */
export function build(home: string): Promise<BuildRunResult> {
	if (inflight) return inflight;
	inflight = runBuild(home).finally(() => {
		inflight = null;
	});
	return inflight;
}

async function runBuild(home: string): Promise<BuildRunResult> {
	const { dist, temp } = workPathsForHome(home);
	const started = Date.now();
	const envelope = await runSimpleGal<BuildData>('build', {
		source: home,
		output: dist,
		tempDir: temp
	});
	return {
		ok: envelope.ok,
		distPath: dist,
		tempPath: temp,
		durationMs: Date.now() - started,
		envelope
	};
}
