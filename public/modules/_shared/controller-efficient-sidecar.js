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

  // Keyboard (local) vs MIDI (hardware) — separate signals; Keyboard mixes INs.
  const transmitMask = (mask, phase) => (typeof noteMaskTransmit === "function"
    ? noteMaskTransmit(mask, phase)
    : 0);
  const orTransmit = (values, phaseOn) => {
    if (typeof noteMaskOrTransmit === "function") {
      return noteMaskOrTransmit(values, phaseOn);
    }
    return 0;
  };
  const collectIn = (nodeId, port) => {
    const key = typeof this.inputKey === "function"
      ? this.inputKey(nodeId, port)
      : `${nodeId}.${port}`;
    const conns = this.inputConnections?.get?.(key);
    if (!conns || !conns.length) return [];
    const vals = [];
    for (let i = 0; i < conns.length; i += 1) {
      const c = conns[i];
      if (!c) continue;
      const out = this.nodeOutputs.get(String(c.sourceNode));
      if (!out) continue;
      const sp = String(c.sourcePort || "");
      vals.push(num(out[sp] ?? out.Bias ?? out.Out ?? out.value, 0));
    }
    return vals;
  };
  const mixMax = (nodeId, port) => {
    const vals = collectIn(nodeId, port);
    if (!vals.length) return 0;
    return Math.max(0, ...vals);
  };

  const pulseActive = this.midiKeyboardGatePulseSamples > 0;
  this.midiKeyboardHeldKeysPhase = ((this.midiKeyboardHeldKeysPhase | 0) + 1) % 3;
  const phaseOn = this.midiKeyboardHeldKeysPhase;
  const arpLocal = transmitMask(
    this.midiKeyboardArpMask instanceof Uint8Array
      ? this.midiKeyboardArpMask
      : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128)),
    phaseOn,
  );
  const midiPlayLocal = transmitMask(
    this.midiKeyboardPlayMask instanceof Uint8Array
      ? this.midiKeyboardPlayMask
      : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128)),
    phaseOn,
  );

  if (!this._keyboardCvHold) this._keyboardCvHold = new Map();
  const buildCv = (signal, usePulse, holdKey) => {
    const prev = this._keyboardCvHold.get(holdKey) || {};
    const sourceMidi = Number(signal.midi);
    const midi = Math.max(0, Math.min(127, Math.round(
      Number.isFinite(sourceMidi) ? sourceMidi : num(prev.midi, 60),
    )));
    const key = Math.max(0, Math.min(24, Math.round(
      Number.isFinite(Number(signal.keyIndex)) ? Number(signal.keyIndex) : num(prev.key, 0),
    )));
    const q = Math.max(0, Math.min(1,
      Number.isFinite(Number(signal.keyQuantized))
        ? Number(signal.keyQuantized)
        : num(prev.q, key / 24),
    ));
    const velocity01 = Math.max(0, Math.min(1,
      Number.isFinite(Number(signal.velocity))
        ? Number(signal.velocity)
        : num(prev.velocity01, 0),
    ));
    // Gate / Trigger = digital presence (any > 0 → 1). Velocity stays on Velo outs.
    const gateAmp = num(signal.gate, 0) > 0 ? 1 : 0;
    const triggerAmp = (usePulse && pulseActive) || num(signal.gatePulse, 0) > 0 ? 1 : 0;
    const sourceFreq = Number(signal.frequency);
    const frequency = Math.max(0,
      Number.isFinite(sourceFreq) && sourceFreq > 0
        ? sourceFreq
        : num(prev.frequency, 440 * (2 ** ((midi - 69) / 12))),
    );
    const safeRate = Math.max(1, nodeGraphFiniteNumber(this.engineSampleRate, nodeGraphFiniteNumber(sampleRate, 44100)));
    const increment = Math.max(0, frequency / safeRate);
    const cv = {
      midi,
      key,
      q,
      velocity01,
      gateAmp,
      triggerAmp,
      frequency,
      increment,
      x: Math.max(0, Math.min(1, Number.isFinite(Number(signal.x)) ? Number(signal.x) : num(prev.x, q))),
      y: Math.max(0, Math.min(1, Number.isFinite(Number(signal.y)) ? Number(signal.y) : num(prev.y, 0))),
      tenth: Math.max(0, Math.min(1, midi / 120)),
    };
    this._keyboardCvHold.set(holdKey, cv);
    return cv;
  };

  // Pass 1: MIDI from hardware signal; Keyboard base from local signal.
  for (const [id, node] of this.nodes) {
    const nodeType = String(node?.type || "");
    if (nodeType !== "keyboardController" && nodeType !== "keyboard" && nodeType !== "gridKeyboard") continue;
    const nid = String(id);
    const isKeyboard = nodeType === "keyboard" || nodeType === "gridKeyboard";
    const isGrid = nodeType === "gridKeyboard";
    const signal = isKeyboard
      ? (this.keyboardModuleSignal || {})
      : (this.midiKeyboardSignal || {});
    const cv = buildCv(signal, !isKeyboard || pulseActive, isKeyboard ? "keyboard" : "midi");
    if (isKeyboard) {
      const gateOut = Math.max(cv.gateAmp, mixMax(nid, "Gate"));
      const triggerOut = Math.max(cv.triggerAmp, mixMax(nid, "Trigger"));
      const arpIn = collectIn(nid, "Arp Keys");
      const arpOut = orTransmit([arpLocal, ...arpIn], phaseOn);
      const playIn = collectIn(nid, "Play Keys");
      let playLocal = 0;
      if (cv.gateAmp > 0) {
        const raw = Number.isFinite(Number(signal.rawMidi)) ? Number(signal.rawMidi) : cv.midi;
        const one = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
        const midi = Math.max(0, Math.min(127, Math.round(raw)));
        if (typeof noteMaskSet === "function") noteMaskSet(one, midi, true);
        else one[midi] = 1;
        playLocal = transmitMask(one, phaseOn);
      }
      const playOut = orTransmit([playLocal, ...playIn], phaseOn);
      // Polyphony jack sample is cosmetic — Voices SSOT is VoiceManager events.
      const polyOut = cv.gateAmp > 0
        ? ((cv.midi | 0) + Math.min(1, Math.max(0, cv.velocity01)) / 128)
        : 0;
      const outs = {
        "Play Keys": playOut,
        "Arp Keys": arpOut,
        Polyphony: polyOut,
        Gate: gateOut,
        Trigger: triggerOut,
        f: cv.frequency,
        Frequency: cv.frequency,
        X: cv.x,
        Y: cv.y,
      };
      if (!isGrid) {
        outs.KeyboardKey = cv.key;
        outs.KeyboardNorm = cv.q;
        outs["Note#/127"] = Math.max(0, Math.min(1, cv.midi / 127));
        outs["Velo#/127"] = cv.velocity01;
        outs["Velocity#/127"] = cv.velocity01;
        outs["0.1V/Oct"] = cv.tenth;
        outs["0.1v/Oct"] = cv.tenth;
      }
      this.nodeOutputs.set(nid, outs);
    } else {
      const polyOut = typeof polyphonyTableWireSample === "function"
        ? polyphonyTableWireSample(this.midiPolyphonyVelocities)
        : 0;
      this.nodeOutputs.set(nid, {
        "Play Keys": midiPlayLocal,
        Polyphony: polyOut,
        Gate: cv.gateAmp,
        Trigger: cv.triggerAmp,
        "Note#/127": Math.max(0, Math.min(1, cv.midi / 127)),
        "Velocity#/127": cv.velocity01,
        "0.1V/Oct": cv.tenth,
        "0.1v/Oct": cv.tenth,
        Frequency: cv.frequency,
        f: cv.frequency,
        X: cv.x,
        Y: cv.y,
      });
    }
  }
  // Pass 2: Keyboard INs can read MIDI (and other) outs published above.
  for (const [id, node] of this.nodes) {
    if (String(node?.type || "") !== "keyboard" && String(node?.type || "") !== "gridKeyboard") continue;
    const nid = String(id);
    const prev = this.nodeOutputs.get(nid) || {};
    const signal = this.keyboardModuleSignal || {};
    // Keep pulseActive so Trigger is not wiped when gatePulse was already
    // consumed into midiKeyboardGatePulseSamples by normalize.
    const cv = buildCv(signal, pulseActive, "keyboard");
    const gateOut = Math.max(cv.gateAmp, mixMax(nid, "Gate"));
    const triggerOut = Math.max(cv.triggerAmp, mixMax(nid, "Trigger"));
    const arpOut = orTransmit([arpLocal, ...collectIn(nid, "Arp Keys")], phaseOn);
    let playLocal = 0;
    if (cv.gateAmp > 0) {
      const raw = Number.isFinite(Number(signal.rawMidi)) ? Number(signal.rawMidi) : cv.midi;
      const one = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
      const midi = Math.max(0, Math.min(127, Math.round(raw)));
      if (typeof noteMaskSet === "function") noteMaskSet(one, midi, true);
      else one[midi] = 1;
      playLocal = transmitMask(one, phaseOn);
    }
    const playOut = orTransmit([playLocal, ...collectIn(nid, "Play Keys")], phaseOn);
    const polyOut = cv.gateAmp > 0
      ? ((cv.midi | 0) + Math.min(1, Math.max(0, cv.velocity01)) / 128)
      : 0;
    this.nodeOutputs.set(nid, {
      ...prev,
      "Play Keys": playOut,
      "Arp Keys": arpOut,
      Polyphony: polyOut,
      Gate: gateOut,
      Trigger: triggerOut,
    });
  }
  if (pulseActive) {
    this.midiKeyboardGatePulseSamples = Math.max(0, (this.midiKeyboardGatePulseSamples || 0) - 1);
  }

  // Two passes so controller→controller In chains resolve.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [id, node] of this.nodes) {
      const type = String(node?.type || "");
      const p = node?.params || node?.parameters || {};
      const nid = String(id);

      if (type === "keyboardController" || type === "keyboard" || type === "gridKeyboard") {
        continue;
      }

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

      // curveEnvelopeMod / pluckEnvelopeMod: native graph opcodes 70/72.
      // Strips harvested from Mono in publishNativeGraphScopeTaps — no JS bake.
      if (type === "curveEnvelopeMod" || type === "pluckEnvelopeMod") {
        continue;
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
  // 1D Phosphor Thru / Vector RGB / other observer outs are dry passthrough —
  // they are not native nodes and never publish nodeOutputs. Walk to upstream.
  if (
    node
    && typeof this.nativeGraphThruInPortForNode === "function"
    && this.nativeGraphThruInPortForNode(node, sp)
    && typeof this.resolveNativeGraphThruSources === "function"
  ) {
    const nativeIds = this._nativeGraphNodeIds instanceof Set
      ? this._nativeGraphNodeIds
      : null;
    const resolved = this.resolveNativeGraphThruSources(id, sp, nativeIds, 0);
    if (resolved.length) {
      let sum = 0;
      let any = false;
      for (let i = 0; i < resolved.length; i += 1) {
        const r = resolved[i];
        const rid = String(r?.sourceNode || "");
        if (!rid || rid === id) continue;
        const sample = this.readEfficientModSourceSample(rid, r?.sourcePort);
        if (Number.isFinite(sample)) {
          sum += sample;
          any = true;
        }
      }
      if (any) return sum;
    }
  }
  const out = this.nodeOutputs?.get?.(id);
  if (!out) return 0;
  let v = out[sp];
  if (v == null && (sp === "Out" || sp === "Ext Out")) {
    v = out["Ext Out"] ?? out.Out ?? out.Mono ?? out.Bias;
  } else if (v == null && sp === "Bias") {
    v = out.Out ?? out["Ext Out"];
  } else if (v == null && sp === "Mono") {
    v = out.Mono ?? out["Ext Out"] ?? out.Out;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Sample MOD sources for one param (efficient path; no frameValues). */
NodeLiveAudioProcessor.prototype.readEfficientParamModSources = function readEfficientParamModSources(
  node,
  key,
) {
  const mods = this.modulationConnections?.get?.(this.parameterKey(node?.id, key));
  if (!mods || !mods.length) return [];
  const metadata = node?.paramMeta?.[key] || {};
  const sources = [];
  const dstId = String(node?.id || "");
  const liveMods = this._nativeLiveParamModKeys || this._nativePhaseModLiveKeys;
  const pk = String(key || "");
  for (let i = 0; i < mods.length; i += 1) {
    const m = mods[i];
    if (!m) continue;
    // Native audio→param is ParamModEdge (sample-accurate, ordered). Skip quantum
    // set_param_mod so S&H→atten→Frequency is not double-applied / stale ZOH.
    if (
      liveMods
      && liveMods.size
      && liveMods.has(`${dstId}\0${pk}\0${String(m.sourceNode || "")}\0${String(m.sourcePort || "")}`)
    ) {
      continue;
    }
    const sample = this.readEfficientModSourceSample(m.sourceNode, m.sourcePort);
    if (typeof this.normalizeParameterModulationInput === "function") {
      sources.push(this.normalizeParameterModulationInput(sample, metadata));
    } else if (typeof nodeGraphParamNormalizeModInput === "function") {
      sources.push(nodeGraphParamNormalizeModInput(sample, metadata));
    } else {
      sources.push(sample);
    }
  }
  return sources;
};

/**
 * Unit/domain MOD accumulators for native set_param_mod.
 * @returns {{ unitAdd: number, domainAdd: number }}
 */
NodeLiveAudioProcessor.prototype.efficientParamModAccumulators = function efficientParamModAccumulators(
  node,
  key,
) {
  const sources = this.readEfficientParamModSources(node, key);
  if (!sources.length) return { unitAdd: 0, domainAdd: 0 };
  const metadata = node?.paramMeta?.[key] || {};
  if (typeof nodeGraphParamModAccumulators === "function") {
    return nodeGraphParamModAccumulators(sources, metadata);
  }
  // Fallback: treat every source as domain-add if helper missing.
  let domainAdd = 0;
  for (let i = 0; i < sources.length; i += 1) {
    const n = Number(sources[i]);
    if (Number.isFinite(n)) domainAdd += n;
  }
  return { unitAdd: 0, domainAdd };
};

/** Fold patch modulations onto a DOMAIN base (after smooth; never into Control.target). */
NodeLiveAudioProcessor.prototype.foldEfficientParamModulations = function foldEfficientParamModulations(
  node,
  key,
  base,
) {
  const sources = this.readEfficientParamModSources(node, key);
  if (!sources.length) return base;
  const metadata = node?.paramMeta?.[key] || {};
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
