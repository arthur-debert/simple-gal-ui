<script lang="ts">
	import IconStar from '~icons/lucide/star';

	interface Props {
		/** Tailwind size classes for the triangle (default: w-8 h-8). */
		size?: string;
		/** Icon size in pixels (default: 14). */
		iconSize?: string;
	}

	const { size = 'h-8 w-8', iconSize = 'h-3.5 w-3.5' }: Props = $props();
</script>

<!--
  Diagonal accent corner chip. A filled triangle occupies the top-right
  corner (isolating it from the image) with a star icon on top — making
  the album's thumbnail instantly recognisable among its siblings.
-->
<div
	class="pointer-events-none absolute top-0 right-0 {size} select-none"
	data-testid="thumb-corner-mark"
	aria-label="Album thumbnail"
	title="Album thumbnail"
>
	<div class="bg-accent absolute inset-0" style="clip-path: polygon(100% 0, 100% 100%, 0 0)"></div>
	<IconStar class="text-surface-0 absolute top-1 right-1 {iconSize}" />
</div>
