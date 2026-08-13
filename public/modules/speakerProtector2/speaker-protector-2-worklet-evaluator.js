// Speaker Protector 2.0 — worklet adapter (pure math: speaker-protector-2-math.js).

NodeLiveAudioProcessor.prototype.createSpeakerProtector2State = function createSpeakerProtector2State(rate) {
  if (typeof createNodeGraphSpeakerProtector2State === "function") {
    return createNodeGraphSpeakerProtector2State(rate || sampleRate);
  }
  return { mode: "idle", gain: 1, holdSamples: 0, hpIn: 0, hpOut: 0, sampleRate: rate || sampleRate };
};

NodeLiveAudioProcessor.prototype.speakerProtector2Frame = function speakerProtector2Frame(
  state,
  mono,
  left,
  right,
  rate,
  options,
) {
  if (typeof nodeGraphSpeakerProtector2Frame === "function") {
    return nodeGraphSpeakerProtector2Frame(state, mono, left, right, rate, options);
  }
  const m = Number(mono) || 0;
  return { Out: m, Left: (Number(left) || 0) + m, Right: (Number(right) || 0) + m, gain: 1, engaged: false };
};
