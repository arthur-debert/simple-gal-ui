<script lang="ts">
	import { tick } from 'svelte';
	import { cn } from '$lib/utils';
	import Button from '$lib/components/ui/Button.svelte';

	interface Props {
		value: string;
		onSave: (newValue: string) => Promise<void>;
		placeholder?: string;
		class?: string;
	}

	const {
		value,
		onSave,
		placeholder = 'Add description\u2026',
		class: className
	}: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let saving = $state(false);
	let textarea = $state<HTMLTextAreaElement>();

	// Sync display when value changes externally (e.g. after rescan)
	$effect(() => {
		if (!editing) draft = value;
	});

	async function startEdit(): Promise<void> {
		draft = value;
		editing = true;
		await tick();
		textarea?.focus();
	}

	async function save(): Promise<void> {
		if (saving) return;
		const next = draft;
		if (next === value) {
			editing = false;
			return;
		}
		saving = true;
		try {
			await onSave(next);
			editing = false;
		} finally {
			saving = false;
		}
	}

	function cancel(): void {
		editing = false;
		draft = value;
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		} else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			save();
		}
	}
</script>

{#if editing}
	<div
		class={cn('border-border bg-surface-1 border-b px-4 py-3', className)}
		data-testid="description-editor"
	>
		<textarea
			bind:this={textarea}
			bind:value={draft}
			onkeydown={onKeydown}
			rows="6"
			class="bg-surface-0 border-border focus:border-accent text-text-primary w-full resize-y rounded-sm border px-2 py-1.5 text-[length:var(--text-body)] outline-none"
			data-testid="description-input"
			{placeholder}
		></textarea>
		<div class="mt-2 flex items-center gap-2">
			<Button
				variant="default"
				size="sm"
				disabled={saving || draft === value}
				onclick={save}
				data-testid="description-save-btn"
			>
				{saving ? 'Saving\u2026' : 'Save (\u2318\u21A9)'}
			</Button>
			<Button variant="ghost" size="sm" onclick={cancel} disabled={saving}>Cancel</Button>
		</div>
	</div>
{:else}
	<div
		class={cn('border-border bg-surface-1 group border-b px-4 py-3', className)}
		data-testid="description-editor"
	>
		<div class="flex items-start gap-2">
			<div class="min-w-0 flex-1">
				{#if value}
					<p
						class="text-text-secondary line-clamp-3 text-[length:var(--text-body)] whitespace-pre-line"
						data-testid="description-display"
					>
						{value}
					</p>
				{:else}
					<p
						class="text-text-faint text-[length:var(--text-body)] italic"
						data-testid="description-display"
					>
						{placeholder}
					</p>
				{/if}
			</div>
			<button
				type="button"
				onclick={startEdit}
				aria-label="Edit description"
				class="text-text-faint hover:text-text-primary invisible shrink-0 text-[length:var(--text-caption)] group-hover:visible"
				data-testid="description-edit-btn"
			>
				&#x270E;
			</button>
		</div>
	</div>
{/if}
