<script lang="ts">
	import { site } from '$lib/stores/siteStore.svelte';
	import {
		configEditor,
		openConfigEditor,
		resolveEffective,
		touchField,
		resetField,
		saveConfig,
		requestLeaveConfig
	} from '$lib/stores/configEditorStore.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import IconArrowLeft from '~icons/lucide/arrow-left';
	import ConfigSection from './ConfigSection.svelte';
	import ConfigField from './ConfigField.svelte';
	import type {
		ConfigSchemaNode,
		ConfigSchemaObject,
		ConfigSchemaRoot
	} from '$lib/types/configSchema';

	interface Props {
		dirPath: string;
		levelKind: 'root' | 'group' | 'album';
	}

	const { dirPath, levelKind }: Props = $props();

	$effect(() => {
		const home = site.home;
		if (!home) return;
		openConfigEditor(home, dirPath);
	});

	const cascade = $derived(configEditor.cascade);
	const loading = $derived(configEditor.loading);
	const error = $derived(configEditor.error);
	const saving = $derived(configEditor.saving);
	const hasUnsaved = $derived(configEditor.hasUnsaved);

	const targetLabel = $derived.by(() => {
		if (cascade) return cascade.target.label;
		if (levelKind === 'root') return 'root';
		return dirPath.split('/').pop() ?? dirPath;
	});

	function resolve(key: string) {
		if (!cascade) return { key, value: undefined, source: 'default' as const };
		return resolveEffective(
			cascade,
			key,
			configEditor.dirtyKeys,
			configEditor.pendingValues,
			configEditor.resetKeys
		);
	}

	function humanize(key: string): string {
		const last = key.split('.').pop() ?? key;
		return last
			.split('_')
			.map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
			.join(' ');
	}

	function isObjectNode(n: ConfigSchemaNode): n is ConfigSchemaObject {
		return n.type === 'object';
	}

	function sectionTitle(key: string, node: ConfigSchemaNode): string {
		if ('title' in node && typeof (node as ConfigSchemaObject).title === 'string') {
			return (node as ConfigSchemaObject).title as string;
		}
		return humanize(key);
	}

	function sectionDescription(node: ConfigSchemaNode): string | undefined {
		return 'description' in node && typeof node.description === 'string'
			? node.description
			: undefined;
	}

	function onBack(): void {
		requestLeaveConfig(site.previousNonConfigSelection);
	}
</script>

{#snippet renderNode(dottedKey: string, node: ConfigSchemaNode, depth: number)}
	{#if isObjectNode(node)}
		{#each Object.entries(node.properties) as [childKey, childNode] (childKey)}
			{@const fullKey = dottedKey ? `${dottedKey}.${childKey}` : childKey}
			{@render renderNode(fullKey, childNode, depth + 1)}
		{/each}
	{:else}
		{@const eff = resolve(dottedKey)}
		<ConfigField
			label={humanize(dottedKey)}
			{dottedKey}
			{node}
			value={eff.value}
			source={eff.source}
			{depth}
			onEdit={(v) => touchField(dottedKey, v)}
			onReset={() => resetField(dottedKey)}
		/>
	{/if}
{/snippet}

{#snippet renderTopSections(schema: ConfigSchemaRoot)}
	<div class="flex flex-col gap-3 p-3">
		{#each Object.entries(schema.properties) as [topKey, topNode] (topKey)}
			{#if isObjectNode(topNode)}
				<ConfigSection
					title={sectionTitle(topKey, topNode)}
					description={sectionDescription(topNode)}
				>
					{#each Object.entries(topNode.properties) as [childKey, childNode] (childKey)}
						{@const fullKey = `${topKey}.${childKey}`}
						{@render renderNode(fullKey, childNode, 0)}
					{/each}
				</ConfigSection>
			{:else}
				{@const eff = resolve(topKey)}
				<div class="border-border overflow-hidden rounded-md border">
					<ConfigField
						label={humanize(topKey)}
						dottedKey={topKey}
						node={topNode}
						value={eff.value}
						source={eff.source}
						onEdit={(v) => touchField(topKey, v)}
						onReset={() => resetField(topKey)}
					/>
				</div>
			{/if}
		{/each}
	</div>
{/snippet}

<div
	class="flex h-full min-h-0 flex-col"
	data-testid="config-editor"
	data-config-dir={dirPath}
	data-config-level={levelKind}
>
	<header
		class="border-border bg-surface-header flex shrink-0 items-center gap-3 border-b px-4 py-2"
	>
		<Button
			variant="ghost"
			size="sm"
			onclick={onBack}
			data-testid="config-editor-back"
			aria-label="Back"
			title="Back"
			class="shrink-0"
		>
			<IconArrowLeft class="h-4 w-4" />
			Back
		</Button>
		<div class="min-w-0 flex-1">
			<div class="text-text-faint text-[length:var(--text-micro)] tracking-wider uppercase">
				Config · {levelKind}
			</div>
			<div
				class="text-text-primary truncate text-[length:var(--text-label)] font-semibold"
				data-testid="config-editor-title"
			>
				{targetLabel}
			</div>
		</div>
		<Button
			variant="default"
			size="sm"
			disabled={!hasUnsaved || saving}
			onclick={() => saveConfig()}
			data-testid="config-editor-save"
		>
			{saving ? 'Saving…' : hasUnsaved ? 'Save' : 'Saved'}
		</Button>
	</header>

	{#if loading}
		<div
			class="text-text-muted flex flex-1 items-center justify-center text-[length:var(--text-caption)]"
			data-testid="config-editor-loading"
		>
			Loading config…
		</div>
	{:else if error}
		<div
			class="text-danger flex flex-1 items-center justify-center px-6 text-center text-[length:var(--text-caption)]"
			data-testid="config-editor-error"
		>
			{error}
		</div>
	{:else if cascade}
		<div class="min-h-0 flex-1 overflow-y-auto">
			{@render renderTopSections(cascade.schema)}
		</div>
	{/if}
</div>
