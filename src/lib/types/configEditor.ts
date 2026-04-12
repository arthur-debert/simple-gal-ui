/**
 * Types consumed by the config editor. The cascade is whatever
 * `electron/configLoader.loadCascade` returns: a chain of per-level
 * `config.toml` files from the root down to (and including) the target
 * level, plus the schema, so the renderer can compute effective values
 * without spawning simple-gal per field.
 *
 * Sets don't survive the structured-clone hop over IPC — `loadedKeys` is
 * carried as a `string[]` on the wire and reconstructed into a `Set` on
 * the renderer side if needed.
 */

import type { ConfigSchemaRoot } from './configSchema';

export type ConfigLevelKind = 'root' | 'group' | 'album';

export interface ConfigLevelRef {
	kind: ConfigLevelKind;
	dirPath: string; // absolute
	relPath: string; // '' for root, 'Travel' for group, 'Travel/Japan' for album
	label: string; // human-readable trail ('root', 'Travel', 'Travel / Japan')
	configTomlPath: string; // absolute path to the level's config.toml (may not exist)
}

export interface LoadedConfigFile {
	level: ConfigLevelRef;
	exists: boolean;
	raw: string | null; // full text of the config.toml, null if absent
	parsed: Record<string, unknown>; // parsed TOML (empty object if absent)
	loadedKeys: string[]; // flattened dotted leaf paths present in `parsed`
}

export interface ConfigCascade {
	schema: ConfigSchemaRoot;
	target: ConfigLevelRef;
	/** Ordered chain: [root, group?, ..., target]. The last entry is always the target level. */
	chain: LoadedConfigFile[];
}
