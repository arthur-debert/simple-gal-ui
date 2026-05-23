#!/usr/bin/env node
/**
 * Orchestrates the simple-gal-ui release build:
 *   1. `node scripts/fetch-simple-gal.mjs` — download the pinned simple-gal
 *      release binary into resources/bin/ (idempotent; no-ops if current).
 *   2. `vite build` — produce dist/ (renderer) + dist-electron/ (main).
 *   3. `electron-builder <args>` — package + sign + produce installer.
 *
 * Why a wrapper, not a `&&` chain in package.json?
 * --------------------------------------------------
 * pnpm 10.x preserves the `--` separator in `pnpm run build -- <args>`
 * verbatim and appends it to the LAST command of the script string.
 * So `"build": "fetch && vite build && electron-builder"` invoked as
 * `pnpm run build -- --mac --arm64 --publish never` produces
 * `electron-builder -- --mac --arm64 --publish never` — electron-builder
 * silently treats `--` as a positional and falls back to CI-implicit
 * publish, which fails with "GH_TOKEN not set" in this workflow (the
 * canonical electron-app.yml deliberately doesn't expose a publish
 * token — it uploads via gh release create in a downstream job).
 *
 * This wrapper sidesteps the issue: args are forwarded to
 * electron-builder programmatically (no `--`), and pnpm sees a
 * single-command script body.
 *
 * Forwarded args:
 *   node scripts/build.mjs --mac --arm64 --publish never
 *   pnpm run build -- --mac --arm64 --publish never
 * Both produce the same `electron-builder --mac --arm64 --publish never`.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

function run(cmd, args, opts = {}) {
	const display = `${cmd} ${args.join(' ')}`.trim();
	console.log(`→ ${display}`);
	execFileSync(cmd, args, { stdio: 'inherit', cwd: repo, ...opts });
}

// 1. Provision the bundled simple-gal binary (idempotent).
run('node', ['scripts/fetch-simple-gal.mjs']);

// 2. Build renderer + main bundles. Use a platform-neutral resolve via
//    `node` running vite's CLI entry — avoids relying on a globally
//    installed `vite` binary or shell-specific PATH munging.
run('node', ['node_modules/vite/bin/vite.js', 'build']);

// 3. Hand off to electron-builder with whatever args the caller passed.
//    Drop the leading `--` if pnpm preserved it (defensive — npm/yarn
//    strip it but pnpm 10.x doesn't).
const forwardedArgs = process.argv.slice(2);
if (forwardedArgs[0] === '--') forwardedArgs.shift();

run('node', ['node_modules/electron-builder/cli.js', ...forwardedArgs]);
