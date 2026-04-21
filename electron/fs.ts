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

export function markSelfWrite(absPath: string): void {
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

export const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);

/** File-picker filter derived from `IMAGE_EXTS` — no leading dot, lowercase. */
export const IMAGE_FILTER_EXTENSIONS = [...IMAGE_EXTS].map((e) => e.slice(1));

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

// --- Image replace (swap file in place, keep slot) ------------------------

export type ReplaceIndexStrategy = 'slot' | 'filename';

export interface ReplacePair {
	/** Image to replace — relative to `home`. */
	targetSourcePath: string;
	/** Absolute OS path of the replacement source file. */
	replacementPath: string;
}

export interface ReplaceImagesArgs {
	home: string;
	albumPath: string;
	pairs: ReplacePair[];
	/**
	 * Which numeric prefix the new file carries:
	 *  - `slot`: keep the prefix of the image being replaced (the visual slot).
	 *  - `filename`: take the prefix from the replacement's filename.
	 */
	indexStrategy: ReplaceIndexStrategy;
}

export interface ReplaceImagesResult {
	ok: boolean;
	replaced: { oldPath: string; newPath: string; filename: string }[];
	skipped: { target: string; replacement: string; reason: string }[];
}

function parsePrefixAndSlug(filename: string): { prefix: string | null; slug: string } {
	const ext = path.extname(filename);
	const base = path.basename(filename, ext);
	const m = base.match(/^(\d+)(?:[-._ ](.*))?$/);
	if (m) {
		return { prefix: m[1], slug: slugFromStem(m[2] ?? '') };
	}
	return { prefix: null, slug: slugFromStem(base) };
}

