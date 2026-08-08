// Sinepulse — offline/render.

/** Read param with legacy key fallback. */
function nodeGraphSinepulseReadParam(runtime, node, keys, fallback, frame, frames, frameValues) {
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const v = readNodeGraphLiveEffectiveParam(runtime, node, key, NaN, frame, frames, frameValues);
    if (Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return fallback;
}

function nodeGraphSinepulseResolveRateHz(
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
) {
  const rate = nodeGraphSinepulseReadParam(
    runtime, node, ["rate", "frequency"], 1, frame, frames, frameValues,
  );
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Math.max(-1, Math.min(1, Number(mixInput(nodeId, "0.1V/Oct")) || 0))
    : referenceVoltage;
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  if (typeof nodeGraphParamResolveOscPitchHz === "function") {
    return nodeGraphParamResolveOscPitchHz({
      baseHz: rate,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      fHz,
    });
  }
  return rate;
}

/** Read FreqCurve; migrate legacy "curve" key. */
function nodeGraphSinepulseReadFreqCurve(runtime, node, frame, frames, frameValues) {
  const primary = readNodeGraphLiveEffectiveParam(runtime, node, "freqCurve", NaN, frame, frames, frameValues);
  if (Number.isFinite(Number(primary))) return Number(primary);
  const legacy = readNodeGraphLiveEffectiveParam(runtime, node, "curve", 0.5, frame, frames, frameValues);
  const c = Number(legacy);
  if (!Number.isFinite(c)) return 0.5;
  if (c >= 0 && c <= 1) return c;
  return 0.5;
}

function nodeGraphSinepulseSafePorts(out, runtime, nodeId) {
  const safe = (v) => (typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(v, runtime, nodeId, null, "sinepulse")
    : (Number(v) || 0));
  if (out && typeof out === "object") {
    return {
      Out: safe(out.Out),
      f: safe(out.f),
      Amp: safe(out.Amp),
      Freq: safe(out.Freq),
    };
  }
  return { Out: safe(out), f: 0, Amp: 0, Freq: 0 };
}

nodeGraphLiveModuleEvaluators.sinepulse = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  sampleRate,
  hasInput,
}) => {
  if (!runtime.sinepulseStates) runtime.sinepulseStates = new Map();
  let state = runtime.sinepulseStates.get(nodeId);
  if (!state) {
    state = createNodeGraphSinepulseState();
    runtime.sinepulseStates.set(nodeId, state);
  }

  const rate = nodeGraphSinepulseResolveRateHz(
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput,
  );
  const high = nodeGraphSinepulseReadParam(
    runtime, node, ["highFreq", "frequencyHigh"], 20000, frame, frames, frameValues,
  );
  const low = nodeGraphSinepulseReadParam(
    runtime, node, ["lowFreq", "frequencyLow"], 0, frame, frames, frameValues,
  );
  let shift = readNodeGraphLiveEffectiveParam(runtime, node, "shift", NaN, frame, frames, frameValues);
  if (!Number.isFinite(Number(shift))) {
    const legacy = Number(readNodeGraphLiveEffectiveParam(runtime, node, "together", 0, frame, frames, frameValues));
    shift = Number.isFinite(legacy) ? Math.max(0, Math.min(1, Math.abs(legacy) / 4)) : 0;
  }
  const sweep = readNodeGraphLiveEffectiveParam(runtime, node, "sweep", 1, frame, frames, frameValues);
  const direction = Math.round(readNodeGraphLiveEffectiveParam(runtime, node, "direction", 0, frame, frames, frameValues));
  const freqCurve = nodeGraphSinepulseReadFreqCurve(runtime, node, frame, frames, frameValues);
  const ampCurve = readNodeGraphLiveEffectiveParam(runtime, node, "ampCurve", 0, frame, frames, frameValues);
  const phase = readNodeGraphLiveEffectiveParam(runtime, node, "phase", 0, frame, frames, frameValues);
  const amplitude = readNodeGraphLiveEffectiveParam(runtime, node, "amplitude", 1, frame, frames, frameValues);
  const antialias = Math.round(
    readNodeGraphLiveEffectiveParam(runtime, node, "antialias", 1, frame, frames, frameValues),
  );
  const increment = Number(mixInput(nodeId, "Increment")) || 0;
  const resetGate = mixInput(nodeId, "Reset");
  const sr = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);

  const out = nodeGraphSinepulseSample(
    state,
    rate,
    high,
    low,
    shift,
    sweep,
    direction,
    freqCurve,
    ampCurve,
    phase,
    amplitude,
    increment,
    resetGate,
    sr,
    antialias,
  );
  return nodeGraphSinepulseSafePorts(out, runtime, nodeId);
};
