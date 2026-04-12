<script lang="ts">
	import { toasts, dismissToast } from '$lib/stores/toastStore.svelte';
	import { cn } from '$lib/utils';

	const kindClass: Record<string, string> = {
		info: 'border-border bg-surface-1 text-text-primary',
		success: 'border-success/40 bg-surface-1 text-text-primary',
		warning: 'border-warning/40 bg-surface-1 text-text-primary',
		error: 'border-danger/60 bg-surface-1 text-text-primary'
	};
</script>

<div
	class="pointer-events-none fixed right-4 bottom-8 z-50 flex w-80 flex-col gap-2"
	data-testid="toast-stack"
>
	{#each toasts.items as toast (toast.id)}
		<div
			class={cn(
				'pointer-events-auto rounded-md border p-3 shadow-lg backdrop-blur',
				kindClass[toast.kind]
			)}
			data-testid="toast"
			data-kind={toast.kind}
		>
			<div class="flex items-start gap-2">
				<div class="min-w-0 flex-1">
					<div class="text-[length:var(--text-label)] font-semibold">{toast.title}</div>
					{#if toast.body}
						<div class="text-text-muted mt-1 text-[length:var(--text-caption)] break-words">
							{toast.body}
						</div>
					{/if}
				</div>
				<button
					type="button"
					class="text-text-faint hover:text-text-primary text-[length:var(--text-caption)]"
					aria-label="Dismiss"
					onclick={() => dismissToast(toast.id)}
				>
					×
				</button>
			</div>
		</div>
	{/each}
</div>
