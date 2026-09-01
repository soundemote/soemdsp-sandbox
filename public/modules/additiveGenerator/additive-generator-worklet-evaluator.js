// Worklet: Additive Generator — Yellow Graph OUT once per quantum.
// HarmonicFade: Instant (hard H), Smoothed (1-quantum ampLerp), Decimal (trailing frac).
// Out must only init new phaseAcc slots (not wipe all — that clicked).

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
  const harmonicFade = num(p.harmonicFade, 1);
  const phaseRotation = typeof this.additiveEffectiveParam === "function"
    ? this.additiveEffectiveParam(node, "phaseRotation", 0, frames)
    : num(p.phaseRotation, 0);
  const id = String(nodeId);
  let genState = this.additiveGeneratorStates.get(id);
  if (!genState) {
    genState = { lastH: -1, prevAmp: null, prevRatio: null, prevPhase: null };
    this.additiveGeneratorStates.set(id, genState);
  }
  const prevH = genState.lastH | 0;
  const prevAmp = genState.prevAmp;
  const prevRatio = genState.prevRatio;
  const prevPhase = genState.prevPhase;
  const fade = typeof additiveGraphNormalizeHarmonicFade === "function"
    ? additiveGraphNormalizeHarmonicFade(harmonicFade)
    : 1;
  const graph = additiveGraphBuildFromWaveform(
    num(p.waveform, 0),
    pwm,
    harmonics,
    phaseRotation,
    fade,
  );
  const newH = graph.harmonics | 0;
  if (prevH >= 0 && prevH !== newH) {
    graph.phaseReset = true;
    // Smoothed only: Instant hard-cuts; Decimal trailing amp is the fade.
    if (fade === 1 && typeof additiveGraphApplyGeneratorHarmonicsCountLerp === "function") {
      additiveGraphApplyGeneratorHarmonicsCountLerp(
        graph, prevAmp, prevRatio, prevPhase, prevH, newH,
      );
    } else if (fade === 1) {
      const Hlerp = Math.max(prevH, newH);
      if (Hlerp > (graph.ratio?.length | 0)) {
        const ratio = new Float32Array(Hlerp);
        const phase = new Float32Array(Hlerp);
        const amplitude = new Float32Array(Hlerp);
        const pan = new Float32Array(Hlerp);
        if (graph.ratio) ratio.set(graph.ratio);
        if (graph.phase) phase.set(graph.phase);
        if (graph.amplitude) amplitude.set(graph.amplitude);
        if (graph.pan) pan.set(graph.pan);
        graph.ratio = ratio;
        graph.phase = phase;
        graph.amplitude = amplitude;
        graph.pan = pan;
      }
      const from = new Float32Array(Hlerp);
      const to = new Float32Array(Hlerp);
      for (let i = 0; i < Hlerp; i += 1) {
        from[i] = prevAmp && i < prevH ? Number(prevAmp[i]) || 0 : 0;
        if (i < newH) {
          to[i] = Number(graph.amplitude[i]) || 0;
        } else {
          to[i] = 0;
          if (prevRatio && i < prevH) graph.ratio[i] = Number(prevRatio[i]) || 0;
          if (prevPhase && i < prevH) graph.phase[i] = Number(prevPhase[i]) || 0;
          graph.amplitude[i] = 0;
          graph.pan[i] = 0;
        }
      }
      graph.harmonics = Hlerp;
      graph.ampLerp = { from, to };
    }
  }
  genState.lastH = newH;
  // Remember *target* planes (newH), not temporary lerp width.
  const storeH = Math.max(0, newH);
  genState.prevAmp = new Float32Array(storeH);
  genState.prevRatio = new Float32Array(storeH);
  genState.prevPhase = new Float32Array(storeH);
  for (let i = 0; i < storeH; i += 1) {
    genState.prevAmp[i] = graph.ampLerp?.to
      ? Number(graph.ampLerp.to[i]) || 0
      : Number(graph.amplitude?.[i]) || 0;
    genState.prevRatio[i] = Number(graph.ratio?.[i]) || 0;
    genState.prevPhase[i] = Number(graph.phase?.[i]) || 0;
  }
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
