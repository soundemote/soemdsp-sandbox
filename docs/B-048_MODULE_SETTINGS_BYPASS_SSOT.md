# B-048 — Module settings enable/disable control does not mirror module button

Report ID: B-048  
Status: fixed (code; needs Live UI verify)  
Severity: see  
Source: user  
Related: `syncNodeGraphBypassButtonElement` (patch-core); UIDEV bypass colors; B-074 (SSOT spirit)

## User symptom

Module Settings enable/disable (power/bypass) control does not mirror the module-face power button:

- Does not go red when the module is disabled/bypassed
- Does not keep a black background when enabled
- Glyph can appear to "simply disappear"

## Root cause

Bypass chrome CSS custom properties (`--node-bypass-off-bg`, `--node-bypass-on-bg`, icon size/glow colors) were defined and applied **only** on `#nodeGraphWorkspace` / `.node-graph-workspace`.

Module Settings lives in `#nodeSceneContextMenu`, a **sibling** under `#nodeWiringPanel`, not a descendant of the workspace. Outside the workspace:

1. `--node-bypass-off-bg` was undefined → `background: var(--node-bypass-off-bg)` invalid → fell through to generic `button { background: var(--panel-2) }` (no black plate)
2. `--node-bypass-on-bg` undefined → pressed/disabled state never painted red
3. `--node-bypass-icon-size-ratio` undefined → `::before` glyph `font-size: calc(… * 100cqh)` invalid → icon vanished (`color: transparent` on the button text left an empty cell)

State wiring already shared `syncNodeGraphBypassButtonElement` + `.node-bypass-button`; only the **paint tokens** had drifted off the shared ancestor.

## Fix (same spirit as B-074 jack SSOT)

1. **`public/styles.css`** — Move `--node-bypass-*` defaults onto `.node-wiring-panel` (covers face + settings). Defaults match UIDEV: off `#000000`, on `#5c1818`. Add `var(..., fallback)` on `.node-bypass-button` and explicit black/red backgrounds on `.scene-context-module-bypass-button`.
2. **`public/node-graph-ui-settings-sync.js`** — Write runtime UIDEV bypass colors to `#nodeWiringPanel` (not workspace-only).
3. Cache bump `b048-bypass-ssot-1`.

UI chrome only. No audio-path / worklet / WASM changes. JS in settings/header remains UI-only.

## Verify (Live UI)

Hard-reload Live UI after cache bump `b048-bypass-ssot-1`.

1. Place a normal module (e.g. Gain). Confirm face power button: **black** when enabled, **red** + glow when disabled.
2. Open Module Settings → Visibility. Confirm the disable control matches the face: black when enabled, red+glow when disabled; glyph always visible (never empty cell).
3. Toggle from face → settings updates; toggle from settings → face updates (shared `aria-pressed` / bypassed state).
4. Change UIDEV "bypass off background" / "bypass on background" — both face and settings pick up the new colors.
5. InletOutlet modules still omit disable chrome (unchanged gate).
6. No audio / bypass DSP behavior change expected (B-003 is separate).

## Smoke

`node scripts/smoke_display_follows_title.mjs` asserts wiring-panel SSOT defaults + sync host.

## Regression (2026-10-01)

Disable control moved into `#nodeModuleActionsWindow`. Floating-window content-button fill (`rgb(16,22,26)`, high `:is()` specificity) overrode B-048 black/red paint, so pressed never went red.

Fix: exclude `.node-bypass-button` from floating-window button fills; retarget Module Settings / Command Center bypass selectors at `#nodeModuleActionsWindow` with the same UIDEV off/on/::before glow as the face.
