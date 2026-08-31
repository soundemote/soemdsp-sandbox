# Module layout — overview and rebuild plan

Status: implemented (apply path + CSS forest removed). §7 band-stack
checks live in `scripts/test_module_layout_bands.js` (Output, Gain,
Sample Player/Looper, Music Player, Kick Envelope, Active Filter,
Smooth Graph / LayoutB, Vectorscope / LayoutC). Hide-display omits the
face track. Human eyeball on the workspace still welcome.
Do not land another CSS selector patch for B-036.
Reopens **B-036** (hide display → sliders overlap the I/O / “out” section).
The previous “fix” treated a **grid occupancy** bug as a height-math bug and
papered it with per-layout `grid-row` exceptions. The exception list cannot
stay complete.

---

## 1. What a module is (user-visible)

Every module on the workspace is a **vertical stack of named bands** inside a
fixed outer box (`--node-grid-width-units` × `--node-grid-height-units`).

| Band | Role | Typical element |
| --- | --- | --- |
| header | Title + chrome buttons | `.dsp-node-header` |
| face | Display / scope / custom plate | `.node-module-scope-window` or a custom `*-face` / `*-display` |
| controls | Rare extra chrome (sample load path) | `.node-sample-module-body` |
| io | In jacks (left) + out jacks (right) | `.dsp-node-io-section` |
| params | Slider / choice rows | `.dsp-node-body` |
| lip | Bottom clearance so sliders do not kiss the plate edge | implicit last track |

Chrome only changes **where I/O lives relative to the face**:

| Chrome | Ports | Face | Params |
| --- | --- | --- | --- |
| **LayoutA** | Under the face | Own row | Under I/O |
| **LayoutB** | Beside the face (one **shell** band) | Shared with jacks | Under the shell |
| **LayoutC** | Under the title | None | None |

Visibility flags (per-module and global) turn bands **off**. Off means the band
must not occupy a grid track. Collapsing a track to `0px` while another child
is still auto-placed into it is how sliders land on the out column.

---

## 2. How it is built today (two sources of truth)

### 2.1 Height math (JS)

`public/node-graph-module-sizing.js`

- `nodeGraphModuleHeightWidgetUnits(type, ui)` returns an ordered list of
  `{ id, heightGu, visible }`.
- That list is **not one table**. It is a long `if (layout === …)` / type
  special-case chain (sample trio, LED, textBox, image, canvas, visualScope,
  traceDisplay, wallRoom, pulseCurve, then a default).
- Outer height is the sum of **visible** widgets (+ bottom clearance).
- Face hide sets `displayHeightUnits → 0` and `visible: false` on the face
  widget. CSS vars written in `nodeGraphApplyModuleShellHeightCssVars`:
  `--node-module-display-height-units`, `--node-module-shell-height-units`,
  `--node-module-io-height-units`, plus class `face-row-collapsed`.

### 2.2 Grid paint (CSS)

`public/styles.css` (`.dsp-node` and hundreds of follow-on rules)

Default LayoutA template is **always five tracks**, face included:

```
header | scope-height | io-min | params(auto) | bottom-gap
```

Then a forest of overrides:

- `--node-module-scope-height: 0` when `.oscilloscope-hidden` or workspace
  Displays-off.
- `display: none` on a **hand-maintained list** of face class names
  (scope window, pitch detector, filter curve, round shape, wall room,
  phosphor waveform, solid custom UI). Envelope / pulse faces are **not**
  on that hide list even though they are assigned `grid-row: 2` when shown.
- Explicit `grid-row` on children, only for
  `.chrome-layout-a` and only when **not**
  `.sample-module-layout` / `.solid-module-layout` / `.phosphor-waveform-layout`.
- Sample modules keep a **six-row** template (header, scope, interface,
  I/O, params, gap) with **hard** `grid-row: 4` (I/O) and `grid-row: 5`
  (sliders) even when the face is hidden.
- Music Player (`phosphor-waveform-layout.sample-module-layout`) shifts
  those numbers again (waveform → row 4, I/O → 5, sliders → 6).
- LayoutB / C / filter-curve / title-only / buttons-hidden each bring
  another `grid-template-rows`.

JS says “these bands exist.” CSS says “these tracks exist, and these
selectors remap children when a class combination matches.” Those two
lists drift.

### 2.3 DOM mount (JS)

