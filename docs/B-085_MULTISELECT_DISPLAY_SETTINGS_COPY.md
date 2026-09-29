# B-085 — Multi-select Display Settings copies unedited settings

Report ID: B-085  
Status: open  
Severity: see  
Source: user 2026-09-29  
Related: B-066 (multi-select Portal Title/Display hidden or locked; different symptom)

## User symptom

Selecting multiple displays and changing one setting (example: "Show in canvas") also transfers the other settings. Modules that were not edited pick up the unchanged settings from the edited module, so multi-select loses per-module settings.

## Repro

1. Select two or more display modules that do not already share the same display settings.
2. Open Display Settings for the multi-selection.
3. Change only one control, for example Show in canvas.
4. Compare the other selected modules with their settings before the edit.

The modules that were not the edited source now carry settings the user never changed (colors, size, and the rest of the form), not only the control that was toggled.

## Expected behavior

Changing one setting while several displays are selected should change only that setting on every selected module. Every other setting stays as it was on that module.

## Investigation / fix shape

The code that decides which settings to apply to all selected modules is wrong.

- `nodeGraphTraceDisplaySettingsDirtyKeysFromEvent` in `public/node-graph-module-scope-settings-apply.js` returns `["*"]` when the control is not tagged `data-trace-display-field`, `data-trace-display-toggle`, `data-trace-display-color`, or `data-trace-display-choice`.
- Show in canvas (`#nodeLayoutCanvasShowInCanvas` in `public/node-graph-module-scope-settings-window.js`) has none of those attributes, so toggling it marks the whole form dirty.
- `applyNodeGraphTraceDisplaySettingsForm` skips `nodeGraphMergeDisplaySettingsDirty` when the dirty set contains `*` and writes the primary module's full form onto every selected target.

Record and apply only the setting the user edited. Do not treat one untagged control as a full-form copy. Paste and Defaults may still force-apply the whole form; a single control edit must not.

This report is docs-only; no code fix is included.
