<script lang="ts">
	import { site } from '$lib/stores/siteStore.svelte';
	import type { ManifestAlbum, ManifestImage } from '$lib/types/manifest';

	interface Props {
		album: ManifestAlbum;
	}

	const { album }: Props = $props();

	function fileUrlFor(img: ManifestImage): string {
		if (!site.home) return '';
		const abs = `${site.home}/${img.source_path}`;
		return `file://${abs.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
	}

	function selectImage(img: ManifestImage): void {
		site.selection = {
			kind: 'image',
			albumPath: album.path,
			imageSourcePath: img.source_path
		};
	}
</script>

<div class="flex h-full flex-col" data-testid="album-view">
	<header class="border-border bg-surface-1 shrink-0 border-b px-4 py-3">
		<div class="text-text-primary text-[length:var(--text-label)] font-semibold">
			{album.title}
		</div>
		<div class="text-text-muted mt-1 text-[length:var(--text-caption)]">
			{album.images.length} image{album.images.length === 1 ? '' : 's'}
		</div>
		{#if album.description}
			<div class="text-text-secondary mt-2 text-[length:var(--text-caption)] whitespace-pre-wrap">
				{album.description}
			</div>
		{/if}
	</header>

	<div class="bg-surface-0 min-h-0 flex-1 overflow-y-auto p-4">
		<div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
			{#each album.images as img (img.source_path)}
				<button
					type="button"
					class="group bg-surface-1 border-border hover:border-border-strong flex flex-col overflow-hidden rounded-md border text-left transition-colors"
					onclick={() => selectImage(img)}
					data-testid="album-thumb"
					data-image-path={img.source_path}
				>
					<div class="bg-surface-2 relative aspect-[4/5] w-full overflow-hidden">
						<img
							src={fileUrlFor(img)}
							alt={img.title ?? img.filename}
							class="h-full w-full object-cover"
							loading="lazy"
						/>
					</div>
					<div class="flex items-center justify-between gap-1 px-2 py-1.5">
						<span class="text-text-secondary truncate text-[length:var(--text-caption)]">
							{img.title ?? img.filename}
						</span>
						<span class="text-text-faint shrink-0 text-[length:var(--text-micro)]">
							#{img.number}
						</span>
					</div>
				</button>
			{/each}
		</div>
	</div>
</div>
