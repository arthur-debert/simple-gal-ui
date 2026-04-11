import { app } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Resolve the `simple-gal` binary path.
 *
 * Order:
 *  1. `SIMPLE_GAL_PATH` env var (dev override)
 *  2. Bundled binary under `resources/bin/<platform>-<arch>/` (production)
 *  3. Bundled binary next to the packaged app's resources dir
 *  4. Throws — the app must surface a guided error.
 */
export function resolveSimpleGalBin(): string {
	const override = process.env.SIMPLE_GAL_PATH;
	if (override && existsSync(override)) return override;

	const exe = process.platform === 'win32' ? 'simple-gal.exe' : 'simple-gal';
	const platDir = `${process.platform}-${process.arch}`;

	const candidates: string[] = [];
	if (app.isPackaged) {
		candidates.push(path.join(process.resourcesPath, 'bin', platDir, exe));
		candidates.push(path.join(process.resourcesPath, 'bin', exe));
	} else {
		const root = app.getAppPath();
		candidates.push(path.join(root, 'resources', 'bin', platDir, exe));
	}

	for (const p of candidates) {
		if (existsSync(p)) return p;
	}

	throw new Error(
		`simple-gal binary not found. Set SIMPLE_GAL_PATH or bundle a binary at resources/bin/${platDir}/${exe}.`
	);
}

export async function getSimpleGalVersion(binPath: string): Promise<string> {
	const { stdout } = await execFileAsync(binPath, ['--version']);
	return stdout.trim();
}
