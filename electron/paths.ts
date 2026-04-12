import { app } from 'electron';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Stable per-home working directories under the app's userData dir.
 *
 * The path is hashed so simple-gal's content-addressed cache
 * (<temp>/processed/.cache-manifest.json) persists across sessions for the
 * same gallery home, keeping incremental builds cheap.
 */

function hashHome(home: string): string {
	return createHash('sha256').update(path.resolve(home)).digest('hex').slice(0, 16);
}

export interface HomeWorkPaths {
	root: string;
	dist: string;
	temp: string;
}

export function workPathsForHome(home: string): HomeWorkPaths {
	const id = hashHome(home);
	const root = path.join(app.getPath('userData'), 'galleries', id);
	const dist = path.join(root, 'dist');
	const temp = path.join(root, 'temp');
	mkdirSync(dist, { recursive: true });
	mkdirSync(temp, { recursive: true });
	return { root, dist, temp };
}
