<script lang="ts">
	import { preview, runBuild } from '$lib/stores/previewStore.svelte';
	import { site } from '$lib/stores/siteStore.svelte';
	import Button from '$lib/components/ui/Button.svelte';
</script>

<div class="bg-surface-0 relative flex h-full flex-col" data-testid="preview-pane">
	{#if preview.url}
		{#key preview.reloadToken}
			<iframe
				title="gallery preview"
				src={preview.url}
				class="h-full w-full border-0"
				data-testid="preview-iframe"
			></iframe>
		{/key}
		<a
			href={preview.url}
			target="_blank"
			rel="noopener"
			class="bg-surface-1/90 text-text-muted hover:text-text-primary border-border absolute top-2 right-2 rounded-sm border px-2 py-1 text-[length:var(--text-micro)] opacity-0 backdrop-blur transition-opacity hover:opacity-100"
			style="opacity: 0;"
			onmouseenter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
			onmouseleave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0')}
			data-testid="preview-open-external"
		>
			open in browser ↗
		</a>
	{:else if preview.status === 'building'}
		<div
			class="text-text-muted absolute inset-0 flex items-center justify-center text-[length:var(--text-caption)]"
		>
			Building preview…
		</div>
	{:else if !site.home}
		<div
			class="text-text-faint absolute inset-0 flex items-center justify-center p-6 text-center text-[length:var(--text-caption)]"
		>
			Open a gallery home to preview
		</div>
	{:else}
		<div
			class="text-text-faint absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-[length:var(--text-caption)]"
		>
			<div>Click Build in the top bar to render this gallery</div>
			<Button variant="default" size="sm" onclick={runBuild}>Build now</Button>
		</div>
	{/if}
</div>
