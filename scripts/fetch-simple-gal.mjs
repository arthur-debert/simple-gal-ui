#!/usr/bin/env node
/**
 * Fetch the pinned simple-gal binary for the current platform.
 *
 * In PR1 this is a placeholder: it only checks whether SIMPLE_GAL_PATH is set
 * (dev mode) and prints guidance. A future PR will download pinned release
 * binaries from GitHub into resources/bin/<platform>-<arch>/.
 */
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = pkg.simpleGalVersion;

const override = process.env.SIMPLE_GAL_PATH;
if (override && existsSync(override)) {
	console.log(`[fetch-simple-gal] using SIMPLE_GAL_PATH=${override}`);
	process.exit(0);
}

console.log(
	`[fetch-simple-gal] Pinned version: ${version}\n` +
		`[fetch-simple-gal] No bundled binary yet. For development, set SIMPLE_GAL_PATH to a local simple-gal build.\n` +
		`[fetch-simple-gal] Example: export SIMPLE_GAL_PATH=$(which simple-gal)`
);
