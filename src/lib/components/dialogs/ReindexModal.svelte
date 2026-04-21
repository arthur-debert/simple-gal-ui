<script lang="ts">
	import { api } from '$lib/api';
	import type { ReindexData } from '$lib/api';
	import { site, rescanCurrentHome } from '$lib/stores/siteStore.svelte';
	import { showToast } from '$lib/stores/toastStore.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	const { open, onClose }: Props = $props();

	let loading = $state(false);
	let applying = $state(false);
	let plan = $state<ReindexData | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) {
			plan = null;
			error = null;
			return;
		}
		void loadPlan();
	});

	async function loadPlan(): Promise<void> {
		if (!site.home) return;
		loading = true;
		error = null;
		try {
			const result = await api.fs.reindex({ home: site.home, dryRun: true });
			if (!result.ok) {
				error = result.message;
			} else {
				plan = result.data;
			}
		} catch (err) {
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	}

	const totalRenames = $derived(plan?.totals.total_renames ?? 0);

	async function onApply(): Promise<void> {
		if (!site.home || !plan) return;
		applying = true;
		error = null;
		try {
			const result = await api.fs.reindex({ home: site.home, dryRun: false });
			if (!result.ok) {
				error = result.message;
				return;
			}

			// If the user has a photo open whose filename got renumbered, re-pin
			// the selection to the new source_path before we rescan — otherwise
			// the post-scan `$derived` lookup returns null and the editor flickers
			// to an empty state.
			const sel = site.selection;
			if (sel.kind === 'image') {
				const moved = result.renameMap[sel.imageSourcePath];
				if (moved) {
					site.selection = { ...sel, imageSourcePath: moved };
				}
			}

			await rescanCurrentHome();
			showToast({
				kind: 'success',
				title: `Re-indexed ${result.data.totals.total_renames} file${
					result.data.totals.total_renames === 1 ? '' : 's'
				}`
			});
			onClose();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			applying = false;
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
		data-testid="reindex-modal"
	>
		<div
			class="border-border bg-surface-1 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border shadow-2xl"
		>
			<header class="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
				<div>
					<div class="text-text-primary text-[length:var(--text-label)] font-semibold">
						Re-index filenames
					</div>
					<div class="text-text-muted mt-0.5 text-[length:var(--text-caption)]">
						Normalize numeric prefixes across albums, groups, pages, and images.
					</div>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onclick={onClose}
					disabled={applying}
					data-testid="reindex-cancel"
				>
					×
				</Button>
			</header>

			<div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				{#if loading}
					<div
						class="text-text-muted text-[length:var(--text-caption)]"
						data-testid="reindex-loading"
					>
						Computing plan…
					</div>
				{:else if error}
					<div class="text-danger text-[length:var(--text-caption)]" data-testid="reindex-error">
						{error}
					</div>
				{:else if plan && totalRenames === 0}
					<div
						class="text-text-muted text-[length:var(--text-caption)]"
						data-testid="reindex-empty"
					>
						Nothing to re-index — every prefix is already normalized at
						<span class="font-mono">spacing={plan.spacing}</span>,
						<span class="font-mono">padding={plan.padding}</span>.
					</div>
				{:else if plan}
					<div class="text-text-secondary mb-3 text-[length:var(--text-caption)]">
						{totalRenames} rename{totalRenames === 1 ? '' : 's'} across
						{plan.totals.directories_with_changes} director{plan.totals.directories_with_changes ===
						1
							? 'y'
							: 'ies'}
						(spacing {plan.spacing}, padding {plan.padding}).
					</div>
					<div class="flex flex-col gap-3">
						{#each plan.per_directory.filter((d) => d.renames.length > 0) as perDir (perDir.dir)}
							<div class="border-border overflow-hidden rounded-sm border">
								<div
									class="bg-surface-2 text-text-secondary border-border border-b px-3 py-1.5 font-mono text-[length:var(--text-caption)]"
								>
									{perDir.dir === '.' ? '(root)' : perDir.dir}
								</div>
								<ul
									class="divide-border text-text-secondary divide-y font-mono text-[length:var(--text-caption)]"
									data-testid="reindex-dir-plan"
									data-dir={perDir.dir}
								>
									{#each perDir.renames as r (r.from)}
										<li class="flex items-center gap-2 px-3 py-1.5">
											<span class="text-text-faint">{r.from}</span>
											<span class="text-text-muted">→</span>
											<span class="text-text-primary">{r.to}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<footer
				class="border-border bg-surface-1 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3"
			>
				<Button
					variant="ghost"
					size="sm"
					onclick={onClose}
					disabled={applying}
					data-testid="reindex-close"
				>
					Cancel
				</Button>
				<Button
					variant="default"
					size="sm"
					disabled={loading || applying || !plan || totalRenames === 0}
					onclick={onApply}
					data-testid="reindex-apply"
				>
					{applying ? 'Applying…' : 'Apply'}
				</Button>
			</footer>
		</div>
	</div>
{/if}
