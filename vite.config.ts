import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron/simple';
import Icons from 'unplugin-icons/vite';
import path from 'node:path';

export default defineConfig({
	plugins: [
		svelte(),
		tailwindcss(),
		Icons({ compiler: 'svelte' }),
		electron({
			main: {
				entry: 'electron/main.ts',
				vite: {
					build: {
						outDir: 'dist-electron',
						rollupOptions: {
							// Only externalize `electron` (always provided by the runtime)
							// and `fsevents` (a macOS-only native addon chokidar loads
							// optionally and that Vite can't bundle). Everything else —
							// electron-store, chokidar, serve-handler — gets inlined into
							// main.js so we don't rely on electron-builder's dependency
							// walker to find transitive deps inside pnpm's node_modules.
							external: ['electron', 'fsevents']
						}
					}
				}
			},
			preload: {
				input: 'electron/preload.ts',
				vite: {
					build: {
						outDir: 'dist-electron',
						rollupOptions: {
							external: ['electron'],
							output: {
								format: 'cjs',
								entryFileNames: '[name].cjs'
							}
						}
					}
				}
			},
			renderer: {}
		})
	],
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib')
		}
	},
	build: {
		outDir: 'dist'
	},
	server: {
		port: 5173,
		strictPort: true
	},
	clearScreen: false
});
