<script lang="ts">
	interface Props {
		value: string;
		dottedKey: string;
		oninput: (next: string) => void;
	}

	const { value, dottedKey, oninput }: Props = $props();
</script>

<input
	type="text"
	class="bg-surface-0 border-border focus:border-accent text-text-primary w-full rounded-sm border px-2 py-1 font-mono text-[length:var(--text-caption)] outline-none"
	{value}
	data-testid="config-field-input"
	data-config-key={dottedKey}
	oninput={(e) => oninput((e.currentTarget as HTMLInputElement).value)}
/>
