<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import type { ReplaceIndexStrategy } from '$lib/api';

	interface Props {
		open: boolean;
		sampleReplacement: string;
		sampleTarget: string;
		onChoose: (strategy: ReplaceIndexStrategy) => void;
		onCancel: () => void;
	}

	const { open, sampleReplacement, sampleTarget, onChoose, onCancel }: Props = $props();

	let strategy = $state<ReplaceIndexStrategy>('slot');

	$effect(() => {
		if (open) strategy = 'slot';
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
		data-testid="replace-mode-dialog"
	>
		<div
			class="border-border bg-surface-1 w-full max-w-lg overflow-hidden rounded-md border shadow-2xl"
		>
			<header class="border-border border-b px-4 py-3">
				<div class="text-text-primary text-[length:var(--text-label)] font-semibold">
					Keep the gallery order, or import file order?
				</div>
				<div class="text-text-muted mt-0.5 text-[length:var(--text-caption)]">
					Your replacement files carry their own numeric prefixes. Pick which numbering the replaced
					images should end up with.
				</div>
			</header>
			<div class="flex flex-col gap-2 px-4 py-3">
				<label class="flex cursor-pointer items-start gap-2">
					<input
						type="radio"
						name="replace-strategy"
						value="slot"
						bind:group={strategy}
						class="mt-1"
						data-testid="replace-mode-slot"
					/>
					<div>
						<div class="text-text-primary text-[length:var(--text-body)]">Keep gallery order</div>
						<div class="text-text-muted text-[length:var(--text-caption)]">
							New file inherits the prefix of the image it replaces
							<span class="font-mono">({sampleTarget})</span>.
						</div>
					</div>
				</label>
				<label class="flex cursor-pointer items-start gap-2">
					<input
						type="radio"
						name="replace-strategy"
						value="filename"
						bind:group={strategy}
						class="mt-1"
						data-testid="replace-mode-filename"
					/>
					<div>
						<div class="text-text-primary text-[length:var(--text-body)]">Use filename numbers</div>
						<div class="text-text-muted text-[length:var(--text-caption)]">
							New file keeps the prefix from its source filename
							<span class="font-mono">({sampleReplacement})</span>.
						</div>
					</div>
				</label>
			</div>
			<footer
				class="border-border bg-surface-1 flex items-center justify-end gap-2 border-t px-4 py-3"
			>
				<Button variant="ghost" size="sm" onclick={onCancel} data-testid="replace-mode-cancel">
					Cancel
				</Button>
				<Button
					variant="default"
					size="sm"
					onclick={() => onChoose(strategy)}
					data-testid="replace-mode-confirm"
				>
					Replace
				</Button>
			</footer>
		</div>
	</div>
{/if}
