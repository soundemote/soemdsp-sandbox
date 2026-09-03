# Adding a Hardcoded Sandbox Module to the Current WebUI

This guide describes the current WebUI path for adding a module to
`soemdsp-sandbox`.

Current state: WebUI modules are hardcoded sandbox modules. Adding one means
editing sandbox source code. There is not yet a user-facing custom module
loader, manifest-driven module registry, plugin API, WASM module format,
or server-persisted project/module format.

This guide does not describe the final C++ API.

## Edit Points

Use the existing modules as the template: `osc`, `noise`, `gain`, and `bias`.

1. Define the module type in `public/node-graph-module-definitions.js`.

   Main anchor: `nodeGraphModuleDefinitions`.

   Add the new module key, ports, and parameters. A source module usually has
   `outputs`. A processor usually has `inputs` and `outputs`. The `output`
   module is special and should not be used as a template for ordinary modules.

   **Critical:** `inputs` and `parameters` are different UI surfaces. Left-side
   jacks (like PolyBLEP's `0.1V/Oct`) only appear from `inputs: [...]`. Knobs
   only appear from `parameters: [...]`. Every parameter also gets a tiny
   modulation port on its slider row automatically — that is **not** the same
   as listing the name in `inputs`. See "Three control surfaces" in
   `docs/MODULE_PATTERN_REFERENCE.md` (including the DSF case study).

2. Add a user-visible label in `public/node-graph-module-definitions.js`.

   Main anchor: `nodeGraphNodeLabels`.

   The label is used by module headers, port labels, accessibility labels, and
   debug/UI text.

3. Add the module to the empty-scene Add Module menu if users should create it
   from the WebUI.

   File: `public/index.html`.

   Current menu buttons use `data-context-module`:

   ```html
   <button type="button" role="menuitem" data-context-module="noise">Noise</button>
   ```

4. Add offline Render Sample / preview behavior if the module produces or
   transforms audio.

   File: `public/modules/<Type>/<kebab-name>-live-evaluator.js` (its own
   per-module file, e.g. `public/modules/wallDelay/wall-delay-live-evaluator.js`
   -- not a shared/central file; every module gets its own pair of files
   under `public/modules/`).

   Register a handler by assigning `nodeGraphLiveModuleEvaluators.<type> = (...) => {...}`
   (that object is declared centrally in `node-graph-live-frame-evaluator.js`;
   your per-module file just adds an entry to it). Add a `<script>` tag for
   the new file in `public/index.html`, anywhere after
   `node-graph-live-frame-evaluator.js`'s own tag.

5. **Do NOT add JS AudioWorklet / live-evaluator DSP.** Efficient product is
   native graph only (`graph_engine` opcode + `NATIVE_GRAPH_TYPE_IDS`).
   JS is interface (plan, params, faces). Historical note — old docs said:
   Add matching Live Audio (realtime AudioWorklet) behavior if the module
   should sound the same while Live Audio is running.

   File: `public/modules/<Type>/<kebab-name>-worklet-evaluator.js`.

   The AudioWorklet runs in a separate JS realm (`AudioWorkletGlobalScope`)
   that shares no globals with the main thread/window -- anything the
   worklet needs (math helpers, geometry, etc.) must be ported into this
   file as `NodeLiveAudioProcessor.prototype.<name> = function ...`, not
   just referenced from your live-evaluator file. Then:
   - Add your file's path to `nodeGraphLiveWorkletSourceFiles` in
     `public/node-graph-live-runtime.js` -- the realtime worklet module is
     assembled at runtime by fetching and concatenating this whole list into
     one Blob (core file + every per-module chunk + a final register file),
     so a module missing from this list simply never loads worklet-side.
   - Add a dispatch entry for your `node.type` inside `buildLiveModuleEvaluators()`
     in `public/node-live-audio-worklet-core.js` (a large hand-written
     type->handler object literal in that file; this is centralized, unlike
     the per-module-file pattern above -- your per-module worklet file only
     supplies the *methods* the dispatch entry calls into).
   - Register the module's state Map in **six** places in
     `public/node-graph-live-plan-runtime.js` (offline path) and in
     **node-live-audio-worklet-core.js** (realtime path: constructor init,
     the reset-on-reload block, node-add handler, cleanup-on-remove loop,
     plus the dispatch entry above) -- grep an existing similar module (e.g.
     `wallDelayStates`) for the full list of anchor points rather than
     guessing; it's easy to miss one and get silent per-node state leaks or
     stale state on patch changes.

   Render Sample and Live Audio are sibling browser execution lanes with
   fully separate code (not two branches of shared code) that must be kept
   audibly consistent by hand. See `public/modules/wallDelay/` for a
   complete, recently-built worked example of every one of these files.

6. **Register the module type for realtime playback validation**, or new
   modules with an input port will build fine offline and then silently
   refuse to play live audio at all.

   File: `public/node-graph-execution-plan.js`, function
   `compileNodeGraphExecutionPlan`.

   As of this note, the fallback here checks a module's own declared
   `inputs` ports generically, so a plain single-`In`-port effect module
   works with **no extra registration step**. You only need to add your
   type to the `passthroughTypes` Set in that function if you want a
   friendlier `"missing X input"` message instead of the generic one, or if
   your module needs the special multi-port handling `reverbEffect` gets
   (`["In", "Left", "Right"]`).
   Before this generic fallback existed, forgetting this step didn't error
   in an obvious way: the *offline/preview* evaluator (Render Sample, and
   everything in this whole guide's step 4) never runs this check, so a
   module could look completely finished and pass every offline test, then
   throw `"unsupported source <nodeId>"` and refuse to start *any* live
   audio at all -- for the whole patch, not just the new module -- the
   moment someone actually pressed play. Two shipped modules (Ping Pong
   Delay, then Wall Delay) hit exactly this before it was noticed and fixed.
   **Always test the actual Live Audio path, not just Render Sample**, for
   any new module with a signal input -- see the OfflineAudioContext note
   below for how to do that without needing a real user gesture.

7. Update the smoke test when the new module becomes part of the durable
   sandbox contract.

   File: `scripts/smoke_test.py`.

   Add checks for the source anchors, menu marker, metadata shape, execution
   branch, and worklet branch that should not regress.

## Testing Live Audio (not just Render Sample) from a script

`startNodeGraphLiveAudio()` / `setNodeGraphLiveOutputEnabled(true)` are gated
by the browser's autoplay policy and effectively require a real user
gesture -- calling them from an automated script (devtools, a test harness,
an agent) typically silently no-ops (`nodeGraphMvp.live.usesWorklet` stays
`false`, no node ever gets created, no error is thrown).

To actually exercise the realtime AudioWorklet DSP from a script, drive it
directly with an `OfflineAudioContext` instead (offline rendering has no
autoplay gate):

```js
const offlineCtx = new OfflineAudioContext(2, sampleRate * durationSeconds, sampleRate);
const workletNode = await createNodeGraphLiveWorkletNode(offlineCtx);
workletNode.connect(offlineCtx.destination);
const plan = nodeGraphBuildLivePlan(); // throws if compileNodeGraphExecutionPlan finds issues
const audio = nodeGraphAudioDerivation(nodeGraphMvp.patch);
workletNode.port.postMessage({
  engineSampleRate: audio.clampedEngineSampleRate, oversamplingRatio: audio.oversamplingRatio,
  plan, patchFingerprint: plan.patchFingerprint, pitchReferenceHz: 440, pitchReferenceMidiNote: 69,
  planSerial: 1, sampleRate, sessionId: 1, type: "setPlan",
});
// IMPORTANT: the worklet runs on a separate thread; `postMessage` above is
// async and this script's very next line can otherwise race ahead of the
// worklet actually receiving and applying the plan. Without a yield here,
// startRendering() below renders the first (and often *only*, for a short
// render) block(s) against an unconfigured processor and comes back
// silent -- not because the DSP is broken, but because the harness asked
// for audio before the engine was told what to play. Confirmed directly:
// even a bare oscillator-to-output patch rendered silence without this.
await new Promise((resolve) => setTimeout(resolve, 200));
const rendered = await offlineCtx.startRendering();
// rendered.getChannelData(0) / (1) now hold real Left/Right samples.
```

## Parameter Metadata

Module parameters use the existing metadata shape. Use only fields the current
WebUI understands:

- `key`
- `label`
- `defaultValue`
- `min`
- `mid`
- `max`
- `step`
- `kind`
- `unit`
- `choices`
- `displayChoices`
- `divideChoicesVisibly`
- `showSign`
- `wraparound`
- `linearSmoothing`

The backend metadata kind source is mirrored from
`soemdsp/include/soemdsp/meta.hpp` through the sandbox metadata templates. Keep
metadata names and meanings aligned with that source when a module uses shared
metadata kinds.

## Patch JSON Boundary

Patch JSON can save and load current WebUI authoring state:

- module instances
- module positions
- parameter values
- parameter metadata
- signal connections
- modulation connections
- bypassed nodes
- visual settings
- floating window positions

Patch JSON cannot define a new module type by itself yet. A patch can instantiate
only module types already hardcoded in the sandbox source.

## Runtime Boundary

The sandbox server is read-only. It serves static files and inspection artifacts.
It does not persist modules, projects, or patch files server-side.

The browser compiler is demo-scoped UI machinery. It is not the production
`soemdsp` scheduler, not a plugin layer, and not a committed project format.

The WebUI does not instantiate real C++ DSP objects yet. Live Audio currently
uses browser JavaScript and AudioWorklet equivalents.

Preserve this architecture boundary:

- Circuit does not own concrete DSP objects.
- DSP objects do not know Circuit.
- Binding is the bridge.

## Checklist

Before considering a hardcoded module complete:

- The module type exists in `nodeGraphModuleDefinitions`.
- The module label exists in `nodeGraphNodeLabels`.
- The Add Module menu includes a `data-context-module` button if user creation
  is intended.
- Render Sample / offline behavior exists in its own
  `public/modules/<Type>/<kebab-name>-live-evaluator.js`, registered onto
  `nodeGraphLiveModuleEvaluators`, if the module affects audio.
- Live Audio behavior exists in its own
  `public/modules/<Type>/<kebab-name>-worklet-evaluator.js`
  (`NodeLiveAudioProcessor.prototype.*` methods), wired into
  `nodeGraphLiveWorkletSourceFiles` (`node-graph-live-runtime.js`) and the
  dispatch table in `buildLiveModuleEvaluators()`
  (`node-live-audio-worklet-core.js`), if the module affects audio.
- **The module actually plays through real Live Audio, verified with an
  `OfflineAudioContext`** (see above), not just Render Sample -- a module
  can look completely done and still throw `"unsupported source"` the
  moment someone plays it live, and Render Sample testing alone will never
  catch that.
- Smoke tests cover the source markers and behavior contract that must survive
  future edits.
- The documentation still states that this is not a plugin API, manifest module
  format, WASM module format, or final C++ module API.
