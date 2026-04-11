<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	/**
	 * Simple three-pane horizontal resizable container.
	 *
	 * Holds the widths of the left and right panes as internal state; the
	 * center pane fills the remainder. Drag handles between panes.
	 */

	interface Props {
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
	const minLeft = props.minLeft ?? 180;
	const minRight = props.minRight ?? 260;
	const minCenter = props.minCenter ?? 320;
	const className = props.class;

	let leftWidth = $state(props.initialLeft ?? 260);
	let rightWidth = $state(props.initialRight ?? 420);
	let container = $state<HTMLDivElement>();

	function startDrag(side: 'left' | 'right', e: PointerEvent) {
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
				const max = total - rightWidth - minCenter;
				leftWidth = Math.max(minLeft, Math.min(max, next));
			} else {
				const next = startRight - dx;
				const max = total - leftWidth - minCenter;
				rightWidth = Math.max(minRight, Math.min(max, next));
			}
		};
		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}
</script>

<div bind:this={container} class={cn('flex h-full w-full', className)}>
	<aside
		class="border-border bg-surface-1 shrink-0 overflow-hidden border-r"
		style:width="{leftWidth}px"
		data-testid="pane-left"
	>
		{@render props.left()}
	</aside>
	<div
		role="separator"
		aria-orientation="vertical"
		class="hover:bg-accent w-px shrink-0 cursor-col-resize"
		onpointerdown={(e) => startDrag('left', e)}
	></div>
	<main class="bg-surface-0 min-w-0 flex-1 overflow-hidden" data-testid="pane-center">
		{@render props.center()}
	</main>
	<div
		role="separator"
		aria-orientation="vertical"
		class="hover:bg-accent w-px shrink-0 cursor-col-resize"
		onpointerdown={(e) => startDrag('right', e)}
	></div>
	<aside
		class="border-border bg-surface-1 shrink-0 overflow-hidden border-l"
		style:width="{rightWidth}px"
		data-testid="pane-right"
	>
		{@render props.right()}
	</aside>
</div>
