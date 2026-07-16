# Changelog

All notable changes to this project will be documented in this file.

## 1.0.0 — 2026-07-15

### Changed

- **Migrated to the DHIS2 App Platform** (React 18, TypeScript, `@dhis2/ui`, `@dhis2/app-runtime`, TanStack Query). Replaces the vanilla-JS/webpack build. The dataStore format, generated metadata (names, descriptions, expressions), and metadata groups are unchanged and fully compatible with configurations created by earlier versions.
- Requires DHIS2 2.41 or later; tested on 2.41 and 2.43 (including the 2.42+ global shell).
- Build with `pnpm run build`; the installable zip is written to `build/bundle/`.

### Fixed

- **"Also delete the generated DHIS2 metadata" now works.** Previously the ownership safety check ran after the app had already removed the objects from its own groups, so deletion was always skipped.
- **Removed a destructive "dry-run" safety check.** DHIS2 ignores `dryRun=true` for DELETE metadata imports and deletes the objects for real (verified on 2.41.9). External references are now caught by the real, per-type atomic delete instead.
- **Outlier metadata can be deleted after editing the threshold.** App edits are recorded in the dataStore and no longer trip the "modified after creation" safety check.
- Form selects now surface loading errors instead of showing an empty list.
- Switching tabs no longer discards the form or an un-imported preview.
- The pre-import conflict check now also works for metadata names containing commas.
- Names containing `<`, `&` etc. are no longer HTML-escaped in dialogs and notifications.
- Deleting metadata after an in-app threshold edit now works in every timezone: the edit timestamp is taken from the DHIS2 server rather than the browser clock (DHIS2 returns zone-less dates, so client timestamps skewed the safety check by the timezone offset).

### Documentation

- User manual rewritten against the new UI with regenerated screenshots (DHIS2 2.43).

### Added

- i18n support (all UI strings translatable via the standard platform workflow).
- End-to-end test suite at `tests/e2e/lifecycle.sh` (parameterized by instance URL; frame-aware for 2.42+).
- Unit tests for the domain logic (`pnpm test`, Jest): template substitution and truncation quirks, conflict detection (incl. comma names), import step sequencing and group splitting, all deletion safety gates (incl. the app-edit timezone case), and threshold editing.
