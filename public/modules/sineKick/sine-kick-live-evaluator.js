// SineKick — offline/render.

nodeGraphLiveModuleEvaluators.sineKick = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
  sampleRate,
}) => {
  if (!runtime.sineKickStates) runtime.sineKickStates = new Map();
  let state = runtime.sineKickStates.get(nodeId);
  if (!state) {
    state = createNodeGraphSineKickState();
    runtime.sineKickStates.set(nodeId, state);
  }
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime, node, key, fallback, frame, frames, frameValues,
  );
  const decayRaw = read("decay", NaN);
  const decay = Number.isFinite(Number(decayRaw)) ? decayRaw : read("speed", 0.28);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function" && nodeGraphMvp?.patch?.audio
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio).pitchReferenceMidiNote / 120
    : 0.4;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? Number(mixInput(nodeId, "0.1V/Oct")) || 0
    : referenceVoltage;
  const pitched = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({baseHz: read("pitch", 52),
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    })
    : read("pitch", 52);
  const sharpRaw = read("sharpness", NaN);
  const sharpness = Number.isFinite(Number(sharpRaw)) ? Number(sharpRaw) : 0;
  const trigger = mixInput(nodeId, "T");
  const sr = Math.max(1, Number(sampleRate) || nodeGraphMvp?.sampleRate || 44100);
  const out = nodeGraphSineKickSample(
    state,
    trigger,
    pitched,
    read("punch", 1.7),
    decay,
    read("amplitude", 1),
    sr,
    1,
    sharpness,
  );
  const safe = (v) => (typeof nodeGraphSafeFilterNumber === "function"
    ? nodeGraphSafeFilterNumber(v, runtime, nodeId, null, "sineKick")
    : (Number(v) || 0));
  return {
    Out: safe(out.Out),
    A: safe(out.A),
    U: safe(out.U),
    X: safe(out.X),
    Y: safe(out.Y),
  };
};
