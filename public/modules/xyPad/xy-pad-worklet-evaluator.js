// Realtime worklet evaluator for xyPad.
// UI writes x/y targets; shared param smoother chases once.
// Quantize Input mode 1 snaps after that chase on X/Y outs only.
(() => {
  const quantizeUnit = (value, quantizeAmount) => {
    const q = Math.max(0, Math.min(1, Number(quantizeAmount) || 0));
    const divisions = q <= 0 ? 1 : 1 + Math.max(1, Math.round(q * 16));
    const v = Number(value);
    const unit = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
    if (divisions <= 1) {
      return unit;
    }
    const step = 1 / divisions;
    return Math.max(0, Math.min(1, Math.round(unit / step) * step));
  };
  const unitToBipolar = (unit) => {
    const u = Number(unit);
    return Number.isFinite(u) ? u * 2 - 1 : 0;
  };
  const quantizeMode = (raw) => Math.max(0, Math.min(2, Math.round(Number(raw) || 0)));

  const buildBase = NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators;
  NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators = function buildLiveModuleEvaluatorsWithXyPad() {
    const evaluators = buildBase.call(this);
    evaluators.xyPad = (node, nodeId, frame, frames, frameValues, mixInput) => {
      const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
      const states = this.impulseButtonStates instanceof Map
        ? this.impulseButtonStates
        : new Map();
      this.impulseButtonStates = states;
      const state = states.get(nodeId) || (
        typeof this.createImpulseButtonState === "function"
          ? this.createImpulseButtonState()
          : { amplitude: 1, pulseSamples: 0 }
      );
      states.set(nodeId, state);
      const pulseSamples = Math.max(0, Number(state.pulseSamples) || 0);
      state.pulseSamples = Math.max(0, pulseSamples - 1);

      let unitX = read("x", read("xPhase", 0.5));
      let unitY = read("y", read("yPhase", 0.5));
      if (quantizeMode(read("quantizeInput", 0)) === 1) {
        unitX = quantizeUnit(unitX, read("xQuantize", 0));
        unitY = quantizeUnit(unitY, read("yQuantize", 0));
      } else {
        unitX = Math.max(0, Math.min(1, Number(unitX) || 0.5));
        unitY = Math.max(0, Math.min(1, Number(unitY) || 0.5));
      }

      return {
        X: unitToBipolar(unitX) + (Number(mixInput(nodeId, "X")) || 0),
        Y: unitToBipolar(unitY) + (Number(mixInput(nodeId, "Y")) || 0),
        Gate: read("gate", 0) > 0.5 ? 1 : 0,
        Spike: pulseSamples > 0 ? (Number(state.amplitude) || 1) : 0,
      };
    };
    return evaluators;
  };
})();
