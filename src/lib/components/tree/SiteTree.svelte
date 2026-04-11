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

	// Drag-reorder state. `dragKind` gates which section is being reordered so
	// albums can't drop into pages and vice versa. `dropIndex` is the gap index
	// where the drop would land (0 = before first, N = after last).
	let dragKind = $state<'album' | 'page' | null>(null);
	let dragIndex = $state<number | null>(null);
	let dropIndex = $state<number | null>(null);

	const TREE_MIME = 'application/x-sgui-tree';

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
		const current = target.title;
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
		const name = target.title;
		closeMenu();
		if (!window.confirm(`Move ${label} "${name}" to trash?`)) return;
		try {
			const entryPath = target.kind === 'album' ? target.sourceDir : target.filename;
			await api.fs.deleteEntry({ home: site.home, entryPath });
			showToast({ kind: 'success', title: 'Moved to trash' });
			site.selection = { kind: 'none' };
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

	// Drag-reorder handlers ------------------------------------------------

	function onDragStart(kind: 'album' | 'page', index: number, e: DragEvent): void {
		if (!e.dataTransfer) return;
		dragKind = kind;
		dragIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData(TREE_MIME, `${kind}:${index}`);
	}

	function onGapDragOver(kind: 'album' | 'page', gap: number, e: DragEvent): void {
		if (dragKind !== kind || !e.dataTransfer) return;
		if (!Array.from(e.dataTransfer.types).includes(TREE_MIME)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		dropIndex = gap;
	}

	function onDragEnd(): void {
		dragKind = null;
		dragIndex = null;
		dropIndex = null;
	}

	async function onGapDrop(kind: 'album' | 'page', gap: number, e: DragEvent): Promise<void> {
		if (dragKind !== kind || dragIndex === null || !site.home || !manifest) return;
		e.preventDefault();
		e.stopPropagation();

		const from = dragIndex;
		// Dropping onto the gap right before or right after the dragged row is a no-op.
		if (gap === from || gap === from + 1) {
			onDragEnd();
			return;
		}

		const currentNames =
			kind === 'album'
				? manifest.albums.map((a) => {
						const sd = albumSourceDirFor(a.path);
						// We reorder at the root so only strip to the top-level directory name.
						return sd.split('/')[0];
					})
				: manifest.pages.map((p) => pageFilenameFor(p.slug));

		const [moved] = currentNames.splice(from, 1);
		const target = gap > from ? gap - 1 : gap;
		currentNames.splice(target, 0, moved);

		onDragEnd();

		try {
			await api.fs.reorderTreeEntries({
				home: site.home,
				parentPath: '',
				kind: kind === 'album' ? 'dir' : 'file',
				orderedNames: currentNames
			});
			showToast({ kind: 'success', title: 'Reordered' });
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Reorder failed', body: (err as Error).message });
		}
	}
</script>

<svelte:window onclick={closeMenu} />

<div class="flex h-full flex-col">
	<div
		class="text-text-muted flex items-center gap-2 px-3 pt-3 pb-2 text-[length:var(--text-micro)] font-semibold tracking-wider uppercase"
	>
		<span class="flex-1">Site</span>
	</div>

	{#if !manifest}
		<div
			class="text-text-faint flex flex-1 items-center justify-center px-3 text-center text-[length:var(--text-caption)]"
		>
			No gallery open
		</div>
	{:else}
		<div class="flex-1 overflow-y-auto px-1" data-testid="site-tree">
			<!-- Albums section -->
			<section data-testid="tree-section-albums">
				<div
					class="text-text-faint flex items-center gap-2 px-2 pt-1 pb-1 text-[length:var(--text-micro)] uppercase"
				>
					<span class="flex-1">Albums</span>
					<Button
						variant="ghost"
						size="sm"
						onclick={onNewAlbum}
						data-testid="new-album-btn"
						class="-my-1 h-5 px-1.5"
					>
						+ album
					</Button>
				</div>
				<ul>
					{#each manifest.albums as album, i (album.path)}
						{@const sel = { kind: 'album', albumPath: album.path } satisfies Selection}
						<!-- Gap before row i -->
						<li
							class={cn(
								'h-1.5 transition-colors',
								dragKind === 'album' && dropIndex === i ? 'bg-drop' : null
							)}
							ondragover={(e) => onGapDragOver('album', i, e)}
							ondrop={(e) => onGapDrop('album', i, e)}
							data-testid="tree-album-gap"
							data-gap={i}
						></li>
						<li>
							<button
								type="button"
								class={cn(
									'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-[length:var(--text-body)]',
									isSelected(site.selection, sel)
										? 'bg-selected text-selected-text'
										: 'text-text-secondary hover:bg-surface-2',
									dragIndex === i && dragKind === 'album' ? 'opacity-40' : null
								)}
								draggable="true"
								ondragstart={(e) => onDragStart('album', i, e)}
								ondragend={onDragEnd}
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
					<!-- Gap after last album row -->
					{#if manifest.albums.length > 0}
						<li
							class={cn(
								'h-1.5 transition-colors',
								dragKind === 'album' && dropIndex === manifest.albums.length ? 'bg-drop' : null
							)}
							ondragover={(e) => onGapDragOver('album', manifest.albums.length, e)}
							ondrop={(e) => onGapDrop('album', manifest.albums.length, e)}
							data-testid="tree-album-gap"
							data-gap={manifest.albums.length}
						></li>
					{/if}
				</ul>
			</section>

			<!-- Thick divider between Albums and Pages -->
			<div class="border-border-strong my-2 border-t-2" data-testid="tree-section-divider"></div>

			<!-- Pages section -->
			<section data-testid="tree-section-pages">
				<div
					class="text-text-faint flex items-center gap-2 px-2 pt-1 pb-1 text-[length:var(--text-micro)] uppercase"
				>
					<span class="flex-1">Pages</span>
					<Button
						variant="ghost"
						size="sm"
						onclick={onNewPage}
						data-testid="new-page-btn"
						class="-my-1 h-5 px-1.5"
					>
						+ page
					</Button>
				</div>
				<ul>
					{#each manifest.pages as page, i (page.slug)}
						{@const sel = { kind: 'page', pageSlug: page.slug } satisfies Selection}
						<li
							class={cn(
								'h-1.5 transition-colors',
								dragKind === 'page' && dropIndex === i ? 'bg-drop' : null
							)}
							ondragover={(e) => onGapDragOver('page', i, e)}
							ondrop={(e) => onGapDrop('page', i, e)}
							data-testid="tree-page-gap"
							data-gap={i}
						></li>
						<li>
							<button
								type="button"
								class={cn(
									'flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[length:var(--text-body)]',
									isSelected(site.selection, sel)
										? 'bg-selected text-selected-text'
										: 'text-text-secondary hover:bg-surface-2',
									dragIndex === i && dragKind === 'page' ? 'opacity-40' : null
								)}
								draggable="true"
								ondragstart={(e) => onDragStart('page', i, e)}
								ondragend={onDragEnd}
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
					{#if manifest.pages.length > 0}
						<li
							class={cn(
								'h-1.5 transition-colors',
								dragKind === 'page' && dropIndex === manifest.pages.length ? 'bg-drop' : null
							)}
							ondragover={(e) => onGapDragOver('page', manifest.pages.length, e)}
							ondrop={(e) => onGapDrop('page', manifest.pages.length, e)}
							data-testid="tree-page-gap"
							data-gap={manifest.pages.length}
						></li>
					{/if}
				</ul>
			</section>
		</div>
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
