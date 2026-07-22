nodeGraphLiveModuleEvaluators.sinc = ({ runtime, node, nodeId, frame, frames, frameValues, mixInput, hasInput, sampleRate }) => {
  const read = (key, fallback) => readNodeGraphLiveEffectiveParam(runtime, node, key, fallback, frame, frames, frameValues);
  const freq = Math.max(0, read("freq", 100));
  const phaseShift = read("phase", 0);
  const step = freq / (sampleRate || 44100);

  let phase = (runtime._sincPhases ??= new Map()).get(nodeId) ?? 0;
  phase += step;
  if (phase >= 1) phase -= Math.floor(phase);
  runtime._sincPhases.set(nodeId, phase);

  const x = (phase + phaseShift - 0.5) * Math.PI;
  const value = Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x;
  return { Out: Math.max(-1, Math.min(1, value)) };
};
