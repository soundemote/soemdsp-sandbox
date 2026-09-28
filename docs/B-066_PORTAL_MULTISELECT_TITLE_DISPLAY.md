# B-066 — Multi-select Portal settings hides Title and locks Display

Report ID: B-066  
Status: open  
Severity: see  
Source: user 2026-09-28  
Related: Portal IO; B-052 (Portal Out rename to ChordKeys); B-065 (multi-wire portal action creates duplicate portals)

## User symptom

Selecting two or more portals to change their Title and Display makes the Title control disappear and leaves Display uneditable.

## Repro

1. Select two Portal IO or named-portal modules.
2. Open the module settings/editor for the multi-selection.
3. Observe that Title is absent and Display is not editable.
4. Compare with a single-portal selection.

## Expected behavior

Selecting multiple compatible portal modules should not hide Title or make Display uneditable merely because the selection contains more than one module. The intended batch edit should remain available.

## Investigation / fix shape

- Trace multi-selection field visibility and editability for Portal IO and named portals.
- Preserve compatible Title/Display controls and represent mixed values without silently removing the controls.
- Recheck alias propagation and jack appearance with B-052, plus portal identity/grouping behavior with B-065.
- This report is docs-only; no code fix is included.
