<script lang="ts">
	import { site } from '$lib/stores/siteStore.svelte';
	import { preview } from '$lib/stores/previewStore.svelte';
	import { cn } from '$lib/utils';

	const statusLabel = $derived.by(() => {
		if (site.loading) return 'scanning';
		switch (preview.status) {
			case 'idle':
				return site.home ? 'ready' : 'no gallery';
			case 'building':
				return 'building…';
			case 'ready':
				return 'preview ready';
			case 'error':
				return 'build error';
		}
	});

	const dotClass = $derived.by(() => {
		if (site.loading || preview.status === 'building') return 'bg-warning animate-pulse';
		if (preview.status === 'error') return 'bg-danger';
		if (preview.status === 'ready') return 'bg-success';
		return 'bg-text-faint';
	});
</script>

<footer
	class="border-border bg-surface-1 text-text-faint flex h-6 shrink-0 items-center gap-3 border-t px-3 text-[length:var(--text-micro)]"
	data-testid="status-bar"
>
	<span class="flex items-center gap-1.5">
		<span class={cn('h-1.5 w-1.5 rounded-full', dotClass)}></span>
		<span data-testid="status-label">{statusLabel}</span>
	</span>

	{#if site.manifest}
		<span class="text-text-faint">·</span>
		<span data-testid="footer-counts">
			{site.manifest.albums.length} album{site.manifest.albums.length === 1 ? '' : 's'},
			{site.manifest.albums.reduce((n, a) => n + a.images.length, 0)} images,
			{site.manifest.pages.length} page{site.manifest.pages.length === 1 ? '' : 's'}
		</span>
	{/if}

	{#if preview.cache && preview.status === 'ready'}
		<span class="text-text-faint">·</span>
		<span data-testid="footer-cache">
			cache: {preview.cache.cached}/{preview.cache.total}
			{#if preview.lastDurationMs != null}
				in {(preview.lastDurationMs / 1000).toFixed(1)}s
			{/if}
		</span>
	{/if}

	<div class="flex-1"></div>

	{#if preview.lastError && preview.status === 'error'}
		<span class="text-danger max-w-md truncate" data-testid="footer-error">
			{preview.lastError}
		</span>
	{/if}
</footer>
