/**
 * Renderer-side mirror of the JSON envelope types emitted by
 * `simple-gal --format json`. Kept in sync with electron/simpleGal.ts.
 */

export interface SimpleGalOk<TData = unknown> {
	ok: true;
	command: string;
	data: TData;
}

export interface SimpleGalConfigError {
	path: string;
	line?: number;
	column?: number;
	snippet?: string;
}

export interface SimpleGalErr {
	ok: false;
	kind: string;
	message: string;
	causes?: string[];
	config?: SimpleGalConfigError;
}

export type SimpleGalResult<TData = unknown> = SimpleGalOk<TData> | SimpleGalErr;

export interface ManifestImage {
	number: number;
	source_path: string;
	filename: string;
	slug: string;
	title?: string;
	description?: string;
	/**
	 * SHA-256 of the image bytes. Matches an entry in
	 * `Manifest.canonical_images`. Added in simple-gal v0.18; `undefined`
	 * for manifests emitted before that.
	 */
	canonical_id?: string;
}

export interface ManifestNavItem {
	title: string;
	path: string;
	source_dir: string;
	/** Present on group nodes. Nested groups are possible (arbitrary depth). */
	children?: ManifestNavItem[];
}

export interface ManifestPage {
	title: string;
	link_title: string;
	slug: string;
	body: string;
	in_nav: boolean;
	sort_key: number;
	is_link: boolean;
	url?: string;
}

export type ResolvedConfig = Record<string, unknown>;

export interface ManifestAlbum {
	path: string;
	title: string;
	preview_image?: string;
	images: ManifestImage[];
	in_nav: boolean;
	config: ResolvedConfig;
	description?: string;
}

export interface ManifestGroup {
	path: string;
	title: string;
	in_nav: boolean;
	config: ResolvedConfig;
	description?: string;
}

/**
 * Content-addressed record of a single source image, emitted once per
 * unique SHA-256. When the same bytes appear in multiple albums, every
 * `ManifestImage` for those copies shares the same `canonical_id` and
 * the extra source paths show up in `aliases`.
 *
 * Added in simple-gal v0.18; both scan and process manifests include
 * it. Process output enriches the same records with IPTC / dimensions
 * once they've been decoded.
 */
export interface CanonicalImage {
	id: string;
	source_path: string;
	aliases?: string[];
	iptc_title?: string;
	iptc_description?: string;
	width?: number;
	height?: number;
}

export interface Manifest {
	navigation: ManifestNavItem[];
	albums: ManifestAlbum[];
	pages: ManifestPage[];
	groups?: ManifestGroup[];
	config: ResolvedConfig;
	canonical_images?: CanonicalImage[];
}

export interface ScanCounts {
	albums: number;
	images: number;
	pages: number;
}

export interface ScanData {
	source: string;
	counts: ScanCounts;
	manifest: Manifest;
}

// Selection model for the UI tree

export type SelectionKind = 'album' | 'image' | 'page' | 'config' | 'none';

export interface AlbumSelection {
	kind: 'album';
	albumPath: string;
}

export interface ImageSelection {
	kind: 'image';
	albumPath: string;
	imageSourcePath: string;
}

export interface PageSelection {
	kind: 'page';
	pageSlug: string;
}

/**
 * Selecting a config target pops the config editor in the center pane.
 * `dirPath` is absolute (the cascade loader needs one); `levelKind` is a
 * renderer hint carried through from the tree row so the UI can label the
 * editor correctly before loadCascade resolves.
 */
export interface ConfigSelection {
	kind: 'config';
	dirPath: string;
	levelKind: 'root' | 'group' | 'album';
}

export interface NoSelection {
	kind: 'none';
}

export type Selection =
	| AlbumSelection
	| ImageSelection
	| PageSelection
	| ConfigSelection
	| NoSelection;
