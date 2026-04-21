import path from 'node:path';
import { runSimpleGal } from './simpleGal.js';
import { markSelfWrite } from './fs.js';

/**
 * JSON envelope data shape returned by `simple-gal reindex --format json`.
 *
 * Mirrors the rust-side `ReindexData` struct. Kept loose (unknown fields
 * tolerated) so a future simple-gal release adding fields doesn't break
 * the UI.
 */
export interface ReindexRename {
	from: string;
	to: string;
}

export interface ReindexPerDirectory {
	/** Echoed back from simple-gal — same form as the `--source` arg. */
	dir: string;
	applied: boolean;
	renames: ReindexRename[];
}

export interface ReindexData {
	dry_run: boolean;
	spacing: number;
	padding: number;
	per_directory: ReindexPerDirectory[];
	totals: {
		directories_scanned: number;
		directories_with_changes: number;
		total_renames: number;
	};
}

export interface ReindexArgs {
	home: string;
	/** Optional path relative to `home` to reindex just a subtree. Defaults to the whole home. */
	targetPath?: string;
	spacing?: number;
	padding?: number;
	/** Don't recurse into numbered subdirectories. */
	flat?: boolean;
	/** When true, the CLI runs in plan-only mode (`--dry-run`). */
	dryRun: boolean;
}

export interface ReindexOk {
	ok: true;
	data: ReindexData;
	/**
	 * Flat map of every rename expressed in home-relative, forward-slash paths
	 * (the same shape as `ManifestImage.source_path`). Keys are pre-reindex
	 * paths; values are post-reindex paths with ancestor directory renames
	 * already composed in.
	 *
	 * The renderer uses this to re-pin an open photo's selection when its
	 * filename gets renumbered under it, without having to walk the per-
	 * directory tree itself.
	 */
	renameMap: Record<string, string>;
}

export interface ReindexErr {
	ok: false;
	kind: string;
	message: string;
}

export type ReindexResult = ReindexOk | ReindexErr;

/**
 * Convert a `per_directory.dir` string (which simple-gal echoes back in the
 * same form as `--source`) into a forward-slash path relative to `home`.
 * Returns `""` for the home root.
 */
function relativizeDir(home: string, dir: string): string {
	const normalized = path.isAbsolute(dir) ? path.relative(home, dir) : dir;
	if (normalized === '.') return '';
	// Strip a leading "./" or ".\\" if the walker emitted it, and normalize
	// mixed slash directions to forward slashes so we match manifest
	// source_paths.
	return normalized.replace(/^\.[/\\]/, '').replace(/[/\\]+/g, '/');
}

/**
 * Compose ancestor directory renames with per-entry renames into a single
 * flat `old → new` map, both sides home-relative. The walker emits parent
 * directories before their children, but each child entry still refers to
 * the child by its pre-reindex parent path; to get the post-reindex path
 * we have to apply every ancestor rename recorded elsewhere in the envelope.
 */
