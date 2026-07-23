// Realtime worklet evaluator for Bug Button's dedicated interaction state.
(() => {
  const buildBase = NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators;
  NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators = function buildLiveModuleEvaluatorsWithBugButton() {
    const evaluators = buildBase.call(this);
    evaluators.bugButton = (node, nodeId, frame, frames, frameValues, mixInput) => {
      const state = this.bugButtonStates.get(nodeId) || this.createBugButtonState();
      this.bugButtonStates.set(nodeId, state);
      const downPulseSamples = Math.max(0, Number(state.downPulseSamples) || 0);
      const upPulseSamples = Math.max(0, Number(state.upPulseSamples) || 0);
      state.downPulseSamples = Math.max(0, downPulseSamples - 1);
      state.upPulseSamples = Math.max(0, upPulseSamples - 1);
      const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
      return {
        "Mouse Down": downPulseSamples > 0 ? 1 : 0,
        "Mouse Up": upPulseSamples > 0 ? 1 : 0,
        "Dn/Up": state.down ? 1 : 0,
        "Mouse Hover": state.hover ? 1 : 0,
        X: Math.max(-1, Math.min(1, Number(state.x) || 0)),
        Y: Math.max(-1, Math.min(1, Number(state.y) || 0)),
        __VisualSize: Math.max(0, Math.min(2, read("size", 1) + mixInput(nodeId, "Size"))),
        __VisualX: Math.max(-1, Math.min(1, read("xPosition", 0) + mixInput(nodeId, "X"))),
        __VisualY: Math.max(-1, Math.min(1, read("yPosition", 0) + mixInput(nodeId, "Y"))),
        __VisualOpacity: Math.max(0, Math.min(1, read("opacity", 1) + mixInput(nodeId, "Opacity"))),
      };
    };
    return evaluators;
  };
})();
