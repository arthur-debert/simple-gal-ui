# Changelog

All notable UI-facing changes to simple-gal-ui.

## Unreleased — visual-adj

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
  sets the selected image as the new thumbnail.
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
- **Use-as-Thumbnail button hides when already the thumbnail.** In the
  image detail editor the button is replaced by a read-only "Album
  thumbnail" badge; in the album view the button just doesn't show when
  the selected image is already the thumb.
- **Document / window title** tracks the current gallery home.

### Fixed

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
