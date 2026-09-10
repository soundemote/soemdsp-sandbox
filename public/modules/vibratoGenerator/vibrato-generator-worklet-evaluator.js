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
    nodeGraphFiniteNumber(options.frequencyHz),
    sampleRate,
    nodeGraphFiniteNumber(options.phaseOffset),
    nodeGraphFiniteNumber(options.amplitude),
    nodeGraphFiniteNumber(options.morph),
    nodeGraphFiniteNumber(options.randomFreq),
    nodeGraphFiniteNumber(options.randomAmp),
    Number.isFinite(Number(options.seed)) ? Number(options.seed) : 1,
  );
  return { Out: y, Left: y, Right: y, Mono: y };
};
