// Sinc oscillator (offline/render-time lane). Kernel maths and the
// anti-aliasing rationale live in node-graph-stdlib/node-graph-sinc-kernel.js;
// keep this body in step with sinc-worklet-evaluator.js.
nodeGraphLiveModuleEvaluators.sinc = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const baseFreq = Math.max(0, read("freq", 100));
  const phaseShift = read("phase", 0);
  const lobes = Math.max(1, Math.round(read("lobes", 4)));
  const bandLimited = Math.round(read("bandLimit", 1)) !== 0;

  const pitchReferenceAudio = normalizeNodeGraphPatchAudio(nodeGraphMvp.patch.audio);
  const referenceVoltage = pitchReferenceAudio.pitchReferenceMidiNote / 120;
  const pitchInput = hasInput(nodeId, "0.1V/Oct")
    ? clampNodeSliderValue(nodeGraphSafeFilterNumber(
      mixInput(nodeId, "0.1V/Oct"),
      runtime,
      nodeId,
      null,
      "Sinc 0.1v input",
    ), -1, 1)
    : referenceVoltage;
  const pitched = Math.max(0, baseFreq * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
  const fHz = typeof nodeGraphReadFInputHz === "function"
    ? nodeGraphReadFInputHz(mixInput, hasInput, nodeId)
    : null;
  const freq = typeof nodeGraphResolveFrequencyHz === "function"
    ? nodeGraphResolveFrequencyHz(pitched, fHz)
    : pitched;
  const rate = sampleRate || 44100;
  const step = freq / rate;

  let phase = (runtime._sincPhases ??= new Map()).get(nodeId) ?? 0;
  phase += step;
  if (phase >= 1 || phase < 0) phase -= Math.floor(phase);
  runtime._sincPhases.set(nodeId, phase);

  let shifted = (phase + phaseShift) % 1;
  if (shifted < 0) shifted += 1;
  const value = bandLimited
    ? nodeGraphBandLimitedSincSample(shifted, lobes, freq, rate)
    : nodeGraphIdealSincSample(shifted, lobes);
  return { Out: Math.max(-1, Math.min(1, value)) };
};
