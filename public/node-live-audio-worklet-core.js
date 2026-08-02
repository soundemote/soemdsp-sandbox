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

  createVisualControlState() {
    return {
      controls: {
        blue: 0,
        chromaAlpha: 0,
        chromaDrift: 0,
        chromaHue: 0,
        chromaLightness: 0,
        chromaSaturation: 0,
        chromaSpread: 0,
        green: 0,
        red: 0,
        scopePaused: 0,
        scopeTracesOff: 0,
        screenDim: 0,
        screenShake: 0,
        visualBloom: 0,
        visualBrightness: 0,
        visualGlow: 0,
        x: 0,
        y: 0,
      },
      counter: 0,
      states: new Map([
        ["blue", 0],
        ["chromaAlpha", 0],
        ["chromaDrift", 0],
        ["chromaHue", 0],
        ["chromaLightness", 0],
        ["chromaSaturation", 0],
        ["chromaSpread", 0],
        ["green", 0],
        ["red", 0],
        ["scopePaused", 0],
        ["scopeTracesOff", 0],
        ["screenDim", 0],
        ["screenShake", 0],
        ["visualBloom", 0],
        ["visualBrightness", 0],
        ["visualGlow", 0],
        ["x", 0],
        ["y", 0],
      ]),
    };
  }

  resetVisualControls() {
    const visualState = this.createVisualControlState();
    this.visualControls = visualState.controls;
    this.visualControlCounter = visualState.counter;
    this.visualControlStates = visualState.states;
  }

  // destroySabrinaReverbState → node-live-audio-worklet-destroy.js (Phase D)


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

  async setNativeModuleWasm(message) {
    if (!(message.bytes instanceof ArrayBuffer)) {
      return;
    }
    const name = String(message.name || "");
    const targetType = String(message.targetType || "");
    let exports = null;
    try {
      const result = await WebAssembly.instantiate(message.bytes, {});
      exports = result?.instance?.exports || null;
    } catch (error) {
      // For the combined binary, report per-module errors (so Module
      // Diagnostics names what's affected) plus one under "combined" (so
      // the main thread's retry handler un-marks it for the next plan
      // update).
      const failed = name === "combined" && Array.isArray(message.modules)
        ? [...message.modules, { name: "combined" }]
        : [{ name, targetType }];
      for (const entry of failed) {
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: String(entry?.name || name),
          status: "error",
          message: String(error?.message || error || "native module load failed"),
        });
      }
      return;
    }
    if (name === "combined") {
      // One instance, one shared linear memory, every module's exports on
      // the same object (all prefix-namespaced) -- apply it to each module
      // slot in turn. See scripts/build_native_modules.ps1 for why.
      const entries = Array.isArray(message.modules) ? message.modules : [];
      for (const entry of entries) {
        const entryName = String(entry?.name || "");
        try {
          this.applyNativeModuleExports(entryName, String(entry?.targetType || ""), exports);
        } catch (error) {
          this.port.postMessage({
            type: "nativeModuleStatus",
            name: entryName,
            status: "error",
            message: String(error?.message || error || "native module apply failed"),
          });
        }
      }
      return;
    }
    try {
      this.applyNativeModuleExports(name, targetType, exports);
    } catch (error) {
      this.port.postMessage({
        type: "nativeModuleStatus",
        name,
        status: "error",
        message: String(error?.message || error || "native module apply failed"),
      });
    }
  }

  // The dispatch chain below (one block per native module, unchanged) was
  // the body of setNativeModuleWasm; it now receives the exports object
  // directly so the combined wasm's single instance can be applied to every
  // module slot in one pass.
  // applyNativeModuleExports → node-live-audio-worklet-native-exports.js (Phase D)


  // clearPlan → node-live-audio-worklet-clear-plan.js (Phase D)


  pushGpuAdditiveChunk(message = {}) {
    if (message.sessionId !== this.sessionId || message.planSerial !== this.planSerial) {
      return;
    }
    const nodeId = String(message.nodeId || "");
    const samples = message.samples instanceof Float32Array
      ? message.samples
      : new Float32Array(message.samples || []);
    if (!nodeId || samples.length <= 0) {
      return;
    }
    const queue = this.gpuAdditiveQueues.get(nodeId) || {
      backend: "",
      chunks: [],
      droppedChunks: 0,
      expectedSequence: 0,
      heldGain: 1,
      heldSamples: 0,
      lastSample: 0,
      readIndex: 0,
      resetCount: 0,
      version: "",
    };
    queue.backend = String(message.backend || queue.backend || "");
    const version = String(message.version || "");
    if (queue.version !== version) {
      queue.chunks = [];
      queue.droppedChunks = 0;
      queue.expectedSequence = 0;
      queue.readIndex = 0;
      queue.resetCount += 1;
      queue.version = version;
    }
    const sequence = Number(message.sequence);
    if (Number.isFinite(sequence)) {
      if (sequence < queue.expectedSequence) {
        return;
      }
      if (sequence > queue.expectedSequence) {
        queue.droppedChunks += sequence - queue.expectedSequence;
        queue.chunks = [];
        queue.readIndex = 0;
      }
      queue.expectedSequence = sequence + 1;
    }
    queue.chunks.push(samples);
    while (queue.chunks.length > 12) {
      queue.chunks.shift();
      queue.droppedChunks += 1;
      queue.readIndex = 0;
    }
    this.gpuAdditiveQueues.set(nodeId, queue);
  }

  postGpuAdditiveStatus() {
    const queues = [];
    for (const [nodeId, queue] of this.gpuAdditiveQueues) {
      queues.push({
        nodeId,
        backend: queue.backend,
        chunks: queue.chunks.length,
        droppedChunks: queue.droppedChunks,
        expectedSequence: queue.expectedSequence,
        heldGain: queue.heldGain,
        heldSamples: queue.heldSamples,
        resetCount: queue.resetCount,
        samples: queue.chunks.reduce((sum, chunk) => sum + chunk.length, 0) - queue.readIndex,
        version: queue.version,
      });
    }
    this.port.postMessage({
      queues,
      sessionId: this.sessionId,
      type: "gpuAdditiveStatus",
      underruns: this.gpuAdditiveUnderruns,
    });
    this.gpuAdditiveUnderruns = 0;
  }

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

  scopeScalarValue(value) {
    const readNumber = (candidate) => {
      const number = Number(candidate);
      if (this.badValueReason(number)) {
        return null;
      }
      return this.clampValue(number, -1, 1);
    };
    if (typeof value === "number") {
      return readNumber(value) ?? 0;
    }
    if (!value || typeof value !== "object") {
      return 0;
    }
    for (const key of ["Bias", "Out", "Out X", "Out Y", "Out Z", "Left", "Right", "X", "Y", "Z", "Pulse", "Gate", "Count"]) {
      const number = readNumber(value[key]);
      if (number !== null) {
        return number;
      }
    }
    for (const candidate of Object.values(value)) {
      const number = readNumber(candidate);
      if (number !== null) {
        return number;
      }
    }
    return 0;
  }

  captureModuleScopeFrame(frameValues = null, frame = 0, frames = 1) {
    this.scopeSampleStride = Math.max(1, Math.floor((Number(this.engineSampleRate) || sampleRate || 44100) / 12000));
    const captureDebugScope = (this.scopeCounter % this.scopeSampleStride) === 0;
    if (captureDebugScope) {
      const captureNodeIds = Array.isArray(this.scopeCaptureNodeIds)
        ? this.scopeCaptureNodeIds
        : this.order;
      for (const nodeId of captureNodeIds) {
        if (!this.nodeOutputs.has(nodeId)) {
          continue;
        }
        this.captureModuleScopeOutput(nodeId, this.nodeOutputs.get(nodeId));
      }
    }
    for (const sink of this.visualSinks || []) {
      const nodeId = String(sink?.nodeId || "");
      if (!nodeId) {
        continue;
      }
      if (
        Array.isArray(this.scopeCaptureNodeIds) &&
        !this.scopeCaptureNodeIds.includes(nodeId)
      ) {
        continue;
      }
      let value = 0;
      for (const input of sink.inputs || []) {
        if (!input?.connected) {
          continue;
        }
        const inputValue = (input.connections || []).reduce(
          (connectionSum, connection) => connectionSum + this.readRuntimePortOutput(
            frameValues,
            connection.sourceNode,
            connection.sourcePort,
            frame,
            frames,
          ),
          0,
        );
        value += inputValue;
        const inputPort = String(input.port || "").trim();
        if (input?.buffered && inputPort) {
          this.writeVisualInputBufferSample(nodeId, inputPort, inputValue, sink.bufferSampleLimit);
        }
        if (captureDebugScope && inputPort && !input?.buffered) {
          const portId = `${nodeId}:${inputPort}`;
          this.appendScopeBufferSample(portId, inputValue);
        }
      }
      if (captureDebugScope) {
        this.appendScopeBufferSample(nodeId, value);
      }
    }
  }

  appendScopeBufferSample(id, value) {
    const key = String(id || "");
    if (!key) {
      return;
    }
    const limit = 4096;
    let samples = this.scopeBuffers.get(key);
    if (!(samples instanceof Float32Array)) {
      samples = new Float32Array(limit);
      samples.nodeGraphScopeWriteIndex = 0;
      samples.nodeGraphScopeLength = 0;
      this.scopeBuffers.set(key, samples);
    }
    const writeIndex = Math.max(0, Math.min(limit - 1, Number(samples.nodeGraphScopeWriteIndex) || 0));
    samples[writeIndex] = this.scopeScalarValue(value);
    samples.nodeGraphScopeWriteIndex = (writeIndex + 1) % limit;
    samples.nodeGraphScopeLength = Math.min(limit, (Number(samples.nodeGraphScopeLength) || 0) + 1);
  }

  createVisualInputBuffer(capacity = 262144) {
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    return {
      absoluteFrame: 0,
      buffer: new Float32Array(safeCapacity),
      capacity: safeCapacity,
      length: 0,
      postedFrame: 0,
      writeIndex: 0,
    };
  }

  normalizeVisualInputBufferCapacity(capacity = 262144) {
    return Math.max(1, Math.round(Number(capacity) || 262144));
  }

  resizeVisualInputBufferState(state, capacity = 262144) {
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    if (!state || state.capacity !== safeCapacity || !(state.buffer instanceof Float32Array)) {
      const next = this.createVisualInputBuffer(safeCapacity);
      if (!state?.buffer?.length || !state?.length) {
        return next;
      }
      const oldCapacity = state.capacity || state.buffer.length;
      const oldLength = Math.min(Number(state.length) || 0, oldCapacity);
      const copyCount = Math.min(oldLength, safeCapacity);
      const first = ((Number(state.writeIndex) || 0) - oldLength + oldCapacity) % oldCapacity;
      for (let index = 0; index < copyCount; index += 1) {
        const oldIndex = (first + oldLength - copyCount + index) % oldCapacity;
        next.buffer[index] = state.buffer[oldIndex] || 0;
      }
      next.length = copyCount;
      next.writeIndex = copyCount % safeCapacity;
      next.absoluteFrame = Math.max(Number(state.absoluteFrame) || 0, copyCount);
      next.postedFrame = Math.min(Math.max(Number(state.postedFrame) || 0, 0), next.absoluteFrame);
      return next;
    }
    return state;
  }

  syncVisualInputBuffers() {
    const expected = new Map();
    for (const sink of this.visualSinks || []) {
      const nodeId = String(sink?.nodeId || "");
      if (!nodeId) {
        continue;
      }
      for (const input of sink.inputs || []) {
        if (!input?.buffered) {
          continue;
        }
        const port = String(input.port || "").trim();
        if (!port) {
          continue;
        }
        const key = `${nodeId}:${port}`;
        expected.set(key, this.normalizeVisualInputBufferCapacity(sink.bufferSampleLimit));
      }
    }
    for (const [key, capacity] of expected) {
      const current = this.visualInputBuffers.get(key);
      if (!current || current.capacity !== capacity) {
        this.visualInputBuffers.set(key, this.resizeVisualInputBufferState(current, capacity));
      }
    }
    for (const key of [...this.visualInputBuffers.keys()]) {
      if (!expected.has(key)) {
        this.visualInputBuffers.delete(key);
      }
    }
  }

  writeVisualInputBufferSample(nodeId, port, value, capacity = 262144) {
    const key = `${nodeId}:${port}`;
    let buffer = this.visualInputBuffers.get(key);
    const safeCapacity = this.normalizeVisualInputBufferCapacity(capacity);
    if (!buffer || buffer.capacity !== safeCapacity) {
      buffer = this.resizeVisualInputBufferState(buffer, safeCapacity);
      this.visualInputBuffers.set(key, buffer);
    }
    buffer.buffer[buffer.writeIndex] = this.scopeScalarValue(value);
    buffer.writeIndex = (buffer.writeIndex + 1) % buffer.capacity;
    buffer.length = Math.min(buffer.capacity, buffer.length + 1);
    buffer.absoluteFrame += 1;
  }

  captureModuleScopeOutput(nodeId, output) {
    const id = String(nodeId || "");
    if (!id) {
      return;
    }
    this.appendScopeBufferSample(id, output);
    if (!output || typeof output !== "object") {
      return;
    }
    for (const [port, value] of Object.entries(output)) {
      if (!port || !Number.isFinite(Number(value))) {
        continue;
      }
      const portId = `${id}:${port}`;
      this.appendScopeBufferSample(portId, value);
    }
  }

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

  parameterOutputExists(node, port) {
    return Boolean(node?.params && Object.hasOwn(node.params, port));
  }

  normalizeParameterOutputValue(value, metadata = {}) {
    return this.parameterValueToNormalizedSignal(value, metadata);
  }

  normalizeParameterModulationInput(value, metadata = {}) {
    const number = Number(value) || 0;
    // Frequency parameters accept bipolar modulation [-1, 1] so through-zero
    // FM is possible (set frequency to 0, modulate with an oscillator, and the
    // pitch sweeps both positive and negative). All other parameters use [0, 1].
    return metadata?.kind === "frequency"
      ? this.clampValue(number, -1, 1)
      : this.clampValue(number, 0, 1);
  }

  parameterSkewExponent(metadata = {}) {
    if (!metadata.nonlinearSlider) {
      return 1;
    }
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const mid = Number(metadata.mid);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(mid)) {
      return 1;
    }
    const normalizedMid = this.clampValue((mid - min) / range, 0.000001, 0.999999);
    return Math.log(normalizedMid) / Math.log(0.5);
  }

  parameterValueToNormalizedSignal(value, metadata = {}) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return 0;
    }
    const bounded = metadata.wraparound
      ? this.wrapValue(Number(value) || 0, min, max)
      : this.clampValue(Number(value) || 0, min, max);
    const normalizedValue = this.clampValue((bounded - min) / range, 0, 1);
    return this.clampValue(normalizedValue ** (1 / this.parameterSkewExponent(metadata)), 0, 1);
  }

  normalizedSignalToParameterValue(signal, metadata = {}) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const range = max - min;
    if (!Number.isFinite(range) || range <= 0) {
      return Number.isFinite(min) ? min : 0;
    }
    const normalizedSignal = metadata.wraparound
      ? this.wrapValue(Number(signal) || 0, 0, 1)
      : this.clampValue(Number(signal) || 0, 0, 1);
    const normalizedValue = normalizedSignal ** this.parameterSkewExponent(metadata);
    return this.applyParameterBounds(min + range * normalizedValue, metadata);
  }

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
  // destroyStereoFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


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

  // destroyFbmNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyLadderFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyFlowerChildFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyRsmetFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyYellowjacketFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroySuperloveFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyChaoticPhaseLockingFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyResonatorFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyHumanFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyPulseExplosionNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyComparatorNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroySampleDelayNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyMinMaxNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyTransportNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroySlewLimiterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroySampleHoldNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyChordMemoryNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyTuringMachineNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyFlowerChildEnvelopeFollowerNativeState → node-live-audio-worklet-destroy.js (Phase D)

  // destroyTriggerDividerNativeState → node-live-audio-worklet-destroy.js (Phase D)

  // destroyStepSequencerNativeState → node-live-audio-worklet-destroy.js (Phase D)

  // destroyTriggerCounterNativeState → node-live-audio-worklet-destroy.js (Phase D)

  // destroyDelayedTriggerNativeState → node-live-audio-worklet-destroy.js (Phase D)

  // destroyClockNativeState → node-live-audio-worklet-destroy.js (Phase D)

  // destroyRandomClockNativeState → node-live-audio-worklet-destroy.js (Phase D)

  // destroyPingPongDelayNativeState → node-live-audio-worklet-destroy.js (Phase D)

  // destroyPapoulisFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


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

  // destroyPapoulisParameterSmootherNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyAllPapoulisParameterSmootherNativeStates → node-live-audio-worklet-destroy.js (Phase D)

  // destroyPhosphillatorNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyAliasSineNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyTb303FilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyPassiveFilterNativeState → node-live-audio-worklet-destroy.js (Phase D)


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

  visualControlIntensity(value, nodeId, source = "visual control") {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (reason) {
      this.badNumberCount += 1;
      if (!this.lastBadValueNodeId) {
        this.lastBadValueReason = reason;
        this.lastBadValueNodeId = nodeId || "";
        this.lastBadValueSource = source;
      }
      return 0;
    }
    return this.clampValue(Math.abs(number), 0, 1);
  }

  visualControlSigned(value, nodeId, source = "visual control") {
    const number = Number(value);
    const reason = this.badValueReason(number);
    if (reason) {
      this.badNumberCount += 1;
      if (!this.lastBadValueNodeId) {
        this.lastBadValueReason = reason;
        this.lastBadValueNodeId = nodeId || "";
        this.lastBadValueSource = source;
      }
      return 0;
    }
    return this.clampValue(number, -1, 1);
  }

  smoothVisualControl(key, target, rate = sampleRate, seconds = 0.045, min = 0, max = 1) {
    const safeTarget = this.clampValue(Number(target) || 0, min, max);
    const previous = Number(this.visualControlStates.get(key));
    const current = Number.isFinite(previous) ? previous : 0;
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const time = Math.max(0, Number(seconds) || 0);
    const coefficient = time <= 0 ? 1 : 1 - Math.exp(-1 / Math.max(1, time * safeRate));
    const next = current + (safeTarget - current) * coefficient;
    const cleaned = Math.abs(next) < 0.000001 ? 0 : this.clampValue(next, min, max);
    this.visualControlStates.set(key, cleaned);
    this.visualControls[key] = cleaned;
    return cleaned;
  }

  postVisualControls() {
    this.port.postMessage({
      patchFingerprint: this.patchFingerprint,
      blue: this.clampValue(this.visualControls.blue, 0, 1),
      chromaAlpha: this.clampValue(this.visualControls.chromaAlpha, 0, 1),
      chromaDrift: this.clampValue(this.visualControls.chromaDrift, 0, 1),
      chromaHue: this.clampValue(this.visualControls.chromaHue, 0, 1),
      chromaLightness: this.clampValue(this.visualControls.chromaLightness, 0, 1),
      chromaSaturation: this.clampValue(this.visualControls.chromaSaturation, 0, 1),
      chromaSpread: this.clampValue(this.visualControls.chromaSpread, 0, 1),
      green: this.clampValue(this.visualControls.green, 0, 1),
      red: this.clampValue(this.visualControls.red, 0, 1),
      scopePaused: this.clampValue(this.visualControls.scopePaused, 0, 1),
      scopeTracesOff: this.clampValue(this.visualControls.scopeTracesOff, 0, 1),
      screenDim: this.clampValue(this.visualControls.screenDim, 0, 1),
      screenShake: this.clampValue(this.visualControls.screenShake, 0, 1),
      sessionId: this.sessionId,
      type: "visualControls",
      visualBloom: this.clampValue(this.visualControls.visualBloom, 0, 1),
      visualBrightness: this.clampValue(this.visualControls.visualBrightness, 0, 1),
      visualGlow: this.clampValue(this.visualControls.visualGlow, 0, 1),
      x: this.clampValue(this.visualControls.x, -1, 1),
      y: this.clampValue(this.visualControls.y, -1, 1),
    });
  }

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

  onePoleHighpassSample(state, input, frequency, rate = sampleRate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const safeInput = this.safeFilterNumber(input, state);
    const frequencyValue = Math.max(0, this.safeFilterNumber(frequency, state));
    const w = Math.min((Math.PI * 2) / safeRate, 0.000142475857) * frequencyValue;
    const a1 = Math.exp(-w);
    const b0 = 0.5 * (1 + a1);
    const b1 = -b0;
    state.outputBuffer = this.safeFilterNumber(
      b0 * safeInput + b1 * state.inputBuffer + a1 * state.outputBuffer,
      state,
    );
    state.inputBuffer = safeInput;
    return state.outputBuffer;
  }

  onePoleLowpassSample(state, input, frequency, rate = sampleRate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const safeInput = this.safeFilterNumber(input, state);
    const frequencyValue = Math.max(0, this.safeFilterNumber(frequency, state));
    const w = Math.min((Math.PI * 2) / safeRate, 0.000142475857) * frequencyValue;
    const a1 = Math.exp(-w);
    const b0 = 1 - a1;
    state.outputBuffer = this.safeFilterNumber(b0 * safeInput + a1 * state.outputBuffer, state);
    return state.outputBuffer;
  }

  // Exact soemdsp::curve::Rational::get(p), p already normalized to [0,1].

  // Exact soemdsp::utility::Graph::getValue for the 3-node shape this
  // filter uses -- see native_modules/flower_child_filter/
  // flower_child_filter.cpp's header comment for the full derivation.

  // Shared helpers for the RSMET/Yellowjacket/SuperLove/ChaoticPhaseLocking/
  // Resonator/Human filter family below.

  analogLadderTapStep(y, input, a, mode, stages) {
    const c = [0, 0, 0, 0, 0];
    if (mode === 1) {
      c[stages] = 1;
    } else if (mode === 2) {
      const hp = [[1, -1, 0, 0, 0], [1, -2, 1, 0, 0], [1, -3, 3, -1, 0], [1, -4, 6, -4, 1]];
      for (let i = 0; i <= stages; i++) c[i] = hp[stages - 1][i];
    } else if (mode === 3) {
      const bp = [[0, 2, -2, 0, 0], [0, 2, -2, 0, 0], [0, 0, 3, -3, 0], [0, 0, 4, -8, 4]];
      for (let i = 0; i < 5; i++) c[i] = bp[stages - 1][i];
    }
    let y0 = input;
    y0 = y0 / (1 + y0 * y0);
    y[1] = y0 + a * (y0 - y[1]);
    y[2] = y[1] + a * (y[1] - y[2]);
    y[3] = y[2] + a * (y[2] - y[3]);
    y[4] = y[3] + a * (y[3] - y[4]);
    y[0] = y0;
    return c[0] * y[0] + c[1] * y[1] + c[2] * y[2] + c[3] * y[3] + c[4] * y[4];
  }

  analogLadderCoefficient(cutoffHz, sampleRateValue) {
    const wc = Math.max(1e-9, Math.min(Math.PI * 0.98, 2 * Math.PI * cutoffHz / sampleRateValue));
    const s = Math.sin(wc);
    const c = Math.cos(wc);
    const t = Math.tan(0.25 * (wc - Math.PI));
    let denom = s - c * t;
    if (denom > -1e-12 && denom < 1e-12) denom = denom >= 0 ? 1e-12 : -1e-12;
    return t / denom;
  }

  analogRationalCurve(p, skew) {
    return ((1 + skew) * p) / (1 - skew + 2 * skew * p);
  }

  analogEvalGraph(nodes, x) {
    if (nodes.length === 0) return 0;
    if (x < nodes[0].x) return nodes[0].y;
    let i = -1;
    for (let k = 0; k < nodes.length; k++) {
      if (nodes[k].x > x) { i = k; break; }
    }
    if (i < 0) return nodes[nodes.length - 1].y;
    if (i === 0) return nodes[0].y;
    const n1 = nodes[i - 1];
    const n2 = nodes[i];
    if (n2.x - n1.x < 1e-9) return 0.5 * (n1.y + n2.y);
    const p = (x - n1.x) / (n2.x - n1.x);
    if (n2.shape === 1) return n1.y + (n2.y - n1.y) * this.analogRationalCurve(p, n2.skew);
    if (n2.shape === 2) {
      const c = 0.5 * (n2.skew + 1);
      const a = 2 * Math.log((1 - c) / c);
      return n1.y + (n2.y - n1.y) * (1 - Math.exp(p * a)) / (1 - Math.exp(a));
    }
    return n1.y + (n2.y - n1.y) * p;
  }

  analogWaveEllipseFull(phaseCycles, A, bSin, bCos, C) {
    const sinX = Math.sin(phaseCycles * 2 * Math.PI);
    const cosX = Math.cos(phaseCycles * 2 * Math.PI);
    const apc = A + cosX;
    let sqrtVal = Math.sqrt(apc * apc + (C * sinX) * (C * sinX));
    if (sqrtVal < 1e-12) sqrtVal = 1e-12;
    return (apc * bCos + (C * sinX) * bSin) / sqrtVal;
  }

  analogWaveEllipse(phaseCycles, ellipseC) {
    return this.analogWaveEllipseFull(phaseCycles, 0, 0, 1, ellipseC);
  }

  analogWaveTrisaw(phaseCycles, morph) {
    let phaseRad = phaseCycles * 2 * Math.PI;
    phaseRad = phaseRad - 2 * Math.PI * Math.floor(phaseRad / (2 * Math.PI));
    const morphRad = morph * 2 * Math.PI;
    let sourceMin, sourceMax, targetMin, targetRange;
    if (phaseRad > morphRad) {
      sourceMin = morphRad; sourceMax = 2 * Math.PI; targetMin = 1; targetRange = -1;
    } else {
      sourceMin = 0; sourceMax = morphRad; targetMin = 0; targetRange = 1;
    }
    const sourceRange = sourceMax - sourceMin;
    let uni;
    if (sourceMin === sourceMax) uni = sourceMin;
    else uni = targetMin + (targetRange * (phaseRad - sourceMin)) / sourceRange;
    return 2 * uni - 1;
  }

  analogPitchToFreq(pitch) {
    return 440 * Math.pow(2, (pitch - 69) / 12);
  }

  // --- RSMET Filter ---

  // --- Yellowjacket Filter ---

  // --- SuperLove Filter ---

  // --- Chaotic Phase Locking Filter ---

  // --- Resonator Filter ---

  // --- Human Filter ---

  humanFilterDbToAmp(db) {
    return Math.pow(10, db / 20);
  }

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

  delayInterpolateLinear(buffer, where) {
    const length = buffer.length;
    if (!length) {
      return 0;
    }
    const before = Math.floor(where) % length;
    const after = (before + 1) % length;
    const mix = where - Math.floor(where);
    return buffer[before] * (1 - mix) + buffer[after] * mix;
  }

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

  seededKey(nodeId, seed, salt) {
    return `${nodeId}.${salt}.${Math.max(0, Math.round(Number(seed) || 0))}`;
  }

  resetSeededState(state, nodeId, seed, salt) {
    const key = this.seededKey(nodeId, seed, salt);
    if (state.seedKey !== key) {
      state.seedKey = key;
      state.seed = this.stableSeed(key);
      state.gaussianSpare = null;
      state.brown = 0;
      state.pink = [0, 0, 0, 0, 0, 0, 0];
      if ("out" in state) {
        state.out = 0;
      }
      if (state.lowpass) {
        state.lowpass.outputBuffer = 0;
      }
    }
  }

  nextSeededUnipolar(state) {
    state.seed = (Math.imul(1664525, state.seed || 0x12345678) + 1013904223) >>> 0;
    return state.seed / 0xffffffff;
  }

  nextSeededBipolar(state) {
    return this.nextSeededUnipolar(state) * 2 - 1;
  }

  hashBipolar(index, seed) {
    let value = (Math.trunc(index) ^ Math.trunc(seed)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 3266489909) >>> 0;
    value = (value ^ (value >>> 16)) >>> 0;
    return (value / 0xffffffff) * 2 - 1;
  }

  // destroyVactrolEnvelopeNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyLogisticMapNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyPolyBlepNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyBlitNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyArchimedesNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // Self-affine Weierstrass-style fractal spiral -- see
  // public/node-graph-fractal-spiral.js for the full derivation. Mirrors
  // that file exactly.

  // Pure logarithmic (equiangular) spiral -- see
  // public/node-graph-log-spiral.js for the full derivation. Mirrors that
  // file exactly.

  // destroyHenonMapNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyWirdoSpiralNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyBlubbNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyMushroomNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyBoingNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyTorusNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyKeplerBouwkampNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyNyquistShannonNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyRadarNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyChuaAttractorNativeState → node-live-audio-worklet-destroy.js (Phase D)


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


  // destroyPitchQuantizerNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyChordSequencerNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyLutCellNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // Unwired inputs default to 0, a constant -- silent no matter the truth
  // table. So an unwired Clock free-runs at a fixed audible rate instead
  // (220 Hz), and an unwired A tracks that same effective clock, so a
  // freshly dropped cell audibly demonstrates itself. This lives entirely
  // in this JS orchestration layer -- the native module itself stays a
  // faithful, purely reactive LUT+FF with no self-driving of its own.

  // destroySurgeOscillatorNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyDsfOscillatorNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyLinearEnvelopeNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroySineWavetableNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyLogSpiralNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroySnowflakeNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyFractalSpiralNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyJerobeamSpiralNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyDelayEffectNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyPluckEnvelopeNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyExpAdsrNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyRandomWalkNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyPiSpigotNoiseNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyBradley2ANativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyAntisawNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyLorenzAttractorNativeState → node-live-audio-worklet-destroy.js (Phase D)


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

  // destroyRobinSupersawNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // rsPitchDitherOsc<T>::calcCycleDistribution(), transcribed.

  // rsPitchDitherOsc<T>::updateCycleLength(), transcribed.

  // rsPitchDitherOsc<T>::getSamplePhasor() + updateSampleCount(), transcribed.

  // Hypersaw — native-only (see hypersaw-worklet-evaluator.js).

  // destroyHypersawNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // destroyVideoscopeNativeState → node-live-audio-worklet-destroy.js (Phase D)


  // evaluateFrame → node-live-audio-worklet-evaluate-frame.js (Phase D)


  // process → node-live-audio-worklet-process.js (Phase D)

}
