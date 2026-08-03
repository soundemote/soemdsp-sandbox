# Patch format migrations

**Phase C** of the architecture plan. Implementation: `public/node-graph-patch-migrations.js`.

## Policy (current)

**Backwards compatibility is not a goal right now.** Old patches may break when
module types, ports, or faces change. Prefer a clean current graph.

Migrators that already exist (format 0→1→2) still run on load if present; do
**not** add new ones unless we explicitly decide we care again. For module
renames, just rename definitions/store/evaluators — no format bump required
while this policy holds.

## Pipeline (if migrations.js is loaded)

```text
load JSON → migrateNodeGraphPatchToCurrent(patch) → validate → compile plan
```

## Existing ladder (historical)

| From | To | What happens |
|------|-----|----------------|
| missing / 0 | 1 | Stamp `format`; phosphorLight → scope2d |
| 1 | 2 | `valueSlider` → `knob`; face keys |
| 2 | 2 | Idempotent re-stamp |

## If we reinstate BC later

1. Bump `nodeGraphPatchFormat.version`.
2. Append a pure migrator for **module** type/port/face renames.
3. Gate on opening real saved patches.

## Non-goals

- Silent formula changes inside migrators
- Preserving every historical module id forever  
