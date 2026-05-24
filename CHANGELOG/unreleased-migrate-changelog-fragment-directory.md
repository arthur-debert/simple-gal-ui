### Changed

- Migrate to fragment-directory changelog model. Source of truth is now
  `CHANGELOG/unreleased-*.md` fragments; `CHANGELOG.md` is generated
  via `bin/changelog render`. Pre-existing history is captured verbatim
  in `CHANGELOG/legacy.md`. See arthur-debert/release#201.
