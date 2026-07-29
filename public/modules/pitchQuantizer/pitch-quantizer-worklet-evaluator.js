NodeLiveAudioProcessor.prototype.createPitchQuantizerState = function createPitchQuantizerState() {
    return { hasOutput: false, lastOutput: 0, nativeHandle: 0 };
  };

NodeLiveAudioProcessor.prototype.pitchQuantizerMaskFromChoice = function pitchQuantizerMaskFromChoice(choiceIndex) {
    const masks = [4095, 2741, 1453, 661, 1193, 1365];
    const index = Math.max(0, Math.min(masks.length - 1, Math.round(Number(choiceIndex) || 0)));
    return masks[index];
  };

NodeLiveAudioProcessor.prototype.pitchQuantizerSample = function pitchQuantizerSample(state, options = {}) {
    const pitch = Number(options.pitch) || 0;
    const mask = options.hasScaleInput
      ? Math.round(Number(options.scaleInput) || 0) & 0xFFF
      : this.pitchQuantizerMaskFromChoice(options.scaleChoice);
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
    return 0;
  };

