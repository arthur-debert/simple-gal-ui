import { api } from '$lib/api';
import type { ConfigCascade } from '$lib/types/configEditor';
import type { ConfigSchemaNode, ConfigSchemaRoot } from '$lib/types/configSchema';
import { showToast } from './toastStore.svelte';

/**
 * Store for the active config editor pane.
 *
 * Responsibilities:
 *  - Fetch the schema (cached in main) and the cascade for a target dir.
 *  - Track user edits via `dirtyKeys` (a Set of dotted keys).
 *  - Compute each field's effective value + source by walking the cascade
 *    chain (last-writer-wins in file order: root first, target last) and
 *    falling back to the schema default.
 *
 * The sparse-save rule lives here: on save, a key is written to the
 * target file iff it was already in the target's `loadedKeys` OR the user
 * has touched it this session (`dirtyKeys`). Reset clears both for a key.
 *
 * pr7/3 introduces the store in read-only mode (no save, no dirty). pr7/4
 * adds the save path.
 */

export interface ConfigEditorState {
	loading: boolean;
	cascade: ConfigCascade | null;
	error: string | null;
	dirtyKeys: Set<string>;
	pendingValues: Map<string, unknown>;
}

const state = $state<ConfigEditorState>({
	loading: false,
	cascade: null,
	error: null,
	dirtyKeys: new Set(),
	pendingValues: new Map()
});

export const configEditor = {
	get loading() {
		return state.loading;
	},
	get cascade() {
		return state.cascade;
	},
	get error() {
		return state.error;
	},
	get dirtyKeys() {
		return state.dirtyKeys;
	},
	get pendingValues() {
		return state.pendingValues;
	}
};

export async function openConfigEditor(home: string, dirPath: string): Promise<void> {
	state.loading = true;
	state.error = null;
	state.dirtyKeys = new Set();
	state.pendingValues = new Map();
	try {
		const result = await api.config.loadCascade({ home, dirPath });
		if (result.ok) {
			state.cascade = result.cascade;
		} else {
			state.cascade = null;
			state.error = result.error;
			showToast({ kind: 'error', title: 'Failed to load config', body: result.error });
		}
	} catch (err) {
		state.cascade = null;
		state.error = (err as Error).message;
		showToast({ kind: 'error', title: 'Failed to load config', body: (err as Error).message });
	} finally {
		state.loading = false;
	}
}

export function closeConfigEditor(): void {
	state.cascade = null;
	state.error = null;
	state.dirtyKeys = new Set();
	state.pendingValues = new Map();
}

// ------------------------------------------------------------------
// Cascade resolution helpers
// ------------------------------------------------------------------

export interface EffectiveField {
	key: string; // dotted
	value: unknown;
	source: 'default' | 'local' | string; // string = ancestor label (e.g. 'root', 'Travel')
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getDotted(obj: Record<string, unknown>, dotted: string): unknown {
	const parts = dotted.split('.');
	let cur: unknown = obj;
	for (const p of parts) {
		if (!isPlainObject(cur)) return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

/**
 * Walk the cascade bottom-up (target first, root last) looking for the
 * first level whose parsed object contains `dotted`. If no level has it,
 * fall back to the schema default; if the schema has no default, return
 * undefined and a `source` of `'default'`.
 *
 * The "local" label applies to the target level (last chain entry); every
 * ancestor reports its own human-readable level label.
 */
export function resolveEffective(
	cascade: ConfigCascade,
	dotted: string,
	dirtyKeys: Set<string>,
	pendingValues: Map<string, unknown>
): EffectiveField {
	// User-touched values always win and mark the field as local.
	if (dirtyKeys.has(dotted)) {
		return { key: dotted, value: pendingValues.get(dotted), source: 'local' };
	}

	const chain = cascade.chain;
	for (let i = chain.length - 1; i >= 0; i--) {
		const level = chain[i];
		const v = getDotted(level.parsed, dotted);
		if (v !== undefined) {
			const isTarget = i === chain.length - 1;
			return {
				key: dotted,
				value: v,
				source: isTarget ? 'local' : level.level.label
			};
		}
	}

	// Fall back to the schema default.
	const def = schemaDefault(cascade.schema, dotted);
	return { key: dotted, value: def, source: 'default' };
}

function schemaDefault(schema: ConfigSchemaRoot, dotted: string): unknown {
	const parts = dotted.split('.');
	let node: ConfigSchemaNode | ConfigSchemaRoot = schema;
	for (const p of parts) {
		if (node.type !== 'object' || !node.properties || !(p in node.properties)) {
			return undefined;
		}
		node = node.properties[p];
	}
	return 'default' in node ? node.default : undefined;
}

/**
 * Enumerate every dotted leaf path defined by the schema, in a stable
 * depth-first order. Used by the editor to render one ConfigField per
 * schema leaf, regardless of which levels have the key set.
 */
export function enumerateSchemaLeaves(
	schema: ConfigSchemaRoot
): { key: string; node: ConfigSchemaNode }[] {
	const out: { key: string; node: ConfigSchemaNode }[] = [];
	const walk = (props: Record<string, ConfigSchemaNode>, prefix: string): void => {
		for (const [k, node] of Object.entries(props)) {
			const key = prefix ? `${prefix}.${k}` : k;
			if (node.type === 'object') {
				walk(node.properties, key);
			} else {
				out.push({ key, node });
			}
		}
	};
	walk(schema.properties, '');
	return out;
}
