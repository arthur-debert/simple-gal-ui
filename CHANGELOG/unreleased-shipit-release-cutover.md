### Changed

- Adopt shipit's composed release pipeline (ADP02-WS11, #78): declare the
  `[artifacts.simple-gal-ui]` electron artifact in `.shipit.toml`
  (darwin-arm64 dmg + linux-x86_64 AppImage, signed/notarized through
  shipit's standalone mac-sign stage) and add the blessed stage-choice
  dispatch caller `.github/workflows/shipit-release.yml` ALONGSIDE the
  untouched legacy `release.yml` (legacy removal follows the rc proof).
  The windows x64 NSIS target is deliberately omitted from the declaration:
  windows builds are paused (arthur-debert/shipit#895) and resume as their
  own workstream. New package.json scripts back the release legs:
  `build:release` (self-provisioning compile) and `dist` (electron-builder
  packaging, unsigned — the standalone signer owns signing). The renderer
  build moves from `dist/` to `dist-web/` (vite outDir, electron-builder
  files, the main-process loadFile path): `dist/` is shipit's bundle
  STAGING tree — wf-build uploads it wholesale and gh-release ships its
  top-level files — so web assets must not land there.
