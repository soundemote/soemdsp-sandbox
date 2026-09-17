# Code box + Text category

## Text shelf
Palette department `text` (emoji memo) holds text/code surfaces: Text Box, Animated Text Box, Text Stream, and **Code**.

## Code (`codeBox`)
Control-plane **document** box for Graph curve JSON. White square **Code** in/out (data bus). Never in the audio path. Not a programming language.

## Cable payload (SSOT)
Isomorphic to `normalizeNodeGraphGraph` output (optional ignored `v` tag allowed on parse):

```json
{
  "cursorX": 0.5,
  "nodes": [
    { "x": 0, "y": 1, "c": 0, "shape": "linear" },
    { "x": 1, "y": 0, "c": 0, "shape": "linear" }
  ]
}
```

- `nodes`: 2..32 points, sorted by `x` on normalize
- `c`: contour (tension on Smooth / skew on Step)
- `shape`: segment style (`linear`, `rational`, `smoothstep`, `log`, …)

Apply = `JSON.parse` → `normalizeNodeGraphGraph` → save canonical JSON + publish Code out. Invalid JSON does not publish a driveable document.

## Code in behavior
- Local text saved on the module (`codeBox.localText`).
- While Code in is wired: face not typable; display shows incoming payload; Apply disabled.
- Disconnect restores saved local text.

## Graphs
Smooth/Step Graph Code in assigns `patchNode.graph` from a valid document. Code out serializes the live `graph` the same way. Graph face remains the primary authoring UI.

## Bottom strip
Smooth: X / Y / Tension (global Tension param). Step: X / Y / Skew (per-point contour `c`). Synced to face selection. Code stays one-way when wired.

## Display zoom
Display Settings Zoom Min / Zoom Max rescale face Y only. Out Min/Max params removed; DSP outs stay 0..1.

## Port types
Code jacks use strict type `code` — see [PORT_TYPES.md](PORT_TYPES.md).
