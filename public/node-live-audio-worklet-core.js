const nodeSmoothingModes = Object.freeze(["global", "blockSize", "internal", "internalGlobal", "off"]);

function nodeSmoothingModeNormalize(value) {
  return nodeSmoothingModes.includes(value) ? value : "global";
}

const nodeLiveRaptEllipticQuarterbandSos = Object.freeze([
  Object.freeze([1.3515101236634053e-04, 1.8481719657676747e-04, 1.3515101236634053e-04, 1, -1.5863119326809123, 0.6428204816292211]),
  Object.freeze([1, -0.3714014551732318, 0.9999999999999998, 1, -1.5620959364626055, 0.7161571320953768]),
  Object.freeze([1, -1.0298229723362611, 1, 1, -1.5310702081483014, 0.8130950789236201]),
  Object.freeze([1, -1.2676395426322578, 1.0000000000000002, 1, -1.50809401930334, 0.8931580864862605]),
  Object.freeze([1, -1.3628788519102755, 1.0000000000000002, 1, -1.4983265140498274, 0.9475287279522546]),
  Object.freeze([1, -1.3980241837651683, 1, 1, -1.5032624176850438, 0.9843747059042128]),
]);

function nodeLiveIsPolyBlepOscillatorType(type) {
  return type === "osc" || type === "polyBlep" || type === "sineWavetable" || type === "blit";
}

class NodeLiveAudioProcessor extends AudioWorkletProcessor {
  // Block size for the FBM native block-processing boundary
  // (soemdsp_fbm_process_block) -- matches the typical AudioWorklet render
  // quantum. Params are resolved once per this many samples instead of once
  // per sample; see fractalBrownianNoiseVector.
  static FBM_NATIVE_BLOCK_SIZE = 128;

  // Same block-processing boundary pattern for Noise Generator
  // (soemdsp_noise_generator_process_block) -- a pure generator like FBM,
  // so its block cache also refills transparently with no added latency.
  static NOISE_NATIVE_BLOCK_SIZE = 128;

