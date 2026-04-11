<script lang="ts">
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { api } from '$lib/api';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ManifestPage } from '$lib/types/manifest';

	interface Props {
		page: ManifestPage;
	}

	const { page }: Props = $props();

	/**
	 * simple-gal's manifest exposes a page's slug but not its source filename.
	 * We reconstruct it from the page ordering: `{sort_key NNN-}{slug}.md`.
	 * For numbered pages the prefix matches sort_key (already NNN-padded).
	 */
	const pageFilename = $derived.by(() => {
		const prefix = page.in_nav ? `${String(page.sort_key).padStart(3, '0')}-` : '';
		return `${prefix}${page.link_title}.md`;
	});

	let body = $state(page.body ?? '');
	let lastSlug = $state(page.slug);
	let saving = $state(false);

	$effect(() => {
		if (page.slug !== lastSlug) {
			body = page.body ?? '';
			lastSlug = page.slug;
		}
	});

	const dirty = $derived(body !== (page.body ?? ''));

	async function save(): Promise<void> {
		if (!site.home || saving) return;
		saving = true;
		try {
			const result = await api.fs.writePage({
				home: site.home,
				pagePath: pageFilename,
				body
			});
			if (result.ok) {
				showToast({ kind: 'success', title: 'Page saved', body: pageFilename });
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

	function onKeydown(e: KeyboardEvent): void {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			save();
		}
	}

	async function onDeletePage(): Promise<void> {
		if (!site.home) return;
		if (!window.confirm(`Move page "${page.title}" to trash?`)) return;
		try {
			await api.fs.deleteEntry({ home: site.home, entryPath: pageFilename });
			showToast({ kind: 'success', title: 'Page moved to trash', body: page.title });
			site.selection = { kind: 'none' };
			await rescanCurrentHome();
		} catch (err) {
			showToast({ kind: 'error', title: 'Delete failed', body: (err as Error).message });
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-full flex-col" data-testid="page-editor">
	<header
		class="border-border bg-surface-1 flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
	>
		<div class="min-w-0 flex-1">
			<div class="text-text-primary truncate text-[length:var(--text-label)] font-semibold">
				{page.title}
			</div>
			<div class="text-text-muted mt-0.5 truncate text-[length:var(--text-caption)]">
				{pageFilename}
				{#if page.is_link}
					<span class="text-text-faint ml-2">· external link</span>
				{/if}
			</div>
		</div>
		<Button
			variant="ghost"
			size="icon"
			onclick={onDeletePage}
			aria-label="Delete page"
			data-testid="page-delete-btn"
			class="text-text-muted hover:text-danger hover:bg-danger/10 shrink-0"
		>
			<span aria-hidden="true" class="text-[length:var(--text-label)]">×</span>
		</Button>
	</header>

	<div class="bg-surface-0 min-h-0 flex-1 overflow-y-auto">
		<div class="flex h-full flex-col gap-3 p-4">
			<textarea
				bind:value={body}
				class="bg-surface-1 border-border focus:border-accent text-text-primary flex-1 resize-none rounded-sm border p-3 font-mono text-[length:var(--text-body)] outline-none"
				placeholder="Markdown body…"
				data-testid="page-body-input"
			></textarea>
			<div class="flex items-center gap-2">
				<Button
					variant="default"
					size="sm"
					disabled={!dirty || saving}
					onclick={save}
					data-testid="page-save-btn"
				>
					{saving ? 'Saving…' : 'Save (⌘S)'}
				</Button>
				{#if dirty && !saving}
					<span class="text-text-faint text-[length:var(--text-caption)]">unsaved changes</span>
				{/if}
			</div>
		</div>
	</div>
</div>
