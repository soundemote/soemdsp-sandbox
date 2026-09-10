// Self-contained glue for the bradley_2a native module (Bradley Telcom
// Jitter & Hit Synth -- see native_modules/bradley_2a/bradley_2a.cpp for
// the actual DSP: test tone + phase/amp jitter, frequency translation,
// harmonic distortion, single-freq interference, periodic hits).
//
// Unlike node-graph-logistic-map.js/node-graph-lorenz-attractor.js, this
// file has no pure-JS reimplementation of the algorithm -- it's a naive,
// intentionally-aliasing first-pass model with 16 interacting parameters,
// not worth hand-duplicating in JS. Instead it lazily fetches and
// instantiates bradley_2a.wasm itself (this runs on the main thread --
// offline render -- which has fetch, unlike the audio worklet's
// restricted scope; see node-graph-live-frame-evaluator.js's
// nodeGraphPiSpigotNoiseLoadWasm for the same pattern) and calls straight
// into it. Silent (0) output until the wasm finishes loading.
//
// Gotcha: unlike lorenz_attractor (JS applies "level" on top), this
// module's wasm applies "level" internally -- soemdsp_bradley_2a_sample's
// return value is already level-scaled. Don't multiply by level again.

const nodeGraphBradley2AWasm = { promise: null, exports: null, failed: false };

function nodeGraphBradley2ALoadWasm() {
  if (nodeGraphBradley2AWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphBradley2AWasm.promise = fetch("/native_modules/bradley_2a/bradley_2a.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphBradley2AWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphBradley2AWasm.failed = true;
    });
}

function createNodeGraphBradley2AState() {
  return {
    nativeHandle: 0,
  };
}

function destroyNodeGraphBradley2ANativeState(state) {
  const wasm = nodeGraphBradley2AWasm.exports;
  if (state?.nativeHandle && wasm?.soemdsp_bradley_2a_destroy) {
    wasm.soemdsp_bradley_2a_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
}

// params keys match bradley_2a.cpp's metadata "parameters" array order
// exactly: carrierFreq, freqOffset, jitterDepth, jitterRate, ampDepth,
// ampRate, interfLevel, interfFreq, harm2, harm3, hitRate, hitDuration,
// hitGain, hitPhase, impulseLevel, level.
function nodeGraphBradley2ASample(state, params = {}, sampleRate = 44100) {
  nodeGraphBradley2ALoadWasm();
  const wasm = nodeGraphBradley2AWasm.exports;
  if (!wasm?.soemdsp_bradley_2a_create || !wasm?.soemdsp_bradley_2a_sample) {
    return 0;
  }
  if (!state.nativeHandle) {
    state.nativeHandle = wasm.soemdsp_bradley_2a_create();
  }
  if (!state.nativeHandle) {
    return 0;
  }
  const out = wasm.soemdsp_bradley_2a_sample(
    state.nativeHandle,
    nodeGraphFiniteNumber(params.carrierFreq),
    nodeGraphFiniteNumber(params.freqOffset),
    nodeGraphFiniteNumber(params.jitterDepth),
    nodeGraphFiniteNumber(params.jitterRate),
    nodeGraphFiniteNumber(params.ampDepth),
    nodeGraphFiniteNumber(params.ampRate),
    nodeGraphFiniteNumber(params.interfLevel),
    nodeGraphFiniteNumber(params.interfFreq),
    nodeGraphFiniteNumber(params.harm2),
    nodeGraphFiniteNumber(params.harm3),
    nodeGraphFiniteNumber(params.hitRate),
    nodeGraphFiniteNumber(params.hitDuration),
    nodeGraphFiniteNumber(params.hitGain),
    nodeGraphFiniteNumber(params.hitPhase),
    nodeGraphFiniteNumber(params.impulseLevel),
    nodeGraphFiniteNumber(params.level),
    Math.max(1, nodeGraphFiniteNumber(sampleRate, 44100)),
  );
  return Number.isFinite(out) ? out : 0;
}
