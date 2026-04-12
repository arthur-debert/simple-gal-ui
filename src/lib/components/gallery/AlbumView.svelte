<script lang="ts">
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { api } from '$lib/api';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import type { ManifestAlbum, ManifestImage } from '$lib/types/manifest';
	import InlineDescriptionEdit from './InlineDescriptionEdit.svelte';
	import InlineTitleEdit from './InlineTitleEdit.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import IconTrash from '~icons/lucide/trash-2';
	import IconImage from '~icons/lucide/image';
	import IconSettings from '~icons/lucide/settings';
	import { cn } from '$lib/utils';

	interface Props {
		album: ManifestAlbum;
	}

	const { album }: Props = $props();

	// Import drop overlay (OS file drag-drop)
	let isDraggingOver = $state(false);

	// Thumbnail selection state (ephemeral, per-album)
	let selected = $state<Set<string>>(new Set());
	let lastAnchor = $state<string | null>(null);

	// In-album reorder drag state
	let draggingSet = $state<string[] | null>(null);
	let dropAtIndex = $state<number | null>(null); // insertion gap (0..images.length)

	const THUMB_MIME = 'application/x-sgui-thumb-set';

	/**
	 * simple-gal's manifest gives us the url-slug `path` for an album but we
	 * need the on-disk source directory (e.g. "010-Landscapes") for writes.
	 */
	const albumSourceDir = $derived.by(() => {
		if (album.images.length === 0) return album.path;
		const firstPath = album.images[0].source_path;
		const idx = firstPath.lastIndexOf('/');
		return idx === -1 ? '' : firstPath.slice(0, idx);
	});

	// Prune stale selection members when the album changes out from under us
	// (rescan after reorder / rename / delete).
	$effect(() => {
		const valid = new Set(album.images.map((i) => i.source_path));
		let changed = false;
		const next = new Set<string>();
		for (const p of selected) {
			if (valid.has(p)) next.add(p);
			else changed = true;
		}
		if (changed) selected = next;
	});

	function fileUrlFor(img: ManifestImage): string {
		if (!site.home) return '';
		const abs = `${site.home}/${img.source_path}`;
		return `file://${abs.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
	}

	function openDetail(img: ManifestImage): void {
		site.selection = {
			kind: 'image',
			albumPath: album.path,
			imageSourcePath: img.source_path
		};
	}

	function setSelectionTo(paths: string[]): void {
		selected = new Set(paths);
	}

	function toggleSelection(p: string): void {
		const next = new Set(selected);
		if (next.has(p)) next.delete(p);
		else next.add(p);
		selected = next;
	}

	function selectRangeTo(p: string): void {
		if (!lastAnchor) {
			setSelectionTo([p]);
			return;
		}
		const paths = album.images.map((i) => i.source_path);
		const a = paths.indexOf(lastAnchor);
		const b = paths.indexOf(p);
		if (a === -1 || b === -1) {
			setSelectionTo([p]);
			return;
		}
		const [lo, hi] = a <= b ? [a, b] : [b, a];
		const next = new Set(selected);
		for (let i = lo; i <= hi; i++) next.add(paths[i]);
		selected = next;
	}

	function onThumbClick(img: ManifestImage, e: MouseEvent): void {
		const mod = e.metaKey || e.ctrlKey;
		if (e.shiftKey) {
			selectRangeTo(img.source_path);
		} else if (mod) {
			toggleSelection(img.source_path);
			lastAnchor = img.source_path;
		} else {
			setSelectionTo([img.source_path]);
			lastAnchor = img.source_path;
		}
	}

	function onThumbDoubleClick(img: ManifestImage): void {
		openDetail(img);
	}

	function clearSelection(): void {
		selected = new Set();
		lastAnchor = null;
	}

	function onGridClick(e: MouseEvent): void {
		// Only clear when the click landed on the grid surface itself, not on
		// a thumbnail that bubbled up.
		if (e.target === e.currentTarget) clearSelection();
	}

	async function onKeydown(e: KeyboardEvent): Promise<void> {
		if (!site.home) return;
		// Ignore keystrokes while an input/textarea has focus (e.g. caption editor)
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;

		if (e.key === 'Escape') {
			clearSelection();
			return;
		}
		if (e.key === 'Enter' && selected.size === 1) {
			const only = [...selected][0];
			const img = album.images.find((i) => i.source_path === only);
			if (img) openDetail(img);
			return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
			e.preventDefault();
			await deleteSelection();
		}
	}

	async function deleteSelection(): Promise<void> {
		if (!site.home || selected.size === 0) return;
		const count = selected.size;
		if (!window.confirm(`Move ${count} image${count === 1 ? '' : 's'} to trash?`)) return;
		try {
			for (const p of selected) {
				await api.fs.deleteImage({ home: site.home, imageSourcePath: p });
			}
			showToast({ kind: 'success', title: `Trashed ${count} image${count === 1 ? '' : 's'}` });
			clearSelection();
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Delete failed', body: (err as Error).message });
		}
	}

	async function onUseAsThumbnail(): Promise<void> {
		if (!site.home || selected.size !== 1) return;
		const imageSourcePath = [...selected][0];
		try {
			const result = await api.fs.setAlbumThumbnail({
				home: site.home,
				albumPath: albumSourceDir,
				imageSourcePath
			});
			if (result.noOp) {
				showToast({ kind: 'info', title: 'Already the thumbnail' });
				return;
			}
			showToast({
				kind: 'success',
				title: 'Thumbnail updated',
				body: result.previousThumb
					? `Previous: ${result.previousThumb.new.split('/').pop()}`
					: undefined
			});
			await rescanCurrentHome();
			// Re-pin selection to the renamed image
			selected = new Set([result.newThumb.new]);
		} catch (err) {
			showToast({ kind: 'error', title: 'Set thumbnail failed', body: (err as Error).message });
		}
	}

	async function onDeleteAlbum(): Promise<void> {
		if (!site.home) return;
		if (!window.confirm(`Move album "${album.title}" to trash?`)) return;
		try {
			await api.fs.deleteEntry({ home: site.home, entryPath: albumSourceDir });
			showToast({ kind: 'success', title: 'Album moved to trash', body: album.title });
			site.selection = { kind: 'none' };
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Delete failed', body: (err as Error).message });
		}
	}

	// Context-aware header X button: delete selection or delete album
	const headerDeleteLabel = $derived.by(() =>
		selected.size > 0 ? `Delete ${selected.size} selected` : 'Delete album'
	);

	async function onHeaderDelete(): Promise<void> {
		if (selected.size > 0) {
			await deleteSelection();
		} else {
			await onDeleteAlbum();
		}
	}

	function onConfigureAlbum(): void {
		if (!site.home) return;
		site.selection = {
			kind: 'config',
			dirPath: `${site.home}/${albumSourceDir}`,
			levelKind: 'album'
		};
	}

	// --- Inline title rename ---------------------------------------------

	async function onCommitRename(newTitle: string): Promise<void> {
		if (!site.home) return;
		try {
			const result = await api.fs.renameEntry({
				home: site.home,
				entryPath: albumSourceDir,
				newTitle
			});
			if (!result.ok) {
				showToast({ kind: 'error', title: 'Rename failed' });
				return;
			}

			// Compute the new source dir (basename preserved at same depth).
			const slash = albumSourceDir.lastIndexOf('/');
			const parent = slash === -1 ? '' : albumSourceDir.slice(0, slash);
			const newSourceDir = parent ? `${parent}/${result.newName}` : result.newName;

			await rescanCurrentHome();

			// Re-pin selection to the album whose first image now lives under
			// newSourceDir.
			const manifest = site.manifest;
			if (manifest) {
				const renamed = manifest.albums.find((a) => {
					if (a.images.length === 0) return false;
					const sd = a.images[0].source_path;
					const dirSeg = sd.slice(0, sd.lastIndexOf('/'));
					return dirSeg === newSourceDir;
				});
				if (renamed) {
					site.selection = { kind: 'album', albumPath: renamed.path };
				}
			}
			showToast({ kind: 'success', title: 'Renamed', body: result.newName });
		} catch (err) {
			showToast({ kind: 'error', title: 'Rename failed', body: (err as Error).message });
		}
	}

	// --- Inline description save -----------------------------------------

	async function onSaveDescription(body: string): Promise<void> {
		if (!site.home) return;
		const result = await api.fs.writeDescription({
			home: site.home,
			albumPath: albumSourceDir,
			body
		});
		if (result.ok) {
			showToast({
				kind: 'success',
				title: 'Description saved',
				body: result.writtenPath ? 'description.md updated' : 'description removed'
			});
			await rescanCurrentHome();
		} else {
			showToast({ kind: 'error', title: 'Save failed' });
		}
	}

	// --- OS file drag-drop import ----------------------------------------

	function onOuterDragEnter(e: DragEvent): void {
		if (!e.dataTransfer) return;
		if (Array.from(e.dataTransfer.types).includes('Files')) {
			isDraggingOver = true;
		}
	}

	function onOuterDragOver(e: DragEvent): void {
		if (!e.dataTransfer) return;
		if (Array.from(e.dataTransfer.types).includes('Files')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
			isDraggingOver = true;
		}
	}

	function onOuterDragLeave(e: DragEvent): void {
		if ((e.currentTarget as HTMLElement | null)?.contains(e.relatedTarget as Node)) return;
		isDraggingOver = false;
	}

	async function onOuterDrop(e: DragEvent): Promise<void> {
		if (!e.dataTransfer || !site.home) return;
		// Only handle OS file drops here; in-album reorder is handled on thumbs.
		if (!Array.from(e.dataTransfer.types).includes('Files')) return;
		e.preventDefault();
		isDraggingOver = false;
		const files = Array.from(e.dataTransfer.files);
		if (files.length === 0) return;
		const sourcePaths = files
			.map((f) => api.fs.getPathForFile(f))
			.filter((p): p is string => typeof p === 'string' && p.length > 0);
		if (sourcePaths.length === 0) {
			showToast({ kind: 'warning', title: 'No valid file paths found' });
			return;
		}
		try {
			const result = await api.fs.importImages({
				home: site.home,
				albumPath: albumSourceDir,
				sourcePaths
			});
			showToast({
				kind: 'success',
				title: `Imported ${result.imported.length} image${result.imported.length === 1 ? '' : 's'}`,
				body: result.skipped.length > 0 ? `${result.skipped.length} skipped` : undefined
			});
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Import failed', body: (err as Error).message });
		}
	}

	// --- Thumbnail reorder drag ------------------------------------------

	function onThumbDragStart(img: ManifestImage, e: DragEvent): void {
		if (!e.dataTransfer) return;
		// If the dragged thumb is in the selection, drag the whole selection.
		// Otherwise drag just this one (and leave selection untouched — Finder-style).
		const payload = selected.has(img.source_path) ? [...selected] : [img.source_path];
		draggingSet = payload;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData(THUMB_MIME, JSON.stringify(payload));
	}

	function onThumbDragOver(index: number, e: DragEvent): void {
		if (draggingSet === null || !e.dataTransfer) return;
		if (!Array.from(e.dataTransfer.types).includes(THUMB_MIME)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		// Decide left-half (gap = index) vs right-half (gap = index + 1).
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const pastMid = e.clientX - rect.left > rect.width / 2;
		dropAtIndex = pastMid ? index + 1 : index;
	}

	async function onThumbDrop(_index: number, e: DragEvent): Promise<void> {
		if (draggingSet === null || !site.home || dropAtIndex === null) return;
		e.preventDefault();
		e.stopPropagation();
		const gap = dropAtIndex;
		const draggedPaths = draggingSet;
		draggingSet = null;
		dropAtIndex = null;

		const allPaths = album.images.map((i) => i.source_path);
		const remaining = allPaths.filter((p) => !draggedPaths.includes(p));
		// Translate the gap index from "all images" coordinates to "remaining" coordinates
		// by counting how many dragged items were before the gap.
		const draggedBeforeGap = draggedPaths.filter((p) => allPaths.indexOf(p) < gap).length;
		const insertAt = gap - draggedBeforeGap;
		const newOrder = [
			...remaining.slice(0, insertAt),
			...draggedPaths,
			...remaining.slice(insertAt)
		];

		try {
			await api.fs.reorderImages({
				home: site.home,
				albumPath: albumSourceDir,
				orderedSourcePaths: newOrder
			});
			showToast({ kind: 'success', title: 'Reordered' });
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Reorder failed', body: (err as Error).message });
		}
	}

	function onThumbDragEnd(): void {
		draggingSet = null;
		dropAtIndex = null;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="relative flex h-full flex-col"
	data-testid="album-view"
	ondragenter={onOuterDragEnter}
	ondragover={onOuterDragOver}
	ondragleave={onOuterDragLeave}
	ondrop={onOuterDrop}
	role="presentation"
>
	<header
		class="border-border bg-surface-1 flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
	>
		<div class="min-w-0 flex-1">
			<div class="text-text-primary text-[length:var(--text-label)] font-semibold">
				<InlineTitleEdit value={album.title} onCommit={onCommitRename} />
			</div>
			<div class="text-text-muted mt-1 text-[length:var(--text-caption)]">
				{album.images.length} image{album.images.length === 1 ? '' : 's'}
				{#if selected.size > 0}
					<span class="text-accent">· {selected.size} selected</span>
				{:else}
					<span class="text-text-faint">· drag images here to import</span>
				{/if}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			{#if selected.size === 1}
				<Button
					variant="outline"
					size="sm"
					onclick={onUseAsThumbnail}
					data-testid="album-use-as-thumb-btn"
					class="shrink-0"
				>
					<IconImage class="h-3.5 w-3.5" />
					Use as Thumbnail
				</Button>
			{/if}
			<Button
				variant="outline"
				size="icon"
				onclick={onConfigureAlbum}
				aria-label="Configure album"
				title="Configure album"
				data-testid="album-configure-btn"
				class="shrink-0"
			>
				<IconSettings class="h-4 w-4" />
			</Button>
			<Button
				variant="danger"
				size="icon"
				onclick={onHeaderDelete}
				aria-label={headerDeleteLabel}
				title={headerDeleteLabel}
				data-testid="album-delete-btn"
				data-selection-count={selected.size}
				class="shrink-0"
			>
				<IconTrash class="h-4 w-4" />
			</Button>
		</div>
	</header>

	<InlineDescriptionEdit
		value={album.description ?? ''}
		onSave={onSaveDescription}
		placeholder="Add description\u2026"
	/>

	<div
		class="bg-surface-0 min-h-0 flex-1 overflow-y-auto p-4"
		onclick={onGridClick}
		role="presentation"
	>
		<div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3" role="presentation">
			{#each album.images as img, i (img.source_path)}
				{@const isSel = selected.has(img.source_path)}
				{@const isDrag = draggingSet?.includes(img.source_path) ?? false}
				<div
					class={cn(
						'group bg-surface-1 relative flex flex-col rounded-md border transition-colors',
						isSel ? 'border-accent ring-accent ring-2' : 'border-border hover:border-border-strong',
						isDrag ? 'opacity-40' : null
					)}
					draggable="true"
					ondragstart={(e) => onThumbDragStart(img, e)}
					ondragover={(e) => onThumbDragOver(i, e)}
					ondrop={(e) => onThumbDrop(i, e)}
					ondragend={onThumbDragEnd}
					role="listitem"
				>
					<!-- Left insertion bar — sits just outside the card on the left edge -->
					{#if dropAtIndex === i && draggingSet !== null}
						<div
							class="bg-drop pointer-events-none absolute top-0 bottom-0 -left-2 z-10 w-1 rounded-full"
							data-testid="drop-bar-left"
						></div>
					{/if}
					<!-- Right insertion bar — sits just outside the card on the right edge -->
					{#if dropAtIndex === i + 1 && draggingSet !== null}
						<div
							class="bg-drop pointer-events-none absolute top-0 -right-2 bottom-0 z-10 w-1 rounded-full"
							data-testid="drop-bar-right"
						></div>
					{/if}
					<button
						type="button"
						class="flex flex-col overflow-hidden rounded-md text-left"
						onclick={(e) => onThumbClick(img, e)}
						ondblclick={() => onThumbDoubleClick(img)}
						data-testid="album-thumb"
						data-image-path={img.source_path}
						data-selected={isSel ? 'true' : 'false'}
					>
						<div class="bg-surface-2 relative aspect-[4/5] w-full overflow-hidden">
							<img
								src={fileUrlFor(img)}
								alt={img.title ?? img.filename}
								class="h-full w-full object-cover"
								loading="lazy"
								draggable="false"
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
				</div>
			{/each}
		</div>
	</div>

	{#if isDraggingOver}
		<div
			class="border-drop bg-accent-muted text-text-primary pointer-events-none absolute inset-4 flex items-center justify-center rounded-md border-2 border-dashed text-[length:var(--text-label)] font-semibold"
			data-testid="drop-overlay"
		>
			Drop images to import
		</div>
	{/if}
</div>
