import { promises as fs } from 'node:fs';
import path from 'node:path';
import TOML from '@iarna/toml';

/**
 * TOML I/O helpers for `config.toml` files. All operations are on plain
 * JS objects; serialization happens at the edge (`writeConfigFile`).
 *
 * The sparse-save semantics are enforced upstream in the save handler —
 * this module just gives you primitives for reading a file, flattening
 * its leaf keys for presence tracking, and reassembling a nested object
 * from a flat set of dotted keys + values.
 */

/**
 * Parse a TOML file at `absPath`. Returns `{exists:false}` if the file is
 * missing; any other error (unreadable, invalid UTF-8, parse failure) is
 * thrown so the caller can surface it with context.
 */
export interface ReadConfigFileResult {
	exists: boolean;
	raw: string | null;
	parsed: Record<string, unknown>;
	loadedKeys: string[];
}

export async function readConfigFile(absPath: string): Promise<ReadConfigFileResult> {
	let raw: string;
	try {
		raw = await fs.readFile(absPath, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return { exists: false, raw: null, parsed: {}, loadedKeys: [] };
		}
		throw err;
	}
	const parsed = TOML.parse(raw) as Record<string, unknown>;
	return { exists: true, raw, parsed, loadedKeys: flattenDottedKeys(parsed) };
}

/**
 * Flatten a nested TOML object into an array of dotted leaf paths. Arrays
 * are treated as leaves (they're set as a whole in the UI) — we don't
 * recurse into their elements.
 */
export function flattenDottedKeys(obj: Record<string, unknown>, prefix = ''): string[] {
	const out: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (isPlainObject(v)) {
			out.push(...flattenDottedKeys(v as Record<string, unknown>, key));
		} else {
			out.push(key);
		}
	}
	return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Read a dotted key from a nested object. Returns `undefined` when any
 * segment along the path is absent.
 */
export function getDotted(obj: Record<string, unknown>, dottedKey: string): unknown {
	const parts = dottedKey.split('.');
	let cur: unknown = obj;
	for (const p of parts) {
		if (!isPlainObject(cur)) return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

/**
 * Set a dotted key on a nested object, creating intermediate objects as
 * needed. Mutates and returns the passed-in object for convenience.
 */
export function setDotted(
	obj: Record<string, unknown>,
	dottedKey: string,
	value: unknown
): Record<string, unknown> {
	const parts = dottedKey.split('.');
	let cur: Record<string, unknown> = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		const next = cur[p];
		if (!isPlainObject(next)) {
			cur[p] = {};
		}
		cur = cur[p] as Record<string, unknown>;
	}
	cur[parts[parts.length - 1]] = value;
	return obj;
}

/**
 * Remove a dotted key from a nested object. Also prunes any intermediate
 * tables that become empty as a result, so `colors.light.background = X`
 * followed by `unset colors.light.background` returns the object to its
 * original shape (no orphan `[colors.light]` / `[colors]` sections).
 */
export function unsetDotted(obj: Record<string, unknown>, dottedKey: string): void {
	const parts = dottedKey.split('.');
	const trail: Record<string, unknown>[] = [obj];
	let cur: Record<string, unknown> = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const next = cur[parts[i]];
		if (!isPlainObject(next)) return;
		cur = next as Record<string, unknown>;
		trail.push(cur);
	}
	delete cur[parts[parts.length - 1]];
	for (let i = trail.length - 1; i > 0; i--) {
		if (Object.keys(trail[i]).length === 0) {
			const parent = trail[i - 1];
			const keyInParent = parts[i - 1];
			delete parent[keyInParent];
		} else {
			break;
		}
	}
}

/**
 * Serialize an object to TOML and write atomically. Writes `<path>.tmp`
 * first, then renames. The caller should call `markSelfWrite` on `absPath`
 * *before* invoking this so the chokidar suppression window is active
 * when fs.rename fires the event.
 */
export async function writeConfigFileAtomic(
	absPath: string,
	payload: Record<string, unknown>
): Promise<{ writtenBytes: number }> {
	const toml =
		payload && Object.keys(payload).length > 0 ? TOML.stringify(payload as TOML.JsonMap) : '';
	await fs.mkdir(path.dirname(absPath), { recursive: true });
	const tmp = absPath + '.tmp';
	await fs.writeFile(tmp, toml, 'utf8');
	await fs.rename(tmp, absPath);
	return { writtenBytes: Buffer.byteLength(toml, 'utf8') };
}

export async function deleteConfigFileIfEmpty(absPath: string): Promise<boolean> {
	try {
		const raw = await fs.readFile(absPath, 'utf8');
		if (raw.trim() === '') {
			await fs.unlink(absPath);
			return true;
		}
	} catch {
		// absent or unreadable — nothing to do
	}
	return false;
}
