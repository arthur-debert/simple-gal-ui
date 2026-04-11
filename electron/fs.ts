import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Filesystem writes against the gallery home. All writes funnel through here
 * so we can implement a "self-write suppression" window: paths written in the
 * last N ms are filtered out of the chokidar watcher's event stream, avoiding
 * pointless rescan+rebuild cycles.
 */

const SUPPRESS_MS = 800;
const suppressed = new Map<string, number>();

function markSelfWrite(absPath: string): void {
	suppressed.set(path.resolve(absPath), Date.now() + SUPPRESS_MS);
}

export function isSelfWrite(absPath: string): boolean {
	const resolved = path.resolve(absPath);
	const expiry = suppressed.get(resolved);
	if (!expiry) return false;
	if (expiry < Date.now()) {
		suppressed.delete(resolved);
		return false;
	}
	return true;
}

export function sidecarPathFor(imageAbs: string): string {
	const { dir, name } = path.parse(imageAbs);
	return path.join(dir, `${name}.txt`);
}

export interface WriteSidecarArgs {
	home: string;
	imageSourcePath: string; // relative to home
	caption: string; // empty string → delete sidecar
}

export interface WriteSidecarResult {
	ok: boolean;
	sidecarPath: string;
	existed: boolean;
	deleted: boolean;
}

export async function writeSidecar(args: WriteSidecarArgs): Promise<WriteSidecarResult> {
	const imageAbs = path.join(args.home, args.imageSourcePath);
	const sidecar = sidecarPathFor(imageAbs);
	const existed = await fs
		.access(sidecar)
		.then(() => true)
		.catch(() => false);

	markSelfWrite(sidecar);

	if (args.caption.trim() === '') {
		if (existed) {
			await fs.unlink(sidecar);
			return { ok: true, sidecarPath: sidecar, existed, deleted: true };
		}
		return { ok: true, sidecarPath: sidecar, existed, deleted: false };
	}

	await fs.writeFile(sidecar, args.caption.replace(/\s+$/, '') + '\n', 'utf8');
	return { ok: true, sidecarPath: sidecar, existed, deleted: false };
}

export interface RenameImageArgs {
	home: string;
	imageSourcePath: string;
	newTitle: string;
}

export interface RenameImageResult {
	ok: boolean;
	oldPath: string;
	newPath: string;
	newFilename: string;
	renamedSidecar: boolean;
}

/**
 * Rename an image file to reflect a new title, preserving its numeric prefix
 * if present. If a sidecar `.txt` exists alongside the old name, it is
 * renamed in the same transaction.
 *
 * Examples:
 *   "010-Landscapes/001-dawn.jpg"  + "Dawn Light"  → "010-Landscapes/001-Dawn-Light.jpg"
 *   "010-Landscapes/001.jpg"       + "Morning Sun" → "010-Landscapes/001-Morning-Sun.jpg"
 *   "010-Landscapes/foo.jpg"       + "Bar"         → "010-Landscapes/Bar.jpg"
 */
export async function renameImage(args: RenameImageArgs): Promise<RenameImageResult> {
	const oldAbs = path.join(args.home, args.imageSourcePath);
	const { dir, ext } = path.parse(oldAbs);
	const oldBase = path.basename(oldAbs, ext);

	// Extract NNN- prefix if present
	const prefixMatch = oldBase.match(/^(\d+)(?:-(.*))?$/);
	const prefix = prefixMatch ? prefixMatch[1] : null;

	const titlePart = args.newTitle
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^\w.-]/g, '');

	const newBase = prefix ? `${prefix}-${titlePart}` : titlePart || oldBase;
	const newAbs = path.join(dir, `${newBase}${ext}`);

	if (newAbs === oldAbs) {
		return {
			ok: true,
			oldPath: oldAbs,
			newPath: newAbs,
			newFilename: path.basename(newAbs),
			renamedSidecar: false
		};
	}

	markSelfWrite(oldAbs);
	markSelfWrite(newAbs);
	await fs.rename(oldAbs, newAbs);

	const oldSidecar = sidecarPathFor(oldAbs);
	const newSidecar = sidecarPathFor(newAbs);
	let renamedSidecar = false;
	try {
		await fs.access(oldSidecar);
		markSelfWrite(oldSidecar);
		markSelfWrite(newSidecar);
		await fs.rename(oldSidecar, newSidecar);
		renamedSidecar = true;
	} catch {
		// no sidecar — nothing to rename
	}

	return {
		ok: true,
		oldPath: oldAbs,
		newPath: newAbs,
		newFilename: path.basename(newAbs),
		renamedSidecar
	};
}
