// GainBiasMix: 4-channel utility mixer with per-channel volume/bias
// and 3 bleed sends into output 1.
//
// In1 ──[vol1]──[+bias1]──┬── Out1
// In2 ──[vol2]──[+bias2]──┼── Out2
//          └──[bleed2→1]──┤
// In3 ──[vol3]──[+bias3]──┼── Out3
//          └──[bleed3→1]──┤
// In4 ──[vol4]──[+bias4]──┼── Out4
//          └──[bleed4→1]──┘

NodeLiveAudioProcessor.prototype.createGainBiasMixState = function createGainBiasMixState() {
  return {};
};

NodeLiveAudioProcessor.prototype.gainBiasMixSample = function gainBiasMixSample(state, params, nodeId) {
  const v1 = this.safeFilterNumber(params.volume1, 1) ?? 1;
  const b1 = this.safeFilterNumber(params.bias1, 0) ?? 0;
  const v2 = this.safeFilterNumber(params.volume2, 1) ?? 1;
  const b2 = this.safeFilterNumber(params.bias2, 0) ?? 0;
  const v3 = this.safeFilterNumber(params.volume3, 1) ?? 1;
  const b3 = this.safeFilterNumber(params.bias3, 0) ?? 0;
  const v4 = this.safeFilterNumber(params.volume4, 1) ?? 1;
  const b4 = this.safeFilterNumber(params.bias4, 0) ?? 0;
  const bleed2to1 = this.safeFilterNumber(params.bleed2to1, 0) ?? 0;
  const bleed3to1 = this.safeFilterNumber(params.bleed3to1, 0) ?? 0;
  const bleed4to1 = this.safeFilterNumber(params.bleed4to1, 0) ?? 0;

  const in1 = this.safeFilterNumber(params.in1, 0) ?? 0;
  const in2 = this.safeFilterNumber(params.in2, 0) ?? 0;
  const in3 = this.safeFilterNumber(params.in3, 0) ?? 0;
  const in4 = this.safeFilterNumber(params.in4, 0) ?? 0;

  return {
    "Out1": this.clampValue(in1 * v1 + b1 + in2 * bleed2to1 + in3 * bleed3to1 + in4 * bleed4to1, -10, 10),
    "Out2": this.clampValue(in2 * v2 + b2, -10, 10),
    "Out3": this.clampValue(in3 * v3 + b3, -10, 10),
    "Out4": this.clampValue(in4 * v4 + b4, -10, 10),
  };
};
