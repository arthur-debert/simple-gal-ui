<script lang="ts">
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { api } from '$lib/api';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import type { ManifestImage } from '$lib/types/manifest';
	import Button from '$lib/components/ui/Button.svelte';
	import IconImage from '~icons/lucide/image';

	interface Props {
		albumPath: string;
		image: ManifestImage;
	}

	const { albumPath, image }: Props = $props();

	let title = $state(image.title ?? '');
	let caption = $state(image.description ?? '');
	let saving = $state(false);
	let lastSavedImagePath = $state(image.source_path);

	$effect(() => {
		if (image.source_path !== lastSavedImagePath) {
			title = image.title ?? '';
			caption = image.description ?? '';
			lastSavedImagePath = image.source_path;
		}
	});

	const dirty = $derived(title !== (image.title ?? '') || caption !== (image.description ?? ''));

	const fileUrl = $derived.by(() => {
		if (!site.home) return '';
		const abs = `${site.home}/${image.source_path}`;
		return `file://${abs.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
	});

	function backToAlbum(): void {
		site.selection = { kind: 'album', albumPath };
	}

	async function save(): Promise<void> {
		if (!site.home || saving || !dirty) return;
		saving = true;
		try {
			const home = site.home;
			let currentSourcePath = image.source_path;

			if (title.trim() !== (image.title ?? '').trim()) {
				const renameResult = await api.fs.renameImage({
					home,
					imageSourcePath: currentSourcePath,
					newTitle: title.trim()
				});
				if (renameResult.ok) {
					const dir = currentSourcePath.split('/').slice(0, -1).join('/');
					currentSourcePath = dir ? `${dir}/${renameResult.newFilename}` : renameResult.newFilename;
				}
			}

			const captionResult = await api.fs.writeSidecar({
				home,
				imageSourcePath: currentSourcePath,
				caption
			});

			if (!captionResult.ok) {
				showToast({ kind: 'error', title: 'Failed to save caption' });
				return;
			}

			showToast({
				kind: 'success',
				title: 'Saved',
				body: captionResult.deleted ? 'Sidecar removed' : 'Caption written'
			});

			await rescanCurrentHome();

			if (currentSourcePath !== image.source_path) {
				site.selection = {
					kind: 'image',
					albumPath,
					imageSourcePath: currentSourcePath
				};
			}
		} catch (err) {
			showToast({ kind: 'error', title: 'Save failed', body: (err as Error).message });
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent): void {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			save();
		}
	}

	/**
	 * Derive the album's on-disk source directory the same way AlbumView does:
	 * strip the image filename off its source_path.
	 */
	const albumSourceDir = $derived.by(() => {
		const idx = image.source_path.lastIndexOf('/');
		return idx === -1 ? '' : image.source_path.slice(0, idx);
	});

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
			// Re-pin this editor to the renamed image
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

<svelte:window onkeydown={onKeydown} />

<div class="flex h-full flex-col" data-testid="image-detail-editor">
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
		<div class="flex min-h-[60%] items-center justify-center p-6">
			<img
				src={fileUrl}
				alt={image.title ?? image.filename}
				class="border-border max-h-[40vh] max-w-full rounded-md border object-contain"
			/>
		</div>

		<div class="border-border border-t px-4 py-4">
			<form
				class="flex flex-col gap-3"
				onsubmit={(e) => {
					e.preventDefault();
					save();
				}}
			>
				<label class="flex flex-col gap-1">
					<span class="text-text-muted text-[length:var(--text-caption)]">Title</span>
					<input
						type="text"
						bind:value={title}
						class="bg-surface-1 border-border focus:border-accent text-text-primary rounded-sm border px-2 py-1.5 text-[length:var(--text-body)] outline-none"
						data-testid="image-title-input"
					/>
				</label>

				<label class="flex flex-col gap-1">
					<span class="text-text-muted text-[length:var(--text-caption)]">
						Caption <span class="text-text-faint">· saved to sidecar .txt</span>
					</span>
					<textarea
						bind:value={caption}
						rows="4"
						class="bg-surface-1 border-border focus:border-accent text-text-primary resize-y rounded-sm border px-2 py-1.5 text-[length:var(--text-body)] outline-none"
						data-testid="image-caption-input"
					></textarea>
				</label>

				<div class="flex items-center gap-2">
					<Button
						type="submit"
						variant="default"
						size="sm"
						disabled={!dirty || saving}
						data-testid="image-save-btn"
					>
						{saving ? 'Saving…' : 'Save (⌘S)'}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={onUseAsThumbnail}
						data-testid="image-use-as-thumb-btn"
					>
						<IconImage class="h-3.5 w-3.5" />
						Use as Thumbnail
					</Button>
					{#if dirty && !saving}
						<span class="text-text-faint text-[length:var(--text-caption)]">unsaved changes</span>
					{/if}
				</div>
			</form>

			<dl
				class="border-border text-text-muted mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t pt-3 text-[length:var(--text-caption)]"
			>
				<dt>Number</dt>
				<dd class="text-text-secondary">#{image.number}</dd>
				<dt>Filename</dt>
				<dd class="text-text-secondary truncate">{image.filename}</dd>
				<dt>Slug</dt>
				<dd class="text-text-secondary truncate">{image.slug}</dd>
			</dl>
		</div>
	</div>
</div>
