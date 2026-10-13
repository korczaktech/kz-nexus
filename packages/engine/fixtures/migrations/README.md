# Migration fixtures

`.nsx` formatVersion 1 is the only version that exists, so there is no
version-to-version migration to exercise yet. The migration registry
(`packages/engine/src/nsx/migrations.ts`) is wired end-to-end and rejects both
unknown future versions (`VERSION_MISMATCH`) and gaps in the registry
(`MIGRATION_FAILED`); see `fixtures/invalid/future.nsx` and the tests in
`packages/engine/src/nsx/roundtrip.test.ts`.

When formatVersion 2 is introduced, add the v1 file here together with the
expected migrated document and extend `scripts/check-nsx-fixtures.mjs`.
