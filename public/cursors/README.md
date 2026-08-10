# soemdsp-sandbox cursors

Cursor assets for the modular WebUI live here.

## App-wide default

**Default cursor is a tiny white `+`** (`--node-dot-cursor` / `--node-default-cursor` on `:root` in `styles.css`), not the OS arrow. Any surface without an explicit `cursor:` inherits that.

Explicit styles still win: `pointer`, `text`, `grab` / `grabbing`, `ew-resize` / `ns-resize`, `help`, etc.

**Module move** uses the OS arrow (`--node-module-move-cursor: default`) for familiarity — only module drag handles / active `.dsp-node.dragging`. Floating-window drag still uses `move` (`--node-move-cursor`).

## Assets

- `slider-drag-dot.svg`: centered white dot cursor used while dragging module sliders.
- The tiny `+` is inlined as a data-URL in CSS (hotspot 6,6 on a 13×13 viewBox).

Keep cursor files small, high-contrast, and explicit about hotspot expectations in CSS.