`public/node-graph-module-rendering.js` `createNodeGraphModuleElement`

- Chrome class (`chrome-layout-a|b|c`) plus many layout classes
  (`sample-module-layout`, `output-node`, `filter-curve-layout`, …).
- Face is **not mounted** when `nodeGraphModuleShouldMountDisplayFace` is
  false (hide display). The face **track** often still exists in CSS.
- Child order is not a stable band order: sample body can be inserted
  before I/O; waveform can be inserted after sample body; SVG frame is
  absolute (harmless); extra badges (mic state) are extra in-flow
  children.

Chrome intent lives in `public/node-graph-module-chrome.js` (A / B / C).
That file is the only part of this system that is actually small.

---

## 3. The overlap bug (root, not a missed selector)

**Symptom:** Hide display (per-module gear Alt+click, or Visibility →
Displays off). Slider rows paint on top of the I/O / out-jack strip.

**Mechanism:** CSS Grid auto-placement fills **empty reserved tracks**.

1. Template still has a face track (`var(--node-module-scope-height)` or a
   leftover `grid-row: 2` hole).
2. Face node is `display: none` **or was never mounted**.
3. `.dsp-node-io-section` is the next in-flow child → it sits in the face
   track.
4. `.dsp-node-body` (sliders) sits in the I/O track.
5. I/O min-height and slider rows occupy the **same vertical band**.
   Looks like sliders overlapping the out section.

The comment already in `styles.css` (LayoutA explicit rows) names this
exactly: *“I/O lands in the face track, params in the I/O track, and the
real params track stays empty.”*

The attempted fix was: enumerate every face class, every hide class, and
every layout exclusion, and re-number `grid-row`. That is not a contract.
It fails as soon as:

| Hole | Why it still overlaps |
| --- | --- |
| New face class (envelope, pulse, stereo sample, …) | Not in the `display: none` list and/or not in the `grid-row: 2` list |
| Sample / Music Player layouts | Explicitly **excluded** from the rematch; they keep hard row numbers |
| Face not mounted (`ShouldMountDisplayFace`) | Track remains; no element to hide |
| `face-row-collapsed` vs `.oscilloscope-hidden` vs workspace Displays-off | Three flags, three selector sets, easy to apply only two |
| Extra in-flow children | Auto-placement counts them as tracks |
| Height var lag | `--node-module-display-height-units` still > 0 for a frame while the face is gone |

B-036 in `docs/BUG_PLAN.md` is marked **fixed** in the table and **open**
in the write-up. Treat it as **open**. Do not add another `:not(...)`.

---

## 4. Target contract (single source of truth)

One function owns the stack. CSS only **renders** that stack.

```
bands = moduleLayoutBands(type, ui)  // ordered, visibility already applied
applyModuleLayout(article, bands)    // writes tracks + places children
```

Rules:

1. **Hidden band ⇒ no track.** Do not leave a 0px row for the face.
2. **Every major child has one band id** (`data-module-band="io"` etc.).
   Placement is `grid-area` / `grid-row` from that id, never from a
   20-class selector.
3. **One face class** on every display plate: `node-module-face`.
   Specific faces keep their paint class (`node-filter-curve-display`)
   **in addition**, not instead.
4. **LayoutA / B / C are three stack recipes**, not three CSS novels.
   - A: `header? + face? + controls? + io? + params? + lip`
   - B: `header? + shell(face+io)? + params? + lip`
   - C: `header? + io + lip`
5. **JS widget list and CSS tracks are the same array.**
   `heightGu` of a visible band becomes that track’s size.
   Outer `--node-grid-height-units` is still `sum(visible) + clearance`.
6. **DOM child order may stay messy**; placement must not depend on it.
7. **No per-type `grid-template-rows` in CSS** after the cutover except
   internal widgets (slider row, jack row). Module **article** grid comes
   from one class: `.dsp-node.module-stack`.

Suggested apply (sketch, not this PR):

```js
function applyNodeGraphModuleLayout(article, bands) {
  const visible = bands.filter((b) => b.visible && b.heightGu > 0);
  article.style.gridTemplateRows = visible
    .map((b) => bandTrackCss(b))
    .join(" ");
  for (const child of article.children) {
    const id = child.dataset.moduleBand;
    const index = visible.findIndex((b) => b.id === id);
    child.style.gridRow = index >= 0 ? String(index + 1) : "auto";
    child.hidden = Boolean(id) && index < 0;
  }
}
```

