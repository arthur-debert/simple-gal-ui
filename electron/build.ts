import { spawn, type ChildProcess } from 'node:child_process';
import { resolveSimpleGalBin } from './binPath.js';
import type { SimpleGalResult, SimpleGalErr } from './simpleGal.js';
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

export interface BuildProgress {
	percent: number;
	stage: string;
	images_done: number;
	images_total: number;
	variants_done: number;
	variants_total: number;
}

let inflight: {
	promise: Promise<BuildRunResult>;
	child: ChildProcess;
	cancelled: boolean;
	/** Timer ID for the deferred SIGKILL escalation set by cancelBuild(). */
	killTimer: NodeJS.Timeout | null;
} | null = null;

/**
 * Run `simple-gal build --format progress` on `home`, streaming NDJSON
 * progress lines to `onProgress` and resolving with the final result.
 */
export function build(
	home: string,
	onProgress?: (p: BuildProgress) => void
): Promise<BuildRunResult> {
	if (inflight) return inflight.promise;
	const { dist, temp } = workPathsForHome(home);
	const started = Date.now();

	const bin = resolveSimpleGalBin();
	const args = [
		'--source',
		home,
		'--output',
		dist,
		'--temp-dir',
		temp,
		'--format',
		'progress',
		'build'
	];

	const child = spawn(bin, args, {
		stdio: ['ignore', 'pipe', 'pipe']
	});

	let stderr = '';
	let resultEnvelope: SimpleGalResult<BuildData> | null = null;
	let lineBuf = '';

	child.stdout?.on('data', (buf: Buffer) => {
		lineBuf += buf.toString();
		let newlineIdx: number;
		while ((newlineIdx = lineBuf.indexOf('\n')) !== -1) {
			const line = lineBuf.slice(0, newlineIdx).trim();
			lineBuf = lineBuf.slice(newlineIdx + 1);
			if (!line) continue;
			try {
				const parsed = JSON.parse(line);
				if (parsed.type === 'progress' && onProgress) {
					onProgress({
						percent: parsed.percent ?? 0,
						stage: parsed.stage ?? '',
						images_done: parsed.images_done ?? 0,
						images_total: parsed.images_total ?? 0,
						variants_done: parsed.variants_done ?? 0,
						variants_total: parsed.variants_total ?? 0
					});
				} else if (parsed.type === 'result') {
					// The result line wraps the standard SimpleGalResult envelope
					// with an extra "type" discriminator — just ignore it.
					delete parsed.type;
					resultEnvelope = parsed as SimpleGalResult<BuildData>;
				}
			} catch {
				// Ignore unparseable lines
			}
		}
	});

	child.stderr?.on('data', (buf: Buffer) => {
		stderr += buf.toString();
	});

	const promise = new Promise<BuildRunResult>((resolve) => {
		child.on('error', (err) => {
			// Capture and clear the deferred SIGKILL timer before nullifying inflight,
			// so a timer started by cancelBuild() is always cancelled on spawn failure.
			const killTimer = inflight?.killTimer ?? null;
			if (killTimer) clearTimeout(killTimer);
			inflight = null;
			resolve({
				ok: false,
				distPath: dist,
				tempPath: temp,
				durationMs: Date.now() - started,
				envelope: { ok: false, kind: 'spawn_error', message: err.message }
			});
		});

		child.on('close', (code) => {
			// Capture both the kill timer and the cancellation flag before nullifying
			// inflight, so we reliably observe the state that cancelBuild() set.
			const killTimer = inflight?.killTimer ?? null;
			if (killTimer) clearTimeout(killTimer);

			// cancelBuild() sets inflight.cancelled (the module-level object), not any
			// local variable, so we must read it here while inflight is still set.
			const wasCancelled = inflight?.cancelled ?? false;
			inflight = null;

			const durationMs = Date.now() - started;

			if (wasCancelled) {
				// The build was explicitly cancelled via cancelBuild(); resolve with the
				// dedicated 'cancelled' envelope instead of falling through to generic
				// exit-code error handling.
				resolve({
					ok: false,
					distPath: dist,
					tempPath: temp,
					durationMs,
					envelope: { ok: false, kind: 'cancelled', message: 'Build was cancelled' }
				});
				return;
			}

			// If we got a result envelope from the NDJSON stream, use it
			if (resultEnvelope) {
				resolve({
					ok: resultEnvelope.ok,
					distPath: dist,
					tempPath: temp,
					durationMs,
					envelope: resultEnvelope
				});
				return;
			}

			// Fallback: try to parse stderr as an error envelope
			if (code !== 0 && stderr.trim().startsWith('{')) {
				try {
					const errEnvelope = JSON.parse(stderr) as SimpleGalErr;
					resolve({
						ok: false,
						distPath: dist,
						tempPath: temp,
						durationMs,
						envelope: errEnvelope
					});
					return;
				} catch {
					// fall through
				}
			}

			resolve({
				ok: false,
				distPath: dist,
				tempPath: temp,
				durationMs,
				envelope: {
					ok: false,
					kind: 'spawn_error',
					message: `simple-gal exited with code ${code}`,
					causes: stderr ? [stderr] : undefined
				}
			});
		});
	});

	inflight = { promise, child, cancelled: false, killTimer: null };
	return promise;
}

/**
 * Cancel the currently in-flight build (if any). The pending `build()`
 * Promise resolves with a `{kind: 'cancelled'}` envelope.
 */
export function cancelBuild(): boolean {
	if (!inflight) return false;
	if (inflight.cancelled || inflight.child.exitCode !== null) return false;
	inflight.cancelled = true;
	try {
		inflight.child.kill('SIGTERM');
	} catch {
		// ignore
	}
	// If the process does not exit after SIGTERM, escalate to SIGKILL after a
	// short grace period.  We store the timer ID on inflight so the close/error
	// handlers can cancel it if the process exits on its own beforehand.
	inflight.killTimer = setTimeout(() => {
		if (inflight?.child.exitCode === null) {
			try {
				inflight.child.kill('SIGKILL');
			} catch {
				// ignore
			}
		}
	}, 2000);
	return true;
}
