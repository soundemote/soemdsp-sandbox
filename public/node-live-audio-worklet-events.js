// Extracted from node-live-audio-worklet-core.js (Phase D — events + connections).
// Load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.setInputWireBreakTrigger = function setInputWireBreakTrigger(nodeId, port) {
    if (!nodeId || !port) return;
    this.inputWireBreakTriggers.set(this.inputKey(nodeId, port), 1);
    // Efficient native graph: mixInputPort is skipped, so also queue a one-shot
    // live-port poke consumed on the next process_block.
    if (
      this.efficientProduct
      && this.nativeGraphCompiled
      && this.nativeGraphHandle
      && this.nativeGraph?.soemdsp_graph_poke_input
    ) {
      try {
        const hash = this.fnv1aHash32(String(nodeId));
        const node = this.nodes?.get?.(String(nodeId));
        const type = String(node?.type || "");
        const portId = typeof this.mapNativeGraphDstPortId === "function"
          ? this.mapNativeGraphDstPortId(port, type)
          : 0;
        if (hash && portId != null) {
          this.nativeGraph.soemdsp_graph_poke_input(this.nativeGraphHandle, hash, portId | 0, 1);
        }
      } catch (_e) {
        /* keep JS-path trigger even if native poke fails */
      }
    }
};

NodeLiveAudioProcessor.prototype.setSpeed = function setSpeed(speed) {
    const value = Number(speed);
    const next = Number.isFinite(value) ? Math.max(0, value) : 1;
    const wasStopped = !(Number(this.speedMultiplier) > 0);
    this.speedMultiplier = next;
    // Pause→Play (speed 0→>0) without tearing down the worklet: snap osc phases
    // to 0 so PolyBLEP does not resume at a leftover phase.
    if (wasStopped && next > 0 && this.phases instanceof Map) {
      for (const id of this.phases.keys()) {
        this.phases.set(id, 0);
      }
      if (this.triangleStates instanceof Map) {
        for (const id of this.triangleStates.keys()) {
          this.triangleStates.set(id, 0);
        }
      }
      if (this.polyBlepStates instanceof Map) {
        for (const state of this.polyBlepStates.values()) {
          if (state?.nativeHandle && this.nativePolyBlep?.soemdsp_polyblep_reset) {
            try { this.nativePolyBlep.soemdsp_polyblep_reset(state.nativeHandle); } catch (_e) { /* ignore */ }
          }
        }
      }
    }
};

NodeLiveAudioProcessor.prototype.setSpeedLimit = function setSpeedLimit(limit) {
    const value = Number(limit);
    this.speedLimit = Number.isFinite(value) && value > 0 ? value : 20000;
};

NodeLiveAudioProcessor.prototype.speedLimitHz = function speedLimitHz() {
    const value = Number(this.speedLimit);
    return Number.isFinite(value) && value > 0 ? value : 20000;
};

/**
 * Absolute-Hz ƒ jack when wired; null if unwired.
 * Mirrors nodeGraphResolveAbsHzJack / nodeGraphReadFInputHz.
 */
NodeLiveAudioProcessor.prototype.readFInputHz = function readFInputHz(mixInput, nodeId, _port = "f") {
    const hasInput = this.boundHasInput
      || ((id, port) => this.hasInputPort(id, port));
    if (typeof nodeGraphResolveAbsHzJack === "function") {
      return nodeGraphResolveAbsHzJack(hasInput, mixInput, nodeId);
    }
    if (typeof hasInput === "function" && typeof mixInput === "function" && nodeId && hasInput(nodeId, "f")) {
      return mixInput(nodeId, "f");
    }
    return null;
};

/**
 * Wired ƒ = absolute Hz; else 0.1V/Oct pitches the Frequency / cutoff knob.
 * Worklet twin of nodeGraphFrequencyHzFromKnobOrF.
 */
NodeLiveAudioProcessor.prototype.frequencyHzFromKnobOrF = function frequencyHzFromKnobOrF(
  knobHz,
  mixInput,
  nodeId,
) {
    if (typeof nodeGraphFrequencyHzFromKnobOrF === "function") {
      const hasInput = this.boundHasInput
        || ((id, port) => this.hasInputPort(id, port));
      return nodeGraphFrequencyHzFromKnobOrF(knobHz, hasInput, mixInput, nodeId);
    }
    const jack = this.readFInputHz(mixInput, nodeId);
    if (jack != null) {
      const n = Number(jack);
      return Number.isFinite(n) ? n : 0;
    }
    const k = Number(knobHz);
    return Number.isFinite(k) ? k : 0;
};

