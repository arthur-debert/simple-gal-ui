/**
 * Single source of truth for the image extensions the UI recognizes.
 *
 * Imported by both the Electron main process (`electron/fs.ts`,
 * `electron/app.ts`) and the renderer (`replaceFlow.ts`). Having one
 * allowlist prevents the native file-picker filter from ever disagreeing
 * with renderer-side validation (e.g. pickable but rejected on drop,
 * or vice versa).
 */
export const IMAGE_EXT_LIST = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'] as const;

export const IMAGE_EXTS: ReadonlySet<string> = new Set(IMAGE_EXT_LIST);

/** File-picker filter derived from `IMAGE_EXT_LIST` — no leading dot. */
export const IMAGE_FILTER_EXTENSIONS: string[] = IMAGE_EXT_LIST.map((e) => e.slice(1));

/**
 * Last-segment of a path, tolerant of both POSIX `/` and Windows `\`
 * separators. Safe to call on OS paths coming from Electron APIs
 * (native file picker, drag-drop `getPathForFile`) where the raw
 * separator depends on the host platform.
 */
export function basenameOf(p: string): string {
	const parts = p.split(/[\\/]/);
	return parts[parts.length - 1] ?? p;
}
