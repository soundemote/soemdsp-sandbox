// Realtime worklet evaluator for bugButton, loaded as part of the
// Blob-assembled AudioWorklet module (see nodeGraphLiveWorkletSourceFiles in
// node-graph-live-runtime.js) after core.js defines the class and before
// register.js calls registerProcessor.
//
// The core's dispatch table is built per-instance in the constructor via
// this.buildLiveModuleEvaluators(), so extend by wrapping that builder --
// same effect as the alias assignments the constructor itself makes
// (bipolarKnob -> macroKnob etc.), but without editing core.js for every
// new module. Pulse state lives in this.impulseButtonStates (nodeId-keyed,
// type-agnostic -- the "impulseButtonTrigger" message that feeds it carries
// only a nodeId), so bugButton and impulseButton share the plumbing.
(() => {
  const buildBase = NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators;
  NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators = function buildLiveModuleEvaluatorsWithBugButton() {
    const evaluators = buildBase.call(this);
    evaluators.bugButton = (node, nodeId) => {
      const state = this.impulseButtonStates.get(nodeId) || this.createImpulseButtonState();
      this.impulseButtonStates.set(nodeId, state);
      const pulseSamples = Math.max(0, Number(state.pulseSamples) || 0);
      const amplitude = Math.max(0, Math.min(1, Number(state.amplitude ?? 1)));
      state.pulseSamples = Math.max(0, pulseSamples - 1);
      return { Spike: pulseSamples > 0 ? amplitude : 0 };
    };
    return evaluators;
  };
})();
