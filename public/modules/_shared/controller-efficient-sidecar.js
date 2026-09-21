// Efficient Live: publish Bias/Out for face controllers (not in native graph).
// Must run before syncNativeGraphParams / Additive sidecar so MOD folds work.

/**
 * Efficient Live clears native-owned param smoothers. Knob / Toggle / Momentary
 * are not native — Bias/Out chase here using the SAME Parameter Settings
 * smoother as every other Bias (Lin / 1P / 2P / Papoulis + time).
 *
 * Bias meta may store seconds (0,1) or sample counts (≥1). Normalize to sample
 * counts before create/update — never treat sample counts as seconds.
 */
NodeLiveAudioProcessor.prototype.ensureControllerParamSmoothers = function ensureControllerParamSmoothers() {
  if (!this.controllerParamSmoothers) {
    this.controllerParamSmoothers = new Map();
  }
  return this.controllerParamSmoothers;
};


/** Alt-click: settle controller Bias/Out chase to the new target immediately. */
NodeLiveAudioProcessor.prototype.snapPendingControllerParams = function snapPendingControllerParams(node) {
  const keys = Array.isArray(node?._pendingSnapParams) ? node._pendingSnapParams : [];
  if (!keys.length) return;
  const type = String(node?.type || "");
  if (type !== "knob" && type !== "toggleButton" && type !== "momentaryButton") {
    return;
  }
  const map = this.ensureControllerParamSmoothers();
  for (const controlKey of keys) {
    const raw = Number(node?.params?.[controlKey]);
    if (!Number.isFinite(raw)) continue;
    const meta = { ...(node?.paramMeta?.[controlKey] || {}) };
    const rate = Math.max(
      1,
      nodeGraphFiniteNumber(this.engineSampleRate, nodeGraphFiniteNumber(sampleRate, 44100)),
    );
    const samplesEncoded = typeof nodeGraphDspControllerSmoothingSamples === "function"
      ? nodeGraphDspControllerSmoothingSamples(meta, node?.params, rate)
      : (Number(meta.smoothingSeconds) > 0 && Number(meta.smoothingSeconds) < 1
        ? Math.max(1, Math.round(Number(meta.smoothingSeconds) * rate))
        : Math.max(0, Math.round(Number(meta.smoothingSeconds) || 0)));
    const smootherMeta = {
      ...meta,
      smoothingSeconds: samplesEncoded,
      smoothingMode: meta.smoothingMode || "internal",
    };
    const smootherKey = `controller:${String(node.id)}:${String(controlKey)}`;
    let smoother = map.get(smootherKey);
    if (typeof this.createSmoother === "function") {
      if (!smoother || !smoother.metadata) {
        smoother = this.createSmoother(raw, smootherMeta);
        map.set(smootherKey, smoother);
      } else if (typeof this.updateSmoother === "function") {
        this.updateSmoother(smoother, raw, smootherMeta, smootherKey);
      }
      if (typeof this.settleSmoother === "function") {
        this.settleSmoother(smoother);
      } else {
        smoother.target = raw;
        smoother.current = raw;
        smoother.lastValue = raw;
        smoother.outputBuffer = smoother.targetSignal;
      }
    } else {
      map.set(smootherKey, { value: raw, target: raw, quantumSerial: -1 });
    }
  }
  node._pendingSnapParams = null;
};

