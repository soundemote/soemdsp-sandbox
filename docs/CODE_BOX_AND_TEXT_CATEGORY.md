# Code box + Text category

## Text shelf
Palette department `text` (emoji memo) holds text/code surfaces: Text Box, Animated Text Box, Text Stream, and **Code**.

## Code (`codeBox`)
Control-plane editor. White square **Code** in/out (data bus). Apply publishes text. Never in the audio path.

The old JS DSP **Codeblock** module was removed (retired on patch load).

## Code in behavior
- Local text always saved on the module (`codeBox.localText`).
- While Code in is wired: face not typable; display shows incoming payload; Apply disabled.
- Disconnect restores saved local text.

## Graphs
Smooth/Step Graph have a white square **Code** inlet. Valid curve text (`id x y bend` lines) applies to `graph.nodes` while connected.

## Bottom strip
X / Y / Tension|Skew face strip still deferred.

## Port lists
- `inputs` / `outputs` — the jacks.
- `dataInputs` / `dataOutputs` — also jacks. Put a name in **one** list only.
- `codeInputs` / `codeOutputs` — tags for Code styling only (not jack lists).
Overlapping names in signal + data lists throw at port build time (definition bug, not silently fixed).

## Port types
Code jacks use strict type `code` — see [PORT_TYPES.md](PORT_TYPES.md).
