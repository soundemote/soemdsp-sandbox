// Offline / Render Sample host for osc, polyBlep, and blit.
//
// APP_POLICY §5 — module DSP lives in one place:
//   Live worklet and offline must call the same native core (not a JS twin).
//   Hosts only schedule (phase, pitch, level) and read taps. Silence until
//   WASM is ready (APP_POLICY §2 — no parallel JS algorithm).
//
// Pattern matches node-graph-antisaw.js / bradley_2a: lazy main-thread
// instantiate of the same .wasm the worklet uses.

const nodeGraphMultiWaveMainWasm = {
  polyblep: { promise: null, exports: null, failed: false },
  blit: { promise: null, exports: null, failed: false },
  basic_oscillator: { promise: null, exports: null, failed: false },
};

function nodeGraphMultiWaveLoadMainWasm(name, urlPath) {
  const slot = nodeGraphMultiWaveMainWasm[name];
  if (!slot || slot.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  slot.promise = fetch(urlPath)
    .then((response) => {
      if (!response.ok) throw new Error(`${name} wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      slot.exports = result.instance.exports;
    })
    .catch(() => {
      slot.failed = true;
    });
}

function nodeGraphMultiWaveNativeHandleMap(runtime, mapKey) {
  if (!runtime[mapKey]) runtime[mapKey] = new Map();
  return runtime[mapKey];
}

function nodeGraphPolyBlepMainVectorSample(runtime, nodeId, phase, phaseIncrement, waveform, level, resetEdge, morph = 0.5) {
  nodeGraphMultiWaveLoadMainWasm("polyblep", "/native_modules/polyblep/polyblep.wasm");
  const wasm = nodeGraphMultiWaveMainWasm.polyblep.exports;
  if (!wasm?.soemdsp_polyblep_create || !wasm?.soemdsp_polyblep_sample) {
    return null;
  }
  const handles = nodeGraphMultiWaveNativeHandleMap(runtime, "polyBlepMainNativeHandles");
  let handle = handles.get(nodeId) || 0;
  if (!handle) {
    handle = wasm.soemdsp_polyblep_create();
    if (handle) handles.set(nodeId, handle);
  }
  if (!handle) return null;
  if (resetEdge) wasm.soemdsp_polyblep_reset?.(handle);
  const morphVal = Number(morph);
  wasm.soemdsp_polyblep_sample(
    handle,
    Number(phase) || 0,
    Number(phaseIncrement) || 0,
    Math.round(Number(waveform) || 0),
    Number(level) || 0,
    Number.isFinite(morphVal) ? morphVal : 0.5,
  );
  return {
    out: Number(wasm.soemdsp_polyblep_out(handle)) || 0,
    saw: Number(wasm.soemdsp_polyblep_saw(handle)) || 0,
    ramp: Number(wasm.soemdsp_polyblep_ramp(handle)) || 0,
    square: Number(wasm.soemdsp_polyblep_square(handle)) || 0,
    tri: Number(wasm.soemdsp_polyblep_tri(handle)) || 0,
    sine: Number(wasm.soemdsp_polyblep_sine(handle)) || 0,
  };
}

function nodeGraphBlitMainVectorSample(runtime, nodeId, phase, phaseIncrement, waveform, level, resetEdge) {
  nodeGraphMultiWaveLoadMainWasm("blit", "/native_modules/blit/blit.wasm");
  const wasm = nodeGraphMultiWaveMainWasm.blit.exports;
  if (!wasm?.soemdsp_blit_create || !wasm?.soemdsp_blit_sample) {
    return null;
  }
  const handles = nodeGraphMultiWaveNativeHandleMap(runtime, "blitMainNativeHandles");
  let handle = handles.get(nodeId) || 0;
  if (!handle) {
    handle = wasm.soemdsp_blit_create();
    if (handle) handles.set(nodeId, handle);
  }
  if (!handle) return null;
  if (resetEdge) wasm.soemdsp_blit_reset?.(handle);
  wasm.soemdsp_blit_sample(
    handle,
    Number(phase) || 0,
    Number(phaseIncrement) || 0,
    Math.round(Number(waveform) || 0),
    Number(level) || 0,
  );
  return {
    out: Number(wasm.soemdsp_blit_out(handle)) || 0,
    saw: Number(wasm.soemdsp_blit_saw(handle)) || 0,
    ramp: Number(wasm.soemdsp_blit_ramp(handle)) || 0,
    square: Number(wasm.soemdsp_blit_square(handle)) || 0,
    tri: Number(wasm.soemdsp_blit_tri(handle)) || 0,
    sine: Number(wasm.soemdsp_blit_sine(handle)) || 0,
  };
}

// LFO / basic_oscillator: one native handle per tap id (matches worklet).
function nodeGraphBasicOscMainSample(runtime, tapId, phase, phaseIncrement, waveform) {
  nodeGraphMultiWaveLoadMainWasm("basic_oscillator", "/native_modules/basic_oscillator/basic_oscillator.wasm");
  const wasm = nodeGraphMultiWaveMainWasm.basic_oscillator.exports;
  if (!wasm?.soemdsp_basic_oscillator_create || !wasm?.soemdsp_basic_oscillator_sample) {
    return 0;
  }
  const handles = nodeGraphMultiWaveNativeHandleMap(runtime, "basicOscMainNativeHandles");
  let handle = handles.get(tapId) || 0;
  if (!handle) {
    handle = wasm.soemdsp_basic_oscillator_create();
    if (handle) handles.set(tapId, handle);
  }
  if (!handle) return 0;
  const out = wasm.soemdsp_basic_oscillator_sample(
    handle,
    Number(phase) || 0,
    Number(phaseIncrement) || 0,
    Math.round(Number(waveform) || 0),
  );
  return Number.isFinite(out) ? out : 0;
}

function nodeGraphSilentMultiWaveVector() {
  return { out: 0, saw: 0, ramp: 0, square: 0, tri: 0, sine: 0 };
}

function nodeGraphPolyBlepOscillatorLiveEvaluator({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) {
  const resetState = runtime.oscResetStates.get(nodeId) || createNodeGraphOscResetState();
  runtime.oscResetStates.set(nodeId, resetState);
  const resetValue = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Reset"),
    runtime,
    nodeId,
    resetState,
    "osc reset",
  );
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : runtime.phases.get(nodeId) || 0;
  if (resetEdge) {
    runtime.triangleStates.set(nodeId, 0);
  }
  const phaseOffset = nodeGraphPhaseRadians(
    readNodeGraphLiveEffectiveParam(
      runtime,
      node,
      "phase",
      0,
      frame,
      frames,
      frameValues,
    ),
  );
  const frequency = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "frequency",
    100,
    frame,
    frames,
    frameValues,
  );
  const waveform = readNodeGraphLiveEffectiveParam(
    runtime,
    node,
    "waveform",
    0,
    frame,
    frames,
    frameValues,
  );
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "osc increment input",
  );
  const referenceVoltage = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120;
  const hasPitch = hasInput(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "osc 0.1v/oct input",
    ), -1, 1)
    : referenceVoltage;
  const effectiveFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(frequency, pitchCv, referenceVoltage)
      : frequency * (2 ** ((pitchCv - referenceVoltage) / 0.1)));
  // Signed Hz → signed phase inc (negative = through-zero reverse).
  const phaseIncrement = (effectiveFrequency / sampleRate) + incrementInput;
  const level = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude",
    1,
    frame,
    frames,
    frameValues,
  );
  const morph = readNodeGraphLiveEffectiveParam(runtime, node, "shape",
    0.5,
    frame,
    frames,
    frameValues,
  );

  const ph = phase + phaseOffset;
  let vector = null;
  if (node?.type === "polyBlep") {
    vector = nodeGraphPolyBlepMainVectorSample(
      runtime, nodeId, ph, phaseIncrement, waveform, level, resetEdge, morph,
    );
  } else if (node?.type === "blit") {
    vector = nodeGraphBlitMainVectorSample(
      runtime, nodeId, ph, phaseIncrement, waveform, level, resetEdge,
    );
  }

  let value;
  if (vector) {
    value = {
      Out: vector.out,
      Saw: vector.saw,
      Ramp: vector.ramp,
      Square: vector.square,
      Tri: vector.tri,
      Sine: vector.sine,
      "Wave Out": vector.out,
      Noise: vector.out,
    };
  } else if (node?.type === "polyBlep" || node?.type === "blit") {
    // Native not ready yet — silence (not a JS bandlimited twin).
    const silent = nodeGraphSilentMultiWaveVector();
    value = {
      Out: silent.out,
      Saw: silent.saw,
      Ramp: silent.ramp,
      Square: silent.square,
      Tri: silent.tri,
      Sine: silent.sine,
      "Wave Out": silent.out,
      Noise: silent.out,
    };
  } else {
    // osc (LFO): same basic_oscillator.wasm the worklet uses.
    const sample = (tapId, wf) => nodeGraphBasicOscMainSample(
      runtime, tapId, ph, phaseIncrement, wf,
    ) * level;
    const selected = sample(nodeId, waveform);
    value = {
      Out: selected,
      Saw: sample(`${nodeId}:saw`, 0),
      Ramp: sample(`${nodeId}:ramp`, 1),
      Square: sample(`${nodeId}:square`, 2),
      Tri: sample(`${nodeId}:tri`, 3),
      Sine: sample(`${nodeId}:sine`, 4),
      "Wave Out": selected,
      Noise: selected,
    };
  }

  runtime.phases.set(
    nodeId,
    wrapNodeSliderValue(phase + Math.PI * 2 * phaseIncrement, 0, Math.PI * 2),
  );
  return value;
}
// `osc` is Open Sound Control (controller stub elsewhere) — not this voice.
nodeGraphLiveModuleEvaluators.polyBlep = nodeGraphPolyBlepOscillatorLiveEvaluator;
nodeGraphLiveModuleEvaluators.blit = nodeGraphPolyBlepOscillatorLiveEvaluator;