`bandTrackCss`: header / face / io / params already have the existing
CSS variables (`--node-header-height`, `--node-io-section-min-height`,
`--node-body-row-height`). The apply step only decides **which** of those
tracks exist.

---

## 5. What to delete (after the apply path works)

Not in the first compile — delete once one LayoutA processor, Output,
Sample Player, Music Player, one LayoutB, and one LayoutC pass the
checklist in §7.

- Explicit `grid-row` blocks under `.chrome-layout-a` / sample /
  phosphor-waveform (the 13515–13678 region).
- Separate “hidden display” `grid-template-rows` clones that only drop
  the face track.
- Face-class catalogs used only to hide or assign rows. Hide via
  `data-module-band="face"` + apply.
- Duplicate widget stacks in `nodeGraphModuleHeightWidgetUnits` that
  exist only to match a CSS special case (Music Player cushion comments
  that exist because CSS used `1fr` on the waveform).
- `face-row-collapsed` as a third hide channel if apply already omits
  the face track.

Keep chrome.js. Keep gu math (1…60 face, outer height, I/O row count).
Keep visibility flags (`oscilloscopeHidden`, `ioHidden`, `slidersHidden`,
global workspace toggles) — they become **inputs** to `moduleLayoutBands`,
not extra CSS dimensions.

---

## 6. Work sequence

Do not mix this with feature work. Each step should leave the workspace
visually unchanged except the B-036 collision.

### P0 — Inventory (no behavior change)

- List every article-level `grid-template-rows` and `grid-row` in
  `styles.css` that targets `.dsp-node`.
- List every branch in `nodeGraphModuleHeightWidgetUnits`.
- Map `definition.layout` → face element class → whether it is in the
  hide catalog.
- Note Output (`output-node`, LayoutA, Volume slider + stereo I/O +
  trace face). This is the user’s “out section” repro.

### P1 — Band apply for LayoutA only

- Tag children with `data-module-band` at mount
  (`createNodeGraphModuleElement` / IO append / face factories).
- Implement `moduleLayoutBands` as a **thin wrapper** over the existing
  widget list (same numbers).
- Implement `applyNodeGraphModuleLayout`; call it from create + from
  every visibility/height write that already calls
  `nodeGraphApplyModuleShellHeightCssVars`.
- For LayoutA, **stop using** the default five-track CSS template
  (override with the inline tracks from apply). Leave LayoutB/C on old
  CSS until P2.

### P2 — Hide display = omit face band

- When `oscilloscopeHidden` or Displays-off (and not force-show): face
  band absent. I/O is the next track. Sliders under I/O.
- Do not set `--node-module-scope-height: 0` as the hide mechanism.
- Repro: Output, a 1-in/1-out filter with sliders, Sample Player,
  envelope with curve face. Hide display. Jacks and sliders must not
  share pixels.

### P3 — Sample / Music Player / LayoutB / C

- Sample stack is just extra `controls` band, not a second grid language.
- Music Player waveform is the `face` band (not a row stuffed into an
  unused scope track).
- LayoutB: one `shell` band (face + side I/O). Params under it.
- LayoutC: header + io only.

### P4 — Delete the forest

- Remove the exception CSS and the dead widget branches.
- One module-article grid contract in a short comment at `.dsp-node`.
- Mark B-036 fixed only after §7.

---

## 7. Acceptance (B-036 and consistency)

For **Output**, **Gain** (or any LayoutA processor with sliders), **Sample
Player**, **Sample Looper**, **Music Player**, **one envelope/filter with
a curve face**, **one LayoutB**, **one LayoutC**:

1. Display on: face, I/O, sliders stacked; no overlap; outer height
   matches Module Settings Height.
2. Display off (local and global): face gone; I/O immediately under
   header (or under sample controls); sliders under I/O; no overlap;
   outer height shrinks by the face gu.
3. Display off + sliders off: only header + I/O (+ lip).
4. Display off + I/O off: sliders under header.
5. Resize face height (when shown): only the face track changes; I/O
   and sliders stay in their bands.
6. Zoom / pan: no band jump (layout is gu + CSS vars, not
   getBoundingClientRect).

Exactness: 1gu = `patch.grid.heightPx` (28 by default). Face 1…60.
I/O strip height = `nodeGraphModuleIoSectionHeightGu` (from port rows),
not a leftover face track.

