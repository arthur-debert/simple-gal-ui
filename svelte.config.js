import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// We intentionally seed some $state() from prop defaults — the "initial
		// value only" semantics are exactly what we want.
		warningFilter: (warning) =>
			warning.code !== 'state_referenced_locally' &&
			warning.code !== 'custom_element_props_identifier'
	}
};
