# DQ Metrics Configuration Tool - Agent Instructions

## Context

DHIS2 App Platform app (React 18, TypeScript, `@dhis2/ui`, `@dhis2/app-runtime`)
that helps system administrators configure metadata for data quality
monitoring: for a chosen data element it generates and imports predictors,
data elements and indicators for three checks — **outliers**, **consistency**
and **completeness** — and records what it created in the `dqConfig`
dataStore namespace.

Migrated in 2026 from a vanilla-JS webpack tool. The dataStore format and
the generated metadata (names, descriptions, expressions) are **backwards
compatible** with the old tool — do not change `src/lib/templates.ts`
content or the `§PLACEHOLDER§` dataStore keys without a migration plan.

## Architecture

```
src/
  App.tsx                 Providers (react-query, CssReset/CssVariables), hash router
  AppRoutes.tsx           TabBar navigation (Add new / Configuration / Instructions)
  components/             Shared UI (InitialiseGate, PreviewSection, modals, ...)
  pages/                  One component per tab
  hooks/                  useApi (engine wrapper), queries.ts (react-query), alerts
  lib/                    Framework-free domain logic:
    api.ts                Engine wrapper: get/post/put + error helpers
    templates.ts          Metadata templates (KEEP VERBATIM — see above)
    configure.ts          Placeholder substitution, conflict checking (Preview)
    importer.ts           Metadata import + group membership + dataStore save
    deletion.ts           Config removal + 4 safety gates for metadata deletion
    threshold.ts          Outlier-threshold (SD) editing
    overview.ts           Configuration tab data assembly
    initialise.ts         First-run setup of groups + dataStore
    labels.ts             Placeholder → label maps
```

- **Reads** go through TanStack Query hooks in `src/hooks/queries.ts`.
- **Writes** (multi-step flows) are imperative functions in `src/lib/*`
  taking the `D2Api` wrapper; they are called from pages, which invalidate
  the relevant queries afterwards.
- All DHIS2 API calls go through `src/hooks/useApi.ts` → `src/lib/api.ts`
  (never raw `fetch`).

## Rules

- React 18 only; no Suspense-for-data, handle loading states explicitly.
- `@dhis2/ui` components only; CSS Modules with DHIS2 design tokens
  (`var(--spacers-dp16)` etc.) for layout.
- `i18n.t()` from `@dhis2/d2-i18n` for user-facing strings.
- 4-space indent, no semicolons (prettier config from `@dhis2/config-prettier`).
- Verify with `pnpm exec tsc --noEmit`, `pnpm exec eslint src`,
  `pnpm run build` before finishing.

## Build & Dev

- `pnpm install` — install dependencies
- `pnpm start --proxy <dhis2-url>` — dev server on port 3000 with auth proxy
- `pnpm run build` — production build; installable zip in `build/bundle/`
- `pnpm run lint` — eslint + prettier check

## DHIS2 compatibility

- `minDHIS2Version: 2.41` (d2.config.js); tested on 2.41–2.43.
- The app manages these named objects (find-or-create at initialisation):
  user group "DQ - DQ Config Admin", data element group
  "DQ - Data quality data elements", indicator group
  "DQ - Data quality indicators", and four "DQ - Data quality predictors"
  groups. Renaming them breaks ownership checks for existing installs.
