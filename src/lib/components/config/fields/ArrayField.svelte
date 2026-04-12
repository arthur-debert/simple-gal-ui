<script lang="ts">
	/**
	 * Simple textarea-style chip input for scalar arrays. Values are shown
	 * as comma-separated; on blur the string is parsed into either numbers
	 * or strings depending on the schema `items.type`. For pr7/4 this is
	 * minimal — pr7/5 ships the proper chip UI.
	 */
	interface Props {
		value: unknown[];
		dottedKey: string;
		itemType: 'string' | 'number' | 'integer' | 'boolean';
		oninput: (next: unknown[]) => void;
	}

	const { value, dottedKey, itemType, oninput }: Props = $props();

	function toString(v: unknown[]): string {
		return v.map((x) => (typeof x === 'string' ? x : String(x))).join(', ');
	}

	function parse(raw: string): unknown[] {
		const parts = raw
			.split(',')
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
		if (itemType === 'number' || itemType === 'integer') {
			return parts.map((p) => (itemType === 'integer' ? parseInt(p, 10) : parseFloat(p)));
		}
		if (itemType === 'boolean') {
			return parts.map((p) => p === 'true');
		}
		return parts;
	}

	let text = $state(toString(value));
	$effect(() => {
		text = toString(value);
	});
</script>

<input
	type="text"
	class="bg-surface-0 border-border focus:border-accent text-text-primary w-full rounded-sm border px-2 py-1 font-mono text-[length:var(--text-caption)] outline-none"
	bind:value={text}
	data-testid="config-field-input"
	data-config-key={dottedKey}
	onblur={() => oninput(parse(text))}
/>
