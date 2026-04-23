import { api } from '$lib/api';
import type { ConfigCascade } from '$lib/types/configEditor';
import type { ConfigSchemaNode, ConfigSchemaRoot } from '$lib/types/configSchema';
import type { Selection } from '$lib/types/manifest';
import { showToast } from './toastStore.svelte';
import { site } from './siteStore.svelte';

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
	saving: boolean;
	cascade: ConfigCascade | null;
	error: string | null;
	/** Keys the user has typed into this session. Their values live in
	 *  `pendingValues`. A key stays dirty even if the user reverts it to the
	 *  effective value — the intent was explicit. */
	dirtyKeys: Set<string>;
	/** Keys the user has explicitly reset via the "inherit from parent" button.
	 *  These must be stripped from the target level's file on save, even if
	 *  they were in `loadedKeys`. Reapplying a touch clears this flag. */
	resetKeys: Set<string>;
	pendingValues: Map<string, unknown>;
	/** Set when the user tries to navigate away with unsaved edits. The modal
	 *  reads this to know where to go after Save/Discard. */
	leaveTarget: Selection | null;
}

const state = $state<ConfigEditorState>({
	loading: false,
	saving: false,
	cascade: null,
	error: null,
	dirtyKeys: new Set(),
	resetKeys: new Set(),
	pendingValues: new Map(),
	leaveTarget: null
});

export const configEditor = {
	get loading() {
		return state.loading;
	},
	get saving() {
		return state.saving;
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
	get resetKeys() {
		return state.resetKeys;
	},
	get pendingValues() {
		return state.pendingValues;
	},
	get hasUnsaved() {
		return state.dirtyKeys.size > 0 || state.resetKeys.size > 0;
	},
	get leaveTarget() {
		return state.leaveTarget;
	},
	/** Keys the user has changed this session (touched or reset). Used by the
	 *  unsaved-changes modal to show the user exactly what's at stake. */
	get changedKeys(): string[] {
		const all = new Set<string>();
		for (const k of state.dirtyKeys) all.add(k);
		for (const k of state.resetKeys) all.add(k);
		return [...all].sort();
	}
};

export async function openConfigEditor(home: string, dirPath: string): Promise<void> {
	state.loading = true;
	state.error = null;
	state.dirtyKeys = new Set();
	state.resetKeys = new Set();
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
	state.resetKeys = new Set();
	state.pendingValues = new Map();
}

/**
 * Request to leave the config editor for `next`. If there are unsaved
 * edits, open the confirm modal (the caller's navigation is parked in
 * `leaveTarget` until the user chooses). Otherwise navigate immediately.
 *
 * Callers that might fire while NOT editing config should still go
 * through here — the guard is a no-op when no config is active.
 */
export function requestLeaveConfig(next: Selection): void {
	const current = site.selection;
	if (current.kind !== 'config' || !configEditor.hasUnsaved) {
		site.selection = next;
		return;
	}
	state.leaveTarget = next;
}

export function cancelLeaveConfig(): void {
	state.leaveTarget = null;
}

export function discardLeaveConfig(): void {
	const next = state.leaveTarget;
	state.leaveTarget = null;
	state.dirtyKeys = new Set();
	state.resetKeys = new Set();
	state.pendingValues = new Map();
	if (next) site.selection = next;
}

export async function saveAndLeaveConfig(): Promise<void> {
	const next = state.leaveTarget;
	const ok = await saveConfig();
	if (!ok) return; // keep the modal open on failure
	state.leaveTarget = null;
	if (next) site.selection = next;
}

/**
 * Mark a field as edited with the given value. The key becomes `local`
 * for effective-value resolution and is guaranteed to end up in the saved
 * file on the next save.
 */
export function touchField(dotted: string, value: unknown): void {
	const next = new Set(state.dirtyKeys);
	next.add(dotted);
	state.dirtyKeys = next;
	const resetNext = new Set(state.resetKeys);
	if (resetNext.delete(dotted)) {
		state.resetKeys = resetNext;
	}
	const values = new Map(state.pendingValues);
	values.set(dotted, value);
	state.pendingValues = values;
}

/**
 * Reset a field to its inherited value. Forgets any pending edit AND
 * removes the loaded value so the key drops out of the target file on
 * save. If the user subsequently edits the field again, `touchField`
 * revives it.
 */
export function resetField(dotted: string): void {
	const dirty = new Set(state.dirtyKeys);
	dirty.delete(dotted);
	state.dirtyKeys = dirty;
	const values = new Map(state.pendingValues);
	values.delete(dotted);
	state.pendingValues = values;
	const resets = new Set(state.resetKeys);
	resets.add(dotted);
	state.resetKeys = resets;
}

/**
 * The sparse-save rule, materialized. Returns a nested TOML-shaped object
 * containing exactly the keys that should end up in the target level's
 * file:
 *
 *   keysToWrite = (loadedKeys ∪ dirtyKeys) \ resetKeys
 *
 * Values are pulled from pendingValues (for dirty keys) or from the
 * target level's parsed object (for retained-but-untouched keys).
 *
 * If the set is empty, returns `null` — the caller interprets that as
 * "no file should exist at this level after save".
 */
export function computeSavePayload(): Record<string, unknown> | null {
	if (!state.cascade) return null;
	const target = state.cascade.chain[state.cascade.chain.length - 1];
	const loaded = new Set(target.loadedKeys);
	const union = new Set<string>();
	for (const k of loaded) {
		if (!state.resetKeys.has(k)) union.add(k);
	}
	for (const k of state.dirtyKeys) {
		if (!state.resetKeys.has(k)) union.add(k);
	}
	if (union.size === 0) return null;
	const out: Record<string, unknown> = {};
	for (const key of union) {
		const value = state.dirtyKeys.has(key)
			? state.pendingValues.get(key)
			: getDotted(target.parsed, key);
		setDotted(out, key, value);
	}
	return out;
}

function setDotted(obj: Record<string, unknown>, dotted: string, value: unknown): void {
	const parts = dotted.split('.');
	let cur: Record<string, unknown> = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		const next = cur[p];
		if (!isPlainObject(next)) cur[p] = {};
		cur = cur[p] as Record<string, unknown>;
	}
	cur[parts[parts.length - 1]] = value;
}

