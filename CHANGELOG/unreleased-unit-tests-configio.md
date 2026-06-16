### Changed

- Add vitest unit suite + coverage for `electron/configIO`. Wires
  `release-core test-unit` / `release-core coverage` (previously
  "(none wired)") to a 28-case suite covering the four pure
  dotted-key helpers and the atomic TOML write / empty-prune file
  ops, at 98% line coverage on the module.