/**
 * Clamp signed Hz to ±Speed Limit.
 * Second arg ignored (legacy ƒ×Frequency multiply removed — wired ƒ cancels the knob).
 */
NodeLiveAudioProcessor.prototype.resolveFrequencyHz = function resolveFrequencyHz(baseHz, _fHzOrNull) {
    const maxHz = this.speedLimitHz();
    const base = Number(baseHz);
    if (!Number.isFinite(base)) return 0;
    if (base > maxHz) return maxHz;
    if (base < -maxHz) return -maxHz;
    return base;
};

NodeLiveAudioProcessor.prototype.effectiveSampleRate = function effectiveSampleRate() {
    const speedMul = Math.max(0, this.speedMultiplier ?? 1);
    const host = this.engineSampleRate || sampleRate || 44100;
    return speedMul > 0 ? host / speedMul : 0;
};

NodeLiveAudioProcessor.prototype.createImpulseButtonState = function createImpulseButtonState() {
    return {
      amplitude: 1,
      pulseSamples: 0,
    };
};

NodeLiveAudioProcessor.prototype.setImpulseButtonTrigger = function setImpulseButtonTrigger(nodeId, amplitude) {
    if (!nodeId) return;
    const state = this.impulseButtonStates.get(nodeId) || this.createImpulseButtonState();
    // Short audible click (~20 ms), same family as other UI trigger pulses.
    const pulse = typeof this.gameTriggerPulseSamples === "function"
      ? this.gameTriggerPulseSamples()
      : Math.max(1, Math.round((this.engineSampleRate || sampleRate || 44100) * 0.02));
    state.pulseSamples = Math.max(0, nodeGraphFiniteNumber(state.pulseSamples)) + pulse;
    const normalized = Number(amplitude);
    state.amplitude = Number.isFinite(normalized) ? Math.max(0, Math.min(1, normalized)) : 1;
    this.impulseButtonStates.set(nodeId, state);
};

NodeLiveAudioProcessor.prototype.createBugButtonState = function createBugButtonState() {
    return {
      down: 0,
      downPulseSamples: 0,
      hover: 0,
      upPulseSamples: 0,
      x: 0,
      y: 0,
    };
};

NodeLiveAudioProcessor.prototype.setBugButtonInteraction = function setBugButtonInteraction(message = {}) {
    const nodeId = String(message.nodeId || "");
    if (!nodeId) return;
    const state = this.bugButtonStates.get(nodeId) || this.createBugButtonState();
    if (message.down !== undefined) state.down = message.down ? 1 : 0;
    if (message.hover !== undefined) state.hover = message.hover ? 1 : 0;
    if (Number.isFinite(Number(message.x))) state.x = Number(message.x);
    if (Number.isFinite(Number(message.y))) state.y = Number(message.y);
    if (message.downPulse) state.downPulseSamples += 1;
    if (message.upPulse) state.upPulseSamples += 1;
    this.bugButtonStates.set(nodeId, state);
};

