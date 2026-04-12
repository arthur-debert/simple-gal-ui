<script lang="ts">
	import type { ConfigSchemaNode } from '$lib/types/configSchema';
	import { cn } from '$lib/utils';

	interface Props {
		label: string;
		dottedKey: string;
		node: ConfigSchemaNode;
		value: unknown;
		source: 'default' | 'local' | string;
		depth?: number;
	}

	const { label, dottedKey, node, value, source, depth = 0 }: Props = $props();

	function formatValue(v: unknown): string {
		if (v === undefined || v === null) return '—';
		if (typeof v === 'boolean') return v ? 'true' : 'false';
		if (typeof v === 'string') return v;
		if (typeof v === 'number') return String(v);
		if (Array.isArray(v)) return '[' + v.map((x) => formatValue(x)).join(', ') + ']';
		return JSON.stringify(v);
	}

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
	<div
		class="text-text-secondary max-w-[50%] text-right font-mono text-[length:var(--text-caption)] break-all"
		data-testid="config-field-value"
	>
		{formatValue(value)}
	</div>
</div>
