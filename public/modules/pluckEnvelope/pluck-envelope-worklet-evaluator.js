NodeLiveAudioProcessor.prototype.createPluckEnvelopeState = function createPluckEnvelopeState() {
  return {
    autoReleasePhasor: 0,
    currentValue: 0,
    decayIncrement: 0,
    lastRelease: 0,
    lastTrigger: 0,
    phasor: 0,
    releaseIncrement: 0,
    secondsPassed: 0,
    state: "off",
    nativeHandle: 0,
  };
};

NodeLiveAudioProcessor.prototype.pluckEnvelopeSample = function pluckEnvelopeSample(
  state,
  trigger,
  release,
  params,
  rate = sampleRate,
) {
  if (
    this.nativePluckEnvelopeReady &&
    this.nativePluckEnvelope?.soemdsp_pluck_envelope_create &&
    this.nativePluckEnvelope?.soemdsp_pluck_envelope_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativePluckEnvelope.soemdsp_pluck_envelope_create();
      }
      if (state.nativeHandle) {
        const safeRate = Number(rate) > 1 ? Number(rate) : sampleRate;
        // SoEm names with legacy aliases for old patches.
        const p = params || {};
        const attack = Number(p.attack ?? p.attackFeedback) || 0;
        const decaySlopeTop = Number(p.decaySlopeTop ?? p.decayModStart);
        const decaySlopeMid = Number(p.decaySlopeMid ?? p.decay);
        const decaySlopeBottom = Number(p.decaySlopeBottom ?? p.decayModEnd);
        const sustain = Number(p.sustain ?? p.endingDecay);
        const releaseAmt = Number(p.release ?? p.releaseFeedback);
        const envelopeCurve = Number(p.envelopeCurve ?? p.decayModCurve);
        const envelopeDamping = Number(p.envelopeDamping ?? p.decayModFrequency);
        const out = this.nativePluckEnvelope.soemdsp_pluck_envelope_sample(
          state.nativeHandle,
          Number(trigger) || 0,
          Number(release) || 0,
          this.clampValue(Number(p.velocitySensitivity) || 0, 0, 1),
          Math.max(0, attack),
          this.clampValue(Number.isFinite(decaySlopeTop) ? decaySlopeTop : 0.9, 0.001, 1.8),
          this.clampValue(Number.isFinite(decaySlopeMid) ? decaySlopeMid : 0.7, 0.1, 1),
          this.clampValue(Number.isFinite(decaySlopeBottom) ? decaySlopeBottom : 4.8, 0.01, 6),
          this.clampValue(Number.isFinite(sustain) ? sustain : 1.2, 0, 1.4),
          this.clampValue(Number.isFinite(releaseAmt) ? releaseAmt : 0.86, 0, 1),
          Math.max(0, Number(p.autoReleaseTime) || 0),
          this.clampValue(Number.isFinite(envelopeCurve) ? envelopeCurve : -0.5, -1, 1),
          this.clampValue(Number.isFinite(envelopeDamping) ? envelopeDamping : 15, 0, 100),
          this.clampValue(Number(p.velocity) || 0, 0, 1),
          this.clampValue(Number(p.level) || 0, 0, 1),
          safeRate,
        );
        return this.safeFilterNumber(out, null);
      }
    } catch (error) {
      this.nativePluckEnvelopeReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "pluck_envelope",
        status: "disabled",
        message: String(error?.message || error || "native Pluck Envelope failed"),
      });
    }
  }
  return 0;
};
