<script lang="ts">
	import { site } from '$lib/stores/siteStore.svelte';
	import { preview } from '$lib/stores/previewStore.svelte';
	import { appInfo } from '$lib/stores/appInfoStore.svelte';
	import { cn } from '$lib/utils';

	const statusLabel = $derived.by(() => {
		if (site.loading) return 'scanning';
		switch (preview.status) {
			case 'idle':
				return site.home ? 'ready' : 'no gallery';
			case 'building':
				return preview.progress
					? `${preview.progress.stage} ${Math.round(preview.progress.percent)}%`
					: 'building\u2026';
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
	class="border-border bg-surface-1 text-text-faint relative flex h-6 shrink-0 items-center gap-3 border-t px-3 text-[length:var(--text-micro)]"
	data-testid="status-bar"
>
	<span class="relative flex items-center gap-1.5">
		<span class={cn('h-1.5 w-1.5 rounded-full', dotClass)}></span>
		<span data-testid="status-label">{statusLabel}</span>
	</span>

	{#if preview.status === 'building' && preview.progress}
		<span class="text-text-faint relative">·</span>
		<span class="relative" data-testid="build-progress-detail">
			{preview.progress.images_done}/{preview.progress.images_total} images
		</span>
	{/if}

	{#if site.manifest && preview.status !== 'building'}
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
		<span class="text-text-faint">·</span>
	{/if}

	<!-- Right-aligned chrome info: app version, current home, simple-gal version -->
	{#if appInfo.appVersion}
		<span data-testid="footer-app-version">v{appInfo.appVersion}</span>
	{/if}
	{#if site.home}
		<span class="text-text-faint">·</span>
		<span class="max-w-sm truncate" data-testid="footer-home-path" title={site.home}>
			{site.home}
		</span>
	{/if}
	{#if appInfo.simpleGalVersion}
		<span class="text-text-faint">·</span>
		<span class={appInfo.simpleGalMissing ? 'text-danger' : ''} data-testid="footer-sg-version">
			{appInfo.simpleGalVersion}
		</span>
	{/if}
</footer>
