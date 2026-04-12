import { spawn, type ChildProcess } from 'node:child_process';
import { resolveSimpleGalBin } from './binPath.js';

/**
 * JSON envelope contract for simple-gal --format json.
 *
 * Success: a single document on stdout.
 * Failure: a single document on stderr. Exit codes map to error kinds
 *   (see simple-gal/src/json_output.rs).
 */

export interface SimpleGalOk<TData = unknown> {
	ok: true;
	command: string;
	data: TData;
}

export interface SimpleGalConfigError {
	path: string;
	line?: number;
	column?: number;
	snippet?: string;
}

export interface SimpleGalErr {
	ok: false;
	kind: string;
	message: string;
	causes?: string[];
	config?: SimpleGalConfigError;
}

export type SimpleGalResult<TData = unknown> = SimpleGalOk<TData> | SimpleGalErr;

export interface RunOptions {
	source?: string;
	output?: string;
	tempDir?: string;
	extraArgs?: string[];
	cwd?: string;
}

function buildArgs(command: string, opts: RunOptions): string[] {
	const args: string[] = [];
	if (opts.source) args.push('--source', opts.source);
	if (opts.output) args.push('--output', opts.output);
	if (opts.tempDir) args.push('--temp-dir', opts.tempDir);
	args.push('--format', 'json');
	args.push(command);
	if (opts.extraArgs) args.push(...opts.extraArgs);
	return args;
}

/**
 * A handle returned by `spawnSimpleGal`. The Promise resolves to the parsed
 * JSON envelope once the child exits. Callers can call `cancel()` to SIGTERM
 * (and after a grace period, SIGKILL) the child, which resolves the Promise
 * with a synthetic `{kind: 'cancelled'}` envelope.
 */
export interface SimpleGalHandle<TData = unknown> {
	result: Promise<SimpleGalResult<TData>>;
	cancel: () => void;
	child: ChildProcess;
}

/**
 * Run a simple-gal subcommand and return a parsed JSON envelope. Convenience
 * wrapper around `spawnSimpleGal` for call sites that don't need cancel
 * support.
 */
export async function runSimpleGal<TData = unknown>(
	command: string,
	opts: RunOptions = {}
): Promise<SimpleGalResult<TData>> {
	return spawnSimpleGal<TData>(command, opts).result;
}

/**
 * Spawn a simple-gal subprocess and return a cancellable handle.
 *
 * On non-zero exit, stderr is parsed as a JSON error envelope; if parsing
 * fails, a synthetic error envelope is returned. On cancel, the child
 * receives SIGTERM and (if still alive after 2s) SIGKILL.
 */
export function spawnSimpleGal<TData = unknown>(
	command: string,
	opts: RunOptions = {}
): SimpleGalHandle<TData> {
	const bin = resolveSimpleGalBin();
	const args = buildArgs(command, opts);

	let cancelled = false;
	let killTimer: NodeJS.Timeout | null = null;

	const child = spawn(bin, args, {
		cwd: opts.cwd,
		stdio: ['ignore', 'pipe', 'pipe']
	});

	let stdout = '';
	let stderr = '';
	child.stdout?.on('data', (buf) => {
		stdout += buf.toString();
	});
	child.stderr?.on('data', (buf) => {
		stderr += buf.toString();
	});

	const result = new Promise<SimpleGalResult<TData>>((resolve) => {
		child.on('error', (err) => {
			if (killTimer) clearTimeout(killTimer);
			resolve({
				ok: false,
				kind: 'spawn_error',
				message: err.message
			});
		});
		child.on('close', (code) => {
			if (killTimer) clearTimeout(killTimer);
			if (cancelled) {
				resolve({
					ok: false,
					kind: 'cancelled',
					message: 'Build was cancelled'
				});
				return;
			}
			if (code === 0) {
				try {
					resolve(JSON.parse(stdout) as SimpleGalOk<TData>);
					return;
				} catch (err) {
					resolve({
						ok: false,
						kind: 'parse_error',
						message: (err as Error).message,
						causes: [stdout.slice(0, 400)]
					});
					return;
				}
			}
			// Non-zero exit: try to parse the error envelope from stderr
			if (stderr.trim().startsWith('{')) {
				try {
					resolve(JSON.parse(stderr) as SimpleGalErr);
					return;
				} catch {
					// fall through
				}
			}
			resolve({
				ok: false,
				kind: 'spawn_error',
				message: `simple-gal exited with code ${code}`,
				causes: stderr ? [stderr] : undefined
			});
		});
	});

	function cancel(): void {
		if (cancelled || child.exitCode !== null) return;
		cancelled = true;
		try {
			child.kill('SIGTERM');
		} catch {
			// ignore
		}
		killTimer = setTimeout(() => {
			if (child.exitCode === null) {
				try {
					child.kill('SIGKILL');
				} catch {
					// ignore
				}
			}
		}, 2000);
	}

	return { result, cancel, child };
}

// --- Typed accessors for known commands ----------------------------------

export interface ManifestImage {
	number: number;
	source_path: string;
	filename: string;
	slug: string;
	title?: string;
	description?: string;
}

export interface ManifestNavItem {
	title: string;
	path: string;
	source_dir: string;
}

export interface ManifestPage {
	title: string;
	link_title: string;
	slug: string;
	body: string;
	in_nav: boolean;
	sort_key: number;
	is_link: boolean;
	url?: string;
}

export type ResolvedConfig = Record<string, unknown>;

export interface ManifestAlbum {
	path: string;
	title: string;
	preview_image?: string;
	images: ManifestImage[];
	in_nav: boolean;
	config: ResolvedConfig;
	description?: string;
}

export interface ManifestGroup {
	path: string;
	title: string;
	in_nav: boolean;
	config: ResolvedConfig;
	description?: string;
}

export interface Manifest {
	navigation: ManifestNavItem[];
	albums: ManifestAlbum[];
	pages: ManifestPage[];
	groups?: ManifestGroup[];
	config: ResolvedConfig;
}

export interface ScanCounts {
	albums: number;
	images: number;
	pages: number;
}

export interface ScanData {
	source: string;
	counts: ScanCounts;
	manifest: Manifest;
}

export function scan(source: string): Promise<SimpleGalResult<ScanData>> {
	return runSimpleGal<ScanData>('scan', { source });
}