NodeLiveAudioProcessor.prototype.setConnections = function setConnections(plan, message = {}) {
    this.patchFingerprint = message.patchFingerprint || plan?.patchFingerprint || this.patchFingerprint || "";
    this.planSerial = message.planSerial || this.planSerial || 0;
    this.sessionId = message.sessionId || this.sessionId || 0;
    this.outputNode = plan?.outputNode || this.outputNode || "output";
    this.scopeCaptureNodeIds = Array.isArray(plan?.scopeCaptureNodeIds)
      ? plan.scopeCaptureNodeIds.map((nodeId) => String(nodeId || "")).filter(Boolean)
      : this.scopeCaptureNodeIds;
    if (plan?.scopeCaptureRates && typeof plan.scopeCaptureRates === "object") {
      this.scopeCaptureRates = { ...plan.scopeCaptureRates };
    }
    this.visualSinks = (Array.isArray(plan?.visualSinks) ? plan.visualSinks : this.visualSinks).map((sink) => ({
      ...sink,
      bufferedInputs: Array.isArray(sink?.bufferedInputs) ? [...sink.bufferedInputs] : [],
      inputs: (Array.isArray(sink?.inputs) ? sink.inputs : []).map((input) => ({ ...input })),
    }));
    this.syncVisualInputBuffers();
    if (plan?.timing && typeof this.normalizePatchTiming === "function") {
      this.timing = this.normalizePatchTiming(plan.timing);
    }
    if (Number.isFinite(Number(message.pitchReferenceMidiNote))) {
      this.pitchReferenceMidiNote = Number(message.pitchReferenceMidiNote);
    }
    if (Number.isFinite(Number(message.pitchReferenceHz))) {
      this.pitchReferenceHz = Number(message.pitchReferenceHz);
    }
    if (Number.isFinite(Number(message.pitchOffsetOctaves))) {
      this.pitchOffsetOctaves = Number(message.pitchOffsetOctaves);
      if (typeof this.applyNativeGraphPitchOffset === "function") {
        this.applyNativeGraphPitchOffset();
      }
    }
    if (Number.isFinite(Number(message.displayFps))) {
      this.displayFps = Math.max(0, Math.min(240, Math.round(Number(message.displayFps))));
    }
    if (Number.isFinite(Number(message.autoSmoothingSeconds)) && typeof this.clampAutoSmoothingSeconds === "function") {
      this.autoSmoothingSeconds = this.clampAutoSmoothingSeconds(message.autoSmoothingSeconds);
    }
    const bypassed = new Set(Array.isArray(plan?.bypassedNodes) ? plan.bypassedNodes : []);
    if (Array.isArray(plan?.nodes)) {
      // Connection-only plan posts still carry runtime nodes. Apply params /
      // samplePhase here or Stop/Pause never reach the worklet when the graph
      // shape is unchanged (setPlan is skipped, setParams was coalesced away).
      if (typeof this.setParams === "function" && plan.nodes.length) {
        this.setParams(plan.nodes, message);
      }
      for (const node of plan.nodes) {
        const current = this.nodes.get(node.id);
        if (!current) {
          continue;
        }
        current.bypassed = Boolean(node.bypassed) || bypassed.has(node.id);
        if (node.bypassSpec && typeof node.bypassSpec === "object") {
          current.bypassSpec = node.bypassSpec;
        }
      }
    } else {
      for (const [id, current] of this.nodes) {
        current.bypassed = bypassed.has(id);
      }
    }
    const ids = new Set([...this.nodes.keys()]);
    this.inputConnections = this.buildInputConnectionMap(plan?.connections, ids);
    this._planConnections = Array.isArray(plan?.connections) ? plan.connections.slice() : [];
    this.graphInputConnections = this.buildGraphInputConnectionMap(plan?.graphConnections, ids);
    this.modulationConnections = this.buildModulationConnectionMap(plan?.modulations, ids);
    const graphData = message.graphData || plan?.graphData;
    if (graphData) {
      this.setGraphData(graphData);
    }
    // Efficient mode: recompile only if wires/nodes changed. Bypass is a flag —
    // never clear/recreate natives (that wiped reverb/delay tails).
    if (this.efficientProduct) {
      if (typeof this.syncNativeGraphFromPlan === "function") {
        this.syncNativeGraphFromPlan();
      } else if (typeof this.compileNativeGraphFromPlan === "function") {
        this.compileNativeGraphFromPlan();
      }
    }
};

NodeLiveAudioProcessor.prototype.setGraphData = function setGraphData(graphData) {
    if (!graphData || typeof graphData !== "object") {
      return;
    }
    for (const [nodeId, graph] of Object.entries(graphData)) {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.graph = graph;
      }
    }
};

