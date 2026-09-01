// Efficient Live: publish Bias/Out for face controllers (not in native graph).
// Must run before syncNativeGraphParams / Additive sidecar so MOD folds work.

NodeLiveAudioProcessor.prototype.processControllerEfficientSidecar = function processControllerEfficientSidecar(
  _frames,
) {
  if (!this.efficientProduct || !this.nodes?.size) return;
  if (!this.nodeOutputs) this.nodeOutputs = new Map();

  const num = (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };

  const mixIn = (nodeId, port) => {
    const key = typeof this.inputKey === "function"
      ? this.inputKey(nodeId, port)
      : `${nodeId}.${port}`;
    const conns = this.inputConnections?.get?.(key);
    if (!conns || !conns.length) return 0;
    let sum = 0;
    for (let i = 0; i < conns.length; i += 1) {
      const c = conns[i];
      if (!c) continue;
      const out = this.nodeOutputs.get(String(c.sourceNode));
      if (!out) continue;
      const sp = String(c.sourcePort || "");
      const v = out[sp] ?? out.Bias ?? out.Out ?? out.value;
      sum += num(v, 0);
    }
    return sum;
  };

  // Two passes so controller→controller In chains resolve.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [id, node] of this.nodes) {
      const type = String(node?.type || "");
      const p = node?.params || node?.parameters || {};
      const nid = String(id);

      if (type === "knob") {
        const offset = num(p.offset, 0);
        const rangeMin = num(p.rangeMin, 0);
        const rangeMax = num(p.rangeMax, 1);
        const polarity = num(p.polarity, 0);
        const range = typeof nodeGraphDspControllerRange === "function"
          ? nodeGraphDspControllerRange(rangeMin, rangeMax, polarity)
          : { min: 0, max: 1 };
        const out = typeof nodeGraphDspBiasFromIn === "function"
          ? nodeGraphDspBiasFromIn(offset, mixIn(nid, "In"), range.min, range.max)
          : { Bias: offset, Out: offset, offset, value: offset };
        this.nodeOutputs.set(nid, out);
        continue;
      }

      if (type === "pluginSlider") {
        const value = num(p.value, 0);
        const out = typeof nodeGraphDspBiasFromIn === "function"
          ? nodeGraphDspBiasFromIn(value, mixIn(nid, "In"))
          : { Bias: value, Out: value, offset: value, value };
        this.nodeOutputs.set(nid, out);
        continue;
      }

      if (type === "toggleButton" || type === "momentaryButton") {
        const unit = num(p.value, 0);
        const rangeMin = num(p.rangeMin, 0);
        const rangeMax = num(p.rangeMax, 1);
        const mapped = typeof nodeGraphDspControllerUnitToRange === "function"
          ? nodeGraphDspControllerUnitToRange(unit, rangeMin, rangeMax)
          : unit;
        this.nodeOutputs.set(nid, { Out: mapped, value: mapped, Bias: mapped });
        continue;
      }

      // CurveEnvelopeMod — publish sample-accurate modControl packet + strip.
      if (type === "curveEnvelopeMod") {
        if (!this.curveEnvelopeModStates) this.curveEnvelopeModStates = new Map();
        if (!this.additiveModStrips) this.additiveModStrips = new Map();
        let envState = this.curveEnvelopeModStates.get(nid);
        if (!envState) {
          envState = typeof createNodeGraphExpAdsrState === "function"
            ? createNodeGraphExpAdsrState()
            : { lastGate: 0, out: 0, secondsPassed: 0, state: "off" };
          this.curveEnvelopeModStates.set(nid, envState);
        }
        if (node.bypassed) {
          this.nodeOutputs.set(nid, { Out: 0, Bias: 0, value: 0 });
          this.additiveModStrips.delete(nid);
          continue;
        }
        const live = {
          delay: num(p.delay, 0),
          attack: num(p.attack, 0.08),
          decay: num(p.decay, 0.22),
          sustain: num(p.sustain, 0.55),
          release: num(p.release, 0.45),
          attackShape: num(p.attackShape, 0.3),
          releaseShape: num(p.releaseShape, 0.0001),
          loop: num(p.loop, 0),
          level: num(p.level, 1),
          updateOnTrigger: num(p.updateOnTrigger, 0),
        };
        const gate = mixIn(nid, "Gate");
        const rate = Math.max(1, Number(this.engineSampleRate) || Number(sampleRate) || 44100);
        const nFrames = Math.max(1, Number(_frames) || 128);
        let out = 0;
        let strip = null;
        if (typeof additiveModControlCreate === "function" && typeof additiveModControlBakeStrip === "function") {
          const packet = additiveModControlCreate("adsr", {
            sampleRate: rate,
            gate,
            state: envState,
            ...live,
          });
          strip = additiveModControlBakeStrip(packet, nFrames);
          out = Number(strip[nFrames - 1]) || 0;
          this.additiveModStrips.set(nid, strip);
          this.nodeOutputs.set(nid, {
            Out: out,
            Bias: out,
            value: out,
            modControl: packet,
            modStrip: strip,
          });
        } else if (typeof nodeGraphExpAdsrCore === "function") {
          for (let f = 0; f < nFrames; f += 1) {
            const params = typeof nodeGraphExpAdsrParamsForSample === "function"
              ? nodeGraphExpAdsrParamsForSample(envState, gate, live, live.updateOnTrigger)
              : live;
            out = nodeGraphExpAdsrCore(envState, gate, params, rate);
          }
          this.nodeOutputs.set(nid, { Out: out, Bias: out, value: out });
        } else {
          this.nodeOutputs.set(nid, { Out: 0, Bias: 0, value: 0 });
        }
        continue;
      }

      // PluckEnvelopeMod twin — strip baked by native C++ pluck_envelope (not JS DSP).
      if (type === "pluckEnvelopeMod") {
        if (!this.pluckEnvelopeModStates) this.pluckEnvelopeModStates = new Map();
        if (!this.additiveModStrips) this.additiveModStrips = new Map();
        let pluckState = this.pluckEnvelopeModStates.get(nid);
        if (!pluckState) {
          pluckState = { nativeHandle: 0 };
          this.pluckEnvelopeModStates.set(nid, pluckState);
        }
        if (node.bypassed) {
          this.nodeOutputs.set(nid, { Out: 0, Bias: 0, value: 0 });
          this.additiveModStrips.delete(nid);
          continue;
        }
        const live = {
          delayTime: num(p.delayTime, 0),
          attackFeedback: num(p.attackFeedback, 0.002),
          decay: num(p.decay, 0.35),
          decayModStart: num(p.decayModStart, 0.08),
          decayModEnd: num(p.decayModEnd, 0.55),
          endingDecay: num(p.endingDecay, 0.8),
          decayModCurve: num(p.decayModCurve, 0),
          decayModFrequency: num(p.decayModFrequency, 1.5),
          releaseFeedback: num(p.releaseFeedback, 0.35),
          autoReleaseTime: num(p.autoReleaseTime, 0.08),
          velocity: num(p.velocity, 1),
          velocitySensitivity: num(p.velocitySensitivity, 0),
          level: num(p.level, 1),
        };
        const trigger = mixIn(nid, "Trigger");
        const release = mixIn(nid, "Release");
        const rate = Math.max(1, Number(this.engineSampleRate) || Number(sampleRate) || 44100);
        const nFrames = Math.max(1, Number(_frames) || 128);
        const native = this.nativePluckEnvelope;
        const canNative = Boolean(
          this.nativePluckEnvelopeReady
          && native?.soemdsp_pluck_envelope_create
          && native?.soemdsp_pluck_envelope_sample
        );
        let strip = this.additiveModStrips.get(nid);
        if (!strip || strip.length !== nFrames) {
          strip = new Float32Array(nFrames);
          this.additiveModStrips.set(nid, strip);
        }
        let out = 0;
        if (canNative) {
          try {
            if (!pluckState.nativeHandle) {
              pluckState.nativeHandle = native.soemdsp_pluck_envelope_create() | 0;
            }
            const handle = pluckState.nativeHandle | 0;
            if (handle > 0) {
              for (let f = 0; f < nFrames; f += 1) {
                const v = native.soemdsp_pluck_envelope_sample(
                  handle,
                  trigger,
                  release,
                  Math.max(0, live.delayTime),
                  Math.max(0, live.attackFeedback),
                  Math.max(0.1, Math.min(1, live.decay)),
                  Math.max(0.001, Math.min(1.8, live.decayModStart)),
                  Math.max(0.01, Math.min(3, live.decayModEnd)),
                  Math.max(0, Math.min(1.4, live.endingDecay)),
                  Math.max(-1, Math.min(1, live.decayModCurve)),
                  Math.max(0, Math.min(100, live.decayModFrequency)),
                  Math.max(0, live.autoReleaseTime),
                  Math.max(0, Math.min(1, live.releaseFeedback)),
                  Math.max(0, Math.min(1, live.velocity)),
                  Math.max(0, Math.min(1, live.velocitySensitivity)),
                  Math.max(0, Math.min(1, live.level)),
                  rate,
                );
                const n = Number(v);
                strip[f] = Number.isFinite(n) ? n : 0;
              }
              out = Number(strip[nFrames - 1]) || 0;
            }
          } catch (_e) {
            strip.fill(0);
            out = 0;
          }
        } else {
          // Efficient path: no JS pluck fallback — wait for native module.
          strip.fill(0);
          out = 0;
        }
        const packet = typeof additiveModControlCreate === "function"
          ? additiveModControlCreate("pluck", {
            sampleRate: rate,
            trigger,
            release,
            ...live,
          })
          : { kind: "pluck", sampleRate: rate };
        this.nodeOutputs.set(nid, {
          Out: out,
          Bias: out,
          value: out,
          modControl: packet,
          modStrip: strip,
        });
      }
    }
  }
};

