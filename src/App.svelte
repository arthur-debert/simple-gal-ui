<script lang="ts">
	import ResizablePanes from '$lib/components/ui/ResizablePanes.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Separator from '$lib/components/ui/Separator.svelte';

	let version = $state<string>('…');
	let simpleGalInfo = $state<string>('…');

	$effect(() => {
		window.api.app.version().then((v) => (version = v));
		window.api.simpleGal.version().then((r) => {
			simpleGalInfo = r.ok ? `${r.version} (${r.binPath})` : `not found: ${r.error}`;
		});
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
		<div class="flex-1"></div>
		<div class="text-text-faint text-[length:var(--text-caption)]" data-testid="simple-gal-info">
			simple-gal: {simpleGalInfo}
		</div>
	</header>

	<div class="min-h-0 flex-1">
		{#snippet left()}
			<div class="flex h-full flex-col p-3">
				<div
					class="text-text-muted mb-2 text-[length:var(--text-micro)] font-semibold tracking-wider uppercase"
				>
					Site
				</div>
				<div
					class="text-text-faint flex flex-1 items-center justify-center text-[length:var(--text-caption)]"
				>
					No gallery open
				</div>
				<Button variant="outline" size="sm" disabled>Open gallery home…</Button>
			</div>
		{/snippet}

		{#snippet center()}
			<div class="flex h-full flex-col items-center justify-center gap-3 p-6">
				<div class="text-text-secondary text-[length:var(--text-label)]">
					Welcome to simple-gal-ui
				</div>
				<div class="text-text-faint max-w-md text-center text-[length:var(--text-caption)]">
					A desktop front-end for simple-gal. Open a gallery home in the left pane to start editing.
				</div>
			</div>
		{/snippet}

		{#snippet right()}
			<div class="flex h-full flex-col p-3">
				<div
					class="text-text-muted mb-2 text-[length:var(--text-micro)] font-semibold tracking-wider uppercase"
				>
					Preview
				</div>
				<div
					class="border-border text-text-faint flex flex-1 items-center justify-center rounded-md border border-dashed text-[length:var(--text-caption)]"
				>
					Build a gallery to see it rendered here
				</div>
			</div>
		{/snippet}

		<ResizablePanes {left} {center} {right} />
	</div>

	<footer
		class="border-border bg-surface-1 text-text-faint flex h-6 shrink-0 items-center border-t px-3 text-[length:var(--text-micro)]"
		data-testid="app-footer"
	>
		<div>ready</div>
	</footer>
</div>
