/**
 * JSON Schema (draft 2020-12) subset emitted by
 * `simple-gal config schema --format json`. We type only the shapes we
 * actually consume in the config editor — `$schema`, `title`, and
 * `additionalProperties` come through but aren't load-bearing in the UI.
 *
 * The schema is a strict closed object at every level
 * (`additionalProperties: false`), so an unknown key in the user's TOML is
 * always an error we surface via `simple-gal check`.
 */

export interface ConfigSchemaRoot {
	$schema?: string;
	type: 'object';
	title?: string;
	description?: string;
	properties: Record<string, ConfigSchemaNode>;
	required?: string[];
	additionalProperties?: boolean;
}

export type ConfigSchemaNode =
	| ConfigSchemaObject
	| ConfigSchemaString
	| ConfigSchemaNumber
	| ConfigSchemaBoolean
	| ConfigSchemaArray;

export interface ConfigSchemaObject {
	type: 'object';
	title?: string;
	description?: string;
	properties: Record<string, ConfigSchemaNode>;
	required?: string[];
	additionalProperties?: boolean;
}

export interface ConfigSchemaString {
	type: 'string';
	description?: string;
	default?: string;
	enum?: string[];
	format?: string;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
}

export interface ConfigSchemaNumber {
	type: 'integer' | 'number';
	description?: string;
	default?: number;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
}

export interface ConfigSchemaBoolean {
	type: 'boolean';
	description?: string;
	default?: boolean;
}

export interface ConfigSchemaArray {
	type: 'array';
	description?: string;
	default?: unknown[];
	items: ConfigSchemaNode;
	minItems?: number;
	maxItems?: number;
}

export function isObjectNode(node: ConfigSchemaNode): node is ConfigSchemaObject {
	return node.type === 'object';
}
