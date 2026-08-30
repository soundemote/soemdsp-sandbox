// Worklet: Additive Generator — Magenta Graph OUT once per quantum.

NodeLiveAudioProcessor.prototype.ensureAdditiveGraphBus = function ensureAdditiveGraphBus() {
  if (!this.additiveGraphBus) this.additiveGraphBus = new Map();
  if (!this.additiveEffectStates) this.additiveEffectStates = new Map();
  if (!this.additiveOutStates) this.additiveOutStates = new Map();
  if (!this.additiveGraphPublish) this.additiveGraphPublish = new Map();
};

NodeLiveAudioProcessor.prototype.additiveGraphWrite = function additiveGraphWrite(nodeId, graph) {
  this.ensureAdditiveGraphBus();
  this.additiveGraphBus.set(String(nodeId), graph);
  this.additiveGraphPublish.set(String(nodeId), graph);
};

NodeLiveAudioProcessor.prototype.additiveGraphReadWired = function additiveGraphReadWired(nodeId, portName) {
  this.ensureAdditiveGraphBus();
  const key = this.inputKey ? this.inputKey(nodeId, portName) : `${nodeId}::${portName}`;
  // Prefer data-plane connection map if present; else scan graphInputConnections-style maps.
  const connections = this.dataInputConnections?.get?.(key)
    || this.graphInputConnections?.get?.(this.graphInputKey?.(nodeId, portName))
    || this.inputConnections?.get?.(key);
  if (!connections || !connections.length) {
    // Fallback: module-scope style connections list on plan.
    const fromPlan = this.findAdditiveGraphSourceNodeId?.(nodeId, portName);
    if (fromPlan) return this.additiveGraphBus.get(String(fromPlan)) || null;
    return null;
  }
  const src = connections[0];
  const srcId = src?.sourceNode || src?.from || src?.nodeId;
  if (!srcId) return null;
  return this.additiveGraphBus.get(String(srcId)) || null;
};

NodeLiveAudioProcessor.prototype.findAdditiveGraphSourceNodeId = function findAdditiveGraphSourceNodeId(nodeId, portName) {
  const wires = this.plan?.wires || this.wires || [];
  for (let i = 0; i < wires.length; i += 1) {
    const w = wires[i];
    if (!w) continue;
    const toNode = w.toNode || w.targetNode || w.dstNode;
    const toPort = w.toPort || w.targetPort || w.dstPort;
    if (String(toNode) === String(nodeId) && String(toPort) === String(portName)) {
      return w.fromNode || w.sourceNode || w.srcNode;
    }
  }
  // Also check connections array shapes used by efficient product.
  const conns = this.plan?.connections || [];
  for (let i = 0; i < conns.length; i += 1) {
    const c = conns[i];
    if (!c) continue;
    if (String(c.to || c.target) === String(nodeId) && String(c.toPort || c.targetPort) === String(portName)) {
      return c.from || c.source;
    }
  }
  return null;
};

NodeLiveAudioProcessor.prototype.additiveGeneratorWorkletEvaluate = function additiveGeneratorWorkletEvaluate(
  node, nodeId, frame, frames
) {
  // Once per quantum (first frame of the block).
  if (frame !== 0) return;
  const p = node?.parameters || {};
  const graph = additiveGraphBuildFromWaveform(
    Number(p.waveform) || 0,
    Number(p.morph) || 0.5,
    Number(p.harmonics) || 32
  );
  this.additiveGraphWrite(nodeId, graph);
};

NodeLiveAudioProcessor.prototype.additiveGeneratorWorkletEvaluateBlock = function additiveGeneratorWorkletEvaluateBlock(
  node, nodeId, frames
) {
  const p = node?.parameters || {};
  const graph = additiveGraphBuildFromWaveform(
    Number(p.waveform) || 0,
    Number(p.morph) || 0.5,
    Number(p.harmonics) || 32
  );
  this.additiveGraphWrite(nodeId, graph);
};
