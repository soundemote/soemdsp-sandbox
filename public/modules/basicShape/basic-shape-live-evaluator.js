// BasicShape (modulator): naive sine / tri / saw / square / ramp / trisaw /
// center-square. No anti-aliasing. PWM (`shape`) drives Square, Trisaw, and
// Center Square (and Wave when one of those is selected).

globalThis.nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators || {};
var nodeGraphLiveModuleEvaluators = globalThis.nodeGraphLiveModuleEvaluators;

function nodeGraphBasicShapeWrap01(phase01) {
  const p = Number(phase01) || 0;
  return p - Math.floor(p);
}

/**
 * Center Square: bipolar pulse centered at mid-cycle.
 * Morph = width 0…1. Edges grow left and right from the center (not dual
 * top/bottom steps). Width 0 → always low (−1); 1 → always high (+1).
 */
function nodeGraphBasicShapeCenterSquare(cycle, morph) {
  const width = Number.isFinite(morph) ? Math.max(0, Math.min(1, morph)) : 0.5;
  if (width <= 0) {
    return -1;
  }
  if (width >= 1) {
    return 1;
  }
  const c = nodeGraphBasicShapeWrap01(cycle);
  const half = width * 0.5;
  const lo = 0.5 - half;
  const hi = 0.5 + half;
  return (c >= lo && c < hi) ? 1 : -1;
}

/** Bipolar trisaw (soemdsp::oscillator::bipolar::trisaw). */
function nodeGraphBasicShapeTrisaw(cycle, warp) {
  const w = Number.isFinite(warp) ? Math.max(1e-4, Math.min(1 - 1e-4, warp)) : 0.5;
  if (cycle < w) return 2 * (cycle / w) - 1;
  return 2 * ((1 - cycle) / (1 - w)) - 1;
}

function nodeGraphBasicShapeNaiveWaves(phase01, pulseWidth) {
  const cycle = nodeGraphBasicShapeWrap01(phase01);
  const sine = Math.sin(cycle * Math.PI * 2);
  const tri = 1 - 4 * Math.abs(cycle - 0.5);
  const saw = 1 - cycle * 2;
  const ramp = cycle * 2 - 1;
  const pw = Number(pulseWidth);
  const width = Number.isFinite(pw) ? Math.max(0, Math.min(1, pw)) : 0.5;
  const square = cycle < width ? 1 : -1;
  const trisaw = nodeGraphBasicShapeTrisaw(cycle, width);
  const centerSquare = nodeGraphBasicShapeCenterSquare(cycle, width);
  return { sine, tri, saw, ramp, square, trisaw, centerSquare };
}

// Order: 0 Sine, 1 Tri, 2 Saw, 3 Ramp, 4 Trisaw, 5 Square, 6 CenterSquare
function nodeGraphBasicShapeSelect(waves, waveform) {
  const i = Math.max(0, Math.min(6, Math.round(Number(waveform) || 0)));
  if (i === 1) return waves.tri;
  if (i === 2) return waves.saw;
  if (i === 3) return waves.ramp;
  if (i === 4) return waves.trisaw;
  if (i === 5) return waves.square;
  if (i === 6) return waves.centerSquare;
  return waves.sine;
}

function nodeGraphBasicShapePolarity(x, polarity) {
  const uni = Math.round(Number(polarity) || 0) >= 1;
  return uni ? (Number(x) + 1) * 0.5 : Number(x);
}