/**
 * Sample a modulation source (efficient path).
 * Cyan parameter-outs: read the source slider DOMAIN (smoothed chase if any),
 * same as full-path readRuntimePortOutput — do NOT require nodeOutputs publish.
 * Controllers (Knob/Bias/…): fall back to published nodeOutputs Bias/Out.
 */
NodeLiveAudioProcessor.prototype.readEfficientModSourceSample = function readEfficientModSourceSample(
  sourceNode,
  sourcePort,
) {
  const id = String(sourceNode);
  const sp = String(sourcePort || "");
  const node = this.nodes?.get?.(id);
  // Parameter-row outlet (cyan or gold slider out) → DOMAIN→mod sample.
  // Match full path: smoothed/base slider only (no folding this param's own mods).
  if (
    node
    && sp
    && typeof this.parameterOutputExists === "function"
    && this.parameterOutputExists(node, sp)
  ) {
    let value;
    const smootherKey = typeof this.parameterKey === "function"
      ? this.parameterKey(id, sp)
      : `${id}.${sp}`;
    const addState = this.additiveParamSmoothers?.get?.(smootherKey);
    if (addState && Number.isFinite(Number(addState.value))) {
      value = Number(addState.value);
    } else {
      const raw = Number(node.params?.[sp] ?? node.parameters?.[sp]);
      value = Number.isFinite(raw) ? raw : 0;
    }
    const meta = node.paramMeta?.[sp] || {};
    if (typeof this.normalizeParameterOutputValue === "function") {
      return this.normalizeParameterOutputValue(value, meta);
    }
    if (typeof nodeGraphParamDomainToModOutput === "function") {
      return nodeGraphParamDomainToModOutput(value, meta);
    }
    return value;
  }
  const out = this.nodeOutputs?.get?.(id);
  if (!out) return 0;
  const v = out[sp] ?? (sp === "Out" ? out.Bias : null) ?? (sp === "Bias" ? out.Out : null);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Fold patch modulations onto a DOMAIN base (efficient path; no frameValues). */
NodeLiveAudioProcessor.prototype.foldEfficientParamModulations = function foldEfficientParamModulations(
  node,
  key,
  base,
) {
  const mods = this.modulationConnections?.get?.(this.parameterKey(node?.id, key));
  if (!mods || !mods.length) return base;
  const metadata = node?.paramMeta?.[key] || {};
  const sources = [];
  for (let i = 0; i < mods.length; i += 1) {
    const m = mods[i];
    if (!m) continue;
    const sample = this.readEfficientModSourceSample(m.sourceNode, m.sourcePort);
    if (typeof this.normalizeParameterModulationInput === "function") {
      sources.push(this.normalizeParameterModulationInput(sample, metadata));
    } else if (typeof nodeGraphParamNormalizeModInput === "function") {
      sources.push(nodeGraphParamNormalizeModInput(sample, metadata));
    } else {
      sources.push(sample);
    }
  }
  if (typeof nodeGraphParamFoldModSources === "function") {
    return nodeGraphParamFoldModSources(base, sources, metadata);
  }
  if (typeof this.applyParameterModulation === "function") {
    return this.applyParameterModulation(
      base,
      sources.reduce((a, b) => a + b, 0),
      metadata,
    );
  }
  return base;
};
