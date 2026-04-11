import { promises as fs } from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';

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

// --- Image import ---------------------------------------------------------

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);

export interface ImportImagesArgs {
	home: string;
	albumPath: string; // relative path like "010-Landscapes" (source_dir, not slug)
	sourcePaths: string[]; // absolute OS paths of files dragged in
}

export interface ImportImagesResult {
	ok: boolean;
	imported: { source: string; dest: string; filename: string }[];
	skipped: { source: string; reason: string }[];
}

async function listAlbumImageNumbers(albumAbs: string): Promise<number[]> {
	const entries = await fs.readdir(albumAbs).catch(() => [] as string[]);
	const nums: number[] = [];
	for (const name of entries) {
		const ext = path.extname(name).toLowerCase();
		if (!IMAGE_EXTS.has(ext)) continue;
		const m = name.match(/^(\d+)(?:[-.]|$)/);
		if (m) nums.push(parseInt(m[1], 10));
	}
	return nums;
}

function nextNumberAfter(existing: number[], gap = 10): number {
	if (existing.length === 0) return gap;
	const max = Math.max(...existing);
	return Math.ceil((max + 1) / gap) * gap;
}

function slugFromSourcePath(p: string): string {
	const base = path.basename(p, path.extname(p));
	// Strip any leading digits + dashes (don't carry a foreign prefix in)
	const stripped = base.replace(/^\d+[-._ ]*/, '');
	const clean = stripped
		.replace(/\s+/g, '-')
		.replace(/[^\w.-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return clean || base;
}

export async function importImages(args: ImportImagesArgs): Promise<ImportImagesResult> {
	const albumAbs = path.join(args.home, args.albumPath);
	const existing = await listAlbumImageNumbers(albumAbs);
	let nextNum = nextNumberAfter(existing);

	const imported: ImportImagesResult['imported'] = [];
	const skipped: ImportImagesResult['skipped'] = [];

	for (const src of args.sourcePaths) {
		const ext = path.extname(src).toLowerCase();
		if (!IMAGE_EXTS.has(ext)) {
			skipped.push({ source: src, reason: 'not an image' });
			continue;
		}
		try {
			await fs.access(src);
		} catch {
			skipped.push({ source: src, reason: 'source missing' });
			continue;
		}
		const slug = slugFromSourcePath(src);
		const prefix = String(nextNum).padStart(3, '0');
		const destName = slug ? `${prefix}-${slug}${ext}` : `${prefix}${ext}`;
		const dest = path.join(albumAbs, destName);
		markSelfWrite(dest);
		await fs.copyFile(src, dest);
		imported.push({ source: src, dest, filename: destName });
		nextNum += 10;
	}

	return { ok: true, imported, skipped };
}

// --- Image delete (OS trash) ---------------------------------------------

export interface DeleteImageArgs {
	home: string;
	imageSourcePath: string;
}

export interface DeleteImageResult {
	ok: boolean;
	trashedSidecar: boolean;
}

export async function deleteImage(args: DeleteImageArgs): Promise<DeleteImageResult> {
	const abs = path.join(args.home, args.imageSourcePath);
	markSelfWrite(abs);
	await shell.trashItem(abs);

	const sidecar = sidecarPathFor(abs);
	let trashedSidecar = false;
	try {
		await fs.access(sidecar);
		markSelfWrite(sidecar);
		await shell.trashItem(sidecar);
		trashedSidecar = true;
	} catch {
		// no sidecar
	}
	return { ok: true, trashedSidecar };
}

// --- Reorder images in album ---------------------------------------------

export interface ReorderImagesArgs {
	home: string;
	albumPath: string;
	/** Ordered list of current source_paths (relative to home) in desired order. */
	orderedSourcePaths: string[];
}

export interface ReorderImagesResult {
	ok: boolean;
	renames: { old: string; new: string }[];
}

/**
 * Renumber images to match the desired order, using sparse prefixes
 * (10, 20, 30...) so future single-image inserts don't force renumbering.
 *
 * Executes in two phases to avoid clobbering: first rename everything to a
 * temporary name, then rename to final target names.
 */
export async function reorderImages(args: ReorderImagesArgs): Promise<ReorderImagesResult> {
	const albumAbs = path.join(args.home, args.albumPath);
	const renames: ReorderImagesResult['renames'] = [];

	const stepOne: { tmp: string; finalBase: string; sidecarTmp?: string; sidecarFinal?: string }[] =
		[];

	for (let i = 0; i < args.orderedSourcePaths.length; i++) {
		const rel = args.orderedSourcePaths[i];
		const abs = path.join(args.home, rel);
		const ext = path.extname(abs);
		const oldBase = path.basename(abs, ext);
		const stripped = oldBase.replace(/^\d+-?/, '');
		const prefix = String((i + 1) * 10).padStart(3, '0');
		const finalBase = stripped ? `${prefix}-${stripped}` : prefix;
		const tmp = path.join(albumAbs, `.sgui-tmp-${i}-${path.basename(abs)}`);

		markSelfWrite(abs);
		markSelfWrite(tmp);
		await fs.rename(abs, tmp);

		const entry: (typeof stepOne)[number] = { tmp, finalBase };
		const oldSidecar = sidecarPathFor(abs);
		try {
			await fs.access(oldSidecar);
			const sidecarTmp = path.join(albumAbs, `.sgui-tmp-sc-${i}-${path.basename(oldSidecar)}`);
			markSelfWrite(oldSidecar);
			markSelfWrite(sidecarTmp);
			await fs.rename(oldSidecar, sidecarTmp);
			entry.sidecarTmp = sidecarTmp;
			entry.sidecarFinal = `${finalBase}.txt`;
		} catch {
			// no sidecar
		}
		stepOne.push(entry);
		renames.push({ old: rel, new: `${args.albumPath}/${finalBase}${ext}` });
	}

	for (const entry of stepOne) {
		const ext = path.extname(entry.tmp).replace(/^\.sgui-tmp-\d+-/, '');
		const finalImageName = `${entry.finalBase}${path.extname(entry.tmp.replace(/^.*\./, '.'))}`;
		// Derive extension from original name baked into tmp (tmp = .sgui-tmp-<i>-<origName>)
		const origName = path.basename(entry.tmp).replace(/^\.sgui-tmp-\d+-/, '');
		const origExt = path.extname(origName);
		const finalAbs = path.join(albumAbs, `${entry.finalBase}${origExt}`);
		markSelfWrite(entry.tmp);
		markSelfWrite(finalAbs);
		await fs.rename(entry.tmp, finalAbs);
		void ext;
		void finalImageName;

		if (entry.sidecarTmp && entry.sidecarFinal) {
			const finalSidecar = path.join(albumAbs, entry.sidecarFinal);
			markSelfWrite(entry.sidecarTmp);
			markSelfWrite(finalSidecar);
			await fs.rename(entry.sidecarTmp, finalSidecar);
		}
	}

	return { ok: true, renames };
}

// --- Album description ---------------------------------------------------

export interface WriteDescriptionArgs {
	home: string;
	albumPath: string;
	body: string; // empty → remove both .md and .txt
	preferMarkdown?: boolean;
}

export interface WriteDescriptionResult {
	ok: boolean;
	writtenPath: string | null;
	removedPaths: string[];
}

/**
 * Write an album description. simple-gal prefers `description.md` over
 * `description.txt`; we follow the same convention. Empty body deletes both.
 */
export async function writeDescription(
	args: WriteDescriptionArgs
): Promise<WriteDescriptionResult> {
	const albumAbs = path.join(args.home, args.albumPath);
	const md = path.join(albumAbs, 'description.md');
	const txt = path.join(albumAbs, 'description.txt');
	const removed: string[] = [];

	if (args.body.trim() === '') {
		for (const p of [md, txt]) {
			try {
				await fs.access(p);
				markSelfWrite(p);
				await fs.unlink(p);
				removed.push(p);
			} catch {
				// not present
			}
		}
		return { ok: true, writtenPath: null, removedPaths: removed };
	}

	const useMd = args.preferMarkdown ?? true;
	const target = useMd ? md : txt;
	markSelfWrite(target);
	await fs.writeFile(target, args.body.replace(/\s+$/, '') + '\n', 'utf8');

	// If writing .md, clear any stale .txt to avoid confusion
	if (useMd) {
		try {
			await fs.access(txt);
			markSelfWrite(txt);
			await fs.unlink(txt);
			removed.push(txt);
		} catch {
			// ok
		}
	}

	return { ok: true, writtenPath: target, removedPaths: removed };
}
