NodeLiveAudioProcessor.prototype.createKeypadState = function createKeypadState() {
  return createNodeGraphKeypadState();
};

NodeLiveAudioProcessor.prototype.setKeypadInteraction = function setKeypadInteraction(message = {}) {
  const nodeId = String(message.nodeId || "");
  if (!nodeId) return;
  if (!(this.keypadStates instanceof Map)) this.keypadStates = new Map();
  const state = this.keypadStates.get(nodeId) || this.createKeypadState();
  if (message.down !== undefined) state.down = message.down ? 1 : 0;
  if (message.pointerSlot !== undefined) {
    state.pointerSlot = nodeGraphKeypadWrap(message.pointerSlot);
  }
  this.keypadStates.set(nodeId, state);
};

NodeLiveAudioProcessor.prototype.keypadSample = function keypadSample(state, options) {
  return nodeGraphKeypadSample(state, options);
};