---

## 8. Files (likely)

| File | Role in the rebuild |
| --- | --- |
| `public/node-graph-module-sizing.js` | Widget/band list SSOT; apply helper |
| `public/node-graph-module-chrome.js` | Keep A/B/C recipes; consume in band list |
| `public/node-graph-module-rendering.js` | Tag bands at mount; call apply |
| `public/node-graph-patch-core.js` | Apply after visibility class toggles |
| `public/node-graph-view-controls.js` | Global Displays-off → apply, not extra CSS |
| `public/styles.css` | Delete article-level row remaps after P1–P3 |

Do **not** start by editing the 13515–13678 block again.

---

## 9. Non-goals

- New module types, stereo traces, shop chrome.
- Changing jack hit math or wire caps (except they keep working when
  I/O moves).
- Unifying every custom face painter. Only the **slot** the painter
  sits in.
- Raising WASM / memory.

---

## 10. Decision

The layout system already has the right **ideas** (chrome A/B/C, gu
face vs outer, visibility flags). It failed by implementing them twice
(JS widgets vs CSS tracks) and then patching the desync with selectors.

Rebuild: **one band list, one apply, omit hidden tracks.** That is the
root fix for sliders overlapping the out section when the display is
hidden, and the way modules start drawing the same way every time.

---

## 11. I/O contract — M / L / R (app-wide)

**Wrong (old):** L / M / R stack (Left first).  
**Right:** **M, then L, then R** — always. Colors stay name-locked.

| Slot | Channel | Jack names | Color (inlet **and** outlet) |
| --- | --- | --- | --- |
| **1st** | **Mono** (explicit) | `Mono`, `M` | **Green** |
| — | **Generic analog** | **`In` / `Out`** (`Input` / `Output`), unlabeled CV | **Gold** (uncolored) |
| **2nd** | **Left** | `Left`, `L` | **Red** |
| **3rd** | **Right** | `Right`, `R` | **Blue** |
| (any) | **Parameter / block-rate ZOH (CMYK C)** | Listed in `blockRateInputs` / `blockRateOutputs` | **Cyan** (not turquoise) |
| (any) | **Graph chunk (CMYK Y)** | `dataInputs` / `dataOutputs` port **`Graph`** | **Yellow** |
| — | **CMYK M / K** | — | **Reserved unused** |

Shared filter template: use port name **`Mono`** or label `In`→`Mono` for green; bare `In`/`Out` stay **gold** analog.

**Cyan** = non-realtime Parameter in/out — zero-order-hold / once-per-quantum control jacks (additive Morph CV, etc.). Parameter smoothers may still emit sample packs; cyan ports do not.

**Yellow** = Graph chunk data-plane jacks (additive harmonic Graph, etc.). Product name **Yellow Graph**; jack chrome is yellow. Not curve `graphInputs` (those stay mod-purple).

Chaos XYZ uses RGB **by name**, not by stack index:

| Name | Color |
| --- | --- |
| X | Red (same as Left) |
| Y | Blue |
| Z | Green |
| Out | Gold (generic analog) |

RGB module letters (`R`/`G`/`B`) are red / green / blue. **`R` is never Right.**

Rules:

- **Order is M → L → R** in every `inputs` / `outputs` array that has those
  channels. Extra jacks (Trigger, 0.1V/Oct, …) come after the trio.
- Oscillator-style stacks put absolute **ƒ** (`f`) **last** among signal inlets
  (after Morph / Phase / Amplitude CV). Softwave / DSF already follow this;
  PolyBLEP / Ellipsoid Morph sit above ƒ.
- **Data-plane inlets** (`dataInputs`, e.g. Additive **Graph**) stack **above**
  signal `inputs` in the IO strip (`nodeGraphPatchNodeInputPorts`).
- Stereo-only (`Left` + `Right`, no Mono) stays Left then Right.
- Channel chrome on **inlets and outlets** alike. Uncolored analog stays gold.
  Cables follow jack colors when UIDEV **wires follow port colors** is on
  (default); the gradient still matches both ends. Digital stays white.
- SSOT for the speaker sink order: `nodeGraphOutputInputPorts`
  (`["Mono", "Left", "Right"]`).
- Shared filter template: `inputs: ["In", "Left", "Right"]`,
  `outputs: ["Out", "Left", "Right"]` (`In`/`Out` labeled Mono).
