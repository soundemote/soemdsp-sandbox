// Wow And Flutter — native sine wow + fixed-steps flutter (WowAndFlutter.hpp).

NodeLiveAudioProcessor.prototype.createWowAndFlutterState = function createWowAndFlutterState() {
  return { nativeHandle: 0, lastReset: 0 };
};

NodeLiveAudioProcessor.prototype.destroyWowAndFlutterNativeState = function destroyWowAndFlutterNativeState(state) {
  if (state?.nativeHandle && this.nativeWowAndFlutter?.soemdsp_wow_and_flutter_destroy) {
    this.nativeWowAndFlutter.soemdsp_wow_and_flutter_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }
};

NodeLiveAudioProcessor.prototype.wowAndFlutterSample = function wowAndFlutterSample(state, options = {}) {
  if (
    !this.nativeWowAndFlutterReady
    || !this.nativeWowAndFlutter?.soemdsp_wow_and_flutter_create
    || !this.nativeWowAndFlutter?.soemdsp_wow_and_flutter_sample
  ) {
    throw new Error("native Wow And Flutter not ready");
  }
  if (!state.nativeHandle) {
    state.nativeHandle = this.nativeWowAndFlutter.soemdsp_wow_and_flutter_create();
  }
  if (!state.nativeHandle) {
    throw new Error("native Wow And Flutter failed to create instance");
  }
  const sampleRate = Number(options.sampleRate) > 1 ? Number(options.sampleRate) : 48000;
  const y = this.nativeWowAndFlutter.soemdsp_wow_and_flutter_sample(
    state.nativeHandle,
    nodeGraphFiniteNumber(options.wowSpeed),
    sampleRate,
    nodeGraphFiniteNumber(options.phaseOffset),
    nodeGraphFiniteNumber(options.wowAmp),
    nodeGraphFiniteNumber(options.flutterFrequency),
    nodeGraphFiniteNumber(options.flutterJitter),
    nodeGraphFiniteNumber(options.flutterAmp),
    Number.isFinite(Number(options.seed)) ? Number(options.seed) : 1,
    nodeGraphFiniteNumber(options.amplitude),
  );
  return { Out: y, Left: y, Right: y, Mono: y };
};