  constructor() {
    super();
    this.liveModuleEvaluators = this.buildLiveModuleEvaluators();
    this.liveModuleEvaluators.previousPatch = this.liveModuleEvaluators.nextPatch;
    // vactrolEnvelopeSeries and vactrolEnvelopeCustom share one implementation
    // (see the isSeries branch inside it) -- the offline/render evaluator
    // registers this same alias in vactrol-envelope-live-evaluator.js; this
    // real-time path was missing it, so vactrolEnvelopeCustom nodes silently
    // produced a flat 0 in Live Audio instead of running the envelope.
    this.liveModuleEvaluators.vactrolEnvelopeCustom = this.liveModuleEvaluators.vactrolEnvelopeSeries;
    this.inputConnections = new Map();
    this.badNumberCount = 0;
    this.lastBadValueReason = "";
    this.lastBadValueNodeId = "";
    this.lastBadValueSource = "";
    this.audioPlayerMeterNodeId = "";
    this.audioPlayerMeterPeak = 0;
    this.audioPlayerMeterPhase = 0;
    this.audioPlayerMeterReason = "";
    this.audioPlayerMeterSamples = 0;
    this.audioPlayerNodeIds = [];
    this.inputMeterPeak = 0;
    this.inputMeterSamples = 0;
    this.inputMeterSquareSum = 0;
    this.maxBlockProcessMs = 0;
    this.maxBlockBudgetRatio = 0;
    this.meterClipCount = 0;
    this.meterCounter = 0;
    this.meterOverrunCount = 0;
    this.meterPeak = 0;
    this.meterProtectionMuteCount = 0;
    this.meterSamples = 0;
    this.meterSquareSum = 0;
    this.macroControls = new Array(8).fill(0);
    this.externalButtonEvents = new Map();
    this.wireBreakEvent = { pulseSamples: 0, gateSamples: 0 };
    this.wireConnectEvent = { pulseSamples: 0 };
    this.wireDisconnectEvent = { pulseSamples: 0 };
    this.windowReopenEvent = { pulseSamples: 0, gateSamples: 0, totalSamples: 0 };
    this.shootingStarExplosionEvent = { pulseSamples: 0 };
    // Any input-port wire disconnect (any kind/UI trigger -- see
    // disconnectNodeGraphConnection) feeds a single-sample trigger into that
    // port so downstream modules (envelopes, sample+hold, etc.) feel a poke
    // when their signal supply is cut, instead of just dropping to silence.
    this.inputWireBreakTriggers = new Map();
    this.pitchModWheelSignal = { mod: 0, pitch: 0 };
    this.midiKeyboardGatePulseSamples = 0;
    this.midiKeyboardSignal = null;
    this.midiKeyboardHeldKeysLowBitmask = 0;
    this.midiKeyboardHeldKeysHighBitmask = 0;
    this.midiKeyboardHeldKeysPhase = 0;
    this.moduleGroupRuntimes = new Map();
    this.modulationConnections = new Map();
    this.nodeOutputs = new Map();
    this.nodes = new Map();
    this.noiseSeedKeys = new Map();
    this.noiseSeeds = new Map();
    this.basicOscillatorNativeHandles = new Map();
    this.order = [];
    this.engineSampleRate = sampleRate;
    this.hostSampleRate = sampleRate;
    this.oversamplingRatio = 1;
    this.speedMultiplier = 1;
    this.speedLimit = 20000;
    this.raptEllipticDecimatorLeft = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRight = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRatio = 1;
    this.passiveFilterStates = new Map();
    this.papoulisFilterStates = new Map();
    this.xyPadFilterStates = new Map();
    this.phosphillatorPlaybackStates = new Map();
    this.phosphillatorDecodedPathCache = new Map();
    this.clockDividerStates = new Map();
    this.clockStates = new Map();
    this.transportStates = new Map();
    this.codeblockFunctions = new Map();
    this.cookbookFilterStates = new Map();
    this.delayedTriggerStates = new Map();
    this.delayEffectStates = new Map();
    this.pingPongDelayStates = new Map();
    this.wallDelayStates = new Map();
    this.expAdsrStates = new Map();
    this.ellipsoidOutputFrames = new Map();
    this.nativeEllipsoid = null;
    this.nativeEllipsoidReady = false;
    this.nativeSabrinaReverb = null;
    this.nativeSabrinaReverbReady = false;
    this.nativePll = null;
    this.nativePllReady = false;
    this.nativeHelmholtz = null;
    this.nativeHelmholtzReady = false;
    this.nativeHelmholtzStatusKey = "";
    this.helmholtzStates = new Map();
    this.nativeNoiseGenerator = null;
    this.nativeNoiseGeneratorReady = false;
    this.nativeFbm = null;
    this.nativeFbmReady = false;
    this.nativeLadderFilter = null;
    this.nativeLadderFilterReady = false;
    this.nativeFlowerChildFilter = null;
    this.nativeFlowerChildFilterReady = false;
    this.nativeRsmetFilter = null;
    this.nativeRsmetFilterReady = false;
    this.nativeYellowjacketFilter = null;
    this.nativeYellowjacketFilterReady = false;
    this.nativeSuperloveFilter = null;
    this.nativeSuperloveFilterReady = false;
    this.nativeChaoticPhaseLockingFilter = null;
    this.nativeChaoticPhaseLockingFilterReady = false;
    this.nativeResonatorFilter = null;
    this.nativeResonatorFilterReady = false;
    this.nativeHumanFilter = null;
    this.nativeHumanFilterReady = false;
    this.nativePulseExplosion = null;
    this.nativePulseExplosionReady = false;
    this.nativeComparator = null;
    this.nativeComparatorReady = false;
    this.nativeSampleDelay = null;
    this.nativeSampleDelayReady = false;
    this.nativeMinMax = null;
    this.nativeMinMaxReady = false;
    this.nativeAliasSine = null;
    this.nativeAliasSineReady = false;
    this.nativeTb303Filter = null;
    this.nativeTb303FilterReady = false;
    this.nativePassiveFilter = null;
    this.nativePassiveFilterReady = false;
    this.nativeVactrolEnvelope = null;
    this.nativeVactrolEnvelopeReady = false;
    this.nativeSoftClipper = null;
    this.nativeSoftClipperReady = false;
    this.nativePolyBlep = null;
    this.nativePolyBlepReady = false;
    this.polyBlepStates = new Map();
    this.nativeBlit = null;
    this.nativeBlitReady = false;
    this.blitStates = new Map();
    this.blitJsIntegrators = new Map();
    this.nativeArchimedes = null;
    this.nativeArchimedesReady = false;
    this.archimedesStates = new Map();
    this.nativeTransport = null;
    this.nativeTransportReady = false;
    this.nativeSlewLimiter = null;
    this.nativeSlewLimiterReady = false;
    this.nativeSampleHold = null;
    this.nativeSampleHoldReady = false;
    this.nativeChordMemory = null;
    this.nativeChordMemoryReady = false;
    this.nativeTuringMachine = null;
    this.nativeTuringMachineReady = false;
    this.nativeFlowerChildEnvelopeFollower = null;
    this.nativeFlowerChildEnvelopeFollowerReady = false;
    this.nativeTriggerDivider = null;
    this.nativeTriggerDividerReady = false;
    this.nativeStepSequencer = null;
    this.nativeStepSequencerReady = false;
    this.nativeTriggerCounter = null;
    this.nativeTriggerCounterReady = false;
    this.nativeDelayedTrigger = null;
    this.nativeDelayedTriggerReady = false;
    this.nativeClock = null;
    this.nativeClockReady = false;
    this.nativeRandomClock = null;
    this.nativeRandomClockReady = false;
    this.nativePingPongDelay = null;
    this.nativePingPongDelayReady = false;
    this.nativePapoulisFilter = null;
    this.nativePapoulisFilterReady = false;
    this.nativePhosphillator = null;
    this.nativePhosphillatorReady = false;
    this.pllStates = new Map();
    this.fractalBrownianNoiseStates = new Map();
    this.graphInputConnections = new Map();
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveStatusCounter = 0;
    this.gpuAdditiveUnderruns = 0;
    this.flowerChildEnvelopeFollowerStates = new Map();
    this.flowerChildFilterStates = new Map();
    this.rsmetFilterStates = new Map();
    this.yellowjacketFilterStates = new Map();
    this.superloveFilterStates = new Map();
    this.chaoticPhaseLockingFilterStates = new Map();
    this.resonatorFilterStates = new Map();
    this.humanFilterStates = new Map();
    this.pulseExplosionStates = new Map();
    this.comparatorStates = new Map();
    this.sampleDelayStates = new Map();
    this.minMaxStates = new Map();
    this.aliasSineStates = new Map();
    this.ladderFilterStates = new Map();
    this.tb303FilterStates = new Map();
    this.linearEnvelopeStates = new Map();
    this.sineWavetableStates = new Map();
    this.lorenzAttractorStates = new Map();
    this.logisticMapStates = new Map();
    this.gainBiasMixStates = new Map();
    this.sincStates = new Map();
    this.henonMapStates = new Map();
    this.rayBouncerStates = new Map();
    this.chuaAttractorStates = new Map();
    this.wirdoSpiralStates = new Map();
    this.blubbStates = new Map();
    this.mushroomStates = new Map();
    this.boingStates = new Map();
    this.torusStates = new Map();
    this.keplerBouwkampStates = new Map();
    this.nyquistShannonStates = new Map();
    this.radarStates = new Map();
    this.chordMemoryStates = new Map();
    this.chordSequencerStates = new Map();
    this.chordPadStates = new Map();
    this.lutCellStates = new Map();
    this.turingMachineStates = new Map();
    this.pitchQuantizerStates = new Map();
    this.surgeOscillatorStates = new Map();
    this.softwaveOscStates = new Map();
    this.curveOscStates = new Map();
    this.snowflakeStates = new Map();
    this.dsfOscillatorStates = new Map();
    this.robinSupersawStates = new Map();
    this.hypersawStates = new Map();
    this.videoscopeStates = new Map();
    this.spectrogramStates = new Map();
    this.noiseGeneratorStates = new Map();
    this.oscResetStates = new Map();
    this.graphLfoStates = new Map();
    this.oscillatorLastPhaseIncrements = new Map();
    this.oscillatorStoppedSamples = new Map();
    this.outputNode = "output";
    this.patchFingerprint = "";
    this.patchCommandStates = new Map();
    this.phases = new Map();
    this.pluckEnvelopeStates = new Map();
    this.planSerial = 0;
    this.randomClockStates = new Map();
    this.reverbEffectStates = new Map();
    this.sampleHoldStates = new Map();
    this.samplePlaybackStates = new Map();
    this.samples = new Map();
    this.randomWalkStates = new Map();
    this.piSpigotNoiseStates = new Map();
    this.bradley2AStates = new Map();
    this.antisawStates = new Map();
    this.sessionId = 0;
    this.scopeBuffers = new Map();
    this.scopeCaptureNodeIds = [];
    this.scopeCounter = 0;
    this.scopeSampleStride = 1;
    // Continuous engine-sample counter for free-running graph LFO phase
    // (Rate mode). Advanced once per evaluateFrame call.
    this.absoluteFrame = 0;
    this.slewLimiterStates = new Map();
    this.smoothers = new Map();
    // Dirty list (soemdsp SmootherManager::toSmooth_): only moving chases run.
    this.activeSmoothers = [];
    this.activeSmootherKeys = new Set();
    this.spiralStates = new Map();
    this.fractalSpiralStates = new Map();
    this.logSpiralStates = new Map();
    this.stepSequencerStates = new Map();
    this.stepGridStates = new Map();
    this.timing = this.normalizePatchTiming();
    this.triggerCounterStates = new Map();
    this.triggerDividerStates = new Map();
    this.triangleStates = new Map();
    this.vactrolEnvelopeStates = new Map();
    this.impulseButtonStates = new Map();
    this.bugButtonStates = new Map();
    this.visualInputBuffers = new Map();
    this.visualSinks = [];
    this.resetVisualControls();
    this.earProtector = this.createEarProtector(sampleRate);
    this.port.onmessage = (event) => this.handleMessage(event.data || {});
  }

