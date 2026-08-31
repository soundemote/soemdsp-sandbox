# Plan: Native Yellow Graph + native Music Player (remove slow JS peels)

## Goal

Before calling efficient Live “shipped without slow JS audio,” implement:

1. **Native Yellow Graph** in `graph_engine` (retire `additive-yellow-graph-sidecar` DSP).
2. **Native Music Player** (`audioPlayer` opcode + PCM upload; delete efficient JS peel).

Parked (not this cut): sample-accurate Additive mod packets (`docs/ADDITIVE_SAMPLE_ACCURATE_MOD_PLAN.md`).

## Locked decisions

| Topic | Choice |
|-------|--------|
| Yellow Graph / Additive | **Native now** before release — not delist, not keep JS peel |
| Music Player | **Native `audio_player` opcode this release** — remove peel |
| RGB generators (`rgbShape` / `rgbFractal`) | Stay **out** of efficient until native (observers already OK) |
| Controllers (Knob, …) | Keep thin JS publish for now; revisit after audio peels gone |
| Decode / file I/O | Stay **main-thread** forever |

## Checkpoint

- Local commit `8f0d03b8` (Additive JS work + docs). **Push still failing** (HTTP 408) — retry separately.
- Efficient Live already native for most allowlisted types; these two peels are the audio-thread blockers.

---

## Epic A — Native Yellow Graph

### Reality check

- 15 `additive*` types on efficient allowlist; **zero** Yellow Graph opcodes in `graph_engine`.
- Legacy `additiveOsc` (type **43**) is a **one-box** partial bank — not the modular Graph bus. Reuse sin/partial math only.
- Hard prerequisite: **Graph data-plane** in `graph_engine` (per-node `ratio/phase/amplitude/pan` arrays + Graph→Graph wires + quantum mutate-then-sum). Audio/CV ports alone cannot express the product.

### Phase A0 — Graph bus infra

- Extend `graph_engine` with Graph chunk storage + connect kind (not sample bus).
- Schedule: once per quantum, run Graph sources → effects → Out; Out writes Mono/L/R into speaker mix (replace `_additiveScratch*` JS mix).
- Export enough host glue to sync params and (if needed) read Graph for faces.

### Phase A1 — Minimal shippable chain (first audible native)

**3 opcodes** (suggested ids **110+** after Pump Limiter 109 — coordinate with Music Player id):

| Opcode | Type | Kernel from JS |
|--------|------|----------------|
| Generator | `additiveGenerator` | `additiveGraphBuildFromWaveform` |
| Bubble **or** one filter | `additiveBubble` *or* Linear/Analog/Ladder | `ApplyGrowl` / filter apply |
| Out | `additiveOut` | `additiveGraphSumSample` |

Shared C++ header under `native_modules/sandbox_native_maths/` (port from `additive-graph-math.js`), folded into `graph_engine` build (not three separate wasm modules).

Host: `NATIVE_GRAPH_TYPE_IDS`, param sync, Graph wire compile; **gate sidecar** so native-backed nodes skip JS DSP.

**Exit A1:** Gen → Bubble (or filter) → Out silent-free on efficient Live without yellow-graph-sidecar for that chain.

### Phase A2 — Full allowlist Graph DSP

Remaining ~11 effect opcodes: Linear, Analog, Ladder, FrequencySkew, QuantizeFreq/Phase, Pan, NoisyFreq/Phase/Pan/Amp.

Then **delete** Yellow Graph DSP from efficient blob (`additive-yellow-graph-sidecar.js` + generator peel). Keep `additive-graph-math.js` on main thread for face bake if needed.

`additiveCurveEnvelope` stays on envelope/control path (not Graph bus).

### Files (Yellow Graph)

- `native_modules/graph_engine/graph_engine.cpp` (+ maths header)
- `scripts/build_native_modules.ps1`, combined wasm, catalog
- `public/node-live-audio-worklet-native-graph.js`
- `public/modules/additiveGraph/additive-yellow-graph-sidecar.js` (gate → remove)
- `public/node-graph-live-runtime.js` (efficient source list)
- `docs/APP_POLICY.md` (retire carve-out; fix stale `additiveOsc` table)

---

## Epic B — Native Music Player

### Reality check

- Peel: `audio-player-efficient-sidecar.js` mixes after native quantum; **Speed/Phase CV forced 0**.
- PCM today: main-thread decode → `plan.samples` structured-clone into worklet Map → JS `audioPlayerSample`.
- Template: phosphillator `ptr` + `Float32Array(memory.buffer).set` — but efficient graph still lacks a clean **`soemdsp_graph_node_native_handle` / set_pcm-by-hash** export. That glue is on the critical path.

### Phase B1 — Native module + opcode

1. `native_modules/audio_player/audio_player.cpp` — handle pool, PCM set/clear, playback port of JS transport/speed/phase/reset/outs.
2. Capacity: **not** phosphillator’s tiny static path buffer — shared sample bank or growable heap with clear limits.
3. `kTypeAudioPlayer` in `graph_engine` (id **after** Yellow Graph ids or **110** if Yellow starts at 111 — pick one sequence and stick to it).
4. Expose **upload API**: graph hash → native handle → `l_ptr`/`r_ptr`/`set_pcm`.

### Phase B2 — Worklet upload + delete peel

5. Register type in `NATIVE_GRAPH_TYPE_IDS`; param/port maps; `syncNativeGraphParams`.
6. After compile / sample change: copy `this.samples` planar data into WASM (re-bind views if memory grows).
7. Remove sidecar call from `node-live-audio-worklet-process.js`; drop peel files from efficient blob.
8. Update APP_POLICY §0b (remove Music Player exception).
9. Smoke: Play/Loop/Stop/Reset, stereo to Output, track swap, Speed/Phase CV (peel never did CV).

Keep main-thread decode + playlist UI. Offline live-evaluator can stay JS until a follow-up.

### Files (Music Player)

- `native_modules/audio_player/*` (new)
- `native_modules/graph_engine/graph_engine.cpp` (+ exports list)
- `public/node-live-audio-worklet-native-graph.js`, `set-plan.js` (upload hook)
- `public/node-live-audio-worklet-process.js` (remove sidecar)
- `public/node-graph-live-runtime.js` (drop peel from efficient sources)
- Delete/quarantine `audio-player-efficient-sidecar.js` from efficient path
- `docs/APP_POLICY.md`

---

## Suggested execution order

1. **Retry push** of local Additive commit (unblocks sharing).
2. **Music Player native** (clearer boundary, phosphillator-like upload, deletes one peel) **in parallel with** Yellow Graph **A0 bus design**.
3. Yellow Graph **A1** minimal chain audible.
4. Yellow Graph **A2** remaining effects → delete sidecar.
5. Controllers / RGB generators / offline twins — later.

Parallelize B1–B2 with A0–A1 if two tracks available; **serialize type-id assignment** in `graph_engine`.

---

## Success criteria

- Efficient Live audio quantum: **no** `processAdditiveYellowGraphSidecar` DSP and **no** `processAudioPlayerEfficientSidecar`.
- Gen→Bubble→Out and Music Player→Output work on native opcodes.
- Allowlist + APP_POLICY match code (no stale `additiveOsc` / “Phase B peel” lies).
- Sample-accurate Additive **mod** plan remains docs-only until after this cut.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Graph bus is large design surface | Ship A1 with one effect only; freeze payload layout early |
| PCM capacity / WASM memory | Explicit max frames; refuse or stream later — don’t silent-truncate |
| Missing handle export | Blocker for both peels — do upload glue first as shared infra |
| Face / scope still expect JS publish | Keep math.js bake on main; publish rings from native Out |
