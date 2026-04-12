<script lang="ts">
	import type { ConfigSchemaNode } from '$lib/types/configSchema';
	import { cn } from '$lib/utils';
	import StringField from './fields/StringField.svelte';
	import NumberField from './fields/NumberField.svelte';
	import BooleanField from './fields/BooleanField.svelte';
	import ArrayField from './fields/ArrayField.svelte';

	interface Props {
		label: string;
		dottedKey: string;
		node: ConfigSchemaNode;
		value: unknown;
		source: 'default' | 'local' | string;
		depth?: number;
		onEdit?: (next: unknown) => void;
		onReset?: () => void;
	}

	const { label, dottedKey, node, value, source, depth = 0, onEdit, onReset }: Props = $props();

	const editable = $derived(!!onEdit);

	const description = $derived(
		'description' in node && typeof node.description === 'string' ? node.description : null
	);

	const badgeLabel = $derived(
		source === 'local' ? 'local' : source === 'default' ? 'default' : source
	);
	const badgeTone = $derived(
		source === 'local'
			? 'bg-accent/20 text-accent border-accent/40'
			: source === 'default'
				? 'bg-surface-2 text-text-faint border-border'
				: 'bg-surface-2 text-text-muted border-border'
	);

	function handleEdit(next: unknown): void {
		if (onEdit) onEdit(next);
	}
</script>

<div
	class="border-border flex items-start gap-3 border-b px-3 py-2 last:border-b-0"
	style:padding-left="{0.75 + depth * 0.75}rem"
	data-testid="config-field"
	data-config-key={dottedKey}
	data-config-source={source}
>
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2">
			<span
				class="text-text-primary text-[length:var(--text-body)] font-medium"
				data-testid="config-field-label"
			>
				{label}
			</span>
			<span
				class={cn(
					'rounded-sm border px-1.5 py-0.5 text-[length:var(--text-micro)] uppercase',
					badgeTone
				)}
				data-testid="config-field-source"
				title={source === 'local'
					? 'Set in this level'
					: source === 'default'
						? 'Built-in default'
						: `Inherited from ${source}`}
			>
				{badgeLabel}
			</span>
			{#if editable && source === 'local' && onReset}
				<button
					type="button"
					class="text-text-faint hover:text-text-primary rounded-sm px-1 text-[length:var(--text-micro)]"
					onclick={onReset}
					data-testid="config-field-reset"
					data-config-key={dottedKey}
					title="Reset to inherited value"
				>
					⌫ reset
				</button>
			{/if}
		</div>
		{#if description}
			<div
				class="text-text-muted mt-0.5 text-[length:var(--text-caption)]"
				data-testid="config-field-description"
			>
				{description}
			</div>
		{/if}
	</div>
	<div class="max-w-[50%] min-w-[12rem]" data-testid="config-field-value">
		{#if !editable}
			<div
				class="text-text-secondary text-right font-mono text-[length:var(--text-caption)] break-all"
			>
				{value === undefined || value === null
					? '—'
					: Array.isArray(value)
						? '[' + value.join(', ') + ']'
						: String(value)}
			</div>
		{:else if node.type === 'string'}
			<StringField value={(value as string) ?? ''} {dottedKey} oninput={(v) => handleEdit(v)} />
		{:else if node.type === 'integer' || node.type === 'number'}
			<NumberField
				value={typeof value === 'number' ? value : undefined}
				{dottedKey}
				integer={node.type === 'integer'}
				min={node.minimum}
				max={node.maximum}
				oninput={(v) => handleEdit(v)}
			/>
		{:else if node.type === 'boolean'}
			<BooleanField value={!!value} {dottedKey} oninput={(v) => handleEdit(v)} />
		{:else if node.type === 'array'}
			<ArrayField
				value={Array.isArray(value) ? value : []}
				{dottedKey}
				itemType={(node.items.type as 'string' | 'number' | 'integer' | 'boolean') ?? 'string'}
				oninput={(v) => handleEdit(v)}
			/>
		{:else}
			<div class="text-text-faint font-mono text-[length:var(--text-caption)]">
				{JSON.stringify(value)}
			</div>
		{/if}
	</div>
</div>
