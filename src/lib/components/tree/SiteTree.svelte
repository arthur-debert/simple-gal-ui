<script lang="ts">
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { api } from '$lib/api';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { cn } from '$lib/utils';
	import type { Selection } from '$lib/types/manifest';

	const manifest = $derived(site.manifest);

	type MenuTarget =
		| { kind: 'album'; path: string; title: string; sourceDir: string }
		| { kind: 'page'; slug: string; title: string; filename: string };

	let menu = $state<{ x: number; y: number; target: MenuTarget } | null>(null);

	function isSelected(s: Selection, target: Selection): boolean {
		if (s.kind !== target.kind) return false;
		if (s.kind === 'album' && target.kind === 'album') return s.albumPath === target.albumPath;
		if (s.kind === 'page' && target.kind === 'page') return s.pageSlug === target.pageSlug;
		return false;
	}

	function select(target: Selection): void {
		site.selection = target;
	}

	function openAlbumMenu(e: MouseEvent, path: string, title: string, sourceDir: string): void {
		e.preventDefault();
		menu = { x: e.clientX, y: e.clientY, target: { kind: 'album', path, title, sourceDir } };
	}

	function openPageMenu(e: MouseEvent, slug: string, title: string, filename: string): void {
		e.preventDefault();
		menu = { x: e.clientX, y: e.clientY, target: { kind: 'page', slug, title, filename } };
	}

	function closeMenu(): void {
		menu = null;
	}

	async function onNewAlbum(): Promise<void> {
		if (!site.home) return;
		const title = window.prompt('New album title');
		if (!title) return;
		try {
			const result = await api.fs.createAlbum({
				home: site.home,
				parentPath: '',
				title
			});
			showToast({ kind: 'success', title: 'Album created', body: result.dirName });
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Create failed', body: (err as Error).message });
		}
	}

	async function onNewPage(): Promise<void> {
		if (!site.home) return;
		const title = window.prompt('New page title');
		if (!title) return;
		try {
			const result = await api.fs.createPage({ home: site.home, title });
			showToast({ kind: 'success', title: 'Page created', body: result.fileName });
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Create failed', body: (err as Error).message });
		}
	}

	async function onRename(): Promise<void> {
		if (!menu || !site.home) return;
		const target = menu.target;
		const current = target.kind === 'album' ? target.title : target.title;
		const newTitle = window.prompt('New title', current);
		closeMenu();
		if (!newTitle || newTitle === current) return;
		try {
			const entryPath = target.kind === 'album' ? target.sourceDir : target.filename;
			await api.fs.renameEntry({
				home: site.home,
				entryPath,
				newTitle
			});
			showToast({ kind: 'success', title: 'Renamed' });
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Rename failed', body: (err as Error).message });
		}
	}

	async function onDelete(): Promise<void> {
		if (!menu || !site.home) return;
		const target = menu.target;
		const label = target.kind === 'album' ? 'album' : 'page';
		const name = target.kind === 'album' ? target.title : target.title;
		closeMenu();
		if (!window.confirm(`Move ${label} "${name}" to trash?`)) return;
		try {
			const entryPath = target.kind === 'album' ? target.sourceDir : target.filename;
			await api.fs.deleteEntry({ home: site.home, entryPath });
			showToast({ kind: 'success', title: 'Moved to trash' });
			if (target.kind === 'album') {
				site.selection = { kind: 'none' };
			} else {
				site.selection = { kind: 'none' };
			}
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Delete failed', body: (err as Error).message });
		}
	}

	function albumSourceDirFor(albumPath: string): string {
		if (!manifest) return albumPath;
		const album = manifest.albums.find((a) => a.path === albumPath);
		if (!album || album.images.length === 0) return albumPath;
		const first = album.images[0].source_path;
		const idx = first.lastIndexOf('/');
		return idx === -1 ? '' : first.slice(0, idx);
	}

	function pageFilenameFor(slug: string): string {
		if (!manifest) return `${slug}.md`;
		const page = manifest.pages.find((p) => p.slug === slug);
		if (!page) return `${slug}.md`;
		const prefix = page.in_nav ? `${String(page.sort_key).padStart(3, '0')}-` : '';
		return `${prefix}${page.link_title}.md`;
	}
</script>

<svelte:window onclick={closeMenu} />

<div class="flex h-full flex-col">
	<div
		class="text-text-muted flex items-center gap-2 px-3 pt-3 pb-2 text-[length:var(--text-micro)] font-semibold tracking-wider uppercase"
	>
		<span class="flex-1">Site</span>
		{#if manifest}
			<Button variant="ghost" size="sm" onclick={onNewAlbum} data-testid="new-album-btn">
				+ album
			</Button>
			<Button variant="ghost" size="sm" onclick={onNewPage} data-testid="new-page-btn">
				+ page
			</Button>
		{/if}
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
							oncontextmenu={(e) =>
								openAlbumMenu(e, album.path, album.title, albumSourceDirFor(album.path))}
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
							oncontextmenu={(e) =>
								openPageMenu(e, page.slug, page.title, pageFilenameFor(page.slug))}
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

{#if menu}
	<div
		class="border-border bg-surface-1 fixed z-50 min-w-[140px] rounded-md border py-1 shadow-xl"
		style:left="{menu.x}px"
		style:top="{menu.y}px"
		role="menu"
		data-testid="tree-context-menu"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.key === 'Escape' && closeMenu()}
		tabindex="-1"
	>
		<button
			type="button"
			class="hover:bg-surface-2 text-text-primary block w-full px-3 py-1 text-left text-[length:var(--text-caption)]"
			onclick={onRename}
			data-testid="menu-rename"
		>
			Rename…
		</button>
		<button
			type="button"
			class="hover:bg-surface-2 text-danger block w-full px-3 py-1 text-left text-[length:var(--text-caption)]"
			onclick={onDelete}
			data-testid="menu-delete"
		>
			Delete
		</button>
	</div>
{/if}
