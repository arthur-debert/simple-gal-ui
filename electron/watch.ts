import chokidar, { type FSWatcher } from 'chokidar';
import type { BrowserWindow } from 'electron';
import path from 'node:path';
import { isSelfWrite } from './fs.js';

/**
 * Chokidar watcher over a single gallery home. Change events are debounced
 * and self-writes (paths marked in electron/fs.ts during a window's recent
 * write) are filtered out so the renderer doesn't thrash on its own saves.
 */

const DEBOUNCE_MS = 300;

interface WatcherState {
	watcher: FSWatcher;
	home: string;
	debounce: NodeJS.Timeout | null;
	pendingPaths: Set<string>;
}

let state: WatcherState | null = null;

function shouldIgnore(p: string): boolean {
	const base = path.basename(p);
	if (base.startsWith('.')) return true;
	if (base === '.DS_Store') return true;
	return false;
}

export async function watchHome(home: string, win: BrowserWindow): Promise<void> {
	await stopWatching();

	const watcher = chokidar.watch(home, {
		ignored: (watched) => shouldIgnore(watched),
		ignoreInitial: true,
		persistent: true,
		awaitWriteFinish: {
			stabilityThreshold: 150,
			pollInterval: 50
		}
	});

	state = { watcher, home, debounce: null, pendingPaths: new Set() };

	const onChange = (type: string, p: string) => {
		if (isSelfWrite(p)) return;
		if (shouldIgnore(p)) return;
		if (!state) return;
		state.pendingPaths.add(`${type}:${path.relative(home, p)}`);
		if (state.debounce) clearTimeout(state.debounce);
		state.debounce = setTimeout(() => {
			if (!state) return;
			const paths = Array.from(state.pendingPaths);
			state.pendingPaths.clear();
			state.debounce = null;
			if (!win.isDestroyed()) {
				win.webContents.send('watch:changed', { home, paths });
			}
		}, DEBOUNCE_MS);
	};

	watcher.on('add', (p) => onChange('add', p));
	watcher.on('change', (p) => onChange('change', p));
	watcher.on('unlink', (p) => onChange('unlink', p));
	watcher.on('addDir', (p) => onChange('addDir', p));
	watcher.on('unlinkDir', (p) => onChange('unlinkDir', p));
}

export async function stopWatching(): Promise<void> {
	if (!state) return;
	if (state.debounce) clearTimeout(state.debounce);
	await state.watcher.close();
	state = null;
}
