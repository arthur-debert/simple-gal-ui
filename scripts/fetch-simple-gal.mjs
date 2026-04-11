#!/usr/bin/env node
/**
 * Download the pinned simple-gal release binary and place it under
 * `resources/bin/<platform>-<arch>/simple-gal[.exe]` so Electron's packaged
 * builds can ship it as extraResource.
 *
 * Resolution order:
 *   1. `SIMPLE_GAL_PATH` env var → skip, dev is already handled.
 *   2. A binary already at the target path whose `--version` matches the
 *      pinned version → skip (idempotent).
 *   3. Download the matching release asset from
 *      https://github.com/arthur-debert/simple-gal/releases/download/v<version>/<asset>,
 *      extract, copy into place.
 *
 * Runs automatically as a postinstall hook on `pnpm install`, and again
 * at package time before electron-builder.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	copyFileSync,
	chmodSync,
	readFileSync,
	rmSync,
	createWriteStream
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = pkg.simpleGalVersion;

if (!version) {
	console.error('[fetch-simple-gal] simpleGalVersion is not set in package.json');
	process.exit(1);
}

// Map Node's (process.platform, process.arch) to the simple-gal release
// asset filename.
const ASSETS = {
	'darwin-arm64': 'simple-gal-aarch64-apple-darwin.tar.gz',
	'linux-arm64': 'simple-gal-aarch64-linux-gnu.tar.gz',
	'linux-x64': 'simple-gal-x86_64-linux-gnu.tar.gz',
	'win32-x64': 'simple-gal-x86_64-windows.zip'
};

const platKey = `${process.platform}-${process.arch}`;
const assetName = ASSETS[platKey];
const exe = process.platform === 'win32' ? 'simple-gal.exe' : 'simple-gal';
const targetDir = path.join(repoRoot, 'resources', 'bin', platKey);
const targetBin = path.join(targetDir, exe);

function tryVersion(bin) {
	try {
		return execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

function softExit(msg) {
	// In CI we want a hard failure; in dev we want `pnpm install` to keep going
	// so the PATH/sibling fallback in electron/binPath.ts can take over.
	console.error(`[fetch-simple-gal] ${msg}`);
	if (process.env.CI) {
		process.exit(1);
	}
	console.error(
		'[fetch-simple-gal] Proceeding without a bundled binary (dev fallback will apply).'
	);
	process.exit(0);
}

// (1) Dev override — nothing to do.
if (process.env.SIMPLE_GAL_PATH && existsSync(process.env.SIMPLE_GAL_PATH)) {
	console.log(
		`[fetch-simple-gal] SIMPLE_GAL_PATH=${process.env.SIMPLE_GAL_PATH} — skipping bundle (dev mode)`
	);
	process.exit(0);
}

// (2) Cache hit — the binary is already in place and matches the pinned version.
if (existsSync(targetBin)) {
	const current = tryVersion(targetBin);
	if (current && current.includes(version)) {
		console.log(`[fetch-simple-gal] ${targetBin} already at ${current} — skipping`);
		process.exit(0);
	}
	console.log(
		`[fetch-simple-gal] existing binary at ${targetBin} (${current ?? '?'}) — refreshing`
	);
}

if (!assetName) {
	softExit(
		`no simple-gal release asset published for ${platKey}. Available platforms: ${Object.keys(ASSETS).join(', ')}.`
	);
}

const url = `https://github.com/arthur-debert/simple-gal/releases/download/v${version}/${assetName}`;
const scratch = mkdtempSync(path.join(os.tmpdir(), `simple-gal-dl-${version}-`));
const archivePath = path.join(scratch, assetName);

console.log(`[fetch-simple-gal] downloading ${url}`);

try {
	// Node 18+ has global fetch. The release URL returns a 302 to a signed S3
	// URL that we must follow; fetch() handles redirects transparently.
	const res = await fetch(url, { redirect: 'follow' });
	if (!res.ok) {
		softExit(`download failed: ${res.status} ${res.statusText}`);
	}
	if (!res.body) {
		softExit('download returned an empty body');
	}
	await pipeline(res.body, createWriteStream(archivePath));
} catch (err) {
	softExit(`download error: ${err.message}`);
}

// Extract. On every supported platform `tar` handles .tar.gz; Windows 10+
// also ships a `tar.exe` that understands .zip via libarchive.
console.log(`[fetch-simple-gal] extracting ${archivePath}`);
try {
	if (assetName.endsWith('.tar.gz')) {
		execFileSync('tar', ['-xzf', archivePath, '-C', scratch], { stdio: 'inherit' });
	} else if (assetName.endsWith('.zip')) {
		// `tar -xf <zip>` works on macOS / Linux (bsdtar) and Windows 10+ tar.exe.
		execFileSync('tar', ['-xf', archivePath, '-C', scratch], { stdio: 'inherit' });
	} else {
		softExit(`unknown archive type for ${assetName}`);
	}
} catch (err) {
	softExit(`extraction failed: ${err.message}`);
}

// Simple-gal's release archives contain a single executable named after the
// target triple (e.g. `simple-gal-aarch64-apple-darwin` or
// `simple-gal-x86_64-windows.exe`). The asset's basename minus its `.tar.gz`
// / `.zip` extension is therefore the binary name.
function findBin(root) {
	const archiveBase = assetName.replace(/\.tar\.gz$/, '').replace(/\.zip$/, '');
	const candidates = [
		// Most likely: `simple-gal-<target>` at archive root
		path.join(root, archiveBase + (process.platform === 'win32' ? '.exe' : '')),
		path.join(root, archiveBase),
		// Plain `simple-gal` at root (older archive layout)
		path.join(root, exe),
		path.join(root, 'bin', exe),
		path.join(root, `simple-gal-${version}`, exe)
	];
	for (const p of candidates) {
		if (existsSync(p)) return p;
	}
	return null;
}

const extractedBin = findBin(scratch);
if (!extractedBin) {
	softExit(
		`could not find ${exe} inside the extracted archive at ${scratch}. Contents: ${execFileSync('ls', ['-la', scratch], { encoding: 'utf8' })}`
	);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(extractedBin, targetBin);
if (process.platform !== 'win32') chmodSync(targetBin, 0o755);

// Clean up scratch
try {
	rmSync(scratch, { recursive: true, force: true });
} catch {
	// non-fatal
}

const finalVersion = tryVersion(targetBin);
console.log(`[fetch-simple-gal] installed ${targetBin} (${finalVersion ?? '?'})`);
