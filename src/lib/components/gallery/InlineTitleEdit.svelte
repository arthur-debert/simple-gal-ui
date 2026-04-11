<script lang="ts">
	import { cn } from '$lib/utils';
	import { tick } from 'svelte';

	interface Props {
		value: string;
		onCommit: (newValue: string) => void | Promise<void>;
		class?: string;
	}

	const { value, onCommit, class: className }: Props = $props();

	let editing = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement>();

	async function startEdit(): Promise<void> {
		draft = value;
		editing = true;
		await tick();
		input?.focus();
		input?.select();
	}

	async function commit(): Promise<void> {
		if (!editing) return;
		const next = draft.trim();
		editing = false;
		if (next && next !== value) {
			await onCommit(next);
		}
	}

	function cancel(): void {
		editing = false;
		draft = value;
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		}
	}
</script>

{#if editing}
	<input
		bind:this={input}
		bind:value={draft}
		onblur={commit}
		onkeydown={onKeydown}
		class={cn(
			'bg-surface-0 border-accent text-text-primary w-full rounded-sm border px-1 py-0.5 outline-none',
			className
		)}
		data-testid="inline-title-input"
	/>
{:else}
	<div class="group flex min-w-0 items-center gap-2">
		<span
			ondblclick={startEdit}
			class={cn('min-w-0 cursor-text truncate select-none', className)}
			data-testid="inline-title-display"
			role="button"
			tabindex="0"
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === 'F2') startEdit();
			}}
		>
			{value}
		</span>
		<button
			type="button"
			onclick={startEdit}
			aria-label="Rename"
			class="text-text-faint hover:text-text-primary invisible shrink-0 text-[length:var(--text-caption)] group-hover:visible"
			data-testid="inline-title-edit-btn"
		>
			✎
		</button>
	</div>
{/if}
