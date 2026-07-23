// Realtime worklet evaluator for xyPad, loaded as part of the
// Blob-assembled AudioWorklet module (see nodeGraphLiveWorkletSourceFiles
// in node-graph-live-runtime.js). Registers by wrapping
// buildLiveModuleEvaluators, same as bugButton -- no core.js edit needed.
// X/Y/Gate read the module's parameters (already synced + smoothed by the
// normal parameter path); Spike shares this.impulseButtonStates, which is
// nodeId-keyed and fed by the type-agnostic "impulseButtonTrigger" message.
(() => {
  const quantize = (value, quantizeAmount, phase) => {
    const q = Math.max(0, Math.min(1, Number(quantizeAmount) || 0));
    const divisions = q <= 0 ? 1 : 1 + Math.max(1, Math.round(q * 16));
    if (divisions <= 1) {
      return Math.max(0, Math.min(1, value));
    }
    const step = 1 / divisions;
    const offset = Math.max(0, Math.min(1, Number(phase) || 0)) * step;
    return Math.max(0, Math.min(1, Math.round((value - offset) / step) * step + offset));
  };
  const buildBase = NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators;
  NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators = function buildLiveModuleEvaluatorsWithXyPad() {
    const evaluators = buildBase.call(this);
    evaluators.xyPad = (node, nodeId, frame, frames, frameValues, mixInput) => {
      const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
      const state = this.impulseButtonStates.get(nodeId) || this.createImpulseButtonState();
      this.impulseButtonStates.set(nodeId, state);
      const pulseSamples = Math.max(0, Number(state.pulseSamples) || 0);
      state.pulseSamples = Math.max(0, pulseSamples - 1);
      // X / Y are CV offsets: added to the pad position, clamped
      // inside the quantizer.
      return {
        X: quantize(read("x", 0.5) + mixInput(nodeId, "X"), read("xQuantize", 0), read("xPhase", 0)),
        Y: quantize(read("y", 0.5) + mixInput(nodeId, "Y"), read("yQuantize", 0), read("yPhase", 0)),
        Gate: read("gate", 0) > 0.5 ? 1 : 0,
        Spike: pulseSamples > 0 ? 1 : 0,
      };
    };
    return evaluators;
  };
})();
