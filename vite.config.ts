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
							external: ['electron', 'electron-store', 'conf']
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