NodeLiveAudioProcessor.prototype.setParams = function setParams(nodes, message = {}) {
    const patchFingerprint = message.patchFingerprint || "";
    this.patchFingerprint = patchFingerprint || this.patchFingerprint;
    this.planSerial = message.planSerial || 0;
    this.sessionId = message.sessionId || 0;
    this.autoSmoothingSeconds = this.clampAutoSmoothingSeconds(message.autoSmoothingSeconds);
    this.syncNestedAutoSmoothingSeconds(this.autoSmoothingSeconds);
    let parameterCount = 0;
    for (const node of Array.isArray(nodes) ? nodes : []) {
      const current = this.nodes.get(node.id);
      if (!current) {
        continue;
      }
      current.params = { ...(node.params || {}) };
      current.paramMeta = { ...(node.paramMeta || {}) };
      // Module Settings voice host fields (not face params).
      if (Object.hasOwn(node, "metamodule")) {
        current.metamodule = node.metamodule && typeof node.metamodule === "object"
          ? node.metamodule
          : undefined;
      }
      // Keep drawn path in sync when params push also carries node extras.
      if (Object.hasOwn(node, "drawnPath")) {
        current.drawnPath = node.drawnPath || null;
      }
      if (Object.hasOwn(node, "samplePhase") && Number.isFinite(Number(node.samplePhase))) {
        current.samplePhase = Number(node.samplePhase);
      }
      if (Object.hasOwn(node, "samplePhaseSeek") && Number.isFinite(Number(node.samplePhaseSeek))) {
        current.samplePhaseSeek = Math.max(0, Math.round(Number(node.samplePhaseSeek)) || 0);
      }
      parameterCount += Object.keys(current.params || {}).length;
      // Legacy JS chase only for ?product=full — efficient path is write-only.
      if (!this.efficientProduct) {
        for (const [key, value] of Object.entries(current.params || {})) {
          const smootherKey = this.parameterKey(node.id, key);
          const metadata = current.paramMeta?.[key];
          if (!this.smoothers.has(smootherKey)) {
            this.smoothers.set(smootherKey, this.createSmoother(value, metadata));
          }
          this.updateSmoother(this.smoothers.get(smootherKey), value, metadata, smootherKey);
        }
      }
    }
    if (this.efficientProduct && this.smoothers?.size) {
      this.smoothers.clear();
      this.activeSmoothers = [];
      this.activeSmootherKeys?.clear?.();
    }
    // Efficient mode: push Control targets into native graph (no recompile).
    if (this.efficientProduct && typeof this.syncNativeGraphParams === "function") {
      this.syncNativeGraphParams();
    }
    this.port.postMessage({
      nodeCount: this.nodes.size,
      order: [...this.order],
      parameterCount,
      patchFingerprint,
      planSerial: this.planSerial,
      sessionId: this.sessionId,
      type: "paramsApplied",
    });
};

NodeLiveAudioProcessor.prototype._normalizeKeyboardSignalPayload = function _normalizeKeyboardSignalPayload(
  signal,
  { pulse = false, previous = null } = {},
) {
    const source = signal && typeof signal === "object" ? signal : {};
    const prev = previous && typeof previous === "object" ? previous : {};
    // Hold last triggered midi/freq when gate drops or payload omits pitch.
    // Do not snap to middle-C (60) / A440 after a real note has been played.
    const sourceMidi = Number(source.midi);
    const prevMidi = Number(prev.midi);
    const midi = this.clampValue(
      Math.round(
        Number.isFinite(sourceMidi)
          ? sourceMidi
          : (Number.isFinite(prevMidi) ? prevMidi : 60),
      ),
      0,
      127,
    );
    const rawMidiSource = Number(source.rawMidi);
    const rawMidi = Number.isFinite(rawMidiSource)
      ? this.clampValue(Math.round(rawMidiSource), 0, 127)
      : (Number.isFinite(Number(prev.rawMidi))
        ? this.clampValue(Math.round(Number(prev.rawMidi)), 0, 127)
        : midi);
    const octave = this.clampValue(
      Math.round(Number.isFinite(Number(source.octave)) ? Number(source.octave) : (nodeGraphFiniteNumber(prev.octave))),
      -6,
      6,
    );
    const keyIndex = this.clampValue(
      Number.isFinite(Number(source.keyIndex))
        ? Number(source.keyIndex)
        : (nodeGraphFiniteNumber(prev.keyIndex)),
      0,
      24,
    );
    const keyQuantized = this.clampValue(
      Number.isFinite(Number(source.keyQuantized))
        ? Number(source.keyQuantized)
        : (Number.isFinite(Number(prev.keyQuantized)) ? Number(prev.keyQuantized) : keyIndex / 24),
      0,
      1,
    );
    const sourceFreq = Number(source.frequency);
    const prevFreq = Number(prev.frequency);
    const frequency = Math.max(
      0,
      Number.isFinite(sourceFreq) && sourceFreq > 0
        ? sourceFreq
        : (Number.isFinite(prevFreq) && prevFreq > 0
          ? prevFreq
          : 440 * (2 ** ((midi - 69) / 12))),
    );
    const velocity = this.clampValue(
      Number.isFinite(Number(source.velocity))
        ? Number(source.velocity)
        : (nodeGraphFiniteNumber(prev.velocity)),
      0,
      1,
    );
    if (pulse && Number(source.gatePulse) > 0) {
      this.midiKeyboardGatePulseSamples = 1;
      this.midiKeyboardGatePulseVelocity = velocity;
    }
    return {
      gate: Number(source.gate) > 0 ? 1 : 0,
      gatePulse: Number(source.gatePulse) > 0 ? 1 : 0,
      x: this.clampValue(
        Number.isFinite(Number(source.x)) ? Number(source.x) : (nodeGraphFiniteNumber(prev.x, keyQuantized)),
        0,
        1,
      ),
      y: this.clampValue(
        Number.isFinite(Number(source.y)) ? Number(source.y) : (nodeGraphFiniteNumber(prev.y)),
        0,
        1,
      ),
      velocity,
      keyIndex,
      keyQuantized,
      rawMidi,
      octave,
      midi,
      pitchValue: this.clampValue(
        Number.isFinite(Number(source.pitchValue)) ? Number(source.pitchValue) : midi,
        0,
        127,
      ),
      midiNormalized: this.clampValue(
        Number.isFinite(Number(source.midiNormalized))
          ? Number(source.midiNormalized)
          : midi / 127,
        0,
        1,
      ),
      tenthVoltPerOctave: this.clampValue(
        Number.isFinite(Number(source.tenthVoltPerOctave))
          ? Number(source.tenthVoltPerOctave)
          : midi / 120,
        0,
        1,
      ),
      increment: Math.max(
        0,
        Number.isFinite(Number(source.increment)) && Number(source.increment) > 0
          ? Number(source.increment)
          : frequency / Math.max(1, this.engineSampleRate || sampleRate),
      ),
      frequency,
    };
};

