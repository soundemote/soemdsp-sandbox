// Yellow Graph sidecar for efficient Live (native graph has no Yellow Graph types yet).
// Runs Generator → Effect → Out in JS once per quantum, publishes Graph for faces,
// keeps per-Out Mono for scope taps, and mixes into speakers when wired to Output.

NodeLiveAudioProcessor.prototype.processAdditiveYellowGraphSidecar = function processAdditiveYellowGraphSidecar(
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
  this.ensureAdditiveParamSmoothers?.();

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
    "additiveImage", // UC — Graph passthrough until image analysis ships
  ]);

  const sr = Number(this.engineSampleRate) || Number(sampleRate) || 44100;
  const blockFrames = Math.max(1, Number(frames) || 128);

  /** DOMAIN effective after quantum chase (existing smoother kernels). */
  const eff = (node, key, fallback) => {
    if (typeof this.additiveEffectiveParam === "function") {
      return this.additiveEffectiveParam(node, key, fallback, blockFrames);
    }
    return num(node?.params?.[key], fallback);
  };

  const applyNoisy = (type, id, node, out) => {
    const speedHz = eff(node, "speed", 35);
    let map;
    let apply;
    let depth;
    if (type === "additiveNoisyFreq") {
      map = this.additiveNoisyFreqStates;
      apply = additiveGraphApplyNoisyFreq;
      // Prefer Add (ratio add). Legacy Amount was 0…1 with hidden ×0.5.
      if (node?.params?.add != null && Number.isFinite(Number(node.params.add))) {
        depth = eff(node, "add", 0.5);
      } else {
        depth = eff(node, "amount", 0.25) * 0.5;
      }
    } else if (type === "additiveNoisyPhase") {
      map = this.additiveNoisyPhaseStates;
      apply = additiveGraphApplyNoisyPhase;
      depth = eff(node, "amount", 0.25);
    } else if (type === "additiveNoisyPan") {
      map = this.additiveNoisyPanStates;
      apply = additiveGraphApplyNoisyPan;
      depth = eff(node, "amount", 0.25);
    } else {
      map = this.additiveNoisyAmpStates;
      apply = additiveGraphApplyNoisyAmp;
      depth = eff(node, "amount", 0.25);
    }
    let state = map.get(String(id)) || {};
    const noiseMode = num(node?.params?.noise, 0);
    const seed = num(node?.params?.seed, 1);
    const applied = apply(
      out, depth, speedHz, state.walks, sr, blockFrames, noiseMode, state.lerpFrom, seed,
    );
    map.set(String(id), {
      walks: applied.walks,
      lerpFrom: applied.lerpFrom !== undefined ? applied.lerpFrom : state.lerpFrom,
    });
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

  // 1) Generators — Waveform/Harmonics snap; Morph quantum-smoothed DOMAIN
  for (const [id, node] of nodes) {
    if (String(node?.type) !== "additiveGenerator") continue;
    const p = node.params || {};
    const graph = additiveGraphBuildFromWaveform(
      num(p.waveform, 0),
      eff(node, "morph", 0.5),
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
      // Bypass: Yellow Graph thru (no filter / growl / noisy mutate).
      if (node.bypassed) {
        const thru = additiveGraphClonePayload(incoming);
        this.additiveGraphBus.set(String(id), thru);
        this.additiveGraphPublish.set(String(id), thru);
        continue;
      }
      const p = node.params || {};
      const out = additiveGraphClonePayload(incoming);
      if (!out) {
        this.additiveGraphBus.set(String(id), null);
        continue;
      }
      if (type === "additiveLinearFilter" || type === "additiveAnalogFilter") {
        // Cutoff is absolute Hz. F jack = future nonrealtime Cutoff override (unimplemented).
        const cutoffHz = eff(node, "cutoff", 2000);
        const isLinear = type === "additiveLinearFilter";
        // Linear: slope 0…1 brickwall→gradual. Butterworth: slope in dB/oct.
        const slope = eff(node, "slope", isLinear ? 0.25 : 12);
        const fundHz = typeof additiveGraphResolveFundamentalHz === "function"
          ? additiveGraphResolveFundamentalHz({
            graph: out,
            nodes,
            connections: conns,
            fromNodeId: id,
            readFrequency: (outNode) => eff(outNode, "frequency", 100),
            fallback: 100,
          })
          : 100;
        if (isLinear) {
          additiveGraphApplyLinearFilter(
            out, num(p.filter, 0), cutoffHz, slope, eff(node, "skew", 0), fundHz, sr,
          );
        } else {
          // additiveAnalogFilter = Butterworth Filter (dB/oct Slope)
          additiveGraphApplyButterworthFilter(
            out, num(p.filter, 0), cutoffHz, slope, eff(node, "skew", 0), fundHz, sr,
          );
        }
      } else if (type === "additiveGrowl") {
        additiveGraphApplyGrowl(
          out,
          eff(node, "phaseRotation", 0),
          eff(node, "phaseSkew", 0),
          eff(node, "phaseSkewCurve", 0),
        );
      } else if (
        type === "additiveNoisyFreq"
        || type === "additiveNoisyPhase"
        || type === "additiveNoisyPan"
        || type === "additiveNoisyAmp"
      ) {
        const graph = applyNoisy(type, id, node, out);
        this.additiveGraphBus.set(String(id), graph);
        this.additiveGraphPublish.set(String(id), graph);
        continue;
      }
      // additiveImage (UC) and any other effect type: passthrough clone
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

    let frequencyHz = eff(node, "frequency", 100);
    if (!Number.isFinite(frequencyHz)) frequencyHz = 100;
    const masterPhase = eff(node, "phase", 0);
    let masterAmp = eff(node, "amplitude", 0.35);
    if (!(masterAmp === masterAmp)) masterAmp = 0.35;
    const optimizeMode = num(node?.params?.optimize, 0);

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
        f,
        nFrames,
        optimizeMode,
      );
      state.phaseAcc = summed.phaseAcc;
      const mono = Number(summed.mono) || 0;
      const left = Number(summed.left) || 0;
      const right = Number(summed.right) || 0;
      lastMono = mono;
      lastLeft = left;
      lastRight = right;
      // Always keep Mono for efficient-mode scopes (native graph has no Yellow Graph ports).
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
