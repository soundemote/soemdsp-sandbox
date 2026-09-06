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
    Number(options.wowSpeed) || 0,
    sampleRate,
    Number(options.phaseOffset) || 0,
    Number(options.wowAmp) || 0,
    Number(options.flutterFrequency) || 0,
    Number(options.flutterJitter) || 0,
    Number(options.flutterAmp) || 0,
    Number.isFinite(Number(options.seed)) ? Number(options.seed) : 1,
    Number(options.amplitude) || 0,
  );
  return { Out: y, Left: y, Right: y, Mono: y };
};
