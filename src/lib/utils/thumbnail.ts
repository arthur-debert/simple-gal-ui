import type { ManifestAlbum, ManifestImage } from '$lib/types/manifest';

/**
 * Whether a file's basename carries the explicit thumbnail marker
 * `NNN-thumb-…`. Mirrors the regex in electron/fs.ts#setAlbumThumbnail.
 *
 * Use this to decide whether promoting would be a no-op — NOT to
 * decide what the album's thumbnail actually is. For the latter see
 * `isAlbumThumbnail()`, which consults `preview_image` (the
 * authoritative field, which also captures the first-image fallback
 * when nothing is explicitly marked).
 */
export const THUMB_FILENAME_RE = /^(\d+)-thumb(?:-.*)?\.[^.]+$/i;

export function isThumbFilename(filename: string): boolean {
	return THUMB_FILENAME_RE.test(filename);
}

/**
 * True when this image is what simple-gal considers the album's
 * thumbnail — either because its filename carries the `thumb-` marker,
 * OR because nothing is marked and it's the first image in the album
 * (simple-gal's fallback).
 */
export function isAlbumThumbnail(album: ManifestAlbum, img: ManifestImage): boolean {
	return album.preview_image === img.source_path;
}

/**
 * Title to show in the UI. Simple-gal derives titles from filenames,
 * so a file carrying the `thumb-` marker ends up with "thumb" (or
 * "thumb-dawn") in its title. Strip the marker token so promoting /
 * demoting an image doesn't change the name the user sees.
 */
export function displayImageTitle(img: ManifestImage): string {
	const base = img.title ?? img.filename.replace(/\.[^.]+$/, '');
	if (!isThumbFilename(img.filename)) return base;
	const stripped = base
		.replace(/^thumb[-\s]+/i, '')
		.replace(/[-\s]+thumb$/i, '')
		.replace(/\bthumb\b/i, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
	return stripped || base;
}
