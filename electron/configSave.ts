import { promises as fs } from 'node:fs';
import path from 'node:path';
import TOML from '@iarna/toml';
import { runSimpleGal } from './simpleGal.js';
import { markSelfWrite } from './fs.js';

/**
 * Save a config.toml file for a given level, then run `simple-gal check`
 * against the whole gallery home to validate the write. On failure, the
 * previous file is restored so the on-disk state never diverges from a
 * known-good configuration.
 *
 * The caller is responsible for sparse semantics: `payload` should contain
 * ONLY the keys that belong in the target level's file. A `null` payload
 * means "delete the file if it exists" — the level falls back to
 * inheriting everything.
 *
 * Validation flow:
 *  1. Snapshot the existing file (if any) into memory.
 *  2. Write the new contents (or delete the file for a null payload).
 *  3. Run `simple-gal check --source <home> --format json`.
 *  4. If check fails, roll back to the snapshot and return the error.
 */

export interface SaveConfigArgs {
	home: string;
	dirPath: string;
	payload: Record<string, unknown> | null;
}

export interface SaveConfigOk {
	ok: true;
	written: boolean;
	deleted: boolean;
}

export interface SaveConfigErr {
	ok: false;
	error: string;
	configError?: {
		path: string;
		line?: number;
		column?: number;
		snippet?: string;
	};
}

export type SaveConfigResult = SaveConfigOk | SaveConfigErr;

async function readSnapshot(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
		throw err;
	}
}

async function restoreSnapshot(filePath: string, snapshot: string | null): Promise<void> {
	if (snapshot === null) {
		try {
			await fs.unlink(filePath);
		} catch {
			// ignore
		}
		return;
	}
	await fs.writeFile(filePath, snapshot, 'utf8');
}

export async function saveConfig(args: SaveConfigArgs): Promise<SaveConfigResult> {
	const { home, dirPath, payload } = args;
	const configPath = path.join(dirPath, 'config.toml');

	let snapshot: string | null;
	try {
		snapshot = await readSnapshot(configPath);
	} catch (err) {
		return { ok: false, error: `failed to read ${configPath}: ${(err as Error).message}` };
	}

	// Suppress watcher events for the writes we're about to do.
	markSelfWrite(configPath);

	try {
		if (payload === null || Object.keys(payload).length === 0) {
			if (snapshot !== null) {
				await fs.unlink(configPath);
			}
		} else {
			const toml = TOML.stringify(payload as TOML.JsonMap);
			await fs.mkdir(path.dirname(configPath), { recursive: true });
			await fs.writeFile(configPath, toml, 'utf8');
		}
	} catch (err) {
		// Writing the file itself failed — attempt to restore and bail.
		try {
			markSelfWrite(configPath);
			await restoreSnapshot(configPath, snapshot);
		} catch {
			// ignore rollback errors
		}
		return { ok: false, error: `failed to write ${configPath}: ${(err as Error).message}` };
	}

	// Validate via simple-gal check. If the schema rejects the combination
	// (e.g. a color with the wrong format), we roll back.
	const check = await runSimpleGal('check', { source: home });
	if (!check.ok) {
		try {
			markSelfWrite(configPath);
			await restoreSnapshot(configPath, snapshot);
		} catch {
			// ignore rollback errors
		}
		return {
			ok: false,
			error: check.message,
			configError: check.config
		};
	}

	return {
		ok: true,
		written: payload !== null && Object.keys(payload ?? {}).length > 0,
		deleted: payload === null || Object.keys(payload ?? {}).length === 0
	};
}
