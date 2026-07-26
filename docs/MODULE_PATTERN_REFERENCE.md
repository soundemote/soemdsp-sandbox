# Sandbox Module Pattern Reference

AI-facing reference for translating DSP code into a hardcoded sandbox module.
This documents the CURRENT module pattern as it exists in the codebase.

For the process guide (how to add a module step by step), see
`docs/ADDING_HARDCODED_SANDBOX_MODULE.md`.

## Boundary

Patch JSON cannot define new module types. A module type must be hardcoded
in sandbox source. There is no plugin loader, manifest registry, WASM module
format, or CLAP/JUCE module path for user-defined modules yet.

## The four edit points

Every audio module touches four locations:

```text
1. public/node-graph-module-definitions.js   — definition + label
2. public/index.html                          — Add Module menu button
3. public/node-graph-live-frame-evaluator.js  — Render Sample + ScriptProcessor
4. public/node-live-audio-worklet.js          — Live Audio (AudioWorklet)
```

Locations 3 and 4 must produce identical output for the same input. They are
sibling execution lanes. A module with sound behavior must be implemented in
both.

## Reference module: `gain`

The simplest processor. One input, one output, one parameter.

### 1. Definition (`node-graph-module-definitions.js`)

```js
// Line 41: label
gain: "Gain",

// Line 1067: definition
gain: {
  inputs: ["In"],
  outputs: ["Out"],
  parameters: [
    {
      defaultValue: "1",
      key: "amount",
      label: "Amplitude",
      max: "3",
      mid: "1",
      min: "0",
      nonlinearSlider: false,
      step: "any",
    },
  ],
},
```

### 2. Add Module menu (`index.html`)

```html
<button type="button" role="menuitem" data-context-module="gain">Gain</button>
```

### 3. Frame evaluator (`node-graph-live-frame-evaluator.js`)

```js
// Line 2942
} else if (node?.type === "gain") {
  value = mixInput(nodeId) * readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "amount",
    1,
    frame,
    frames,
    frameValues,
  );
}
```

### 4. Worklet (`node-live-audio-worklet.js`)

```js
// Line 5865
} else if (node?.type === "gain") {
  value = mixInput(nodeId) *
    this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues);
}
```

## Definition shape

```text
{
  inputs: ["In"],              // string array of input port names
  outputs: ["Out"],            // string array of output port names
  parameters: [ ... ],         // array of parameter definitions
  layout?: "textBox" | "graph" | "clapPlugin",  // optional special rendering
  displayType?: string,        // optional display category
  inputLabels?: {},            // optional port label overrides
  outputLabels?: {},
  inputAliases?: {},           // map user-facing port names to canonical
  outputAliases?: {},
  graphInputs?: [],            // for graph-type modules
  visualInputs?: [],           // for modules with visual input ports
  bufferedInputs?: [],         // for modules with buffered input history
  displayHeightGu?: number,    // optional display height in grid units
  visualSink?: true,           // marks module as a visual-only sink
  monitorSink?: true,          // marks module as a monitor sink
}
```

## Three control surfaces (do not confuse these)

Modules expose **three different ways** to receive control. They look similar
in conversation ("add a phase input") but they are **not the same field** in
the definition and they **do not render the same place** on the module face.

| What you put in the definition | Where it appears on the module | How wires work | Typical use |
| --- | --- | --- | --- |
| `inputs: ["0.1V/Oct", "Phase"]` | **Left IO column** — full-height labeled jacks next to signal ports | Signal / CV wires into `mixInput(nodeId, "Phase")` | Pitch CV, audio in, dedicated CV jacks the user expects to *see* as ports |
| `parameters: [{ key: "phase", ... }]` | **Slider row** in the body (knob/slider + readout) | Always has a **tiny** modulation port on the left of that row (`io: "modulation"`) and a slider-output port on the right | User-facing knobs: Frequency, Phase, Amplitude, Waveform |
| Modulation into a parameter (automatic once the param exists) | Small mod jack on that parameter row, **not** in the left IO column | Graph `modulations` targeting `destinationParam` | Fine CV into an existing knob without adding a second left-side jack |

### What went wrong (DSF oscillator case study)