NodeLiveAudioProcessor.prototype.setMidiKeyboardSignal = function setMidiKeyboardSignal(signal) {
    // Hardware MIDI device signal (MIDI module only).
    this.midiKeyboardSignal = this._normalizeKeyboardSignalPayload(signal, {
      pulse: true,
      previous: this.midiKeyboardSignal,
    });
};

NodeLiveAudioProcessor.prototype.setKeyboardModuleSignal = function setKeyboardModuleSignal(signal) {
    // Local Keyboard face / dock pointer (Keyboard module only).
    this.keyboardModuleSignal = this._normalizeKeyboardSignalPayload(signal, {
      pulse: true,
      previous: this.keyboardModuleSignal,
    });
};

NodeLiveAudioProcessor.prototype.setMacroControls = function setMacroControls(values) {
    this.macroControls = Array.from({ length: 8 }, (_, index) => (
      this.clampValue(nodeGraphFiniteNumber(values?.[index]), 0, 1)
    ));
};

NodeLiveAudioProcessor.prototype.setMidiKeyboardPlayKeysBitmask = function setMidiKeyboardPlayKeysBitmask(low, high) {
  const safeLow = Math.floor(Number(low));
  const safeHigh = Math.floor(Number(high));
  try {
    this.midiKeyboardPlayKeysLowBitmask = Number.isFinite(safeLow) && safeLow >= 0 ? safeLow : 0;
    this.midiKeyboardPlayKeysHighBitmask = Number.isFinite(safeHigh) && safeHigh >= 0 ? safeHigh : 0;
  } catch (_error) {
    this.midiKeyboardPlayKeysLowBitmask = 0;
    this.midiKeyboardPlayKeysHighBitmask = 0;
  }
};

NodeLiveAudioProcessor.prototype.setMidiKeyboardHeldKeysBitmask = function setMidiKeyboardHeldKeysBitmask(low, high) {
    const safeLow = Math.floor(Number(low));
    const safeHigh = Math.floor(Number(high));
    this.midiKeyboardHeldKeysLowBitmask = Number.isFinite(safeLow) && safeLow >= 0 ? safeLow : 0;
    this.midiKeyboardHeldKeysHighBitmask = Number.isFinite(safeHigh) && safeHigh >= 0 ? safeHigh : 0;
};