export async function saveConfig(): Promise<boolean> {
	if (!state.cascade || !site.home) return false;
	const target = state.cascade.chain[state.cascade.chain.length - 1];
	const payload = computeSavePayload();
	state.saving = true;
	try {
		// Strip Svelte $state proxies before crossing the IPC boundary —
		// structured-clone chokes on proxy-wrapped values.
		const cleanPayload =
			payload === null ? null : (JSON.parse(JSON.stringify(payload)) as Record<string, unknown>);
		const result = await api.config.save({
			home: site.home,
			dirPath: target.level.dirPath,
			payload: cleanPayload
		});
		if (!result.ok) {
			showToast({
				kind: 'error',
				title: 'Config save failed',
				body: result.error
			});
			return false;
		}
		showToast({ kind: 'success', title: 'Config saved' });
		// Re-load the cascade to pick up the freshly-written file.
		await openConfigEditor(site.home, target.level.dirPath);
		return true;
	} catch (err) {
		showToast({
			kind: 'error',
			title: 'Config save failed',
			body: (err as Error).message
		});
		return false;
	} finally {
		state.saving = false;
	}
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
 * `resetKeys` suppresses the target level's own value when walking, so a
 * reset field shows the effective value as if the local override didn't
 * exist. `dirtyKeys` always wins — the user's in-flight value takes
 * priority over everything else.
 */
export function resolveEffective(
	cascade: ConfigCascade,
	dotted: string,
	dirtyKeys: Set<string>,
	pendingValues: Map<string, unknown>,
	resetKeys: Set<string> = new Set()
): EffectiveField {
	// User-touched values always win and mark the field as local.
	if (dirtyKeys.has(dotted)) {
		return { key: dotted, value: pendingValues.get(dotted), source: 'local' };
	}

	const chain = cascade.chain;
	for (let i = chain.length - 1; i >= 0; i--) {
		const isTarget = i === chain.length - 1;
		// If the user reset this key, pretend the target file doesn't have it.
		if (isTarget && resetKeys.has(dotted)) continue;
		const level = chain[i];
		const v = getDotted(level.parsed, dotted);
		if (v !== undefined) {
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
