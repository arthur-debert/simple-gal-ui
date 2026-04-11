<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { api } from '$lib/api';

	/**
	 * Three-pane horizontal resizable container with per-id state persistence
	 * and collapsible side panes.
	 *
	 * Widths and collapse state are saved to electron-store (keyed on `id`)
	 * on every drag-end and collapse-toggle; restored on mount.
	 */

	interface Props {
		id?: string;
		left: Snippet;
		center: Snippet;
		right: Snippet;
		initialLeft?: number;
		initialRight?: number;
		minLeft?: number;
		minRight?: number;
		minCenter?: number;
		class?: string;
	}

	const props: Props = $props();
	const storeId = props.id ?? 'default';
	const minLeft = props.minLeft ?? 180;
	const minRight = props.minRight ?? 260;
	const minCenter = props.minCenter ?? 320;
	const className = props.class;
	const COLLAPSED_WIDTH = 28;

	let leftWidth = $state(props.initialLeft ?? 260);
	let rightWidth = $state(props.initialRight ?? 420);
	let leftCollapsed = $state(false);
	let rightCollapsed = $state(false);
	let container = $state<HTMLDivElement>();

	// Load persisted state once on mount
	$effect(() => {
		api.app.getPaneState(storeId).then((state) => {
			if (!state) return;
			if (typeof state.leftWidth === 'number') leftWidth = state.leftWidth;
			if (typeof state.rightWidth === 'number') rightWidth = state.rightWidth;
			if (typeof state.leftCollapsed === 'boolean') leftCollapsed = state.leftCollapsed;
			if (typeof state.rightCollapsed === 'boolean') rightCollapsed = state.rightCollapsed;
		});
	});

	function persist(): void {
		api.app.setPaneState(storeId, {
			leftWidth,
			rightWidth,
			leftCollapsed,
			rightCollapsed
		});
	}

	function toggleLeft(): void {
		leftCollapsed = !leftCollapsed;
		persist();
	}

	function toggleRight(): void {
		rightCollapsed = !rightCollapsed;
		persist();
	}

	function startDrag(side: 'left' | 'right', e: PointerEvent) {
		if ((side === 'left' && leftCollapsed) || (side === 'right' && rightCollapsed)) return;
		e.preventDefault();
		const startX = e.clientX;
		const startLeft = leftWidth;
		const startRight = rightWidth;

		const onMove = (ev: PointerEvent) => {
			const dx = ev.clientX - startX;
			if (!container) return;
			const total = container.clientWidth;
			if (side === 'left') {
				const next = startLeft + dx;
				const rightEffective = rightCollapsed ? COLLAPSED_WIDTH : rightWidth;
				const max = total - rightEffective - minCenter;
				leftWidth = Math.max(minLeft, Math.min(max, next));
			} else {
				const next = startRight - dx;
				const leftEffective = leftCollapsed ? COLLAPSED_WIDTH : leftWidth;
				const max = total - leftEffective - minCenter;
				rightWidth = Math.max(minRight, Math.min(max, next));
			}
		};
		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
			persist();
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}
</script>

<div bind:this={container} class={cn('flex h-full w-full', className)}>
	<!-- Left pane -->
	<aside
		class={cn(
			'border-border bg-surface-1 shrink-0 overflow-hidden border-r',
			leftCollapsed ? 'flex items-start justify-center pt-3' : null
		)}
		style:width="{leftCollapsed ? COLLAPSED_WIDTH : leftWidth}px"
		data-testid="pane-left"
		data-collapsed={leftCollapsed ? 'true' : 'false'}
	>
		{#if leftCollapsed}
			<button
				type="button"
				class="text-text-faint hover:text-text-primary rounded-sm p-1 text-[length:var(--text-caption)]"
				onclick={toggleLeft}
				aria-label="Expand left pane"
				title="Expand left pane"
				data-testid="pane-left-expand"
			>
				▸
			</button>
		{:else}
			{@render props.left()}
		{/if}
	</aside>

	<!-- Left divider -->
	<div
		class="bg-border-strong hover:bg-accent relative w-1 shrink-0 cursor-col-resize transition-colors"
		role="separator"
		aria-orientation="vertical"
		onpointerdown={(e) => startDrag('left', e)}
		data-testid="divider-left"
	>
		{#if !leftCollapsed}
			<button
				type="button"
				class="bg-surface-2 text-text-faint hover:text-text-primary border-border absolute top-1/2 -left-2 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border text-[length:var(--text-micro)]"
				onclick={(e) => {
					e.stopPropagation();
					toggleLeft();
				}}
				onpointerdown={(e) => e.stopPropagation()}
				aria-label="Collapse left pane"
				title="Collapse left pane"
				data-testid="pane-left-collapse"
			>
				◂
			</button>
		{/if}
	</div>

	<!-- Center pane -->
	<main class="bg-surface-0 min-w-0 flex-1 overflow-hidden" data-testid="pane-center">
		{@render props.center()}
	</main>

	<!-- Right divider -->
	<div
		class="bg-border-strong hover:bg-accent relative w-1 shrink-0 cursor-col-resize transition-colors"
		role="separator"
		aria-orientation="vertical"
		onpointerdown={(e) => startDrag('right', e)}
		data-testid="divider-right"
	>
		{#if !rightCollapsed}
			<button
				type="button"
				class="bg-surface-2 text-text-faint hover:text-text-primary border-border absolute top-1/2 -right-2 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border text-[length:var(--text-micro)]"
				onclick={(e) => {
					e.stopPropagation();
					toggleRight();
				}}
				onpointerdown={(e) => e.stopPropagation()}
				aria-label="Collapse right pane"
				title="Collapse right pane"
				data-testid="pane-right-collapse"
			>
				▸
			</button>
		{/if}
	</div>

	<!-- Right pane -->
	<aside
		class={cn(
			'border-border bg-surface-1 shrink-0 overflow-hidden border-l',
			rightCollapsed ? 'flex items-start justify-center pt-3' : null
		)}
		style:width="{rightCollapsed ? COLLAPSED_WIDTH : rightWidth}px"
		data-testid="pane-right"
		data-collapsed={rightCollapsed ? 'true' : 'false'}
	>
		{#if rightCollapsed}
			<button
				type="button"
				class="text-text-faint hover:text-text-primary rounded-sm p-1 text-[length:var(--text-caption)]"
				onclick={toggleRight}
				aria-label="Expand right pane"
				title="Expand right pane"
				data-testid="pane-right-expand"
			>
				◂
			</button>
		{:else}
			{@render props.right()}
		{/if}
	</aside>
</div>
