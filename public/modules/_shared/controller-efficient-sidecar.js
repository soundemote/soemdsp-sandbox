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

  // Publish MIDI Keyboard once per quantum (not a native graph type).
  // Frequency / Gate / 0.1V/Oct must exist in nodeOutputs before host→native
  // live-port folds (ƒ, pitch CV) run in syncNativeGraphParams.
  let keyboardGatePulseLatched = this.midiKeyboardGatePulseSamples > 0 ? 1 : 0;
  for (const [id, node] of this.nodes) {
    if (String(node?.type || "") !== "keyboardController") continue;
    const nid = String(id);
    const signal = this.midiKeyboardSignal || {};
    const hasIn = (port) => {
      const key = typeof this.inputKey === "function"
        ? this.inputKey(nid, port)
        : `${nid}.${port}`;
      const conns = this.inputConnections?.get?.(key);
      return Array.isArray(conns) && conns.length > 0;
    };
    const resetActive = hasIn("Reset") && mixIn(nid, "Reset") > 0;
    const manualRawMidi = Number.isFinite(Number(signal.rawMidi))
      ? Number(signal.rawMidi)
      : num(signal.midi, 60);
    const manualOctave = num(signal.octave, 0);
    const octave = hasIn("Octave")
      ? Math.max(-6, Math.min(6, Math.round(mixIn(nid, "Octave") || 0)))
      : manualOctave;
    const rawMidi = resetActive
      ? 60
      : (hasIn("MIDI Note") ? (mixIn(nid, "MIDI Note") || 0) : manualRawMidi);
    const midi = Math.max(0, Math.min(127, Math.round(rawMidi + octave * 12)));
    const automatedPitch = resetActive || hasIn("MIDI Note") || hasIn("Octave");
    const key = automatedPitch
      ? Math.max(0, Math.min(24, Math.round(rawMidi) - 48))
      : Math.max(0, Math.min(24, Math.round(num(signal.keyIndex, 12))));
    const frequency = Math.max(0, 440 * (2 ** ((midi - 69) / 12)));
    const safeRate = Math.max(1, Number(this.engineSampleRate) || Number(sampleRate) || 44100);
    const increment = Math.max(0, frequency / safeRate);
    const q = automatedPitch
      ? key / 24
      : Math.max(0, Math.min(1, num(signal.keyQuantized, key / 24)));
    const x = resetActive ? 0.5 : (hasIn("X")
      ? Math.max(0, Math.min(1, mixIn(nid, "X") || 0))
      : Math.max(0, Math.min(1, num(signal.x, q))));
    const y = resetActive ? 0 : (hasIn("Y")
      ? Math.max(0, Math.min(1, mixIn(nid, "Y") || 0))
      : Math.max(0, Math.min(1, num(signal.y, 0))));
    const gate = resetActive ? 0 : (hasIn("Gate")
      ? (mixIn(nid, "Gate") > 0 ? 1 : 0)
      : (num(signal.gate, 0) > 0 ? 1 : 0));
    const hold = hasIn("Hold") && mixIn(nid, "Hold") > 0 ? 1 : 0;
    const velocity01 = hasIn("Velocity")
      ? Math.max(0, Math.min(1, mixIn(nid, "Velocity") || 0))
      : Math.max(0, Math.min(1, num(signal.velocity, 0)));
    const velocityNumber = Math.round(velocity01 * 127);
    let heldKeysTransmitValue = this.midiKeyboardHeldKeysLowBitmask || 0;
    if (this.midiKeyboardHeldKeysHighBitmask) {
      this.midiKeyboardHeldKeysPhase = this.midiKeyboardHeldKeysPhase ? 0 : 1;
      if (this.midiKeyboardHeldKeysPhase) {
        heldKeysTransmitValue = (2 ** 49) + this.midiKeyboardHeldKeysHighBitmask;
      }
    }
    const tenth = Math.max(0, Math.min(1, midi / 120));
    this.nodeOutputs.set(nid, {
      Trigger: hasIn("Gate") ? gate : keyboardGatePulseLatched,
      "0.1V/Oct": tenth,
      "0.1v/Oct": tenth,
      "Note#/127": Math.max(0, Math.min(1, midi / 127)),
      Frequency: frequency,
      Gate: Math.max(gate, hold),
      "Inc.": increment,
      Increment: increment,
      KeyboardKey: key,
      "Note#": midi,
      KeyboardNorm: q,
      "Velocity#": velocityNumber,
      "Velocity#/127": velocity01,
      X: x,
      Y: y,
      "Held Keys": heldKeysTransmitValue,
    });
  }
  if (keyboardGatePulseLatched) {
    this.midiKeyboardGatePulseSamples = Math.max(0, (this.midiKeyboardGatePulseSamples || 0) - 1);
  }

  // Two passes so controller→controller In chains resolve.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [id, node] of this.nodes) {
      const type = String(node?.type || "");
      const p = node?.params || node?.parameters || {};
      const nid = String(id);

      if (type === "keyboardController") {
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
  const out = this.nodeOutputs?.get?.(id);
  if (!out) return 0;
  const v = out[sp] ?? (sp === "Out" ? out.Bias : null) ?? (sp === "Bias" ? out.Out : null);
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
