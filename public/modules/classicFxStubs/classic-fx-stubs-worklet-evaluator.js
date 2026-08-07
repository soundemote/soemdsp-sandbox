// Under-construction classic FX / spectral placeholders — dry passthrough (worklet).

NodeLiveAudioProcessor.prototype.classicFxStubPassthrough = function classicFxStubPassthrough(input) {
  return this.safeFilterNumber(Number(input) || 0, null);
};
