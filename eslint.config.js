import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			// Svelte 5 compiler warnings for custom-element compat and initial-value
			// capture are not errors for an Electron SPA; downgrade to warnings.
			'svelte/valid-compile': [
				'warn',
				{
					ignoreWarnings: true
				}
			]
		}
	},
	{
		ignores: [
			'dist/',
			'dist-electron/',
			'node_modules/',
			'content/',
			'resources/bin/',
			'test-results/',
			'playwright-report/'
		]
	}
);