NodeLiveAudioProcessor.prototype.controllerEfficientSmoothedValue = function controllerEfficientSmoothedValue(
  node,
  controlKey,
  fallback,
  frames,
) {
  const raw = Number(node?.params?.[controlKey]);
  const target = Number.isFinite(raw) ? raw : fallback;
  const params = node?.params && typeof node.params === "object" ? node.params : {};

  if (typeof nodeGraphDspApplyControllerSmoothingMeta === "function") {
    nodeGraphDspApplyControllerSmoothingMeta(node, controlKey);
  }
  // Consume late snap (setParams may have queued; process runs same quantum).
  if (Array.isArray(node?._pendingSnapParams) && node._pendingSnapParams.includes(String(controlKey))) {
    if (typeof this.snapPendingControllerParams === "function") {
      this.snapPendingControllerParams(node);
    }
  }
  const meta = { ...(node?.paramMeta?.[controlKey] || {}) };

  const rate = Math.max(
    1,
    nodeGraphFiniteNumber(this.engineSampleRate, nodeGraphFiniteNumber(sampleRate, 44100)),
  );
  const quantum = Math.max(1, Math.round(Number(frames) || 128));
  const serial = this._controllerSmoothQuantumSerial;
  const map = this.ensureControllerParamSmoothers();
  const smootherKey = `controller:${String(node?.id || "")}:${String(controlKey || "")}`;

  // Dual encoding: (0,1)=seconds, ≥1=sample counts. Pass sample counts into shared API.
  const samplesEncoded = typeof nodeGraphDspControllerSmoothingSamples === "function"
    ? nodeGraphDspControllerSmoothingSamples(meta, params, rate)
    : 0;
  const seconds = samplesEncoded > 0 ? samplesEncoded / rate : 0;
  const smootherMeta = {
    ...meta,
    smoothingSeconds: samplesEncoded,
    smoothingMode: meta.smoothingMode || "internal",
  };

  // Shared Bias smoother path (createSmoother / FilterAdvance).
  // Pass null key so we are NOT enrolled in worklet activeSmoothers (we advance here).
  if (typeof this.createSmoother === "function" && typeof this.updateSmoother === "function") {
    let smoother = map.get(smootherKey);
    if (!smoother || !smoother.metadata) {
      smoother = this.createSmoother(target, smootherMeta);
      smoother._controllerQuantumSerial = serial;
      map.set(smootherKey, smoother);
      return Number.isFinite(smoother.lastValue) ? smoother.lastValue : target;
    }

    this.updateSmoother(smoother, target, smootherMeta, null);

    // Sidecar may run twice per quantum — advance once.
    if (smoother._controllerQuantumSerial === serial) {
      return Number.isFinite(smoother.lastValue) ? smoother.lastValue : smoother.target;
    }
    smoother._controllerQuantumSerial = serial;

    if (!smoother.linearSmoothing) {
      if (typeof this.settleSmoother === "function") {
        this.settleSmoother(smoother, { snapFilter: false });
      }
      return smoother.target;
    }

    const smoothingSecondsResolved = typeof this.resolveSmoothingSecondsForMode === "function"
      ? this.resolveSmoothingSecondsForMode(
        smoother.smoothingMode,
        smoother.smoothingSeconds || 0,
        quantum,
        rate,
      )
      : (samplesEncoded / rate);
    const safeSeconds = typeof this.clampAutoSmoothingSeconds === "function"
      ? this.clampAutoSmoothingSeconds(smoothingSecondsResolved)
      : Math.max(0, Number(smoothingSecondsResolved) || 0);

    if (!(safeSeconds > 0)) {
      if (typeof this.settleSmoother === "function") {
        this.settleSmoother(smoother);
      }
      return smoother.target;
    }

    const cutoff = typeof this.smoothingFrequencyFromSeconds === "function"
      ? this.smoothingFrequencyFromSeconds(safeSeconds)
      : (1 / safeSeconds);

    if (typeof nodeGraphParameterSmootherFilterAdvance === "function") {
      const signal = nodeGraphParameterSmootherFilterAdvance(
        smoother,
        smoother.targetSignal,
        cutoff,
        rate,
        quantum,
      );
      if (typeof this.smootherNeedsWork === "function" && !this.smootherNeedsWork(smoother)) {
        if (typeof this.settleSmoother === "function") {
          this.settleSmoother(smoother);
        }
        return smoother.target;
      }
      const value = typeof this.normalizedSignalToParameterValue === "function"
        ? this.normalizedSignalToParameterValue(signal, smoother.metadata)
        : signal;
      smoother.current = value;
      smoother.lastValue = value;
      return value;
    }

    if (typeof this.stepSmootherOneSample === "function") {
      this.stepSmootherOneSample(smoother, quantum);
      return Number.isFinite(smoother.lastValue) ? smoother.lastValue : smoother.target;
    }
  }

  // Fallback: linear domain ramp (should not run in Efficient Live worklet).
  if (!(seconds > 0)) {
    map.set(smootherKey, { value: target, target, quantumSerial: serial });
    return target;
  }
  const durationSamples = Math.max(1, Math.round(rate * seconds));
  let state = map.get(smootherKey);
  if (!state || state.metadata) {
    state = {
      value: target,
      target,
      rampFrom: target,
      rampSamples: 0,
      rampDuration: durationSamples,
      seconds,
      quantumSerial: serial,
    };
    map.set(smootherKey, state);
    return target;
  }
  if (state.quantumSerial === serial && Number.isFinite(state.value)) {
    return state.value;
  }
  state.quantumSerial = serial;
  const eps = 1e-9;
  if (Math.abs(target - state.target) > eps) {
    state.rampFrom = state.value;
    state.target = target;
    state.rampSamples = 0;
    state.rampDuration = durationSamples;
    state.seconds = seconds;
  }
  if (state.rampDuration <= 0 || Math.abs(state.value - state.target) <= eps) {
    state.value = state.target;
    return state.value;
  }
  state.rampSamples += quantum;
  if (state.rampSamples >= state.rampDuration) {
    state.value = state.target;
    return state.value;
  }
  const t = state.rampSamples / state.rampDuration;
  state.value = state.rampFrom + (state.target - state.rampFrom) * t;
  return state.value;
};

