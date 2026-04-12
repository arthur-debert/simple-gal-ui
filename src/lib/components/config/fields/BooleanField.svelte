<script lang="ts">
	interface Props {
		value: boolean;
		dottedKey: string;
		oninput: (next: boolean) => void;
	}

	const { value, dottedKey, oninput }: Props = $props();
</script>

<label class="text-text-secondary inline-flex items-center gap-2 text-[length:var(--text-caption)]">
	<input
		type="checkbox"
		checked={!!value}
		data-testid="config-field-input"
		data-config-key={dottedKey}
		onchange={(e) => oninput((e.currentTarget as HTMLInputElement).checked)}
	/>
	<span class="text-text-faint font-mono">{value ? 'true' : 'false'}</span>
</label>