  createEarProtector(rate = sampleRate) {
    const threshold = Math.pow(10, 6 / 20);
    const clipLimit = 0.8;
    const increment = 1 / Math.max(1, 0.0005 * rate);
    const decrement = 1 / Math.max(1, 0.15 * rate);
    const w = Math.min((Math.PI * 2) / Math.max(1, rate), 0.000142475857) * 1000;
    const a1 = Math.exp(-w);
    const b0 = 0.5 * (1 + a1);
    const b1 = -b0;
    let counter = 0;
    let inputBuffer = 0;
    let outputBuffer = 0;
    return {
      protect: (left = 0, right = left) => {
        const mono = ((Number(left) || 0) + (Number(right) || 0)) * 0.5;
        outputBuffer = b0 * mono + b1 * inputBuffer + a1 * outputBuffer;
        inputBuffer = mono;
        if (Math.abs(outputBuffer) >= threshold) {
          counter += increment;
        }
        const gain = counter >= 1 ? 0 : 1;
        counter = Math.max(0, Math.min(2, counter)) - decrement;
        return {
          left: this.clampValue((Number(left) || 0) * gain, -clipLimit, clipLimit),
          muted: gain <= 0,
          right: this.clampValue((Number(right) || 0) * gain, -clipLimit, clipLimit),
        };
      },
    };
  }

  createRaptEllipticDecimatorState() {
    return nodeLiveRaptEllipticQuarterbandSos.map(() => [0, 0]);
  }

  resetRaptEllipticDecimator() {
    this.raptEllipticDecimatorLeft = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRight = this.createRaptEllipticDecimatorState();
    this.raptEllipticDecimatorRatio = this.oversamplingRatio;
  }

  processRaptEllipticDecimatorSample(input, states) {
    let y = Number(input) || 0;
    for (let section = 0; section < nodeLiveRaptEllipticQuarterbandSos.length; section += 1) {
      const [b0, b1, b2, , a1, a2] = nodeLiveRaptEllipticQuarterbandSos[section];
      const z1 = states[section][0];
      const z2 = states[section][1];
      const sectionOut = b0 * y + z1;
      states[section][0] = b1 * y - a1 * sectionOut + z2;
      states[section][1] = b2 * y - a2 * sectionOut;
      y = sectionOut;
    }
    return y;
  }

  // createVisualControlState → node-live-audio-worklet-visual.js (Phase D visual controls)


  // resetVisualControls → node-live-audio-worklet-visual.js (Phase D visual controls)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // handleMessage → node-live-audio-worklet-handle-message.js (Phase D)


  setInputWireBreakTrigger(nodeId, port) {
    if (!nodeId || !port) return;
    this.inputWireBreakTriggers.set(this.inputKey(nodeId, port), 1);
  }

  setSpeed(speed) {
    const value = Number(speed);
    this.speedMultiplier = Number.isFinite(value) ? Math.max(0, value) : 1;
  }

  setSpeedLimit(limit) {
    const value = Number(limit);
    this.speedLimit = Number.isFinite(value) && value > 0 ? value : 20000;
  }

  speedLimitHz() {
    const value = Number(this.speedLimit);
    return Number.isFinite(value) && value > 0 ? value : 20000;
  }

  // Universal linear frequency jack `f`: absolute Hz in [0, speedLimit].
  // Returns null when unwired so each oscillator can keep its own pitch path.
  readFInputHz(mixInput, nodeId, port = "f") {
    if (!this.inputConnections.has(this.inputKey(nodeId, port))) {
      return null;
    }
    const raw = Number(mixInput(nodeId, port));
    const limit = this.speedLimitHz();
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.max(0, Math.min(limit, raw));
  }

  resolveFrequencyHz(baseHz, fHzOrNull) {
    if (fHzOrNull != null && Number.isFinite(Number(fHzOrNull))) {
      return Math.max(0, Number(fHzOrNull));
    }
    const base = Number(baseHz);
    return Number.isFinite(base) ? Math.max(0, base) : 0;
  }

  effectiveSampleRate() {
    return (this.engineSampleRate || sampleRate || 44100) * Math.max(0, this.speedMultiplier ?? 1);
  }

  createImpulseButtonState() {
    return {
      amplitude: 1,
      pulseSamples: 0,
    };
  }

  setImpulseButtonTrigger(nodeId, amplitude) {
    if (!nodeId) return;
    const state = this.impulseButtonStates.get(nodeId) || this.createImpulseButtonState();
    // Short audible click (~20 ms), same family as other UI trigger pulses.
    const pulse = typeof this.gameTriggerPulseSamples === "function"
      ? this.gameTriggerPulseSamples()
      : Math.max(1, Math.round((this.engineSampleRate || sampleRate || 44100) * 0.02));
    state.pulseSamples = Math.max(0, Number(state.pulseSamples) || 0) + pulse;
    const normalized = Number(amplitude);
    state.amplitude = Number.isFinite(normalized) ? Math.max(0, Math.min(1, normalized)) : 1;
    this.impulseButtonStates.set(nodeId, state);
  }

  createBugButtonState() {
    return {
      down: 0,
      downPulseSamples: 0,
      hover: 0,
      upPulseSamples: 0,
      x: 0,
      y: 0,
    };
  }

  setBugButtonInteraction(message = {}) {
    const nodeId = String(message.nodeId || "");
    if (!nodeId) return;
    const state = this.bugButtonStates.get(nodeId) || this.createBugButtonState();
    if (message.down !== undefined) state.down = message.down ? 1 : 0;
    if (message.hover !== undefined) state.hover = message.hover ? 1 : 0;
    if (Number.isFinite(Number(message.x))) state.x = Math.max(-1, Math.min(1, Number(message.x)));
    if (Number.isFinite(Number(message.y))) state.y = Math.max(-1, Math.min(1, Number(message.y)));
    if (message.downPulse) state.downPulseSamples += 1;
    if (message.upPulse) state.upPulseSamples += 1;
    this.bugButtonStates.set(nodeId, state);
  }

  // setNativeModuleWasm → node-live-audio-worklet-native-load.js (Phase D native wasm load + gpu additive)


  // The dispatch chain below (one block per native module, unchanged) was
  // the body of setNativeModuleWasm; it now receives the exports object
  // directly so the combined wasm's single instance can be applied to every
  // module slot in one pass.
  // applyNativeModuleExports → node-live-audio-worklet-native-exports.js (Phase D)


  // clearPlan → node-live-audio-worklet-clear-plan.js (Phase D)


  // pushGpuAdditiveChunk → node-live-audio-worklet-native-load.js (Phase D native wasm load + gpu additive)


