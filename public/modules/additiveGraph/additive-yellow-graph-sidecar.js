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
  if (!this.additiveDiffusorStates) this.additiveDiffusorStates = new Map();
  if (!this.additiveBubbleStates) this.additiveBubbleStates = new Map();
  if (!this.additivePanStates) this.additivePanStates = new Map();
  if (!this.additiveFrequencySkewStates) this.additiveFrequencySkewStates = new Map();
  if (!this.additiveQuantizeFreqStates) this.additiveQuantizeFreqStates = new Map();
  if (!this.additiveQuantizePhaseStates) this.additiveQuantizePhaseStates = new Map();
  if (!this.additiveOutStates) this.additiveOutStates = new Map();
  if (!this._additiveOutMono) this._additiveOutMono = new Map();
  if (!this._additiveOutLeft) this._additiveOutLeft = new Map();
  if (!this._additiveOutRight) this._additiveOutRight = new Map();
  this.ensureAdditiveParamSmoothers?.();

  const nodes = this.nodes;
  if (!nodes || !nodes.size) {
    // No nodes — drop any leftover Yellow Graph audio / bus state.
    this._additiveScratchL?.fill?.(0);
    this._additiveScratchR?.fill?.(0);
    this.additiveGraphBus?.clear?.();
    this.additiveGraphPublish?.clear?.();
    return;
  }
  const conns = Array.isArray(this._planConnections) ? this._planConnections : [];
  const num = typeof nodeGraphFiniteNumber === "function" ? nodeGraphFiniteNumber : (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  // Prune bus / publish / Out state for deleted node ids (otherwise Gen→Effect→Out
  // kept playing a stale Graph after the Generator was removed).
  const liveIds = new Set([...nodes.keys()].map(String));
  const pruneMap = (map) => {
    if (!(map instanceof Map)) return;
    for (const key of [...map.keys()]) {
      if (!liveIds.has(String(key))) map.delete(key);
    }
  };
  pruneMap(this.additiveGraphBus);
  pruneMap(this.additiveGraphPublish);
  pruneMap(this.additiveOutStates);
  pruneMap(this._additiveOutMono);
  pruneMap(this._additiveOutLeft);
  pruneMap(this._additiveOutRight);
  pruneMap(this._additiveBusQuantum);

  const ADDITIVE_EFFECT_TYPES = new Set([
    "additiveLinearFilter",
    "additiveAnalogFilter",
    "additiveLadderFilter",
    "additiveBubble",
    "additiveBlaster",
    "additiveDiffusor",
    "additivePhaseEntry",
    "additiveFrequencySkew",
    "additiveQuantizeFreq",
    "additiveQuantizePhase",
    "additiveHarmonicMath", // legacy → QuantizeFreq
    "additiveFrequencyMath", // legacy → QuantizeFreq
    "additiveFrequencySlope", // legacy → Skew
    "additiveNoisyFreq",
    "additiveNoisyPhase",
    "additivePan",
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
      // Prefer Add. Legacy Amount was 0…1 with hidden ×0.5.
      if (node?.params?.add != null && Number.isFinite(Number(node.params.add))) {
        depth = eff(node, "add", 0.5);
      } else {
        depth = eff(node, "amount", 0.25) * 0.5;
      }
    } else if (type === "additiveNoisyPhase") {
      map = this.additiveNoisyPhaseStates;
      apply = additiveGraphApplyNoisyPhase;
      if (node?.params?.add != null && Number.isFinite(Number(node.params.add))) {
        depth = eff(node, "add", 0.25);
      } else {
        depth = eff(node, "amount", 0.25) * 0.5; // legacy Amount had hidden ×0.5
      }
    } else if (type === "additiveNoisyPan") {
      map = this.additiveNoisyPanStates;
      apply = additiveGraphApplyNoisyPan;
      if (node?.params?.add != null && Number.isFinite(Number(node.params.add))) {
        depth = eff(node, "add", 0.25);
      } else {
        depth = eff(node, "amount", 0.25);
      }
    } else {
      map = this.additiveNoisyAmpStates;
      apply = additiveGraphApplyNoisyAmp;
      if (node?.params?.add != null && Number.isFinite(Number(node.params.add))) {
        depth = eff(node, "add", 0.25);
      } else {
        depth = eff(node, "amount", 0.25) * 0.5; // legacy Amount had hidden ×0.5
      }
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

  // One token per quantum: Noisy* must apply once (re-entry advanced walks and
  // collapsed panLerp/ratioLerp to a micro-step → crackle at block boundaries).
  const quantum = (this._additiveQuantumToken = (this._additiveQuantumToken || 0) + 1);
  if (!this._additiveBusQuantum) this._additiveBusQuantum = new Map();
  const busQ = this._additiveBusQuantum;

  // 1) Generators — Waveform snap; PWM + Harmonics + Phase Rotation (DOMAIN)
  if (!this.additiveGeneratorStates) this.additiveGeneratorStates = new Map();
  for (const [id, node] of nodes) {
    if (String(node?.type) !== "additiveGenerator") continue;
    const p = node.params || {};
    // Ensure id is set for additive smoother keying (Map key is authoritative).
    if (!node.id) node.id = id;
    const pwm = (p.pwm != null && Number.isFinite(Number(p.pwm)))
      ? eff(node, "pwm", 0)
      : eff(node, "morph", 0); // legacy Morph → PWM
    const fade = typeof additiveGraphNormalizeHarmonicFade === "function"
      ? additiveGraphNormalizeHarmonicFade(num(p.harmonicFade, 1))
      : 1;
    const graph = additiveGraphBuildFromWaveform(
      num(p.waveform, 0),
      pwm,
      eff(node, "harmonics", 32),
      eff(node, "phaseRotation", 0),
      fade,
    );
    const gid = String(id);
    let genState = this.additiveGeneratorStates.get(gid);
    if (!genState) {
      genState = { lastH: -1, prevAmp: null, prevRatio: null, prevPhase: null };
      this.additiveGeneratorStates.set(gid, genState);
    }
    const prevH = genState.lastH | 0;
    const newH = graph.harmonics | 0;
    if (prevH >= 0 && prevH !== newH) {
      graph.phaseReset = true;
      if (fade === 1 && typeof additiveGraphApplyGeneratorHarmonicsCountLerp === "function") {
        additiveGraphApplyGeneratorHarmonicsCountLerp(
          graph, genState.prevAmp, genState.prevRatio, genState.prevPhase, prevH, newH,
        );
      }
    }
    genState.lastH = newH;
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
    this.additiveGraphBus.set(gid, graph);
    this.additiveGraphPublish.set(gid, graph);
    busQ.set(gid, quantum);
  }

  const NOISY_TYPES = new Set([
    "additiveNoisyFreq",
    "additiveNoisyPhase",
    "additiveNoisyPan",
    "additiveNoisyAmp",
  ]);
  // (additivePan handled below — deterministic, not noisy)

  // 2) Effects — multi-pass for chain order; each node applies at most once / quantum
  //    (Noisy* re-entry used to advance walks 4× and shrink panLerp to a micro-step → crackle).
  for (let pass = 0; pass < 4; pass += 1) {
    for (const [id, node] of nodes) {
      const type = String(node?.type || "");
      if (!ADDITIVE_EFFECT_TYPES.has(type)) continue;
      const eid = String(id);
      if (busQ.get(eid) === quantum) continue; // already published this quantum
      const srcId = graphSrc(id, "Graph");
      if (!srcId || busQ.get(srcId) !== quantum) {
        // Upstream not published this quantum yet — wait for a later pass.
        continue;
      }
      const incoming = this.additiveGraphBus.get(srcId);
      if (!incoming || !incoming.ratio) {
        this.additiveGraphBus.set(eid, null);
        busQ.set(eid, quantum);
        continue;
      }

      // Bypass: Yellow Graph thru (no filter / growl / noisy mutate).
      if (node.bypassed) {
        const thru = additiveGraphClonePayload(incoming);
        this.additiveGraphBus.set(eid, thru);
        this.additiveGraphPublish.set(eid, thru);
        busQ.set(eid, quantum);
        continue;
      }
      const p = node.params || {};
      const out = additiveGraphClonePayload(incoming);
      if (!out) {
        this.additiveGraphBus.set(eid, null);
        busQ.set(eid, quantum);
        continue;
      }
      if (
        type === "additiveLinearFilter"
        || type === "additiveAnalogFilter"
        || type === "additiveLadderFilter"
      ) {
        // Cutoff is absolute Hz. F jack = future nonrealtime Cutoff override (unimplemented).
        const cutoffHz = eff(node, "cutoff", 2000);
        const isLinear = type === "additiveLinearFilter";
        const isLadder = type === "additiveLadderFilter";
        // Linear: slope 0…1 brickwall→gradual. Butterworth/Ladder: slope in dB/oct.
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
        } else if (isLadder) {
          additiveGraphApplyLadderFilter(
            out,
            num(p.filter, 0),
            cutoffHz,
            slope,
            eff(node, "resonance", 0),
            fundHz,
            sr,
          );
        } else {
          // additiveAnalogFilter = Butterworth Filter (dB/oct Slope)
          additiveGraphApplyButterworthFilter(
            out, num(p.filter, 0), cutoffHz, slope, eff(node, "skew", 0), fundHz, sr,
          );
        }
      } else if (type === "additiveBubble") {
        let bubbleState = this.additiveBubbleStates.get(eid) || {};
        const cutoff = eff(node, "cutoff", 1);
        const phaseSkew = additiveGraphBubbleEffectivePhaseSkew(
          eff(node, "phaseSkew", 0),
          eff(node, "unskew", 481.53),
          cutoff,
        );
        let bubble = Math.max(0, Math.min(1, Number(eff(node, "bubble", 0)) || 0));
        const invert = num(p.invertBubble, 0) >= 0.5;
        let curveAmt = invert ? -bubble : bubble;
        if (curveAmt > 0.9999) curveAmt = 0.9999;
        if (curveAmt < -0.9999) curveAmt = -0.9999;
        const applied = additiveGraphApplyGrowl(
          out,
          0,
          phaseSkew,
          curveAmt,
          2, // Logarithmic
          cutoff,
          0,
          bubbleState.lerpFrom || null,
        );
        this.additiveBubbleStates.set(eid, {
          lerpFrom: applied?.lerpFrom || null,
        });
      } else if (type === "additiveBlaster") {
        if (typeof additiveGraphApplyBlaster === "function") {
          const fund = typeof this.resolveYellowFundHz === "function"
            ? this.resolveYellowFundHz(eid)
            : 100;
          if (!this.additiveBlasterStates) this.additiveBlasterStates = new Map();
          const bState = this.additiveBlasterStates.get(eid) || {};
          const applied = additiveGraphApplyBlaster(
            out,
            eff(node, "quantization", 179),
            0,
            fund,
            sr,
            1,
            eff(node, "depth", 145.84),
            eff(node, "curve", -0.2),
            num(p.curveKind, 1),
            eff(node, "offset", 0.58),
            num(p.phaseMode, 0),
            num(p.invert, 0),
            eff(node, "bias", 0.44),
            eff(node, "jump", 1.0757),
            bState.lerpFrom || null,
          );
          this.additiveBlasterStates.set(eid, {
            lerpFrom: applied?.lerpFrom || null,
          });
        }
      } else if (type === "additiveDiffusor") {
        if (typeof additiveGraphApplyDiffusor === "function") {
          let dState = this.additiveDiffusorStates.get(eid) || {};
          if (typeof additiveGraphEnsureWalks === "function") {
            dState.walks = additiveGraphEnsureWalks(
              dState.walks || null,
              out?.harmonics | 0,
              71,
              num(p.seed, 1),
            );
          }
          additiveGraphApplyDiffusor(
            out,
            eff(node, "diffusion", 1),
            num(p.seed, 1),
            eff(node, "speed", 35),
            dState.walks || null,
            sr,
            blockFrames,
            dState.lerpFrom || null,
          );
          this.additiveDiffusorStates.set(eid, {
            walks: dState.walks || null,
            lerpFrom: out?.phaseLerp?.to
              ? new Float32Array(out.phaseLerp.to)
              : (dState.lerpFrom || null),
          });
        }
      } else if (type === "additivePhaseEntry") {
        // Stamp only — Out reads phaseEntryMode. Sidecar has no Out phaseAcc.
        if (out && typeof out === "object") {
          out.phaseEntryMode = Math.max(0, Math.min(2, Math.round(num(p.mode, 0))));
        }
      } else if (type === "additiveFrequencySkew" || type === "additiveFrequencySlope") {
        let skewState = this.additiveFrequencySkewStates.get(eid) || {};
        // Legacy Slope used scale — map into stretch if low/high missing.
        let lowStretch = eff(node, "lowStretch", NaN);
        let highStretch = eff(node, "highStretch", NaN);
        if (!(lowStretch === lowStretch) || !(highStretch === highStretch)) {
          const scale = eff(node, "scale", 0);
          const s = Number(scale) || 0;
          if (!(lowStretch === lowStretch)) lowStretch = s < 0 ? 1 + Math.abs(s) * 23 : 1;
          if (!(highStretch === highStretch)) highStretch = s > 0 ? 1 + Math.abs(s) * 23 : 1;
        }
        const appliedSkew = additiveGraphApplyFrequencySkew(
          out,
          lowStretch,
          highStretch,
          eff(node, "skew", 0),
          num(p.curve, 0),
          skewState.lerpFrom || null,
        );
        this.additiveFrequencySkewStates.set(eid, {
          lerpFrom: appliedSkew?.lerpFrom || null,
        });
      } else if (
        type === "additiveQuantizeFreq"
        || type === "additiveHarmonicMath"
        || type === "additiveFrequencyMath"
      ) {
        let freqState = this.additiveQuantizeFreqStates.get(eid) || {};
        const qOn = p.quantizeFreq != null ? num(p.quantizeFreq, 0) : num(p.quantize, 0);
        const appliedFreq = additiveGraphApplyQuantizeFreq(
          out,
          qOn,
          eff(node, "randomFreqAmount", 0),
          num(p.seed, 1),
          freqState.lerpFrom || null,
          num(p.affectFundamental, 0),
        );
        this.additiveQuantizeFreqStates.set(eid, {
          lerpFrom: appliedFreq?.lerpFrom || null,
        });
      } else if (type === "additiveQuantizePhase") {
        let phaseState = this.additiveQuantizePhaseStates.get(eid) || {};
        const appliedPhase = additiveGraphApplyQuantizePhase(
          out,
          num(p.quantizePhase, 0),
          eff(node, "randomPhaseAmount", 0),
          num(p.seed, 1),
          phaseState.lerpFrom || null,
        );
        this.additiveQuantizePhaseStates.set(eid, {
          lerpFrom: appliedPhase?.lerpFrom || null,
        });
      } else if (type === "additivePan") {
        let panState = this.additivePanStates.get(eid) || {};
        const appliedPan = additiveGraphApplyPan(
          out,
          eff(node, "width", 0.75),
          eff(node, "rate", 0.25),
          eff(node, "depth", 0.85),
          eff(node, "spread", 1),
          eff(node, "bias", 0),
          eff(node, "shimmer", 0.35),
          eff(node, "orbit", 1),
          eff(node, "shimmerRate", 18),
          panState,
          sr,
          blockFrames,
          panState.lerpFrom || null,
        );
        this.additivePanStates.set(eid, {
          lerpFrom: appliedPan?.lerpFrom || null,
          phase: appliedPan?.phase || 0,
          shimmerPhase: appliedPan?.shimmerPhase || 0,
        });
      } else if (NOISY_TYPES.has(type)) {
        const graph = applyNoisy(type, id, node, out);
        this.additiveGraphBus.set(eid, graph);
        this.additiveGraphPublish.set(eid, graph);
        busQ.set(eid, quantum);
        continue;
      }
      // additiveImage (UC) and any other effect type: passthrough clone
      this.additiveGraphBus.set(eid, out);
      this.additiveGraphPublish.set(eid, out);
      busQ.set(eid, quantum);
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
    // Require a Graph published THIS quantum — stale bus entries after upstream
    // delete (Generator removed, Effect not republished) must not keep sounding.
    const graph = srcId && busQ.get(srcId) === quantum
      ? this.additiveGraphBus.get(srcId)
      : null;
    if (!graph || !graph.ratio || !graph.harmonics) {
      this.additiveGraphPublish.set(outId, null);
      this._additiveOutMono.delete(outId);
      this._additiveOutLeft.delete(outId);
      this._additiveOutRight.delete(outId);
      if (this.nodeOutputs) this.nodeOutputs.delete(outId);
      continue;
    }

    let frequencyHz = eff(node, "frequency", 100);
    if (!Number.isFinite(frequencyHz)) frequencyHz = 100;
    let masterAmp = eff(node, "amplitude", 0.35);
    if (!(masterAmp === masterAmp)) masterAmp = 0.35;
    // Phase Rotation lives on Additive Generator (baked into Graph phases).
    const masterPhase = 0;
    const optimizeMode = num(node?.params?.optimize, 0);

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
    // Generator Harmonics slot-count change → wipe free-running phases.
    if (graph.phaseReset) state.phaseAcc = null;

    let monoBuf = this._additiveOutMono.get(outId);
    if (!monoBuf || monoBuf.length < nFrames) {
      monoBuf = new Float32Array(nFrames);
      this._additiveOutMono.set(outId, monoBuf);
    }
    let leftBuf = this._additiveOutLeft.get(outId);
    if (!leftBuf || leftBuf.length < nFrames) {
      leftBuf = new Float32Array(nFrames);
      this._additiveOutLeft.set(outId, leftBuf);
    }
    let rightBuf = this._additiveOutRight.get(outId);
    if (!rightBuf || rightBuf.length < nFrames) {
      rightBuf = new Float32Array(nFrames);
      this._additiveOutRight.set(outId, rightBuf);
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
      if (f === nFrames - 1) {
        // Publish Graph for harmonicLines (phase = Graph offsets, not free-running).
        this.additiveGraphPublish.set(outId, {
          harmonics: graph.harmonics,
          ratio: graph.ratio,
          phase: graph.phase,
          amplitude: graph.amplitude,
          pan: graph.pan,
          ratioNoise: graph.ratioNoise,
          phaseNoise: graph.phaseNoise,
          panNoise: graph.panNoise,
          ampNoise: graph.ampNoise,
          frequencyHz,
          masterAmp,
          masterPhase,
        });
      }
      const mono = Number(summed.mono) || 0;
      const left = Number(summed.left) || 0;
      const right = Number(summed.right) || 0;
      lastMono = mono;
      lastLeft = left;
      lastRight = right;
      // Efficient-mode scopes: keep Mono / Left / Right rings (native has no Yellow Graph ports).
      monoBuf[f] = mono;
      leftBuf[f] = left;
      rightBuf[f] = right;
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

  // Drop stale Mono/L/R rings for removed / silent Outs.
  for (const key of [...this._additiveOutMono.keys()]) {
    if (!liveOutIds.has(key)) {
      this._additiveOutMono.delete(key);
      this._additiveOutLeft.delete(key);
      this._additiveOutRight.delete(key);
    }
  }
};
