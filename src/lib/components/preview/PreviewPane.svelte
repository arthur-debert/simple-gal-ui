<script lang="ts">
	import { preview, runBuild } from '$lib/stores/previewStore.svelte';
	import { site } from '$lib/stores/siteStore.svelte';
	import Button from '$lib/components/ui/Button.svelte';
</script>

<div class="flex h-full flex-col" data-testid="preview-pane">
	<div
		class="border-border bg-surface-1 flex shrink-0 items-center justify-between border-b px-3 py-2"
	>
		<div
			class="text-text-muted text-[length:var(--text-micro)] font-semibold tracking-wider uppercase"
		>
			Preview
		</div>
		<div class="flex items-center gap-2">
			{#if preview.url}
				<a
					href={preview.url}
					target="_blank"
					rel="noopener"
					class="text-text-faint hover:text-text-primary text-[length:var(--text-caption)] underline"
				>
					open in browser
				</a>
			{/if}
			<Button
				variant="outline"
				size="sm"
				disabled={!site.home || preview.status === 'building'}
				onclick={runBuild}
				data-testid="preview-build-btn"
			>
				{preview.status === 'building' ? 'Building…' : 'Build'}
			</Button>
		</div>
	</div>

	<div class="bg-surface-0 relative min-h-0 flex-1">
		{#if preview.url}
			{#key preview.reloadToken}
				<iframe
					title="gallery preview"
					src={preview.url}
					class="h-full w-full border-0"
					data-testid="preview-iframe"
				></iframe>
			{/key}
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
				<div>Click Build to render this gallery</div>
				<Button variant="default" size="sm" onclick={runBuild}>Build now</Button>
			</div>
		{/if}
	</div>
</div>
