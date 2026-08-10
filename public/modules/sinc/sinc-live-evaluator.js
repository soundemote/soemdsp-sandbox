// Sinc offline/render host — same sinc.wasm as the worklet (APP_POLICY §5).

const nodeGraphSincWasm = { promise: null, exports: null, failed: false };

function nodeGraphSincLoadWasm() {
  if (nodeGraphSincWasm.promise || typeof fetch !== "function" || typeof WebAssembly === "undefined") {
    return;
  }
  nodeGraphSincWasm.promise = fetch("/native_modules/sinc/sinc.wasm")
    .then((response) => {
      if (!response.ok) throw new Error(`sinc wasm HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((result) => {
      nodeGraphSincWasm.exports = result.instance.exports;
    })
    .catch(() => {
      nodeGraphSincWasm.failed = true;
    });
}

function nodeGraphSincMainSample(runtime, nodeId, freq, phaseShift, lobes, bandLimit, sampleRate) {
  nodeGraphSincLoadWasm();
  const wasm = nodeGraphSincWasm.exports;
  if (!wasm?.soemdsp_sinc_create || !wasm?.soemdsp_sinc_sample) {
    return 0;
  }
  runtime._sincNativeHandles ||= new Map();
  let handle = runtime._sincNativeHandles.get(nodeId) || 0;
  if (!handle) {
    handle = wasm.soemdsp_sinc_create();
    if (handle) runtime._sincNativeHandles.set(nodeId, handle);
  }
  if (!handle) return 0;
  const out = wasm.soemdsp_sinc_sample(
    handle,
    Math.max(0, Number(freq) || 0),
    Number(phaseShift) || 0,
    Math.max(1, Math.round(Number(lobes) || 4)),
    Math.round(Number(bandLimit) || 0),
    Math.max(1, Number(sampleRate) || 44100),
  );
  return Number.isFinite(out) ? out : 0;
}

nodeGraphLiveModuleEvaluators.sinc = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const baseFreq = Math.max(0, read("freq", 100));
  const phaseKnob = read("phase", 0);
  const phaseCv = hasInput?.(nodeId, "Phase")
    ? nodeGraphSafeFilterNumber(mixInput(nodeId, "Phase"), runtime, nodeId, 0, "sinc phase")
    : 0;
  const phaseShift = typeof nodeGraphParamSignalInPhaseAdd === "function"
    ? nodeGraphParamSignalInPhaseAdd(phaseKnob, phaseCv)
    : ((Number(phaseKnob) || 0) + (Number(phaseCv) || 0));
  const lobes = Math.max(1, Math.round(read("lobes", 4)));
  const bandLimited = Math.round(read("bandLimit", 1));

  const pitchReferenceAudio = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  const referenceVoltage = pitchReferenceAudio.pitchReferenceMidiNote / 120;
  const hasPitch = hasInput(nodeId, "0.1V/Oct");
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "Sinc 0.1v input",
    ), -1, 1)
    : referenceVoltage;
  const freq = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: baseFreq,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
    })
    : (typeof nodeGraphPitchedFrequency === "function"
      ? nodeGraphPitchedFrequency(baseFreq, pitchCv, referenceVoltage)
      : Math.max(0, baseFreq * (2 ** ((pitchCv - referenceVoltage) / 0.1))));
  const value = nodeGraphSincMainSample(
    runtime,
    nodeId,
    freq,
    phaseShift,
    lobes,
    bandLimited,
    sampleRate || 44100,
  );
  return { Out: Math.max(-1, Math.min(1, value)) };
};
