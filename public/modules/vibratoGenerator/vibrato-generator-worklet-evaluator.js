// Vibrato Generator — native sine-wavetable LFO (VibratoGenerator.hpp port).

NodeLiveAudioProcessor.prototype.createVibratoGeneratorState = function createVibratoGeneratorState() {
  return { nativeHandle: 0 };
};

NodeLiveAudioProcessor.prototype.destroyVibratoGeneratorNativeState = function destroyVibratoGeneratorNativeState(state) {
  if (state?.nativeHandle && this.nativeVibratoGenerator?.soemdsp_vibrato_generator_destroy) {
    this.nativeVibratoGenerator.soemdsp_vibrato_generator_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
};

NodeLiveAudioProcessor.prototype.vibratoGeneratorSample = function vibratoGeneratorSample(state, options = {}) {
  if (
    !this.nativeVibratoGeneratorReady
    || !this.nativeVibratoGenerator?.soemdsp_vibrato_generator_create
    || !this.nativeVibratoGenerator?.soemdsp_vibrato_generator_sample
  ) {
    throw new Error("native Vibrato Generator not ready");
  }
  if (!state.nativeHandle) {
    state.nativeHandle = this.nativeVibratoGenerator.soemdsp_vibrato_generator_create();
  }
  if (!state.nativeHandle) {
    throw new Error("native Vibrato Generator failed to create instance");
  }
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const y = this.nativeVibratoGenerator.soemdsp_vibrato_generator_sample(
    state.nativeHandle,
    Number(options.frequencyHz) || 0,
    sampleRate,
    Number(options.phaseOffset) || 0,
    Number(options.amplitude) || 0,
    Number(options.morph) || 0,
    Number(options.randomFreq) || 0,
    Number(options.randomAmp) || 0,
    Number.isFinite(Number(options.seed)) ? Number(options.seed) : 1,
  );
  return { Out: y, Left: y, Right: y, Mono: y };
};
