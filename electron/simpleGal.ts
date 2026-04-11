import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveSimpleGalBin } from './binPath.js';

const execFileAsync = promisify(execFile);

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
 * Run a simple-gal subcommand and return a parsed JSON envelope.
 *
 * On non-zero exit, stderr is parsed as a JSON error envelope; if parsing
 * fails, a synthetic error envelope is returned.
 */
export async function runSimpleGal<TData = unknown>(
	command: string,
	opts: RunOptions = {}
): Promise<SimpleGalResult<TData>> {
	const bin = resolveSimpleGalBin();
	const args = buildArgs(command, opts);

	try {
		const { stdout } = await execFileAsync(bin, args, {
			cwd: opts.cwd,
			maxBuffer: 64 * 1024 * 1024
		});
		return JSON.parse(stdout) as SimpleGalOk<TData>;
	} catch (err) {
		const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
		const stderr = e.stderr ?? '';
		if (stderr.trim().startsWith('{')) {
			try {
				return JSON.parse(stderr) as SimpleGalErr;
			} catch {
				// fallthrough to synthetic error
			}
		}
		return {
			ok: false,
			kind: 'spawn_error',
			message: e.message || String(err),
			causes: stderr ? [stderr] : undefined
		};
	}
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
