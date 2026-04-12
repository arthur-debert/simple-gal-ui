import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readConfigFile } from './configIO.js';
import { fetchConfigSchema } from './configSchema.js';
import type {
	ConfigLevelKind,
	ConfigLevelRef,
	LoadedConfigFile,
	ConfigCascade
} from '../src/lib/types/configEditor.js';

/**
 * Walks a gallery home to build a `ConfigCascade` for a target directory.
 *
 * The cascade chain always starts at the root (`home`) and ends at the
 * target. Each step corresponds to one directory level; for each level we
 * try to read a `config.toml` and record whether it existed, its raw text,
 * the parsed object, and the flattened leaf-key set.
 *
 * Level kind is detected from directory contents:
 *   - root:  `dirPath === home`
 *   - album: the directory contains at least one image file
 *   - group: the directory contains at least one subdirectory but no images
 *
 * Unnumbered albums (the "wip-drafts" case in the fixture) still classify
 * as `album` because the file content is what matters, not the prefix.
 */

const IMAGE_EXTS = new Set([
	'.jpg',
	'.jpeg',
	'.png',
	'.avif',
	'.webp',
	'.gif',
	'.tif',
	'.tiff',
	'.heic'
]);

async function detectLevelKind(absDir: string, home: string): Promise<ConfigLevelKind> {
	if (path.resolve(absDir) === path.resolve(home)) return 'root';

	let hasImage = false;
	let hasSubdir = false;
	let entries: import('node:fs').Dirent[];
	try {
		entries = await fs.readdir(absDir, { withFileTypes: true });
	} catch {
		return 'group';
	}
	for (const e of entries) {
		if (e.isFile()) {
			const ext = path.extname(e.name).toLowerCase();
			if (IMAGE_EXTS.has(ext)) {
				hasImage = true;
				break;
			}
		} else if (e.isDirectory()) {
			hasSubdir = true;
		}
	}
	if (hasImage) return 'album';
	if (hasSubdir) return 'group';
	// Empty-ish directory — treat as group (can still own a config.toml that
	// cascades to future children).
	return 'group';
}

function buildLevelRef(home: string, absDir: string, kind: ConfigLevelKind): ConfigLevelRef {
	const rel = path.relative(home, absDir);
	const relPath = rel === '' ? '' : rel.split(path.sep).join('/');
	const segments = relPath === '' ? [] : relPath.split('/');
	// Strip NNN- numeric prefix when building a human label, and render the
	// full trail as 'Travel / Japan' so the UI can print it as-is.
	const labelSegments = segments.map((s) => s.replace(/^\d+-/, ''));
	const label = relPath === '' ? 'root' : labelSegments.join(' / ');
	return {
		kind,
		dirPath: absDir,
		relPath,
		label,
		configTomlPath: path.join(absDir, 'config.toml')
	};
}

async function loadLevel(home: string, absDir: string): Promise<LoadedConfigFile> {
	const kind = await detectLevelKind(absDir, home);
	const level = buildLevelRef(home, absDir, kind);
	const fileResult = await readConfigFile(level.configTomlPath);
	return {
		level,
		exists: fileResult.exists,
		raw: fileResult.raw,
		parsed: fileResult.parsed,
		loadedKeys: fileResult.loadedKeys
	};
}

export interface LoadCascadeArgs {
	home: string;
	dirPath: string; // absolute target directory, must be inside home
}

export type LoadCascadeResult = { ok: true; cascade: ConfigCascade } | { ok: false; error: string };

/**
 * Build the full cascade chain for `dirPath`. Spawns the schema fetch on
 * first call (or cache hit thereafter). Rejects any `dirPath` that isn't
 * inside `home`.
 */
export async function loadCascade(args: LoadCascadeArgs): Promise<LoadCascadeResult> {
	const home = path.resolve(args.home);
	const target = path.resolve(args.dirPath);

	const rel = path.relative(home, target);
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		return { ok: false, error: `dirPath ${target} is not inside home ${home}` };
	}

	const schemaResult = await fetchConfigSchema();
	if (!schemaResult.ok) {
		return { ok: false, error: schemaResult.error };
	}

	// Build the list of directories from root to target. `path.relative`
	// gives us 'Travel/Japan' — split on the OS separator (already handled
	// by path.relative) to stage each intermediate level.
	const segments = rel === '' ? [] : rel.split(path.sep);
	const dirs: string[] = [home];
	for (let i = 0; i < segments.length; i++) {
		dirs.push(path.join(home, ...segments.slice(0, i + 1)));
	}

	const chain: LoadedConfigFile[] = [];
	for (const d of dirs) {
		try {
			chain.push(await loadLevel(home, d));
		} catch (err) {
			return {
				ok: false,
				error: `failed to load ${path.join(d, 'config.toml')}: ${(err as Error).message}`
			};
		}
	}

	return {
		ok: true,
		cascade: {
			schema: schemaResult.schema,
			target: chain[chain.length - 1].level,
			chain
		}
	};
}