/** Polyphony Midi Note + Velocity table (128 bytes). source: midi | keyboard */
NodeLiveAudioProcessor.prototype.setPolyphonyVelocities = function setPolyphonyVelocities(source, velocities) {
  const key = String(source || "");
  const n = typeof POLYPHONY_NOTE_COUNT === "number" ? POLYPHONY_NOTE_COUNT : 128;
  const table = velocities instanceof Uint8Array
    ? new Uint8Array(velocities)
    : new Uint8Array(n);
  if (table.length < n) {
    const full = new Uint8Array(n);
    full.set(table);
    if (key === "keyboard") this.keyboardPolyphonyVelocities = full;
    else this.midiPolyphonyVelocities = full;
    return;
  }
  if (key === "keyboard") this.keyboardPolyphonyVelocities = table.subarray(0, n);
  else this.midiPolyphonyVelocities = table.subarray(0, n);
};

/** Ensure combined-wasm VoiceManager handle exists. */
NodeLiveAudioProcessor.prototype.ensureVoiceManager = function ensureVoiceManager() {
  const native = this.nativeGraph;
  if (!native?.soemdsp_voice_manager_create) return 0;
  if (this._voiceManagerHandle > 0) return this._voiceManagerHandle;
  const h = native.soemdsp_voice_manager_create() | 0;
  this._voiceManagerHandle = h > 0 ? h : 0;
  return this._voiceManagerHandle;
};

NodeLiveAudioProcessor.prototype.vmNoteOn = function vmNoteOn(note, velocity01) {
  const native = this.nativeGraph;
  const h = this.ensureVoiceManager();
  if (!(h > 0) || !native?.soemdsp_voice_manager_note_on) return;
  native.soemdsp_voice_manager_note_on(h, Math.round(Number(note)) | 0, Number(velocity01) || 0);
};

NodeLiveAudioProcessor.prototype.vmNoteOff = function vmNoteOff(note) {
  const native = this.nativeGraph;
  const h = this.ensureVoiceManager();
  if (!(h > 0) || !native?.soemdsp_voice_manager_note_off) return;
  native.soemdsp_voice_manager_note_off(h, Math.round(Number(note)) | 0);
};

NodeLiveAudioProcessor.prototype.vmAllNotesOff = function vmAllNotesOff() {
  const native = this.nativeGraph;
  const h = this._voiceManagerHandle | 0;
  if (!(h > 0) || !native?.soemdsp_voice_manager_all_notes_off) return;
  native.soemdsp_voice_manager_all_notes_off(h);
};

NodeLiveAudioProcessor.prototype.setPitchModWheelSignal = function setPitchModWheelSignal(signal) {
    const source = signal && typeof signal === "object" ? signal : {};
    const pitch = Number(source.pitch);
    this.pitchModWheelSignal = {
      mod: this.clampValue(nodeGraphFiniteNumber(source.mod), 0, 1),
      pitch: Number.isFinite(pitch) ? pitch : 0,
    };
};

NodeLiveAudioProcessor.prototype.normalizeExternalButtonEventName = function normalizeExternalButtonEventName(name) {
    const key = String(name || "").trim().toLowerCase();
    if (key === "mousedown" || key === "pointerdown") return "down";
    if (key === "mouseup" || key === "pointerup") return "up";
    if (key === "mouseenter" || key === "pointerenter") return "enter";
    if (key === "mouseleave" || key === "pointerleave") return "leave";
    return ["click", "hover", "down", "up", "enter", "leave"].includes(key) ? key : "";
};

NodeLiveAudioProcessor.prototype.setExternalButtonEvent = function setExternalButtonEvent(name) {
    const key = this.normalizeExternalButtonEventName(name);
    if (!key) return;
    const samples = Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.02));
    this.externalButtonEvents.set(key, Math.max(nodeGraphFiniteNumber(this.externalButtonEvents.get(key)), samples));
};

NodeLiveAudioProcessor.prototype.externalButtonEventPulse = function externalButtonEventPulse(name) {
    const remaining = nodeGraphFiniteNumber(this.externalButtonEvents.get(name));
    if (remaining <= 0) {
      this.externalButtonEvents.delete(name);
      return 0;
    }
    this.externalButtonEvents.set(name, remaining - 1);
    return 1;
};

NodeLiveAudioProcessor.prototype.wireBreakGateSamples = function wireBreakGateSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.52));
};

NodeLiveAudioProcessor.prototype.gameTriggerPulseSamples = function gameTriggerPulseSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.02));
};

NodeLiveAudioProcessor.prototype.setWireBreakEvent = function setWireBreakEvent() {
    const event = this.wireBreakEvent && typeof this.wireBreakEvent === "object"
      ? this.wireBreakEvent
      : { pulseSamples: 0, gateSamples: 0 };
    event.pulseSamples = Math.max(nodeGraphFiniteNumber(event.pulseSamples), this.gameTriggerPulseSamples());
    event.gateSamples = Math.max(nodeGraphFiniteNumber(event.gateSamples), this.wireBreakGateSamples());
    this.wireBreakEvent = event;
};