Request: *"add 0.1V like PolyBLEP, plus phase and amplitude."*

PolyBLEP definition:

```js
inputs: ["Reset", "0.1V/Oct", "Increment"],  // left-side jacks only
parameters: [
  { key: "waveform", ... },
  { key: "frequency", ... },
  { key: "phase", ... },   // slider — NOT in inputs[]
  { key: "level", label: "Amplitude", ... },  // slider — NOT in inputs[]
],
```

First attempt matched that pattern literally:

- Put `0.1V/Oct` in `inputs` → **new left jack** (visible as a new port).
- Put `phase` in `parameters` → **new slider** (easy to miss among existing knobs).
- Renamed `level` → `Amplitude` → **same slider**, new label only.

User report: *"I only see the 0.1V input."* That was accurate for the **left
IO column**. Phase/Amplitude did not fail to render — they were never added
as `inputs[]` jacks. Nothing was "missing" from the renderer.

**Rule of thumb for agents and humans:**

1. If the user says they want something that **shows up like 0.1V** (a named
   jack in the left column), it must be listed in **`inputs`**.
2. If they want a **knob**, it must be listed in **`parameters`**.
3. If they want **both** a knob and a full CV jack (common for Phase/Level),
   put it in **both**: a parameter for the knob, and an `inputs` entry wired
   in the evaluator (add / multiply / replace — document which).
4. Do **not** treat "add X input" as ambiguous: ask or default to the surface
   that matches the reference module's *visible* affordance the user named.

### Evaluator wiring patterns

```js
// Left-side signal input (definition.inputs)
const audio = mixInput(nodeId, "In");

// Knob only (definition.parameters) — modulation already applied by
// readNodeGraphLiveEffectiveParam / readEffectiveParameter
const phase = read("phase", 0);

// Knob + optional dedicated CV jack (inputs + parameters)
const phaseKnob = read("phase", 0);
const phaseCv = hasInput(nodeId, "Phase") ? mixInput(nodeId, "Phase") : 0;
const phase = wrap01(phaseKnob + phaseCv);
```

### Universal linear frequency jack `f`

Most oscillators expose a left-side jack named **`f`**: absolute Hz in
`[0, Speed Limit]`. Speed Limit is a header control next to Speed (default
**20000**). When `f` is wired it **overrides** the module’s usual
frequency/0.1V/Oct path; when unwired, each module keeps its own pitch
universe.

Helpers (public/node-graph-module-controls.js + worklet methods):

```js
// Offline
const fHz = nodeGraphReadFInputHz(mixInput, hasInput, nodeId); // null if unwired
const hz = nodeGraphResolveFrequencyHz(moduleSpecificBaseHz, fHz);

// Worklet
const hz = this.resolveFrequencyHz(moduleSpecificBaseHz, this.readFInputHz(mixInput, nodeId));
```

Optional `controls[]` on a definition expands into `inputs`/`parameters` via
`nodeGraphModuleDefinition(type)` — use for new modules; old modules keep
listing `inputs`/`parameters` directly.

## Parameter definition shape

All numeric fields are stored as STRINGS (e.g. `"1"`, `"0"`, `"440"`).

Required fields:

```text
key           — unique parameter key within the module
label         — user-visible label
defaultValue  — string, default value
min           — string, minimum
max           — string, maximum
step          — string, step size ("any" for continuous)
```

Optional fields:

```text
mid               — string, midpoint for slider skew
unit              — string, unit suffix ("Hz", "dB", "amp", etc.)
kind              — metadata kind (see below)
choices           — array of strings for discrete choice parameters
displayChoices    — boolean, show choice labels
divideChoicesVisibly — boolean, add visual divider between choices
showSign          — boolean, show +/- prefix
wraparound        — boolean, value wraps (for phase)
linearSmoothing   — boolean, enable parameter smoothing
nonlinearSlider   — boolean, apply skew to slider
maxDigits         — number, display precision
```

## Metadata kinds

Defined in `server.py` `NODE_METADATA_KIND_TEMPLATES` and mirrored from
`soemdsp/include/soemdsp/meta.hpp`. Common kinds:

