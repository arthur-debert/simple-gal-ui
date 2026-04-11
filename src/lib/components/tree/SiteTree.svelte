<script lang="ts">
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { api } from '$lib/api';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { cn } from '$lib/utils';
	import { tick } from 'svelte';
	import type { ManifestAlbum, ManifestNavItem, Selection } from '$lib/types/manifest';

	const manifest = $derived(site.manifest);

	// Inline create state — Electron's renderer does not support window.prompt(),
	// so we render an input row at the top of the relevant section instead.
	let creatingAlbum = $state(false);
	let creatingAlbumTitle = $state('');
	let creatingAlbumInput = $state<HTMLInputElement>();

	let creatingPage = $state(false);
	let creatingPageTitle = $state('');
	let creatingPageInput = $state<HTMLInputElement>();

	// Inline rename state
	let renamingKey = $state<string | null>(null); // album.path or page.slug
	let renameDraft = $state('');
	let renameInput = $state<HTMLInputElement>();

	// Expand/collapse state for group rows — keyed on nav.path. Default: all
	// expanded, so only paths explicitly added to the set are collapsed. We
	// reassign the whole Set on change (instead of mutating in place) because
	// plain Sets in $state() don't track .has() reads for re-rendering.
	let collapsedGroups = $state<Set<string>>(new Set());

	// Focus management for keyboard navigation. The tree container owns
	// tabindex=0 and handles Arrow/Enter/Home/End. `focusedKey` is the path
	// of the currently-navigable row (album or group); selection follows
	// focus on Enter.
	let treeHost = $state<HTMLDivElement>();
	let focusedKey = $state<string | null>(null);

	type MenuTarget =
		| { kind: 'album'; path: string; title: string; sourceDir: string }
		| { kind: 'page'; slug: string; title: string; filename: string };

	let menu = $state<{ x: number; y: number; target: MenuTarget } | null>(null);

	// Root-level drag-reorder state. For this round drag-reorder only works at
	// the top level of the navigation tree (root albums + root groups); nested
	// items render without drag handlers.
	let dragKind = $state<'album' | 'page' | null>(null);
	let dragIndex = $state<number | null>(null);
	let dropIndex = $state<number | null>(null);

	const TREE_MIME = 'application/x-sgui-tree';

	// Derived helpers -----------------------------------------------------

	function isGroup(n: ManifestNavItem): boolean {
		return !!n.children && n.children.length > 0;
	}

	/** Collect every nav path (recursively) so we can find albums that are NOT in navigation. */
	function collectNavPaths(items: ManifestNavItem[], acc: Set<string>): Set<string> {
		for (const it of items) {
			acc.add(it.path);
			if (it.children) collectNavPaths(it.children, acc);
		}
		return acc;
	}

	const hiddenAlbums = $derived.by((): ManifestAlbum[] => {
		if (!manifest) return [];
		const navPaths = collectNavPaths(manifest.navigation, new Set<string>());
		return manifest.albums.filter((a) => !navPaths.has(a.path));
	});

	function albumByPath(path: string): ManifestAlbum | undefined {
		return manifest?.albums.find((a) => a.path === path);
	}

	function isSelected(s: Selection, target: Selection): boolean {
		if (s.kind !== target.kind) return false;
		if (s.kind === 'album' && target.kind === 'album') return s.albumPath === target.albumPath;
		if (s.kind === 'page' && target.kind === 'page') return s.pageSlug === target.pageSlug;
		return false;
	}

	function select(target: Selection): void {
		site.selection = target;
	}

	function toggleGroup(path: string): void {
		const next = new Set(collapsedGroups);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		collapsedGroups = next;
	}

	function isCollapsed(path: string): boolean {
		return collapsedGroups.has(path);
	}

	// --- Keyboard navigation helpers ------------------------------------

	interface FlatRow {
		path: string;
		kind: 'group' | 'album';
		parentPath: string | null;
	}

	/** Flatten the visible tree (respecting collapsed groups) into a linear list. */
	function flattenVisible(): FlatRow[] {
		const out: FlatRow[] = [];
		if (!manifest) return out;
		function walk(items: ManifestNavItem[], parent: string | null): void {
			for (const item of items) {
				const kind: FlatRow['kind'] = isGroup(item) ? 'group' : 'album';
				out.push({ path: item.path, kind, parentPath: parent });
				if (isGroup(item) && !isCollapsed(item.path)) {
					walk(item.children!, item.path);
				}
			}
		}
		walk(manifest.navigation, null);
		return out;
	}

	function moveFocus(delta: number): void {
		const rows = flattenVisible();
		if (rows.length === 0) return;
		const currentIdx = focusedKey ? rows.findIndex((r) => r.path === focusedKey) : -1;
		const nextIdx =
			currentIdx === -1
				? delta > 0
					? 0
					: rows.length - 1
				: Math.max(0, Math.min(rows.length - 1, currentIdx + delta));
		focusedKey = rows[nextIdx].path;
	}

	function activateFocused(): void {
		if (!focusedKey || !manifest) return;
		const rows = flattenVisible();
		const row = rows.find((r) => r.path === focusedKey);
		if (!row) return;
		if (row.kind === 'group') {
			toggleGroup(row.path);
		} else {
			site.selection = { kind: 'album', albumPath: row.path };
		}
	}

	function onTreeKeydown(e: KeyboardEvent): void {
		// Ignore if an input inside the tree has focus
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (!manifest) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			moveFocus(+1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			moveFocus(-1);
		} else if (e.key === 'ArrowRight') {
			if (!focusedKey) return;
			const rows = flattenVisible();
			const row = rows.find((r) => r.path === focusedKey);
			if (row?.kind === 'group' && isCollapsed(row.path)) {
				e.preventDefault();
				toggleGroup(row.path);
			}
		} else if (e.key === 'ArrowLeft') {
			if (!focusedKey) return;
			const rows = flattenVisible();
			const row = rows.find((r) => r.path === focusedKey);
			if (row?.kind === 'group' && !isCollapsed(row.path)) {
				e.preventDefault();
				toggleGroup(row.path);
			} else if (row?.parentPath) {
				e.preventDefault();
				focusedKey = row.parentPath;
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			activateFocused();
		} else if (e.key === 'Home') {
			e.preventDefault();
			const rows = flattenVisible();
			if (rows.length > 0) focusedKey = rows[0].path;
		} else if (e.key === 'End') {
			e.preventDefault();
			const rows = flattenVisible();
			if (rows.length > 0) focusedKey = rows[rows.length - 1].path;
		}
	}

	function isFocused(path: string): boolean {
		return focusedKey === path;
	}

	// --- Context menu ----------------------------------------------------

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

	// --- Inline create ---------------------------------------------------

	async function startCreateAlbum(): Promise<void> {
		if (!site.home) return;
		creatingAlbum = true;
		creatingAlbumTitle = '';
		await tick();
		creatingAlbumInput?.focus();
	}

	async function commitCreateAlbum(): Promise<void> {
		if (!site.home || !creatingAlbum) return;
		const title = creatingAlbumTitle.trim();
		creatingAlbum = false;
		creatingAlbumTitle = '';
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

	function cancelCreateAlbum(): void {
		creatingAlbum = false;
		creatingAlbumTitle = '';
	}

	async function startCreatePage(): Promise<void> {
		if (!site.home) return;
		creatingPage = true;
		creatingPageTitle = '';
		await tick();
		creatingPageInput?.focus();
	}

	async function commitCreatePage(): Promise<void> {
		if (!site.home || !creatingPage) return;
		const title = creatingPageTitle.trim();
		creatingPage = false;
		creatingPageTitle = '';
		if (!title) return;
		try {
			const result = await api.fs.createPage({ home: site.home, title });
			showToast({ kind: 'success', title: 'Page created', body: result.fileName });
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Create failed', body: (err as Error).message });
		}
	}

	function cancelCreatePage(): void {
		creatingPage = false;
		creatingPageTitle = '';
	}

	// --- Inline rename ---------------------------------------------------

	async function onRename(): Promise<void> {
		if (!menu) return;
		const target = menu.target;
		const key = target.kind === 'album' ? target.path : target.slug;
		renamingKey = key;
		renameDraft = target.title;
		closeMenu();
		await tick();
		renameInput?.focus();
		renameInput?.select();
	}

	async function commitRename(target: MenuTarget): Promise<void> {
		if (!site.home || renamingKey === null) return;
		const newTitle = renameDraft.trim();
		const wasRenaming = renamingKey;
		renamingKey = null;
		renameDraft = '';
		if (!newTitle || newTitle === target.title) return;
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
			renamingKey = wasRenaming;
		}
	}

	function cancelRename(): void {
		renamingKey = null;
		renameDraft = '';
	}

	// --- Delete (context menu) -------------------------------------------

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

	// --- Source-dir resolution for a nav path ---------------------------

	/**
	 * Resolve a nav item's full source directory (relative to home).
	 * For a top-level nav item the source_dir is exactly its basename
	 * (`020-Travel`). For a nested one we need to join with parent source_dirs
	 * to get `020-Travel/010-Japan`.
	 *
	 * We derive it by finding the matching album via `nav.path` and then
	 * stripping the filename off its first image's source_path.
	 */
	function albumSourceDirFor(albumPath: string): string {
		if (!manifest) return albumPath;
		const album = albumByPath(albumPath);
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

	// --- Drag-reorder (root level only) ---------------------------------

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
		if (gap === from || gap === from + 1) {
			onDragEnd();
			return;
		}

		// Root-level reorder. For albums we iterate navigation (not the flat
		// albums list) so nested entries collapse correctly into their parent
		// directory basenames.
		const currentNames =
			kind === 'album'
				? manifest.navigation.map((n) => n.source_dir)
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

<!-- Recursive nav renderer. Called with the top-level navigation array at
     depth 0 and recursively with each group's children at depth + 1. -->
{#snippet navTree(items: ManifestNavItem[], depth: number)}
	{#each items as item, i (item.path)}
		{@const group = isGroup(item)}
		{@const albumSel = { kind: 'album', albumPath: item.path } satisfies Selection}
		{@const album = albumByPath(item.path)}
		{@const isRenaming = renamingKey === item.path}
		{@const collapsed = isCollapsed(item.path)}
		{@const isRootLevel = depth === 0}
		{@const focused = isFocused(item.path)}

		<!-- Root-level only: drop-gap before row i -->
		{#if isRootLevel}
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
		{/if}

		<li data-testid={group ? 'tree-group' : 'tree-album-leaf'} data-nav-path={item.path}>
			{#if isRenaming}
				<input
					bind:this={renameInput}
					bind:value={renameDraft}
					class="bg-surface-0 border-accent text-text-primary mx-1 w-[calc(100%-0.5rem)] rounded-sm border px-2 py-1 text-[length:var(--text-body)] outline-none"
					data-testid="tree-rename-input"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							commitRename({
								kind: 'album',
								path: item.path,
								title: item.title,
								sourceDir: albumSourceDirFor(item.path)
							});
						} else if (e.key === 'Escape') {
							e.preventDefault();
							cancelRename();
						}
					}}
					onblur={() =>
						commitRename({
							kind: 'album',
							path: item.path,
							title: item.title,
							sourceDir: albumSourceDirFor(item.path)
						})}
				/>
			{:else if group}
				<button
					type="button"
					class={cn(
						'text-text-secondary hover:bg-surface-2 flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-left text-[length:var(--text-body)]',
						focused ? 'ring-accent ring-1 ring-inset' : null
					)}
					style:padding-left="{0.5 + depth * 0.75}rem"
					onclick={() => {
						focusedKey = item.path;
						toggleGroup(item.path);
					}}
					oncontextmenu={(e) =>
						openAlbumMenu(e, item.path, item.title, albumSourceDirFor(item.path))}
					data-testid="tree-group-row"
					data-group-path={item.path}
					data-collapsed={collapsed ? 'true' : 'false'}
					draggable={isRootLevel ? 'true' : 'false'}
					ondragstart={(e) => isRootLevel && onDragStart('album', i, e)}
					ondragend={onDragEnd}
				>
					<span class="text-text-faint w-3 shrink-0 text-center text-[length:var(--text-micro)]">
						{collapsed ? '▸' : '▾'}
					</span>
					<span class="truncate">{item.title}</span>
					<span class="text-text-faint ml-auto text-[length:var(--text-micro)]">
						{item.children?.length ?? 0}
					</span>
				</button>
			{:else}
				<button
					type="button"
					class={cn(
						'flex w-full items-center justify-between gap-2 rounded-sm py-1 pr-2 text-left text-[length:var(--text-body)]',
						isSelected(site.selection, albumSel)
							? 'bg-selected text-selected-text'
							: 'text-text-secondary hover:bg-surface-2',
						isRootLevel && dragIndex === i && dragKind === 'album' ? 'opacity-40' : null,
						focused ? 'ring-accent ring-1 ring-inset' : null
					)}
					style:padding-left="{0.5 + depth * 0.75}rem"
					draggable={isRootLevel ? 'true' : 'false'}
					ondragstart={(e) => isRootLevel && onDragStart('album', i, e)}
					ondragend={onDragEnd}
					onclick={() => {
						focusedKey = item.path;
						select(albumSel);
					}}
					oncontextmenu={(e) =>
						openAlbumMenu(e, item.path, item.title, albumSourceDirFor(item.path))}
					data-testid="tree-album"
					data-album-path={item.path}
				>
					<span class="truncate">{item.title}</span>
					<span class="text-text-faint text-[length:var(--text-micro)]">
						{album?.images.length ?? 0}
					</span>
				</button>
			{/if}
		</li>

		<!-- Recurse into children if this is an expanded group -->
		{#if group && !collapsed}
			{@render navTree(item.children!, depth + 1)}
		{/if}

		<!-- Root-level only: closing drop-gap after the last row -->
		{#if isRootLevel && i === items.length - 1}
			<li
				class={cn(
					'h-1.5 transition-colors',
					dragKind === 'album' && dropIndex === items.length ? 'bg-drop' : null
				)}
				ondragover={(e) => onGapDragOver('album', items.length, e)}
				ondrop={(e) => onGapDrop('album', items.length, e)}
				data-testid="tree-album-gap"
				data-gap={items.length}
			></li>
		{/if}
	{/each}
{/snippet}

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
		<div
			bind:this={treeHost}
			class="flex-1 overflow-y-auto px-1 focus:outline-none"
			data-testid="site-tree"
			tabindex="0"
			role="tree"
			onkeydown={onTreeKeydown}
		>
			<!-- Albums section -->
			<section data-testid="tree-section-albums">
				<div
					class="text-text-faint flex items-center gap-2 px-2 pt-1 pb-1 text-[length:var(--text-micro)] uppercase"
				>
					<span class="flex-1">Albums</span>
					<Button
						variant="ghost"
						size="sm"
						onclick={startCreateAlbum}
						disabled={creatingAlbum}
						data-testid="new-album-btn"
						class="-my-1 h-5 px-1.5"
					>
						+ album
					</Button>
				</div>
				<ul>
					{#if creatingAlbum}
						<li class="px-2 py-1">
							<input
								bind:this={creatingAlbumInput}
								bind:value={creatingAlbumTitle}
								placeholder="Album title…"
								class="bg-surface-0 border-accent text-text-primary w-full rounded-sm border px-2 py-1 text-[length:var(--text-body)] outline-none"
								data-testid="new-album-input"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										commitCreateAlbum();
									} else if (e.key === 'Escape') {
										e.preventDefault();
										cancelCreateAlbum();
									}
								}}
								onblur={commitCreateAlbum}
							/>
						</li>
					{/if}
					{@render navTree(manifest.navigation, 0)}
				</ul>

				{#if hiddenAlbums.length > 0}
					<div
						class="text-text-faint mt-3 flex items-center gap-2 px-2 pt-2 pb-1 text-[length:var(--text-micro)] uppercase"
					>
						<span class="flex-1">Hidden (unnumbered)</span>
					</div>
					<ul data-testid="tree-section-hidden">
						{#each hiddenAlbums as album (album.path)}
							{@const sel = { kind: 'album', albumPath: album.path } satisfies Selection}
							<li>
								<button
									type="button"
									class={cn(
										'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-[length:var(--text-body)]',
										isSelected(site.selection, sel)
											? 'bg-selected text-selected-text'
											: 'text-text-faint hover:bg-surface-2'
									)}
									onclick={() => select(sel)}
									oncontextmenu={(e) =>
										openAlbumMenu(e, album.path, album.title, albumSourceDirFor(album.path))}
									data-testid="tree-album-hidden"
									data-album-path={album.path}
								>
									<span class="truncate italic">{album.title}</span>
									<span class="text-text-faint text-[length:var(--text-micro)]">
										{album.images.length}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

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
						onclick={startCreatePage}
						disabled={creatingPage}
						data-testid="new-page-btn"
						class="-my-1 h-5 px-1.5"
					>
						+ page
					</Button>
				</div>
				<ul>
					{#if creatingPage}
						<li class="px-2 py-1">
							<input
								bind:this={creatingPageInput}
								bind:value={creatingPageTitle}
								placeholder="Page title…"
								class="bg-surface-0 border-accent text-text-primary w-full rounded-sm border px-2 py-1 text-[length:var(--text-body)] outline-none"
								data-testid="new-page-input"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										commitCreatePage();
									} else if (e.key === 'Escape') {
										e.preventDefault();
										cancelCreatePage();
									}
								}}
								onblur={commitCreatePage}
							/>
						</li>
					{/if}
					{#each manifest.pages as page, i (page.slug)}
						{@const sel = { kind: 'page', pageSlug: page.slug } satisfies Selection}
						{@const isRenaming = renamingKey === page.slug}
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
							{#if isRenaming}
								<input
									bind:this={renameInput}
									bind:value={renameDraft}
									class="bg-surface-0 border-accent text-text-primary mx-1 w-[calc(100%-0.5rem)] rounded-sm border px-2 py-1 text-[length:var(--text-body)] outline-none"
									data-testid="tree-rename-input"
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											commitRename({
												kind: 'page',
												slug: page.slug,
												title: page.title,
												filename: pageFilenameFor(page.slug)
											});
										} else if (e.key === 'Escape') {
											e.preventDefault();
											cancelRename();
										}
									}}
									onblur={() =>
										commitRename({
											kind: 'page',
											slug: page.slug,
											title: page.title,
											filename: pageFilenameFor(page.slug)
										})}
								/>
							{:else}
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
							{/if}
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
