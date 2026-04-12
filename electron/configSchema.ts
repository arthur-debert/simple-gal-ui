import { runSimpleGal } from './simpleGal.js';
import { resolveSimpleGalBin } from './binPath.js';
import type { ConfigSchemaRoot } from '../src/lib/types/configSchema.js';

/**
 * In-memory cache for the simple-gal config schema. Keyed on the resolved
 * binary path so swapping binaries (dev: setting SIMPLE_GAL_PATH) busts the
 * cache automatically. The schema never changes within a single binary's
 * lifetime, so a single spawn per session is all we need.
 */
interface CacheEntry {
	binPath: string;
	schema: ConfigSchemaRoot;
}

let cached: CacheEntry | null = null;

interface ConfigSchemaPayload {
	action: 'schema';
	schema: ConfigSchemaRoot;
}

export interface FetchSchemaOk {
	ok: true;
	schema: ConfigSchemaRoot;
	binPath: string;
}

export interface FetchSchemaErr {
	ok: false;
	error: string;
}

export type FetchSchemaResult = FetchSchemaOk | FetchSchemaErr;

/**
 * Spawn `simple-gal --format json config schema`, parse the envelope, and
 * cache the nested schema document. Subsequent calls within the same
 * session return the cached value as long as the binary path is unchanged.
 */
export async function fetchConfigSchema(): Promise<FetchSchemaResult> {
	let binPath: string;
	try {
		binPath = resolveSimpleGalBin();
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}

	if (cached && cached.binPath === binPath) {
		return { ok: true, schema: cached.schema, binPath };
	}

	const result = await runSimpleGal<ConfigSchemaPayload>('config', {
		extraArgs: ['schema']
	});

	if (!result.ok) {
		return { ok: false, error: result.message };
	}

	const schema = result.data?.schema;
	if (!schema || schema.type !== 'object' || !schema.properties) {
		return {
			ok: false,
			error: 'simple-gal config schema returned an unexpected payload shape'
		};
	}

	cached = { binPath, schema };
	return { ok: true, schema, binPath };
}

export function clearConfigSchemaCache(): void {
	cached = null;
}
