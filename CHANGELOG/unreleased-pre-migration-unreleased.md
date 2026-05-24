### Changed

- Retire the bespoke `e2e` job in `.github/workflows/test.yml` in favor
  of the canonical `e2e: true` input on `electron-ci.yml@v1` (landed in
  arthur-debert/release#185). The job now runs from the reusable
  workflow with the consumer-specific glue (`vite build` + setting
  `SIMPLE_GAL_PATH`) moved into the `pre-test` hook.
