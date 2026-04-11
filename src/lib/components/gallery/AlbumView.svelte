<script lang="ts">
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { api } from '$lib/api';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import type { ManifestAlbum, ManifestImage } from '$lib/types/manifest';
	import DescriptionEditor from './DescriptionEditor.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		album: ManifestAlbum;
	}

	const { album }: Props = $props();

	let isDraggingOver = $state(false);
	let draggedIndex = $state<number | null>(null);
	let overIndex = $state<number | null>(null);

	/**
	 * simple-gal's manifest gives us the url-slug `path` for an album but we
	 * need the on-disk source directory (e.g. "010-Landscapes") for writes.
	 * For the test fixture and typical layouts the source dir is the parent
	 * of the first image's source_path.
	 */
	const albumSourceDir = $derived.by(() => {
		if (album.images.length === 0) return album.path;
		const firstPath = album.images[0].source_path;
		const idx = firstPath.lastIndexOf('/');
		return idx === -1 ? '' : firstPath.slice(0, idx);
	});

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

	function onDragEnter(e: DragEvent): void {
		if (!e.dataTransfer) return;
		if (Array.from(e.dataTransfer.types).includes('Files')) {
			isDraggingOver = true;
		}
	}

	function onDragOver(e: DragEvent): void {
		if (!e.dataTransfer) return;
		if (Array.from(e.dataTransfer.types).includes('Files')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
			isDraggingOver = true;
		}
	}

	function onDragLeave(e: DragEvent): void {
		if ((e.currentTarget as HTMLElement | null)?.contains(e.relatedTarget as Node)) return;
		isDraggingOver = false;
	}

	async function onDrop(e: DragEvent): Promise<void> {
		if (!e.dataTransfer || !site.home) return;
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

	function onThumbDragStart(index: number, e: DragEvent): void {
		if (!e.dataTransfer) return;
		// Only start a reorder drag if no OS files are involved
		draggedIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/x-sgui-thumb', String(index));
	}

	function onThumbDragOver(index: number, e: DragEvent): void {
		if (draggedIndex === null) return;
		if (!e.dataTransfer) return;
		if (!Array.from(e.dataTransfer.types).includes('application/x-sgui-thumb')) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		overIndex = index;
	}

	async function onThumbDrop(index: number, e: DragEvent): Promise<void> {
		if (draggedIndex === null || !site.home) return;
		e.preventDefault();
		e.stopPropagation();
		const from = draggedIndex;
		const to = index;
		draggedIndex = null;
		overIndex = null;
		if (from === to) return;

		const ordered = album.images.map((i) => i.source_path);
		const [moved] = ordered.splice(from, 1);
		ordered.splice(to, 0, moved);

		try {
			await api.fs.reorderImages({
				home: site.home,
				albumPath: albumSourceDir,
				orderedSourcePaths: ordered
			});
			showToast({ kind: 'success', title: 'Reordered' });
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Reorder failed', body: (err as Error).message });
		}
	}

	function onThumbDragEnd(): void {
		draggedIndex = null;
		overIndex = null;
	}
</script>

<div
	class="relative flex h-full flex-col"
	data-testid="album-view"
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
	role="presentation"
>
	<header
		class="border-border bg-surface-1 flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
	>
		<div class="min-w-0 flex-1">
			<div class="text-text-primary truncate text-[length:var(--text-label)] font-semibold">
				{album.title}
			</div>
			<div class="text-text-muted mt-1 text-[length:var(--text-caption)]">
				{album.images.length} image{album.images.length === 1 ? '' : 's'}
				<span class="text-text-faint">· drag images here to import</span>
			</div>
		</div>
		<Button
			variant="ghost"
			size="icon"
			onclick={onDeleteAlbum}
			aria-label="Delete album"
			data-testid="album-delete-btn"
			class="text-text-muted hover:text-danger hover:bg-danger/10 shrink-0"
		>
			<span aria-hidden="true" class="text-[length:var(--text-label)]">×</span>
		</Button>
	</header>

	<DescriptionEditor {album} {albumSourceDir} />

	<div class="bg-surface-0 min-h-0 flex-1 overflow-y-auto p-4">
		<div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
			{#each album.images as img, i (img.source_path)}
				<div
					class={cn(
						'group bg-surface-1 border-border hover:border-border-strong relative flex flex-col overflow-hidden rounded-md border transition-colors',
						overIndex === i && draggedIndex !== null && draggedIndex !== i
							? 'border-drop border-2'
							: null,
						draggedIndex === i ? 'opacity-40' : null
					)}
					draggable="true"
					ondragstart={(e) => onThumbDragStart(i, e)}
					ondragover={(e) => onThumbDragOver(i, e)}
					ondrop={(e) => onThumbDrop(i, e)}
					ondragend={onThumbDragEnd}
					role="listitem"
				>
					<button
						type="button"
						class="flex flex-col text-left"
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
