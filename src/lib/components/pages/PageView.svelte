<script lang="ts">
	import type { ManifestPage } from '$lib/types/manifest';

	interface Props {
		page: ManifestPage;
	}

	const { page }: Props = $props();
</script>

<div class="flex h-full flex-col" data-testid="page-view">
	<header class="border-border bg-surface-1 shrink-0 border-b px-4 py-3">
		<div class="text-text-primary text-[length:var(--text-label)] font-semibold">
			{page.title}
		</div>
		<div class="text-text-muted mt-0.5 text-[length:var(--text-caption)]">
			/{page.slug}
			{#if page.is_link}
				<span class="text-text-faint ml-2">· external link</span>
			{/if}
		</div>
	</header>

	<div class="bg-surface-0 min-h-0 flex-1 overflow-y-auto p-6">
		<pre
			class="text-text-secondary font-mono text-[length:var(--text-body)] whitespace-pre-wrap">{page.body}</pre>
	</div>
</div>
