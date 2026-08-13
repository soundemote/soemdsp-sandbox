// KickEnvelope — worklet. Envelope only.

NodeLiveAudioProcessor.prototype.createKickEnvelopeState = function createKickEnvelopeState() {
  if (typeof createNodeGraphKickEnvelopeState === "function") {
    return createNodeGraphKickEnvelopeState();
  }
  return { t: 0, lastTrig: 0, active: 0, a: 0 };
};

NodeLiveAudioProcessor.prototype.kickEnvelopeSample = function kickEnvelopeSample(
  state,
  trigger,
  low,
  high,
  sharpness,
  rate = sampleRate,
  curve = 0,
  speed = 0.2,
  amplitude = 1,
) {
  if (typeof nodeGraphKickEnvelopeSample === "function") {
    const out = nodeGraphKickEnvelopeSample(
      state, trigger, low, high, sharpness, rate, curve, speed, amplitude,
    );
    return {
      A: this.safeFilterNumber(out?.A, null) ?? 0,
      U: this.safeFilterNumber(out?.U, null) ?? 0,
      X: this.safeFilterNumber(out?.X, null) ?? 0,
      Y: this.safeFilterNumber(out?.Y, null) ?? 0,
    };
  }
  return { A: 0, U: 0, X: 0, Y: 0 };
};
