// Moved from node-graph-live-frame-evaluator.js: this module's own
// offline/render-time algorithm, now living next to the rest of its
// per-module code instead of the shared file.

function nodeGraphLadderFilterMix(mode, stages) {
  const safeMode = Math.round(clampNodeSliderValue(Number(mode) || 0, 0, 3));
  const stageCount = nodeGraphLadderFilterStageCount(stages);
  const c = [0, 0, 0, 0, 0];
  let s = 1;
  if (safeMode === 0) {
    c[0] = 1;
    s = 0.125;
  } else if (safeMode === 1) {
    c[stageCount] = 1;
    s = stageCount * 0.25;
  } else if (safeMode === 2) {
    const coefficients = [
      [1, -1],
      [1, -2, 1],
      [1, -3, 3, -1],
      [1, -4, 6, -4, 1],
    ][stageCount - 1];
    for (let index = 0; index < coefficients.length; index += 1) {
      c[index] = coefficients[index];
    }
    s = stageCount * 0.25;
  } else {
    const coefficients = stageCount <= 2
      ? [0, 2, -2, 0, 0]
      : stageCount === 3
        ? [0, 0, 3, -3, 0]
        : [0, 0, 4, -8, 4];
    for (let index = 0; index < coefficients.length; index += 1) {
      c[index] = coefficients[index];
    }
    s = 0.125;
  }
  return { c, s, stageCount, mode: safeMode };
}
function nodeGraphLadderFilterComputeFeedbackFactor(feedback, cosWc, a) {
  const b = 1 + a;
  const denominator = Math.max(1e-12, 1 + a * a + 2 * a * cosWc);
  const g2 = (b * b) / denominator;
  return feedback / Math.max(1e-12, g2 * g2);
}


function nodeGraphLadderFilterCoefficients(frequency, resonance, mode, stages, sampleRate, runtime = null, nodeId = "", state = null) {
  const rate = Math.max(1, Number(sampleRate) || nodeGraphMvp.sampleRate || 44100);
  const frequencyValue = Math.max(0, nodeGraphSafeFilterNumber(frequency, runtime, nodeId, state, "ladder filter frequency"));
  const safeFrequency = clampNodeSliderValue(frequencyValue, 0.000001, Math.min(20000, rate * 0.49));
  const feedback = clampNodeSliderValue(
    nodeGraphSafeFilterNumber(resonance, runtime, nodeId, state, "ladder filter resonance"),
    0,
    0.999,
  );
  const wc = clampNodeSliderValue((2 * Math.PI * safeFrequency) / rate, 1e-9, Math.PI * 0.98);
  const sine = Math.sin(wc);
  const cosine = Math.cos(wc);
  const tangent = Math.tan(0.25 * (wc - Math.PI));
  let a = tangent / Math.max(1e-12, sine - cosine * tangent);
  if (!Number.isFinite(a)) {
    a = -1;
  }
  const mix = nodeGraphLadderFilterMix(mode, stages);
  const k = nodeGraphLadderFilterComputeFeedbackFactor(feedback, cosine, a);
  const g = 1 + mix.s * k;
  return { ...mix, a, g, k };
}


function nodeGraphLadderFilterSample(state, input, params, sampleRate, runtime = null, nodeId = "") {
  const safeInput = nodeGraphSafeFilterNumber(input, runtime, nodeId, state, "ladder filter input");
  const coeff = nodeGraphLadderFilterCoefficients(
    params.frequency,
    params.resonance,
    params.mode,
    params.stages,
    sampleRate,
    runtime,
    nodeId,
    state,
  );
  const y = Array.isArray(state.y) && state.y.length >= 5 ? state.y : [0, 0, 0, 0, 0];
  state.y = y;
  y[0] = coeff.g * safeInput - coeff.k * y[4];
  y[0] = y[0] / (1 + y[0] * y[0]);
  y[1] = y[0] + coeff.a * (y[0] - y[1]);
  y[2] = y[1] + coeff.a * (y[1] - y[2]);
  y[3] = y[2] + coeff.a * (y[2] - y[3]);
  y[4] = y[3] + coeff.a * (y[3] - y[4]);
  for (let index = 0; index < y.length; index += 1) {
    y[index] = nodeGraphSafeFilterNumber(y[index], runtime, nodeId, state, `ladder filter stage ${index}`);
  }
  const output = coeff.c[0] * y[0] + coeff.c[1] * y[1] + coeff.c[2] * y[2] + coeff.c[3] * y[3] + coeff.c[4] * y[4];
  return nodeGraphSafeFilterNumber(output, runtime, nodeId, state, "ladder filter output");
}


// Registers the offline/render-time dispatch handler for ladderFilter into
// nodeGraphLiveModuleEvaluators (declared in node-graph-live-frame-evaluator.js).
// Extracted from the inline if/else-if branch that used to live in that file.
nodeGraphLiveModuleEvaluators.ladderFilter = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const state = runtime.ladderFilterStates.get(nodeId) || createNodeGraphStereoFilterState(createNodeGraphLadderFilterState);
  runtime.ladderFilterStates.set(nodeId, state);
  const ladderParams = {
    frequency: nodeGraphFrequencyHzFromKnobOrF(
      readNodeGraphLiveEffectiveParam(runtime, node, "frequency", 1000, frame, frames, frameValues),
      hasInput,
      mixInput,
      nodeId,
    ),
    mode: readNodeGraphLiveEffectiveParam(runtime, node, "mode", 1, frame, frames, frameValues),
    resonance: readNodeGraphLiveEffectiveParam(runtime, node, "resonance", 0.2, frame, frames, frameValues),
    stages: readNodeGraphLiveEffectiveParam(runtime, node, "stages", 4, frame, frames, frameValues),
  };
  const ladderMono = mixInput(nodeId);
  return {
    Out: nodeGraphLadderFilterSample(state.mono, ladderMono, ladderParams, sampleRate, runtime, `${nodeId}:mono`),
    Left: nodeGraphLadderFilterSample(state.left, mixInput(nodeId, "Left") + ladderMono, ladderParams, sampleRate, runtime, `${nodeId}:left`),
    Right: nodeGraphLadderFilterSample(state.right, mixInput(nodeId, "Right") + ladderMono, ladderParams, sampleRate, runtime, `${nodeId}:right`),
  };
};
