// Attack Decay — worklet.

NodeLiveAudioProcessor.prototype.createAttackDecayState = function createAttackDecayState() {
  if (typeof createNodeGraphAttackDecayState === "function") {
    return createNodeGraphAttackDecayState();
  }
  return { raw: 0 };
};

NodeLiveAudioProcessor.prototype.attackDecaySample = function attackDecaySample(
  state,
  gate,
  params,
  rate = sampleRate,
) {
  if (typeof nodeGraphAttackDecaySample === "function") {
    return this.safeFilterNumber(
      nodeGraphAttackDecaySample(state, gate, params, rate),
      null,
    );
  }
  return 0;
};