NodeLiveAudioProcessor.prototype.wireBreakEventSample = function wireBreakEventSample() {
    const event = this.wireBreakEvent && typeof this.wireBreakEvent === "object"
      ? this.wireBreakEvent
      : { pulseSamples: 0, gateSamples: 0 };
    const pulseSamples = Math.max(0, nodeGraphFiniteNumber(event.pulseSamples));
    const gateSamples = Math.max(0, nodeGraphFiniteNumber(event.gateSamples));
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    event.gateSamples = Math.max(0, gateSamples - 1);
    this.wireBreakEvent = event;
    return {
      Pulse: pulseSamples > 0 ? 1 : 0,
      Gate: gateSamples > 0 ? 1 : 0,
    };
};

NodeLiveAudioProcessor.prototype.setWireConnectEvent = function setWireConnectEvent() {
    const event = this.wireConnectEvent && typeof this.wireConnectEvent === "object"
      ? this.wireConnectEvent
      : { pulseSamples: 0 };
    event.pulseSamples = Math.max(nodeGraphFiniteNumber(event.pulseSamples), this.gameTriggerPulseSamples());
    this.wireConnectEvent = event;
};

NodeLiveAudioProcessor.prototype.wireConnectEventSample = function wireConnectEventSample() {
    const event = this.wireConnectEvent && typeof this.wireConnectEvent === "object"
      ? this.wireConnectEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, nodeGraphFiniteNumber(event.pulseSamples));
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.wireConnectEvent = event;
    return { Pulse: pulseSamples > 0 ? 1 : 0 };
};

NodeLiveAudioProcessor.prototype.setWireDisconnectEvent = function setWireDisconnectEvent() {
    const event = this.wireDisconnectEvent && typeof this.wireDisconnectEvent === "object"
      ? this.wireDisconnectEvent
      : { pulseSamples: 0 };
    event.pulseSamples = Math.max(nodeGraphFiniteNumber(event.pulseSamples), this.gameTriggerPulseSamples());
    this.wireDisconnectEvent = event;
};

NodeLiveAudioProcessor.prototype.wireDisconnectEventSample = function wireDisconnectEventSample() {
    const event = this.wireDisconnectEvent && typeof this.wireDisconnectEvent === "object"
      ? this.wireDisconnectEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, nodeGraphFiniteNumber(event.pulseSamples));
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.wireDisconnectEvent = event;
    return { Pulse: pulseSamples > 0 ? 1 : 0 };
};

NodeLiveAudioProcessor.prototype.setShootingStarExplosionEvent = function setShootingStarExplosionEvent(speed = null) {
    const event = this.shootingStarExplosionEvent && typeof this.shootingStarExplosionEvent === "object"
      ? this.shootingStarExplosionEvent
      : { pulseSamples: 0, speed: null };
    event.pulseSamples = Math.max(0, nodeGraphFiniteNumber(event.pulseSamples)) + 1;
    const normalizedSpeed = Number(speed);
    event.speed = Number.isFinite(normalizedSpeed) ? normalizedSpeed : null;
    this.shootingStarExplosionEvent = event;
};

NodeLiveAudioProcessor.prototype.nativeShootingStarExplosionPower = function nativeShootingStarExplosionPower(speed, lowRange = 0, highRange = 1) {
    if (
      !this.nativeShootingStarExplosionReady
      || !this.nativeShootingStarExplosion?.soemdsp_shooting_star_explosion_power
    ) {
      throw new Error("native Shooting Star Explosion not ready");
    }
    const low = nodeGraphFiniteNumber(lowRange);
    const high = nodeGraphFiniteNumber(highRange);
    return this.safeFilterNumber(
      this.nativeShootingStarExplosion.soemdsp_shooting_star_explosion_power(
        Number.isFinite(speed) ? speed : -1,
        low,
        high,
      ),
      null,
    );
};

NodeLiveAudioProcessor.prototype.shootingStarExplosionEventSample = function shootingStarExplosionEventSample(lowRange = 0, highRange = 1) {
    const event = this.shootingStarExplosionEvent && typeof this.shootingStarExplosionEvent === "object"
      ? this.shootingStarExplosionEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, nodeGraphFiniteNumber(event.pulseSamples));
    const speed = Number(event.speed);
    const power = this.nativeShootingStarExplosionPower(speed, lowRange, highRange);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.shootingStarExplosionEvent = event;
    return { Pulse: pulseSamples > 0 ? power : 0 };
};