  // postGpuAdditiveStatus → node-live-audio-worklet-native-load.js (Phase D native wasm load + gpu additive)


  // setPlan → node-live-audio-worklet-set-plan.js (Phase D)


  setConnections(plan, message = {}) {
    this.patchFingerprint = message.patchFingerprint || plan?.patchFingerprint || this.patchFingerprint || "";
    this.planSerial = message.planSerial || this.planSerial || 0;
    this.sessionId = message.sessionId || this.sessionId || 0;
    this.outputNode = plan?.outputNode || this.outputNode || "output";
    this.scopeCaptureNodeIds = Array.isArray(plan?.scopeCaptureNodeIds)
      ? plan.scopeCaptureNodeIds.map((nodeId) => String(nodeId || "")).filter(Boolean)
      : this.scopeCaptureNodeIds;
    this.visualSinks = (Array.isArray(plan?.visualSinks) ? plan.visualSinks : this.visualSinks).map((sink) => ({
      ...sink,
      bufferedInputs: Array.isArray(sink?.bufferedInputs) ? [...sink.bufferedInputs] : [],
      inputs: (Array.isArray(sink?.inputs) ? sink.inputs : []).map((input) => ({ ...input })),
    }));
    this.syncVisualInputBuffers();
    const ids = new Set([...this.nodes.keys()]);
    this.inputConnections = this.buildInputConnectionMap(plan?.connections, ids);
    this.graphInputConnections = this.buildGraphInputConnectionMap(plan?.graphConnections, ids);
    this.modulationConnections = this.buildModulationConnectionMap(plan?.modulations, ids);
    const graphData = message.graphData || plan?.graphData;
    if (graphData) {
      this.setGraphData(graphData);
    }
  }

