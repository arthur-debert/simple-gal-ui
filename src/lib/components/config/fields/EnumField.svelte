<script lang="ts">
	interface Props {
		value: string;
		options: string[];
		dottedKey: string;
		oninput: (next: string) => void;
	}

	const { value, options, dottedKey, oninput }: Props = $props();
</script>

<select
	class="bg-surface-0 border-border focus:border-accent text-text-primary w-full rounded-sm border px-2 py-1 font-mono text-[length:var(--text-caption)] outline-none"
	{value}
	data-testid="config-field-input"
	data-config-key={dottedKey}
	onchange={(e) => oninput((e.currentTarget as HTMLSelectElement).value)}
>
	{#each options as opt (opt)}
		<option value={opt}>{opt}</option>
	{/each}
</select>