NodeLiveAudioProcessor.prototype.windowReopenGateSamples = function windowReopenGateSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 1));
};

NodeLiveAudioProcessor.prototype.setWindowReopenEvent = function setWindowReopenEvent() {
    const samples = this.windowReopenGateSamples();
    this.windowReopenEvent = {
      gateSamples: samples,
      pulseSamples: this.gameTriggerPulseSamples(),
      totalSamples: samples,
    };
};

NodeLiveAudioProcessor.prototype.windowReopenEventSample = function windowReopenEventSample() {
    const event = this.windowReopenEvent && typeof this.windowReopenEvent === "object"
      ? this.windowReopenEvent
      : { pulseSamples: 0, gateSamples: 0, totalSamples: 0 };
    const pulseSamples = Math.max(0, nodeGraphFiniteNumber(event.pulseSamples));
    const gateSamples = Math.max(0, nodeGraphFiniteNumber(event.gateSamples));
    const totalSamples = Math.max(1, nodeGraphFiniteNumber(event.totalSamples, nodeGraphFiniteNumber(gateSamples, 1)));
    const progress = gateSamples > 0 ? 1 - gateSamples / totalSamples : 1;
    const sine = gateSamples > 0 ? Math.sin(Math.PI * Math.max(0, Math.min(1, progress))) : 0;
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    event.gateSamples = Math.max(0, gateSamples - 1);
    this.windowReopenEvent = event;
    return {
      Pulse: pulseSamples > 0 ? 1 : 0,
      Gate: gateSamples > 0 ? 1 : 0,
      Sine: sine,
    };
};

NodeLiveAudioProcessor.prototype.buildConnectionMap = function buildConnectionMap(items, ids, keyForItem) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!ids.has(item.sourceNode) || !ids.has(item.destinationNode)) {
        continue;
      }
      const key = keyForItem(item);
      const list = map.get(key) || [];
      list.push({ ...item });
      map.set(key, list);
    }
    return map;
};

NodeLiveAudioProcessor.prototype.buildInputConnectionMap = function buildInputConnectionMap(connections, ids) {
    return this.buildConnectionMap(
      connections,
      ids,
      (connection) => this.inputKey(connection.destinationNode, connection.destinationPort),
    );
};

NodeLiveAudioProcessor.prototype.buildModulationConnectionMap = function buildModulationConnectionMap(modulations, ids) {
    return this.buildConnectionMap(
      modulations,
      ids,
      (modulation) => this.parameterKey(modulation.destinationNode, modulation.destinationParam),
    );
};

NodeLiveAudioProcessor.prototype.buildGraphInputConnectionMap = function buildGraphInputConnectionMap(graphConnections, ids) {
    return this.buildConnectionMap(
      graphConnections,
      ids,
      (connection) => this.graphInputKey(connection.destinationNode, connection.destinationGraphInput),
    );
};

NodeLiveAudioProcessor.prototype.inputKey = function inputKey(node, port) {
    return `${node}.${port}`;
};

NodeLiveAudioProcessor.prototype.graphInputKey = function graphInputKey(node, graphInput) {
    return `${node}.${graphInput}`;
};

NodeLiveAudioProcessor.prototype.parameterKey = function parameterKey(node, parameter) {
    return `${node}.${parameter}`;
};

NodeLiveAudioProcessor.prototype.stableSeed = function stableSeed(text) {
    let seed = 0x12345678;
    for (const character of String(text)) {
      seed = (Math.imul(seed ^ character.charCodeAt(0), 16777619)) >>> 0;
    }
    return seed || 0x12345678;
};

NodeLiveAudioProcessor.prototype.wrapValue = function wrapValue(value, min, max) {
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return min;
    }
    return min + ((((value - min) % range) + range) % range);
};

NodeLiveAudioProcessor.prototype.clampValue = function clampValue(value, min, max) {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (reason) {
      this.badNumberCount += 1;
      if (!this.lastBadValueNodeId) {
        this.lastBadValueReason = reason;
        this.lastBadValueSource = "";
      }
      return 0;
    }
    return Math.max(min, Math.min(max, number));
};

