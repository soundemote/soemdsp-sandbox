# Code box + Text category

## Text shelf
Palette department `text` (emoji memo) holds text/code surfaces: Text Box, Animated Text Box, Text Stream, Codeblock, **Code**.

## Code (`codeBox`) vs Codeblock
- **Code** — control-plane editor. White square **Code** in/out (data bus). Apply publishes text. Never in the audio path.
- **Codeblock** — existing JS DSP experiment; still listed under Text for now.

## Code in behavior
- Local text always saved on the module (`codeBox.localText`).
- While Code in is wired: face not typable; display shows incoming payload; Apply disabled.
- Disconnect restores saved local text.

## Graphs
Smooth/Step Graph have a white square **Code** inlet. Valid curve text (`id x y bend` lines) applies to `graph.nodes` while connected.

## Bottom strip
X / Y / Tension|Skew face strip still deferred.
