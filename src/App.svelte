<script lang="ts">
	import ResizablePanes from '$lib/components/ui/ResizablePanes.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Separator from '$lib/components/ui/Separator.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import SiteTree from '$lib/components/tree/SiteTree.svelte';
	import AlbumView from '$lib/components/gallery/AlbumView.svelte';
	import ImageDetailReadOnly from '$lib/components/gallery/ImageDetailReadOnly.svelte';
	import PageView from '$lib/components/pages/PageView.svelte';
	import {
		site,
		openGalleryHomeDialog,
		restoreLastGalleryHome,
		loadGalleryHome
	} from '$lib/stores/siteStore.svelte';
	import { api } from '$lib/api';

	let version = $state<string>('…');
	let simpleGalInfo = $state<string>('…');

	const selectedAlbum = $derived.by(() => {
		const sel = site.selection;
		const manifest = site.manifest;
		if (!manifest) return null;
		if (sel.kind === 'album' || sel.kind === 'image') {
			return manifest.albums.find((a) => a.path === sel.albumPath) ?? null;
		}
		return null;
	});

	const selectedImage = $derived.by(() => {
		const sel = site.selection;
		const manifest = site.manifest;
		if (!manifest || sel.kind !== 'image') return null;
		const album = manifest.albums.find((a) => a.path === sel.albumPath);
		return album?.images.find((i) => i.source_path === sel.imageSourcePath) ?? null;
	});

	const selectedPage = $derived.by(() => {
		const sel = site.selection;
		const manifest = site.manifest;
		if (!manifest || sel.kind !== 'page') return null;
		return manifest.pages.find((p) => p.slug === sel.pageSlug) ?? null;
	});

	$effect(() => {
		api.app.version().then((v) => (version = v));
		api.simpleGal.version().then((r) => {
			simpleGalInfo = r.ok ? `${r.version}` : `not found`;
		});
		const envHome = new URLSearchParams(window.location.search).get('home');
		if (envHome) {
			loadGalleryHome(envHome);
		} else {
			restoreLastGalleryHome();
		}
		const unsubscribe = api.gallery.onHomeChanged((p) => loadGalleryHome(p));
		return unsubscribe;
	});
</script>

<div class="flex h-full w-full flex-col">
	<header
		class="border-border bg-surface-header flex h-10 shrink-0 items-center gap-3 border-b px-3 backdrop-blur"
		data-testid="app-header"
	>
		<div class="text-text-primary text-[length:var(--text-label)] font-semibold">simple-gal-ui</div>
		<Separator orientation="vertical" class="h-4" />
		<div class="text-text-muted text-[length:var(--text-caption)]">v{version}</div>
		{#if site.home}
			<Separator orientation="vertical" class="h-4" />
			<div
				class="text-text-muted truncate text-[length:var(--text-caption)]"
				data-testid="current-home"
			>
				{site.home}
			</div>
		{/if}
		<div class="flex-1"></div>
		<Button variant="outline" size="sm" onclick={openGalleryHomeDialog}>Open gallery home…</Button>
		<div class="text-text-faint text-[length:var(--text-caption)]">sg: {simpleGalInfo}</div>
	</header>

	<div class="min-h-0 flex-1">
		{#snippet left()}
			<SiteTree />
		{/snippet}

		{#snippet center()}
			{#if site.loading}
				<div
					class="text-text-muted flex h-full items-center justify-center text-[length:var(--text-caption)]"
				>
					Scanning gallery…
				</div>
			{:else if !site.manifest}
				<div class="flex h-full flex-col items-center justify-center gap-3 p-6">
					<div class="text-text-secondary text-[length:var(--text-label)]">
						Welcome to simple-gal-ui
					</div>
					<div class="text-text-faint max-w-md text-center text-[length:var(--text-caption)]">
						Open a gallery home to see its structure. Everything on disk remains the source of
						truth.
					</div>
					<Button variant="default" size="md" onclick={openGalleryHomeDialog}>
						Open gallery home…
					</Button>
				</div>
			{:else if site.selection.kind === 'image' && selectedImage && selectedAlbum}
				<ImageDetailReadOnly albumPath={selectedAlbum.path} image={selectedImage} />
			{:else if site.selection.kind === 'album' && selectedAlbum}
				<AlbumView album={selectedAlbum} />
			{:else if site.selection.kind === 'page' && selectedPage}
				<PageView page={selectedPage} />
			{:else}
				<div
					class="text-text-faint flex h-full items-center justify-center text-[length:var(--text-caption)]"
				>
					Select an album or page in the left pane
				</div>
			{/if}
		{/snippet}

		{#snippet right()}
			<div class="flex h-full flex-col p-3">
				<div
					class="text-text-muted mb-2 text-[length:var(--text-micro)] font-semibold tracking-wider uppercase"
				>
					Preview
				</div>
				<div
					class="border-border text-text-faint flex flex-1 items-center justify-center rounded-md border border-dashed px-4 text-center text-[length:var(--text-caption)]"
				>
					Preview will appear here once the build pipeline lands (PR3)
				</div>
			</div>
		{/snippet}

		<ResizablePanes {left} {center} {right} />
	</div>

	<footer
		class="border-border bg-surface-1 text-text-faint flex h-6 shrink-0 items-center gap-3 border-t px-3 text-[length:var(--text-micro)]"
		data-testid="app-footer"
	>
		{#if site.manifest}
			<span data-testid="footer-counts">
				{site.manifest.albums.length} album{site.manifest.albums.length === 1 ? '' : 's'},
				{site.manifest.albums.reduce((n, a) => n + a.images.length, 0)} images,
				{site.manifest.pages.length} page{site.manifest.pages.length === 1 ? '' : 's'}
			</span>
		{:else}
			<span>ready</span>
		{/if}
	</footer>

	<Toast />
</div>
