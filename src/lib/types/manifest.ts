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
}

export interface ManifestNavItem {
	title: string;
	path: string;
	source_dir: string;
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

export interface Manifest {
	navigation: ManifestNavItem[];
	albums: ManifestAlbum[];
	pages: ManifestPage[];
	groups?: ManifestGroup[];
	config: ResolvedConfig;
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

export type SelectionKind = 'album' | 'image' | 'page' | 'none';

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

export interface NoSelection {
	kind: 'none';
}

export type Selection = AlbumSelection | ImageSelection | PageSelection | NoSelection;
