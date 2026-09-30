# B-085 — Multi-select Display Settings copies unedited settings

Report ID: B-085  
Status: fixed  
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

## Investigation

The code that decides which settings to apply to all selected modules was wrong.

- `nodeGraphTraceDisplaySettingsDirtyKeysFromEvent` in `public/node-graph-module-scope-settings-apply.js` returned `["*"]` when the control was not tagged `data-trace-display-field`, `data-trace-display-toggle`, `data-trace-display-color`, or `data-trace-display-choice`.
- Show in canvas (`#nodeLayoutCanvasShowInCanvas`) has none of those attributes, so toggling it marked the whole form dirty.
- `applyNodeGraphTraceDisplaySettingsForm` skipped `nodeGraphMergeDisplaySettingsDirty` when the dirty set contained `*` and wrote the primary module's full form onto every selected target.

## Fix

Multi-select apply no longer treats `*` as "copy the primary form". After the form is seeded, `nodeGraphCaptureTraceDisplaySettingsBaseline` snapshots that read. A later edit merges only keys that differ from the snapshot onto each selected module. Paste and Defaults still force-apply the whole form.

Show in canvas is not a display-settings field. Its change handler stops before the form commit and sets the pin on every module in the open Display Settings selection, not only the primary.

Untagged controls no longer return `["*"]`. Named controls (trace fields, keypad, text box, and the other display-settings attributes) record that one key. Cache-bust `b085-multiselect-1` on the apply, form-io, and layout-canvas scripts.

Not committed. Left in the working tree until Website & UI finishes.
