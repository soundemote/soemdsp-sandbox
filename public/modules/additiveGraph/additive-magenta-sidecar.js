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
  if (!this.additiveNoisyFreqStates) this.additiveNoisyFreqStates = new Map();
  if (!this.additiveNoisyPhaseStates) this.additiveNoisyPhaseStates = new Map();
  if (!this.additiveNoisyPanStates) this.additiveNoisyPanStates = new Map();
  if (!this.additiveNoisyAmpStates) this.additiveNoisyAmpStates = new Map();
  if (!this.additiveOutStates) this.additiveOutStates = new Map();
  if (!this._additiveOutMono) this._additiveOutMono = new Map();

  const nodes = this.nodes;
  if (!nodes || !nodes.size) return;
  const conns = Array.isArray(this._planConnections) ? this._planConnections : [];
  const num = typeof nodeGraphFiniteNumber === "function" ? nodeGraphFiniteNumber : (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };

  const ADDITIVE_EFFECT_TYPES = new Set([
    "additiveLinearFilter",
    "additiveAnalogFilter",
    "additiveGrowl",
    "additiveNoisyFreq",
    "additiveNoisyPhase",
    "additiveNoisyPan",
    "additiveNoisyAmp",
  ]);

  const sr = Number(this.engineSampleRate) || Number(sampleRate) || 44100;
  const blockFrames = Math.max(1, Number(frames) || 128);

  const applyNoisy = (type, id, out, p) => {
    const amount = num(p.amount, 0.25);
    const speedHz = num(p.speed, 35);
    let map;
    let apply;
    if (type === "additiveNoisyFreq") {
      map = this.additiveNoisyFreqStates;
      apply = additiveGraphApplyNoisyFreq;
    } else if (type === "additiveNoisyPhase") {
      map = this.additiveNoisyPhaseStates;
      apply = additiveGraphApplyNoisyPhase;
    } else if (type === "additiveNoisyPan") {
      map = this.additiveNoisyPanStates;
      apply = additiveGraphApplyNoisyPan;
    } else {
      map = this.additiveNoisyAmpStates;
      apply = additiveGraphApplyNoisyAmp;
    }
    let state = map.get(String(id)) || {};
    const applied = apply(out, amount, speedHz, state.walks, sr, blockFrames);
    map.set(String(id), { walks: applied.walks });
    return applied.graph;
  };

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
      num(p.waveform, 0),
      num(p.morph, 0.5),
      num(p.harmonics, 32),
    );
    this.additiveGraphBus.set(String(id), graph);
    this.additiveGraphPublish.set(String(id), graph);
  }

  // 2) Effects (may chain; iterate a few passes for short chains)
  for (let pass = 0; pass < 4; pass += 1) {
    for (const [id, node] of nodes) {
      const type = String(node?.type || "");
      if (!ADDITIVE_EFFECT_TYPES.has(type)) continue;
      const srcId = graphSrc(id, "Graph");
      const incoming = srcId ? this.additiveGraphBus.get(srcId) : null;
      if (!incoming || !incoming.ratio) {
        this.additiveGraphBus.set(String(id), null);
        continue;
      }
      const p = node.params || {};
      const out = additiveGraphClonePayload(incoming);
      if (!out) {
        this.additiveGraphBus.set(String(id), null);
        continue;
      }
      if (type === "additiveLinearFilter") {
        additiveGraphApplyLinearFilter(out, num(p.filter, 0), num(p.cutoff, 0.5), num(p.slope, 0.25));
      } else if (type === "additiveAnalogFilter") {
        additiveGraphApplyAnalogFilter(
          out, num(p.filter, 0), num(p.cutoff, 0.5), num(p.slope, 0.25), num(p.skew, 0),
        );
      } else if (type === "additiveGrowl") {
        additiveGraphApplyGrowl(
          out, num(p.phaseRotation, 0), num(p.phaseSkew, 0), num(p.phaseSkewCurve, 0),
        );
      } else if (
        type === "additiveNoisyFreq"
        || type === "additiveNoisyPhase"
        || type === "additiveNoisyPan"
        || type === "additiveNoisyAmp"
      ) {
        const graph = applyNoisy(type, id, out, p);
        this.additiveGraphBus.set(String(id), graph);
        this.additiveGraphPublish.set(String(id), graph);
        continue;
      }
      this.additiveGraphBus.set(String(id), out);
      this.additiveGraphPublish.set(String(id), out);
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
    if (!Number.isFinite(frequencyHz)) frequencyHz = 100;
    const masterPhase = Number(p.phase) || 0;
    let masterAmp = Number(p.amplitude);
    if (!(masterAmp === masterAmp)) masterAmp = 0.35;

    this.additiveGraphPublish.set(outId, {
      harmonics: graph.harmonics,
      ratio: graph.ratio,
      phase: graph.phase,
      amplitude: graph.amplitude,
      pan: graph.pan,
      frequencyHz,
      masterPhase,
      masterAmp,
    });

    // Speaker routes: which Additive Out port → which Output channel.
    // { src: "mono"|"left"|"right", dst: "mono"|"left"|"right" }
    const speakerRoutes = [];
    for (let i = 0; i < conns.length; i += 1) {
      const c = conns[i];
      if (!c || String(c.sourceNode) !== outId) continue;
      const dstType = String(this.nodes.get(String(c.destinationNode))?.type || "");
      if (dstType !== "output") continue;
      const sp = String(c.sourcePort || "").toLowerCase();
      const dp = String(c.destinationPort || "").toLowerCase();
      let src = "mono";
      if (sp === "left" || sp === "l") src = "left";
      else if (sp === "right" || sp === "r") src = "right";
      let dst = "mono";
      if (dp === "left" || dp === "l") dst = "left";
      else if (dp === "right" || dp === "r") dst = "right";
      speakerRoutes.push({ src, dst });
    }
    const mixToSpeakers = speakerRoutes.length > 0;

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

    let lastMono = 0;
    let lastLeft = 0;
    let lastRight = 0;
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
      const mono = Number(summed.mono) || 0;
      const left = Number(summed.left) || 0;
      const right = Number(summed.right) || 0;
      lastMono = mono;
      lastLeft = left;
      lastRight = right;
      // Always keep Mono for efficient-mode scopes (native graph has no Magenta ports).
      monoBuf[f] = mono;
      if (!mixToSpeakers) continue;
      for (let r = 0; r < speakerRoutes.length; r += 1) {
        const route = speakerRoutes[r];
        const sample = route.src === "left" ? left : route.src === "right" ? right : mono;
        if (route.dst === "left") {
          leftBus[f] = (Number(leftBus[f]) || 0) + sample;
        } else if (route.dst === "right") {
          rightBus[f] = (Number(rightBus[f]) || 0) + sample;
        } else {
          leftBus[f] = (Number(leftBus[f]) || 0) + sample;
          rightBus[f] = (Number(rightBus[f]) || 0) + sample;
        }
      }
    }

    liveOutIds.add(outId);
    if (this.nodeOutputs) {
      this.nodeOutputs.set(outId, {
        Mono: lastMono,
        Out: lastMono,
        Left: lastLeft,
        Right: lastRight,
      });
    }
  }

  // Drop stale Mono rings for removed / silent Outs.
  for (const key of [...this._additiveOutMono.keys()]) {
    if (!liveOutIds.has(key)) this._additiveOutMono.delete(key);
  }
};
