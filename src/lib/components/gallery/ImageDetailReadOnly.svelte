<script lang="ts">
	import { site } from '$lib/stores/siteStore.svelte';
	import type { ManifestImage } from '$lib/types/manifest';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		albumPath: string;
		image: ManifestImage;
	}

	const { albumPath, image }: Props = $props();

	const fileUrl = $derived.by(() => {
		if (!site.home) return '';
		const abs = `${site.home}/${image.source_path}`;
		return `file://${abs.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
	});

	function backToAlbum(): void {
		site.selection = { kind: 'album', albumPath };
	}
</script>

<div class="flex h-full flex-col" data-testid="image-detail">
	<header
		class="border-border bg-surface-1 flex shrink-0 items-center justify-between border-b px-4 py-3"
	>
		<div class="min-w-0">
			<div class="text-text-primary truncate text-[length:var(--text-label)] font-semibold">
				{image.title ?? image.filename}
			</div>
			<div class="text-text-muted mt-0.5 truncate text-[length:var(--text-caption)]">
				{image.source_path}
			</div>
		</div>
		<Button variant="ghost" size="sm" onclick={backToAlbum}>← Album</Button>
	</header>

	<div class="bg-surface-0 min-h-0 flex-1 overflow-y-auto">
		<div class="flex min-h-full items-center justify-center p-6">
			<img
				src={fileUrl}
				alt={image.title ?? image.filename}
				class="border-border max-h-full max-w-full rounded-md border object-contain"
			/>
		</div>
	</div>

	<aside class="border-border bg-surface-1 shrink-0 border-t px-4 py-3">
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[length:var(--text-caption)]">
			<dt class="text-text-muted">Number</dt>
			<dd class="text-text-secondary">#{image.number}</dd>
			<dt class="text-text-muted">Filename</dt>
			<dd class="text-text-secondary truncate">{image.filename}</dd>
			<dt class="text-text-muted">Slug</dt>
			<dd class="text-text-secondary truncate">{image.slug}</dd>
			{#if image.title}
				<dt class="text-text-muted">Title</dt>
				<dd class="text-text-secondary">{image.title}</dd>
			{/if}
			{#if image.description}
				<dt class="text-text-muted">Description</dt>
				<dd class="text-text-secondary whitespace-pre-wrap">{image.description}</dd>
			{/if}
		</dl>
	</aside>
</div>