  /**
   * Lightweight graph-curve update (control points / cursorX) without rebuilding
   * connections or parameter smoothers. Used while dragging graph dots so the
   * audible shape tracks the face in realtime.
   */
  setGraphData(graphData) {
    if (!graphData || typeof graphData !== "object") {
      return;
    }
    for (const [nodeId, graph] of Object.entries(graphData)) {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.graph = graph;
      }
    }
  }

  setParams(nodes, message = {}) {
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
      // Keep drawn path in sync when params push also carries node extras.
      if (Object.hasOwn(node, "drawnPath")) {
        current.drawnPath = node.drawnPath || null;
      }
      if (Object.hasOwn(node, "samplePhase") && Number.isFinite(Number(node.samplePhase))) {
        current.samplePhase = Number(node.samplePhase);
      }
      parameterCount += Object.keys(current.params || {}).length;
      for (const [key, value] of Object.entries(current.params || {})) {
        const smootherKey = this.parameterKey(node.id, key);
        const metadata = current.paramMeta?.[key];
        if (!this.smoothers.has(smootherKey)) {
          this.smoothers.set(smootherKey, this.createSmoother(value, metadata));
        }
        this.updateSmoother(this.smoothers.get(smootherKey), value, metadata, smootherKey);
      }
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
  }

  setMidiKeyboardSignal(signal) {
    const source = signal && typeof signal === "object" ? signal : {};
    const midi = this.clampValue(Math.round(Number(source.midi) || 60), 0, 127);
    const keyIndex = this.clampValue(Number(source.keyIndex) || 0, 0, 24);
    const keyQuantized = this.clampValue(Number(source.keyQuantized) || keyIndex / 24, 0, 1);
    const frequency = Math.max(0, Number(source.frequency) || 440 * (2 ** ((midi - 69) / 12)));
    if (Number(source.gatePulse) > 0) {
      this.midiKeyboardGatePulseSamples = 1;
    }
    this.midiKeyboardSignal = {
      gate: Number(source.gate) > 0 ? 1 : 0,
      gatePulse: Number(source.gatePulse) > 0 ? 1 : 0,
      x: this.clampValue(Number(source.x) || keyQuantized, 0, 1),
      y: this.clampValue(Number(source.y) || 0, 0, 1),
      keyIndex,
      keyQuantized,
      midi,
      pitchValue: this.clampValue(Number(source.pitchValue) || midi, 0, 127),
      midiNormalized: this.clampValue(Number(source.midiNormalized) || midi / 127, 0, 1),
      tenthVoltPerOctave: this.clampValue(Number(source.tenthVoltPerOctave) || midi / 120, 0, 1),
      increment: Math.max(0, Number(source.increment) || frequency / Math.max(1, this.engineSampleRate || sampleRate)),
      frequency,
    };
  }

  setMacroControls(values) {
    this.macroControls = Array.from({ length: 8 }, (_, index) => (
      this.clampValue(Number(values?.[index]) || 0, 0, 1)
    ));
  }

  setMidiKeyboardHeldKeysBitmask(low, high) {
    const safeLow = Math.floor(Number(low));
    const safeHigh = Math.floor(Number(high));
    this.midiKeyboardHeldKeysLowBitmask = Number.isFinite(safeLow) && safeLow >= 0 ? safeLow : 0;
    this.midiKeyboardHeldKeysHighBitmask = Number.isFinite(safeHigh) && safeHigh >= 0 ? safeHigh : 0;
  }

  setPitchModWheelSignal(signal) {
    const source = signal && typeof signal === "object" ? signal : {};
    const pitch = Number(source.pitch);
    this.pitchModWheelSignal = {
      mod: this.clampValue(Number(source.mod) || 0, 0, 1),
      pitch: this.clampValue(Number.isFinite(pitch) ? pitch : 0, -1, 1),
    };
  }

  normalizeExternalButtonEventName(name) {
    const key = String(name || "").trim().toLowerCase();
    if (key === "mousedown" || key === "pointerdown") return "down";
    if (key === "mouseup" || key === "pointerup") return "up";
    if (key === "mouseenter" || key === "pointerenter") return "enter";
    if (key === "mouseleave" || key === "pointerleave") return "leave";
    return ["click", "hover", "down", "up", "enter", "leave"].includes(key) ? key : "";
  }

  setExternalButtonEvent(name) {
    const key = this.normalizeExternalButtonEventName(name);
    if (!key) return;
    const samples = Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.02));
    this.externalButtonEvents.set(key, Math.max(Number(this.externalButtonEvents.get(key)) || 0, samples));
  }

  externalButtonEventPulse(name) {
    const remaining = Number(this.externalButtonEvents.get(name)) || 0;
    if (remaining <= 0) {
      this.externalButtonEvents.delete(name);
      return 0;
    }
    this.externalButtonEvents.set(name, remaining - 1);
    return 1;
  }

  wireBreakGateSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.52));
  }

  gameTriggerPulseSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 0.02));
  }

  setWireBreakEvent() {
    const event = this.wireBreakEvent && typeof this.wireBreakEvent === "object"
      ? this.wireBreakEvent
      : { pulseSamples: 0, gateSamples: 0 };
    event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, this.gameTriggerPulseSamples());
    event.gateSamples = Math.max(Number(event.gateSamples) || 0, this.wireBreakGateSamples());
    this.wireBreakEvent = event;
  }

  wireBreakEventSample() {
    const event = this.wireBreakEvent && typeof this.wireBreakEvent === "object"
      ? this.wireBreakEvent
      : { pulseSamples: 0, gateSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    const gateSamples = Math.max(0, Number(event.gateSamples) || 0);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    event.gateSamples = Math.max(0, gateSamples - 1);
    this.wireBreakEvent = event;
    return {
      Pulse: pulseSamples > 0 ? 1 : 0,
      Gate: gateSamples > 0 ? 1 : 0,
    };
  }

  setWireConnectEvent() {
    const event = this.wireConnectEvent && typeof this.wireConnectEvent === "object"
      ? this.wireConnectEvent
      : { pulseSamples: 0 };
    event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, this.gameTriggerPulseSamples());
    this.wireConnectEvent = event;
  }

  wireConnectEventSample() {
    const event = this.wireConnectEvent && typeof this.wireConnectEvent === "object"
      ? this.wireConnectEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.wireConnectEvent = event;
    return { Pulse: pulseSamples > 0 ? 1 : 0 };
  }

  setWireDisconnectEvent() {
    const event = this.wireDisconnectEvent && typeof this.wireDisconnectEvent === "object"
      ? this.wireDisconnectEvent
      : { pulseSamples: 0 };
    event.pulseSamples = Math.max(Number(event.pulseSamples) || 0, this.gameTriggerPulseSamples());
    this.wireDisconnectEvent = event;
  }

  wireDisconnectEventSample() {
    const event = this.wireDisconnectEvent && typeof this.wireDisconnectEvent === "object"
      ? this.wireDisconnectEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.wireDisconnectEvent = event;
    return { Pulse: pulseSamples > 0 ? 1 : 0 };
  }

  setShootingStarExplosionEvent(speed = null) {
    const event = this.shootingStarExplosionEvent && typeof this.shootingStarExplosionEvent === "object"
      ? this.shootingStarExplosionEvent
      : { pulseSamples: 0, speed: null };
    event.pulseSamples = Math.max(0, Number(event.pulseSamples) || 0) + 1;
    const normalizedSpeed = Number(speed);
    event.speed = Number.isFinite(normalizedSpeed) ? normalizedSpeed : null;
    this.shootingStarExplosionEvent = event;
  }

  nativeShootingStarExplosionPower(speed, lowRange = 0, highRange = 1) {
    if (
      !this.nativeShootingStarExplosionReady
      || !this.nativeShootingStarExplosion?.soemdsp_shooting_star_explosion_power
    ) {
      throw new Error("native Shooting Star Explosion not ready");
    }
    const low = Number(lowRange) || 0;
    const high = Number(highRange) || 0;
    return this.safeFilterNumber(
      this.nativeShootingStarExplosion.soemdsp_shooting_star_explosion_power(
        Number.isFinite(speed) ? speed : -1,
        low,
        high,
      ),
      null,
    );
  }

  shootingStarExplosionEventSample(lowRange = 0, highRange = 1) {
    const event = this.shootingStarExplosionEvent && typeof this.shootingStarExplosionEvent === "object"
      ? this.shootingStarExplosionEvent
      : { pulseSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    const speed = Number(event.speed);
    const power = this.nativeShootingStarExplosionPower(speed, lowRange, highRange);
    event.pulseSamples = Math.max(0, pulseSamples - 1);
    this.shootingStarExplosionEvent = event;
    return { Pulse: pulseSamples > 0 ? power : 0 };
  }

  windowReopenGateSamples() {
    return Math.max(1, Math.round(Math.max(1, this.engineSampleRate || sampleRate) * 1));
  }

  setWindowReopenEvent() {
    const samples = this.windowReopenGateSamples();
    this.windowReopenEvent = {
      gateSamples: samples,
      pulseSamples: this.gameTriggerPulseSamples(),
      totalSamples: samples,
    };
  }

  windowReopenEventSample() {
    const event = this.windowReopenEvent && typeof this.windowReopenEvent === "object"
      ? this.windowReopenEvent
      : { pulseSamples: 0, gateSamples: 0, totalSamples: 0 };
    const pulseSamples = Math.max(0, Number(event.pulseSamples) || 0);
    const gateSamples = Math.max(0, Number(event.gateSamples) || 0);
    const totalSamples = Math.max(1, Number(event.totalSamples) || gateSamples || 1);
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
  }

  buildConnectionMap(items, ids, keyForItem) {
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
  }

  buildInputConnectionMap(connections, ids) {
    return this.buildConnectionMap(
      connections,
      ids,
      (connection) => this.inputKey(connection.destinationNode, connection.destinationPort),
    );
  }

  buildModulationConnectionMap(modulations, ids) {
    return this.buildConnectionMap(
      modulations,
      ids,
      (modulation) => this.parameterKey(modulation.destinationNode, modulation.destinationParam),
    );
  }

  buildGraphInputConnectionMap(graphConnections, ids) {
    return this.buildConnectionMap(
      graphConnections,
      ids,
      (connection) => this.graphInputKey(connection.destinationNode, connection.destinationGraphInput),
    );
  }

  inputKey(node, port) {
    return `${node}.${port}`;
  }

  graphInputKey(node, graphInput) {
    return `${node}.${graphInput}`;
  }

  parameterKey(node, parameter) {
    return `${node}.${parameter}`;
  }

  stableSeed(text) {
    let seed = 0x12345678;
    for (const character of String(text)) {
      seed = (Math.imul(seed ^ character.charCodeAt(0), 16777619)) >>> 0;
    }
    return seed || 0x12345678;
  }

  wrapValue(value, min, max) {
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return min;
    }
    return min + ((((value - min) % range) + range) % range);
  }

  clampValue(value, min, max) {
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
  }

  // normalizeGraphNumber → node-live-audio-worklet-graph.js (Phase D graph math)


  // normalizeGraphShape → node-live-audio-worklet-graph.js (Phase D graph math)


  // normalizeGraphNode → node-live-audio-worklet-graph.js (Phase D graph math)


  // normalizeGraph → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphEndpointYLockEnabledForNode → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphWithLockedEndpointY → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphForNode → node-live-audio-worklet-graph.js (Phase D graph math)


  /**
   * |contour| = 1 → perfect step. Matches continuous rational as |c|→1:
   * +1 jump to right immediately; −1 hold left until end.
   */
  // graphHardStepShape → node-live-audio-worklet-graph.js (Phase D graph math)


  /**
   * Blend continuous → shared hard square by |contour| so rational/exp/log
   * all hit full square at the same |c| (and same Curve Offset).
   */
  // graphBlendContourTowardHardStep → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphRationalCurve → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphExponentialCurve → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphLogarithmicCurve → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphSmoothCurve → node-live-audio-worklet-graph.js (Phase D graph math)


  // normalizeGraph2SmoothingMode → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphModeCurve → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphBezierPointAt → node-live-audio-worklet-graph.js (Phase D graph math)


  // Guide-point Bezier: start+end on-curve only; interior nodes are handles.
  // Tension 0 = line, 1 = tight pull toward guides (no hard corners).
  // Mirrors offline nodeGraphGraphGuideBezierValueAt.
  // graphGuideBezierControls → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphGuideBezierValueAt → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphBezierValueAt → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphPolylineValueAt → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphHermiteY → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphInterpolationWindowStart → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphLagrangeValueAt → node-live-audio-worklet-graph.js (Phase D graph math)


  // Cardinal through-points: tension 0 = polyline, mid = tight rounded, 1 = loose.
  // Matches offline nodeGraphGraphCardinalValueAt (see graph-utils).
  // graphCardinalValueAt → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphCatmullRomValueAt → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphSmoothingModeForNode → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphSegmentShapeFromParam → node-live-audio-worklet-graph.js (Phase D graph math)


  /** Step Graph: global shape + curveOffset; per-node c still applied. */
  // graphSegmentOptionsForNode → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphSegmentValue → node-live-audio-worklet-graph.js (Phase D graph math)


  // graphValueAt → node-live-audio-worklet-graph.js (Phase D graph math)


  outputSampleClipped(value) {
    return this.badValueReason(value) || value < -0.95 || value > 0.95;
  }

  outputSampleTripsEarProtection(value) {
    const number = Number(value);
    return !Number.isFinite(number) || Math.abs(number) > 1;
  }

  badValueReason(value) {
    const number = Number(value);
    if (Number.isNaN(number)) {
      return "NaN";
    }
    if (!Number.isFinite(number)) {
      return "inf";
    }
    if (Math.abs(number) > 999999999) {
      return "exploded";
    }
    if (number !== 0 && Math.abs(number) < 1.1754943508222875e-38) {
      return "denormal";
    }
    return "";
  }

  // scopeScalarValue → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // captureModuleScopeFrame → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // appendScopeBufferSample → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // createVisualInputBuffer → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // normalizeVisualInputBufferCapacity → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // resizeVisualInputBufferState → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // syncVisualInputBuffers → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // writeVisualInputBufferSample → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // captureModuleScopeOutput → node-live-audio-worklet-scope-io.js (Phase D scope capture IO)


  // postModuleScopeSnapshot → node-live-audio-worklet-scope-snapshot.js (Phase D)


  // smoothingSeconds metadata is a SAMPLE COUNT, not seconds: 0 bypasses
  // smoothing entirely, and any N > 0 smooths over exactly N samples.
  // smoothingSecondsFromMetadata → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // smoothingModeFromMetadata → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // smoothingTypeFromMetadata → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // Resolves a parameter's effective smoothing window in seconds (0 means
  // "snap instantly") from its smoothingMode:
  //   internal        -- this parameter's own smoothingSeconds sample count
  //                       (0 samples bypasses smoothing for this param only)
  //   global          -- always use the global smoothing time, ignoring the
  //                       parameter's own smoothingSeconds
  //   blockSize       -- smooth over exactly one audio processing block
  //   internalGlobal  -- internal samples PLUS the global smoothing time
  //   off             -- always instant, ignoring both internal and global
  // resolveSmoothingSecondsForMode → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // createSmoother → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // clampAutoSmoothingSeconds → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // smoothingFrequencyFromSeconds → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // syncNestedAutoSmoothingSeconds → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // soemdsp SmootherBase::needsSmoothing — skip settled params.
  // smootherNeedsWork → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  /** Snap chase state to target (value + optional filter state). */
  // settleSmoother → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  /** Drop a marked-or-settled entry from the dirty-list key set. */
  // clearSmootherActiveMembership → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  /**
   * soemdsp SmootherManager::addForSmoothing — only moving chases are hot.
   * Cost ∝ active count, not all params.
   */
  // activateSmoother → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // deactivateSmoother → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  /** One sample of chase. Returns true if still moving (stay on dirty list). */
  // stepSmootherOneSample → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  /**
   * soemdsp SmootherManager::run + clean — advance dirty chases once per
   * engine sample, then drop settled ones.
   */
  // runActiveSmoothers → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // updateSmoother → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  /**
   * Readers only — active set advances once per engine sample in evaluateFrame.
   * lastValue is the shared out_.
   */
  // readSmoothedParameter → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // finishSmoothing → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // applyParameterBounds → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  readRuntimeOutput(frameValues, nodeId, port = "Out") {
    const output = frameValues?.has(nodeId)
      ? frameValues.get(nodeId)
      : this.nodeOutputs.get(nodeId);
    if (output && typeof output === "object") {
      return Number(output[port] ?? output.Out ?? 0);
    }
    return output === undefined || output === null ? 0 : Number(output);
  }

  // parameterOutputExists → node-live-audio-worklet-param-map.js (Phase D parameter normalize map)


  // normalizeParameterOutputValue → node-live-audio-worklet-param-map.js (Phase D parameter normalize map)


  // normalizeParameterModulationInput → node-live-audio-worklet-param-map.js (Phase D parameter normalize map)


  // parameterSkewExponent → node-live-audio-worklet-param-map.js (Phase D parameter normalize map)


  // parameterValueToNormalizedSignal → node-live-audio-worklet-param-map.js (Phase D parameter normalize map)


  // normalizedSignalToParameterValue → node-live-audio-worklet-param-map.js (Phase D parameter normalize map)


  // applyParameterModulation → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // readRuntimePortOutput → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  // readEffectiveParameter → node-live-audio-worklet-smoother.js (Phase D parameter smoother)


  phaseRadians(value) {
    return this.wrapValue(Number(value) || 0, 0, 1) * Math.PI * 2;
  }

  nextNoiseSample(nodeId) {
    const seed = (Math.imul(1664525, this.noiseSeeds.get(nodeId) || 0x12345678) + 1013904223) >>> 0;
    this.noiseSeeds.set(nodeId, seed);
    return (seed / 0xffffffff) * 2 - 1;
  }

  currentNoiseSample(nodeId) {
    if (!this.noiseSeeds.has(nodeId)) {
      return this.nextNoiseSample(nodeId);
    }
    return ((this.noiseSeeds.get(nodeId) || 0) / 0xffffffff) * 2 - 1;
  }

  noiseSeedKey(nodeId, seedValue, channel = "") {
    const seed = Math.max(0, Math.min(99999, Math.floor(Number(seedValue) || 0)));
    return `${nodeId}${channel ? `:${channel}` : ""}:seed:${seed}`;
  }

  polyBlep(phaseCycle, phaseIncrement) {
    const dt = this.clampValue(Math.abs(Number(phaseIncrement) || 0), 1e-6, 0.5);
    if (phaseCycle < dt) {
      const t = phaseCycle / dt;
      return t + t - t * t - 1;
    }
    if (phaseCycle > 1 - dt) {
      const t = (phaseCycle - 1) / dt;
      return t * t + t + t + 1;
    }
    return 0;
  }

  polyBlepSquare(phaseCycle, phaseIncrement) {
    let value = phaseCycle < 0.5 ? 1 : -1;
    value += this.polyBlep(phaseCycle, phaseIncrement);
    value -= this.polyBlep(this.wrapValue(phaseCycle + 0.5, 0, 1), phaseIncrement);
    return value;
  }

  // Native-only Archimedes (no JS symplectic-Euler sample fallback).
  archimedesSample(options = {}) {
    if (
      !this.nativeArchimedesReady
      || !this.nativeArchimedes?.soemdsp_archimedes_create
      || !this.nativeArchimedes?.soemdsp_archimedes_step
    ) {
      throw new Error("native Archimedes Oscillator not ready");
    }
    const state = options.state || this.createArchimedesState();
    const dtShift = this.clampValue(Math.round(Number(options.profile) || 12), 4, 24);
    const freqHz = Math.max(0, Math.round(Number(options.frequency) || 0));
    const ditherBits = Math.max(0, Math.round(Number(options.dither) || 0));
    if (!state.nativeHandle) {
      state.nativeHandle = this.nativeArchimedes.soemdsp_archimedes_create();
    }
    if (!state.nativeHandle) {
      throw new Error("native Archimedes Oscillator failed to create instance");
    }
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      this.nativeArchimedes.soemdsp_archimedes_reset(state.nativeHandle);
      this.nativeArchimedes.soemdsp_archimedes_reset_counters(state.nativeHandle);
    }
    state.resetWasHigh = resetHigh;
    this.nativeArchimedes.soemdsp_archimedes_set_profile(state.nativeHandle, dtShift);
    this.nativeArchimedes.soemdsp_archimedes_set_frequency(state.nativeHandle, freqHz);
    this.nativeArchimedes.soemdsp_archimedes_step(state.nativeHandle, ditherBits);
    return {
      sine: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_sine(state.nativeHandle), 0),
      cosine: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_cosine(state.nativeHandle), 0),
      pi: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_extract_pi(state.nativeHandle), 0),
      noiseBelow: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_noise_below?.(state.nativeHandle), 0),
      noiseAbove: this.safeFilterNumber(this.nativeArchimedes.soemdsp_archimedes_noise_above?.(state.nativeHandle), 0),
    };
  }

  createHighpassState() {
    return {
      inputBuffer: 0,
      outputBuffer: 0,
    };
  }

  createLowpassState() {
    return {
      outputBuffer: 0,
    };
  }

  // Bundles three independent per-channel filter states (mono/left/right) under
  // one map entry, so a stereo signal gets three genuinely independent native
  // handles/filter histories instead of one shared (and thus mono-summed)
  // instance. `createFn` is one of this class's existing createXState methods.
  createStereoFilterState(createFn) {
    return { left: createFn(), mono: createFn(), right: createFn() };
  }

  // Companion to createStereoFilterState: destroys all three channels'
  // native handles (if any) via the module's existing destroyXNativeState
  // method, tolerating a pre-bundle single-state shape defensively.
  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  createOscResetState() {
    return {
      lastReset: 0,
    };
  }

  createGraphLfoState() {
    return {
      lastReset: 0,
      // Free-running phasor position in cycles [0, 1). Advanced by rate/sr
      // each sample in Phasor mode so Rate changes only alter slope.
      phase: 0,
      resetFrame: 0,
    };
  }

  createSamplePlaybackState() {
    return {
      lastReset: 0,
      phase: 0,
      playing: false,
      rangeKey: "",
      sampleId: "",
    };
  }

  createArchimedesState() {
    return {
      nativeHandle: 0,
      x: 0,
      y: 1,
      lastSign: 0,
      totalSteps: 0,
      zeroCrossings: 0,
      resetWasHigh: false,
      noiseLow: 0,
    };
  }

  resetArchimedesState(state) {
    state.x = 0;
    state.y = 1;
    state.lastSign = 0;
    state.totalSteps = 0;
    state.zeroCrossings = 0;
  }

  createNoiseGeneratorChannelState() {
    return { brown: 0, gaussianSpare: null, pink: [0, 0, 0, 0, 0, 0, 0], seed: 0, seedKey: "" };
  }

  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  /**
   * Point the shared param-smoother Papoulis type at papoulis_filter.wasm
   * (for any parameter still using smoothingType: "papoulis").
   */
  bindPapoulisParameterSmootherNativeHost() {
    if (typeof nodeGraphSetPapoulisParameterSmootherNativeHost !== "function") {
      return;
    }
    if (!this.nativePapoulisFilterReady || !this.nativePapoulisFilter) {
      nodeGraphSetPapoulisParameterSmootherNativeHost(null);
      return;
    }
    const native = this.nativePapoulisFilter;
    const hasSnapExport = typeof native.soemdsp_papoulis_filter_snap === "function";
    nodeGraphSetPapoulisParameterSmootherNativeHost({
      ready: true,
      hasSnapExport,
      create() {
        return native.soemdsp_papoulis_filter_create() || 0;
      },
      sample(handle, input, cutoffHz, rate) {
        return native.soemdsp_papoulis_filter_sample(handle, input, cutoffHz, rate);
      },
      snap(handle, value) {
        if (hasSnapExport) {
          native.soemdsp_papoulis_filter_snap(handle, value);
          return;
        }
        // Legacy wasm without snap: destroy so next sample recreates.
        if (handle && native.soemdsp_papoulis_filter_destroy) {
          native.soemdsp_papoulis_filter_destroy(handle);
        }
      },
      destroy(handle) {
        if (handle && native.soemdsp_papoulis_filter_destroy) {
          native.soemdsp_papoulis_filter_destroy(handle);
        }
      },
    });
  }

  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // Papoulis (Optimum-L) order-3 lowpass. Normalized (cutoff = 1 rad/s) prototype:
  //   D(s) = (s + 0.6203) * (s^2 + 0.6904s + 0.9308)
  // Each factor is unity-DC-gain individually, frequency-scaled to cutoff, and
  // bilinear-transformed to digital per stage (1-pole cascaded with a biquad).

  // Phosphillator playback: decodes the drawn closed loop (packed as
  // Phosphor Draw Sample doubles — see node-graph-phosphor-draw-sample.js
  // for the format) and walks it via a 0..1 phase accumulator using the
  // same 0.1V/Oct convention as osc. Duplicated here rather than shared
  // with the main-thread files because the worklet runs in an isolated
  // global scope with no access to them.

  safeFilterNumber(value, state) {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (!reason) {
      return number;
    }
    if (state) {
      state.inputBuffer = 0;
      state.outputBuffer = 0;
    }
    this.badNumberCount += 1;
    if (!this.lastBadValueNodeId) {
      this.lastBadValueReason = reason;
      this.lastBadValueSource = "";
    }
    return 0;
  }

  // visualControlIntensity → node-live-audio-worklet-visual.js (Phase D visual controls)


  // visualControlSigned → node-live-audio-worklet-visual.js (Phase D visual controls)


  // smoothVisualControl → node-live-audio-worklet-visual.js (Phase D visual controls)


  // postVisualControls → node-live-audio-worklet-visual.js (Phase D visual controls)


  sampleChannelAt(sample, channelIndex, frameIndex) {
    const channel = sample?.channelData?.[channelIndex] || sample?.samples;
    if (!channel?.length) {
      return 0;
    }
    const maxIndex = channel.length - 1;
    const index = this.clampValue(Number(frameIndex) || 0, 0, maxIndex);
    const low = Math.floor(index);
    const high = Math.min(maxIndex, low + 1);
    const frac = index - low;
    return (Number(channel[low]) || 0) + ((Number(channel[high]) || 0) - (Number(channel[low]) || 0)) * frac;
  }

  sampleStereoAt(sample, frameIndex) {
    const left = this.sampleChannelAt(sample, 0, frameIndex);
    const right = sample?.channelData?.length > 1
      ? this.sampleChannelAt(sample, 1, frameIndex)
      : left;
    return {
      Left: left,
      Mono: (left + right) * 0.5,
      Out: (left + right) * 0.5,
      Right: right,
    };
  }

  // onePoleHighpassSample → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // onePoleLowpassSample → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // Exact soemdsp::curve::Rational::get(p), p already normalized to [0,1].

  // Exact soemdsp::utility::Graph::getValue for the 3-node shape this
  // filter uses -- see native_modules/flower_child_filter/
  // flower_child_filter.cpp's header comment for the full derivation.

  // Shared helpers for the RSMET/Yellowjacket/SuperLove/ChaoticPhaseLocking/
  // Resonator/Human filter family below.

  // analogLadderTapStep → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // analogLadderCoefficient → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // analogRationalCurve → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // analogEvalGraph → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // analogWaveEllipseFull → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // analogWaveEllipse → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // analogWaveTrisaw → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // analogPitchToFreq → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // --- RSMET Filter ---

  // --- Yellowjacket Filter ---

  // --- SuperLove Filter ---

  // --- Chaotic Phase Locking Filter ---

  // --- Resonator Filter ---

  // --- Human Filter ---

  // humanFilterDbToAmp → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // --- Pulse Explosion ---

  // Deterministic 32-bit mulberry32 PRNG so a non-zero seed reproduces the
  // same pulse schedule every time (seed 0 keeps the free-running behavior).

  normalizePatchTiming(timing = {}) {
    const source = timing && typeof timing === "object" ? timing : {};
    return {
      tempoBpm: Math.max(1, Math.round(Number(source.tempoBpm) || 120)),
      timeSignatureDenominator: Math.max(1, Math.round(Number(source.timeSignatureDenominator) || 4)),
      timeSignatureNumerator: Math.max(1, Math.round(Number(source.timeSignatureNumerator) || 4)),
    };
  }

  // delayInterpolateLinear → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // X/Y as a fraction of a whole note. Both are free metaparameters -- never
  // clamped or rejected here, only floored for this one computation:
  // - Negative numerator or denominator behaves like 0.
  // - A numerator of 0 (or negative) always means "no time", for any
  //   denominator including 0 -- this also sidesteps 0/0 producing NaN.
  // - A non-zero numerator over a 0 (or negative) denominator falls back to
  //   a denominator of 1, i.e. "X/0" reads as "X whole notes", rather than
  //   dividing by zero.

  // DspBinding for Sabrina Reverb: resolves clamped native params, checks
  // whether they've actually changed since the last apply (paramKey dirty
  // check), and only then syncs them into native DSP memory via
  // soemdsp_sabrina_reverb_set_params. Pure extraction -- same clamps, same
  // key construction, same condition, same call args as before.

  // seededKey → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // resetSeededState → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // nextSeededUnipolar → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // nextSeededBipolar → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // hashBipolar → node-live-audio-worklet-analog.js (Phase D analog / filter / seeded helpers)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)



  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // Registry of per-module-type dispatch handlers, proving the pattern for
  // logisticMap/turingMachine before the other ~28 worklet-dispatched types
  // migrate in a follow-up pass. Checked ahead of the big if/else-if chain
  // in evaluateFrame() so adding a migrated type never requires editing that
  // chain again. Bodies are copy-pasted from node-graph-live-frame-evaluator.js's
  // equivalent branches (not shared by reference) because AudioWorkletGlobalScope
  // can only load the single file passed to addModule() -- true de-duplication
  // is deferred to the Blob-URL loader follow-up.
  // buildLiveModuleEvaluators lives in node-live-audio-worklet-evaluators.js
  // (Phase D extract). Prototype method is assigned before the processor runs.


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // Unwired inputs default to 0, a constant -- silent no matter the truth
  // table. So an unwired Clock free-runs at a fixed audible rate instead
  // (220 Hz), and an unwired A tracks that same effective clock, so a
  // freshly dropped cell audibly demonstrates itself. This lives entirely
  // in this JS orchestration layer -- the native module itself stays a
  // faithful, purely reactive LUT+FF with no self-driving of its own.

  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // pureSawEng(t, n), transcribed and simplified directly from "Extended
  // DSF Oscillators.cxx": sin(PI*t*(2N+1)) / sin(PI*t) - 1. Guarded at the
  // removable singularity t=0 via its L'Hopital limit (2N+1).

  // Harmonics (0-1): crossfades the harmonic count from 1 (a single
  // harmonic, an exact sine) up to nMax (Nyquist/frequency).

  // ~20 periods of memory, decayed to ~1%. Every accumulator's retention
  // scales with the oscillation period instead of a fixed per-sample
  // constant -- a fixed retention was far shorter than the period at low
  // frequencies, so accumulators forgot mid-ramp and produced distorted,
  // asymmetric shapes (Trimorph sounding like a square wave; DC
  // asymmetry in Saw/Square/SquSaw). See dsf_oscillator.cpp for the full
  // story.

  // waveform: 0=Sine, 1=Saw, 2=Square (PWM), 3=Trimorph, 4=SquSaw.
  // Square: saw(t) - saw(t - pulseWidth) -- alias-free since it's a
  // subtraction of phase-shifted copies of an already-verified Saw.
  // Trimorph: a second leaky integration on the (bounded) Square output,
  // with an adaptive peak-follower since that second stage doesn't stay
  // bounded on its own across the full frequency range.

  // RobinSupersaw — native-only (see robin-supersaw-worklet-evaluator.js).

  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // rsPitchDitherOsc<T>::calcCycleDistribution(), transcribed.

  // rsPitchDitherOsc<T>::updateCycleLength(), transcribed.

  // rsPitchDitherOsc<T>::getSamplePhasor() + updateSampleCount(), transcribed.

  // Hypersaw — native-only (see hypersaw-worklet-evaluator.js).

  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // destroy* methods → node-live-audio-worklet-destroy.js (Phase D)


  // evaluateFrame → node-live-audio-worklet-evaluate-frame.js (Phase D)


  // process → node-live-audio-worklet-process.js (Phase D)

}
