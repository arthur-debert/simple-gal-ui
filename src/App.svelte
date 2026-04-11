<script lang="ts">
	import ResizablePanes from '$lib/components/ui/ResizablePanes.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import SiteTree from '$lib/components/tree/SiteTree.svelte';
	import AlbumView from '$lib/components/gallery/AlbumView.svelte';
	import ImageDetailEditor from '$lib/components/gallery/ImageDetailEditor.svelte';
	import PageEditor from '$lib/components/pages/PageEditor.svelte';
	import PreviewPane from '$lib/components/preview/PreviewPane.svelte';
	import StatusBar from '$lib/components/status/StatusBar.svelte';
	import ConfigErrorModal from '$lib/components/dialogs/ConfigErrorModal.svelte';
	import {
		site,
		openGalleryHomeDialog,
		restoreLastGalleryHome,
		loadGalleryHome
	} from '$lib/stores/siteStore.svelte';
	import { initPreviewStore, preview, runBuild } from '$lib/stores/previewStore.svelte';
	import { initWatchStore } from '$lib/stores/watchStore.svelte';
	import {
		appInfo,
		setAppVersion,
		setSimpleGalVersion,
		setPlatform
	} from '$lib/stores/appInfoStore.svelte';
	import { api } from '$lib/api';

	// macOS hiddenInset leaves room for traffic-light buttons on the left,
	// so push header content over on that platform.
	const isMac = $derived(appInfo.platform === 'darwin');
	const headerDragStyle = 'app-region: drag; -webkit-app-region: drag';
	const noDragStyle = 'app-region: no-drag; -webkit-app-region: no-drag';

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
		setPlatform(api.platform);
		api.app.version().then((v) => setAppVersion(v));
		api.simpleGal.version().then((r) => {
			if (r.ok) {
				setSimpleGalVersion(r.version ?? '', null);
			} else {
				setSimpleGalVersion('not found', r.error ?? 'simple-gal binary not found');
			}
		});
		const envHome = new URLSearchParams(window.location.search).get('home');
		if (envHome) {
			loadGalleryHome(envHome);
		} else {
			restoreLastGalleryHome();
		}
		const unsubHome = api.gallery.onHomeChanged((p) => loadGalleryHome(p));
		const unsubPreview = initPreviewStore();
		const unsubWatch = initWatchStore();
		return () => {
			unsubHome();
			unsubPreview();
			unsubWatch();
		};
	});
</script>

<div class="flex h-full w-full flex-col">
	<header
		class={[
			'border-border bg-surface-header flex h-10 shrink-0 items-center gap-3 border-b px-3 backdrop-blur',
			isMac ? 'pl-20' : ''
		].join(' ')}
		style={headerDragStyle}
		data-testid="app-header"
	>
		<div class="text-text-primary text-[length:var(--text-label)] font-semibold">simple-gal-ui</div>
		<div class="flex-1"></div>
		<div style={noDragStyle}>
			<Button variant="outline" size="sm" onclick={openGalleryHomeDialog}>
				Open gallery home…
			</Button>
		</div>
		<div style={noDragStyle}>
			<Button
				variant="default"
				size="sm"
				disabled={!site.home || preview.status === 'building'}
				onclick={runBuild}
				data-testid="preview-build-btn"
			>
				{preview.status === 'building' ? 'Building…' : 'Build'}
			</Button>
		</div>
	</header>

	{#if appInfo.simpleGalMissing}
		<div
			class="border-danger/60 bg-danger/10 text-text-primary flex shrink-0 items-start gap-3 border-b px-4 py-3"
			data-testid="simple-gal-missing-banner"
		>
			<div class="text-danger text-[length:var(--text-label)] font-semibold">⚠</div>
			<div class="min-w-0 flex-1">
				<div class="text-[length:var(--text-label)] font-semibold">simple-gal binary not found</div>
				<div class="text-text-muted mt-1 text-[length:var(--text-caption)]">
					{appInfo.simpleGalMissing}
				</div>
				<div class="text-text-muted mt-2 text-[length:var(--text-caption)]">
					Install it with
					<code class="bg-surface-2 rounded px-1 font-mono"
						>cargo install --git https://github.com/arthur-debert/simple-gal.git simple-gal</code
					>
					or set
					<code class="bg-surface-2 rounded px-1 font-mono">SIMPLE_GAL_PATH</code>
					before launching.
				</div>
			</div>
		</div>
	{/if}

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
				<ImageDetailEditor albumPath={selectedAlbum.path} image={selectedImage} />
			{:else if site.selection.kind === 'album' && selectedAlbum}
				<AlbumView album={selectedAlbum} />
			{:else if site.selection.kind === 'page' && selectedPage}
				<PageEditor page={selectedPage} />
			{:else}
				<div
					class="text-text-faint flex h-full items-center justify-center text-[length:var(--text-caption)]"
				>
					Select an album or page in the left pane
				</div>
			{/if}
		{/snippet}

		{#snippet right()}
			<PreviewPane />
		{/snippet}

		<ResizablePanes {left} {center} {right} />
	</div>

	<StatusBar />
	<ConfigErrorModal />
	<Toast />
</div>
