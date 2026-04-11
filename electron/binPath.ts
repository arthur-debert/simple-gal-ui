import { app } from 'electron';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Walk up from a starting dir looking for a package.json whose `name` matches
 * `simple-gal-ui`. Used as a fallback for `app.getAppPath()`, which returns
 * `dist-electron/` when Playwright launches the app with an explicit main
 * file path.
 */
function findRepoRoot(): string {
	let dir: string;
	try {
		dir = path.dirname(fileURLToPath(import.meta.url));
	} catch {
		dir = process.cwd();
	}
	for (let i = 0; i < 6; i++) {
		const pkg = path.join(dir, 'package.json');
		if (existsSync(pkg)) {
			try {
				const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string };
				if (parsed.name === 'simple-gal-ui') return dir;
			} catch {
				// ignore
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return app.getAppPath();
}

/**
 * Resolve the `simple-gal` binary path.
 *
 * Order:
 *  1. `SIMPLE_GAL_PATH` env var (explicit override — used as-is, no probe)
 *  2. Bundled binary under `resources/bin/<platform>-<arch>/` (production)
 *  3. In dev:
 *     - Sibling checkout (`../simple-gal/target/release/simple-gal` relative
 *       to the app root) — matches the common layout where simple-gal-ui
 *       lives next to simple-gal.
 *     - `$PATH` walk and common install locations (~/.cargo/bin,
 *       /opt/homebrew/bin, /usr/local/bin, /usr/bin).
 *  4. Throws — the app surfaces a guided error in the UI.
 *
 * For every non-override candidate we run a quick compatibility probe to
 * make sure the binary supports `--format json` (added in 0.14.x). An
 * older simple-gal install on PATH would otherwise pass the `existsSync`
 * check and then fail every scan with "unexpected argument '--format'".
 */

const cache = { binPath: null as string | null };

function supportsJsonFormat(bin: string): boolean {
	try {
		const out = execFileSync(bin, ['--help'], { encoding: 'utf8', timeout: 3000 });
		return out.includes('--format');
	} catch {
		return false;
	}
}

export function resolveSimpleGalBin(): string {
	if (cache.binPath && existsSync(cache.binPath)) return cache.binPath;

	const override = process.env.SIMPLE_GAL_PATH;
	if (override && existsSync(override)) {
		cache.binPath = override;
		return override;
	}

	const exe = process.platform === 'win32' ? 'simple-gal.exe' : 'simple-gal';
	const platDir = `${process.platform}-${process.arch}`;

	const candidates: string[] = [];
	if (app.isPackaged) {
		candidates.push(path.join(process.resourcesPath, 'bin', platDir, exe));
		candidates.push(path.join(process.resourcesPath, 'bin', exe));
	} else {
		const root = findRepoRoot();
		candidates.push(path.join(root, 'resources', 'bin', platDir, exe));

		// Sibling simple-gal checkout — highest dev priority after env override.
		candidates.push(path.resolve(root, '..', 'simple-gal', 'target', 'release', exe));
		candidates.push(path.resolve(root, '..', 'simple-gal', 'target', 'debug', exe));

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

	let firstExisting: string | null = null;
	for (const p of candidates) {
		if (!existsSync(p)) continue;
		if (!firstExisting) firstExisting = p;
		if (supportsJsonFormat(p)) {
			cache.binPath = p;
			return p;
		}
	}

	if (firstExisting) {
		throw new Error(
			`Found an older simple-gal at ${firstExisting} that doesn't support \`--format json\` (requires 0.14+). Rebuild with \`cargo install --git https://github.com/arthur-debert/simple-gal.git simple-gal\` or set SIMPLE_GAL_PATH to a newer build.`
		);
	}

	throw new Error(
		`simple-gal binary not found. Install it (e.g. \`cargo install --git https://github.com/arthur-debert/simple-gal.git simple-gal\`), set SIMPLE_GAL_PATH, or bundle one at resources/bin/${platDir}/${exe}.`
	);
}

export async function getSimpleGalVersion(binPath: string): Promise<string> {
	const { stdout } = await execFileAsync(binPath, ['--version']);
	return stdout.trim();
}