NodeLiveAudioProcessor.prototype.processControllerEfficientSidecar = function processControllerEfficientSidecar(
  _frames,
) {
  if (!this.efficientProduct || !this.nodes?.size) return;
  if (!this.nodeOutputs) this.nodeOutputs = new Map();
  this._controllerSmoothQuantumSerial = (this._controllerSmoothQuantumSerial || 0) + 1;

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
  const orMask = (dst, src) => {
    if (!(dst instanceof Uint8Array) || !(src instanceof Uint8Array)) return dst;
    if (typeof noteMaskOr === "function") {
      const next = noteMaskOr(dst, src);
      dst.set(next);
      return dst;
    }
    for (let i = 0; i < 128; i += 1) {
      if (src[i]) dst[i] = 1;
    }
    return dst;
  };
  const maskBusy = (m) => {
    if (!(m instanceof Uint8Array)) return 0;
    for (let i = 0; i < 128; i += 1) {
      if (m[i]) return 1;
    }
    return 0;
  };
  const buildKeyboardPlayMask = (nid, cv, signal) => {
    const playMask = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
    const host = typeof nodeGraphChordMemoryHost === "function"
      ? nodeGraphChordMemoryHost()
      : null;
    const mom = host?.chordMemoryMomentaryPlayMask;
    const momOn = mom instanceof Uint8Array && maskBusy(mom);
    if (momOn) {
      orMask(playMask, mom);
      return playMask;
    }
    if (typeof this.mixNoteMask128 === "function") {
      orMask(playMask, this.mixNoteMask128(nid, "Play Keys"));
    }
    if (cv.gateAmp > 0) {
      const raw = Number.isFinite(Number(signal.rawMidi)) ? Number(signal.rawMidi) : cv.midi;
      const midi = Math.max(0, Math.min(127, Math.round(raw)));
      if (typeof noteMaskSet === "function") noteMaskSet(playMask, midi, true);
      else if (midi >= 0 && midi < 128) playMask[midi] = 1;
    }
    return playMask;
  };
  const applyChordMemoryIn = (nid) => {
    const chordKey = typeof this.inputKey === "function"
      ? this.inputKey(nid, "Chord Memory")
      : `${nid}.Chord Memory`;
    const chordConns = this.inputConnections?.get?.(chordKey);
    if (!chordConns || !chordConns.length) {
      if (typeof nodeGraphChordMemoryClearOutLatch === "function") {
        nodeGraphChordMemoryClearOutLatch(nid);
      }
      if (typeof nodeGraphChordMemoryApplyInletMask === "function") {
        const empty = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
        nodeGraphChordMemoryApplyInletMask(nid, empty, this.nodes);
      }
      return;
    }
    if (typeof nodeGraphChordMemoryApplyInletMask !== "function") return;
    let chordMask = typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128);
    for (let ci = 0; ci < chordConns.length; ci += 1) {
      const srcOut = this.nodeOutputs.get(String(chordConns[ci].sourceNode || ""));
      const sp = String(chordConns[ci].sourcePort || "");
      const src = sp === "Arp Keys"
        ? srcOut?.arpMask
        : (sp === "Chord Memory" ? (srcOut?.chordPlayMask || srcOut?.playMask) : srcOut?.playMask);
      if (!(src instanceof Uint8Array)) continue;
      if (typeof noteMaskOr === "function") chordMask = noteMaskOr(chordMask, src);
      else {
        for (let m = 0; m < 128; m += 1) {
          if (src[m]) chordMask[m] = 1;
        }
      }
    }
    nodeGraphChordMemoryApplyInletMask(nid, chordMask, this.nodes);
  };

  const pulseActive = this.midiKeyboardGatePulseSamples > 0;
  const goldMask = this.midiKeyboardArpMask instanceof Uint8Array
    ? this.midiKeyboardArpMask
    : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128));
  const midiPlayMask = this.midiKeyboardPlayMask instanceof Uint8Array
    ? this.midiKeyboardPlayMask
    : (typeof noteMaskCreate === "function" ? noteMaskCreate() : new Uint8Array(128));
  const midiPlayLocal = maskBusy(midiPlayMask);

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

  // Note sources first (Sequencer Play Keys), then Keyboard expands Chord Memory.
  if (!this._sequencerPolyTables) this._sequencerPolyTables = new Map();
  if (!this._sequencerPrevMasks) this._sequencerPrevMasks = new Map();
  {
    const bpmRaw = Number(this.timing?.tempoBpm);
    const bpm = Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : 120;
    const frames = Math.max(1, Number(_frames) || 128);
    const sr = Math.max(8000, Number(this.sampleRate || this.hostSampleRate || sampleRate) || 44100);
    const speed = Math.max(0, Number(this.speedMultiplier) || 0);
    if (this._sequencerNeedsRewind) {
      this._seqTickFrac = 0;
      this._sequencerEngineSec = 0;
      this._seqPostedTick = -1;
      this._sequencerNeedsRewind = false;
    }
    const ticksPerSec = (bpm / 60) * (typeof SEQUENCER_TICKS_PER_BEAT === "number" ? SEQUENCER_TICKS_PER_BEAT : 8);
    const wrapTick = (tick, loop) => {
      const len = Math.max(1, Number(loop) || 32);
      let t = Number(tick);
      if (!Number.isFinite(t)) t = 0;
      t %= len;
      if (t < 0) t += len;
      return t;
    };
    const tickFromRaw = Math.max(0, Number(this._seqTickFrac) || 0);
    const liveIds = new Set();
    let wrapLoop = 32;
    for (const [id, node] of this.nodes) {
      if (String(node?.type || "") !== "sequencer") continue;
      const nid = String(id);
      liveIds.add(nid);
      const clip = node.sequencer && typeof node.sequencer === "object"
        ? node.sequencer
        : { loopTicks: 32, notes: [] };
      const loop = Math.max(1, Number(clip.loopTicks) || 32);
      if (liveIds.size === 1) wrapLoop = loop;
      const tickFrom = wrapTick(tickFromRaw, loop);
      const silent = Boolean(node.bypassed);
      const sounding = silent
        ? []
        : (typeof sequencerSoundingInRange === "function"
          ? sequencerSoundingInRange(clip, tickFrom, tickFrom + 1, loop)
          : (typeof sequencerSoundingAt === "function"
            ? sequencerSoundingAt(clip, tickFrom)
            : []));
      const prev = this._sequencerPrevMasks.get(nid);
      const outs = typeof sequencerOutputsFromNotes === "function"
        ? sequencerOutputsFromNotes(sounding, 0, prev)
        : { play: 0, poly: 0, gate: 0, trigger: 0, pitch: 0, freq: 0, mask: new Uint8Array(128), table: new Uint8Array(128) };
      this._sequencerPrevMasks.set(nid, outs.mask);
      this._sequencerPolyTables.set(nid, outs.table);
      this.nodeOutputs.set(nid, {
        "Play Keys": silent ? 0 : maskBusy(outs.mask),
        playMask: outs.mask,
        Gate: silent ? 0 : outs.gate,
        Trigger: silent ? 0 : outs.trigger,
        "0.1V/Oct": silent ? 0 : outs.pitch,
        f: silent ? 0 : outs.freq,
        Frequency: silent ? 0 : outs.freq,
      });
    }
    let hasNotes = false;
    for (const id of liveIds) {
      const node = this.nodes.get(id);
      const notes = node?.sequencer?.notes;
      if (Array.isArray(notes) && notes.length) {
        hasNotes = true;
        break;
      }
    }
    if (liveIds.size && speed > 0 && hasNotes) {
      this._seqTickFrac = wrapTick(
        tickFromRaw + (frames / sr) * speed * ticksPerSec,
        wrapLoop,
      );
      this._sequencerEngineSec = this._seqTickFrac / ticksPerSec;
    } else if (!liveIds.size) {
      this._seqTickFrac = 0;
      this._sequencerEngineSec = 0;
    }
    {
      const tickI = Math.floor(wrapTick(tickFromRaw, wrapLoop)) | 0;
      if (liveIds.size && tickI !== this._seqPostedTick) {
        this._seqPostedTick = tickI;
        try {
          this.port.postMessage({ type: "seqPlayhead", tick: tickI, loop: wrapLoop });
        } catch (_e) { /* ignore */ }
      }
      const cmHost = typeof nodeGraphChordMemoryHost === "function"
        ? nodeGraphChordMemoryHost()
        : null;
      const cmActive = cmHost?.chordMemoryActiveSlots;
      const hasSlots = cmActive instanceof Map && cmActive.size > 0;
      if (hasSlots || this._chordSlotBitsKey) {
        const slotBitsByNode = hasSlots && typeof nodeGraphChordMemorySlotBitsByNode === "function"
          ? nodeGraphChordMemorySlotBitsByNode()
          : {};
        const soundingByNode = hasSlots && typeof nodeGraphChordMemorySoundingBitsByNode === "function"
          ? nodeGraphChordMemorySoundingBitsByNode()
          : {};
        let slotKey = "";
        for (const id in slotBitsByNode) {
          if (!Object.prototype.hasOwnProperty.call(slotBitsByNode, id)) continue;
          slotKey += id;
          slotKey += ":";
          const arr = slotBitsByNode[id];
          if (Array.isArray(arr)) {
            for (let i = 0; i < arr.length; i += 1) {
              slotKey += arr[i];
              slotKey += ",";
            }
          }
          slotKey += ";";
        }
        slotKey += "|";
        for (const id in soundingByNode) {
          if (!Object.prototype.hasOwnProperty.call(soundingByNode, id)) continue;
          slotKey += id;
          slotKey += ":";
          const arr = soundingByNode[id];
          if (Array.isArray(arr)) {
            for (let i = 0; i < arr.length; i += 1) {
              slotKey += arr[i];
              slotKey += ",";
            }
          }
          slotKey += ";";
        }
        if (slotKey !== this._chordSlotBitsKey) {
          this._chordSlotBitsKey = slotKey;
          try {
            this.port.postMessage({ type: "chordMemorySlots", slotBitsByNode, soundingByNode });
          } catch (_e) { /* ignore */ }
        }
      }
    }
    for (const id of [...this._sequencerPolyTables.keys()]) {
      if (!liveIds.has(id)) {
        this._sequencerPolyTables.delete(id);
        this._sequencerPrevMasks.delete(id);
      }
    }
  }

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
      applyChordMemoryIn(nid);
      const playMask = buildKeyboardPlayMask(nid, cv, signal);
      const arpInMask = typeof this.mixNoteMask128 === "function"
        ? this.mixNoteMask128(nid, "Arp Keys")
        : goldMask;
      const arpMask = typeof noteMaskOr === "function" ? noteMaskOr(goldMask, arpInMask) : goldMask;
      const chordMask = typeof nodeGraphChordMemoryOutMaskForNode === "function"
        ? nodeGraphChordMemoryOutMaskForNode(nid)
        : null;
      const chordPlayMask = typeof nodeGraphChordMemoryLiveMaskForNode === "function"
        ? nodeGraphChordMemoryLiveMaskForNode(nid)
        : null;
      const outs = {
        "Play Keys": maskBusy(playMask),
        "Arp Keys": maskBusy(arpMask),
        "Chord Memory": maskBusy(chordMask),
        playMask,
        chordMask: chordMask instanceof Uint8Array ? chordMask : null,
        chordPlayMask: chordPlayMask instanceof Uint8Array ? chordPlayMask : null,
        arpMask,
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
      this.nodeOutputs.set(nid, {
        "Play Keys": midiPlayLocal,
        playMask: this.midiKeyboardPlayMask instanceof Uint8Array
          ? this.midiKeyboardPlayMask
          : null,
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
    applyChordMemoryIn(nid);
    const playMask2 = buildKeyboardPlayMask(nid, cv, signal);
    const arpInMask2 = typeof this.mixNoteMask128 === "function"
      ? this.mixNoteMask128(nid, "Arp Keys")
      : goldMask;
    const arpMask2 = typeof noteMaskOr === "function" ? noteMaskOr(goldMask, arpInMask2) : goldMask;
    const chordMask2 = typeof nodeGraphChordMemoryOutMaskForNode === "function"
      ? nodeGraphChordMemoryOutMaskForNode(nid)
      : null;
    const chordPlayMask2 = typeof nodeGraphChordMemoryLiveMaskForNode === "function"
      ? nodeGraphChordMemoryLiveMaskForNode(nid)
      : null;
    this.nodeOutputs.set(nid, {
      ...prev,
      "Play Keys": maskBusy(playMask2),
      "Arp Keys": maskBusy(arpMask2),
      "Chord Memory": maskBusy(chordMask2),
      playMask: playMask2,
      chordMask: chordMask2 instanceof Uint8Array ? chordMask2 : prev.chordMask,
      chordPlayMask: chordPlayMask2 instanceof Uint8Array ? chordPlayMask2 : prev.chordPlayMask,
      arpMask: arpMask2,
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
        // Bias jack = smoothed Bias parameter + In. Smoothing is Parameter
        // Settings on `offset` (same Control smoother as any other param).
        // Do not remap or clamp here — min/max already bound the target.
        const offset = num(this.controllerEfficientSmoothedValue(node, "offset", 0, _frames), 0);
        const out = typeof nodeGraphDspBiasFromIn === "function"
          ? nodeGraphDspBiasFromIn(offset, mixIn(nid, "In"))
          : { Bias: offset, Out: offset, offset, value: offset };
        this.nodeOutputs.set(nid, out);
        if (typeof this.captureModuleScopeOutput === "function") {
          this.captureModuleScopeOutput(nid, out);
        }
        continue;
      }

      if (type === "toggleButton" || type === "momentaryButton") {
        const mapped = num(this.controllerEfficientSmoothedValue(node, "offset", 0, _frames), 0);
        const btnOut = { Bias: mapped };
        this.nodeOutputs.set(nid, btnOut);
        if (typeof this.captureModuleScopeOutput === "function") {
          this.captureModuleScopeOutput(nid, btnOut);
        }
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
  // Controllers publish smoothed Bias/Out in nodeOutputs — prefer that over
  // raw params (parameterOutputExists is a params-key check and must not win).
  const controllerType = String(node?.type || "");
  if (
    controllerType === "knob"
    || controllerType === "toggleButton"
    || controllerType === "momentaryButton"
  ) {
    const cout = this.nodeOutputs?.get?.(id);
    if (cout && typeof cout === "object") {
      let cv = cout[sp];
      if (cv == null && (sp === "Out" || sp === "Ext Out" || sp === "Bias")) {
        cv = cout.Bias ?? cout.Out ?? cout["Ext Out"] ?? cout.value;
      }
      const cn = Number(cv);
      if (Number.isFinite(cn)) {
        return cn;
      }
    }
  }
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
      const srcNodeLive = this.nodes?.get?.(String(m.sourceNode || ""));
      const srcTypeLive = String(srcNodeLive?.type || "");
      const dstTypeLive = String(node?.type || "");
      const needsNormPitchLive = typeof nodeGraphIsNormPitchFrequencyParam === "function"
        && nodeGraphIsNormPitchFrequencyParam(dstTypeLive, pk);
      // PitchHz→norm-Frequency must not rely on raw-Hz ParamModEdge (clamped to 1).
      // Fall through to host conversion below.
      if (!(needsNormPitchLive && srcTypeLive === "pitchHz")) {
        // Values stamp via ParamModEdge; still classify so domainReplace bit4 is
        // pushed — otherwise |v|<=1 live samples unit-band add the knob.
        const srcPort = String(m.sourcePort || "");
        const srcParamMeta = srcNodeLive?.paramMeta?.[srcPort] || {};
        const taggedDomain = srcParamMeta.outputDomain === true
          || srcTypeLive === "range"
          || srcTypeLive === "Range"
          || metadata.outputDomain === true;
        if (taggedDomain) {
          sources.push({ value: 0, domain: true });
        }
        continue;
      }
    }
    const sample = this.readEfficientModSourceSample(m.sourceNode, m.sourcePort);
    let normalized;
    if (typeof this.normalizeParameterModulationInput === "function") {
      normalized = this.normalizeParameterModulationInput(sample, metadata);
    } else if (typeof nodeGraphParamNormalizeModInput === "function") {
      normalized = nodeGraphParamNormalizeModInput(sample, metadata);
    } else {
      normalized = sample;
    }
    // Prefer explicit domain tags (PARAM OUT outputDomain, Range Out, …)
    // over the |mod|>1 magnitude cliff so engineering-unit sources REPLACE.
    const srcNode = this.nodes?.get?.(String(m.sourceNode || ""));
    const srcPort = String(m.sourcePort || "");
    const srcParamMeta = srcNode?.paramMeta?.[srcPort] || {};
    const srcType = String(srcNode?.type || "");
    // PitchHz / Knob / Bias → Superlove/… Frequency (0…1 pitch-norm).
    const dstType = String(node?.type || "");
    if (typeof nodeGraphNormPitchFrequencyModFromSource === "function") {
      const converted = nodeGraphNormPitchFrequencyModFromSource(
        dstType, pk, srcType, srcNode, sample,
      );
      if (converted) {
        sources.push(converted);
        continue;
      }
    }
    const taggedDomain = srcParamMeta.outputDomain === true
      || srcType === "range"
      || srcType === "Range"
      || metadata.outputDomain === true;
    if (taggedDomain) {
      sources.push({ value: Number(normalized), domain: true });
    } else {
      sources.push(normalized);
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
  if (!sources.length) return { unitAdd: 0, domainAdd: 0, domainReplace: false };
  const metadata = node?.paramMeta?.[key] || {};
  if (typeof nodeGraphParamModAccumulators === "function") {
    return nodeGraphParamModAccumulators(sources, metadata);
  }
  // Fallback: treat every source as domain-replace if helper missing.
  let domainAdd = 0;
  for (let i = 0; i < sources.length; i += 1) {
    const n = Number(sources[i]?.value != null ? sources[i].value : sources[i]);
    if (Number.isFinite(n)) domainAdd += n;
  }
  return { unitAdd: 0, domainAdd, domainReplace: sources.length > 0 };
};

/** Fold patch modulations onto a DOMAIN base (after smooth; never into Control.target). */
NodeLiveAudioProcessor.prototype.foldEfficientParamModulations = function foldEfficientParamModulations(
  node,
  key,
  base,
) {
  const sources = this.readEfficientParamModSources(node, key);
  const metadata = node?.paramMeta?.[key] || {};
  // Domain mode: offset applies even with no mod wires.
  if (!sources.length && !(metadata && metadata.outputDomain === true)) return base;
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
