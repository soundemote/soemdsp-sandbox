# Patch format migrations

**Phase C** of `HIGH_RISK_HIGH_REWARD_PLAN.md`.

## Pipeline

```text
load JSON → migrateNodeGraphPatchToCurrent(patch) → validateNodeGraphPatch → compile plan
```

- Implementation: `public/node-graph-patch-migrations.js`
- Loaded before `node-graph-patch-core.js` in `index.html`
- Current format: `{ kind: "soemdsp-sandbox-node-patch", version: 1 }`

## Version ladder

| From | To | What happens |
|------|-----|----------------|
| missing / 0 | 1 | Stamp `format`; phosphorLight → scope2d |
| 1 | 1 | Idempotent re-stamp; re-apply safe renames |

## Adding a migration (e.g. valueSlider → knob)

1. Bump `nodeGraphPatchFormat.version` to N+1 in `node-graph-module-definitions.js`.
2. Append migrator at index N in `nodeGraphPatchMigrators` (maps version N → N+1).
3. Migrator must be pure: `(patch) => nextPatch`, copy nodes/arrays it mutates.
4. Gate: open a 0.4.3-era patch and a current patch; both load without data loss.

## Non-goals

- Silent formula changes inside migrators
- Dropping unknown modules without the retired-type set (use `nodeGraphRetiredNodeTypes`)
