# B-074 — Input / Output / Portal jack spacing drifted from shared SSOT

Report ID: B-074  
Status: fixed (code; needs Live UI verify)  
Severity: see  
Source: user 2026-09-28  
Related: MODULE_LAYOUT_PLAN (InletOutletLayout); B-057 (hide-unused IO height); LayoutB “pack jacks flush” rule

## User symptom

Catalog modules such as **Output Left Right**, **Output Mono Left Right**, **Input Mono**, **Portal IO**, and the other Input/Output/Portal lane + named/meta variants show inlet/outlet rows that do **not** match the vertical spacing of normal LayoutA modules. Jacks look stretched / unevenly gapped.

## Inventory (touched family)

| Catalog label pattern | Type(s) | Chrome |
| --- | --- | --- |
| Input Mono / Left / Right / Left Right / Mono Left Right | `portalInlet*` | InletOutletLayout |
| Output Mono / Left / Right / Left Right / Mono Left Right | `portalOutlet*` | InletOutletLayout |
| Portal IO / Portal → / Portal ← | `portalIo`, `namedPortalIn`, `namedPortalOut` | InletOutletLayout |
| Metamodule In/Out, Voice Inc/Gate/Trigger/Idle | `metamoduleIn/Out`, `voice*` | InletOutletLayout |

Speaker **Output** (`output`) and mic **Input** (`audioInput`) already use LayoutA + shared `.dsp-node-io-section` — no private jack dialect; spacing was already on SSOT.

## Root cause

InletOutletLayout had a **private** jack-column dialect:

1. CSS forced `grid-auto-rows: minmax(…, 1fr)` and `height: 100%` on `.node-io-column` / `.node-io-row`, stretching jack bands to fill leftover plate height.
2. Band stack set `io.grow = true` (no lip), so ceil’d outer height and manual `heightGu` / `defaultHeightGu: 3` leftover went into the IO track and into that 1fr stretch.

Normal LayoutA (and LayoutB shell columns) pack flush: `align-content: start`, row height = `--node-signal-port-height`, gap = `--node-io-gap`. That is the SSOT.

## Fix (unify onto SSOT — no one-off spacing tweaks)

1. **`public/styles.css`** — Drop InletOutlet 1fr / stretch overrides on IO columns and rows. Section keeps equal in/out columns only. Shared `.node-io-column` documents and sets the flush packing SSOT (`grid-auto-rows: minmax(var(--node-signal-port-height), auto)`).
2. **`public/node-graph-module-sizing.js`** — InletOutlet uses the same **lip** leftover band as LayoutA; IO stays content-sized (no `io.grow`).
3. **Portal / meta registers** — Remove pinned `defaultHeightGu` so spawn height = content formula (already the documented InletOutlet contract).
4. **`public/modules/portal/portal-ui.css`** — Remove dead custom-face absolute jack layout (modules mount shared IO section only).

UI / module-chrome only. No audio-path / WASM / C++ changes.

## Verify (Live UI)

Hard-reload Live UI after cache bump `b074-io-jack-ssot-1`.

For each variant, place next to a normal LayoutA module with the same jack count (e.g. Gain) and confirm jack vertical pitch matches:

1. **Output Mono**, **Output Left**, **Output Right**, **Output Left Right**, **Output Mono Left Right**
2. **Input Mono**, **Input Left**, **Input Right**, **Input Left Right**, **Input Mono Left Right**
3. **Portal IO** (paired → / ←), plus load an old patch with separate namedPortalIn / namedPortalOut
4. Inside a Metamodule: **Metamodule In**, **Metamodule Out**, **Voice Inc / Gate / Trigger / Idle**
5. Grow an InletOutlet module taller than content — leftover should be empty lip below the jack pack, **not** stretched gaps between jacks
6. Spot-check speaker **Output** and mic **Input** — unchanged flush packing
7. No audio / wire routing change expected
