<script lang="ts">
	/**
	 * Color input: combines a native <input type="color"> swatch with a
	 * text input so the user can still paste hex codes or see the exact
	 * value. Both inputs are bound to the same underlying string and both
	 * emit via `oninput` on change. Non-hex values (e.g. named colors) fall
	 * back to displaying black in the swatch but still round-trip through
	 * the text input untouched.
	 */
	interface Props {
		value: string;
		dottedKey: string;
		oninput: (next: string) => void;
	}

	const { value, dottedKey, oninput }: Props = $props();

	const swatchValue = $derived(/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000');
</script>

<div class="flex items-center gap-2">
	<input
		type="color"
		class="border-border h-6 w-8 shrink-0 cursor-pointer rounded-sm border bg-transparent"
		value={swatchValue}
		data-testid="config-field-color-swatch"
		data-config-key={dottedKey}
		oninput={(e) => oninput((e.currentTarget as HTMLInputElement).value)}
	/>
	<input
		type="text"
		class="bg-surface-0 border-border focus:border-accent text-text-primary flex-1 rounded-sm border px-2 py-1 font-mono text-[length:var(--text-caption)] outline-none"
		{value}
		data-testid="config-field-input"
		data-config-key={dottedKey}
		oninput={(e) => oninput((e.currentTarget as HTMLInputElement).value)}
	/>
</div>