function nodeGraphBasicShapePitchAndPhase({
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) {
  if (typeof nodeGraphEllipsoidLivePitchAndPhase === "function") {
    return nodeGraphEllipsoidLivePitchAndPhase({
      runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
      defaultFrequency: 1,
    });
  }
  const resetState = runtime.oscResetStates.get(nodeId) || createNodeGraphOscResetState();
  runtime.oscResetStates.set(nodeId, resetState);
  const resetValue = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Reset"),
    runtime,
    nodeId,
    resetState,
    "basicShape reset",
  );
  const resetEdge = resetState.lastReset <= 0 && resetValue > 0;
  resetState.lastReset = resetValue;
  const phase = resetEdge ? 0 : runtime.phases.get(nodeId) || 0;
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(
    runtime, node, key, fallback, frame, frames, frameValues,
  );
  const phaseOffset = Number(read("phase", 0)) || 0;
  const frequency = read("frequency", 1);
  const referenceVoltage = typeof normalizeNodeGraphPatchAudio === "function"
    ? normalizeNodeGraphPatchAudio(nodeGraphMvp?.patch?.audio).pitchReferenceMidiNote / 120
    : 0;
  const hasPitch = typeof hasInput === "function" ? hasInput(nodeId, "0.1V/Oct") : false;
  const pitchCv = hasPitch
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "basicShape 0.1v/oct input",
    ), -1, 1)
    : referenceVoltage;
  const pitchedFrequency = typeof nodeGraphParamResolveOscPitchHz === "function"
    ? nodeGraphParamResolveOscPitchHz({
      baseHz: frequency,
      hasPitchCv: hasPitch,
      pitchCv,
      referenceVoltage,
      hasInput,
      mixInput,
      nodeId,
    })
    : frequency;
  const incrementInput = nodeGraphSafeFilterNumber(
    mixInput(nodeId, "Increment"),
    runtime,
    nodeId,
    null,
    "basicShape increment input",
  );
  const safeRate = Math.max(1, Number(sampleRate) || 44100);
  const motion = Math.max(0, Math.min(3, Math.round(Number(read("motion", 1)) || 0)));
  const clockWise = motion === 0 || motion === 2;
  const useSimTime = motion >= 2;
  const dir = clockWise ? -1 : 1;
  const phaseIncrement = useSimTime
    ? 0
    : (dir * pitchedFrequency / safeRate) + incrementInput;
  return {
    read,
    phase,
    phaseOffset,
    phaseIncrement,
    pitchedFrequency,
    sampleRate: safeRate,
    useSimTime,
    dir,
    incrementInput,
  };
}

nodeGraphLiveModuleEvaluators.basicShape = ({
  runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
}) => {
  const ctx = nodeGraphBasicShapePitchAndPhase({
    runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate,
  });
  const waveform = ctx.read("waveform", 0);
  const pulseWidth = ctx.read("morph", 0.5);
  const level = ctx.read("amplitude", 1);
  let samplePhase;
  if (ctx.useSimTime) {
    const simSamples = Math.max(0, Number(runtime.absoluteFrame) || Number(frame) || 0);
    samplePhase = ctx.dir
      * ((ctx.pitchedFrequency / ctx.sampleRate) + ctx.incrementInput)
      * simSamples
      + ctx.phaseOffset;
  } else {
    samplePhase = ctx.phase + ctx.phaseOffset;
  }
  samplePhase -= Math.floor(samplePhase);
  const waves = nodeGraphBasicShapeNaiveWaves(samplePhase, pulseWidth);
  const polarity = ctx.read("polarity", 0);
  const pol = (x) => nodeGraphBasicShapePolarity(x, polarity);
  const selected = pol(nodeGraphBasicShapeSelect(waves, waveform) * level);
  let nextPhase = ctx.phase + ctx.phaseIncrement;
  nextPhase -= Math.floor(nextPhase);
  runtime.phases.set(nodeId, nextPhase);
  return {
    Out: selected,
    Sine: pol(waves.sine * level),
    Tri: pol(waves.tri * level),
    Saw: pol(waves.saw * level),
    Ramp: pol(waves.ramp * level),
    Trisaw: pol(waves.trisaw * level),
    Square: pol(waves.square * level),
    "Center Square": pol(waves.centerSquare * level),
    Wave: selected,
    "Wave Out": selected,
    __Phase: samplePhase,
  };
};
