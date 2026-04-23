<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import {
		configEditor,
		cancelLeaveConfig,
		discardLeaveConfig,
		saveAndLeaveConfig
	} from '$lib/stores/configEditorStore.svelte';

	const open = $derived(configEditor.leaveTarget !== null);
	const keys = $derived(configEditor.changedKeys);
	const saving = $derived(configEditor.saving);
</script>

{#if open}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
		data-testid="config-unsaved-modal"
	>
		<div
			class="border-border bg-surface-1 w-full max-w-lg overflow-hidden rounded-md border shadow-2xl"
		>
			<header class="border-border border-b px-4 py-3">
				<div class="text-text-primary text-[length:var(--text-label)] font-semibold">
					You have unsaved config changes
				</div>
				<div class="text-text-muted mt-0.5 text-[length:var(--text-caption)]">
					Leaving this view without saving discards these edits.
				</div>
			</header>
			<div class="px-4 py-3">
				<div class="text-text-faint text-[length:var(--text-micro)] tracking-wider uppercase">
					Changed keys ({keys.length})
				</div>
				<ul
					class="text-text-secondary mt-2 max-h-48 space-y-0.5 overflow-y-auto font-mono text-[length:var(--text-caption)]"
					data-testid="config-unsaved-keys"
				>
					{#each keys as k (k)}
						<li>· {k}</li>
					{/each}
				</ul>
			</div>
			<footer
				class="border-border bg-surface-1 flex items-center justify-end gap-2 border-t px-4 py-3"
			>
				<Button
					variant="ghost"
					size="sm"
					onclick={cancelLeaveConfig}
					disabled={saving}
					data-testid="config-unsaved-cancel"
				>
					Cancel
				</Button>
				<Button
					variant="outline"
					size="sm"
					onclick={discardLeaveConfig}
					disabled={saving}
					data-testid="config-unsaved-discard"
				>
					Discard changes
				</Button>
				<Button
					variant="default"
					size="sm"
					onclick={saveAndLeaveConfig}
					disabled={saving}
					data-testid="config-unsaved-save"
				>
					{saving ? 'Saving…' : 'Save and leave'}
				</Button>
			</footer>
		</div>
	</div>
{/if}
