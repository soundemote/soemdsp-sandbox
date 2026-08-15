NodeLiveAudioProcessor.prototype.createKeypadState = function createKeypadState() {
  return createNodeGraphKeypadState();
};

NodeLiveAudioProcessor.prototype.setKeypadInteraction = function setKeypadInteraction(message = {}) {
  const nodeId = String(message.nodeId || "");
  if (!nodeId) return;
  if (!(this.keypadStates instanceof Map)) this.keypadStates = new Map();
  const state = this.keypadStates.get(nodeId) || this.createKeypadState();
  state.needsRestore = false;
  if (message.down !== undefined) state.down = message.down ? 1 : 0;
  if (message.latched !== undefined) state.latched = message.latched ? 1 : 0;
  if (Object.prototype.hasOwnProperty.call(message, "pointerSlot")) {
    state.pointerSlot = message.pointerSlot == null || message.pointerSlot === ""
      ? null
      : nodeGraphKeypadWrap(message.pointerSlot);
  }
  this.keypadStates.set(nodeId, state);
};

NodeLiveAudioProcessor.prototype.keypadSample = function keypadSample(state, options) {
  return nodeGraphKeypadSample(state, options);
};
