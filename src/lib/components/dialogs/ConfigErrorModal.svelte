<script lang="ts">
	import { preview } from '$lib/stores/previewStore.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	const err = $derived(preview.configError);
</script>

{#if err}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
		data-testid="config-error-modal"
	>
		<div
			class="border-danger/60 bg-surface-1 w-full max-w-xl overflow-hidden rounded-md border shadow-2xl"
		>
			<header class="border-border flex items-center justify-between border-b px-4 py-3">
				<div>
					<div class="text-text-primary text-[length:var(--text-label)] font-semibold">
						Config error
					</div>
					<div class="text-text-muted mt-0.5 text-[length:var(--text-caption)]">
						{err.path}{#if err.line != null}:{err.line}{#if err.column != null}:{err.column}{/if}{/if}
					</div>
				</div>
				<Button variant="ghost" size="sm" onclick={() => preview.clearConfigError()}>×</Button>
			</header>
			<div class="px-4 py-3">
				<div class="text-text-secondary mb-3 text-[length:var(--text-body)] whitespace-pre-wrap">
					{err.message}
				</div>
				{#if err.snippet}
					<pre
						class="bg-surface-0 border-border text-text-secondary overflow-x-auto rounded-sm border p-3 font-mono text-[length:var(--text-caption)]">{err.snippet}</pre>
				{/if}
			</div>
		</div>
	</div>
{/if}
