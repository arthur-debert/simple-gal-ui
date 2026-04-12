<script lang="ts">
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { api } from '$lib/api';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import type { ManifestImage } from '$lib/types/manifest';
	import Button from '$lib/components/ui/Button.svelte';
	import InlineTitleEdit from './InlineTitleEdit.svelte';
	import InlineDescriptionEdit from './InlineDescriptionEdit.svelte';
	import IconImage from '~icons/lucide/image';

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

	/**
	 * Derive the album's on-disk source directory the same way AlbumView does:
	 * strip the image filename off its source_path.
	 */
	const albumSourceDir = $derived.by(() => {
		const idx = image.source_path.lastIndexOf('/');
		return idx === -1 ? '' : image.source_path.slice(0, idx);
	});

	// --- Inline title (caption) rename ------------------------------------

	async function onCommitRename(newTitle: string): Promise<void> {
		if (!site.home) return;
		try {
			const renameResult = await api.fs.renameImage({
				home: site.home,
				imageSourcePath: image.source_path,
				newTitle: newTitle.trim()
			});
			if (!renameResult.ok) {
				showToast({ kind: 'error', title: 'Rename failed' });
				return;
			}

			const dir = image.source_path.split('/').slice(0, -1).join('/');
			const newSourcePath = dir ? `${dir}/${renameResult.newFilename}` : renameResult.newFilename;

			showToast({ kind: 'success', title: 'Renamed', body: renameResult.newFilename });
			await rescanCurrentHome();

			site.selection = {
				kind: 'image',
				albumPath,
				imageSourcePath: newSourcePath
			};
		} catch (err) {
			showToast({ kind: 'error', title: 'Rename failed', body: (err as Error).message });
		}
	}

	// --- Inline description (sidecar .txt) save ---------------------------

	async function onSaveDescription(caption: string): Promise<void> {
		if (!site.home) return;
		const result = await api.fs.writeSidecar({
			home: site.home,
			imageSourcePath: image.source_path,
			caption
		});
		if (!result.ok) {
			showToast({ kind: 'error', title: 'Failed to save caption' });
			return;
		}
		showToast({
			kind: 'success',
			title: 'Saved',
			body: result.deleted ? 'Sidecar removed' : 'Caption written'
		});
		await rescanCurrentHome();
	}

	// --- Thumbnail --------------------------------------------------------

	async function onUseAsThumbnail(): Promise<void> {
		if (!site.home) return;
		try {
			const result = await api.fs.setAlbumThumbnail({
				home: site.home,
				albumPath: albumSourceDir,
				imageSourcePath: image.source_path
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
			site.selection = {
				kind: 'image',
				albumPath,
				imageSourcePath: result.newThumb.new
			};
		} catch (err) {
			showToast({ kind: 'error', title: 'Set thumbnail failed', body: (err as Error).message });
		}
	}
</script>

<div class="flex h-full flex-col" data-testid="image-detail-editor">
	<header
		class="border-border bg-surface-1 flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
	>
		<div class="min-w-0 flex-1">
			<div class="text-text-primary text-[length:var(--text-label)] font-semibold">
				<InlineTitleEdit value={image.title ?? image.filename} onCommit={onCommitRename} />
			</div>
			<div class="text-text-muted mt-0.5 truncate text-[length:var(--text-caption)]">
				{image.source_path}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={onUseAsThumbnail}
				data-testid="image-use-as-thumb-btn"
				class="shrink-0"
			>
				<IconImage class="h-3.5 w-3.5" />
				Use as Thumbnail
			</Button>
			<Button variant="ghost" size="sm" onclick={backToAlbum}>&#x2190; Album</Button>
		</div>
	</header>

	<InlineDescriptionEdit
		value={image.description ?? ''}
		onSave={onSaveDescription}
		placeholder="Add description&#x2026;"
	/>

	<div class="bg-surface-0 min-h-0 flex-1 overflow-y-auto">
		<div class="flex min-h-[60%] items-center justify-center p-6">
			<img
				src={fileUrl}
				alt={image.title ?? image.filename}
				class="border-border max-h-[40vh] max-w-full rounded-md border object-contain"
			/>
		</div>
	</div>
</div>
