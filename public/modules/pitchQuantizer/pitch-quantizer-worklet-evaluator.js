NodeLiveAudioProcessor.prototype.createPitchQuantizerState = function createPitchQuantizerState() {
  return { hasOutput: false, lastOutput: 0, nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.pitchQuantizerMaskFromChoice = function pitchQuantizerMaskFromChoice(choiceIndex) {
  const masks = [4095, 2741, 1453, 661, 1193, 1365];
  const index = Math.max(0, Math.min(masks.length - 1, Math.round(Number(choiceIndex) || 0)));
  return masks[index];
};

NodeLiveAudioProcessor.prototype.pitchQuantizerNormalizeMask = function pitchQuantizerNormalizeMask(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) {
    return 2741;
  }
  return n & 0xFFF;
};

NodeLiveAudioProcessor.prototype.pitchQuantizerResolveMask = function pitchQuantizerResolveMask(options = {}) {
  if (options.hasScaleInput) {
    return Math.round(Number(options.scaleInput) || 0) & 0xFFF;
  }
  if (options.scaleMask != null && String(options.scaleMask).trim() !== "") {
    return this.pitchQuantizerNormalizeMask(options.scaleMask);
  }
  return this.pitchQuantizerMaskFromChoice(options.scaleChoice);
};

NodeLiveAudioProcessor.prototype.pitchQuantizerSample = function pitchQuantizerSample(state, options = {}) {
  const pitch = Number(options.pitch) || 0;
  const mask = this.pitchQuantizerResolveMask(options);
  if (
    this.nativePitchQuantizerReady &&
    this.nativePitchQuantizer?.soemdsp_pitch_quantizer_create &&
    this.nativePitchQuantizer?.soemdsp_pitch_quantizer_sample
  ) {
    try {
      if (!state.nativeHandle) {
        state.nativeHandle = this.nativePitchQuantizer.soemdsp_pitch_quantizer_create();
      }
      if (state.nativeHandle) {
        const output = this.nativePitchQuantizer.soemdsp_pitch_quantizer_sample(
          state.nativeHandle,
          pitch,
          mask,
        );
        const safeOutput = this.safeFilterNumber(output, null);
        state.hasOutput = true;
        state.lastOutput = safeOutput;
        return safeOutput;
      }
    } catch (error) {
      this.nativePitchQuantizerReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "pitch_quantizer",
        status: "disabled",
        message: String(error?.message || error || "native Pitch Quantizer failed"),
      });
    }
  }
  // JS fallback (mirrors nodeGraphPitchQuantizerSample).
  if (mask === 0) {
    return state.hasOutput ? state.lastOutput : pitch;
  }
  const semitoneFloat = pitch * 120;
  const rounded = Math.round(semitoneFloat);
  let bestSemitone = rounded;
  let bestDistance = Infinity;
  let found = false;
  for (let radius = 0; radius <= 12 && !found; radius += 1) {
    for (const sign of radius === 0 ? [0] : [-1, 1]) {
      const candidate = rounded + sign * radius;
      const pitchClass = ((candidate % 12) + 12) % 12;
      if (!((mask >> pitchClass) & 1)) continue;
      const distance = Math.abs(candidate - semitoneFloat);
      if (!found || distance < bestDistance) {
        found = true;
        bestDistance = distance;
        bestSemitone = candidate;
      }
    }
  }
  const output = found ? bestSemitone / 120 : pitch;
  state.hasOutput = true;
  state.lastOutput = output;
  return output;
};
