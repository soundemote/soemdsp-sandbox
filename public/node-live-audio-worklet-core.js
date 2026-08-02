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

  destroySabrinaReverbState(state) {
    if (!state?.nativeHandle || !this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_destroy) {
      return;
    }
    this.nativeSabrinaReverb.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
    state.nativeHandle = 0;
  }

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

  normalizeGraphNumber(value, fallback = 0, min = 0, max = 1) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.max(min, Math.min(max, number))
      : fallback;
  }

  normalizeGraphShape(value) {
    const shape = String(value || "").trim().toLowerCase();
    if (shape === "logarithmic") {
      return "log";
    }
    if (shape === "smooth" || shape === "smoothstep") {
      return "smoothstep";
    }
    if (
      shape === "linear" ||
      shape === "exponential" ||
      shape === "rational" ||
      shape === "log" ||
      shape === "hold"
    ) {
      return shape;
    }
    return "rational";
  }

  normalizeGraphNode(value = {}, index = 0) {
    const source = value && typeof value === "object" ? value : {};
    const fallback = index <= 0
      ? { c: 0, shape: "linear", x: 0, y: 0 }
      : { c: 0, shape: "rational", x: 1, y: 1 };
    return {
      c: this.normalizeGraphNumber(source.c, fallback.c, -1, 1),
      shape: this.normalizeGraphShape(source.shape ?? fallback.shape),
      x: this.normalizeGraphNumber(source.x, fallback.x),
      y: this.normalizeGraphNumber(source.y, fallback.y),
    };
  }

  normalizeGraph(value = {}) {
    const source = value && typeof value === "object" ? value : {};
    const inputNodes = Array.isArray(source.nodes) && source.nodes.length >= 2
      ? source.nodes
      : [{ c: 0, shape: "linear", x: 0, y: 0 }, { c: 0, shape: "rational", x: 1, y: 1 }];
    const nodes = inputNodes
      .slice(0, 32)
      .map((node, index) => this.normalizeGraphNode(node, index))
      .sort((left, right) => left.x - right.x);
    if (nodes.length < 2) {
      nodes.push(
        this.normalizeGraphNode({ c: 0, shape: "linear", x: 0, y: 0 }, 0),
        this.normalizeGraphNode({ c: 0, shape: "rational", x: 1, y: 1 }, 1),
      );
    }
    return { nodes };
  }

  graphEndpointYLockEnabledForNode(node) {
    return (node?.type === "graph2" || node?.type === "graphCopy") &&
      Number(node?.params?.lockEndpointY) >= 0.5;
  }

  graphWithLockedEndpointY(graphValue) {
    const graph = this.normalizeGraph(graphValue);
    if (graph.nodes.length < 2) {
      return graph;
    }
    const lastIndex = graph.nodes.length - 1;
    const anchorY = this.normalizeGraphNumber(graph.nodes[0]?.y, 0);
    const nodes = graph.nodes.map((node, index) => (
      index === 0 || index === lastIndex
        ? this.normalizeGraphNode({ ...node, y: anchorY }, index)
        : node
    ));
    return this.normalizeGraph({ ...graph, nodes });
  }

  graphForNode(node) {
    return this.graphEndpointYLockEnabledForNode(node)
      ? this.graphWithLockedEndpointY(node?.graph)
      : this.normalizeGraph(node?.graph);
  }

  /**
   * |contour| = 1 → perfect step. Matches continuous rational as |c|→1:
   * +1 jump to right immediately; −1 hold left until end.
   */
  graphHardStepShape(position, contourSign) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    if (contourSign >= 0) {
      return p <= 0 ? 0 : 1;
    }
    return p >= 1 ? 1 : 0;
  }

  /**
   * Blend continuous → shared hard square by |contour| so rational/exp/log
   * all hit full square at the same |c| (and same Curve Offset).
   */
  graphBlendContourTowardHardStep(position, contour, continuousValue) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const c = this.normalizeGraphNumber(contour, 0, -1, 1);
    const a = Math.abs(c);
    if (a < 1e-9) {
      return continuousValue;
    }
    if (a >= 1 - 1e-12) {
      return this.graphHardStepShape(p, c);
    }
    const hard = this.graphHardStepShape(p, c);
    const cont = Number.isFinite(continuousValue) ? continuousValue : p;
    return cont * (1 - a) + hard * a;
  }

  graphRationalCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const c = this.normalizeGraphNumber(contour, 0, -1, 1);
    let continuous = p;
    if (Math.abs(c) >= 0.000001) {
      const cSafe = Math.max(-0.999999, Math.min(0.999999, c));
      continuous = cSafe < 0
        ? (p * (1 + cSafe)) / (1 + cSafe * p)
        : p / (1 - cSafe + cSafe * p);
    }
    return this.graphBlendContourTowardHardStep(p, c, continuous);
  }

  graphExponentialCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const t = this.normalizeGraphNumber(contour, 0, -1, 1);
    let continuous = p;
    if (Math.abs(t) >= 0.000001) {
      const a = Math.min(0.999999, Math.abs(t));
      const mag = 1.2 + 6.8 * (a / (1 - a * 0.85));
      const k = t < 0 ? -mag : mag;
      if (Math.abs(k) >= 0.05) {
        const denom = Math.exp(k) - 1;
        if (Math.abs(denom) >= 1e-9) {
          continuous = (Math.exp(k * p) - 1) / denom;
        }
      }
    }
    return this.graphBlendContourTowardHardStep(p, t, continuous);
  }

  graphLogarithmicCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const t = this.normalizeGraphNumber(contour, 0, -1, 1);
    let continuous = p;
    if (Math.abs(t) >= 0.000001) {
      const a = Math.min(0.999999, Math.abs(t));
      const b = Math.exp(1.2 + 5.5 * (a / (1 - a * 0.85)));
      if (Number.isFinite(b) && b > 1.000001) {
        const denom = Math.log(b);
        if (Number.isFinite(denom) && Math.abs(denom) >= 1e-9) {
          continuous = t < 0
            ? 1 - Math.log(1 + (1 - p) * (b - 1)) / denom
            : Math.log(1 + p * (b - 1)) / denom;
        }
      }
    }
    return this.graphBlendContourTowardHardStep(p, t, continuous);
  }

  graphSmoothCurve(position) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    return p * p * (3 - 2 * p);
  }

  normalizeGraph2SmoothingMode(value) {
    if (value === "legacy") {
      return "legacy";
    }
    const modes = ["linear", "catmull", "quadratic", "cubic"];
    const raw = String(value ?? "").trim().toLowerCase();
    // Old Curve labels that all used the same guide-tension path.
    if (raw === "smooth" || raw === "bezier" || raw === "catmullrom" || raw === "catmull") {
      return "catmull";
    }
    if (modes.includes(raw)) {
      return raw;
    }
    if (Number.isFinite(Number(value))) {
      const n = Math.round(Number(value));
      if (n === 4) {
        return "cubic";
      }
      if (n === 5) {
        return "catmull";
      }
      return modes[Math.max(0, Math.min(modes.length - 1, n))];
    }
    return "catmull";
  }

  graphModeCurve(position, mode, index = 0) {
    const normalizedMode = this.normalizeGraph2SmoothingMode(mode);
    if (normalizedMode === "linear") {
      return this.normalizeGraphNumber(position, 0, 0, 1);
    }
    return this.graphSmoothCurve(position);
  }

  graphBezierPointAt(controls, position = 0) {
    const t = this.normalizeGraphNumber(position, 0, 0, 1);
    let points = controls.map((node) => ({
      x: this.normalizeGraphNumber(node.x, 0),
      y: this.normalizeGraphNumber(node.y, 0),
    }));
    if (!points.length) {
      return { x: 0, y: 0 };
    }
    while (points.length > 1) {
      points = points.slice(0, -1).map((point, index) => {
        const next = points[index + 1];
        return {
          x: point.x + (next.x - point.x) * t,
          y: point.y + (next.y - point.y) * t,
        };
      });
    }
    return points[0];
  }

  // Guide-point Bezier: start+end on-curve only; interior nodes are handles.
  // Tension 0 = line, 1 = tight pull toward guides (no hard corners).
  // Mirrors offline nodeGraphGraphGuideBezierValueAt.
  graphGuideBezierControls(nodes, tension = 1) {
    const count = nodes.length;
    if (count < 2) {
      return nodes.map((node) => ({ x: node.x, y: node.y }));
    }
    const u = this.normalizeGraphNumber(tension, 1, 0, 1);
    if (u <= 1e-6) {
      return [
        { x: nodes[0].x, y: nodes[0].y },
        { x: nodes[count - 1].x, y: nodes[count - 1].y },
      ];
    }
    const pull = 0.08 + 1.42 * (u ** 0.6);
    const first = nodes[0];
    const last = nodes[count - 1];
    return nodes.map((node, index) => {
      if (index === 0 || index === count - 1) {
        return { x: node.x, y: node.y };
      }
      const s = index / (count - 1);
      const chordX = first.x + (last.x - first.x) * s;
      const chordY = first.y + (last.y - first.y) * s;
      return {
        x: chordX + (node.x - chordX) * pull,
        y: chordY + (node.y - chordY) * pull,
      };
    });
  }

  graphGuideBezierValueAt(graph, xValue, tension = 1) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (nodes.length < 2) {
      return nodes[0]?.y ?? 0;
    }
    if (x <= nodes[0].x) {
      return nodes[0].y;
    }
    const last = nodes[nodes.length - 1];
    if (x >= last.x) {
      return last.y;
    }
    const controls = this.graphGuideBezierControls(nodes, tension);
    const samples = 96;
    let prev = this.graphBezierPointAt(controls, 0);
    for (let index = 1; index <= samples; index += 1) {
      const point = this.graphBezierPointAt(controls, index / samples);
      const minX = Math.min(prev.x, point.x);
      const maxX = Math.max(prev.x, point.x);
      if (x >= minX && x <= maxX) {
        const dx = point.x - prev.x;
        const a = Math.abs(dx) < 1e-12 ? 0 : (x - prev.x) / dx;
        return this.safeFilterNumber(prev.y + (point.y - prev.y) * a, null);
      }
      prev = point;
    }
    let bestY = nodes[0].y;
    let bestDist = Infinity;
    for (let index = 0; index <= samples; index += 1) {
      const point = this.graphBezierPointAt(controls, index / samples);
      const dist = Math.abs(point.x - x);
      if (dist < bestDist) {
        bestDist = dist;
        bestY = point.y;
      }
    }
    return this.safeFilterNumber(bestY, null);
  }

  graphBezierValueAt(graph, xValue, tension = 1) {
    return this.graphGuideBezierValueAt(graph, xValue, tension);
  }

  graphPolylineValueAt(graph, xValue) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (!nodes.length) {
      return 0;
    }
    if (nodes.length < 2 || x <= nodes[0].x) {
      return nodes[0].y;
    }
    if (x >= nodes[nodes.length - 1].x) {
      return nodes[nodes.length - 1].y;
    }
    for (let index = 0; index < nodes.length - 1; index += 1) {
      if (x <= nodes[index + 1].x) {
        const left = nodes[index];
        const right = nodes[index + 1];
        const dx = right.x - left.x;
        if (Math.abs(dx) < 0.000001) {
          return 0.5 * (left.y + right.y);
        }
        const t = (x - left.x) / dx;
        return left.y + (right.y - left.y) * t;
      }
    }
    return nodes[nodes.length - 1].y;
  }

  graphHermiteY(y1, y2, m1, m2, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y1
      + (t3 - 2 * t2 + t) * m1
      + (-2 * t3 + 3 * t2) * y2
      + (t3 - t2) * m2;
  }

  graphInterpolationWindowStart(nodes, x, degree) {
    const targetCount = Math.max(2, Math.min(nodes.length, degree + 1));
    let segmentIndex = 0;
    for (let index = 0; index < nodes.length - 1; index += 1) {
      if (x <= nodes[index + 1].x) {
        segmentIndex = index;
        break;
      }
      segmentIndex = index;
    }
    const start = segmentIndex - Math.max(0, Math.floor((targetCount - 2) * 0.5));
    return Math.max(0, Math.min(nodes.length - targetCount, start));
  }

  graphLagrangeValueAt(graph, xValue, degree = 3) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (nodes.length < 2) {
      return nodes[0]?.y ?? 0;
    }
    for (const node of nodes) {
      if (Math.abs(x - node.x) < 0.000001) {
        return node.y;
      }
    }
    const targetCount = Math.max(2, Math.min(nodes.length, degree + 1));
    const start = this.graphInterpolationWindowStart(nodes, x, degree);
    const windowNodes = nodes.slice(start, start + targetCount);
    let value = 0;
    for (let index = 0; index < windowNodes.length; index += 1) {
      const point = windowNodes[index];
      let basis = 1;
      for (let otherIndex = 0; otherIndex < windowNodes.length; otherIndex += 1) {
        if (otherIndex === index) {
          continue;
        }
        const other = windowNodes[otherIndex];
        const denominator = point.x - other.x;
        if (Math.abs(denominator) < 0.000001) {
          continue;
        }
        basis *= (x - other.x) / denominator;
      }
      value += point.y * basis;
    }
    return value;
  }

  // Cardinal through-points: tension 0 = polyline, mid = tight rounded, 1 = loose.
  // Matches offline nodeGraphGraphCardinalValueAt (see graph-utils).
  graphCardinalValueAt(graph, xValue, tension = 1) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    const nodes = graph.nodes;
    if (nodes.length < 2) {
      return nodes[0]?.y ?? 0;
    }
    for (const node of nodes) {
      if (Math.abs(x - node.x) < 0.000001) {
        return node.y;
      }
    }
    if (x <= nodes[0].x) {
      return nodes[0].y;
    }
    if (x >= nodes[nodes.length - 1].x) {
      return nodes[nodes.length - 1].y;
    }
    const u = this.normalizeGraphNumber(tension, 1, 0, 1);
    if (u <= 1e-6) {
      return this.graphPolylineValueAt(graph, x);
    }
    const s = 0.5 * (0.12 + 1.55 * (u ** 0.55));
    const yAt = (i) => {
      if (i < 0) {
        return 2 * nodes[0].y - nodes[1].y;
      }
      if (i >= nodes.length) {
        return 2 * nodes[nodes.length - 1].y - nodes[nodes.length - 2].y;
      }
      return nodes[i].y;
    };
    const xAt = (i) => {
      if (i < 0) {
        return 2 * nodes[0].x - nodes[1].x;
      }
      if (i >= nodes.length) {
        return 2 * nodes[nodes.length - 1].x - nodes[nodes.length - 2].x;
      }
      return nodes[i].x;
    };
    for (let index = 0; index < nodes.length - 1; index += 1) {
      if (x > nodes[index + 1].x) {
        continue;
      }
      const x1 = nodes[index].x;
      const x2 = nodes[index + 1].x;
      const y1 = nodes[index].y;
      const y2 = nodes[index + 1].y;
      const dx = x2 - x1;
      if (Math.abs(dx) < 0.000001) {
        return 0.5 * (y1 + y2);
      }
      const t = (x - x1) / dx;
      const dxIn = xAt(index + 1) - xAt(index - 1);
      const dxOut = xAt(index + 2) - xAt(index);
      const m1 = Math.abs(dxIn) < 1e-9 ? 0 : s * (yAt(index + 1) - yAt(index - 1)) / dxIn * dx;
      const m2 = Math.abs(dxOut) < 1e-9 ? 0 : s * (yAt(index + 2) - yAt(index)) / dxOut * dx;
      return this.safeFilterNumber(this.graphHermiteY(y1, y2, m1, m2, t), null);
    }
    return nodes[nodes.length - 1].y;
  }

  graphCatmullRomValueAt(graph, xValue, tension = 1) {
    return this.graphCardinalValueAt(graph, xValue, tension);
  }

  graphSmoothingModeForNode(node) {
    // Step Graph / legacy graph: segment evaluation path.
    if (node?.type === "graphCopy" || node?.type === "graph") {
      return "legacy";
    }
    // Smooth Graph (graph2): one global smoothing algorithm through the dots.
    return this.normalizeGraph2SmoothingMode(node?.params?.smoothingMode);
  }

  graphSegmentShapeFromParam(value) {
    const shapes = ["linear", "rational", "exponential", "log", "smoothstep", "hold"];
    if (Number.isFinite(Number(value)) && String(value).trim() !== "") {
      return shapes[Math.max(0, Math.min(shapes.length - 1, Math.round(Number(value))))];
    }
    return this.normalizeGraphShape(value);
  }

  /** Step Graph: global shape + curveOffset; per-node c still applied. */
  graphSegmentOptionsForNode(node) {
    if (node?.type !== "graphCopy" && node?.type !== "graph") {
      return {};
    }
    const params = node?.params || {};
    return {
      curveOffset: this.normalizeGraphNumber(params.curveOffset, 0, -1, 1),
      segmentShape: this.graphSegmentShapeFromParam(
        params.segmentShape != null && params.segmentShape !== ""
          ? params.segmentShape
          : "linear",
      ),
    };
  }

  graphSegmentValue(graph, x, index, smoothingMode = "legacy", segmentOptions = {}) {
    const left = graph.nodes[index];
    const right = graph.nodes[index + 1];
    const dx = right.x - left.x;
    if (Math.abs(dx) < 0.000001) {
      return 0.5 * (left.y + right.y);
    }
    const p = this.normalizeGraphNumber((x - left.x) / dx, 0, 0, 1);
    if (smoothingMode !== "legacy") {
      const shaped = this.graphModeCurve(p, smoothingMode, index);
      return left.y + (right.y - left.y) * shaped;
    }
    const offset = this.normalizeGraphNumber(segmentOptions.curveOffset, 0, -1, 1);
    // Per-node c + global offset; ±1 = hard step for rational / exp / log.
    const contour = this.normalizeGraphNumber((Number(right.c) || 0) + offset, 0, -1, 1);
    const shape = segmentOptions.segmentShape != null && segmentOptions.segmentShape !== ""
      ? this.normalizeGraphShape(segmentOptions.segmentShape)
      : this.normalizeGraphShape(right.shape || "rational");
    let shaped = p;
    if (shape === "exponential") {
      shaped = this.graphExponentialCurve(p, contour);
    } else if (shape === "log" || shape === "logarithmic") {
      shaped = this.graphLogarithmicCurve(p, contour);
    } else if (shape === "hold") {
      shaped = p >= 1 ? 1 : 0;
    } else if (shape === "smoothstep" || shape === "smooth") {
      shaped = this.graphSmoothCurve(p);
    } else if (shape === "linear") {
      shaped = p;
    } else {
      shaped = this.graphRationalCurve(p, contour);
    }
    return left.y + (right.y - left.y) * shaped;
  }

  graphValueAt(graphValue, xValue, smoothingMode = "legacy", tension = 1, segmentOptions = {}) {
    const graph = this.normalizeGraph(graphValue);
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    if (!graph.nodes.length) {
      return 0;
    }
    const normalizedMode = this.normalizeGraph2SmoothingMode(smoothingMode);
    // Catmull = guide-tension curve (old smooth/bezier aliases map here).
    if (normalizedMode === "catmull") {
      return this.graphGuideBezierValueAt(graph, x, tension);
    }
    if (x < graph.nodes[0].x) {
      return graph.nodes[0].y;
    }
    if (x > graph.nodes[graph.nodes.length - 1].x) {
      return graph.nodes[graph.nodes.length - 1].y;
    }
    if (normalizedMode === "quadratic") {
      return this.safeFilterNumber(this.graphLagrangeValueAt(graph, x, 2), null);
    }
    if (normalizedMode === "cubic") {
      return this.safeFilterNumber(this.graphLagrangeValueAt(graph, x, 3), null);
    }
    for (let index = 0; index < graph.nodes.length - 1; index += 1) {
      if (x <= graph.nodes[index + 1].x) {
        return this.safeFilterNumber(
          this.graphSegmentValue(graph, x, index, smoothingMode, segmentOptions),
          null,
        );
      }
    }
    return graph.nodes[graph.nodes.length - 1].y;
  }

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
  smoothingSecondsFromMetadata(metadata = {}) {
    const value = Number(metadata?.smoothingSeconds);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  smoothingModeFromMetadata(metadata = {}) {
    return nodeSmoothingModeNormalize(metadata?.smoothingMode);
  }

  smoothingTypeFromMetadata(metadata = {}) {
    const raw = metadata?.smoothingType;
    if (raw != null && String(raw).trim() !== "") {
      if (typeof normalizeNodeGraphParameterSmootherFilterType === "function") {
        return normalizeNodeGraphParameterSmootherFilterType(raw);
      }
      const key = String(raw).trim();
      if (key === "linear" || key === "L" || key === "l") {
        return "linear";
      }
      if (key === "twoPole" || key === "2P" || key === "2p" || key === "two-pole" || key === "2pole") {
        return "twoPole";
      }
      return key === "papoulis" ? "papoulis" : "onePole";
    }
    // Legacy: linearSmoothing=false → type linear (instant).
    if (metadata?.linearSmoothing === false) {
      return "linear";
    }
    return "onePole";
  }

  // Resolves a parameter's effective smoothing window in seconds (0 means
  // "snap instantly") from its smoothingMode:
  //   internal        -- this parameter's own smoothingSeconds sample count
  //                       (0 samples bypasses smoothing for this param only)
  //   global          -- always use the global smoothing time, ignoring the
  //                       parameter's own smoothingSeconds
  //   blockSize       -- smooth over exactly one audio processing block
  //   internalGlobal  -- internal samples PLUS the global smoothing time
  //   off             -- always instant, ignoring both internal and global
  resolveSmoothingSecondsForMode(mode, smoothingSamples, frames, rate = sampleRate, globalSeconds = this.autoSmoothingSeconds) {
    const safeRate = Math.max(1, Number(rate) || 44100);
    const safeGlobal = Number.isFinite(Number(globalSeconds)) ? Math.max(0, Number(globalSeconds)) : 0;
    const internalSeconds = smoothingSamples > 0 ? smoothingSamples / safeRate : 0;
    switch (mode) {
      case "off":
        return 0;
      case "blockSize":
        // Under construction: behaves as no smoothing until implemented.
        return 0;
      case "global":
        return safeGlobal;
      case "internalGlobal":
        return internalSeconds + safeGlobal;
      case "internal":
      default:
        return internalSeconds;
    }
  }

  createSmoother(initialValue, metadata = {}) {
    const value = Number(initialValue);
    const safeValue = Number.isFinite(value) ? value : 0;
    const signal = this.parameterValueToNormalizedSignal(safeValue, metadata);
    const smoothingType = this.smoothingTypeFromMetadata(metadata);
    const usesFilter = typeof nodeGraphParameterSmootherUsesFilter === "function"
      ? nodeGraphParameterSmootherUsesFilter(smoothingType)
      : (smoothingType !== "linear" && metadata?.linearSmoothing !== false);
    const smoother = {
      current: safeValue,
      linearSmoothing: usesFilter,
      max: Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : 1,
      metadata,
      min: Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : 0,
      smoothingMode: this.smoothingModeFromMetadata(metadata),
      smoothingSeconds: this.smoothingSecondsFromMetadata(metadata),
      smoothingType,
      outputBuffer: signal,
      targetSignal: signal,
      target: safeValue,
      lastValue: safeValue,
      wraparound: Boolean(metadata?.wraparound),
      filterState: null,
      filterStateType: null,
    };
    if (typeof nodeGraphEnsureParameterSmootherFilterState === "function") {
      nodeGraphEnsureParameterSmootherFilterState(smoother, smoothingType);
    }
    return smoother;
  }

  clampAutoSmoothingSeconds(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value)) {
      return 0.016;
    }
    return Math.max(0, value);
  }

  smoothingFrequencyFromSeconds(seconds) {
    const normalized = this.clampAutoSmoothingSeconds(seconds);
    return normalized <= 0 ? 0 : 1 / normalized;
  }

  syncNestedAutoSmoothingSeconds(seconds = this.autoSmoothingSeconds) {
    const normalized = this.clampAutoSmoothingSeconds(seconds);
    for (const runtime of this.moduleGroupRuntimes?.values?.() || []) {
      runtime.autoSmoothingSeconds = normalized;
      runtime.syncNestedAutoSmoothingSeconds?.(normalized);
    }
  }

  // soemdsp SmootherBase::needsSmoothing — skip settled params.
  smootherNeedsWork(smoother) {
    return Math.abs((smoother.outputBuffer ?? 0) - (smoother.targetSignal ?? 0)) > 1e-7;
  }

  /** Snap chase state to target (value + optional filter state). */
  settleSmoother(smoother, { snapFilter = true } = {}) {
    if (!smoother) {
      return;
    }
    smoother.current = smoother.target;
    smoother.outputBuffer = smoother.targetSignal;
    smoother.lastValue = smoother.target;
    if (snapFilter && typeof nodeGraphParameterSmootherFilterSnap === "function") {
      nodeGraphParameterSmootherFilterSnap(smoother, smoother.targetSignal);
    }
  }

  /** Drop a marked-or-settled entry from the dirty-list key set. */
  clearSmootherActiveMembership(smoother) {
    if (!smoother) {
      return;
    }
    const key = smoother._activeKey;
    if (key) {
      this.activeSmootherKeys.delete(key);
    }
    smoother._activeKey = null;
    smoother._activeDrop = false;
  }

  /**
   * soemdsp SmootherManager::addForSmoothing — only moving chases are hot.
   * Cost ∝ active count, not all params.
   */
  activateSmoother(key, smoother) {
    if (!smoother || !key) {
      return false;
    }
    if (!smoother.linearSmoothing || !this.smootherNeedsWork(smoother)) {
      return false;
    }
    if (this.activeSmootherKeys.has(key)) {
      return true;
    }
    this.activeSmootherKeys.add(key);
    smoother._activeKey = key;
    smoother._activeDrop = false;
    this.activeSmoothers.push(smoother);
    return true;
  }

  deactivateSmoother(key, smoother) {
    if (!key || !this.activeSmootherKeys.has(key)) {
      if (smoother) {
        smoother._activeKey = null;
      }
      return;
    }
    this.activeSmootherKeys.delete(key);
    if (smoother) {
      smoother._activeKey = null;
      // Compact in runActiveSmoothers / finishSmoothing.
      smoother._activeDrop = true;
    }
  }

  /** One sample of chase. Returns true if still moving (stay on dirty list). */
  stepSmootherOneSample(smoother, frames) {
    if (!smoother?.linearSmoothing) {
      this.settleSmoother(smoother, { snapFilter: false });
      return false;
    }
    if (!this.smootherNeedsWork(smoother)) {
      this.settleSmoother(smoother);
      return false;
    }
    const smoothingSeconds = this.clampAutoSmoothingSeconds(this.resolveSmoothingSecondsForMode(
      smoother.smoothingMode,
      smoother.smoothingSeconds || 0,
      frames,
      sampleRate,
    ));
    if (smoothingSeconds <= 0) {
      this.settleSmoother(smoother);
      return false;
    }
    const cutoff = this.smoothingFrequencyFromSeconds(smoothingSeconds);
    const signal = typeof nodeGraphParameterSmootherFilterSample === "function"
      ? nodeGraphParameterSmootherFilterSample(smoother, smoother.targetSignal, cutoff, sampleRate)
      : this.onePoleLowpassSample(smoother, smoother.targetSignal, cutoff, sampleRate);
    const value = this.normalizedSignalToParameterValue(signal, smoother.metadata);
    smoother.current = value;
    smoother.lastValue = value;
    return this.smootherNeedsWork(smoother);
  }

  /**
   * soemdsp SmootherManager::run + clean — advance dirty chases once per
   * engine sample, then drop settled ones.
   */
  runActiveSmoothers(frames) {
    const list = this.activeSmoothers;
    if (!list.length) {
      return;
    }
    let write = 0;
    for (let i = 0; i < list.length; i += 1) {
      const smoother = list[i];
      if (!smoother || smoother._activeDrop) {
        this.clearSmootherActiveMembership(smoother);
        continue;
      }
      if (this.stepSmootherOneSample(smoother, frames)) {
        list[write] = smoother;
        write += 1;
      } else {
        this.clearSmootherActiveMembership(smoother);
      }
    }
    list.length = write;
  }

  updateSmoother(smoother, targetValue, metadata = {}, smootherKey = null) {
    const value = Number(targetValue);
    smoother.target = Number.isFinite(value) ? value : smoother.target;
    smoother.max = Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : smoother.max;
    smoother.metadata = metadata;
    smoother.min = Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : smoother.min;
    smoother.smoothingMode = this.smoothingModeFromMetadata(metadata);
    smoother.smoothingSeconds = this.smoothingSecondsFromMetadata(metadata);
    const nextType = this.smoothingTypeFromMetadata(metadata);
    if (smoother.smoothingType !== nextType) {
      if (smoother.filterState?.nativeHandle) {
        this.destroyPapoulisParameterSmootherNativeState(smoother);
      }
      smoother.smoothingType = nextType;
      smoother.filterState = null;
      smoother.filterStateType = null;
    } else {
      smoother.smoothingType = nextType;
    }
    smoother.linearSmoothing = typeof nodeGraphParameterSmootherUsesFilter === "function"
      ? nodeGraphParameterSmootherUsesFilter(nextType)
      : (nextType !== "linear" && metadata?.linearSmoothing !== false);
    smoother.targetSignal = this.parameterValueToNormalizedSignal(smoother.target, metadata);
    smoother.wraparound = Boolean(metadata?.wraparound);
    const key = smootherKey || smoother._activeKey || null;
    if (!smoother.linearSmoothing || !this.smootherNeedsWork(smoother)) {
      this.settleSmoother(smoother);
      if (key) {
        this.deactivateSmoother(key, smoother);
      }
      return;
    }
    if (key) {
      this.activateSmoother(key, smoother);
    }
  }

  /**
   * Readers only — active set advances once per engine sample in evaluateFrame.
   * lastValue is the shared out_.
   */
  readSmoothedParameter(node, key, fallback, frame, frames) {
    const smootherKey = this.parameterKey(node?.id, key);
    const smoother = this.smoothers.get(smootherKey);
    if (!smoother) {
      const value = Number(node?.params?.[key]);
      return Number.isFinite(value) ? value : fallback;
    }
    if (!smoother.linearSmoothing) {
      return smoother.target;
    }
    // Safety: target moved but not yet on the dirty list — lazy one-shot step.
    if (this.smootherNeedsWork(smoother) && !this.activeSmootherKeys.has(smootherKey)) {
      this.activateSmoother(smootherKey, smoother);
      this.stepSmootherOneSample(smoother, frames);
      if (!this.smootherNeedsWork(smoother)) {
        this.deactivateSmoother(smootherKey, smoother);
      }
    }
    return Number.isFinite(smoother.lastValue) ? smoother.lastValue : smoother.target;
  }

  finishSmoothing() {
    const list = this.activeSmoothers;
    if (list.length) {
      let write = 0;
      for (let i = 0; i < list.length; i += 1) {
        const smoother = list[i];
        if (!smoother || smoother._activeDrop) {
          this.clearSmootherActiveMembership(smoother);
          continue;
        }
        smoother.current = smoother.lastValue ?? smoother.current;
        list[write] = smoother;
        write += 1;
      }
      list.length = write;
    }
    for (const runtime of this.moduleGroupRuntimes?.values?.() || []) {
      runtime.finishSmoothing();
    }
  }

  applyParameterBounds(value, metadata = {}) {
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    if (metadata.unboundedMin && metadata.unboundedMax) {
      return value;
    }
    if (metadata.unboundedMin && Number.isFinite(max)) {
      return Math.min(value, max);
    }
    if (metadata.unboundedMax && Number.isFinite(min)) {
      return Math.max(value, min);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return value;
    }
    return metadata.wraparound
      ? this.wrapValue(value, min, max)
      : this.clampValue(value, min, max);
  }

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

  applyParameterModulation(base, modulationSignal, metadata = {}) {
    if (metadata?.kind === "frequency" && metadata.nonlinearSlider) {
      const baseFrequency = Math.max(0.000001, Number(base) || 0.000001);
      const octaves = (Number(modulationSignal) || 0) / 0.1;
      return this.applyParameterBounds(baseFrequency * (2 ** octaves), metadata);
    }
    const baseSignal = this.parameterValueToNormalizedSignal(base, metadata);
    return this.normalizedSignalToParameterValue(baseSignal + modulationSignal, metadata);
  }

  readRuntimePortOutput(frameValues, nodeId, port = "Out", frame = 0, frames = 1) {
    const node = this.nodes.get(nodeId);
    if (!this.parameterOutputExists(node, port)) {
      return this.readRuntimeOutput(frameValues, nodeId, port);
    }
    const value = this.readSmoothedParameter(node, port, 0, frame, frames);
    return this.normalizeParameterOutputValue(value, node?.paramMeta?.[port] || {});
  }

  readEffectiveParameter(node, key, fallback, frame, frames, frameValues) {
    const base = this.readSmoothedParameter(node, key, fallback, frame, frames);
    const modulations = this.modulationConnections.get(this.parameterKey(node?.id, key));
    // Most parameters have no modulation wired to them at all. Skip the
    // normalize/denormalize round trip (parameterSkewExponent alone runs two
    // Math.log() calls) entirely in that case instead of paying it on every
    // sample for every parameter, modulated or not -- this was the actual
    // per-sample cost behind Sabrina Reverb's real-time audio underruns
    // (measured, not guessed: 8 parameters x this unconditional work was
    // enough to push ctx.currentTime ~5% behind wall-clock).
    if (!modulations || !modulations.length) {
      return base;
    }
    const metadata = node?.paramMeta?.[key] || {};
    const min = Number(metadata.min);
    const max = Number(metadata.max);
    const hasMetadataRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
    const modulationSignal = modulations.reduce(
      (sum, modulation) => sum + this.normalizeParameterModulationInput(this.readRuntimePortOutput(
        frameValues,
        modulation.sourceNode,
        modulation.sourcePort,
        frame,
        frames,
      ), metadata),
      0,
    );
    if (!hasMetadataRange) {
      return base + modulationSignal;
    }
    return this.applyParameterModulation(base, modulationSignal, metadata);
  }

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
  destroyStereoFilterNativeState(bundle, destroyFn) {
    for (const channelState of [bundle?.mono, bundle?.left, bundle?.right]) {
      if (channelState) {
        destroyFn(channelState);
      }
    }
  }

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

  destroyFbmNativeState(state) {
    if (state.nativeHandle && this.nativeFbm?.soemdsp_fbm_destroy) {
      this.nativeFbm.soemdsp_fbm_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyLadderFilterNativeState(state) {
    if (state.nativeHandle && this.nativeLadderFilter?.soemdsp_ladder_filter_destroy) {
      this.nativeLadderFilter.soemdsp_ladder_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyFlowerChildFilterNativeState(state) {
    if (state.nativeHandle && this.nativeFlowerChildFilter?.soemdsp_flower_child_filter_destroy) {
      this.nativeFlowerChildFilter.soemdsp_flower_child_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyRsmetFilterNativeState(state) {
    if (state.nativeHandle && this.nativeRsmetFilter?.soemdsp_rsmet_filter_destroy) {
      this.nativeRsmetFilter.soemdsp_rsmet_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyYellowjacketFilterNativeState(state) {
    if (state.nativeHandle && this.nativeYellowjacketFilter?.soemdsp_yellowjacket_filter_destroy) {
      this.nativeYellowjacketFilter.soemdsp_yellowjacket_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroySuperloveFilterNativeState(state) {
    if (state.nativeHandle && this.nativeSuperloveFilter?.soemdsp_superlove_filter_destroy) {
      this.nativeSuperloveFilter.soemdsp_superlove_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyChaoticPhaseLockingFilterNativeState(state) {
    if (state.nativeHandle && this.nativeChaoticPhaseLockingFilter?.soemdsp_chaotic_phase_locking_filter_destroy) {
      this.nativeChaoticPhaseLockingFilter.soemdsp_chaotic_phase_locking_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyResonatorFilterNativeState(state) {
    if (state.nativeHandle && this.nativeResonatorFilter?.soemdsp_resonator_filter_destroy) {
      this.nativeResonatorFilter.soemdsp_resonator_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyHumanFilterNativeState(state) {
    if (state.nativeHandle && this.nativeHumanFilter?.soemdsp_human_filter_destroy) {
      this.nativeHumanFilter.soemdsp_human_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyPulseExplosionNativeState(state) {
    if (state.nativeHandle && this.nativePulseExplosion?.soemdsp_pulse_explosion_destroy) {
      this.nativePulseExplosion.soemdsp_pulse_explosion_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyComparatorNativeState(state) {
    if (state.nativeHandle && this.nativeComparator?.soemdsp_comparator_destroy) {
      this.nativeComparator.soemdsp_comparator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroySampleDelayNativeState(state) {
    if (state?.nativeHandle && this.nativeSampleDelay?.soemdsp_sample_delay_destroy) {
      this.nativeSampleDelay.soemdsp_sample_delay_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyMinMaxNativeState(state) {
    if (state.nativeHandle && this.nativeMinMax?.soemdsp_min_max_destroy) {
      this.nativeMinMax.soemdsp_min_max_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyTransportNativeState(state) {
    if (state.nativeHandle && this.nativeTransport?.soemdsp_transport_destroy) {
      this.nativeTransport.soemdsp_transport_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroySlewLimiterNativeState(state) {
    if (state.nativeHandle && this.nativeSlewLimiter?.soemdsp_slew_limiter_destroy) {
      this.nativeSlewLimiter.soemdsp_slew_limiter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroySampleHoldNativeState(state) {
    if (state.nativeHandle && this.nativeSampleHold?.soemdsp_sample_hold_destroy) {
      this.nativeSampleHold.soemdsp_sample_hold_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyChordMemoryNativeState(state) {
    if (state.nativeHandle && this.nativeChordMemory?.soemdsp_chord_memory_destroy) {
      this.nativeChordMemory.soemdsp_chord_memory_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyTuringMachineNativeState(state) {
    if (state.nativeHandle && this.nativeTuringMachine?.soemdsp_turing_machine_destroy) {
      this.nativeTuringMachine.soemdsp_turing_machine_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyFlowerChildEnvelopeFollowerNativeState(state) {
    if (state.nativeHandle && this.nativeFlowerChildEnvelopeFollower?.soemdsp_flower_child_envelope_follower_destroy) {
      this.nativeFlowerChildEnvelopeFollower.soemdsp_flower_child_envelope_follower_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }
  destroyTriggerDividerNativeState(state) {
    if (state.nativeHandle && this.nativeTriggerDivider?.soemdsp_trigger_divider_destroy) {
      this.nativeTriggerDivider.soemdsp_trigger_divider_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }
  destroyStepSequencerNativeState(state) {
    if (state.nativeHandle && this.nativeStepSequencer?.soemdsp_step_sequencer_destroy) {
      this.nativeStepSequencer.soemdsp_step_sequencer_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }
  destroyTriggerCounterNativeState(state) {
    if (state.nativeHandle && this.nativeTriggerCounter?.soemdsp_trigger_counter_destroy) {
      this.nativeTriggerCounter.soemdsp_trigger_counter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }
  destroyDelayedTriggerNativeState(state) {
    if (state.nativeHandle && this.nativeDelayedTrigger?.soemdsp_delayed_trigger_destroy) {
      this.nativeDelayedTrigger.soemdsp_delayed_trigger_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }
  destroyClockNativeState(state) {
    if (state.nativeHandle && this.nativeClock?.soemdsp_clock_destroy) {
      this.nativeClock.soemdsp_clock_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }
  destroyRandomClockNativeState(state) {
    if (state.nativeHandle && this.nativeRandomClock?.soemdsp_random_clock_destroy) {
      this.nativeRandomClock.soemdsp_random_clock_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }
  destroyPingPongDelayNativeState(state) {
    if (state.nativeHandle && this.nativePingPongDelay?.soemdsp_ping_pong_delay_destroy) {
      this.nativePingPongDelay.soemdsp_ping_pong_delay_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }
  destroyPapoulisFilterNativeState(state) {
    if (state.nativeHandle && this.nativePapoulisFilter?.soemdsp_papoulis_filter_destroy) {
      this.nativePapoulisFilter.soemdsp_papoulis_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

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

  destroyPapoulisParameterSmootherNativeState(smoother) {
    const state = smoother?.filterState;
    if (!state?.nativeHandle) {
      return;
    }
    if (typeof nodeGraphDestroyPapoulisParameterSmootherNativeState === "function") {
      nodeGraphDestroyPapoulisParameterSmootherNativeState(state);
      return;
    }
    if (this.nativePapoulisFilter?.soemdsp_papoulis_filter_destroy) {
      try {
        this.nativePapoulisFilter.soemdsp_papoulis_filter_destroy(state.nativeHandle);
      } catch (_error) {
        // Best-effort.
      }
    }
    state.nativeHandle = 0;
  }

  destroyAllPapoulisParameterSmootherNativeStates() {
    for (const smoother of this.smoothers.values()) {
      this.destroyPapoulisParameterSmootherNativeState(smoother);
    }
  }
  destroyPhosphillatorNativeState(state) {
    if (state.nativeHandle && this.nativePhosphillator?.soemdsp_phosphillator_destroy) {
      this.nativePhosphillator.soemdsp_phosphillator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
    state.nativePathRef = null;
  }

  destroyAliasSineNativeState(state) {
    if (state.nativeHandle && this.nativeAliasSine?.soemdsp_alias_sine_destroy) {
      this.nativeAliasSine.soemdsp_alias_sine_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyTb303FilterNativeState(state) {
    if (state.nativeHandle && this.nativeTb303Filter?.soemdsp_tb303_filter_destroy) {
      this.nativeTb303Filter.soemdsp_tb303_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyPassiveFilterNativeState(state) {
    if (state?.nativeHandle && this.nativePassiveFilter?.soemdsp_passive_filter_destroy) {
      this.nativePassiveFilter.soemdsp_passive_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

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

  destroyVactrolEnvelopeNativeState(state) {
    if (state?.nativeHandle && this.nativeVactrolEnvelope?.soemdsp_vactrol_envelope_destroy) {
      this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyLogisticMapNativeState(state) {
    if (state?.nativeHandle && this.nativeLogisticMap?.soemdsp_logistic_map_destroy) {
      this.nativeLogisticMap.soemdsp_logistic_map_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyPolyBlepNativeState(state) {
    if (state?.nativeHandle && this.nativePolyBlep?.soemdsp_polyblep_destroy) {
      this.nativePolyBlep.soemdsp_polyblep_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyBlitNativeState(state) {
    if (state?.nativeHandle && this.nativeBlit?.soemdsp_blit_destroy) {
      this.nativeBlit.soemdsp_blit_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyArchimedesNativeState(state) {
    if (state?.nativeHandle && this.nativeArchimedes?.soemdsp_archimedes_destroy) {
      this.nativeArchimedes.soemdsp_archimedes_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  // Self-affine Weierstrass-style fractal spiral -- see
  // public/node-graph-fractal-spiral.js for the full derivation. Mirrors
  // that file exactly.

  // Pure logarithmic (equiangular) spiral -- see
  // public/node-graph-log-spiral.js for the full derivation. Mirrors that
  // file exactly.

  destroyHenonMapNativeState(state) {
    if (state?.nativeHandle && this.nativeHenonMap?.soemdsp_henon_map_destroy) {
      this.nativeHenonMap.soemdsp_henon_map_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyWirdoSpiralNativeState(state) {
    if (state?.nativeHandle && this.nativeWirdoSpiral?.soemdsp_jbwirdo_destroy) {
      this.nativeWirdoSpiral.soemdsp_jbwirdo_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyBlubbNativeState(state) {
    if (state?.nativeHandle && this.nativeBlubb?.soemdsp_jbblubb_destroy) {
      this.nativeBlubb.soemdsp_jbblubb_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyMushroomNativeState(state) {
    if (state?.nativeHandle && this.nativeMushroom?.soemdsp_jbmushroom_destroy) {
      this.nativeMushroom.soemdsp_jbmushroom_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyBoingNativeState(state) {
    if (state?.nativeHandle && this.nativeBoing?.soemdsp_jbboing_destroy) {
      this.nativeBoing.soemdsp_jbboing_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyTorusNativeState(state) {
    if (state?.nativeHandle && this.nativeTorus?.soemdsp_jbtorus_destroy) {
      this.nativeTorus.soemdsp_jbtorus_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyKeplerBouwkampNativeState(state) {
    if (state?.nativeHandle && this.nativeKeplerBouwkamp?.soemdsp_jbkepler_destroy) {
      this.nativeKeplerBouwkamp.soemdsp_jbkepler_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyNyquistShannonNativeState(state) {
    if (state?.nativeHandle && this.nativeNyquistShannon?.soemdsp_jbnyquist_destroy) {
      this.nativeNyquistShannon.soemdsp_jbnyquist_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyRadarNativeState(state) {
    if (state?.nativeHandle && this.nativeRadar?.soemdsp_jbradar_destroy) {
      this.nativeRadar.soemdsp_jbradar_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyChuaAttractorNativeState(state) {
    if (state?.nativeHandle && this.nativeChuaAttractor?.soemdsp_chua_attractor_destroy) {
      this.nativeChuaAttractor.soemdsp_chua_attractor_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

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


  destroyPitchQuantizerNativeState(state) {
    if (state?.nativeHandle && this.nativePitchQuantizer?.soemdsp_pitch_quantizer_destroy) {
      this.nativePitchQuantizer.soemdsp_pitch_quantizer_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyChordSequencerNativeState(state) {
    if (state?.nativeHandle && this.nativeChordSequencer?.soemdsp_chord_sequencer_destroy) {
      this.nativeChordSequencer.soemdsp_chord_sequencer_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyLutCellNativeState(state) {
    if (state?.nativeHandle && this.nativeLutCell?.soemdsp_lut_cell_destroy) {
      this.nativeLutCell.soemdsp_lut_cell_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  // Unwired inputs default to 0, a constant -- silent no matter the truth
  // table. So an unwired Clock free-runs at a fixed audible rate instead
  // (220 Hz), and an unwired A tracks that same effective clock, so a
  // freshly dropped cell audibly demonstrates itself. This lives entirely
  // in this JS orchestration layer -- the native module itself stays a
  // faithful, purely reactive LUT+FF with no self-driving of its own.

  destroySurgeOscillatorNativeState(state) {
    if (state?.nativeHandle && this.nativeSurgeOscillator?.soemdsp_surge_oscillator_destroy) {
      this.nativeSurgeOscillator.soemdsp_surge_oscillator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyDsfOscillatorNativeState(state) {
    if (state?.nativeHandle && this.nativeDsfOscillator?.soemdsp_dsf_oscillator_destroy) {
      this.nativeDsfOscillator.soemdsp_dsf_oscillator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyLinearEnvelopeNativeState(state) {
    if (state?.nativeHandle && this.nativeLinearEnvelope?.soemdsp_linear_envelope_destroy) {
      this.nativeLinearEnvelope.soemdsp_linear_envelope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroySineWavetableNativeState(state) {
    if (state?.nativeHandle && this.nativeSineWavetable?.soemdsp_sine_wavetable_destroy) {
      this.nativeSineWavetable.soemdsp_sine_wavetable_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyLogSpiralNativeState(state) {
    if (state?.nativeHandle && this.nativeLogSpiral?.soemdsp_log_spiral_destroy) {
      this.nativeLogSpiral.soemdsp_log_spiral_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroySnowflakeNativeState(state) {
    if (state?.nativeHandle && this.nativeSnowflake?.soemdsp_snowflake_destroy) {
      this.nativeSnowflake.soemdsp_snowflake_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyFractalSpiralNativeState(state) {
    if (state?.nativeHandle && this.nativeFractalSpiral?.soemdsp_fractal_spiral_destroy) {
      this.nativeFractalSpiral.soemdsp_fractal_spiral_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyJerobeamSpiralNativeState(state) {
    if (state?.nativeHandle && this.nativeJerobeamSpiral?.soemdsp_jerobeam_spiral_destroy) {
      this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyDelayEffectNativeState(state) {
    for (const channelState of [state?.mono, state?.left, state?.right]) {
      if (channelState?.nativeHandle && this.nativeDelayEffect?.soemdsp_delay_effect_destroy) {
        this.nativeDelayEffect.soemdsp_delay_effect_destroy(channelState.nativeHandle);
        channelState.nativeHandle = 0;
      }
    }
  }

  destroyPluckEnvelopeNativeState(state) {
    if (state?.nativeHandle && this.nativePluckEnvelope?.soemdsp_pluck_envelope_destroy) {
      this.nativePluckEnvelope.soemdsp_pluck_envelope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyExpAdsrNativeState(state) {
    if (state?.nativeHandle && this.nativeExpAdsr?.soemdsp_exp_adsr_destroy) {
      this.nativeExpAdsr.soemdsp_exp_adsr_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyRandomWalkNativeState(state) {
    if (state?.nativeHandle && this.nativeRandomWalk?.soemdsp_random_walk_destroy) {
      this.nativeRandomWalk.soemdsp_random_walk_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyPiSpigotNoiseNativeState(state) {
    if (state?.nativeHandle && this.nativePiSpigotNoise?.soemdsp_pi_spigot_noise_destroy) {
      this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyBradley2ANativeState(state) {
    if (state?.nativeHandle && this.nativeBradley2A?.soemdsp_bradley_2a_destroy) {
      this.nativeBradley2A.soemdsp_bradley_2a_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyAntisawNativeState(state) {
    if (state?.nativeHandle && this.nativeAntisaw?.soemdsp_antisaw_destroy) {
      this.nativeAntisaw.soemdsp_antisaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyLorenzAttractorNativeState(state) {
    if (state?.nativeHandle && this.nativeLorenzAttractor?.soemdsp_lorenz_attractor_destroy) {
      this.nativeLorenzAttractor.soemdsp_lorenz_attractor_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

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

  destroyRobinSupersawNativeState(state) {
    if (state?.nativeHandle && this.nativeRobinSupersaw?.soemdsp_robin_supersaw_destroy) {
      this.nativeRobinSupersaw.soemdsp_robin_supersaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  // rsPitchDitherOsc<T>::calcCycleDistribution(), transcribed.

  // rsPitchDitherOsc<T>::updateCycleLength(), transcribed.

  // rsPitchDitherOsc<T>::getSamplePhasor() + updateSampleCount(), transcribed.

  // Hypersaw — native-only (see hypersaw-worklet-evaluator.js).

  destroyHypersawNativeState(state) {
    if (state?.nativeHandle && this.nativeHypersaw?.soemdsp_hypersaw_destroy) {
      this.nativeHypersaw.soemdsp_hypersaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  destroyVideoscopeNativeState(state) {
    if (state?.nativeHandle && this.nativeVideoscope?.soemdsp_videoscope_destroy) {
      this.nativeVideoscope.soemdsp_videoscope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  // evaluateFrame → node-live-audio-worklet-evaluate-frame.js (Phase D)


  // process → node-live-audio-worklet-process.js (Phase D)

}
