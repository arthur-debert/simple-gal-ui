import { app } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Resolve the `simple-gal` binary path.
 *
 * Order:
 *  1. `SIMPLE_GAL_PATH` env var (explicit override)
 *  2. Bundled binary under `resources/bin/<platform>-<arch>/` (production)
 *  3. In dev, walk `$PATH` and common install locations (~/.cargo/bin,
 *     /usr/local/bin, /opt/homebrew/bin) looking for a system install.
 *  4. Throws — the app surfaces a guided error in the UI.
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

		// Walk $PATH
		const sep = process.platform === 'win32' ? ';' : ':';
		const pathDirs = (process.env.PATH ?? '').split(sep).filter(Boolean);
		for (const dir of pathDirs) {
			candidates.push(path.join(dir, exe));
		}

		// Common install locations that may not be on Electron's inherited PATH
		const home = os.homedir();
		candidates.push(path.join(home, '.cargo', 'bin', exe));
		if (process.platform === 'darwin') {
			candidates.push('/opt/homebrew/bin/' + exe);
			candidates.push('/usr/local/bin/' + exe);
		} else if (process.platform === 'linux') {
			candidates.push('/usr/local/bin/' + exe);
			candidates.push('/usr/bin/' + exe);
		}
	}

	for (const p of candidates) {
		if (existsSync(p)) return p;
	}

	throw new Error(
		`simple-gal binary not found. Install it (e.g. \`cargo install --git https://github.com/arthur-debert/simple-gal.git simple-gal\`), set SIMPLE_GAL_PATH, or bundle one at resources/bin/${platDir}/${exe}.`
	);
}

export async function getSimpleGalVersion(binPath: string): Promise<string> {
	const { stdout } = await execFileAsync(binPath, ['--version']);
	return stdout.trim();
}
