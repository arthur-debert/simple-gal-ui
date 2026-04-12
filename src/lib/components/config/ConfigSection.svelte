<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		description?: string;
		children: Snippet;
		defaultOpen?: boolean;
	}

	const { title, description, children, defaultOpen = true }: Props = $props();

	let open = $state(defaultOpen);
</script>

<section
	class="border-border overflow-hidden rounded-md border"
	data-testid="config-section"
	data-config-section-title={title}
	data-config-section-open={open ? 'true' : 'false'}
>
	<button
		type="button"
		class="bg-surface-1 hover:bg-surface-2 text-text-primary flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--text-label)] font-semibold"
		onclick={() => (open = !open)}
		data-testid="config-section-toggle"
	>
		<span class="text-text-faint w-3 text-center text-[length:var(--text-micro)]">
			{open ? '▾' : '▸'}
		</span>
		<span class="flex-1">{title}</span>
	</button>
	{#if open}
		<div class="bg-surface-0">
			{#if description}
				<div
					class="text-text-muted border-border border-b px-3 py-2 text-[length:var(--text-caption)]"
				>
					{description}
				</div>
			{/if}
			{@render children()}
		</div>
	{/if}
</section>
