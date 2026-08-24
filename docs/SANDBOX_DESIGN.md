# Sandbox Design Docs

**Standing product rules (compat, native-only DSP, GPU faces, WISIWIH, etc.):**  
see **[APP_POLICY.md](./APP_POLICY.md)**. This file focuses on UI aesthetics and interaction.

## 1. Mouse-Adjacent Hover Tooltips Are Forbidden

Native browser hover tooltips and custom tooltip bubbles that appear near the mouse are not allowed in the sandbox. They create visual clutter, fight the modular interface, and make precise UI work feel unstable.

Allowed:
- Fixed interaction text in the sandbox help/status area.
- Accessible labels and ARIA text for assistive technology.
- Stored tooltip/help strings that feed fixed UI surfaces.

Forbidden:
- `title` attributes or native browser hover titles.
- Custom tooltip elements that follow `clientX`, `clientY`, `mousemove`, or `pointermove`.
- Any future mouse-adjacent hover bubble, even if visually styled to match the sandbox.

Implementation rule:
- Tooltip copy may exist, but it must not be surfaced as a browser-native or mouse-following tooltip.

## 2. Reduce Visual Distraction And Layout Jitter

The sandbox should favor calm, stable surfaces and lead toward a minimal aesthetic. Brightness, glow, motion, and emphasis should be earned by user focus, hover, selection, active state, or meaningful signal state. Idle controls should stay visually quiet wherever possible.

Required:
- Dim always-visible utility controls when they are not active or hovered.
- Resize grips (floating windows, condensed frame, shared SE corners) are idle-hidden and appear on hover or while dragging (APP_POLICY §14).
- Reserve brighter button states for hover, selection, active, armed, saved, warning, or error states.
- Keep UI layout stable as text, values, labels, and button states change.

Forbidden:
- UI jitter: text or state changes that resize controls, shift neighboring controls, or reorganize visible layout.
- Loading jitter: the interface should not slowly pop in, resize, and reorganize during normal startup or refresh. The full interface should appear all at once once the loading veil clears.
- Popups that appear unexpectedly or follow the mouse.
- Hover effects that introduce distracting brightness or movement unless they clarify the target being interacted with.
- Variable-width button/status text that causes nearby controls to jump.

Implementation rule:
- When a label/value can change, give the container stable dimensions first, then update the content inside it.
- A loading veil may hide normal startup assembly. Do not treat this rule as applying to broken-code states where scripts or assets fail and the interface simply cannot load correctly.
