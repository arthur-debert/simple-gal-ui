# simple-gal-ui

A desktop UI for [simple-gal](https://github.com/arthur-debert/simple-gal), the minimalist static gallery generator for fine-art photography.

`simple-gal` treats the filesystem as the source of truth: directories are galleries, `NNN-name.ext` sorts images, `.txt` sidecars carry captions, `config.toml` cascades root → group → gallery. This app is a thin visual front-end around that model. It never duplicates simple-gal's logic — it orchestrates the CLI for scanning/validating/building and writes files directly for mutations.

## Status

In active development. Delivered as a series of stacked PRs that each leave the app in a usable-but-limited state:

- PR1 — Foundation: Electron shell, three-pane layout, shadcn-svelte primitives, simple-gal binary resolver, Playwright smoke test.
- PR2 — Read-only gallery browse: Open a gallery home, scan via `simple-gal scan --format json`, render the site tree (albums + pages), and browse albums / images / pages read-only.
- PR3 — Preview pipeline: Click Build, run `simple-gal build --format json` into a per-home tmp dir, serve the rendered dist over a local HTTP server, and show it in an iframe in the right pane with a phase-aware status bar and config-error overlay.
- PR4 — Image title & caption editing: Editable title + caption form that writes sidecar `.txt` files and renames image files while preserving `NNN-` prefixes. Chokidar watches the gallery home and triggers debounced auto-build so the preview follows changes.
- **PR5 — Image management within an album** *(current)*: Drag-drop OS images into an album (copied with next-available `NNN-` prefix), delete-to-trash on hover, drag-reorder thumbnails with sparse renumbering (10/20/30…), and an album `description.md` editor.
- PR6 — Site structure editing

## Stack

- **Electron** (main + preload + renderer, context isolation on)
- **Vite 7 + Svelte 5 + TypeScript** (plain SPA, no SvelteKit)
- **Tailwind CSS 4** with design tokens lifted from [seer](https://github.com/arthur-debert/seer)
- **shadcn-svelte / bits-ui** for UI primitives
- **Playwright** with `_electron` driver for headless UI tests & screenshots

## Development

```sh
pnpm install

# simple-gal binary: for now, point at a local build
export SIMPLE_GAL_PATH=$(which simple-gal)

pnpm dev          # starts vite + electron in dev mode
pnpm run build    # builds renderer + main
pnpm run check    # svelte-check
pnpm run lint
pnpm run test:e2e # Playwright smoke test (builds first)
```

Future PRs will add a `scripts/fetch-simple-gal.mjs` that downloads pinned release binaries into `resources/bin/<platform>-<arch>/` so no local install is needed.

## Design principles

1. **Files are the source of truth.** Everything the user does is a filesystem operation inside the gallery home.
2. **simple-gal owns the logic.** We shell out for `scan`, `check`, and `build`. We never re-implement image processing, manifest construction, or TOML semantics.
3. **Hand-editable outside the app.** Nothing the app writes should surprise a user who later opens the directory in a text editor.
4. **30-year longevity.** If the app disappears tomorrow, the gallery home is still a valid simple-gal source tree.
