<script lang="ts">
	interface Props {
		value: number | undefined;
		dottedKey: string;
		integer?: boolean;
		min?: number;
		max?: number;
		oninput: (next: number | undefined) => void;
	}

	const { value, dottedKey, integer = false, min, max, oninput }: Props = $props();

	function handle(raw: string): void {
		if (raw.trim() === '') {
			oninput(undefined);
			return;
		}
		const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
		if (!Number.isFinite(parsed)) return;
		oninput(parsed);
	}
</script>

<input
	type="number"
	class="bg-surface-0 border-border focus:border-accent text-text-primary w-32 rounded-sm border px-2 py-1 text-right font-mono text-[length:var(--text-caption)] outline-none"
	value={value ?? ''}
	step={integer ? 1 : 'any'}
	{min}
	{max}
	data-testid="config-field-input"
	data-config-key={dottedKey}
	oninput={(e) => handle((e.currentTarget as HTMLInputElement).value)}
/>
