<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view';
	import { EditorState, Compartment } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { cn } from '$lib/utils';

	interface Props {
		value: string;
		onChange?: (v: string) => void;
		placeholder?: string;
		class?: string;
		'data-testid'?: string;
	}

	let {
		value = $bindable(),
		onChange,
		placeholder = '',
		class: className,
		'data-testid': testId
	}: Props = $props();

	let host = $state<HTMLDivElement>();
	let view: EditorView | null = null;
	const placeholderCompartment = new Compartment();
	// Avoids feedback loops when the parent-provided value changes from OUR
	// own dispatch (we don't want to re-setDoc when the change came from us).
	let settingFromExternal = false;

	onMount(() => {
		if (!host) return;
		const state = EditorState.create({
			doc: value,
			extensions: [
				history(),
				keymap.of([...defaultKeymap, ...historyKeymap]),
				markdown(),
				placeholderCompartment.of(placeholderExt(placeholder)),
				EditorView.lineWrapping,
				EditorView.updateListener.of((update) => {
					if (update.docChanged && !settingFromExternal) {
						const next = update.state.doc.toString();
						value = next;
						onChange?.(next);
					}
				}),
				// Minimal dark theme matched to the app's tokens
				EditorView.theme({
					'&': {
						height: '100%',
						backgroundColor: 'var(--color-surface-1)',
						color: 'var(--color-text-primary)',
						fontFamily:
							'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
						fontSize: '12px'
					},
					'.cm-content': {
						caretColor: 'var(--color-accent)',
						padding: '0.5rem'
					},
					'.cm-scroller': {
						fontFamily: 'inherit',
						lineHeight: '1.5'
					},
					'.cm-focused': {
						outline: 'none'
					},
					'.cm-activeLine': {
						backgroundColor: 'transparent'
					},
					'.cm-gutters': {
						display: 'none'
					},
					'.cm-placeholder': {
						color: 'var(--color-text-faint)',
						fontStyle: 'italic'
					},
					// Markdown token colors — muted, just enough to read structure
					'.cm-header, .cm-heading': {
						color: 'var(--color-text-primary)',
						fontWeight: '600'
					},
					'.cm-strong': { color: 'var(--color-text-primary)', fontWeight: '700' },
					'.cm-emphasis': { color: 'var(--color-text-primary)', fontStyle: 'italic' },
					'.cm-link': { color: 'var(--color-accent)' },
					'.cm-url': { color: 'var(--color-text-muted)' },
					'.cm-quote': { color: 'var(--color-text-muted)', fontStyle: 'italic' },
					'.cm-monospace': { color: 'var(--color-text-secondary)' }
				})
			]
		});
		view = new EditorView({ state, parent: host });
	});

	onDestroy(() => {
		view?.destroy();
		view = null;
	});

	// When the parent swaps `value` out from under us (e.g. switching to a
	// different page), reset the CM6 doc. Uses a guard flag to avoid bouncing
	// the change back through the update listener.
	$effect(() => {
		if (!view) return;
		const current = view.state.doc.toString();
		if (current === value) return;
		settingFromExternal = true;
		view.dispatch({
			changes: { from: 0, to: current.length, insert: value }
		});
		settingFromExternal = false;
	});
</script>

<div
	bind:this={host}
	class={cn('cm-host h-full w-full overflow-auto', className)}
	data-testid={testId}
></div>
