<script lang="ts">
	import { site } from '$lib/stores/siteStore.svelte';
	import { cn } from '$lib/utils';
	import type { Selection } from '$lib/types/manifest';

	const manifest = $derived(site.manifest);

	function isSelected(s: Selection, target: Selection): boolean {
		if (s.kind !== target.kind) return false;
		if (s.kind === 'album' && target.kind === 'album') return s.albumPath === target.albumPath;
		if (s.kind === 'page' && target.kind === 'page') return s.pageSlug === target.pageSlug;
		return false;
	}

	function select(target: Selection): void {
		site.selection = target;
	}
</script>

<div class="flex h-full flex-col">
	<div
		class="text-text-muted px-3 pt-3 pb-2 text-[length:var(--text-micro)] font-semibold tracking-wider uppercase"
	>
		Site
	</div>

	{#if !manifest}
		<div
			class="text-text-faint flex flex-1 items-center justify-center px-3 text-center text-[length:var(--text-caption)]"
		>
			No gallery open
		</div>
	{:else}
		<ul class="flex-1 overflow-y-auto px-1" data-testid="site-tree">
			{#if manifest.albums.length > 0}
				<li class="text-text-faint px-2 pt-1 pb-1 text-[length:var(--text-micro)] uppercase">
					Albums
				</li>
				{#each manifest.albums as album (album.path)}
					{@const sel = { kind: 'album', albumPath: album.path } satisfies Selection}
					<li>
						<button
							type="button"
							class={cn(
								'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-[length:var(--text-body)]',
								isSelected(site.selection, sel)
									? 'bg-selected text-selected-text'
									: 'text-text-secondary hover:bg-surface-2'
							)}
							onclick={() => select(sel)}
							data-testid="tree-album"
							data-album-path={album.path}
						>
							<span class="truncate">{album.title}</span>
							<span class="text-text-faint text-[length:var(--text-micro)]">
								{album.images.length}
							</span>
						</button>
					</li>
				{/each}
			{/if}

			{#if manifest.pages.length > 0}
				<li class="text-text-faint px-2 pt-3 pb-1 text-[length:var(--text-micro)] uppercase">
					Pages
				</li>
				{#each manifest.pages as page (page.slug)}
					{@const sel = { kind: 'page', pageSlug: page.slug } satisfies Selection}
					<li>
						<button
							type="button"
							class={cn(
								'flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[length:var(--text-body)]',
								isSelected(site.selection, sel)
									? 'bg-selected text-selected-text'
									: 'text-text-secondary hover:bg-surface-2'
							)}
							onclick={() => select(sel)}
							data-testid="tree-page"
							data-page-slug={page.slug}
						>
							<span class="truncate">{page.title}</span>
							{#if page.is_link}
								<span class="text-text-faint text-[length:var(--text-micro)]">link</span>
							{/if}
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>