```text
decimal           — generic 0..1
decimal_bipolar   — generic -1..1
amplitude         — 0..3, unit "amp"
decibels          — -60..12, unit "dB"
frequency         — 0..20000, unit "Hz"
phase             — 0..1, unit "cycle", wraparound
pitch             — -12..12, unit "st"
seconds           — 0..5, unit "s"
sustain           — 0..1, unit "amp"
waveform          — Saw/Ramp/Square/Triangle/Sine/Noise
bypass            — active/BYPASSED
onoff             — off/on
```

## Runtime contract

Both execution lanes expose the same primitives under different names:

| Frame evaluator (offline)                | Worklet (live)                          |
|------------------------------------------|-----------------------------------------|
| `mixInput(nodeId)`                       | `mixInput(nodeId)`                      |
| `readNodeGraphLiveEffectiveParam(...)`   | `this.readEffectiveParameter(...)`      |
| `nodeGraphSafeFilterNumber(...)`         | `this.safeFilterNumber(...)`            |
| `runtime.smoothers`                      | `this.smoothers`                        |

`mixInput(nodeId)` returns the summed signal from all wired input ports.
For multi-port input, `mixInput(nodeId, "In")` reads a specific port.

`readEffectiveParameter(node, key, fallback, frame, frames, frameValues)`
returns the parameter value with smoothing applied. The `fallback` is used
when the parameter is missing.

Output is assigned to `value`. For single-output modules, `value` is a
number written to the default output port. For multi-output modules,
`value` is an object: `{ Left: ..., Right: ... }`.

## Source modules

A source module has `outputs` but no `inputs` (or inputs that are
optional). Examples: `osc`, `noise`, `audioInput`, `audioPlayer`.

The execution plan's unsupported-source gate
(`nodeGraphModuleProducesOutputWithoutSignalInput(type)` in
`node-graph-module-definitions.js`) determines whether a module type can
produce output without signal input. A module with no `inputs` array is
automatically treated as a source. Modules with inputs that can still run
without signal (e.g. `canvas`, `clapPlugin`, `codeblock`) are listed in
the `inputCapableSources` set inside that function.

## Native (C++ -> wasm) modules

Native modules live under `native_modules/<name>/`. Build via
`scripts/build_native_modules.ps1` (clang++ wasm32 target). The server
exposes them through `GET /api/native-modules`. The worklet loads them via
the `setNativeModuleWasm` message.

Header convention (first 48 source lines):

```text
// soemdsp-native-module: <name>
// soemdsp-native-label: <Label>
// soemdsp-native-target: <targetType>
// soemdsp-native-kind: oscillator | effect
```

Current export shapes:

- `ellipsoid` — stateless-ish, file-scope globals. Single-instance only.
- `sabrina_reverb` — fixed pool of 2 instances via `states[kMaxInstances]`.

Future stateful modules should use an explicit handle pattern:

```text
soemdsp_<module>_create() -> handle
soemdsp_<module>_destroy(handle)
soemdsp_<module>_reset(handle)
soemdsp_<module>_set_params(handle, ...)
soemdsp_<module>_process(handle, ...) -> output
```

## Smoke test contract

When a module becomes part of the durable sandbox contract, add smoke test
anchors in `scripts/smoke_test.py` for:

- The module definition exists in `node-graph-module-definitions.js`
- The Add Module menu marker exists in `index.html`
- The frame evaluator branch exists in `node-graph-live-frame-evaluator.js`
- The worklet branch exists in `node-live-audio-worklet.js`
- The metadata shape matches `server.py` `NODE_METADATA_KIND_TEMPLATES`

The smoke test uses literal substring matching (`snippet in source`). When
refactoring, update the anchors to match the new code shape.

## Translation mission context

This reference supports the long-term DSP-to-module translation workflow:
a user pastes DSP code into an interface, and an AI agent uses this
documented pattern to return the code needed for that DSP to appear in the
modular environment app.

The translation output for a new module must include:

1. The module definition (inputs, outputs, parameters)
2. The label entry
3. The index.html menu button
4. The frame evaluator branch
5. The worklet branch
6. Smoke test anchors (when the module becomes durable)

Items 4 and 5 must produce identical output. The primitives differ in name
but not in behavior.
