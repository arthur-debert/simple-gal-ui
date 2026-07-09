<!-- generated - do not edit; fragments live in CHANGELOG/ (`shipit changelog render` regenerates this file) -->

# Changelog

## Unreleased

### Changed

- Migrate to fragment-directory changelog model. Source of truth is now
  `CHANGELOG/unreleased-*.md` fragments; `CHANGELOG.md` is generated
  via `bin/changelog render`. Pre-existing history is captured verbatim
  in `CHANGELOG/legacy.md`. See arthur-debert/release#201.
### Changed

- Retire the bespoke `e2e` job in `.github/workflows/test.yml` in favor
  of the canonical `e2e: true` input on `electron-ci.yml@v1` (landed in
  arthur-debert/release#185). The job now runs from the reusable
  workflow with the consumer-specific glue (`vite build` + setting
  `SIMPLE_GAL_PATH`) moved into the `pre-test` hook.
### Changed

- Migrate release reusable-workflow callers from @v2 to @v3
### Changed

- Add vitest unit suite + coverage for `electron/configIO`. Wires
  `release-core test-unit` / `release-core coverage` (previously
  "(none wired)") to a 28-case suite covering the four pure
  dotted-key helpers and the atomic TOML write / empty-prune file
  ops, at 98% line coverage on the module.


All notable UI-facing changes to simple-gal-ui.

## [0.1.3] - 2026-05-23

### Changed

- Sync canonical `bin/build` from `arthur-debert/release@v1` — picks up
  the strip-leading-`--` fix that prevents pnpm consumers from
  silently swallowing `--publish never` and falling back to
  CI-implicit publish.

## [0.1.0] - 2026-05-23

### Added

- **Remember last-opened album / image.** The app now restores the
  previously-selected album or image on launch when the same gallery home
  opens. Matching is strict-exact (album by title, image by filename) so a
  rename between sessions falls back to no selection rather than guessing.
- **Build button doubles as a progress indicator.** The top-bar Build /
  Update button fills left-to-right with the accent color as a build
  advances, showing an integer percent. The redundant wide progress bar
  behind the status footer is gone; the `N/M images` detail stays.
- **Thumbnail avatar in AlbumView.** A small preview of the current album
  thumbnail now sits next to the album title, with a pencil shortcut that
  sets the selected image as the new thumbnail. A diagonal accent corner
  chip (star icon) also marks the thumbnail tile in the grid and the
  image preview in the detail view — including the first-image fallback
  when nothing is explicitly marked.
- **Config editor Back button** in the editor header returns you to the
  previous album/image/page selection. With unsaved edits, a confirm
  modal intercepts with Save / Discard / Cancel and lists the changed
  keys.

### Changed

- **Top bar title** is now `SimpleGal: <truncated gallery path>` (end of
  path preserved, start truncated) with a pencil to change the gallery
  home. The separate "Open gallery home…" button is gone.
- **Build → Update.** The top-bar button and the empty-preview prompt
  now say "Update" / "Update now", matching what the action actually
  does on a re-run.
- **Use-as-Thumbnail button hides when already explicitly marked.** In
  both the album view and the image detail editor, the button only shows
  when clicking it would actually do something. The thumbnail itself is
  now flagged by the diagonal corner chip, not a text badge.
- **Document / window title** tracks the current gallery home.

### Fixed

- **Image title no longer shows `thumb` after promotion.** Displayed
  titles strip the `thumb` / `thumb-` tokens so a photo keeps its real
  name in the UI whether it's the thumbnail or not.
- **Renaming a thumb-marked image preserves the marker.** Previously,
  editing the title of `001-thumb-dawn.jpg` to "Dawn Light" silently
  demoted the thumbnail to `001-Dawn-Light.jpg`. The rename now keeps
  the marker: `001-thumb-Dawn-Light.jpg`.

- **Broken gallery thumbnails in dev.** `webSecurity` is now disabled in
  `pnpm dev` so `file://` image srcs load against the dev server origin
  (`http://localhost:5173`). Packaged builds are unaffected.
- **DevTools Autofill console spam.** The two
  `Autofill.enable` / `Autofill.setAddresses` errors Chromium's DevTools
  emits on every open are filtered in the DevTools page's own console.

### Removed

- **Re-index header button.** Re-indexing is a by-product of structural
  changes, not a user-triggered action. The underlying IPC and dialog
  component are kept for internal use.
