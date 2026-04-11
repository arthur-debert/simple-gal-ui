<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 select-none',
		variants: {
			variant: {
				default: 'bg-accent text-surface-0 hover:bg-accent/90',
				secondary: 'bg-surface-2 text-text-primary hover:bg-surface-2/80',
				ghost: 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
				outline:
					'border border-border bg-surface-1 text-text-primary hover:bg-surface-2 hover:border-border-strong',
				danger: 'bg-danger text-white hover:bg-danger/90'
			},
			size: {
				sm: 'h-7 px-2 text-[length:var(--text-caption)]',
				md: 'h-8 px-3 text-[length:var(--text-body)]',
				lg: 'h-9 px-4 text-[length:var(--text-label)]',
				icon: 'h-8 w-8'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'md'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
</script>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface Props extends HTMLButtonAttributes {
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		children?: Snippet;
	}

	let { variant = 'default', size = 'md', class: className, children, ...rest }: Props = $props();
</script>

<button class={cn(buttonVariants({ variant, size }), className)} {...rest}>
	{@render children?.()}
</button>
