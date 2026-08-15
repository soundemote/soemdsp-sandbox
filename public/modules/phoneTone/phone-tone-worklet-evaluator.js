NodeLiveAudioProcessor.prototype.createPhoneToneState = function createPhoneToneState() {
  return typeof createNodeGraphPhoneToneState === "function"
    ? createNodeGraphPhoneToneState()
    : { analog: {}, digital: {} };
};

NodeLiveAudioProcessor.prototype.phoneToneSample = function phoneToneSample(state, options) {
  if (typeof nodeGraphPhoneToneSample !== "function") {
    return {
      "Analog Thru": 0,
      "Digital Thru": 0,
      Df1: 0,
      Df2: 0,
      Out: 0,
      Tone: 0,
      X: 0,
      Z: 0,
      f1: 0,
      f2: 0,
      "ƒ1": 0,
      "ƒ2": 0,
    };
  }
  const next = nodeGraphPhoneToneSample(state, options);
  if (typeof this.safeFilterNumber !== "function") {
    return next;
  }
  const num = (value) => this.safeFilterNumber(value, null) ?? 0;
  return {
    "Analog Thru": num(next["Analog Thru"]),
    "Digital Thru": num(next["Digital Thru"]),
    Df1: num(next.Df1),
    Df2: num(next.Df2),
    Out: num(next.Out),
    Tone: num(next.Tone),
    X: num(next.X),
    Z: num(next.Z),
    f1: num(next.f1),
    f2: num(next.f2),
    "ƒ1": num(next["ƒ1"]),
    "ƒ2": num(next["ƒ2"]),
  };
};