function buildRenameMap(home: string, data: ReindexData): Record<string, string> {
	// A rename entry describes a directory iff there's a `per_directory` row
	// whose `dir` equals `<parentRel>/<from>`. Collect the scanned dirs first,
	// then tag matching renames as dir renames so we can chain them later.
	const scannedDirs = new Set<string>();
	for (const perDir of data.per_directory) {
		scannedDirs.add(relativizeDir(home, perDir.dir));
	}
	const dirRenames = new Map<string, string>();
	for (const perDir of data.per_directory) {
		const parentRel = relativizeDir(home, perDir.dir);
		for (const r of perDir.renames) {
			const pre = parentRel ? `${parentRel}/${r.from}` : r.from;
			if (scannedDirs.has(pre)) {
				const post = parentRel ? `${parentRel}/${r.to}` : r.to;
				dirRenames.set(pre, post);
			}
		}
	}

	/**
	 * Resolve a path by walking its components, applying any matching dir
	 * rename at each prefix. Returns the final post-reindex path.
	 */
	function applyDirRenames(p: string): string {
		const parts = p.split('/');
		const out: string[] = [];
		for (let i = 0; i < parts.length; i++) {
			out.push(parts[i]);
			const joined = out.join('/');
			const renamed = dirRenames.get(joined);
			if (renamed) {
				// Replace the accumulated prefix with the renamed one. The `renamed`
				// value is already a full path (parent included), so reset `out` to
				// its parts.
				out.length = 0;
				out.push(...renamed.split('/'));
			}
		}
		return out.join('/');
	}

	const map: Record<string, string> = {};
	for (const perDir of data.per_directory) {
		const parentRel = relativizeDir(home, perDir.dir);
		for (const r of perDir.renames) {
			const pre = parentRel ? `${parentRel}/${r.from}` : r.from;
			// The post-path: apply ancestor dir renames to `parentRel`, then
			// append the renamed basename.
			const parentPost = parentRel ? applyDirRenames(parentRel) : '';
			const post = parentPost ? `${parentPost}/${r.to}` : r.to;
			map[pre] = post;
		}
	}
	return map;
}

function buildExtraArgs(args: ReindexArgs, forceDryRun: boolean): string[] {
	const extraArgs: string[] = [];
	if (args.targetPath) extraArgs.push(args.targetPath);
	if (typeof args.spacing === 'number') extraArgs.push('--spacing', String(args.spacing));
	if (typeof args.padding === 'number') extraArgs.push('--padding', String(args.padding));
	if (args.flat) extraArgs.push('--flat');
	if (forceDryRun || args.dryRun) extraArgs.push('--dry-run');
	else extraArgs.push('--yes');
	return extraArgs;
}

/**
 * Run `simple-gal reindex` with JSON output.
 *
 * For apply (`dryRun: false`) we always run a dry-run first to capture the
 * rename plan against the *pre-apply* filesystem, then apply. This matters
 * because simple-gal renames parent directories in place before descending
 * into their children — after the walker finishes, inner `per_directory`
 * entries refer to directories by their *new* names. The UI holds paths
 * keyed on the pre-apply shape (image `source_path`, album `source_dir`),
 * so a pre-apply snapshot is the only reliable way to build the
 * old→new rename map the renderer needs for selection re-pinning.
 */
export async function reindex(args: ReindexArgs): Promise<ReindexResult> {
	// `dryData` is always the pre-apply snapshot and is the only reliable
	// input for the rename map (see comment above — inner `per_directory`
	// entries on the apply envelope use post-rename names).
	const dryEnvelope = await runSimpleGal<ReindexData>('reindex', {
		source: args.home,
		extraArgs: buildExtraArgs(args, true)
	});
	if (!dryEnvelope.ok) return { ok: false, kind: dryEnvelope.kind, message: dryEnvelope.message };
	const dryData = dryEnvelope.data;
	const renameMap = buildRenameMap(args.home, dryData);

	if (args.dryRun) {
		return { ok: true, data: dryData, renameMap };
	}

	const applyEnvelope = await runSimpleGal<ReindexData>('reindex', {
		source: args.home,
		extraArgs: buildExtraArgs(args, false)
	});
	if (!applyEnvelope.ok)
		return { ok: false, kind: applyEnvelope.kind, message: applyEnvelope.message };

	// Mark every rename as a self-write so the chokidar watcher doesn't
	// stampede us with a rescan+rebuild storm for renames we triggered.
	for (const [from, to] of Object.entries(renameMap)) {
		markSelfWrite(path.join(args.home, from));
		markSelfWrite(path.join(args.home, to));
	}

	// Return the apply envelope unchanged so callers see the true `applied`
	// flags and post-rename directory names. The rename map is always
	// keyed on pre-apply paths, regardless of whether it was a dry-run.
	return { ok: true, data: applyEnvelope.data, renameMap };
}
