<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import MarkdownEditor from '$lib/components/markdown/MarkdownEditor.svelte';
	import { api } from '$lib/api';
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import type { ManifestAlbum } from '$lib/types/manifest';

	interface Props {
		album: ManifestAlbum;
		albumSourceDir: string;
	}

	const { album, albumSourceDir }: Props = $props();

	let body = $state(album.description ?? '');
	let lastAlbumPath = $state(album.path);
	let saving = $state(false);
	let open = $state(false);

	$effect(() => {
		if (album.path !== lastAlbumPath) {
			body = album.description ?? '';
			lastAlbumPath = album.path;
		}
	});

	const dirty = $derived(body !== (album.description ?? ''));

	async function save(): Promise<void> {
		if (!site.home || saving) return;
		saving = true;
		try {
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
		} catch (err) {
			showToast({ kind: 'error', title: 'Save failed', body: (err as Error).message });
		} finally {
			saving = false;
		}
	}
</script>

<div class="border-border bg-surface-1 border-b" data-testid="description-editor">
	<button
		type="button"
		class="text-text-muted hover:text-text-primary flex w-full items-center gap-2 px-4 py-2 text-left text-[length:var(--text-caption)]"
		onclick={() => (open = !open)}
	>
		<span>{open ? '▾' : '▸'}</span>
		<span class="font-semibold tracking-wider uppercase">Description</span>
		{#if dirty}
			<span class="text-warning">· unsaved</span>
		{/if}
	</button>
	{#if open}
		<div class="px-4 pb-3">
			<div class="border-border h-32 rounded-sm border" data-testid="description-input-wrapper">
				<MarkdownEditor
					bind:value={body}
					placeholder="Markdown description (description.md)"
					data-testid="description-input"
				/>
			</div>
			<div class="mt-2 flex items-center gap-2">
				<Button
					variant="default"
					size="sm"
					disabled={!dirty || saving}
					onclick={save}
					data-testid="description-save-btn"
				>
					{saving ? 'Saving…' : 'Save'}
				</Button>
			</div>
		</div>
	{/if}
</div>
