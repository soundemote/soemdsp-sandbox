// Worklet: Additive Generator — Yellow Graph OUT once per quantum.
// Integer Harmonics only (no fractional trailing). Bubble Cutoff owns that.
// Harmonics slot-count change stamps phaseReset so Out clears phaseAcc.

NodeLiveAudioProcessor.prototype.ensureAdditiveGraphBus = function ensureAdditiveGraphBus() {
  if (!this.additiveGraphBus) this.additiveGraphBus = new Map();
  if (!this.additiveNoisyFreqStates) this.additiveNoisyFreqStates = new Map();
  if (!this.additiveNoisyPhaseStates) this.additiveNoisyPhaseStates = new Map();
  if (!this.additiveNoisyPanStates) this.additiveNoisyPanStates = new Map();
  if (!this.additiveNoisyAmpStates) this.additiveNoisyAmpStates = new Map();
  if (!this.additiveOutStates) this.additiveOutStates = new Map();
  if (!this.additiveFrequencySkewStates) this.additiveFrequencySkewStates = new Map();
  if (!this.additiveQuantizeFreqStates) this.additiveQuantizeFreqStates = new Map();
  if (!this.additiveQuantizePhaseStates) this.additiveQuantizePhaseStates = new Map();
  if (!this.additiveGraphPublish) this.additiveGraphPublish = new Map();
  if (!this.additiveGeneratorStates) this.additiveGeneratorStates = new Map();
};

NodeLiveAudioProcessor.prototype.additiveGraphWrite = function additiveGraphWrite(nodeId, graph) {
  this.ensureAdditiveGraphBus();
  this.additiveGraphBus.set(String(nodeId), graph);
  this.additiveGraphPublish.set(String(nodeId), graph);
};

NodeLiveAudioProcessor.prototype.additiveGraphReadWired = function additiveGraphReadWired(nodeId, portName) {
  this.ensureAdditiveGraphBus();
  const key = this.inputKey ? this.inputKey(nodeId, portName) : `${nodeId}::${portName}`;
  const connections = this.dataInputConnections?.get?.(key)
    || this.graphInputConnections?.get?.(this.graphInputKey?.(nodeId, portName))
    || this.inputConnections?.get?.(key);
  if (!connections || !connections.length) {
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

NodeLiveAudioProcessor.prototype.additiveGeneratorBuildAndStamp = function additiveGeneratorBuildAndStamp(
  node, nodeId, frames,
) {
  const p = node?.params || node?.parameters || {};
  const num = typeof nodeGraphFiniteNumber === "function" ? nodeGraphFiniteNumber : (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const pwm = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "pwm", 0, frames)
    : num(p.pwm != null ? p.pwm : p.morph, 0);
  const harmonics = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "harmonics", 32, frames)
    : num(p.harmonics, 32);
  const phaseRotation = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "phaseRotation", 0, frames)
    : num(p.phaseRotation, 0);
  const graph = additiveGraphBuildFromWaveform(
    num(p.waveform, 0),
    pwm,
    harmonics,
    phaseRotation,
  );
  const id = String(nodeId);
  let genState = this.additiveGeneratorStates.get(id);
  if (!genState) {
    genState = { lastH: -1 };
    this.additiveGeneratorStates.set(id, genState);
  }
  const H = graph.harmonics | 0;
  if (genState.lastH >= 0 && genState.lastH !== H) {
    graph.phaseReset = true;
  }
  genState.lastH = H;
  this.additiveGraphWrite(nodeId, graph);
};

NodeLiveAudioProcessor.prototype.additiveGeneratorWorkletEvaluate = function additiveGeneratorWorkletEvaluate(
  node, nodeId, frame, frames,
) {
  if (frame !== 0) return;
  this.additiveGeneratorBuildAndStamp(node, nodeId, frames);
};

NodeLiveAudioProcessor.prototype.additiveGeneratorWorkletEvaluateBlock = function additiveGeneratorWorkletEvaluateBlock(
  node, nodeId, frames,
) {
  this.additiveGeneratorBuildAndStamp(node, nodeId, frames);
};