function slugFromStem(stem: string): string {
	return stem
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^\w.-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Replace one or more images in place. Each original is moved to the OS
 * trash (along with its sidecar if any), then the replacement is copied in
 * under a new filename derived from the chosen `indexStrategy`:
 *
 * - `slot` — new file inherits the replaced image's numeric prefix. Good
 *   default when you just want to swap the actual photo under an existing
 *   slot.
 * - `filename` — new file uses the numeric prefix baked into the source
 *   filename. Good for archives where the incoming files already encode
 *   desired ordering.
 *
 * The replacement source file is not deleted — we only copy.
 *
 * Sidecars (`.txt`) on the replaced image are NOT transferred: a replace
 * means a new photo, so a stale caption would be misleading.
 */
export async function replaceImages(args: ReplaceImagesArgs): Promise<ReplaceImagesResult> {
	const albumAbs = path.join(args.home, args.albumPath);
	const replaced: ReplaceImagesResult['replaced'] = [];
	const skipped: ReplaceImagesResult['skipped'] = [];

	for (const pair of args.pairs) {
		const ext = path.extname(pair.replacementPath).toLowerCase();
		if (!IMAGE_EXTS.has(ext)) {
			skipped.push({
				target: pair.targetSourcePath,
				replacement: pair.replacementPath,
				reason: 'not an image'
			});
			continue;
		}
		try {
			await fs.access(pair.replacementPath);
		} catch {
			skipped.push({
				target: pair.targetSourcePath,
				replacement: pair.replacementPath,
				reason: 'source missing'
			});
			continue;
		}

		const oldAbs = path.join(args.home, pair.targetSourcePath);
		const oldBasename = path.basename(oldAbs);
		const target = parsePrefixAndSlug(oldBasename);
		const replacementBasename = path.basename(pair.replacementPath);
		const rep = parsePrefixAndSlug(replacementBasename);

		let prefix: string | null;
		if (args.indexStrategy === 'filename') {
			prefix = rep.prefix ?? target.prefix;
		} else {
			prefix = target.prefix;
		}

		const newSlug = rep.slug || target.slug || 'image';
		const newBase = prefix ? `${prefix}-${newSlug}` : newSlug;
		const newName = `${newBase}${ext}`;
		const newAbs = path.join(albumAbs, newName);

		// Trash old image + its sidecar. Do this BEFORE copy to avoid a
		// collision when the replacement carries the same filename stem.
		markSelfWrite(oldAbs);
		await shell.trashItem(oldAbs);
		const oldSidecar = sidecarPathFor(oldAbs);
		try {
			await fs.access(oldSidecar);
			markSelfWrite(oldSidecar);
			await shell.trashItem(oldSidecar);
		} catch {
			// no sidecar — nothing to discard
		}

		markSelfWrite(newAbs);
		await fs.copyFile(pair.replacementPath, newAbs);

		const relParent = args.albumPath;
		replaced.push({
			oldPath: pair.targetSourcePath,
			newPath: relParent ? `${relParent}/${newName}` : newName,
			filename: newName
		});
	}

	return { ok: true, replaced, skipped };
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

// --- Site structure: albums, groups, pages --------------------------------

async function listChildPrefixes(dirAbs: string, kind: 'dir' | 'file'): Promise<number[]> {
	const entries = await fs.readdir(dirAbs, { withFileTypes: true }).catch(() => []);
	const nums: number[] = [];
	for (const e of entries) {
		if (kind === 'dir' && !e.isDirectory()) continue;
		if (kind === 'file' && !e.isFile()) continue;
		const m = e.name.match(/^(\d+)[-.]/);
		if (m) nums.push(parseInt(m[1], 10));
	}
	return nums;
}

function titleSlugForDir(title: string): string {
	return title.trim().replace(/\s+/g, ' ').replace(/\//g, '-');
}

function titleSlugForFile(title: string): string {
	return title
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^\w.-]/g, '');
}

export interface CreateAlbumArgs {
	home: string;
	parentPath: string; // "" for root, or a group source_dir like "020-Travel"
	title: string;
}

export interface CreateAlbumResult {
	ok: boolean;
	albumPath: string; // relative to home
	dirName: string;
}

export async function createAlbum(args: CreateAlbumArgs): Promise<CreateAlbumResult> {
	const parentAbs = path.join(args.home, args.parentPath);
	const existing = await listChildPrefixes(parentAbs, 'dir');
	const nextNum = nextNumberAfter(existing);
	const prefix = String(nextNum).padStart(3, '0');
	const dirName = `${prefix}-${titleSlugForDir(args.title)}`;
	const abs = path.join(parentAbs, dirName);
	markSelfWrite(abs);
	await fs.mkdir(abs, { recursive: false });
	return {
		ok: true,
		albumPath: path.posix.join(args.parentPath, dirName),
		dirName
	};
}

export interface CreatePageArgs {
	home: string;
	title: string;
	body?: string;
}

export interface CreatePageResult {
	ok: boolean;
	pagePath: string;
	fileName: string;
}

export async function createPage(args: CreatePageArgs): Promise<CreatePageResult> {
	const existing = await listChildPrefixes(args.home, 'file');
	const nextNum = nextNumberAfter(existing);
	const prefix = String(nextNum).padStart(3, '0');
	const fileName = `${prefix}-${titleSlugForFile(args.title)}.md`;
	const abs = path.join(args.home, fileName);
	const body = args.body ?? `# ${args.title}\n\n`;
	markSelfWrite(abs);
	await fs.writeFile(abs, body, 'utf8');
	return { ok: true, pagePath: fileName, fileName };
}

export interface RenameEntryArgs {
	home: string;
	entryPath: string; // dir or file, relative to home
	newTitle: string;
}

export interface RenameEntryResult {
	ok: boolean;
	oldPath: string;
	newPath: string;
	newName: string;
}

export async function renameEntry(args: RenameEntryArgs): Promise<RenameEntryResult> {
	const oldAbs = path.join(args.home, args.entryPath);
	const parent = path.dirname(oldAbs);
	const oldName = path.basename(oldAbs);
	const stat = await fs.stat(oldAbs);
	const isDir = stat.isDirectory();

	const prefixMatch = oldName.match(/^(\d+)(?:[-.]|$)/);
	const prefix = prefixMatch ? prefixMatch[1] : null;

	let newName: string;
	if (isDir) {
		const slug = titleSlugForDir(args.newTitle);
		newName = prefix ? `${prefix}-${slug}` : slug;
	} else {
		const ext = path.extname(oldName);
		const slug = titleSlugForFile(args.newTitle);
		newName = prefix ? `${prefix}-${slug}${ext}` : `${slug}${ext}`;
	}

	const newAbs = path.join(parent, newName);
	if (newAbs === oldAbs) {
		return { ok: true, oldPath: oldAbs, newPath: newAbs, newName };
	}
	markSelfWrite(oldAbs);
	markSelfWrite(newAbs);
	await fs.rename(oldAbs, newAbs);
	return { ok: true, oldPath: oldAbs, newPath: newAbs, newName };
}

export interface DeleteEntryArgs {
	home: string;
	entryPath: string;
}

export interface DeleteEntryResult {
	ok: boolean;
}

export async function deleteEntry(args: DeleteEntryArgs): Promise<DeleteEntryResult> {
	const abs = path.join(args.home, args.entryPath);
	markSelfWrite(abs);
	await shell.trashItem(abs);
	return { ok: true };
}

export interface WritePageArgs {
	home: string;
	pagePath: string; // relative to home, e.g. "040-about.md"
	body: string;
}

export interface WritePageResult {
	ok: boolean;
}

export async function writePage(args: WritePageArgs): Promise<WritePageResult> {
	const abs = path.join(args.home, args.pagePath);
	markSelfWrite(abs);
	await fs.writeFile(abs, args.body.replace(/\s+$/, '') + '\n', 'utf8');
	return { ok: true };
}

// --- Find a page file on disk by slug -------------------------------------

export interface FindPageFileArgs {
	home: string;
	slug: string;
}

export interface FindPageFileResult {
	ok: boolean;
	filename: string | null;
}

/**
 * Given a simple-gal manifest page slug, find the actual `.md` file on disk
 * at the home root that corresponds to it.
 *
 * We can't reconstruct the filename from the manifest fields reliably:
 * simple-gal's `link_title` converts filename hyphens to spaces for human
 * display, and its `slug` is a URL-safe transform that loses information
 * about the original filename's casing and word separators. Instead we
 * scan every `NNN-*.md` at the root and pick the one whose stem normalizes
 * to the same slug token.
 */
function normalizeToSlug(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// --- Set album thumbnail --------------------------------------------------

export interface SetAlbumThumbnailArgs {
	home: string;
	/** Album source directory relative to home, e.g. "010-Landscapes" or "020-Travel/010-Japan". */
	albumPath: string;
	/** Image source path relative to home, e.g. "010-Landscapes/003-Sunset.jpg". */
	imageSourcePath: string;
}

export interface SetAlbumThumbnailResult {
	ok: boolean;
	/** The previously-designated thumb, renamed to strip its `thumb-` segment. null if none. */
	previousThumb: { old: string; new: string } | null;
	/** The chosen image, renamed to carry `thumb-` after its NNN- prefix. */
	newThumb: { old: string; new: string };
	/** True if the chosen image was already the thumb — no renames happened. */
	noOp: boolean;
}

/**
 * Mark a given image as the album's thumbnail by renaming it to insert
 * `thumb-` after the `NNN-` prefix, and (if another file in the album was
 * carrying the thumbnail marker) rename that file back by stripping its
 * `thumb-` segment. Simple-gal uses the first file matching `NNN-thumb…`
 * as the preview.
 */
export async function setAlbumThumbnail(
	args: SetAlbumThumbnailArgs
): Promise<SetAlbumThumbnailResult> {
	const albumAbs = path.join(args.home, args.albumPath);
	const entries = await fs.readdir(albumAbs);

	// Match files of the form `NNN-thumb.ext` or `NNN-thumb-<rest>.ext`.
	const thumbPattern = /^(\d+)-thumb(?:-(.*))?(\.[^.]+)$/;

	const chosenBasename = path.basename(args.imageSourcePath);

	// If the chosen image is already the thumb, no-op.
	if (thumbPattern.test(chosenBasename)) {
		return {
			ok: true,
			previousThumb: null,
			newThumb: {
				old: args.imageSourcePath,
				new: args.imageSourcePath
			},
			noOp: true
		};
	}

	let previousThumb: SetAlbumThumbnailResult['previousThumb'] = null;

	// Find and demote any existing thumbnail file
	for (const name of entries) {
		const m = name.match(thumbPattern);
		if (!m) continue;
		const prefix = m[1];
		const tail = m[2]; // may be undefined for bare `NNN-thumb.ext`
		const ext = m[3];
		const newName = tail ? `${prefix}-${tail}${ext}` : `${prefix}${ext}`;
		const oldAbs = path.join(albumAbs, name);
		const newAbs = path.join(albumAbs, newName);
		markSelfWrite(oldAbs);
		markSelfWrite(newAbs);
		await fs.rename(oldAbs, newAbs);
		previousThumb = {
			old: path.posix.join(args.albumPath, name),
			new: path.posix.join(args.albumPath, newName)
		};
		// Also move a sidecar if one existed for the demoted file
		const oldSidecar = sidecarPathFor(oldAbs);
		try {
			await fs.access(oldSidecar);
			const { dir, name: oldSideName } = path.parse(oldSidecar);
			void oldSideName;
			const newSidecar = path.join(dir, `${path.parse(newName).name}.txt`);
			markSelfWrite(oldSidecar);
			markSelfWrite(newSidecar);
			await fs.rename(oldSidecar, newSidecar);
		} catch {
			// no sidecar, nothing to rename
		}
		break; // simple-gal only honors the first; one demotion is enough
	}

	// Promote the chosen image by inserting `thumb-` after its NNN- prefix
	const chosenAbs = path.join(args.home, args.imageSourcePath);
	const parsed = path.parse(chosenAbs);
	const prefixMatch = parsed.name.match(/^(\d+)(?:-(.*))?$/);
	let newChosenBasename: string;
	if (prefixMatch) {
		const prefix = prefixMatch[1];
		const rest = prefixMatch[2];
		newChosenBasename = rest
			? `${prefix}-thumb-${rest}${parsed.ext}`
			: `${prefix}-thumb${parsed.ext}`;
	} else {
		// No NNN- prefix — unusual for simple-gal content, but handle gracefully
		newChosenBasename = `thumb-${parsed.name}${parsed.ext}`;
	}
	const newChosenAbs = path.join(parsed.dir, newChosenBasename);
	markSelfWrite(chosenAbs);
	markSelfWrite(newChosenAbs);
	await fs.rename(chosenAbs, newChosenAbs);

	// Move the chosen image's sidecar if one exists
	const oldChosenSidecar = sidecarPathFor(chosenAbs);
	try {
		await fs.access(oldChosenSidecar);
		const newChosenSidecar = path.join(parsed.dir, `${path.parse(newChosenBasename).name}.txt`);
		markSelfWrite(oldChosenSidecar);
		markSelfWrite(newChosenSidecar);
		await fs.rename(oldChosenSidecar, newChosenSidecar);
	} catch {
		// no sidecar
	}

	const relParent = args.imageSourcePath.slice(0, args.imageSourcePath.lastIndexOf('/'));
	return {
		ok: true,
		previousThumb,
		newThumb: {
			old: args.imageSourcePath,
			new: relParent ? `${relParent}/${newChosenBasename}` : newChosenBasename
		},
		noOp: false
	};
}

export async function findPageFile(args: FindPageFileArgs): Promise<FindPageFileResult> {
	const entries = await fs.readdir(args.home).catch(() => [] as string[]);
	const target = normalizeToSlug(args.slug);
	for (const name of entries) {
		if (!name.endsWith('.md')) continue;
		const stem = name.slice(0, -3);
		const stripped = stem.replace(/^\d+-?/, '');
		if (normalizeToSlug(stripped) === target) {
			return { ok: true, filename: name };
		}
	}
	return { ok: false, filename: null };
}

// --- Reorder tree entries (albums or pages) -------------------------------

export interface ReorderTreeEntriesArgs {
	home: string;
	parentPath: string; // "" for root
	kind: 'dir' | 'file'; // 'dir' = albums/groups, 'file' = pages
	/** Ordered list of current entry names (basenames) at parentPath. */
	orderedNames: string[];
}

export interface ReorderTreeEntriesResult {
	ok: boolean;
	renames: { old: string; new: string }[];
}

/**
 * Renumber a set of sibling entries (directories for albums/groups, files for
 * pages) to match the desired order, using sparse 10/20/30 prefixes.
 *
 * Two-phase rename: first every entry moves to a temp name, then each is
 * renamed to its final name. This avoids collisions when two entries would
 * swap positions or share a target prefix.
 */
export async function reorderTreeEntries(
	args: ReorderTreeEntriesArgs
): Promise<ReorderTreeEntriesResult> {
	const parentAbs = path.join(args.home, args.parentPath);
	const renames: ReorderTreeEntriesResult['renames'] = [];

	interface StepOne {
		tmp: string;
		finalName: string;
	}
	const stepOne: StepOne[] = [];

	for (let i = 0; i < args.orderedNames.length; i++) {
		const oldName = args.orderedNames[i];
		const oldAbs = path.join(parentAbs, oldName);

		let stripped: string;
		let ext = '';
		if (args.kind === 'file') {
			ext = path.extname(oldName);
			const base = path.basename(oldName, ext);
			stripped = base.replace(/^\d+-?/, '');
		} else {
			stripped = oldName.replace(/^\d+-?/, '');
		}

		const prefix = String((i + 1) * 10).padStart(3, '0');
		const finalName = stripped
			? args.kind === 'file'
				? `${prefix}-${stripped}${ext}`
				: `${prefix}-${stripped}`
			: args.kind === 'file'
				? `${prefix}${ext}`
				: prefix;

		const tmp = path.join(parentAbs, `.sgui-tree-tmp-${i}-${oldName}`);
		markSelfWrite(oldAbs);
		markSelfWrite(tmp);
		await fs.rename(oldAbs, tmp);

		stepOne.push({ tmp, finalName });
		renames.push({
			old: path.posix.join(args.parentPath, oldName),
			new: path.posix.join(args.parentPath, finalName)
		});
	}

	for (const { tmp, finalName } of stepOne) {
		const finalAbs = path.join(parentAbs, finalName);
		markSelfWrite(tmp);
		markSelfWrite(finalAbs);
		await fs.rename(tmp, finalAbs);
	}

	return { ok: true, renames };
}
