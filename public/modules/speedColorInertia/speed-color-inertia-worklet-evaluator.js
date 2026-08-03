// SpeedColorInertia — worklet. Pure math: speed-color-inertia-math.js (same Blob).

NodeLiveAudioProcessor.prototype.createSpeedColorInertiaState = function createSpeedColorInertiaState() {
  return createNodeGraphSpeedColorInertiaState();
};

NodeLiveAudioProcessor.prototype.speedColorInertiaSample = function speedColorInertiaSample(
  state,
  input,
  gain,
  attack,
  release,
) {
  const out = nodeGraphSpeedColorInertiaSample(state, this.safeFilterNumber(input, state), {
    gain,
    attack,
    release,
  });
  return {
    Raw: this.safeFilterNumber(out.Raw, state),
    Speed: this.safeFilterNumber(out.Speed, state),
    Inertia: this.safeFilterNumber(out.Inertia, state),
  };
};
