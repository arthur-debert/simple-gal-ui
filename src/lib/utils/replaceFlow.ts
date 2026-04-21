/**
 * Helpers for the Replace-image flow, shared between the album multi-select
 * path and the image-detail single-replace path.
 */

export const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);

const PREFIX_RE = /^(\d+)[-._ ]/;

function extOf(p: string): string {
	const idx = p.lastIndexOf('.');
	return idx >= 0 ? p.slice(idx).toLowerCase() : '';
}

function basenameOf(p: string): string {
	const unix = p.lastIndexOf('/');
	const win = p.lastIndexOf('\\');
	const i = Math.max(unix, win);
	return i >= 0 ? p.slice(i + 1) : p;
}

/** True if `basename` starts with a `NNN-` (or `NNN.`, `NNN_`, `NNN ` ) prefix. */
export function hasNumericPrefix(basename: string): boolean {
	return PREFIX_RE.test(basename);
}

/** True if any of the picked file paths carries its own numeric prefix. */
export function anyHasNumericPrefix(paths: string[]): boolean {
	return paths.some((p) => hasNumericPrefix(basenameOf(p)));
}

/** True if `path` ends in one of the supported image extensions. */
export function isSupportedImage(path: string): boolean {
	return IMAGE_EXTS.has(extOf(path));
}

/** Keep only paths whose extension is supported. Preserves order. */
export function filterSupportedImages(paths: string[]): string[] {
	return paths.filter((p) => isSupportedImage(p));
}

/**
 * Pair N selected images (in album visual order) with N picked replacement
 * files. Files are sorted by basename so the order is deterministic from
 * whatever the OS file dialog returned.
 */
export function pairReplacements(
	selectedSourcePaths: string[],
	replacementPaths: string[]
): { targetSourcePath: string; replacementPath: string }[] {
	const sortedReplacements = [...replacementPaths].sort((a, b) => {
		const ba = basenameOf(a);
		const bb = basenameOf(b);
		return ba.localeCompare(bb);
	});
	return selectedSourcePaths.map((t, i) => ({
		targetSourcePath: t,
		replacementPath: sortedReplacements[i]
	}));
}
