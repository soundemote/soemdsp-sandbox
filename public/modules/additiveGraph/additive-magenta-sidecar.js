// Magenta Graph sidecar for efficient Live (native graph has no Magenta types yet).
// Runs Generator → Effect → Out in JS once per quantum, publishes Graph for faces,
// keeps per-Out Mono for scope taps, and mixes into speakers when wired to Output.

NodeLiveAudioProcessor.prototype.processAdditiveMagentaSidecar = function processAdditiveMagentaSidecar(
  output,
  frames,
) {
  if (typeof additiveGraphBuildFromWaveform !== "function") return;
  this.ensureAdditiveGraphBus?.();
  if (!this.additiveGraphBus) this.additiveGraphBus = new Map();
  if (!this.additiveGraphPublish) this.additiveGraphPublish = new Map();
  if (!this.additiveEffectStates) this.additiveEffectStates = new Map();
  if (!this.additiveOutStates) this.additiveOutStates = new Map();
  if (!this._additiveOutMono) this._additiveOutMono = new Map();

  const nodes = this.nodes;
  if (!nodes || !nodes.size) return;
  const conns = Array.isArray(this._planConnections) ? this._planConnections : [];

  const graphSrc = (dstId, portName) => {
    const want = String(portName || "Graph");
    for (let i = 0; i < conns.length; i += 1) {
      const c = conns[i];
      if (!c) continue;
      if (String(c.destinationNode) !== String(dstId)) continue;
      if (String(c.destinationPort) !== want) continue;
      return String(c.sourceNode || "");
    }
    return "";
  };

  // 1) Generators
  for (const [id, node] of nodes) {
    if (String(node?.type) !== "additiveGenerator") continue;
    const p = node.params || {};
    const graph = additiveGraphBuildFromWaveform(
      Number(p.waveform) || 0,
      Number(p.morph) || 0.5,
      Number(p.harmonics) || 32,
    );
    this.additiveGraphBus.set(String(id), graph);
    this.additiveGraphPublish.set(String(id), graph);
  }

  // 2) Effects (may chain; iterate a few passes for short chains)
  for (let pass = 0; pass < 4; pass += 1) {
    for (const [id, node] of nodes) {
      if (String(node?.type) !== "additiveEffect") continue;
      const srcId = graphSrc(id, "Graph");
      const incoming = srcId ? this.additiveGraphBus.get(srcId) : null;
      if (!incoming || !incoming.ratio) {
        this.additiveGraphBus.set(String(id), null);
        continue;
      }
      const p = node.params || {};
      const modeIdx = Math.round(Number(p.effect) || 0);
      const modes = ["LinearFilter", "AnalogFilter", "Growl", "Noisy"];
      const mode = modes[Math.max(0, Math.min(3, modeIdx))] || "LinearFilter";
      let state = this.additiveEffectStates.get(String(id));
      const applied = additiveGraphApplyEffect(
        incoming,
        mode,
        Number(p.parA) || 0.5,
        Number(p.parB) || 1,
        Number(p.parC) || 0,
        Number(p.parD) || 0,
        state,
      );
      this.additiveEffectStates.set(String(id), applied.state);
      this.additiveGraphBus.set(String(id), applied.graph);
      this.additiveGraphPublish.set(String(id), applied.graph);
    }
  }

  // 3) Outs → per-node Mono (scopes) + speaker scratch when wired to Output
  const nFrames = Math.max(0, Number(frames) || 0);
  if (nFrames < 1) return;
  if (!this._additiveScratchL || this._additiveScratchL.length < nFrames) {
    this._additiveScratchL = new Float32Array(nFrames);
    this._additiveScratchR = new Float32Array(nFrames);
  } else {
    this._additiveScratchL.fill(0, 0, nFrames);
    this._additiveScratchR.fill(0, 0, nFrames);
  }
  const leftBus = this._additiveScratchL;
  const rightBus = this._additiveScratchR;
  const sr = Number(this.engineSampleRate) || Number(sampleRate) || 44100;
  const liveOutIds = new Set();

  for (const [id, node] of nodes) {
    if (String(node?.type) !== "additiveOut") continue;
    const outId = String(id);
    const srcId = graphSrc(outId, "Graph");
    const graph = srcId ? this.additiveGraphBus.get(srcId) : null;
    if (!graph || !graph.ratio || !graph.harmonics) {
      this.additiveGraphPublish.set(outId, null);
      this._additiveOutMono.delete(outId);
      if (this.nodeOutputs) this.nodeOutputs.delete(outId);
      continue;
    }

    const p = node.params || {};
    let frequencyHz = Number(p.frequency);
    if (!(frequencyHz > 0)) frequencyHz = 100;
    const masterPhase = Number(p.phase) || 0;
    let masterAmp = Number(p.amplitude);
    if (!(masterAmp === masterAmp)) masterAmp = 0.35;

    this.additiveGraphPublish.set(outId, {
      harmonics: graph.harmonics,
      ratio: graph.ratio,
      phase: graph.phase,
      amplitude: graph.amplitude,
      frequencyHz,
      masterPhase,
      masterAmp,
    });

    // Where does this Out feed Output? (speaker mix only)
    let toMono = false;
    let toLeft = false;
    let toRight = false;
    for (let i = 0; i < conns.length; i += 1) {
      const c = conns[i];
      if (!c || String(c.sourceNode) !== outId) continue;
      const dstType = String(this.nodes.get(String(c.destinationNode))?.type || "");
      if (dstType !== "output") continue;
      const dp = String(c.destinationPort || "").toLowerCase();
      if (dp === "mono" || dp === "in" || dp === "out") toMono = true;
      else if (dp === "left" || dp === "l") toLeft = true;
      else if (dp === "right" || dp === "r") toRight = true;
      else toMono = true;
    }
    const mixToSpeakers = toMono || toLeft || toRight;

    let state = this.additiveOutStates.get(outId);
    if (!state) {
      state = { phaseAcc: null };
      this.additiveOutStates.set(outId, state);
    }

    let monoBuf = this._additiveOutMono.get(outId);
    if (!monoBuf || monoBuf.length < nFrames) {
      monoBuf = new Float32Array(nFrames);
      this._additiveOutMono.set(outId, monoBuf);
    }

    let lastY = 0;
    for (let f = 0; f < nFrames; f += 1) {
      const summed = additiveGraphSumSample(
        graph,
        state.phaseAcc,
        frequencyHz,
        masterPhase,
        masterAmp,
        sr,
      );
      state.phaseAcc = summed.phaseAcc;
      const y = Number(summed.y) || 0;
      lastY = y;
      // Always keep Mono for efficient-mode scopes (native graph has no Magenta ports).
      monoBuf[f] = y;
      if (!mixToSpeakers) continue;
      if (toMono || (toLeft && toRight)) {
        leftBus[f] = (Number(leftBus[f]) || 0) + y;
        rightBus[f] = (Number(rightBus[f]) || 0) + y;
      } else if (toLeft) {
        leftBus[f] = (Number(leftBus[f]) || 0) + y;
      } else if (toRight) {
        rightBus[f] = (Number(rightBus[f]) || 0) + y;
      }
    }

    liveOutIds.add(outId);
    if (this.nodeOutputs) {
      this.nodeOutputs.set(outId, { Mono: lastY, Out: lastY });
    }
  }

  // Drop stale Mono rings for removed / silent Outs.
  for (const key of [...this._additiveOutMono.keys()]) {
    if (!liveOutIds.has(key)) this._additiveOutMono.delete(key);
  }
};
