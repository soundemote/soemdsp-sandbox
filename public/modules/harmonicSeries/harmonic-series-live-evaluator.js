// Registers the offline/render-time dispatch handler for harmonicSeries.

nodeGraphLiveModuleEvaluators.harmonicSeries = ({
  runtime,
  node,
  nodeId,
  frame,
  frames,
  frameValues,
  mixInput,
  hasInput,
}) => {
  const harmonic = readNodeGraphLiveEffectiveParam(
    runtime, node, "harmonic", 0, frame, frames, frameValues,
  );
  const offset = readNodeGraphLiveEffectiveParam(
    runtime, node, "offset", 0, frame, frames, frameValues,
  );
  const knobHz = readNodeGraphLiveEffectiveParam(
    runtime, node, "frequency", 100, frame, frames, frameValues,
  );
  const baseHz = nodeGraphFrequencyHzFromKnobOrF(knobHz, hasInput, mixInput, nodeId);
  const out = nodeGraphHarmonicSeriesSample(baseHz, harmonic, offset);
  return {
    f: nodeGraphSafeFilterNumber(out.f, runtime, nodeId, null, "harmonic series f"),
    f0: nodeGraphSafeFilterNumber(out.f0, runtime, nodeId, null, "harmonic series f0"),
  };
};
