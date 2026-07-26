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
    this.lutCellStates = new Map();
    this.turingMachineStates = new Map();
    this.pitchQuantizerStates = new Map();
    this.surgeOscillatorStates = new Map();
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

  handleMessage(message) {
    if (message.type === "stop") {
      if (message.sessionId !== this.sessionId || message.planSerial !== this.planSerial) {
        return;
      }
      this.clearPlan();
      return;
    }
    if (message.type === "setPlan") {
      this.setPlan(message.plan, message);
      return;
    }
    if (message.type === "setConnections") {
      this.setConnections(message.plan || message, message);
      return;
    }
    if (message.type === "setNativeModuleWasm") {
      this.setNativeModuleWasm(message);
      return;
    }
    if (message.type === "setParams") {
      this.setParams(message.nodes, message);
      return;
    }
    if (message.type === "gpuAdditiveChunk") {
      this.pushGpuAdditiveChunk(message);
      return;
    }
    if (message.type === "setMidiKeyboardSignal") {
      this.setMidiKeyboardSignal(message.signal);
      return;
    }
    if (message.type === "setMidiKeyboardHeldKeysBitmask") {
      this.setMidiKeyboardHeldKeysBitmask(message.low, message.high);
      return;
    }
    if (message.type === "setMacroControls") {
      this.setMacroControls(message.values);
      return;
    }
    if (message.type === "setPitchModWheelSignal") {
      this.setPitchModWheelSignal(message.signal);
      return;
    }
    if (message.type === "externalButtonEvent") {
      this.setExternalButtonEvent(message.name);
      return;
    }
    if (message.type === "wireBreakEvent") {
      this.setWireBreakEvent();
      return;
    }
    if (message.type === "wireConnectEvent") {
      this.setWireConnectEvent();
      return;
    }
    if (message.type === "wireDisconnectEvent") {
      this.setWireDisconnectEvent();
      return;
    }
    if (message.type === "windowReopenEvent") {
      this.setWindowReopenEvent();
      return;
    }
    if (message.type === "shootingStarExplosionEvent") {
      this.setShootingStarExplosionEvent(message.speed);
      return;
    }
    if (message.type === "impulseButtonTrigger") {
      this.setImpulseButtonTrigger(message.nodeId, message.amplitude);
      return;
    }
    if (message.type === "bugButtonInteraction") {
      this.setBugButtonInteraction(message);
      return;
    }
    if (message.type === "inputWireBreakTrigger") {
      this.setInputWireBreakTrigger(message.nodeId, message.port);
      return;
    }
    if (message.type === "setSpeed") {
      this.setSpeed(message.speed);
      return;
    }
    if (message.type === "setSpeedLimit") {
      this.setSpeedLimit(message.speedLimit);
      return;
    }
  }

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

  setImpulseButtonTrigger(nodeId, amplitude) {
    if (!nodeId) return;
    const state = this.impulseButtonStates.get(nodeId) || this.createImpulseButtonState();
    state.pulseSamples = Math.max(0, Number(state.pulseSamples) || 0) + 1;
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
  applyNativeModuleExports(name, targetType, exports) {
      if (name === "ellipsoid" || targetType === "ellipsoid") {
        this.nativeEllipsoid = exports;
        this.nativeEllipsoidReady = Boolean(this.nativeEllipsoid?.soemdsp_ellipsoid_sample);
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "ellipsoid",
          status: this.nativeEllipsoidReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "pll" || targetType === "pll") {
        for (const state of this.pllStates.values()) {
          this.destroyPllState(state);
        }
        this.nativePll = exports;
        this.nativePllReady = Boolean(
          this.nativePll?.soemdsp_pll_create &&
          this.nativePll?.soemdsp_pll_process &&
          this.nativePll?.soemdsp_pll_vco_out,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pll",
          status: this.nativePllReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "helmholtz" || targetType === "helmholtzPitch") {
        for (const state of this.helmholtzStates.values()) {
          this.destroyHelmholtzState(state);
        }
        this.nativeHelmholtz = exports;
        this.nativeHelmholtzStatusKey = "";
        this.nativeHelmholtzReady = Boolean(
          this.nativeHelmholtz?.soemdsp_helmholtz_create &&
          this.nativeHelmholtz?.soemdsp_helmholtz_process &&
          this.nativeHelmholtz?.soemdsp_helmholtz_frequency,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "helmholtz",
          status: this.nativeHelmholtzReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "sabrina_reverb" || targetType === "reverbEffect") {
        for (const state of this.reverbEffectStates.values()) {
          this.destroySabrinaReverbState(state);
        }
        this.nativeSabrinaReverb = exports;
        this.nativeSabrinaReverbReady = Boolean(
          this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_create &&
          this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_process &&
          this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_left &&
          this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_right,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "sabrina_reverb",
          status: this.nativeSabrinaReverbReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "noise_generator" || targetType === "noiseGenerator") {
        for (const state of this.noiseGeneratorStates.values()) {
          this.destroyNoiseGeneratorNativeState(state);
        }
        this.nativeNoiseGenerator = exports;
        this.nativeNoiseGeneratorReady = Boolean(
          this.nativeNoiseGenerator?.soemdsp_noise_generator_create &&
          this.nativeNoiseGenerator?.soemdsp_noise_generator_sample &&
          this.nativeNoiseGenerator?.soemdsp_noise_generator_left &&
          this.nativeNoiseGenerator?.soemdsp_noise_generator_right,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "noise_generator",
          status: this.nativeNoiseGeneratorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "soft_clipper" || targetType === "softClipper") {
        this.nativeSoftClipper = exports;
        this.nativeSoftClipperReady = Boolean(
          this.nativeSoftClipper?.soemdsp_soft_clipper_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "soft_clipper",
          status: this.nativeSoftClipperReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "fractal_brownian_noise" || targetType === "fractalBrownianNoise") {
        for (const state of this.fractalBrownianNoiseStates.values()) {
          this.destroyFbmNativeState(state);
        }
        this.nativeFbm = exports;
        this.nativeFbmReady = Boolean(
          this.nativeFbm?.soemdsp_fbm_create &&
          this.nativeFbm?.soemdsp_fbm_sample &&
          this.nativeFbm?.soemdsp_fbm_x &&
          this.nativeFbm?.soemdsp_fbm_y &&
          this.nativeFbm?.soemdsp_fbm_z,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "fractal_brownian_noise",
          status: this.nativeFbmReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "ladder_filter" || targetType === "ladderFilter") {
        for (const state of this.ladderFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyLadderFilterNativeState(s));
        }
        this.nativeLadderFilter = exports;
        this.nativeLadderFilterReady = Boolean(
          this.nativeLadderFilter?.soemdsp_ladder_filter_create &&
          this.nativeLadderFilter?.soemdsp_ladder_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "ladder_filter",
          status: this.nativeLadderFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "flower_child_filter" || targetType === "flowerChildFilter") {
        for (const state of this.flowerChildFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyFlowerChildFilterNativeState(s));
        }
        this.nativeFlowerChildFilter = exports;
        this.nativeFlowerChildFilterReady = Boolean(
          this.nativeFlowerChildFilter?.soemdsp_flower_child_filter_create &&
          this.nativeFlowerChildFilter?.soemdsp_flower_child_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "flower_child_filter",
          status: this.nativeFlowerChildFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "rsmet_filter" || targetType === "rsmetFilter") {
        for (const state of this.rsmetFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyRsmetFilterNativeState(s));
        }
        this.nativeRsmetFilter = exports;
        this.nativeRsmetFilterReady = Boolean(
          this.nativeRsmetFilter?.soemdsp_rsmet_filter_create &&
          this.nativeRsmetFilter?.soemdsp_rsmet_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "rsmet_filter",
          status: this.nativeRsmetFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "yellowjacket_filter" || targetType === "yellowjacketFilter") {
        for (const state of this.yellowjacketFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyYellowjacketFilterNativeState(s));
        }
        this.nativeYellowjacketFilter = exports;
        this.nativeYellowjacketFilterReady = Boolean(
          this.nativeYellowjacketFilter?.soemdsp_yellowjacket_filter_create &&
          this.nativeYellowjacketFilter?.soemdsp_yellowjacket_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "yellowjacket_filter",
          status: this.nativeYellowjacketFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "superlove_filter" || targetType === "superloveFilter") {
        for (const state of this.superloveFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroySuperloveFilterNativeState(s));
        }
        this.nativeSuperloveFilter = exports;
        this.nativeSuperloveFilterReady = Boolean(
          this.nativeSuperloveFilter?.soemdsp_superlove_filter_create &&
          this.nativeSuperloveFilter?.soemdsp_superlove_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "superlove_filter",
          status: this.nativeSuperloveFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "chaotic_phase_locking_filter" || targetType === "chaoticPhaseLockingFilter") {
        for (const state of this.chaoticPhaseLockingFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyChaoticPhaseLockingFilterNativeState(s));
        }
        this.nativeChaoticPhaseLockingFilter = exports;
        this.nativeChaoticPhaseLockingFilterReady = Boolean(
          this.nativeChaoticPhaseLockingFilter?.soemdsp_chaotic_phase_locking_filter_create &&
          this.nativeChaoticPhaseLockingFilter?.soemdsp_chaotic_phase_locking_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chaotic_phase_locking_filter",
          status: this.nativeChaoticPhaseLockingFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "resonator_filter" || targetType === "resonatorFilter") {
        for (const state of this.resonatorFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyResonatorFilterNativeState(s));
        }
        this.nativeResonatorFilter = exports;
        this.nativeResonatorFilterReady = Boolean(
          this.nativeResonatorFilter?.soemdsp_resonator_filter_create &&
          this.nativeResonatorFilter?.soemdsp_resonator_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "resonator_filter",
          status: this.nativeResonatorFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "human_filter" || targetType === "humanFilter") {
        for (const state of this.humanFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyHumanFilterNativeState(s));
        }
        this.nativeHumanFilter = exports;
        this.nativeHumanFilterReady = Boolean(
          this.nativeHumanFilter?.soemdsp_human_filter_create &&
          this.nativeHumanFilter?.soemdsp_human_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "human_filter",
          status: this.nativeHumanFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "pulse_explosion" || targetType === "pulseExplosion") {
        for (const state of this.pulseExplosionStates.values()) {
          this.destroyPulseExplosionNativeState(state);
        }
        this.nativePulseExplosion = exports;
        this.nativePulseExplosionReady = Boolean(
          this.nativePulseExplosion?.soemdsp_pulse_explosion_create &&
          this.nativePulseExplosion?.soemdsp_pulse_explosion_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pulse_explosion",
          status: this.nativePulseExplosionReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "comparator" || targetType === "comparator") {
        for (const state of this.comparatorStates.values()) {
          this.destroyComparatorNativeState(state);
        }
        this.nativeComparator = exports;
        this.nativeComparatorReady = Boolean(
          this.nativeComparator?.soemdsp_comparator_create &&
          this.nativeComparator?.soemdsp_comparator_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "comparator",
          status: this.nativeComparatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "min_max" || targetType === "minMax") {
        for (const state of this.minMaxStates.values()) {
          this.destroyMinMaxNativeState(state);
        }
        this.nativeMinMax = exports;
        this.nativeMinMaxReady = Boolean(
          this.nativeMinMax?.soemdsp_min_max_create &&
          this.nativeMinMax?.soemdsp_min_max_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "min_max",
          status: this.nativeMinMaxReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "alias_sine" || targetType === "aliasSine") {
        for (const state of this.aliasSineStates.values()) {
          this.destroyAliasSineNativeState(state);
        }
        this.nativeAliasSine = exports;
        this.nativeAliasSineReady = Boolean(
          this.nativeAliasSine?.soemdsp_alias_sine_create &&
          this.nativeAliasSine?.soemdsp_alias_sine_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "alias_sine",
          status: this.nativeAliasSineReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "transport" || targetType === "transport") {
        for (const state of this.transportStates.values()) {
          this.destroyTransportNativeState(state);
        }
        this.nativeTransport = exports;
        this.nativeTransportReady = Boolean(
          this.nativeTransport?.soemdsp_transport_create &&
          this.nativeTransport?.soemdsp_transport_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "transport",
          status: this.nativeTransportReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "slew_limiter" || targetType === "slewLimiter") {
        for (const bundle of this.slewLimiterStates.values()) {
          this.destroyStereoFilterNativeState(bundle, (s) => this.destroySlewLimiterNativeState(s));
        }
        this.nativeSlewLimiter = exports;
        this.nativeSlewLimiterReady = Boolean(
          this.nativeSlewLimiter?.soemdsp_slew_limiter_create &&
          this.nativeSlewLimiter?.soemdsp_slew_limiter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "slew_limiter",
          status: this.nativeSlewLimiterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "sample_hold" || targetType === "sampleHold") {
        for (const bundle of this.sampleHoldStates.values()) {
          this.destroyStereoFilterNativeState(bundle, (s) => this.destroySampleHoldNativeState(s));
        }
        this.nativeSampleHold = exports;
        this.nativeSampleHoldReady = Boolean(
          this.nativeSampleHold?.soemdsp_sample_hold_create &&
          this.nativeSampleHold?.soemdsp_sample_hold_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "sample_hold",
          status: this.nativeSampleHoldReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "chord_memory" || targetType === "chordMemory") {
        for (const state of this.chordMemoryStates.values()) {
          this.destroyChordMemoryNativeState(state);
        }
        this.nativeChordMemory = exports;
        this.nativeChordMemoryReady = Boolean(
          this.nativeChordMemory?.soemdsp_chord_memory_create &&
          this.nativeChordMemory?.soemdsp_chord_memory_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chord_memory",
          status: this.nativeChordMemoryReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "turing_machine" || targetType === "turingMachine") {
        for (const state of this.turingMachineStates.values()) {
          this.destroyTuringMachineNativeState(state);
        }
        this.nativeTuringMachine = exports;
        this.nativeTuringMachineReady = Boolean(
          this.nativeTuringMachine?.soemdsp_turing_machine_create &&
          this.nativeTuringMachine?.soemdsp_turing_machine_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "turing_machine",
          status: this.nativeTuringMachineReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "flower_child_envelope_follower" || targetType === "flowerChildEnvelopeFollower") {
        for (const state of this.flowerChildEnvelopeFollowerStates.values()) {
          this.destroyFlowerChildEnvelopeFollowerNativeState(state);
        }
        this.nativeFlowerChildEnvelopeFollower = exports;
        this.nativeFlowerChildEnvelopeFollowerReady = Boolean(
          this.nativeFlowerChildEnvelopeFollower?.soemdsp_flower_child_envelope_follower_create &&
          this.nativeFlowerChildEnvelopeFollower?.soemdsp_flower_child_envelope_follower_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "flower_child_envelope_follower",
          status: this.nativeFlowerChildEnvelopeFollowerReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "trigger_divider" || targetType === "triggerDivider" || targetType === "clockDivider") {
        for (const state of this.triggerDividerStates.values()) {
          this.destroyTriggerDividerNativeState(state);
        }
        this.nativeTriggerDivider = exports;
        this.nativeTriggerDividerReady = Boolean(
          this.nativeTriggerDivider?.soemdsp_trigger_divider_create &&
          this.nativeTriggerDivider?.soemdsp_trigger_divider_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "trigger_divider",
          status: this.nativeTriggerDividerReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "step_sequencer" || targetType === "stepSequencer") {
        for (const state of this.stepSequencerStates.values()) {
          this.destroyStepSequencerNativeState(state);
        }
        this.nativeStepSequencer = exports;
        this.nativeStepSequencerReady = Boolean(
          this.nativeStepSequencer?.soemdsp_step_sequencer_create &&
          this.nativeStepSequencer?.soemdsp_step_sequencer_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "step_sequencer",
          status: this.nativeStepSequencerReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "trigger_counter" || targetType === "triggerCounter") {
        for (const state of this.triggerCounterStates.values()) {
          this.destroyTriggerCounterNativeState(state);
        }
        this.nativeTriggerCounter = exports;
        this.nativeTriggerCounterReady = Boolean(
          this.nativeTriggerCounter?.soemdsp_trigger_counter_create &&
          this.nativeTriggerCounter?.soemdsp_trigger_counter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "trigger_counter",
          status: this.nativeTriggerCounterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "delayed_trigger" || targetType === "delayedTrigger") {
        for (const state of this.delayedTriggerStates.values()) {
          this.destroyDelayedTriggerNativeState(state);
        }
        this.nativeDelayedTrigger = exports;
        this.nativeDelayedTriggerReady = Boolean(
          this.nativeDelayedTrigger?.soemdsp_delayed_trigger_create &&
          this.nativeDelayedTrigger?.soemdsp_delayed_trigger_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "delayed_trigger",
          status: this.nativeDelayedTriggerReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "clock" || targetType === "clock") {
        for (const state of this.clockStates.values()) {
          this.destroyClockNativeState(state);
        }
        this.nativeClock = exports;
        this.nativeClockReady = Boolean(
          this.nativeClock?.soemdsp_clock_create &&
          this.nativeClock?.soemdsp_clock_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "clock",
          status: this.nativeClockReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "random_clock" || targetType === "randomClock") {
        for (const state of this.randomClockStates.values()) {
          this.destroyRandomClockNativeState(state);
        }
        this.nativeRandomClock = exports;
        this.nativeRandomClockReady = Boolean(
          this.nativeRandomClock?.soemdsp_random_clock_create &&
          this.nativeRandomClock?.soemdsp_random_clock_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "random_clock",
          status: this.nativeRandomClockReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "ping_pong_delay" || targetType === "pingPongDelay") {
        for (const state of this.pingPongDelayStates.values()) {
          this.destroyPingPongDelayNativeState(state);
        }
        this.nativePingPongDelay = exports;
        this.nativePingPongDelayReady = Boolean(
          this.nativePingPongDelay?.soemdsp_ping_pong_delay_create &&
          this.nativePingPongDelay?.soemdsp_ping_pong_delay_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "ping_pong_delay",
          status: this.nativePingPongDelayReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "papoulis_filter" || targetType === "papoulisFilter") {
        for (const state of this.papoulisFilterStates.values()) {
          this.destroyPapoulisFilterNativeState(state);
        }
        this.nativePapoulisFilter = exports;
        this.nativePapoulisFilterReady = Boolean(
          this.nativePapoulisFilter?.soemdsp_papoulis_filter_create &&
          this.nativePapoulisFilter?.soemdsp_papoulis_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "papoulis_filter",
          status: this.nativePapoulisFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "phosphillator" || targetType === "phosphillator") {
        for (const state of this.phosphillatorPlaybackStates.values()) {
          this.destroyPhosphillatorNativeState(state);
        }
        this.nativePhosphillator = exports;
        this.nativePhosphillatorReady = Boolean(
          this.nativePhosphillator?.soemdsp_phosphillator_create &&
          this.nativePhosphillator?.soemdsp_phosphillator_sample &&
          this.nativePhosphillator?.soemdsp_phosphillator_set_path,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "phosphillator",
          status: this.nativePhosphillatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "tb303_filter" || targetType === "tb303Filter") {
        for (const state of this.tb303FilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyTb303FilterNativeState(s));
        }
        this.nativeTb303Filter = exports;
        this.nativeTb303FilterReady = Boolean(
          this.nativeTb303Filter?.soemdsp_tb303_filter_create &&
          this.nativeTb303Filter?.soemdsp_tb303_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "tb303_filter",
          status: this.nativeTb303FilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "passive_filter" || targetType === "passiveFilter") {
        for (const state of this.passiveFilterStates.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyPassiveFilterNativeState(s));
        }
        this.nativePassiveFilter = exports;
        this.nativePassiveFilterReady = Boolean(
          this.nativePassiveFilter?.soemdsp_passive_filter_create &&
          this.nativePassiveFilter?.soemdsp_passive_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "passive_filter",
          status: this.nativePassiveFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "vactrol_envelope" || targetType === "vactrolEnvelopeSeries" || targetType === "vactrolEnvelopeCustom") {
        for (const state of this.vactrolEnvelopeStates.values()) {
          this.destroyVactrolEnvelopeNativeState(state);
        }
        this.nativeVactrolEnvelope = exports;
        this.nativeVactrolEnvelopeReady = Boolean(
          this.nativeVactrolEnvelope?.soemdsp_vactrol_envelope_create &&
          this.nativeVactrolEnvelope?.soemdsp_vactrol_envelope_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "vactrol_envelope",
          status: this.nativeVactrolEnvelopeReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "logistic_map" || targetType === "logisticMap") {
        for (const state of this.logisticMapStates.values()) {
          this.destroyLogisticMapNativeState(state);
        }
        this.nativeLogisticMap = exports;
        this.nativeLogisticMapReady = Boolean(
          this.nativeLogisticMap?.soemdsp_logistic_map_create &&
          this.nativeLogisticMap?.soemdsp_logistic_map_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "logistic_map",
          status: this.nativeLogisticMapReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "henon_map" || targetType === "henonMap") {
        for (const state of this.henonMapStates.values()) {
          this.destroyHenonMapNativeState(state);
        }
        this.nativeHenonMap = exports;
        this.nativeHenonMapReady = Boolean(
          this.nativeHenonMap?.soemdsp_henon_map_create &&
          this.nativeHenonMap?.soemdsp_henon_map_sample &&
          this.nativeHenonMap?.soemdsp_henon_map_x &&
          this.nativeHenonMap?.soemdsp_henon_map_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "henon_map",
          status: this.nativeHenonMapReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "chua_attractor" || targetType === "chuaAttractor") {
        for (const state of this.chuaAttractorStates.values()) {
          this.destroyChuaAttractorNativeState(state);
        }
        this.nativeChuaAttractor = exports;
        this.nativeChuaAttractorReady = Boolean(
          this.nativeChuaAttractor?.soemdsp_chua_attractor_create &&
          this.nativeChuaAttractor?.soemdsp_chua_attractor_sample &&
          this.nativeChuaAttractor?.soemdsp_chua_attractor_x &&
          this.nativeChuaAttractor?.soemdsp_chua_attractor_y &&
          this.nativeChuaAttractor?.soemdsp_chua_attractor_z,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chua_attractor",
          status: this.nativeChuaAttractorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_wirdo_spiral" || targetType === "wirdoSpiral") {
        for (const state of this.wirdoSpiralStates.values()) {
          this.destroyWirdoSpiralNativeState(state);
        }
        this.nativeWirdoSpiral = exports;
        this.nativeWirdoSpiralReady = Boolean(
          this.nativeWirdoSpiral?.soemdsp_jbwirdo_create &&
          this.nativeWirdoSpiral?.soemdsp_jbwirdo_sample &&
          this.nativeWirdoSpiral?.soemdsp_jbwirdo_x &&
          this.nativeWirdoSpiral?.soemdsp_jbwirdo_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_wirdo_spiral",
          status: this.nativeWirdoSpiralReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_blubb" || targetType === "blubb") {
        for (const state of this.blubbStates.values()) {
          this.destroyBlubbNativeState(state);
        }
        this.nativeBlubb = exports;
        this.nativeBlubbReady = Boolean(
          this.nativeBlubb?.soemdsp_jbblubb_create &&
          this.nativeBlubb?.soemdsp_jbblubb_sample &&
          this.nativeBlubb?.soemdsp_jbblubb_x &&
          this.nativeBlubb?.soemdsp_jbblubb_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_blubb",
          status: this.nativeBlubbReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_mushroom" || targetType === "mushroom") {
        for (const state of this.mushroomStates.values()) {
          this.destroyMushroomNativeState(state);
        }
        this.nativeMushroom = exports;
        this.nativeMushroomReady = Boolean(
          this.nativeMushroom?.soemdsp_jbmushroom_create &&
          this.nativeMushroom?.soemdsp_jbmushroom_sample &&
          this.nativeMushroom?.soemdsp_jbmushroom_x &&
          this.nativeMushroom?.soemdsp_jbmushroom_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_mushroom",
          status: this.nativeMushroomReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_boing" || targetType === "boing") {
        for (const state of this.boingStates.values()) {
          this.destroyBoingNativeState(state);
        }
        this.nativeBoing = exports;
        this.nativeBoingReady = Boolean(
          this.nativeBoing?.soemdsp_jbboing_create &&
          this.nativeBoing?.soemdsp_jbboing_sample &&
          this.nativeBoing?.soemdsp_jbboing_x &&
          this.nativeBoing?.soemdsp_jbboing_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_boing",
          status: this.nativeBoingReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_torus" || targetType === "torus") {
        for (const state of this.torusStates.values()) {
          this.destroyTorusNativeState(state);
        }
        this.nativeTorus = exports;
        this.nativeTorusReady = Boolean(
          this.nativeTorus?.soemdsp_jbtorus_create &&
          this.nativeTorus?.soemdsp_jbtorus_sample &&
          this.nativeTorus?.soemdsp_jbtorus_x &&
          this.nativeTorus?.soemdsp_jbtorus_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_torus",
          status: this.nativeTorusReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_kepler_bouwkamp" || targetType === "keplerBouwkamp") {
        for (const state of this.keplerBouwkampStates.values()) {
          this.destroyKeplerBouwkampNativeState(state);
        }
        this.nativeKeplerBouwkamp = exports;
        this.nativeKeplerBouwkampReady = Boolean(
          this.nativeKeplerBouwkamp?.soemdsp_jbkepler_create &&
          this.nativeKeplerBouwkamp?.soemdsp_jbkepler_sample &&
          this.nativeKeplerBouwkamp?.soemdsp_jbkepler_x &&
          this.nativeKeplerBouwkamp?.soemdsp_jbkepler_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_kepler_bouwkamp",
          status: this.nativeKeplerBouwkampReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_nyquist_shannon" || targetType === "nyquistShannon") {
        for (const state of this.nyquistShannonStates.values()) {
          this.destroyNyquistShannonNativeState(state);
        }
        this.nativeNyquistShannon = exports;
        this.nativeNyquistShannonReady = Boolean(
          this.nativeNyquistShannon?.soemdsp_jbnyquist_create &&
          this.nativeNyquistShannon?.soemdsp_jbnyquist_sample &&
          this.nativeNyquistShannon?.soemdsp_jbnyquist_x &&
          this.nativeNyquistShannon?.soemdsp_jbnyquist_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_nyquist_shannon",
          status: this.nativeNyquistShannonReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_radar" || targetType === "radar") {
        for (const state of this.radarStates.values()) {
          this.destroyRadarNativeState(state);
        }
        this.nativeRadar = exports;
        this.nativeRadarReady = Boolean(
          this.nativeRadar?.soemdsp_jbradar_create &&
          this.nativeRadar?.soemdsp_jbradar_sample &&
          this.nativeRadar?.soemdsp_jbradar_x &&
          this.nativeRadar?.soemdsp_jbradar_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_radar",
          status: this.nativeRadarReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "pitch_quantizer" || targetType === "pitchQuantizer") {
        for (const state of this.pitchQuantizerStates.values()) {
          this.destroyPitchQuantizerNativeState(state);
        }
        this.nativePitchQuantizer = exports;
        this.nativePitchQuantizerReady = Boolean(
          this.nativePitchQuantizer?.soemdsp_pitch_quantizer_create &&
          this.nativePitchQuantizer?.soemdsp_pitch_quantizer_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pitch_quantizer",
          status: this.nativePitchQuantizerReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "chord_sequencer" || targetType === "chordSequencer") {
        for (const state of this.chordSequencerStates.values()) {
          this.destroyChordSequencerNativeState(state);
        }
        this.nativeChordSequencer = exports;
        this.nativeChordSequencerReady = Boolean(
          this.nativeChordSequencer?.soemdsp_chord_sequencer_create &&
          this.nativeChordSequencer?.soemdsp_chord_sequencer_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "chord_sequencer",
          status: this.nativeChordSequencerReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "lut_cell" || targetType === "lutCell") {
        for (const state of this.lutCellStates.values()) {
          this.destroyLutCellNativeState(state);
        }
        this.nativeLutCell = exports;
        this.nativeLutCellReady = Boolean(
          this.nativeLutCell?.soemdsp_lut_cell_create &&
          this.nativeLutCell?.soemdsp_lut_cell_sample &&
          this.nativeLutCell?.soemdsp_lut_cell_q,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "lut_cell",
          status: this.nativeLutCellReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "metallic_ratio" || targetType === "metallicRatio") {
        this.nativeMetallicRatio = exports;
        this.nativeMetallicRatioReady = Boolean(
          this.nativeMetallicRatio?.soemdsp_metallic_ratio_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "metallic_ratio",
          status: this.nativeMetallicRatioReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "surge_oscillator" || targetType === "surgeOscillator") {
        for (const state of this.surgeOscillatorStates.values()) {
          this.destroySurgeOscillatorNativeState(state);
        }
        this.nativeSurgeOscillator = exports;
        this.nativeSurgeOscillatorReady = Boolean(
          this.nativeSurgeOscillator?.soemdsp_surge_oscillator_create &&
          this.nativeSurgeOscillator?.soemdsp_surge_oscillator_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "surge_oscillator",
          status: this.nativeSurgeOscillatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "dsf_oscillator" || targetType === "dsfOscillator") {
        for (const state of this.dsfOscillatorStates.values()) {
          this.destroyDsfOscillatorNativeState(state);
        }
        this.nativeDsfOscillator = exports;
        this.nativeDsfOscillatorReady = Boolean(
          this.nativeDsfOscillator?.soemdsp_dsf_oscillator_create &&
          this.nativeDsfOscillator?.soemdsp_dsf_oscillator_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "dsf_oscillator",
          status: this.nativeDsfOscillatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "robin_supersaw" || targetType === "robinSupersaw") {
        for (const state of this.robinSupersawStates.values()) {
          this.destroyRobinSupersawNativeState(state);
        }
        this.nativeRobinSupersaw = exports;
        this.nativeRobinSupersawReady = Boolean(
          this.nativeRobinSupersaw?.soemdsp_robin_supersaw_create &&
          this.nativeRobinSupersaw?.soemdsp_robin_supersaw_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "robin_supersaw",
          status: this.nativeRobinSupersawReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "hypersaw" || targetType === "hypersaw") {
        for (const state of this.hypersawStates.values()) {
          this.destroyHypersawNativeState(state);
        }
        this.nativeHypersaw = exports;
        this.nativeHypersawReady = Boolean(
          this.nativeHypersaw?.soemdsp_hypersaw_create &&
          this.nativeHypersaw?.soemdsp_hypersaw_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "hypersaw",
          status: this.nativeHypersawReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "videoscope" || targetType === "videoscope") {
        for (const state of this.videoscopeStates.values()) {
          this.destroyVideoscopeNativeState(state);
        }
        this.nativeVideoscope = exports;
        this.nativeVideoscopeReady = Boolean(
          this.nativeVideoscope?.soemdsp_videoscope_create &&
          this.nativeVideoscope?.soemdsp_videoscope_push,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "videoscope",
          status: this.nativeVideoscopeReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "linear_envelope" || targetType === "linearEnvelope") {
        for (const state of this.linearEnvelopeStates.values()) {
          this.destroyLinearEnvelopeNativeState(state);
        }
        this.nativeLinearEnvelope = exports;
        this.nativeLinearEnvelopeReady = Boolean(
          this.nativeLinearEnvelope?.soemdsp_linear_envelope_create &&
          this.nativeLinearEnvelope?.soemdsp_linear_envelope_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "linear_envelope",
          status: this.nativeLinearEnvelopeReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "pluck_envelope" || targetType === "pluckEnvelope") {
        for (const state of this.pluckEnvelopeStates.values()) {
          this.destroyPluckEnvelopeNativeState(state);
        }
        this.nativePluckEnvelope = exports;
        this.nativePluckEnvelopeReady = Boolean(
          this.nativePluckEnvelope?.soemdsp_pluck_envelope_create &&
          this.nativePluckEnvelope?.soemdsp_pluck_envelope_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pluck_envelope",
          status: this.nativePluckEnvelopeReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "exp_adsr" || targetType === "expAdsr") {
        for (const state of this.expAdsrStates.values()) {
          this.destroyExpAdsrNativeState(state);
        }
        this.nativeExpAdsr = exports;
        this.nativeExpAdsrReady = Boolean(
          this.nativeExpAdsr?.soemdsp_exp_adsr_create &&
          this.nativeExpAdsr?.soemdsp_exp_adsr_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "exp_adsr",
          status: this.nativeExpAdsrReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "random_walk" || targetType === "randomWalk") {
        for (const state of this.randomWalkStates.values()) {
          this.destroyRandomWalkNativeState(state);
        }
        this.nativeRandomWalk = exports;
        this.nativeRandomWalkReady = Boolean(
          this.nativeRandomWalk?.soemdsp_random_walk_create &&
          this.nativeRandomWalk?.soemdsp_random_walk_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "random_walk",
          status: this.nativeRandomWalkReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "pi_spigot_noise" || targetType === "piSpigotNoise") {
        for (const state of this.piSpigotNoiseStates.values()) {
          this.destroyPiSpigotNoiseNativeState(state);
        }
        this.nativePiSpigotNoise = exports;
        this.nativePiSpigotNoiseReady = Boolean(
          this.nativePiSpigotNoise?.soemdsp_pi_spigot_noise_create &&
          this.nativePiSpigotNoise?.soemdsp_pi_spigot_noise_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "pi_spigot_noise",
          status: this.nativePiSpigotNoiseReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "bradley_2a" || targetType === "bradley2a") {
        for (const state of this.bradley2AStates.values()) {
          this.destroyBradley2ANativeState(state);
        }
        this.nativeBradley2A = exports;
        this.nativeBradley2AReady = Boolean(
          this.nativeBradley2A?.soemdsp_bradley_2a_create &&
          this.nativeBradley2A?.soemdsp_bradley_2a_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "bradley_2a",
          status: this.nativeBradley2AReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "antisaw" || targetType === "antisaw") {
        for (const state of this.antisawStates.values()) {
          this.destroyAntisawNativeState(state);
        }
        this.nativeAntisaw = exports;
        this.nativeAntisawReady = Boolean(
          this.nativeAntisaw?.soemdsp_antisaw_create &&
          this.nativeAntisaw?.soemdsp_antisaw_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "antisaw",
          status: this.nativeAntisawReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "lorenz_attractor" || targetType === "lorenzAttractor") {
        for (const state of this.lorenzAttractorStates.values()) {
          this.destroyLorenzAttractorNativeState(state);
        }
        this.nativeLorenzAttractor = exports;
        this.nativeLorenzAttractorReady = Boolean(
          this.nativeLorenzAttractor?.soemdsp_lorenz_attractor_create &&
          this.nativeLorenzAttractor?.soemdsp_lorenz_attractor_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "lorenz_attractor",
          status: this.nativeLorenzAttractorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "sine_wavetable" || targetType === "sineWavetable") {
        for (const state of this.sineWavetableStates.values()) {
          this.destroySineWavetableNativeState(state);
        }
        this.nativeSineWavetable = exports;
        this.nativeSineWavetableReady = Boolean(
          this.nativeSineWavetable?.soemdsp_sine_wavetable_create &&
          this.nativeSineWavetable?.soemdsp_sine_wavetable_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "sine_wavetable",
          status: this.nativeSineWavetableReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "log_spiral" || targetType === "logSpiral") {
        for (const state of this.logSpiralStates.values()) {
          this.destroyLogSpiralNativeState(state);
        }
        this.nativeLogSpiral = exports;
        this.nativeLogSpiralReady = Boolean(
          this.nativeLogSpiral?.soemdsp_log_spiral_create &&
          this.nativeLogSpiral?.soemdsp_log_spiral_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "log_spiral",
          status: this.nativeLogSpiralReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "fractal_spiral" || targetType === "fractalSpiral") {
        for (const state of this.fractalSpiralStates.values()) {
          this.destroyFractalSpiralNativeState(state);
        }
        this.nativeFractalSpiral = exports;
        this.nativeFractalSpiralReady = Boolean(
          this.nativeFractalSpiral?.soemdsp_fractal_spiral_create &&
          this.nativeFractalSpiral?.soemdsp_fractal_spiral_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "fractal_spiral",
          status: this.nativeFractalSpiralReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "jerobeam_spiral" || targetType === "spiral") {
        for (const state of this.spiralStates.values()) {
          this.destroyJerobeamSpiralNativeState(state);
        }
        this.nativeJerobeamSpiral = exports;
        this.nativeJerobeamSpiralReady = Boolean(
          this.nativeJerobeamSpiral?.soemdsp_jerobeam_spiral_create &&
          this.nativeJerobeamSpiral?.soemdsp_jerobeam_spiral_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "jerobeam_spiral",
          status: this.nativeJerobeamSpiralReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "additive_osc" || targetType === "additiveOsc") {
        this.nativeAdditiveOsc = exports;
        this.nativeAdditiveOscReady = Boolean(this.nativeAdditiveOsc?.soemdsp_additive_osc_sample);
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "additive_osc",
          status: this.nativeAdditiveOscReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "delay_effect" || targetType === "delayEffect") {
        for (const state of this.delayEffectStates.values()) {
          this.destroyDelayEffectNativeState(state);
        }
        this.nativeDelayEffect = exports;
        this.nativeDelayEffectReady = Boolean(
          this.nativeDelayEffect?.soemdsp_delay_effect_create &&
          this.nativeDelayEffect?.soemdsp_delay_effect_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "delay_effect",
          status: this.nativeDelayEffectReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "basic_oscillator" || targetType === "osc") {
        for (const handle of this.basicOscillatorNativeHandles.values()) {
          if (this.nativeBasicOscillator?.soemdsp_basic_oscillator_destroy) {
            this.nativeBasicOscillator.soemdsp_basic_oscillator_destroy(handle);
          }
        }
        this.basicOscillatorNativeHandles.clear();
        this.nativeBasicOscillator = exports;
        this.nativeBasicOscillatorReady = Boolean(
          this.nativeBasicOscillator?.soemdsp_basic_oscillator_create &&
          this.nativeBasicOscillator?.soemdsp_basic_oscillator_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "basic_oscillator",
          status: this.nativeBasicOscillatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "shooting_star_explosion" || targetType === "shootingStarExplosion") {
        this.nativeShootingStarExplosion = exports;
        this.nativeShootingStarExplosionReady = Boolean(
          this.nativeShootingStarExplosion?.soemdsp_shooting_star_explosion_power,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "shooting_star_explosion",
          status: this.nativeShootingStarExplosionReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "polyblep" || targetType === "polyBlep") {
        for (const state of this.polyBlepStates.values()) {
          this.destroyPolyBlepNativeState(state);
        }
        this.nativePolyBlep = exports;
        this.nativePolyBlepReady = Boolean(
          this.nativePolyBlep?.soemdsp_polyblep_create &&
          this.nativePolyBlep?.soemdsp_polyblep_sample &&
          this.nativePolyBlep?.soemdsp_polyblep_out,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "polyblep",
          status: this.nativePolyBlepReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "blit" || targetType === "blit") {
        for (const state of this.blitStates.values()) {
          this.destroyBlitNativeState(state);
        }
        this.nativeBlit = exports;
        this.nativeBlitReady = Boolean(
          this.nativeBlit?.soemdsp_blit_create &&
          this.nativeBlit?.soemdsp_blit_sample &&
          this.nativeBlit?.soemdsp_blit_out,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "blit",
          status: this.nativeBlitReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "archimedes" || targetType === "archimedes") {
        for (const state of this.archimedesStates.values()) {
          this.destroyArchimedesNativeState(state);
        }
        this.nativeArchimedes = exports;
        this.nativeArchimedesReady = Boolean(
          this.nativeArchimedes?.soemdsp_archimedes_create &&
          this.nativeArchimedes?.soemdsp_archimedes_step &&
          this.nativeArchimedes?.soemdsp_archimedes_sine,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "archimedes",
          status: this.nativeArchimedesReady ? "ready" : "missing exports",
        });
        return;
      }
      this.port.postMessage({
        type: "nativeModuleStatus",
        name,
        status: "unsupported native module",
      });
  }

  clearPlan() {
    this.inputConnections = new Map();
    this.graphInputConnections = new Map();
    this.badNumberCount = 0;
    this.lastBadValueReason = "";
    this.lastBadValueNodeId = "";
    this.lastBadValueSource = "";
    this.inputMeterPeak = 0;
    this.inputMeterSamples = 0;
    this.inputMeterSquareSum = 0;
    this.meterClipCount = 0;
    this.meterCounter = 0;
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
    this.order = [];
    this.patchFingerprint = "";
    this.patchCommandStates = new Map();
    this.engineSampleRate = sampleRate;
    this.hostSampleRate = sampleRate;
    this.oversamplingRatio = 1;
    for (const state of this.passiveFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyPassiveFilterNativeState(s));
    }
    this.passiveFilterStates = new Map();
    for (const state of this.papoulisFilterStates.values()) {
      this.destroyPapoulisFilterNativeState(state);
    }
    this.papoulisFilterStates = new Map();
    for (const state of this.phosphillatorPlaybackStates.values()) {
      this.destroyPhosphillatorNativeState(state);
    }
    this.phosphillatorPlaybackStates = new Map();
    this.phosphillatorDecodedPathCache = new Map();
    this.clockDividerStates = new Map();
    for (const state of this.clockStates.values()) {
      this.destroyClockNativeState(state);
    }
    this.clockStates = new Map();
    for (const state of this.transportStates.values()) {
      this.destroyTransportNativeState(state);
    }
    this.transportStates = new Map();
    this.codeblockFunctions = new Map();
    this.cookbookFilterStates = new Map();
    for (const state of this.delayedTriggerStates.values()) {
      this.destroyDelayedTriggerNativeState(state);
    }
    this.delayedTriggerStates = new Map();
    this.delayEffectStates = new Map();
    for (const state of this.pingPongDelayStates.values()) {
      this.destroyPingPongDelayNativeState(state);
    }
    this.pingPongDelayStates = new Map();
    this.wallDelayStates = new Map();
    this.expAdsrStates = new Map();
    for (const state of this.fractalBrownianNoiseStates.values()) {
      this.destroyFbmNativeState(state);
    }
    this.fractalBrownianNoiseStates = new Map();
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveStatusCounter = 0;
    this.gpuAdditiveUnderruns = 0;
    for (const state of this.flowerChildEnvelopeFollowerStates.values()) {
      this.destroyFlowerChildEnvelopeFollowerNativeState(state);
    }
    this.flowerChildEnvelopeFollowerStates = new Map();
    for (const state of this.ladderFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyLadderFilterNativeState(s));
    }
    this.ladderFilterStates = new Map();
    for (const state of this.flowerChildFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyFlowerChildFilterNativeState(s));
    }
    this.flowerChildFilterStates = new Map();
    for (const state of this.rsmetFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyRsmetFilterNativeState(s));
    }
    this.rsmetFilterStates = new Map();
    for (const state of this.yellowjacketFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyYellowjacketFilterNativeState(s));
    }
    this.yellowjacketFilterStates = new Map();
    for (const state of this.superloveFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroySuperloveFilterNativeState(s));
    }
    this.superloveFilterStates = new Map();
    for (const state of this.chaoticPhaseLockingFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyChaoticPhaseLockingFilterNativeState(s));
    }
    this.chaoticPhaseLockingFilterStates = new Map();
    for (const state of this.resonatorFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyResonatorFilterNativeState(s));
    }
    this.resonatorFilterStates = new Map();
    for (const state of this.humanFilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyHumanFilterNativeState(s));
    }
    this.humanFilterStates = new Map();
    for (const state of this.pulseExplosionStates.values()) {
      this.destroyPulseExplosionNativeState(state);
    }
    this.pulseExplosionStates = new Map();
    for (const state of this.comparatorStates.values()) {
      this.destroyComparatorNativeState(state);
    }
    this.comparatorStates = new Map();
    for (const state of this.minMaxStates.values()) {
      this.destroyMinMaxNativeState(state);
    }
    this.minMaxStates = new Map();
    for (const state of this.aliasSineStates.values()) {
      this.destroyAliasSineNativeState(state);
    }
    this.aliasSineStates = new Map();
    for (const state of this.tb303FilterStates.values()) {
      this.destroyStereoFilterNativeState(state, (s) => this.destroyTb303FilterNativeState(s));
    }
    this.tb303FilterStates = new Map();
    this.linearEnvelopeStates = new Map();
    this.sineWavetableStates = new Map();
    this.lorenzAttractorStates = new Map();
    this.logisticMapStates = new Map();
    this.gainBiasMixStates = new Map();
    this.sincStates = new Map();
    this.henonMapStates = new Map();
    this.chuaAttractorStates = new Map();
    this.wirdoSpiralStates = new Map();
    this.blubbStates = new Map();
    this.mushroomStates = new Map();
    this.boingStates = new Map();
    this.torusStates = new Map();
    this.keplerBouwkampStates = new Map();
    this.nyquistShannonStates = new Map();
    this.radarStates = new Map();
    for (const state of this.chordMemoryStates.values()) {
      this.destroyChordMemoryNativeState(state);
    }
    this.chordMemoryStates = new Map();
    this.chordSequencerStates = new Map();
    this.lutCellStates = new Map();
    for (const state of this.turingMachineStates.values()) {
      this.destroyTuringMachineNativeState(state);
    }
    this.turingMachineStates = new Map();
    this.pitchQuantizerStates = new Map();
    this.surgeOscillatorStates = new Map();
    this.dsfOscillatorStates = new Map();
    this.robinSupersawStates = new Map();
    this.hypersawStates = new Map();
    this.videoscopeStates = new Map();
    this.spectrogramStates = new Map();
    this.noiseGeneratorStates = new Map();
    this.oscResetStates = new Map();
    this.graphLfoStates = new Map();
    this.pluckEnvelopeStates = new Map();
    for (const state of this.randomClockStates.values()) {
      this.destroyRandomClockNativeState(state);
    }
    this.randomClockStates = new Map();
    for (const state of this.reverbEffectStates.values()) {
      this.destroySabrinaReverbState(state);
    }
    this.reverbEffectStates = new Map();
    for (const state of this.pllStates.values()) {
      this.destroyPllState(state);
    }
    this.pllStates = new Map();
    for (const state of this.helmholtzStates.values()) {
      this.destroyHelmholtzState(state);
    }
    this.helmholtzStates = new Map();
    this.randomWalkStates = new Map();
    this.piSpigotNoiseStates = new Map();
    this.bradley2AStates = new Map();
    this.antisawStates = new Map();
    for (const bundle of this.sampleHoldStates.values()) {
      this.destroyStereoFilterNativeState(bundle, (s) => this.destroySampleHoldNativeState(s));
    }
    this.sampleHoldStates = new Map();
    this.samplePlaybackStates = new Map();
    this.samples = new Map();
    for (const bundle of this.slewLimiterStates.values()) {
      this.destroyStereoFilterNativeState(bundle, (s) => this.destroySlewLimiterNativeState(s));
    }
    this.slewLimiterStates = new Map();
    this.scopeBuffers = new Map();
    this.scopeCounter = 0;
    this.smoothers = new Map();
    this.spiralStates = new Map();
    this.fractalSpiralStates = new Map();
    this.logSpiralStates = new Map();
    for (const state of this.stepSequencerStates.values()) {
      this.destroyStepSequencerNativeState(state);
    }
    this.stepSequencerStates = new Map();
    this.stepGridStates = new Map();
    for (const state of this.triggerCounterStates.values()) {
      this.destroyTriggerCounterNativeState(state);
    }
    this.triggerCounterStates = new Map();
    for (const state of this.triggerDividerStates.values()) {
      this.destroyTriggerDividerNativeState(state);
    }
    this.triggerDividerStates = new Map();
    this.triangleStates = new Map();
    this.vactrolEnvelopeStates = new Map();
    this.impulseButtonStates = new Map();
    this.bugButtonStates = new Map();
    this.polyBlepStates = new Map();
    this.visualSinks = [];
    this.resetVisualControls();
  }

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

  setPlan(plan, message = {}) {
    const patchFingerprint = message.patchFingerprint || plan?.patchFingerprint || "";
    this.patchFingerprint = patchFingerprint;
    this.planSerial = message.planSerial || 0;
    this.sessionId = message.sessionId || 0;
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveUnderruns = 0;
    this.autoSmoothingSeconds = 0.016;
    this.hostSampleRate = Math.max(1, Number(message.sampleRate) || sampleRate || 44100);
    const requestedRatio = Number(message.oversamplingRatio) ||
      ((Number(message.engineSampleRate) || this.hostSampleRate) / this.hostSampleRate);
    this.oversamplingRatio = Math.max(1, Math.min(4, Math.round(requestedRatio) || 1));
    this.engineSampleRate = this.hostSampleRate * this.oversamplingRatio;
    this.timing = this.normalizePatchTiming(plan?.timing);
    if (this.raptEllipticDecimatorRatio !== this.oversamplingRatio) {
      this.resetRaptEllipticDecimator();
    }
    const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
    this.audioPlayerNodeIds = nodes
      .filter((node) => node?.type === "audioPlayer")
      .map((node) => String(node.id || ""))
      .filter(Boolean);
    const ids = new Set(nodes.map((node) => node.id));
    this.nodes = new Map(nodes.map((node) => [node.id, {
      id: node.id,
      codeblock: this.normalizeCodeblock(node.codeblock),
      graph: node.graph || null,
      moduleGroup: node.moduleGroup || null,
      moduleGroupPlan: node.moduleGroupPlan || null,
      paramMeta: node.paramMeta || {},
      params: node.params || {},
      sample: node.sample || null,
      type: node.type,
    }]));
    this.samples = new Map((Array.isArray(plan?.samples) ? plan.samples : []).map((sample) => [
      String(sample?.id || ""),
      {
        ...sample,
        channelData: (Array.isArray(sample?.channelData) ? sample.channelData : []).map((channel) =>
          channel instanceof Float32Array ? channel : new Float32Array(channel || [])),
        samples: sample?.samples instanceof Float32Array ? sample.samples : new Float32Array(sample?.samples || []),
      },
    ]).filter(([id]) => id));
    this.order = Array.isArray(plan?.order) ? [...plan.order] : [...ids];
    this.outputNode = plan?.outputNode || "output";
    this.scopeCaptureNodeIds = Array.isArray(plan?.scopeCaptureNodeIds)
      ? plan.scopeCaptureNodeIds.map((nodeId) => String(nodeId || "")).filter(Boolean)
      : [];
    this.visualSinks = (Array.isArray(plan?.visualSinks) ? plan.visualSinks : []).map((sink) => ({
      ...sink,
      bufferedInputs: Array.isArray(sink?.bufferedInputs) ? [...sink.bufferedInputs] : [],
      inputs: (Array.isArray(sink?.inputs) ? sink.inputs : []).map((input) => ({ ...input })),
    }));
    this.syncVisualInputBuffers();
    const newInputConnections = this.buildInputConnectionMap(plan?.connections, ids);
    this.inputConnections = newInputConnections;
    this.graphInputConnections = this.buildGraphInputConnectionMap(plan?.graphConnections, ids);
    this.modulationConnections = this.buildModulationConnectionMap(plan?.modulations, ids);
    this.resetVisualControls();

    for (const id of ids) {
      if (!this.nodeOutputs.has(id)) {
        this.nodeOutputs.set(id, 0);
      }
      const node = this.nodes.get(id);
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.phases.has(id)) {
        this.phases.set(id, 0);
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.oscResetStates.has(id)) {
        this.oscResetStates.set(id, this.createOscResetState());
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.triangleStates.has(id)) {
        this.triangleStates.set(id, 0);
      }
      if (nodeLiveIsPolyBlepOscillatorType(node?.type) && !this.noiseSeeds.has(id)) {
        this.noiseSeeds.set(id, this.stableSeed(id));
      }
      if (node?.type === "spiral" && !this.spiralStates.has(id)) {
        this.spiralStates.set(id, this.createSpiralState());
      }
      if (node?.type === "fractalSpiral" && !this.fractalSpiralStates.has(id)) {
        this.fractalSpiralStates.set(id, this.createFractalSpiralState());
      }
      if (node?.type === "logSpiral" && !this.logSpiralStates.has(id)) {
        this.logSpiralStates.set(id, this.createLogSpiralState());
      }
      if (node?.type === "lorenzAttractor" && !this.lorenzAttractorStates.has(id)) {
        this.lorenzAttractorStates.set(id, this.createLorenzAttractorState());
      }
      if (node?.type === "logisticMap" && !this.logisticMapStates.has(id)) {
        this.logisticMapStates.set(id, this.createLogisticMapState());
      }
      if (node?.type === "henonMap" && !this.henonMapStates.has(id)) {
        this.henonMapStates.set(id, this.createHenonMapState());
      }
      if (node?.type === "chuaAttractor" && !this.chuaAttractorStates.has(id)) {
        this.chuaAttractorStates.set(id, this.createChuaAttractorState());
      }
      if (node?.type === "wirdoSpiral" && !this.wirdoSpiralStates.has(id)) {
        this.wirdoSpiralStates.set(id, this.createWirdoSpiralState());
      }
      if (node?.type === "blubb" && !this.blubbStates.has(id)) {
        this.blubbStates.set(id, this.createBlubbState());
      }
      if (node?.type === "mushroom" && !this.mushroomStates.has(id)) {
        this.mushroomStates.set(id, this.createMushroomState());
      }
      if (node?.type === "boing" && !this.boingStates.has(id)) {
        this.boingStates.set(id, this.createBoingState());
      }
      if (node?.type === "torus" && !this.torusStates.has(id)) {
        this.torusStates.set(id, this.createTorusState());
      }
      if (node?.type === "keplerBouwkamp" && !this.keplerBouwkampStates.has(id)) {
        this.keplerBouwkampStates.set(id, this.createKeplerBouwkampState());
      }
      if (node?.type === "nyquistShannon" && !this.nyquistShannonStates.has(id)) {
        this.nyquistShannonStates.set(id, this.createNyquistShannonState());
      }
      if (node?.type === "radar" && !this.radarStates.has(id)) {
        this.radarStates.set(id, this.createRadarState());
      }
      if (node?.type === "chordMemory" && !this.chordMemoryStates.has(id)) {
        this.chordMemoryStates.set(id, this.createChordMemoryState());
      }
      if (node?.type === "turingMachine" && !this.turingMachineStates.has(id)) {
        this.turingMachineStates.set(id, this.createTuringMachineState());
      }
      if (node?.type === "pitchQuantizer" && !this.pitchQuantizerStates.has(id)) {
        this.pitchQuantizerStates.set(id, this.createPitchQuantizerState());
      }
      if (node?.type === "chordSequencer" && !this.chordSequencerStates.has(id)) {
        this.chordSequencerStates.set(id, this.createChordSequencerState());
      }
      if (node?.type === "lutCell" && !this.lutCellStates.has(id)) {
        this.lutCellStates.set(id, this.createLutCellState());
      }
      if (node?.type === "surgeOscillator" && !this.surgeOscillatorStates.has(id)) {
        this.surgeOscillatorStates.set(id, this.createSurgeOscillatorState());
      }
      if (node?.type === "dsfOscillator" && !this.dsfOscillatorStates.has(id)) {
        this.dsfOscillatorStates.set(id, this.createDsfOscillatorState());
      }
      if (node?.type === "robinSupersaw" && !this.robinSupersawStates.has(id)) {
        this.robinSupersawStates.set(id, this.createRobinSupersawState());
      }
      if (node?.type === "hypersaw" && !this.hypersawStates.has(id)) {
        this.hypersawStates.set(id, this.createHypersawState());
      }
      if (node?.type === "videoscope" && !this.videoscopeStates.has(id)) {
        this.videoscopeStates.set(id, this.createVideoscopeState());
      }
      if (node?.type === "spectrogram" && !this.spectrogramStates.has(id)) {
        this.spectrogramStates.set(id, this.createSpectrogramState());
      }
      if (node?.type === "passiveFilter" && !this.passiveFilterStates.has(id)) {
        this.passiveFilterStates.set(id, this.createStereoFilterState(() => this.createPassiveFilterState()));
      }
      if (node?.type === "papoulisFilter" && !this.papoulisFilterStates.has(id)) {
        this.papoulisFilterStates.set(id, this.createPapoulisFilterState());
      }
      if (node?.type === "phosphillator" && !this.phosphillatorPlaybackStates.has(id)) {
        this.phosphillatorPlaybackStates.set(id, this.createPhosphillatorPlaybackState());
      }
      if (node?.type === "cookbookFilter" && !this.cookbookFilterStates.has(id)) {
        this.cookbookFilterStates.set(id, this.createStereoFilterState(() => this.createCookbookFilterState()));
      }
      if (node?.type === "ladderFilter" && !this.ladderFilterStates.has(id)) {
        this.ladderFilterStates.set(id, this.createStereoFilterState(() => this.createLadderFilterState()));
      }
      if (node?.type === "flowerChildFilter" && !this.flowerChildFilterStates.has(id)) {
        this.flowerChildFilterStates.set(id, this.createStereoFilterState(() => this.createFlowerChildFilterState()));
      }
      if (node?.type === "rsmetFilter" && !this.rsmetFilterStates.has(id)) {
        this.rsmetFilterStates.set(id, this.createStereoFilterState(() => this.createRsmetFilterState()));
      }
      if (node?.type === "yellowjacketFilter" && !this.yellowjacketFilterStates.has(id)) {
        this.yellowjacketFilterStates.set(id, this.createStereoFilterState(() => this.createYellowjacketFilterState()));
      }
      if (node?.type === "superloveFilter" && !this.superloveFilterStates.has(id)) {
        this.superloveFilterStates.set(id, this.createStereoFilterState(() => this.createSuperloveFilterState()));
      }
      if (node?.type === "chaoticPhaseLockingFilter" && !this.chaoticPhaseLockingFilterStates.has(id)) {
        this.chaoticPhaseLockingFilterStates.set(id, this.createStereoFilterState(() => this.createChaoticPhaseLockingFilterState()));
      }
      if (node?.type === "resonatorFilter" && !this.resonatorFilterStates.has(id)) {
        this.resonatorFilterStates.set(id, this.createStereoFilterState(() => this.createResonatorFilterState()));
      }
      if (node?.type === "humanFilter" && !this.humanFilterStates.has(id)) {
        this.humanFilterStates.set(id, this.createStereoFilterState(() => this.createHumanFilterState()));
      }
      if (node?.type === "pulseExplosion" && !this.pulseExplosionStates.has(id)) {
        this.pulseExplosionStates.set(id, this.createPulseExplosionState());
      }
      if (node?.type === "comparator" && !this.comparatorStates.has(id)) {
        this.comparatorStates.set(id, this.createComparatorState());
      }
      if (node?.type === "aliasSine" && !this.aliasSineStates.has(id)) {
        this.aliasSineStates.set(id, this.createAliasSineState());
      }
      if (node?.type === "tb303Filter" && !this.tb303FilterStates.has(id)) {
        this.tb303FilterStates.set(id, this.createStereoFilterState(() => this.createTb303FilterState()));
      }
      if (node?.type === "clock" && !this.clockStates.has(id)) {
        this.clockStates.set(id, this.createClockState());
      }
      if ((node?.type === "graph2" || node?.type === "graphCopy") && !this.graphLfoStates.has(id)) {
        this.graphLfoStates.set(id, this.createGraphLfoState());
      }
      if (node?.type === "clockDivider" && !this.clockDividerStates.has(id)) {
        this.clockDividerStates.set(id, this.createTriggerDividerState());
      }
      if (node?.type === "delayedTrigger" && !this.delayedTriggerStates.has(id)) {
        this.delayedTriggerStates.set(id, this.createDelayedTriggerState());
      }
      if (node?.type === "delayEffect" && !this.delayEffectStates.has(id)) {
        this.delayEffectStates.set(id, this.createStereoDelayEffectState());
      }
      if (node?.type === "pingPongDelay" && !this.pingPongDelayStates.has(id)) {
        this.pingPongDelayStates.set(id, this.createPingPongDelayState());
      }
      if (node?.type === "wallDelay" && !this.wallDelayStates.has(id)) {
        this.wallDelayStates.set(id, this.createWallDelayState());
      }
      if (node?.type === "reverbEffect" && !this.reverbEffectStates.has(id)) {
        this.reverbEffectStates.set(id, this.createSabrinaReverbState());
      }
      if (node?.type === "pll" && !this.pllStates.has(id)) {
        this.pllStates.set(id, this.createPllState());
      }
      if (node?.type === "helmholtzPitch" && !this.helmholtzStates.has(id)) {
        this.helmholtzStates.set(id, this.createHelmholtzState());
      }
      if (node?.type === "randomClock" && !this.randomClockStates.has(id)) {
        this.randomClockStates.set(id, this.createRandomClockState());
      }
      if (node?.type === "sampleHold" && !this.sampleHoldStates.has(id)) {
        this.sampleHoldStates.set(id, this.createStereoSampleHoldState());
      }
      if ((node?.type === "samplePlayer" || node?.type === "sampleLooper" || node?.type === "audioPlayer") && !this.samplePlaybackStates.has(id)) {
        this.samplePlaybackStates.set(id, this.createSamplePlaybackState());
      }
      if ((node?.type === "nextPatch" || node?.type === "previousPatch") && !this.patchCommandStates.has(id)) {
        this.patchCommandStates.set(id, this.createPatchCommandState());
      }
      if (node?.type === "slewLimiter" && !this.slewLimiterStates.has(id)) {
        this.slewLimiterStates.set(id, this.createStereoSlewLimiterState());
      }
      if (node?.type === "expAdsr" && !this.expAdsrStates.has(id)) {
        this.expAdsrStates.set(id, this.createExpAdsrState());
      }
      if (node?.type === "linearEnvelope" && !this.linearEnvelopeStates.has(id)) {
        this.linearEnvelopeStates.set(id, this.createLinearEnvelopeState());
      }
      if (node?.type === "noiseGenerator" && !this.noiseGeneratorStates.has(id)) {
        this.noiseGeneratorStates.set(id, this.createNoiseGeneratorState());
      }
      if (node?.type === "randomWalk" && !this.randomWalkStates.has(id)) {
        this.randomWalkStates.set(id, this.createRandomWalkState());
      }
      if (node?.type === "piSpigotNoise" && !this.piSpigotNoiseStates.has(id)) {
        this.piSpigotNoiseStates.set(id, this.createPiSpigotNoiseState());
      }
      if (node?.type === "bradley2a" && !this.bradley2AStates.has(id)) {
        this.bradley2AStates.set(id, this.createBradley2AState());
      }
      if (node?.type === "antisaw" && !this.antisawStates.has(id)) {
        this.antisawStates.set(id, this.createAntisawState());
      }
      if (node?.type === "fractalBrownianNoise" && !this.fractalBrownianNoiseStates.has(id)) {
        this.fractalBrownianNoiseStates.set(id, this.createFractalBrownianNoiseState());
      }
      if (
        node?.type === "flowerChildEnvelopeFollower" &&
        !this.flowerChildEnvelopeFollowerStates.has(id)
      ) {
        this.flowerChildEnvelopeFollowerStates.set(id, this.createFlowerChildEnvelopeFollowerState());
      }
      if (node?.type === "pluckEnvelope" && !this.pluckEnvelopeStates.has(id)) {
        this.pluckEnvelopeStates.set(id, this.createPluckEnvelopeState());
      }
      if (node?.type === "stepSequencer" && !this.stepSequencerStates.has(id)) {
        this.stepSequencerStates.set(id, this.createStepSequencerState());
      }
      if (node?.type === "stepGrid" && !this.stepGridStates.has(id)) {
        this.stepGridStates.set(id, this.createStepGridState());
      }
      if (node?.type === "triggerCounter" && !this.triggerCounterStates.has(id)) {
        this.triggerCounterStates.set(id, this.createTriggerCounterState());
      }
      if (node?.type === "triggerDivider" && !this.triggerDividerStates.has(id)) {
        this.triggerDividerStates.set(id, this.createTriggerDividerState());
      }
      if ((node?.type === "vactrolEnvelopeSeries" || node?.type === "vactrolEnvelopeCustom") && !this.vactrolEnvelopeStates.has(id)) {
        this.vactrolEnvelopeStates.set(id, this.createVactrolEnvelopeState());
      }
      if (node?.type === "bugButton" && !this.bugButtonStates.has(id)) {
        this.bugButtonStates.set(id, this.createBugButtonState());
      }
      if (node?.type === "polyBlep" && !this.polyBlepStates.has(id)) {
        this.polyBlepStates.set(id, this.createPolyBlepState());
      }
      if (node?.type === "blit" && !this.blitStates.has(id)) {
        this.blitStates.set(id, this.createBlitState());
      }
      if (node?.type === "archimedes" && !this.archimedesStates.has(id)) {
        this.archimedesStates.set(id, this.createArchimedesState());
      }
      if (node?.type === "moduleGroup" && node.moduleGroupPlan && !this.moduleGroupRuntimes.has(id)) {
        this.moduleGroupRuntimes.set(id, this.createNestedRuntime(node.moduleGroupPlan));
      }
      for (const [key, value] of Object.entries(node?.params || {})) {
        const smootherKey = this.parameterKey(id, key);
        const metadata = node.paramMeta?.[key];
        if (!this.smoothers.has(smootherKey)) {
          this.smoothers.set(smootherKey, this.createSmoother(value, metadata));
        } else {
          this.updateSmoother(this.smoothers.get(smootherKey), value, metadata);
        }
      }
    }

    for (const id of [...this.phases.keys()]) {
      if (!ids.has(id)) {
        this.phases.delete(id);
      }
    }
    for (const id of [...this.oscResetStates.keys()]) {
      if (!ids.has(id)) {
        this.oscResetStates.delete(id);
      }
    }
    for (const id of [...this.graphLfoStates.keys()]) {
      if (!ids.has(id)) {
        this.graphLfoStates.delete(id);
      }
    }
    for (const id of [...this.triangleStates.keys()]) {
      if (!ids.has(id)) {
        this.triangleStates.delete(id);
      }
    }
    for (const id of [...this.oscillatorLastPhaseIncrements.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.oscillatorLastPhaseIncrements.delete(id);
      }
    }
    for (const id of [...this.oscillatorStoppedSamples.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.oscillatorStoppedSamples.delete(id);
      }
    }
    for (const id of [...this.noiseSeeds.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.noiseSeeds.delete(id);
      }
    }
    for (const id of [...this.basicOscillatorNativeHandles.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        const handle = this.basicOscillatorNativeHandles.get(id);
        if (handle && this.nativeBasicOscillator?.soemdsp_basic_oscillator_destroy) {
          this.nativeBasicOscillator.soemdsp_basic_oscillator_destroy(handle);
        }
        this.basicOscillatorNativeHandles.delete(id);
      }
    }
    for (const id of [...this.noiseSeedKeys.keys()]) {
      const nodeId = String(id).split(":")[0];
      if (!ids.has(nodeId)) {
        this.noiseSeedKeys.delete(id);
      }
    }
    for (const id of [...this.nodeOutputs.keys()]) {
      if (!ids.has(id)) {
        this.nodeOutputs.delete(id);
      }
    }
    for (const id of [...this.fractalSpiralStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyFractalSpiralNativeState(this.fractalSpiralStates.get(id));
        this.fractalSpiralStates.delete(id);
      }
    }
    for (const id of [...this.logSpiralStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLogSpiralNativeState(this.logSpiralStates.get(id));
        this.logSpiralStates.delete(id);
      }
    }
    for (const id of [...this.spiralStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyJerobeamSpiralNativeState(this.spiralStates.get(id));
        this.spiralStates.delete(id);
      }
    }
    for (const id of [...this.lorenzAttractorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLorenzAttractorNativeState(this.lorenzAttractorStates.get(id));
        this.lorenzAttractorStates.delete(id);
      }
    }
    for (const id of [...this.logisticMapStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLogisticMapNativeState(this.logisticMapStates.get(id));
        this.logisticMapStates.delete(id);
      }
    }
    for (const id of [...this.henonMapStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHenonMapNativeState(this.henonMapStates.get(id));
        this.henonMapStates.delete(id);
      }
    }
    for (const id of [...this.chuaAttractorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyChuaAttractorNativeState(this.chuaAttractorStates.get(id));
        this.chuaAttractorStates.delete(id);
      }
    }
    for (const id of [...this.wirdoSpiralStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyWirdoSpiralNativeState(this.wirdoSpiralStates.get(id));
        this.wirdoSpiralStates.delete(id);
      }
    }
    for (const id of [...this.blubbStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyBlubbNativeState(this.blubbStates.get(id));
        this.blubbStates.delete(id);
      }
    }
    for (const id of [...this.mushroomStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyMushroomNativeState(this.mushroomStates.get(id));
        this.mushroomStates.delete(id);
      }
    }
    for (const id of [...this.boingStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyBoingNativeState(this.boingStates.get(id));
        this.boingStates.delete(id);
      }
    }
    for (const id of [...this.torusStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTorusNativeState(this.torusStates.get(id));
        this.torusStates.delete(id);
      }
    }
    for (const id of [...this.keplerBouwkampStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyKeplerBouwkampNativeState(this.keplerBouwkampStates.get(id));
        this.keplerBouwkampStates.delete(id);
      }
    }
    for (const id of [...this.nyquistShannonStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyNyquistShannonNativeState(this.nyquistShannonStates.get(id));
        this.nyquistShannonStates.delete(id);
      }
    }
    for (const id of [...this.radarStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRadarNativeState(this.radarStates.get(id));
        this.radarStates.delete(id);
      }
    }
    for (const id of [...this.chordMemoryStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyChordMemoryNativeState(this.chordMemoryStates.get(id));
        this.chordMemoryStates.delete(id);
      }
    }
    for (const id of [...this.turingMachineStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTuringMachineNativeState(this.turingMachineStates.get(id));
        this.turingMachineStates.delete(id);
      }
    }
    for (const id of [...this.pitchQuantizerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPitchQuantizerNativeState(this.pitchQuantizerStates.get(id));
        this.pitchQuantizerStates.delete(id);
      }
    }
    for (const id of [...this.chordSequencerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyChordSequencerNativeState(this.chordSequencerStates.get(id));
        this.chordSequencerStates.delete(id);
      }
    }
    for (const id of [...this.lutCellStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLutCellNativeState(this.lutCellStates.get(id));
        this.lutCellStates.delete(id);
      }
    }
    for (const id of [...this.surgeOscillatorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySurgeOscillatorNativeState(this.surgeOscillatorStates.get(id));
        this.surgeOscillatorStates.delete(id);
      }
    }
    for (const id of [...this.dsfOscillatorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyDsfOscillatorNativeState(this.dsfOscillatorStates.get(id));
        this.dsfOscillatorStates.delete(id);
      }
    }
    for (const id of [...this.robinSupersawStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRobinSupersawNativeState(this.robinSupersawStates.get(id));
        this.robinSupersawStates.delete(id);
      }
    }
    for (const id of [...this.hypersawStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHypersawNativeState(this.hypersawStates.get(id));
        this.hypersawStates.delete(id);
      }
    }
    for (const id of [...this.videoscopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyVideoscopeNativeState(this.videoscopeStates.get(id));
        this.videoscopeStates.delete(id);
      }
    }
    for (const id of [...this.passiveFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.passiveFilterStates.get(id), (s) => this.destroyPassiveFilterNativeState(s));
        this.passiveFilterStates.delete(id);
      }
    }
    for (const id of [...this.papoulisFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPapoulisFilterNativeState(this.papoulisFilterStates.get(id));
        this.papoulisFilterStates.delete(id);
      }
    }
    for (const id of [...this.phosphillatorPlaybackStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPhosphillatorNativeState(this.phosphillatorPlaybackStates.get(id));
        this.phosphillatorPlaybackStates.delete(id);
        this.phosphillatorDecodedPathCache.delete(id);
      }
    }
    for (const id of [...this.linearEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyLinearEnvelopeNativeState(this.linearEnvelopeStates.get(id));
        this.linearEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.sineWavetableStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySineWavetableNativeState(this.sineWavetableStates.get(id));
        this.sineWavetableStates.delete(id);
      }
    }
    for (const id of [...this.clockStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyClockNativeState(this.clockStates.get(id));
        this.clockStates.delete(id);
      }
    }
    for (const id of [...this.codeblockFunctions.keys()]) {
      if (!ids.has(id)) {
        this.codeblockFunctions.delete(id);
      }
    }
    for (const id of [...this.cookbookFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.cookbookFilterStates.delete(id);
      }
    }
    for (const id of [...this.ladderFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.ladderFilterStates.get(id), (s) => this.destroyLadderFilterNativeState(s));
        this.ladderFilterStates.delete(id);
      }
    }
    for (const id of [...this.flowerChildFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.flowerChildFilterStates.get(id), (s) => this.destroyFlowerChildFilterNativeState(s));
        this.flowerChildFilterStates.delete(id);
      }
    }
    for (const id of [...this.rsmetFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.rsmetFilterStates.get(id), (s) => this.destroyRsmetFilterNativeState(s));
        this.rsmetFilterStates.delete(id);
      }
    }
    for (const id of [...this.yellowjacketFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.yellowjacketFilterStates.get(id), (s) => this.destroyYellowjacketFilterNativeState(s));
        this.yellowjacketFilterStates.delete(id);
      }
    }
    for (const id of [...this.superloveFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.superloveFilterStates.get(id), (s) => this.destroySuperloveFilterNativeState(s));
        this.superloveFilterStates.delete(id);
      }
    }
    for (const id of [...this.chaoticPhaseLockingFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.chaoticPhaseLockingFilterStates.get(id), (s) => this.destroyChaoticPhaseLockingFilterNativeState(s));
        this.chaoticPhaseLockingFilterStates.delete(id);
      }
    }
    for (const id of [...this.resonatorFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.resonatorFilterStates.get(id), (s) => this.destroyResonatorFilterNativeState(s));
        this.resonatorFilterStates.delete(id);
      }
    }
    for (const id of [...this.humanFilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.humanFilterStates.get(id), (s) => this.destroyHumanFilterNativeState(s));
        this.humanFilterStates.delete(id);
      }
    }
    for (const id of [...this.pulseExplosionStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPulseExplosionNativeState(this.pulseExplosionStates.get(id));
        this.pulseExplosionStates.delete(id);
      }
    }
    for (const id of [...this.comparatorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyComparatorNativeState(this.comparatorStates.get(id));
        this.comparatorStates.delete(id);
      }
    }
    for (const id of [...this.minMaxStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyMinMaxNativeState(this.minMaxStates.get(id));
        this.minMaxStates.delete(id);
      }
    }
    for (const id of [...this.transportStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTransportNativeState(this.transportStates.get(id));
        this.transportStates.delete(id);
      }
    }
    for (const id of [...this.aliasSineStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyAliasSineNativeState(this.aliasSineStates.get(id));
        this.aliasSineStates.delete(id);
      }
    }
    for (const id of [...this.tb303FilterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.tb303FilterStates.get(id), (s) => this.destroyTb303FilterNativeState(s));
        this.tb303FilterStates.delete(id);
      }
    }
    for (const id of [...this.clockDividerStates.keys()]) {
      if (!ids.has(id)) {
        this.clockDividerStates.delete(id);
      }
    }
    for (const id of [...this.delayedTriggerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyDelayedTriggerNativeState(this.delayedTriggerStates.get(id));
        this.delayedTriggerStates.delete(id);
      }
    }
    for (const id of [...this.delayEffectStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyDelayEffectNativeState(this.delayEffectStates.get(id));
        this.delayEffectStates.delete(id);
      }
    }
    for (const id of [...this.pingPongDelayStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPingPongDelayNativeState(this.pingPongDelayStates.get(id));
        this.pingPongDelayStates.delete(id);
      }
    }
    for (const id of [...this.wallDelayStates.keys()]) {
      if (!ids.has(id)) {
        this.wallDelayStates.delete(id);
      }
    }
    for (const id of [...this.reverbEffectStates.keys()]) {
      if (!ids.has(id)) {
        this.destroySabrinaReverbState(this.reverbEffectStates.get(id));
        this.reverbEffectStates.delete(id);
      }
    }
    for (const id of [...this.pllStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPllState(this.pllStates.get(id));
        this.pllStates.delete(id);
      }
    }
    for (const id of [...this.helmholtzStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyHelmholtzState(this.helmholtzStates.get(id));
        this.helmholtzStates.delete(id);
      }
    }
    for (const id of [...this.sampleHoldStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.sampleHoldStates.get(id), (s) => this.destroySampleHoldNativeState(s));
        this.sampleHoldStates.delete(id);
      }
    }
    for (const id of [...this.samplePlaybackStates.keys()]) {
      if (!ids.has(id)) {
        this.samplePlaybackStates.delete(id);
      }
    }
    for (const id of [...this.patchCommandStates.keys()]) {
      if (!ids.has(id)) {
        this.patchCommandStates.delete(id);
      }
    }
    for (const id of [...this.slewLimiterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStereoFilterNativeState(this.slewLimiterStates.get(id), (s) => this.destroySlewLimiterNativeState(s));
        this.slewLimiterStates.delete(id);
      }
    }
    for (const id of [...this.expAdsrStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyExpAdsrNativeState(this.expAdsrStates.get(id));
        this.expAdsrStates.delete(id);
      }
    }
    for (const id of [...this.noiseGeneratorStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyNoiseGeneratorNativeState(this.noiseGeneratorStates.get(id));
        this.noiseGeneratorStates.delete(id);
      }
    }
    for (const id of [...this.randomWalkStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRandomWalkNativeState(this.randomWalkStates.get(id));
        this.randomWalkStates.delete(id);
      }
    }
    for (const id of [...this.piSpigotNoiseStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPiSpigotNoiseNativeState(this.piSpigotNoiseStates.get(id));
        this.piSpigotNoiseStates.delete(id);
      }
    }
    for (const id of [...this.bradley2AStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyBradley2ANativeState(this.bradley2AStates.get(id));
        this.bradley2AStates.delete(id);
      }
    }
    for (const id of [...this.antisawStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyAntisawNativeState(this.antisawStates.get(id));
        this.antisawStates.delete(id);
      }
    }
    for (const id of [...this.randomClockStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyRandomClockNativeState(this.randomClockStates.get(id));
        this.randomClockStates.delete(id);
      }
    }
    for (const id of [...this.fractalBrownianNoiseStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyFbmNativeState(this.fractalBrownianNoiseStates.get(id));
        this.fractalBrownianNoiseStates.delete(id);
      }
    }
    for (const id of [...this.flowerChildEnvelopeFollowerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyFlowerChildEnvelopeFollowerNativeState(this.flowerChildEnvelopeFollowerStates.get(id));
        this.flowerChildEnvelopeFollowerStates.delete(id);
      }
    }
    for (const id of [...this.pluckEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPluckEnvelopeNativeState(this.pluckEnvelopeStates.get(id));
        this.pluckEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.stepSequencerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyStepSequencerNativeState(this.stepSequencerStates.get(id));
        this.stepSequencerStates.delete(id);
      }
    }
    for (const id of [...this.stepGridStates.keys()]) {
      if (!ids.has(id)) {
        this.stepGridStates.delete(id);
      }
    }
    for (const id of [...this.triggerCounterStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTriggerCounterNativeState(this.triggerCounterStates.get(id));
        this.triggerCounterStates.delete(id);
      }
    }
    for (const id of [...this.triggerDividerStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyTriggerDividerNativeState(this.triggerDividerStates.get(id));
        this.triggerDividerStates.delete(id);
      }
    }
    for (const id of [...this.vactrolEnvelopeStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyVactrolEnvelopeNativeState(this.vactrolEnvelopeStates.get(id));
        this.vactrolEnvelopeStates.delete(id);
      }
    }
    for (const id of [...this.impulseButtonStates.keys()]) {
      if (!ids.has(id)) {
        this.impulseButtonStates.delete(id);
      }
    }
    for (const id of [...this.bugButtonStates.keys()]) {
      if (!ids.has(id)) {
        this.bugButtonStates.delete(id);
      }
    }
    for (const id of [...this.polyBlepStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyPolyBlepNativeState(this.polyBlepStates.get(id));
        this.polyBlepStates.delete(id);
      }
    }
    for (const id of [...this.blitStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyBlitNativeState(this.blitStates.get(id));
        this.blitStates.delete(id);
      }
    }
    for (const id of [...this.archimedesStates.keys()]) {
      if (!ids.has(id)) {
        this.destroyArchimedesNativeState(this.archimedesStates.get(id));
        this.archimedesStates.delete(id);
      }
    }
    for (const id of [...this.moduleGroupRuntimes.keys()]) {
      if (!ids.has(id)) {
        this.moduleGroupRuntimes.delete(id);
      }
    }
    for (const key of [...this.smoothers.keys()]) {
      const [nodeId, parameter] = key.split(".");
      if (!ids.has(nodeId) || !(parameter in (this.nodes.get(nodeId)?.params || {}))) {
        this.smoothers.delete(key);
      }
    }
    this.port.postMessage({
      connectionCount: Array.isArray(plan?.connections) ? plan.connections.length : 0,
      feedbackConnectionCount: Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections.length : 0,
      feedbackModulationCount: Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations.length : 0,
      feedbackModulations: (Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations : []).map(
        (modulation) =>
          `${modulation.sourceNode}.${modulation.sourcePort} -> ${modulation.destinationNode}.${modulation.destinationParam}`,
      ),
      feedbackSignals: (Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections : []).map(
        (connection) =>
          `${connection.sourceNode}.${connection.sourcePort} -> ${connection.destinationNode}.${connection.destinationPort}`,
      ),
      modulationCount: Array.isArray(plan?.modulations) ? plan.modulations.length : 0,
      engineSampleRate: this.engineSampleRate,
      nodeCount: this.nodes.size,
      order: [...this.order],
      oversamplingRatio: this.oversamplingRatio,
      patchFingerprint,
      planSerial: this.planSerial,
      sampleRate: this.hostSampleRate,
      sessionId: this.sessionId,
      speakerOutputActive: Boolean(plan?.speakerOutputActive),
      stateReadCount: (
        (Array.isArray(plan?.feedbackConnections) ? plan.feedbackConnections.length : 0) +
        (Array.isArray(plan?.feedbackModulations) ? plan.feedbackModulations.length : 0)
      ),
      type: "planApplied",
      visualSinkCount: Array.isArray(plan?.visualSinks) ? plan.visualSinks.length : 0,
      visualSinks: Array.isArray(plan?.visualSinks) ? plan.visualSinks : [],
    });
  }

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
      for (const [nodeId, graph] of Object.entries(graphData)) {
        const node = this.nodes.get(nodeId);
        if (node) {
          node.graph = graph;
        }
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
      parameterCount += Object.keys(current.params || {}).length;
      for (const [key, value] of Object.entries(current.params || {})) {
        const smootherKey = this.parameterKey(node.id, key);
        const metadata = current.paramMeta?.[key];
        if (!this.smoothers.has(smootherKey)) {
          this.smoothers.set(smootherKey, this.createSmoother(value, metadata));
        } else {
          this.updateSmoother(this.smoothers.get(smootherKey), value, metadata);
        }
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
    const low = Number(lowRange) || 0;
    const high = Number(highRange) || 0;
    const lo = Math.min(low, high);
    const hi = Math.max(low, high);
    const fallback = () => {
      // speed is expected 0-1 (the site's trigger intensity), interpolated
      // linearly into [lowRange, highRange] to get the actual pulse amplitude.
      // No speed data (not finite) keeps the pulse at max amplitude.
      if (!Number.isFinite(speed)) return hi;
      const normalizedSpeed = Math.max(0, Math.min(1, speed));
      return lo + normalizedSpeed * (hi - lo);
    };
    if (!this.nativeShootingStarExplosionReady || !this.nativeShootingStarExplosion?.soemdsp_shooting_star_explosion_power) {
      return fallback();
    }
    try {
      return this.safeFilterNumber(
        this.nativeShootingStarExplosion.soemdsp_shooting_star_explosion_power(
          Number.isFinite(speed) ? speed : -1,
          low,
          high,
        ),
        null,
      );
    } catch (error) {
      this.nativeShootingStarExplosionReady = false;
      this.port.postMessage({
        type: "nativeModuleStatus",
        name: "shooting_star_explosion",
        status: "disabled",
        message: String(error?.message || error || "native Shooting Star Explosion failed"),
      });
      return fallback();
    }
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
    const shape = String(value || "").trim();
    return shape === "linear" || shape === "smooth" || shape === "exponential" || shape === "rational" || shape === "hold"
      ? shape
      : "rational";
  }

  normalizeGraphNode(value = {}, index = 0) {
    const source = value && typeof value === "object" ? value : {};
    const fallback = index <= 0
      ? { c: 0, shape: "linear", x: 0, y: 0 }
      : { c: 0, shape: "rational", x: 1, y: 1 };
    return {
      c: this.normalizeGraphNumber(source.c, fallback.c, -0.999, 0.999),
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

  graphRationalCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const c = this.normalizeGraphNumber(contour, 0, -0.999, 0.999);
    if (Math.abs(c) < 0.000001) {
      return p;
    }
    return c < 0
      ? (p * (1 + c)) / (1 + c * p)
      : p / (1 - c + c * p);
  }

  graphExponentialCurve(position, contour = 0) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    const c = this.normalizeGraphNumber(0.5 * (contour + 1), 0.5, 0.001, 0.999);
    const a = 2 * Math.log((1 - c) / c);
    if (!Number.isFinite(a) || Math.abs(a) < 0.000001) {
      return p;
    }
    const denominator = 1 - Math.exp(a);
    return Math.abs(denominator) < 0.000001 ? p : (1 - Math.exp(p * a)) / denominator;
  }

  graphSmoothCurve(position) {
    const p = this.normalizeGraphNumber(position, 0, 0, 1);
    return p * p * (3 - 2 * p);
  }

  normalizeGraph2SmoothingMode(value) {
    if (value === "legacy") {
      return "legacy";
    }
    if (Number.isFinite(Number(value))) {
      return ["linear", "smooth", "bezier", "quadratic", "cubic", "catmullRom"][Math.max(0, Math.min(5, Math.round(Number(value))))];
    }
    const mode = String(value || "").trim().toLowerCase();
    return ["linear", "smooth", "bezier", "quadratic", "cubic", "catmullRom"].includes(mode) ? mode : "smooth";
  }

  graphMeanderCurve(position, index = 0) {
    const p = this.graphSmoothCurve(position);
    const wobblePhase = (index * 0.371) % 1;
    const wobble = Math.sin(Math.PI * p) * Math.sin((p * 1.5 + wobblePhase) * Math.PI * 2) * 0.075;
    return this.normalizeGraphNumber(p + wobble, p, 0, 1);
  }

  graphModeCurve(position, mode, index = 0) {
    const normalizedMode = this.normalizeGraph2SmoothingMode(mode);
    if (normalizedMode === "linear") {
      return this.normalizeGraphNumber(position, 0, 0, 1);
    }
    if (normalizedMode === "bezier") {
      return this.graphMeanderCurve(position, index);
    }
    return this.graphSmoothCurve(position);
  }

  graphBezierPointAt(nodes, position = 0) {
    const t = this.normalizeGraphNumber(position, 0, 0, 1);
    let points = nodes.map((node) => ({
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

  graphBezierValueAt(graph, xValue, tension = 1) {
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    if (graph.nodes.length < 2) {
      return graph.nodes[0]?.y ?? 0;
    }
    if (x <= graph.nodes[0].x) {
      return graph.nodes[0].y;
    }
    const last = graph.nodes[graph.nodes.length - 1];
    if (x >= last.x) {
      return last.y;
    }
    let low = 0;
    let high = 1;
    let point = this.graphBezierPointAt(graph.nodes, x);
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const t = (low + high) * 0.5;
      point = this.graphBezierPointAt(graph.nodes, t);
      if (point.x < x) {
        low = t;
      } else {
        high = t;
      }
    }
    const bezierValue = point.y;
    if (tension >= 1) return this.safeFilterNumber(bezierValue, null);
    const xRange = graph.nodes[graph.nodes.length - 1].x - graph.nodes[0].x;
    if (Math.abs(xRange) < 0.000001) return graph.nodes[0].y;
    const t = (x - graph.nodes[0].x) / xRange;
    const linear = graph.nodes[0].y + (graph.nodes[graph.nodes.length - 1].y - graph.nodes[0].y) * t;
    if (tension <= 0) return this.safeFilterNumber(linear, null);
    return this.safeFilterNumber(linear + tension * (bezierValue - linear), null);
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

  graphCatmullRomY(n0, n1, n2, n3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h01 = -2 * t3 + 3 * t2;
    const h10 = t3 - 2 * t2 + t;
    const h11 = t3 - t2;
    return h00 * n1 + 0.5 * h10 * (n2 - n0) + h01 * n2 + 0.5 * h11 * (n3 - n1);
  }

  graphCatmullRomValueAt(graph, xValue, tension = 1) {
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
    // Compute full Catmull-Rom value
    let crValue = 0;
    for (let index = 0; index < nodes.length - 1; index += 1) {
      if (x <= nodes[index + 1].x) {
        const left = nodes[index];
        const right = nodes[index + 1];
        const dx = right.x - left.x;
        if (Math.abs(dx) < 0.000001) {
          crValue = 0.5 * (left.y + right.y);
          break;
        }
        const t = (x - left.x) / dx;
        const n0 = index <= 0 ? (2 * nodes[0].y - nodes[1].y) : nodes[index - 1].y;
        const n1 = left.y;
        const n2 = right.y;
        const n3 = index >= nodes.length - 2 ? (2 * nodes[nodes.length - 1].y - nodes[nodes.length - 2].y) : nodes[index + 2].y;
        crValue = this.safeFilterNumber(this.graphCatmullRomY(n0, n1, n2, n3, t), null);
        break;
      }
    }
    // Blend with linear base: tension=0 = straight line, tension=1 = full CR
    if (tension >= 1) return crValue;
    const xRange = nodes[nodes.length - 1].x - nodes[0].x;
    if (Math.abs(xRange) < 0.000001) return nodes[0].y;
    const t = (x - nodes[0].x) / xRange;
    const linear = nodes[0].y + (nodes[nodes.length - 1].y - nodes[0].y) * t;
    if (tension <= 0) return this.safeFilterNumber(linear, null);
    return this.safeFilterNumber(linear + tension * (crValue - linear), null);
  }

  graphSmoothingModeForNode(node) {
    // Graph_Copy uses per-node segment shapes; Graph uses a global mode.
    if (node?.type === "graphCopy") {
      return "legacy";
    }
    return this.normalizeGraph2SmoothingMode(node?.params?.smoothingMode);
  }

  graphSegmentValue(graph, x, index, smoothingMode = "legacy") {
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
    const contour = this.normalizeGraphNumber(right.c, 0, -0.999, 0.999);
    const shaped = right.shape === "exponential"
      ? this.graphExponentialCurve(p, contour)
      : right.shape === "hold"
        ? (p >= 1 ? 1 : 0)
      : right.shape === "smooth"
        ? this.graphSmoothCurve(p)
      : right.shape === "linear"
        ? p
        : this.graphRationalCurve(p, contour);
    return left.y + (right.y - left.y) * shaped;
  }

  graphValueAt(graphValue, xValue, smoothingMode = "legacy", tension = 1) {
    const graph = this.normalizeGraph(graphValue);
    const x = this.normalizeGraphNumber(xValue, 0, -Infinity, Infinity);
    if (!graph.nodes.length) {
      return 0;
    }
    const normalizedMode = this.normalizeGraph2SmoothingMode(smoothingMode);
    if (normalizedMode === "bezier") {
      return this.graphBezierValueAt(graph, x, tension);
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
    if (normalizedMode === "catmullRom") {
      return this.graphCatmullRomValueAt(graph, x, tension);
    }
    for (let index = 0; index < graph.nodes.length - 1; index += 1) {
      if (x <= graph.nodes[index + 1].x) {
        return this.safeFilterNumber(this.graphSegmentValue(graph, x, index, smoothingMode), null);
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
    for (const key of ["Out", "Out X", "Out Y", "Out Z", "Left", "Right", "X", "Y", "Z", "Pulse", "Gate", "Count"]) {
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

  postModuleScopeSnapshot() {
    const values = [];
    const engineSampleRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
    const scopeSampleStride = Math.max(1, Number(this.scopeSampleStride) || 1);
    const decimatedScopeSampleRate = engineSampleRate / scopeSampleStride;
    for (const [nodeId, samples] of this.scopeBuffers) {
      const length = samples instanceof Float32Array
        ? Math.min(samples.length, Number(samples.nodeGraphScopeLength) || 0)
        : samples?.length || 0;
      if (!length) {
        continue;
      }
      if (samples instanceof Float32Array) {
        const writeIndex = Number(samples.nodeGraphScopeWriteIndex) || 0;
        const ordered = new Float32Array(length);
        const start = (writeIndex - length + samples.length) % samples.length;
        for (let index = 0; index < length; index += 1) {
          ordered[index] = samples[(start + index) % samples.length] || 0;
        }
        values.push([nodeId, ordered, {
          sampleRate: decimatedScopeSampleRate,
          sampleStride: scopeSampleStride,
          sourceSampleRate: engineSampleRate,
        }]);
      } else {
        values.push([nodeId, samples, {
          sampleRate: decimatedScopeSampleRate,
          sampleStride: scopeSampleStride,
          sourceSampleRate: engineSampleRate,
        }]);
      }
    }
    for (const [key, state] of this.visualInputBuffers || []) {
      const length = Math.min(Number(state?.length) || 0, state?.capacity || state?.buffer?.length || 0);
      if (!state?.buffer?.length || length <= 0) {
        continue;
      }
      const absoluteFrame = Math.max(0, Math.floor(Number(state.absoluteFrame) || 0));
      const postedFrame = Math.max(0, Math.floor(Number(state.postedFrame) || 0));
      const freshCount = postedFrame > 0
        ? Math.max(0, absoluteFrame - postedFrame)
        : Math.min(length, Math.ceil((Number(this.engineSampleRate) || sampleRate || 44100) / 30));
      const count = Math.min(length, freshCount);
      if (count <= 0) {
        continue;
      }
      const ordered = new Float32Array(count);
      const start = ((Number(state.writeIndex) || 0) - count + state.capacity) % state.capacity;
      for (let index = 0; index < count; index += 1) {
        ordered[index] = state.buffer[(start + index) % state.capacity] || 0;
      }
      values.push([key, ordered, {
        absoluteFrame,
        sampleRate: engineSampleRate,
        sampleStride: 1,
        sourceSampleRate: engineSampleRate,
        startFrame: absoluteFrame - count,
      }]);
      state.postedFrame = absoluteFrame;
    }
    // Data-plane relay: any dataOutputs port (Hypersaw's Phases/
    // Amplitudes/Pans today, more later) piggybacks on this same
    // periodic "scope" message instead of the per-sample signal graph --
    // see public/node-graph-data-bus.js for the receiving/read side.
    const dataPorts = [];
    for (const [nodeId, state] of this.hypersawStates) {
      if (Array.isArray(state?.lastVoicePhases) && state.lastVoicePhases.length) {
        dataPorts.push([nodeId, "Phases", state.lastVoicePhases]);
      }
      if (Array.isArray(state?.lastVoiceAmplitudes) && state.lastVoiceAmplitudes.length) {
        dataPorts.push([nodeId, "Amplitudes", state.lastVoiceAmplitudes]);
      }
      if (Array.isArray(state?.lastVoicePans) && state.lastVoicePans.length) {
        dataPorts.push([nodeId, "Pans", state.lastVoicePans]);
      }
    }
    for (const [nodeId, state] of this.videoscopeStates) {
      this.videoscopeCollectDisplayData(nodeId, state, dataPorts);
    }
    for (const [nodeId, state] of this.spectrogramStates) {
      this.spectrogramCollectDisplayData(nodeId, state, dataPorts);
    }
    if (!values.length && !dataPorts.length) {
      return;
    }
    this.port.postMessage({
      ...(dataPorts.length ? { dataPorts } : {}),
      patchFingerprint: this.patchFingerprint,
      sampleRate: engineSampleRate,
      sessionId: this.sessionId,
      type: "scope",
      values,
    });
    this.scopeBuffers = new Map();
  }

  // smoothingSeconds metadata is a SAMPLE COUNT, not seconds: 0 bypasses
  // smoothing entirely, and any N > 0 smooths over exactly N samples.
  smoothingSecondsFromMetadata(metadata = {}) {
    const value = Number(metadata?.smoothingSeconds);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  }

  smoothingModeFromMetadata(metadata = {}) {
    return nodeSmoothingModeNormalize(metadata?.smoothingMode);
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
    return {
      current: safeValue,
      linearSmoothing: metadata?.linearSmoothing !== false,
      max: Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : 1,
      metadata,
      min: Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : 0,
      smoothingMode: this.smoothingModeFromMetadata(metadata),
      smoothingSeconds: this.smoothingSecondsFromMetadata(metadata),
      outputBuffer: signal,
      targetSignal: signal,
      target: safeValue,
      lastFrame: -1,
      lastValue: safeValue,
      wraparound: Boolean(metadata?.wraparound),
    };
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

  // Mirrors soemdsp::filter::SmootherBase::needsSmoothing() -- once a
  // parameter has settled within epsilon of its target (no live modulation
  // moving it), skip the one-pole recompute entirely rather than running it
  // every sample forever for a value that isn't changing.
  smootherNeedsWork(smoother) {
    return Math.abs((smoother.outputBuffer ?? 0) - (smoother.targetSignal ?? 0)) > 1e-7;
  }

  updateSmoother(smoother, targetValue, metadata = {}) {
    const value = Number(targetValue);
    smoother.target = Number.isFinite(value) ? value : smoother.target;
    smoother.linearSmoothing = metadata?.linearSmoothing !== false;
    smoother.max = Number.isFinite(Number(metadata?.max)) ? Number(metadata.max) : smoother.max;
    smoother.metadata = metadata;
    smoother.min = Number.isFinite(Number(metadata?.min)) ? Number(metadata.min) : smoother.min;
    smoother.smoothingMode = this.smoothingModeFromMetadata(metadata);
    smoother.smoothingSeconds = this.smoothingSecondsFromMetadata(metadata);
    smoother.targetSignal = this.parameterValueToNormalizedSignal(smoother.target, metadata);
    smoother.wraparound = Boolean(metadata?.wraparound);
    if (!smoother.linearSmoothing) {
      smoother.current = smoother.target;
      smoother.outputBuffer = smoother.targetSignal;
      smoother.lastValue = smoother.target;
    }
  }

  readSmoothedParameter(node, key, fallback, frame, frames) {
    const smoother = this.smoothers.get(this.parameterKey(node?.id, key));
    if (!smoother) {
      const value = Number(node?.params?.[key]);
      return Number.isFinite(value) ? value : fallback;
    }
    if (!smoother.linearSmoothing) {
      return smoother.target;
    }
    if (smoother.lastFrame === frame) {
      return smoother.lastValue;
    }
    if (!this.smootherNeedsWork(smoother)) {
      smoother.current = smoother.target;
      smoother.lastFrame = frame;
      smoother.lastValue = smoother.target;
      return smoother.target;
    }
    const smoothingSeconds = this.clampAutoSmoothingSeconds(this.resolveSmoothingSecondsForMode(
      smoother.smoothingMode,
      smoother.smoothingSeconds || 0,
      frames,
      sampleRate,
    ));
    if (smoothingSeconds <= 0) {
      smoother.current = smoother.target;
      smoother.outputBuffer = smoother.targetSignal;
      smoother.lastFrame = frame;
      smoother.lastValue = smoother.target;
      return smoother.target;
    }
    const signal = this.onePoleLowpassSample(
      smoother,
      smoother.targetSignal,
      this.smoothingFrequencyFromSeconds(smoothingSeconds),
      sampleRate,
    );
    const value = this.normalizedSignalToParameterValue(signal, smoother.metadata);
    smoother.current = value;
    smoother.lastFrame = frame;
    smoother.lastValue = value;
    return value;
  }

  finishSmoothing() {
    for (const smoother of this.smoothers.values()) {
      if (!smoother.linearSmoothing) {
        smoother.current = smoother.wraparound
          ? this.wrapValue(smoother.target, smoother.min, smoother.max)
          : smoother.target;
        continue;
      }
      smoother.current = smoother.lastValue ?? smoother.current;
      smoother.lastFrame = -1;
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


  // JS fallback mirroring native_modules/archimedes/archimedes.cpp's
  // symplectic Euler sine/cosine engine, kept in plain floating point here
  // (the native module runs the same recurrence in 16.16 fixed point) --
  // fidelity of the fallback is "same math", not "bit-identical output".
  archimedesSample(options = {}) {
    const state = options.state || this.createArchimedesState();
    const dtShift = this.clampValue(Math.round(Number(options.profile) || 12), 4, 24);
    const freqHz = Math.max(0, Math.round(Number(options.frequency) || 0));
    const ditherBits = Math.max(0, Math.round(Number(options.dither) || 0));
    if (
      this.nativeArchimedesReady &&
      this.nativeArchimedes?.soemdsp_archimedes_create &&
      this.nativeArchimedes?.soemdsp_archimedes_step
    ) {
      try {
        if (!state.nativeHandle) {
          state.nativeHandle = this.nativeArchimedes.soemdsp_archimedes_create();
        }
        if (state.nativeHandle) {
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
      } catch (error) {
        this.nativeArchimedesReady = false;
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "archimedes",
          status: "disabled",
          message: String(error?.message || error || "native Archimedes Oscillator failed"),
        });
      }
    }
    return this.archimedesSampleJs(options);
  }

  archimedesSampleJs(options = {}) {
    const state = options.state || this.createArchimedesState();
    const resetHigh = Number(options.reset) > 0.5;
    if (resetHigh && !state.resetWasHigh) {
      this.resetArchimedesState(state);
    }
    state.resetWasHigh = resetHigh;
    const dtShift = this.clampValue(Math.round(Number(options.profile) || 12), 4, 24);
    const dtFloat = 1 / (2 ** dtShift);
    const freqHz = Math.max(0, Number(options.frequency) || 0);
    const phaseInc = freqHz <= 0 ? 0 : Math.PI * 2 * freqHz * dtFloat;
    const ditherBits = Math.max(0, Number(options.dither) || 0);
    const ditherAmount = ditherBits / 65536;
    const dither = ditherAmount > 0 ? (Math.random() - 0.5) * ditherAmount : 0;
    state.x -= state.y * phaseInc + dither;
    state.y += state.x * phaseInc;
    const sign = state.x < 0 ? 1 : 0;
    state.zeroCrossings += sign ^ state.lastSign;
    state.totalSteps += 1;
    state.lastSign = sign;
    // Same broadband-noise-then-one-pole-split idea as the native module,
    // just driven by Math.random() instead of re-reading a dither PRNG.
    const noiseRaw = Math.random() * 2 - 1;
    state.noiseLow += 0.01 * (noiseRaw - state.noiseLow);
    let pi = 0;
    if (state.zeroCrossings > 0 && freqHz > 0) {
      const avgStepsPerHalfCycle = state.totalSteps / state.zeroCrossings;
      pi = avgStepsPerHalfCycle * dtFloat * freqHz * Math.PI;
    }
    return {
      sine: this.clampValue(state.x, -4, 4),
      cosine: this.clampValue(state.y, -4, 4),
      pi,
      noiseBelow: state.noiseLow,
      noiseAbove: noiseRaw - state.noiseLow,
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

  yellowjacketFilterSampleJs(state, input, params, rate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const freqNorm = this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1);
    const reso = this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1);
    const chaos = this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1);

    let maxPitch, resDropPoint;
    if (safeRate <= 44100) { maxPitch = 87.7; resDropPoint = 0.77; }
    else if (safeRate <= 88200) { maxPitch = 96.0; resDropPoint = 0.82; }
    else if (safeRate <= 132300) { maxPitch = 96.0; resDropPoint = 0.83; }
    else if (safeRate <= 176400) { maxPitch = 96.0; resDropPoint = 0.86; }
    else if (safeRate <= 220500) { maxPitch = 96.0; resDropPoint = 0.89; }
    else if (safeRate <= 264600) { maxPitch = 96.0; resDropPoint = 0.90; }
    else { maxPitch = 96.0; resDropPoint = 0.95; }

    const pitch = -156 + (96 - -156) * freqNorm;
    const frequencyHz = this.analogPitchToFreq(Math.min(pitch, maxPitch));
    const cutoffHz = frequencyHz * (4.56415 + (0.972007 - 4.56415) * chaos);

    const resGraph = [{x:0,y:reso,skew:0,shape:0},{x:resDropPoint,y:reso,skew:0,shape:0},{x:1,y:0.2,skew:0.57,shape:1}];
    const newResNormalized = this.analogEvalGraph(resGraph, freqNorm);
    const ellipseCGraph = [{x:0,y:7.6024,skew:0,shape:0},{x:1,y:0.00001,skew:0.99,shape:2}];
    const feedbackGainGraph = [{x:0,y:20.0,skew:0,shape:0},{x:1,y:-0.0429102,skew:0.99,shape:2}];
    const ellipseC = this.analogEvalGraph(ellipseCGraph, newResNormalized);
    const feedbackGain = this.analogEvalGraph(feedbackGainGraph, newResNormalized);

    const a = this.analogLadderCoefficient(cutoffHz, safeRate);

    const safeInput = this.safeFilterNumber(input, state);
    let inputSignal = Math.max(-7, Math.min(7, safeInput * 4));
    inputSignal = state.oscSelfMod + 1.04025 * inputSignal + state.lastOutValue;

    state.phase += (frequencyHz * 1.9400625 * inputSignal) / safeRate;
    state.phase -= Math.floor(state.phase);

    let oscValue = this.analogWaveEllipseFull(state.phase, 0.0, -0.71286768918541499, 0.70129855105756955, ellipseC);
    oscValue *= 0.635417;

    let y0 = oscValue;
    y0 = y0 / (1 + y0 * y0);
    state.filterY1 = y0 + a * (y0 - state.filterY1);
    inputSignal = state.filterY1;

    state.oscSelfMod = inputSignal * 20.0;

    const out = 1.3892758936011171 * oscValue;
    state.lastOutValue = out * 0.5 * feedbackGain;

    return this.safeFilterNumber(out, state);
  }


  // --- SuperLove Filter ---

  superloveFilterSampleJs(state, input, params, rate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const freqNorm = this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1);
    const reso = this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1);
    const chaos = this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1);
    const mode = Math.max(0, Math.min(3, Math.round(Number(params.mode) || 0)));
    const safeInput = this.safeFilterNumber(input, state);

    if (mode <= 1) {
      const resGraph = [{x:0,y:0,skew:0,shape:0},{x:1,y:-2.7175,skew:-0.85,shape:2}];
      const noiseGraph = [{x:0,y:0.00,skew:0,shape:0},{x:0.75,y:0.05,skew:-0.7,shape:2},{x:1,y:0.10,skew:0.6,shape:2}];
      const cutoffHz = Math.max(0, Math.min(0.5 * safeRate, this.analogPitchToFreq(-12 + (135 - -12) * freqNorm)));
      const mod = this.analogEvalGraph(resGraph, reso);
      const noiseAmp = this.analogEvalGraph(noiseGraph, chaos);
      const shape = chaos;

      state.feedbackSignal = mod * state.feedbackSignal + safeInput;
      const pm = (Math.random() * 2 - 1) * noiseAmp;
      const oscValue = -this.analogWaveTrisaw(state.feedbackSignal + 0.25725 + pm, shape);

      const a = this.analogLadderCoefficient(cutoffHz, safeRate);
      const stages = mode === 0 ? 3 : 4;
      state.feedbackSignal = this.analogLadderTapStep(state.filterY, oscValue, a, 1, stages);

      const dcCutoff = mode === 0 ? 10.0 : 5.0;
      const dcStages = mode === 0 ? 3 : 1;
      const dcA = this.analogLadderCoefficient(dcCutoff, safeRate);
      const dcOut = this.analogLadderTapStep(state.dcY, state.feedbackSignal, dcA, 2, dcStages);

      return this.safeFilterNumber(dcOut * 1.02, state);
    } else if (mode === 2) {
      const resGraph = [{x:0,y:-0.2,skew:0,shape:0},{x:1,y:1.3,skew:-0.85,shape:2}];
      const mod = this.analogEvalGraph(resGraph, reso);
      const shape = 1 - chaos;

      state.feedbackSignal = mod * state.feedbackSignal + safeInput;
      const oscValue = -this.analogWaveTrisaw(state.feedbackSignal + 0.75, shape);

      const lpA = this.analogLadderCoefficient(safeRate * 0.5, safeRate);
      let fb = this.analogLadderTapStep(state.filterY, oscValue * 0.1, lpA, 1, 1);

      const cutoffHz = Math.max(0, Math.min(0.5 * safeRate, this.analogPitchToFreq(-12 + (135 - -12) * freqNorm)));
      const hpA = this.analogLadderCoefficient(cutoffHz, safeRate);
      fb = this.analogLadderTapStep(state.dcY, fb, hpA, 2, 1);
      fb *= 10;

      state.feedbackSignal = fb;
      return this.safeFilterNumber(-fb * 0.31, state);
    } else {
      const resGraph = [{x:0,y:-0.2,skew:0,shape:0},{x:1,y:1.3,skew:-0.85,shape:2}];
      const mod = this.analogEvalGraph(resGraph, reso);
      const shape = 1 - chaos;

      state.feedbackSignal = mod * state.feedbackSignal + safeInput;
      const oscValue = -this.analogWaveTrisaw(state.feedbackSignal + 0.75, shape);

      const cutoffHz = Math.max(0, Math.min(0.5 * safeRate, this.analogPitchToFreq(-12 + (135 - -12) * freqNorm)));
      const a = this.analogLadderCoefficient(cutoffHz, safeRate);
      let fb = this.analogLadderTapStep(state.filterY, oscValue * 0.1, a, 3, 1);
      fb *= 10;

      state.feedbackSignal = fb;
      return this.safeFilterNumber(fb, state);
    }
  }


  // --- Chaotic Phase Locking Filter ---

  chaoticPhaseLockingFilterSampleJs(state, input, params, rate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const freqNorm = this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1);
    const reso = this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1);
    const chaos = this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1);

    const cutoffHz = Math.max(0, Math.min(0.5 * safeRate, this.analogPitchToFreq(-12 + (135 - -12) * freqNorm)));
    const resGraph = [{x:0,y:0.1,skew:0,shape:0},{x:1,y:20.0,skew:-0.85,shape:2}];
    const mod = this.analogEvalGraph(resGraph, reso);
    const shape = 1 - chaos;

    const safeInput = this.safeFilterNumber(input, state);
    state.feedbackSignal = mod * state.feedbackSignal + (-safeInput);
    const oscValue = this.analogWaveEllipse(state.feedbackSignal, shape);

    const a = this.analogLadderCoefficient(cutoffHz, safeRate);
    state.feedbackSignal = this.analogLadderTapStep(state.filterY, oscValue, a, 1, 2);

    const dcA = this.analogLadderCoefficient(5.0, safeRate);
    const dcOut = this.analogLadderTapStep(state.dcY, state.feedbackSignal, dcA, 2, 1);

    return this.safeFilterNumber(-dcOut, state);
  }


  // --- Resonator Filter ---

  resonatorFilterSampleJs(state, input, params, rate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const freqNorm = this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1);
    const reso = this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1);
    const chaos = this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1);
    const mode = Math.max(0, Math.min(2, Math.round(Number(params.mode) || 0)));
    const safeInput = this.safeFilterNumber(input, state);

    if (mode === 0 || mode === 1) {
      const triangle = mode === 1;
      const inputAmplitude = triangle ? 3.0 : 2.0;

      let maxFreqNorm, resDropPoint;
      if (safeRate <= 44100) { maxFreqNorm = 0.855; resDropPoint = 0.74; }
      else if (safeRate <= 88200) { maxFreqNorm = 0.9; resDropPoint = 0.75; }
      else if (safeRate <= 132300) { maxFreqNorm = 0.9; resDropPoint = 0.82; }
      else if (safeRate <= 176400) { maxFreqNorm = 0.9; resDropPoint = 0.88; }
      else if (safeRate <= 220500) { maxFreqNorm = 0.9; resDropPoint = 0.92; }
      else { maxFreqNorm = 0.955; resDropPoint = 0.92; }

      const freqNormInUse = Math.min(freqNorm, maxFreqNorm);
      const frequencyHz = this.analogPitchToFreq(-72.96 + (69.76 - -72.96) * freqNormInUse);
      const cutoffHz = frequencyHz * (0.248387 + (0.0927813 - 0.248387) * this.flowerChildFilterCurveShape(freqNormInUse, -0.36));
      const osc2Ratio = 0.015625 + (1.58 - 0.015625) * freqNormInUse;
      const osc1Ratio = osc2Ratio - 0.015625;

      const resGraph = [{x:0,y:reso,skew:0,shape:0},{x:resDropPoint,y:reso,skew:0,shape:0},{x:1,y:0.15,skew:0.557,shape:1}];
      const newResNorm = this.analogEvalGraph(resGraph, freqNorm);
      const freqModAmt = 10.0 + (484.43 - 10.0) * newResNorm;
      const phaseModAmt = 0.256 + (0.166 - 0.256) * chaos;

      let inputSignal = inputAmplitude * safeInput;
      inputSignal = state.osc2Value + state.osc1SelfMod + inputSignal;

      const freq1 = frequencyHz * osc1Ratio * freqModAmt * 0.1 * inputSignal;
      const clampedFreq1 = Math.max(-safeRate * 0.5, Math.min(safeRate * 0.5, freq1));
      state.phase1 += clampedFreq1 / safeRate;
      state.phase1 -= Math.floor(state.phase1);
      const phaseOffset1 = inputSignal * phaseModAmt;
      let unipolar1 = state.phase1 + phaseOffset1;
      unipolar1 -= Math.floor(unipolar1);
      state.osc1Value = this.analogWaveEllipse(unipolar1, 0.00749) * 0.5;

      const a = this.analogLadderCoefficient(cutoffHz, safeRate);
      inputSignal = this.analogLadderTapStep(state.filterY, state.osc1Value, a, 1, 1);

      state.osc1SelfMod = inputSignal;
      state.osc2SelfMod = state.osc2Value;

      const fm2 = freqModAmt * 4.53126 * inputSignal + state.osc2SelfMod * 3.0;
      const freq2 = frequencyHz * osc2Ratio * fm2;
      const clampedFreq2 = Math.max(-safeRate * 0.5, Math.min(safeRate * 0.5, freq2));
      state.phase2 += clampedFreq2 / safeRate;
      state.phase2 -= Math.floor(state.phase2);

      let out;
      if (!triangle) {
        out = Math.sin(state.phase2 * 2 * Math.PI);
        state.osc2Value = out * 10.0;
      } else {
        const ellipseCGraph = [{x:0,y:0.3,skew:0,shape:0},{x:1,y:1.0,skew:-0.99,shape:2}];
        const ellipseC = this.analogEvalGraph(ellipseCGraph, freqNormInUse);
        out = this.analogWaveEllipse(state.phase2, ellipseC);
        state.osc2Value = out * 10.0;
      }

      const dcA = this.analogLadderCoefficient(5.0, safeRate);
      const dcOut = this.analogLadderTapStep(state.dcY, -out, dcA, 2, 1);
      return this.safeFilterNumber(dcOut * (triangle ? 10.0 : 4.6), state);
    } else {
      const inputAmplitude = 2.0;
      const frequencyHz = this.analogPitchToFreq(-50 + (108 - -50) * freqNorm);
      const cutoffHz = frequencyHz * 8.87718;

      const mod21Graph = [{x:0,y:-0.00105655,skew:0,shape:0},{x:1,y:-2.52898,skew:-0.99,shape:2}];
      const fmpm12Graph = [{x:0,y:0.0,skew:0,shape:0},{x:1,y:0.012216,skew:0.54,shape:2}];

      let breakpoint2, cap3;
      if (safeRate <= 44100) { breakpoint2 = 0.578595; cap3 = 0.432749; }
      else if (safeRate <= 88200) { breakpoint2 = 0.692308; cap3 = 0.502924; }
      else if (safeRate <= 132300) { breakpoint2 = 0.749164; cap3 = 0.561404; }
      else { breakpoint2 = 0.776273; cap3 = 0.54386; }
      const cappedTarget = Math.min(reso, cap3);
      const resGraph = [{x:0,y:0,skew:0,shape:0},{x:0.0434783,y:reso,skew:0,shape:0},{x:breakpoint2,y:reso,skew:0,shape:0},{x:1,y:cappedTarget,skew:0.195211,shape:1}];
      const resSample = this.analogEvalGraph(resGraph, freqNorm);
      let mod21 = this.analogEvalGraph(mod21Graph, resSample);
      if (mod21 < -1.53) mod21 = -1.53;
      const fmpm12 = this.analogEvalGraph(fmpm12Graph, chaos);

      let inputSignal = (-safeInput) * inputAmplitude + state.sawFeedback * -8.07896613446314289533 + state.osc2Value + state.osc1SelfMod * 20.0;

      const freq1 = frequencyHz * mod21 * inputSignal;
      state.phase1 += freq1 / safeRate;
      state.phase1 -= Math.floor(state.phase1);
      state.osc1Value = Math.sin(state.phase1 * 2 * Math.PI);
      const scaleX = 2 / 0.00873698;
      state.osc1Value = (0.00873698 / 2) * Math.tanh(scaleX * state.osc1Value);

      const a = this.analogLadderCoefficient(cutoffHz, safeRate);
      inputSignal = this.analogLadderTapStep(state.filterY, state.osc1Value, a, 1, 1);

      state.osc1SelfMod = inputSignal;
      state.osc2SelfMod = state.osc2Value;

      const modv = inputSignal * -140.010789331 + state.osc2SelfMod * -1.05208;
      const fm = Math.cos((Math.PI / 2) * fmpm12) * modv;
      const pm = Math.sin((Math.PI / 2) * fmpm12) * modv;
      state.phase2 += (frequencyHz * (-0.425 + fm)) / safeRate;
      state.phase2 -= Math.floor(state.phase2);
      let unipolar2 = state.phase2 + pm;
      unipolar2 -= Math.floor(unipolar2);
      state.osc2Value = Math.sin(unipolar2 * 2 * Math.PI);

      state.sawFeedback = inputSignal + state.osc2Value;

      const dcA = this.analogLadderCoefficient(5.0, safeRate);
      const dcOut = this.analogLadderTapStep(state.dcY, -state.osc2Value * 0.1, dcA, 2, 1);
      return this.safeFilterNumber(dcOut * 80.0, state);
    }
  }


  // --- Human Filter ---

  humanFilterDbToAmp(db) {
    return Math.pow(10, db / 20);
  }

  humanFilterSampleJs(state, input, params, rate) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    const freqNorm = this.clampValue(this.safeFilterNumber(params.frequency, state), 0, 1);
    const reso = this.clampValue(this.safeFilterNumber(params.resonance, state), 0, 1);
    const chaos = this.clampValue(this.safeFilterNumber(params.chaos, state), 0, 1);
    const mode = Math.max(0, Math.min(2, Math.round(Number(params.mode) || 0)));

    let maxPitch, resDropPoint, chaosMax;
    if (safeRate <= 44100) { maxPitch = 115.57; resDropPoint = 0.78; chaosMax = 0.64; }
    else if (safeRate <= 88200) { maxPitch = 128.7; resDropPoint = 0.78; chaosMax = 1.0; }
    else if (safeRate <= 132300) { maxPitch = 137.0; resDropPoint = 0.83; chaosMax = 0.856; }
    else if (safeRate <= 176400) { maxPitch = 137.0; resDropPoint = 0.91; chaosMax = 1.0; }
    else if (safeRate <= 220500) { maxPitch = 137.0; resDropPoint = 1.0; chaosMax = 1.0; }
    else { maxPitch = 137.0; resDropPoint = 0.78; chaosMax = 1.0; }

    const pitch = -0.38 + (137.0 - -0.38) * freqNorm;
    const frequencyHz = this.analogPitchToFreq(Math.min(pitch, maxPitch));

    const mod11Graph = [{x:0.0,y:2.92396,skew:0,shape:0},{x:1.0,y:-1.7544,skew:0.785442,shape:1}];
    let mod11;
    if (resDropPoint !== 1.0) {
      const resVfreqGraph = [{x:0.0,y:reso,skew:0,shape:0},{x:resDropPoint,y:reso,skew:0,shape:0},{x:1.0,y:0.2,skew:0.57,shape:1}];
      const newResNormalized = this.analogEvalGraph(resVfreqGraph, freqNorm);
      mod11 = this.analogEvalGraph(mod11Graph, newResNormalized);
    } else {
      mod11 = this.analogEvalGraph(mod11Graph, reso);
    }

    const gainDb = Math.min(chaos, chaosMax) * 14.9;

    const centerHz = 1000.0;
    const Q = 1.0;
    const A = this.humanFilterDbToAmp(gainDb);
    const w = Math.max(1e-9, Math.min(Math.PI * 0.98, 2 * Math.PI * centerHz / safeRate));
    const r = 1 / (Q * A);
    const g = Math.tan(0.5 * w);
    const c = g + r;
    const sCoef = 1 / (1 + g * c);
    const aB = A * A * r;

    const safeInput = this.safeFilterNumber(input, state);
    const clampedInput = this.clampValue(safeInput, -2, 2);
    const svfIn = state.osc2Value + state.osc1ModSelf + clampedInput + state.lastOutValue;
    const yH = (svfIn - c * state.fbZ1 - state.fbZ2) * sCoef;
    const yB = state.fbZ1 + g * yH;
    const yL = state.fbZ2 + g * yB;
    state.fbZ1 = 2 * yB - state.fbZ1;
    state.fbZ2 = 2 * yL - state.fbZ2;
    const inputSignal = yH + aB * yB + yL;

    const fm1 = -2.2784975504539248 * inputSignal;
    state.phase1 += (frequencyHz * fm1) / safeRate;
    state.phase1 -= Math.floor(state.phase1);
    state.osc1Value = Math.sin(state.phase1 * 2 * Math.PI) * 0.177898;

    state.osc1ModSelf = state.osc1Value * mod11;
    state.osc2ModSelf = state.osc2Value * -0.395833;

    const fm2 = 0.0333333 + 2.7429968062 * state.osc1Value + state.osc2ModSelf;
    state.phase2 += (frequencyHz * fm2) / safeRate;
    state.phase2 -= Math.floor(state.phase2);
    state.osc2Value = Math.sin(state.phase2 * 2 * Math.PI) * 0.71597;

    state.lastOutValue = (state.osc1Value + state.osc2Value) * 0.1443178;

    const dcA = this.analogLadderCoefficient(5.0, safeRate);
    let out;
    if (mode === 0) out = this.analogLadderTapStep(state.dcY, state.osc1Value, dcA, 2, 1) * 2.0;
    else if (mode === 1) out = this.analogLadderTapStep(state.dcY, state.osc1Value + state.osc2Value, dcA, 2, 1);
    else out = this.analogLadderTapStep(state.dcY, state.osc2Value, dcA, 2, 1);

    return this.safeFilterNumber(out, state);
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
  buildLiveModuleEvaluators() {
    return {
      logisticMap: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.logisticMapStates.get(nodeId) || this.createLogisticMapState();
        this.logisticMapStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return {
          Out: this.logisticMapSample(state, {
            level: read("level", 1),
            r: read("r", 3.9),
            rate: read("rate", 8),
            reset: mixInput(nodeId, "Reset"),
            sampleRate: safeRate,
            seed: read("seed", 0.5),
          }),
        };
      },
      turingMachine: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.turingMachineStates.get(nodeId) || this.createTuringMachineState();
        this.turingMachineStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.turingMachineSample(state, {
          clock: mixInput(nodeId, "Clock"),
          length: read("length", 8),
          level: read("level", 1),
          probability: read("probability", 0.25),
          reset: mixInput(nodeId, "Reset"),
        });
      },
      henonMap: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.henonMapStates.get(nodeId) || this.createHenonMapState();
        this.henonMapStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const henon = this.henonMapSample(state, {
          a: read("a", 1.4),
          b: read("b", 0.3),
          rate: read("rate", 8),
          reset: mixInput(nodeId, "Reset"),
          sampleRate: safeRate,
          seedX: read("seedX", 0.1),
          seedY: read("seedY", 0.1),
        });
        const henonLevel = read("level", 1);
        return {
          X: henon.x * henonLevel,
          Y: henon.y * henonLevel,
        };
      },
      chuaAttractor: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.chuaAttractorStates.get(nodeId) || this.createChuaAttractorState();
        this.chuaAttractorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const chua = this.chuaAttractorSample(state, {
          alpha: read("alpha", 15.6),
          beta: read("beta", 28),
          m0: read("m0", -1.143),
          m1: read("m1", -0.714),
          reset: mixInput(nodeId, "Reset"),
          sampleRate: safeRate,
          speed: read("speed", 1),
        });
        const chuaLevel = read("level", 1);
        return {
          X: chua.x * chuaLevel,
          Y: chua.y * chuaLevel,
          Z: chua.z * chuaLevel,
        };
      },
      chordMemory: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.chordMemoryStates.get(nodeId) || this.createChordMemoryState();
        this.chordMemoryStates.set(nodeId, state);
        return this.chordMemorySample(state, {
          advance: mixInput(nodeId, "Advance"),
          clear: mixInput(nodeId, "Clear"),
          latch: mixInput(nodeId, "Latch"),
          pitch: mixInput(nodeId, "Pitch"),
        });
      },
      pitchQuantizer: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.pitchQuantizerStates.get(nodeId) || this.createPitchQuantizerState();
        this.pitchQuantizerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return {
          "0.1V/Oct": this.pitchQuantizerSample(state, {
            hasScaleInput: hasInput(nodeId, "Scale"),
            pitch: mixInput(nodeId, "0.1V/Oct"),
            scaleChoice: read("scale", 1),
            scaleInput: mixInput(nodeId, "Scale"),
          }),
        };
      },
      wirdoSpiral: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.wirdoSpiralStates.get(nodeId) || this.createWirdoSpiralState();
        this.wirdoSpiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const wirdo = this.wirdoSpiralSample(state, {
          cross: read("cross", 0),
          cut: read("cut", 1000),
          density: read("density", 0.8),
          frequency: read("frequency", 8),
          length: read("length", 1),
          reset: mixInput(nodeId, "Reset"),
          ringCut: read("ringCut", 10),
          rotate: read("rotate", 0),
          sampleRate: safeRate,
          scrap: read("scrap", 1),
          sharp: read("sharp", 0),
          splashDensity: read("splashDensity", 0),
          splashDepth: read("splashDepth", 0),
          splashSpeed: read("splashSpeed", 0),
          syncCut: read("syncCut", 1),
        });
        const wirdoLevel = read("level", 1);
        return {
          X: wirdo.x * wirdoLevel,
          Y: wirdo.y * wirdoLevel,
        };
      },
      blubb: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.blubbStates.get(nodeId) || this.createBlubbState();
        this.blubbStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const blubb = this.blubbSample(state, {
          frequency: read("frequency", 8),
          reset: mixInput(nodeId, "Reset"),
          rotX: read("rotX", 0),
          rotY: read("rotY", 0),
          sampleRate: safeRate,
          shape: read("shape", 0),
          zDepth: read("zDepth", 0),
        });
        const blubbLevel = read("level", 1);
        return {
          X: blubb.x * blubbLevel,
          Y: blubb.y * blubbLevel,
        };
      },
      mushroom: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.mushroomStates.get(nodeId) || this.createMushroomState();
        this.mushroomStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const mushroom = this.mushroomSample(state, {
          apart: read("apart", 0),
          capRotation: read("capRotation", 0),
          capStemTransition: read("capStemTransition", 0.1),
          clusterRotation: read("clusterRotation", 0),
          clusterRotationSpeed: read("clusterRotationSpeed", 0),
          density: read("density", 3),
          frequency: read("frequency", 8),
          grow: read("grow", 1),
          head: read("head", 0.6667),
          numMushrooms: read("numMushrooms", 1),
          phaseOffset: read("phaseOffset", 0),
          reset: mixInput(nodeId, "Reset"),
          sampleRate: safeRate,
          sharp: read("sharp", 0),
          spread: read("spread", 0.5),
          stem: read("stem", 0),
          stemRotationSpeed: read("stemRotationSpeed", 0),
          width: read("width", 1),
          wobble: read("wobble", 0.0625),
        });
        const mushroomLevel = read("level", 1);
        return {
          X: mushroom.x * mushroomLevel,
          Y: mushroom.y * mushroomLevel,
        };
      },
      boing: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.boingStates.get(nodeId) || this.createBoingState();
        this.boingStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const boing = this.boingSample(state, {
          boing: read("boing", 0),
          boingStrength: read("boingStrength", 0),
          density: read("density", 1),
          dir: read("dir", 0),
          ends: read("ends", 0),
          frequency: read("frequency", 8),
          reset: mixInput(nodeId, "Reset"),
          rotX: read("rotX", 0),
          rotY: read("rotY", 0),
          sampleRate: safeRate,
          shape: read("shape", 0),
          sharpness: read("sharpness", 0),
          volume: read("volume", 1),
          volumePreJump: read("volumePreJump", 0),
          zAmount: read("zAmount", 0),
          zDepth: read("zDepth", 0),
        });
        const boingLevel = read("level", 1);
        return {
          X: boing.x * boingLevel,
          Y: boing.y * boingLevel,
        };
      },
      torus: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.torusStates.get(nodeId) || this.createTorusState();
        this.torusStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const torus = this.torusSample(state, {
          balance: read("balance", 0),
          darkAngle: read("darkAngle", 0),
          darkIntensity: read("darkIntensity", 0),
          density: read("density", 1),
          frequency: read("frequency", 8),
          length: read("length", 0),
          quantizeDensity: read("quantizeDensity", 1),
          quantizeSubDensity: read("quantizeSubDensity", 1),
          reset: mixInput(nodeId, "Reset"),
          rotX: read("rotX", 0),
          rotY: read("rotY", 0),
          rotZ: read("rotZ", 0),
          sampleRate: safeRate,
          sharp: read("sharp", 0.5),
          size: read("size", 1),
          subdensity: read("subdensity", 0),
          wander: read("wander", 0),
          zAngleX: read("zAngleX", 0),
          zAngleY: read("zAngleY", 0),
          zDepth: read("zDepth", 0),
        });
        const torusLevel = read("level", 1);
        return {
          X: torus.x * torusLevel,
          Y: torus.y * torusLevel,
        };
      },
      keplerBouwkamp: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.keplerBouwkampStates.get(nodeId) || this.createKeplerBouwkampState();
        this.keplerBouwkampStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const kepler = this.keplerBouwkampSample(state, {
          circles: read("circles", 0.5),
          frequency: read("frequency", 8),
          length: read("length", 1),
          reset: mixInput(nodeId, "Reset"),
          rotation: read("rotation", 0),
          sampleRate: safeRate,
          start: read("start", 3),
          tri: read("tri", 0),
          zoom: read("zoom", 0),
        });
        const keplerLevel = read("level", 1);
        return {
          X: kepler.x * keplerLevel,
          Y: kepler.y * keplerLevel,
        };
      },
      nyquistShannon: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.nyquistShannonStates.get(nodeId) || this.createNyquistShannonState();
        this.nyquistShannonStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const nyquist = this.nyquistShannonSample(state, {
          artifact: read("artifact", 0),
          enableToneModFreq: read("enableToneModFreq", 0),
          enableToneModNote: read("enableToneModNote", 0),
          enableToneModPitch: read("enableToneModPitch", 1),
          frequencyA: read("frequencyA", 440),
          frequencyB: read("frequencyB", 5),
          midiNoteRaw: read("midiNoteRaw", 48),
          phaseOffset: read("phaseOffset", 0),
          rate: read("rate", 20),
          reset: mixInput(nodeId, "Reset"),
          sampleDots: read("sampleDots", 0),
          sampleRate: safeRate,
          subPhase: read("subPhase", 0),
          subPhaseRotationSpeed: read("subPhaseRotationSpeed", 0),
          tone: read("tone", 0),
          toneSmoothTime: read("toneSmoothTime", 0.01),
        });
        const nyquistLevel = read("level", 1);
        return {
          X: nyquist.x * nyquistLevel,
          Y: nyquist.y * nyquistLevel,
        };
      },
      surgeOscillator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.surgeOscillatorStates.get(nodeId) || this.createSurgeOscillatorState();
        this.surgeOscillatorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const baseFrequency = Math.max(0, read("frequency", 100));
        const pitchInput = this.clampValue(
          this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null),
          -10,
          10,
        );
        const frequencyHz = Math.max(0, baseFrequency * (2 ** (pitchInput / 0.1)));
        const effectiveFrequency = this.resolveFrequencyHz(frequencyHz, this.readFInputHz(mixInput, nodeId));
        return this.surgeOscillatorSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          syncIn: mixInput(nodeId, "Sync"),
          hasExternalSync: hasInput(nodeId, "Sync"),
          syncFrequencyHz: read("syncFrequency", 50),
          waveform: read("waveform", 0),
          level: read("level", 1),
        });
      },
      dsfOscillator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.dsfOscillatorStates.get(nodeId) || this.createDsfOscillatorState();
        this.dsfOscillatorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // Same 0.1V/Oct + pitch-reference convention as PolyBLEP / RobinSupersaw.
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        // Phase / Amplitude jacks: Phase adds to the Phase knob (cycles);
        // Amplitude multiplies the Amplitude knob when wired.
        const phaseKnob = read("phase", 0);
        const phaseCv = this.inputConnections.has(this.inputKey(nodeId, "Phase"))
          ? this.safeFilterNumber(mixInput(nodeId, "Phase"), null)
          : 0;
        const phase = this.wrapValue(phaseKnob + phaseCv, 0, 1);
        const levelKnob = read("level", 1);
        const level = this.inputConnections.has(this.inputKey(nodeId, "Amplitude"))
          ? levelKnob * this.safeFilterNumber(mixInput(nodeId, "Amplitude"), null)
          : levelKnob;
        return this.dsfOscillatorSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          waveform: read("waveform", 1),
          morph: read("morph", 1),
          pulseWidth: read("pulseWidth", 0.5),
          blend: read("blend", 0.5),
          phase,
          level,
        });
      },
      robinSupersaw: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.robinSupersawStates.get(nodeId) || this.createRobinSupersawState();
        this.robinSupersawStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // baseFrequency is the pitch heard at the global pitch reference
        // note (see node-graph-patch-normalizers.js) -- set it equal to
        // the master "Pitch Reference Frequency" setting and a MIDI
        // keyboard is automatically in tune; double it to transpose the
        // whole instrument up an octave.
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        return this.robinSupersawSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          detuneCents: read("detuneCents", 30),
          voices: read("voices", 7),
          level: read("level", 1),
        });
      },
      hypersaw: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.hypersawStates.get(nodeId) || this.createHypersawState();
        this.hypersawStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // baseFrequency is the pitch heard at the global pitch reference
        // note (see node-graph-patch-normalizers.js), same convention as
        // robinSupersaw above -- set it equal to the master "Pitch
        // Reference Frequency" setting and a MIDI keyboard is
        // automatically in tune.
        const baseFrequency = Math.max(0, read("frequency", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchInput = hasPitchInput
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        const pitchedFrequency = Math.max(0, baseFrequency * (2 ** ((pitchInput - referenceVoltage) / 0.1)));
        const effectiveFrequency = this.resolveFrequencyHz(pitchedFrequency, this.readFInputHz(mixInput, nodeId));
        return this.hypersawSample(state, {
          frequencyHz: effectiveFrequency,
          sampleRate: safeRate,
          phaseOffset: read("phase", 0),
          numVoices: read("voices", 8),
          spread: read("spread", 1),
          randomAmount: read("random", 0.15),
          driftAmount: read("drift", 0.1),
          level: read("level", 0.35),
        });
      },
      chordSequencer: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.chordSequencerStates.get(nodeId) || this.createChordSequencerState();
        this.chordSequencerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.chordSequencerSample(state, {
          clock: mixInput(nodeId, "Clock"),
          level: read("level", 1),
          progression: read("progression", 0),
          reset: mixInput(nodeId, "Reset"),
        });
      },
      lutCell: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.lutCellStates.get(nodeId) || this.createLutCellState();
        this.lutCellStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.lutCellSample(state, {
          a: mixInput(nodeId, "A"),
          b: mixInput(nodeId, "B"),
          c: mixInput(nodeId, "C"),
          d: mixInput(nodeId, "D"),
          clock: mixInput(nodeId, "Clock"),
          truthTable: read("truthTable", 27030),
          hasAInput: hasInput(nodeId, "A"),
          hasClockInput: hasInput(nodeId, "Clock"),
        });
      },
      passiveFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.passiveFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createPassiveFilterState());
        this.passiveFilterStates.set(nodeId, state);
        const passiveMode = this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues);
        const passiveLowFrequency = this.readEffectiveParameter(node, "lowFrequency", 200, frame, frames, frameValues);
        const passiveHighFrequency = this.readEffectiveParameter(node, "highFrequency", 1000, frame, frames, frameValues);
        const passiveMono = mixInput(nodeId);
        return {
          Out: this.passiveFilterSample(state.mono, passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate),
          Left: this.passiveFilterSample(state.left, mixInput(nodeId, "Left") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate),
          Right: this.passiveFilterSample(state.right, mixInput(nodeId, "Right") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate),
        };
      },
      papoulisFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.papoulisFilterStates.get(nodeId) || this.createPapoulisFilterState();
        this.papoulisFilterStates.set(nodeId, state);
        return this.papoulisFilterSample(
          state,
          mixInput(nodeId),
          this.readEffectiveParameter(node, "cutoff", 1000, frame, frames, frameValues),
          safeRate,
        );
      },
      phosphillator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.phosphillatorPlaybackStates.get(nodeId) || this.createPhosphillatorPlaybackState();
        this.phosphillatorPlaybackStates.set(nodeId, state);
        return this.phosphillatorPlaybackSample(
          state,
          node,
          nodeId,
          mixInput(nodeId, "0.1V/Oct"),
          this.readEffectiveParameter(node, "frequency", 2, frame, frames, frameValues),
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
          mixInput(nodeId, "Reset"),
          safeRate,
        );
      },
      cookbookFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.cookbookFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createCookbookFilterState());
        this.cookbookFilterStates.set(nodeId, state);
        const cookbookMode = this.readEffectiveParameter(node, "mode", 1, frame, frames, frameValues);
        const cookbookFrequency = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const cookbookQ = this.readEffectiveParameter(node, "q", 1, frame, frames, frameValues);
        const cookbookGain = this.readEffectiveParameter(node, "gain", 0, frame, frames, frameValues);
        const cookbookStages = this.readEffectiveParameter(node, "stages", 2, frame, frames, frameValues);
        const cookbookMono = mixInput(nodeId);
        return {
          Out: this.cookbookFilterSample(state.mono, cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate),
          Left: this.cookbookFilterSample(state.left, mixInput(nodeId, "Left") + cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate),
          Right: this.cookbookFilterSample(state.right, mixInput(nodeId, "Right") + cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate),
        };
      },
      ladderFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.ladderFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createLadderFilterState());
        this.ladderFilterStates.set(nodeId, state);
        const ladderParams = {
          frequency: this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 1, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
          stages: this.readEffectiveParameter(node, "stages", 4, frame, frames, frameValues),
        };
        const ladderMono = mixInput(nodeId);
        return {
          Out: this.ladderFilterSample(state.mono, ladderMono, ladderParams, safeRate),
          Left: this.ladderFilterSample(state.left, mixInput(nodeId, "Left") + ladderMono, ladderParams, safeRate),
          Right: this.ladderFilterSample(state.right, mixInput(nodeId, "Right") + ladderMono, ladderParams, safeRate),
        };
      },
      flowerChildFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.flowerChildFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createFlowerChildFilterState());
        this.flowerChildFilterStates.set(nodeId, state);
        const flowerChildParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const flowerChildMono = mixInput(nodeId);
        return {
          Out: this.flowerChildFilterSample(state.mono, flowerChildMono, flowerChildParams, safeRate),
          Left: this.flowerChildFilterSample(state.left, mixInput(nodeId, "Left") + flowerChildMono, flowerChildParams, safeRate),
          Right: this.flowerChildFilterSample(state.right, mixInput(nodeId, "Right") + flowerChildMono, flowerChildParams, safeRate),
        };
      },
      rsmetFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.rsmetFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createRsmetFilterState());
        this.rsmetFilterStates.set(nodeId, state);
        const rsmetParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const rsmetMono = mixInput(nodeId);
        return {
          Out: this.rsmetFilterSample(state.mono, rsmetMono, rsmetParams, safeRate),
          Left: this.rsmetFilterSample(state.left, mixInput(nodeId, "Left") + rsmetMono, rsmetParams, safeRate),
          Right: this.rsmetFilterSample(state.right, mixInput(nodeId, "Right") + rsmetMono, rsmetParams, safeRate),
        };
      },
      yellowjacketFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.yellowjacketFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createYellowjacketFilterState());
        this.yellowjacketFilterStates.set(nodeId, state);
        const yellowjacketParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const yellowjacketMono = mixInput(nodeId);
        return {
          Out: this.yellowjacketFilterSample(state.mono, yellowjacketMono, yellowjacketParams, safeRate),
          Left: this.yellowjacketFilterSample(state.left, mixInput(nodeId, "Left") + yellowjacketMono, yellowjacketParams, safeRate),
          Right: this.yellowjacketFilterSample(state.right, mixInput(nodeId, "Right") + yellowjacketMono, yellowjacketParams, safeRate),
        };
      },
      superloveFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.superloveFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createSuperloveFilterState());
        this.superloveFilterStates.set(nodeId, state);
        const superloveParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0.5, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const superloveMono = mixInput(nodeId);
        return {
          Out: this.superloveFilterSample(state.mono, superloveMono, superloveParams, safeRate),
          Left: this.superloveFilterSample(state.left, mixInput(nodeId, "Left") + superloveMono, superloveParams, safeRate),
          Right: this.superloveFilterSample(state.right, mixInput(nodeId, "Right") + superloveMono, superloveParams, safeRate),
        };
      },
      chaoticPhaseLockingFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.chaoticPhaseLockingFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createChaoticPhaseLockingFilterState());
        this.chaoticPhaseLockingFilterStates.set(nodeId, state);
        const chaoticPhaseLockingParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 1, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const chaoticPhaseLockingMono = mixInput(nodeId);
        return {
          Out: this.chaoticPhaseLockingFilterSample(state.mono, chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate),
          Left: this.chaoticPhaseLockingFilterSample(state.left, mixInput(nodeId, "Left") + chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate),
          Right: this.chaoticPhaseLockingFilterSample(state.right, mixInput(nodeId, "Right") + chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate),
        };
      },
      resonatorFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.resonatorFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createResonatorFilterState());
        this.resonatorFilterStates.set(nodeId, state);
        const resonatorParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const resonatorMono = mixInput(nodeId);
        return {
          Out: this.resonatorFilterSample(state.mono, resonatorMono, resonatorParams, safeRate),
          Left: this.resonatorFilterSample(state.left, mixInput(nodeId, "Left") + resonatorMono, resonatorParams, safeRate),
          Right: this.resonatorFilterSample(state.right, mixInput(nodeId, "Right") + resonatorMono, resonatorParams, safeRate),
        };
      },
      humanFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.humanFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createHumanFilterState());
        this.humanFilterStates.set(nodeId, state);
        const humanFilterParams = {
          chaos: this.readEffectiveParameter(node, "chaos", 0, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 0.5, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const humanFilterMono = mixInput(nodeId);
        return {
          Out: this.humanFilterSample(state.mono, humanFilterMono, humanFilterParams, safeRate),
          Left: this.humanFilterSample(state.left, mixInput(nodeId, "Left") + humanFilterMono, humanFilterParams, safeRate),
          Right: this.humanFilterSample(state.right, mixInput(nodeId, "Right") + humanFilterMono, humanFilterParams, safeRate),
        };
      },
      pulseExplosion: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.pulseExplosionStates.get(nodeId) || this.createPulseExplosionState();
        this.pulseExplosionStates.set(nodeId, state);
        return this.pulseExplosionSample(
          state,
          mixInput(nodeId, "Trigger"),
          {
            startTime: this.readEffectiveParameter(node, "startTime", 0, frame, frames, frameValues),
            centerTime: this.readEffectiveParameter(node, "centerTime", 0.5, frame, frames, frameValues),
            endTime: this.readEffectiveParameter(node, "endTime", 1, frame, frames, frameValues),
            timeSpread: this.readEffectiveParameter(node, "timeSpread", 0.3, frame, frames, frameValues),
            numberOfPulses: this.readEffectiveParameter(node, "numberOfPulses", 20, frame, frames, frameValues),
            lowAmplitude: this.readEffectiveParameter(node, "lowAmplitude", 0.3, frame, frames, frameValues),
            highAmplitude: this.readEffectiveParameter(node, "highAmplitude", 1, frame, frames, frameValues),
            seed: this.readEffectiveParameter(node, "seed", 0, frame, frames, frameValues),
          },
          safeRate,
        );
      },
      comparator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.comparatorStates.get(nodeId) || this.createComparatorState();
        this.comparatorStates.set(nodeId, state);
        return this.comparatorSample(
          state,
          mixInput(nodeId, "In"),
          {
            changeAmount: this.readEffectiveParameter(node, "changeAmount", 0.5, frame, frames, frameValues),
            pulseTime: this.readEffectiveParameter(node, "pulseTime", 0.01, frame, frames, frameValues),
            triggerLevel: this.readEffectiveParameter(node, "triggerLevel", 0.5, frame, frames, frameValues),
            pulseLevel: this.readEffectiveParameter(node, "pulseLevel", 1, frame, frames, frameValues),
          },
          safeRate,
        );
      },
      minMax: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.minMaxStates.get(nodeId) || this.createMinMaxState();
        this.minMaxStates.set(nodeId, state);
        const ports = ["In 1", "In 2", "In 3", "In 4"];
        const values = ports.map((port) => mixInput(nodeId, port));
        let connectedMask = 0;
        ports.forEach((port, i) => {
          if (hasInput(nodeId, port)) connectedMask |= (1 << i);
        });
        return this.minMaxSample(state, values, connectedMask);
      },
      aliasSine: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.aliasSineStates.get(nodeId) || this.createAliasSineState();
        this.aliasSineStates.set(nodeId, state);
        // When universal `f` is wired (absolute Hz), convert to cycles/sample.
        const fHz = this.readFInputHz(mixInput, nodeId);
        const normFromKnob = this.readEffectiveParameter(node, "normFreq", 0.1, frame, frames, frameValues);
        const normFreq = fHz != null ? fHz / Math.max(1, safeRate) : normFromKnob;
        return this.aliasSineSample(
          state,
          normFreq,
          this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues),
          safeRate,
        );
      },
      tb303Filter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.tb303FilterStates.get(nodeId) || this.createStereoFilterState(() => this.createTb303FilterState());
        this.tb303FilterStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const tb303Params = {
          cutoff: read("cutoff", 1000),
          drive: read("drive", 0),
          mode: read("mode", 4),
          resonance: read("resonance", 0),
        };
        const tb303Mono = mixInput(nodeId);
        return {
          Out: this.tb303FilterSample(state.mono, tb303Mono, tb303Params, safeRate),
          Left: this.tb303FilterSample(state.left, mixInput(nodeId, "Left") + tb303Mono, tb303Params, safeRate),
          Right: this.tb303FilterSample(state.right, mixInput(nodeId, "Right") + tb303Mono, tb303Params, safeRate),
        };
      },
      delayEffect: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.delayEffectStates.get(nodeId) || this.createStereoDelayEffectState();
        this.delayEffectStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const delayParams = {
          feedback: read("feedback", 0.25),
          level: read("level", 1),
          mix: read("mix", 0.35),
          mode: read("mode", 0),
          modAmount: read("modAmount", 0.02),
          modRate: read("modRate", 0.1),
          modVariation: read("modVariation", 0),
          time: read("time", 0.18),
        };
        const delayMono = mixInput(nodeId);
        const monoResult = this.delayEffectSample(state.mono, delayMono, delayParams, safeRate, `${nodeId}:mono`);
        const leftResult = this.delayEffectSample(state.left, mixInput(nodeId, "Left") + delayMono, delayParams, safeRate, `${nodeId}:left`);
        const rightResult = this.delayEffectSample(state.right, mixInput(nodeId, "Right") + delayMono, delayParams, safeRate, `${nodeId}:right`);
        return {
          Out: monoResult.Out,
          Left: leftResult.Out,
          Right: rightResult.Out,
          Wet: monoResult.Wet,
        };
      },
      pingPongDelay: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.pingPongDelayStates.get(nodeId) || this.createPingPongDelayState();
        this.pingPongDelayStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.pingPongDelaySample(
          state,
          mixInput(nodeId) + mixInput(nodeId, "Left") + mixInput(nodeId, "Right"),
          {
            feedback: read("feedback", 0.35),
            level: read("level", 1),
            mix: read("mix", 0.35),
            offsetMs: read("offsetMs", 0),
            timeDenominator: read("timeDenominator", 4),
            timeNumerator: read("timeNumerator", 1),
            timingMode: read("timingMode", 0),
          },
          safeRate,
        );
      },
      wallDelay: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.wallDelayStates.get(nodeId) || this.createWallDelayState();
        this.wallDelayStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.wallDelaySample(
          state,
          mixInput(nodeId),
          {
            bounceCount: read("bounceCount", 3),
            earDistance: read("earDistance", 17),
            level: read("level", 1),
            mix: read("mix", 0.5),
            rayCount: read("rayCount", 6),
            reflectivity: read("reflectivity", 0.6),
            roomHeight: read("roomHeight", 1),
            roomPreset: read("roomPreset", 0),
            roomRoundness: read("roomRoundness", 0.3),
            roomScale: read("roomScale", 4),
            roomSeed: read("roomSeed", 0),
            roomWidth: read("roomWidth", 1),
          },
          safeRate,
        );
      },
      reverbEffect: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.reverbEffectStates.get(nodeId) || this.createSabrinaReverbState();
        this.reverbEffectStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const monoInput = mixInput(nodeId, "In");
        const leftInput = mixInput(nodeId, "Left") + monoInput;
        const rightInput = mixInput(nodeId, "Right") + monoInput;
        return this.sabrinaReverbSample(
          state,
          leftInput,
          rightInput,
          {
            delaySize: read("delaySize", 0.02),
            diffusionAmount: read("diffusionAmount", 0.70),
            diffusionSize: read("diffusionSize", 0.35),
            lfoAmplitude: read("lfoAmplitude", 0.07),
            lfoBaseSpeed: read("lfoBaseSpeed", 0.83),
            lfoVariation: read("lfoVariation", 0.001),
            mix: read("mix", 0.43),
            recycle: read("recycle", 0.70),
            seed: read("seed", 0),
          },
          safeRate,
          frame,
        );
      },
      pll: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.pllStates.get(nodeId) || this.createPllState();
        this.pllStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const cvConnected = this.inputConnections?.has?.(this.inputKey(nodeId, "VCO CV In")) ? 1 : 0;
        return this.pllSample(
          state,
          mixInput(nodeId, "Signal In"),
          mixInput(nodeId, "VCO CV In"),
          cvConnected,
          {
            range: read("range", 1),
            offset: read("offset", 5),
            type: read("type", 1),
            frequ: read("frequ", 10),
          },
          safeRate,
        );
      },
      helmholtzPitch: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.helmholtzStates.get(nodeId) || this.createHelmholtzState();
        this.helmholtzStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.helmholtzSample(
          state,
          mixInput(nodeId, "In"),
          {
            windowSize: read("windowSize", 512),
            threshold: read("threshold", 0.93),
          },
          hasInput(nodeId, "In"),
          safeRate,
        );
      },
      slewLimiter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.slewLimiterStates.get(nodeId) || this.createStereoSlewLimiterState();
        this.slewLimiterStates.set(nodeId, state);
        const slewUpTime = this.readEffectiveParameter(node, "upTime", 0.05, frame, frames, frameValues);
        const slewDownTime = this.readEffectiveParameter(node, "downTime", 0.20, frame, frames, frameValues);
        const slewMono = mixInput(nodeId);
        return {
          Out: this.slewLimiterSample(state.mono, slewMono, slewUpTime, slewDownTime, safeRate),
          Left: this.slewLimiterSample(state.left, mixInput(nodeId, "Left") + slewMono, slewUpTime, slewDownTime, safeRate),
          Right: this.slewLimiterSample(state.right, mixInput(nodeId, "Right") + slewMono, slewUpTime, slewDownTime, safeRate),
        };
      },
      sampleHold: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.sampleHoldStates.get(nodeId) || this.createStereoSampleHoldState();
        this.sampleHoldStates.set(nodeId, state);
        const sampleHoldTrigger = mixInput(nodeId, "Trigger");
        const sampleHoldThreshold = this.readEffectiveParameter(node, "threshold", 0, frame, frames, frameValues);
        const sampleHoldFrequency = this.readEffectiveParameter(node, "sampleFrequency", 0, frame, frames, frameValues);
        const sampleHoldMonoHasIn = hasInput(nodeId, "In");
        const sampleHoldMono = mixInput(nodeId, "In");
        return {
          Out: this.sampleHoldSample(state.mono, sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn, `${nodeId}:mono`),
          Left: this.sampleHoldSample(state.left, mixInput(nodeId, "Left") + sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn || hasInput(nodeId, "Left"), `${nodeId}:left`),
          Right: this.sampleHoldSample(state.right, mixInput(nodeId, "Right") + sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn || hasInput(nodeId, "Right"), `${nodeId}:right`),
        };
      },
      expAdsr: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.expAdsrStates.get(nodeId) || this.createExpAdsrState();
        this.expAdsrStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.expAdsrSample(
          state,
          mixInput(nodeId, "Gate"),
          {
            attack: read("attack", 0.08),
            attackShape: read("attackShape", 0.3),
            decay: read("decay", 0.22),
            delay: read("delay", 0),
            level: read("level", 1),
            loop: read("loop", 0),
            release: read("release", 0.45),
            releaseShape: read("releaseShape", 0.0001),
            sustain: read("sustain", 0.55),
          },
          safeRate,
        );
      },
      linearEnvelope: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.linearEnvelopeStates.get(nodeId) || this.createLinearEnvelopeState();
        this.linearEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.linearEnvelopeSample(
          state,
          mixInput(nodeId, "Gate"),
          {
            attack: read("attack", 0.08),
            decay: read("decay", 0.22),
            delay: read("delay", 0),
            level: read("level", 1),
            loop: read("loop", 0),
            release: read("release", 0.45),
            sustain: read("sustain", 0.55),
          },
          safeRate,
        );
      },
      pluckEnvelope: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.pluckEnvelopeStates.get(nodeId) || this.createPluckEnvelopeState();
        this.pluckEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.pluckEnvelopeSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Release"),
          {
            attackFeedback: read("attackFeedback", 0.002),
            autoReleaseTime: read("autoReleaseTime", 0.08),
            decay: read("decay", 0.35),
            decayModCurve: read("decayModCurve", 0),
            decayModEnd: read("decayModEnd", 0.55),
            decayModFrequency: read("decayModFrequency", 1.5),
            decayModStart: read("decayModStart", 0.08),
            delayTime: read("delayTime", 0),
            endingDecay: read("endingDecay", 0.8),
            level: read("level", 1),
            releaseFeedback: read("releaseFeedback", 0.35),
            velocity: read("velocity", 1),
            velocitySensitivity: read("velocitySensitivity", 0),
          },
          safeRate,
        );
      },
      vactrolEnvelopeSeries: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.vactrolEnvelopeStates.get(nodeId) || this.createVactrolEnvelopeState();
        this.vactrolEnvelopeStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const isSeries = node?.type === "vactrolEnvelopeSeries";
        const seriesSpec = isSeries ? nodeGraphVactrolSeriesSpec(read("part", 2)) : null;
        return this.vactrolEnvelopeSample(
          state,
          mixInput(nodeId, "Light"),
          {
            attack: isSeries ? seriesSpec.attack : read("attack", 0.01),
            curve: read("curve", 1),
            darkCurrent: read("darkCurrent", 0),
            lightOffset: read("lightOffset", 0),
            release: isSeries ? seriesSpec.release : read("release", 0.1),
            sensitivity: read("sensitivity", 1),
          },
          safeRate,
        );
      },
      flowerChildEnvelopeFollower: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.flowerChildEnvelopeFollowerStates.get(nodeId) ||
          this.createFlowerChildEnvelopeFollowerState();
        this.flowerChildEnvelopeFollowerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.flowerChildEnvelopeFollowerSample(
          state,
          mixInput(nodeId, "In"),
          {
            attack: read("attack", 0.001),
            decay: read("decay", 0.001),
            hold: read("hold", 0.001),
          },
          safeRate,
        );
      },
      spiral: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.spiralStates.get(nodeId) || this.createSpiralState();
        this.spiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const spiral = this.jerobeamSpiralSample({
          density: read("density", 1),
          frequency: read("frequency", 440),
          morph: read("morph", 0),
          morphSpeed: read("morphSpeed", 0),
          position: read("position", 0),
          positionSpeed: read("positionSpeed", 0),
          rotX: read("rotX", 0),
          rotXSpeed: read("rotXSpeed", 0),
          rotY: read("rotY", 0),
          rotYSpeed: read("rotYSpeed", 0),
          sampleRate: safeRate,
          sharp: read("sharp", 0.5),
          sharpCurve: read("sharpCurve", 0),
          sharpCurveMult: read("sharpCurveMult", 1),
          size: read("size", 0.5),
          state,
          zAmount: read("zAmount", 0),
          zDepth: read("zDepth", 0),
        });
        const level = read("level", 1);
        return {
          X: spiral.x * level,
          Y: spiral.y * level,
          Z: spiral.z * level,
        };
      },
      fractalSpiral: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.fractalSpiralStates.get(nodeId) || this.createFractalSpiralState();
        this.fractalSpiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const fractal = this.fractalSpiralSample(state, {
          frequency: read("frequency", 1),
          gain: read("gain", 0.5),
          growth: read("growth", 1.5),
          lacunarity: read("lacunarity", 2),
          octaves: read("octaves", 5),
          sampleRate: safeRate,
          size: read("size", 0.5),
          spin: read("spin", 0.05),
          twist: read("twist", 0.381966),
        });
        const fractalLevel = read("level", 1);
        return {
          X: fractal.x * fractalLevel,
          Y: fractal.y * fractalLevel,
          Z: fractal.z * fractalLevel,
        };
      },
      logSpiral: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.logSpiralStates.get(nodeId) || this.createLogSpiralState();
        this.logSpiralStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const logSpiral = this.logSpiralSample(state, {
          frequency: read("frequency", 1),
          growth: read("growth", 3),
          sampleRate: safeRate,
          size: read("size", 0.5),
          spin: read("spin", 0.05),
          turns: read("turns", 4),
        });
        const logSpiralLevel = read("level", 1);
        return {
          X: logSpiral.x * logSpiralLevel,
          Y: logSpiral.y * logSpiralLevel,
          Z: logSpiral.z * logSpiralLevel,
        };
      },
      lorenzAttractor: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.lorenzAttractorStates.get(nodeId) || this.createLorenzAttractorState();
        this.lorenzAttractorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        const lorenz = this.lorenzAttractorSample({
          beta: read("beta", 8 / 3),
          reset: mixInput(nodeId, "Reset"),
          rho: read("rho", 28),
          rotate: read("rotate", 0),
          sampleRate: safeRate,
          scale: read("scale", 1),
          sigma: read("sigma", 10),
          speed: read("speed", 1),
          state,
          zDepth: read("zDepth", 0.4),
        });
        const level = read("level", 1);
        return {
          X: lorenz.x * level,
          Y: lorenz.y * level,
          Z: lorenz.z * level,
        };
      },
      noiseGenerator: (node, nodeId, frame, frames, frameValues) => {
        const state = this.noiseGeneratorStates.get(nodeId) || this.createNoiseGeneratorState();
        this.noiseGeneratorStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.noiseGeneratorSample(
          state,
          {
            deviation: read("deviation", 0.5),
            level: read("level", 1),
            mean: read("mean", 0),
            mode: read("mode", 0),
            seed: read("seed", 1),
          },
          nodeId,
        );
      },
      randomWalk: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.randomWalkStates.get(nodeId) || this.createRandomWalkState();
        this.randomWalkStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.randomWalkSample(
          state,
          {
            frequency: read("frequency", 2),
            jitter: read("jitter", 0.25),
            level: read("level", 1),
            method: read("method", 3),
            seed: read("seed", 1),
          },
          safeRate,
          nodeId,
        );
      },
      piSpigotNoise: (node, nodeId, frame, frames, frameValues) => {
        const state = this.piSpigotNoiseStates.get(nodeId) || this.createPiSpigotNoiseState();
        this.piSpigotNoiseStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.piSpigotNoiseSample(state, {
          seedLeft: read("seedLeft", 0),
          seedRight: read("seedRight", 0.5),
          color: read("color", 0),
          smoothing: read("smoothing", 0),
          level: read("level", 1),
        });
      },
      bradley2a: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.bradley2AStates.get(nodeId) || this.createBradley2AState();
        this.bradley2AStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.bradley2ASample(
          state,
          {
            carrierFreq: read("carrierFreq", 1004),
            freqOffset: read("freqOffset", 0),
            jitterDepth: read("jitterDepth", 0),
            jitterRate: read("jitterRate", 60),
            ampDepth: read("ampDepth", 0),
            ampRate: read("ampRate", 40),
            interfLevel: read("interfLevel", 0),
            interfFreq: read("interfFreq", 2600),
            harm2: read("harm2", 0),
            harm3: read("harm3", 0),
            hitRate: read("hitRate", 1),
            hitDuration: read("hitDuration", 0.005),
            hitGain: read("hitGain", 1),
            hitPhase: read("hitPhase", 0),
            impulseLevel: read("impulseLevel", 0),
            level: read("level", 1),
          },
          safeRate,
        );
      },
      antisaw: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.antisawStates.get(nodeId) || this.createAntisawState();
        this.antisawStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.antisawSample(
          state,
          {
            fundamental: read("fundamental", 110),
            reflections: read("reflections", 64),
            tilt: read("tilt", 0),
            level: read("level", 1),
          },
          safeRate,
        );
      },
      fractalBrownianNoise: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.fractalBrownianNoiseStates.get(nodeId) || this.createFractalBrownianNoiseState();
        this.fractalBrownianNoiseStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.fractalBrownianNoiseVector(
          state,
          {
            frequency: read("frequency", 0.5),
            level: read("level", 1),
            octaves: read("octaves", 4),
            persistence: read("persistence", 0.5),
            scale: read("scale", 1),
            seed: read("seed", 1),
          },
          safeRate,
          nodeId,
          mixInput(nodeId, "Reset"),
        );
      },
      clock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.clockStates.get(nodeId) || this.createClockState();
        this.clockStates.set(nodeId, state);
        return this.clockSample(
          state,
          mixInput(nodeId, "Reset"),
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "rate", 2, frame, frames, frameValues),
          this.readEffectiveParameter(node, "duty", 0.5, frame, frames, frameValues),
          this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues),
          safeRate,
        );
      },
      transport: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.transportStates.get(nodeId) || this.createTransportState();
        this.transportStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.transportSample(
          state,
          {
            amplitude: read("amplitude", 1),
            divisions: read("divisions", 0),
          },
          safeRate,
        );
      },
      randomClock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.randomClockStates.get(nodeId) || this.createRandomClockState();
        this.randomClockStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.randomClockSample(
          state,
          mixInput(nodeId, "Reset"),
          {
            duty: read("duty", 0.5),
            level: read("level", 1),
            maxSeconds: read("maxSeconds", 1),
            minSeconds: read("minSeconds", 0.25),
            seed: read("seed", 1),
            threshold: read("threshold", 0),
            triggerTime: read("triggerTime", 0.01),
          },
          safeRate,
          nodeId,
        );
      },
      clockDivider: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.clockDividerStates.get(nodeId) || this.createTriggerDividerState();
        this.clockDividerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const division = Math.max(1, Math.min(64, Math.round(read("division", 2))));
        const clockConnection = (this.inputConnections.get(this.inputKey(nodeId, "Clock")) || [])[0];
        const clockSourceNode = this.nodes.get(clockConnection?.sourceNode);
        const sourceRate = clockSourceNode?.type === "clock"
          ? Math.max(0, Number(clockSourceNode.params?.rate) || 0)
          : 0;
        const pulseTime = sourceRate > 0
          ? this.clampValue(read("duty", 0.5), 0.01, 1) * division / sourceRate
          : 0.01;
        return this.triggerDividerSample(
          state,
          mixInput(nodeId, "Clock"),
          mixInput(nodeId, "Reset"),
          {
            division,
            level: read("level", 1),
            pulseTime,
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      },
      delayedTrigger: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.delayedTriggerStates.get(nodeId) || this.createDelayedTriggerState();
        this.delayedTriggerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.delayedTriggerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            delay: read("delay", 0.1),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      },
      triggerCounter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.triggerCounterStates.get(nodeId) || this.createTriggerCounterState();
        this.triggerCounterStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.triggerCounterSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            countMax: read("countMax", 8),
            increment: read("increment", 1),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      },
      triggerDivider: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.triggerDividerStates.get(nodeId) || this.createTriggerDividerState();
        this.triggerDividerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.triggerDividerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            division: read("division", 2),
            level: read("level", 1),
            pulseTime: read("pulseTime", 0.01),
            threshold: read("threshold", 0),
          },
          safeRate,
        );
      },
      stepSequencer: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.stepSequencerStates.get(nodeId) || this.createStepSequencerState();
        this.stepSequencerStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.stepSequencerSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          {
            level: read("level", 1),
            steps: read("steps", 8),
            threshold: read("threshold", 0),
            values: [
              read("step1", 0),
              read("step2", 0.25),
              read("step3", 0.5),
              read("step4", 0.75),
              read("step5", 1),
              read("step6", 0.75),
              read("step7", 0.5),
              read("step8", 0.25),
            ],
          },
        );
      },
      stepGrid: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.stepGridStates.get(nodeId) || this.createStepGridState();
        this.stepGridStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        // 16 duplicated from STEP_GRID_MAX_STEPS (public/modules/stepGrid/
        // step-grid-register.js) rather than shared -- that file is
        // main-thread-only (it also calls registerNodeGraphChromelessModule,
        // which doesn't exist in this worklet blob's execution context), so
        // it can't be added to nodeGraphLiveWorkletSourceFiles.
        const stepCount = Math.max(1, Math.min(16, Math.round(read("steps", 8))));
        const steps = [];
        for (let index = 1; index <= stepCount; index += 1) {
          steps.push(read(`step${index}`, 0));
        }
        return this.stepGridSample(
          state,
          mixInput(nodeId, "Trigger"),
          mixInput(nodeId, "Reset"),
          { threshold: read("threshold", 0), steps },
        );
      },
      midiOut: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const hasMidiInput = this.inputConnections.has(this.inputKey(nodeId, "MIDI Number"));
        const midiNumber = this.clampValue(Math.round(this.readEffectiveParameter(
          node,
          "midiNumber",
          60,
          frame,
          frames,
          frameValues,
        )), 0, 127);
        const outputMidiNumber = hasMidiInput
          ? this.clampValue(Math.round(Number(mixInput(nodeId, "MIDI Number")) || 0), 0, 127)
          : midiNumber;
        return {
          "Full Value": outputMidiNumber,
          Normalized: outputMidiNumber / 127,
        };
      },
      midiNotePitch: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const pitch = this.clampValue((
          Number(mixInput(nodeId, "MIDI Note")) +
          Number(mixInput(nodeId, "Octave Offset")) * 12 +
          Number(mixInput(nodeId, "Pitch Offset"))
        ) || 0, 0, 127);
        return {
          Frequency: 440 * (2 ** ((pitch - 69) / 12)),
          "Pitch 0-1": pitch / 127,
          "Pitch 0-127": pitch,
        };
      },
      keyboardController: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const signal = this.midiKeyboardSignal || {};
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        const manualRawMidi = Number.isFinite(Number(signal.rawMidi))
          ? Number(signal.rawMidi)
          : Number(signal.midi) || 60;
        const manualOctave = Number(signal.octave) || 0;
        const octave = hasInput(nodeId, "Octave")
          ? this.clampValue(Math.round(Number(mixInput(nodeId, "Octave")) || 0), -6, 6)
          : manualOctave;
        const rawMidi = resetActive
          ? 60
          : (hasInput(nodeId, "MIDI Note") ? Number(mixInput(nodeId, "MIDI Note")) || 0 : manualRawMidi);
        const midi = this.clampValue(Math.round(rawMidi + octave * 12), 0, 127);
        const automatedPitch = resetActive || hasInput(nodeId, "MIDI Note") || hasInput(nodeId, "Octave");
        const key = automatedPitch
          ? this.clampValue(Math.round(rawMidi) - 48, 0, 24)
          : this.clampValue(Number(signal.keyIndex) || 12, 0, 24);
        const frequency = 440 * (2 ** ((midi - 69) / 12));
        const outputFrequency = Math.max(0, frequency);
        const increment = Math.max(0, outputFrequency / safeRate);
        const q = automatedPitch
          ? key / 24
          : this.clampValue(Number(signal.keyQuantized) || key / 24, 0, 1);
        const x = resetActive ? 0.5 : (hasInput(nodeId, "X")
          ? this.clampValue(Number(mixInput(nodeId, "X")) || 0, 0, 1)
          : this.clampValue(Number(signal.x) || q, 0, 1));
        const y = resetActive ? 0 : (hasInput(nodeId, "Y")
          ? this.clampValue(Number(mixInput(nodeId, "Y")) || 0, 0, 1)
          : this.clampValue(Number(signal.y) || 0, 0, 1));
        const gate = resetActive ? 0 : (hasInput(nodeId, "Gate")
          ? (Number(mixInput(nodeId, "Gate")) > 0 ? 1 : 0)
          : (Number(signal.gate) > 0 ? 1 : 0));
        const hold = hasInput(nodeId, "Hold") && Number(mixInput(nodeId, "Hold")) > 0 ? 1 : 0;
        const velocity = hasInput(nodeId, "Velocity")
          ? this.clampValue(Number(mixInput(nodeId, "Velocity")) || 0, 0, 1)
          : y;
        const gatePulse = this.midiKeyboardGatePulseSamples > 0 ? 1 : 0;
        this.midiKeyboardGatePulseSamples = Math.max(0, this.midiKeyboardGatePulseSamples - 1);
        // Held Keys phase-bit multiplexing -- see the design note on
        // nodeGraphMidiKeyboardHeldKeysTransmitValue in
        // node-graph-view-controls.js (duplicated here since this worklet
        // runs in a separate global scope and can't call that function).
        // Bit 49 of the transmitted value is a self-describing phase flag:
        // low half every sample (0-delay) unless the high half is
        // actually in use, in which case this instance alternates one
        // half per sample via a persistent phase counter.
        let heldKeysTransmitValue = this.midiKeyboardHeldKeysLowBitmask || 0;
        if (this.midiKeyboardHeldKeysHighBitmask) {
          this.midiKeyboardHeldKeysPhase = this.midiKeyboardHeldKeysPhase ? 0 : 1;
          if (this.midiKeyboardHeldKeysPhase) {
            heldKeysTransmitValue = (2 ** 49) + this.midiKeyboardHeldKeysHighBitmask;
          }
        }
        return {
          "1 Sample Gate": hasInput(nodeId, "Gate") ? gate : gatePulse,
          "0.1V/Oct": this.clampValue(midi / 120, 0, 1),
          Double: this.clampValue(midi / 127, 0, 1),
          Frequency: outputFrequency,
          Gate: Math.max(gate, hold),
          Increment: increment,
          Key: key,
          MIDI: midi,
          Pitch: midi,
          Q: q,
          X: x,
          Y: velocity,
          "Held Keys": heldKeysTransmitValue,
        };
      },
      buttonEvents: () => ({
        Click: this.externalButtonEventPulse("click"),
        Hover: this.externalButtonEventPulse("hover"),
        Down: this.externalButtonEventPulse("down"),
        Up: this.externalButtonEventPulse("up"),
        Enter: this.externalButtonEventPulse("enter"),
        Leave: this.externalButtonEventPulse("leave"),
      }),
      wireBreak: () => this.wireBreakEventSample(),
      wireConnect: () => this.wireConnectEventSample(),
      wireDisconnect: () => this.wireDisconnectEventSample(),
      windowReopen: () => this.windowReopenEventSample(),
      shootingStarExplosion: (node, nodeId, frame, frames, frameValues) => this.shootingStarExplosionEventSample(
        this.readEffectiveParameter(node, "lowRange", 0, frame, frames, frameValues),
        this.readEffectiveParameter(node, "highRange", 1, frame, frames, frameValues),
      ),
      nextPatch: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.patchCommandStates.get(nodeId) || this.createPatchCommandState();
        this.patchCommandStates.set(nodeId, state);
        return this.patchCommandTriggerSample(
          state,
          mixInput(nodeId, "Trigger"),
          this.readEffectiveParameter(node, "threshold", 0, frame, frames, frameValues),
          node?.type === "previousPatch" ? "previousPatch" : "nextPatch",
          nodeId,
        );
      },
      macroControls: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        const value = {};
        for (let index = 0; index < 8; index += 1) {
          const port = `M${index + 1} In`;
          value[`M${index + 1}`] = resetActive
            ? 0
            : this.clampValue(hasInput(nodeId, port)
              ? Number(mixInput(nodeId, port)) || 0
              : Number(this.macroControls?.[index]) || 0, 0, 1);
        }
        return value;
      },
      pitchModWheel: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const resetActive = hasInput(nodeId, "Reset") && Number(mixInput(nodeId, "Reset")) > 0;
        const pitchWheel = resetActive ? 0 : (hasInput(nodeId, "Pitch")
          ? Number(mixInput(nodeId, "Pitch")) || 0
          : Number(this.pitchModWheelSignal?.pitch));
        const modWheel = resetActive ? 0 : (hasInput(nodeId, "Mod")
          ? Number(mixInput(nodeId, "Mod")) || 0
          : Number(this.pitchModWheelSignal?.mod) || 0);
        return {
          "Mod Wheel": this.clampValue(modWheel, 0, 1),
          "Pitch Wheel": this.clampValue(Number.isFinite(pitchWheel) ? pitchWheel : 0, -1, 1),
        };
      },
      gain: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const gainAmount = this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues);
        const gainMono = mixInput(nodeId);
        return {
          Out: gainMono * gainAmount,
          Left: (mixInput(nodeId, "Left") + gainMono) * gainAmount,
          Right: (mixInput(nodeId, "Right") + gainMono) * gainAmount,
        };
      },
      led: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      bitConverter: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const bits = Math.max(1, Math.min(53, Math.round(
          this.readEffectiveParameter(node, "bits", 53, frame, frames, frameValues),
        )));
        const maxValue = 2 ** bits - 1;
        const fullScale = Math.max(0, Math.min(maxValue, Number(mixInput(nodeId, "Full Scale")) || 0));
        const unipolar = Math.max(0, Math.min(1, Number(mixInput(nodeId, "Unipolar")) || 0));
        const bipolar = Math.max(-1, Math.min(1, Number(mixInput(nodeId, "Bipolar")) || 0));
        return {
          "Full Scale to Unipolar": maxValue > 0 ? fullScale / maxValue : 0,
          "Full Scale to Bipolar": maxValue > 0 ? (fullScale / maxValue) * 2 - 1 : -1,
          "Unipolar to Full Scale": Math.round(unipolar * maxValue),
          "Bipolar to Full Scale": Math.round(((bipolar + 1) / 2) * maxValue),
        };
      },
      // Gain and Bias in one: scale, then offset. Mirror of the gainBias
      // branch in modules/gainBias/gain-bias-live-evaluator.js -- sibling
      // execution lanes, identical output for identical input.
      gainBias: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const gainBiasAmount = this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues);
        const gainBiasOffset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
        const gainBiasMono = mixInput(nodeId);
        return {
          Out: gainBiasMono * gainBiasAmount + gainBiasOffset,
          Left: (mixInput(nodeId, "Left") + gainBiasMono) * gainBiasAmount + gainBiasOffset,
          Right: (mixInput(nodeId, "Right") + gainBiasMono) * gainBiasAmount + gainBiasOffset,
        };
      },
      bias: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const biasOffset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
        const biasMono = mixInput(nodeId);
        return {
          Out: biasMono + biasOffset,
          Left: mixInput(nodeId, "Left") + biasMono + biasOffset,
          Right: mixInput(nodeId, "Right") + biasMono + biasOffset,
        };
      },
      softClipper: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const softClipperCenter = this.readEffectiveParameter(node, "center", 0, frame, frames, frameValues);
        const softClipperWidth = this.readEffectiveParameter(node, "width", 2, frame, frames, frameValues);
        const softClipperMono = mixInput(nodeId);
        return {
          Out: this.nativeSoftClipperSample(softClipperMono, softClipperCenter, softClipperWidth),
          Left: this.nativeSoftClipperSample(mixInput(nodeId, "Left") + softClipperMono, softClipperCenter, softClipperWidth),
          Right: this.nativeSoftClipperSample(mixInput(nodeId, "Right") + softClipperMono, softClipperCenter, softClipperWidth),
        };
      },
      rotate3dTo2d: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const angleX = this.readEffectiveParameter(node, "rotateX", 0, frame, frames, frameValues) * Math.PI * 2;
        const angleY = this.readEffectiveParameter(node, "rotateY", 0, frame, frames, frameValues) * Math.PI * 2;
        const angleZ = this.readEffectiveParameter(node, "rotateZ", 0, frame, frames, frameValues) * Math.PI * 2;
        let x = this.safeFilterNumber(mixInput(nodeId, "X"), null);
        let y = this.safeFilterNumber(mixInput(nodeId, "Y"), null);
        let z = this.safeFilterNumber(mixInput(nodeId, "Z"), null);
        const sinX = Math.sin(angleX);
        const cosX = Math.cos(angleX);
        const nextY = y * cosX - z * sinX;
        const nextZ = y * sinX + z * cosX;
        y = nextY;
        z = nextZ;
        const sinY = Math.sin(angleY);
        const cosY = Math.cos(angleY);
        const nextX = x * cosY + z * sinY;
        z = -x * sinY + z * cosY;
        x = nextX;
        const sinZ = Math.sin(angleZ);
        const cosZ = Math.cos(angleZ);
        return {
          X: this.safeFilterNumber(x * cosZ - y * sinZ, null),
          Y: this.safeFilterNumber(x * sinZ + y * cosZ, null),
        };
      },
      valueSlider: (node, nodeId, frame, frames, frameValues) => {
        const offset = this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues);
        return { Bias: offset, Out: offset, offset };
      },
      sandboxVisuals: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const screenShake = this.smoothVisualControl(
          "screenShake",
          this.visualControlIntensity(mixInput(nodeId, "Shake"), nodeId, "screen visuals shake"),
          safeRate,
        );
        const x = this.smoothVisualControl(
          "x",
          this.visualControlSigned(mixInput(nodeId, "X"), nodeId, "sandbox visuals x"),
          safeRate,
          0.045,
          -1,
          1,
        );
        const y = this.smoothVisualControl(
          "y",
          this.visualControlSigned(mixInput(nodeId, "Y"), nodeId, "sandbox visuals y"),
          safeRate,
          0.045,
          -1,
          1,
        );
        const screenDim = this.smoothVisualControl(
          "screenDim",
          this.visualControlIntensity(mixInput(nodeId, "Dim"), nodeId, "screen visuals dim"),
          safeRate,
        );
        const red = this.smoothVisualControl(
          "red",
          this.visualControlIntensity(mixInput(nodeId, "Red"), nodeId, "sandbox visuals red"),
          safeRate,
        );
        const green = this.smoothVisualControl(
          "green",
          this.visualControlIntensity(mixInput(nodeId, "Green"), nodeId, "sandbox visuals green"),
          safeRate,
        );
        const blue = this.smoothVisualControl(
          "blue",
          this.visualControlIntensity(mixInput(nodeId, "Blue"), nodeId, "sandbox visuals blue"),
          safeRate,
        );
        const scopeTracesOff = this.smoothVisualControl(
          "scopeTracesOff",
          this.visualControlIntensity(mixInput(nodeId, "Scope Off"), nodeId, "screen visuals scope off"),
          safeRate,
          0,
        );
        const scopePaused = this.smoothVisualControl(
          "scopePaused",
          this.visualControlIntensity(mixInput(nodeId, "Pause"), nodeId, "screen visuals pause"),
          safeRate,
          0,
        );
        return {
          Blue: blue,
          Green: green,
          Pause: scopePaused,
          Red: red,
          ScopeOff: scopeTracesOff,
          ScreenDim: screenDim,
          ScreenShake: screenShake,
          X: x,
          Y: y,
        };
      },
      screenSpaceShader: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => this.screenSpaceShaderSample(
        node,
        (port) => mixInput(nodeId, port),
        safeRate,
        nodeId,
      ),
      bloomGlow: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const screenDim = this.smoothVisualControl(
          "screenDim",
          read("screenDim", 0),
          safeRate,
        );
        const visualBrightness = this.smoothVisualControl(
          "visualBrightness",
          read("visualBrightness", 0.55),
          safeRate,
        );
        const visualBloom = this.smoothVisualControl(
          "visualBloom",
          read("visualBloom", 0.45),
          safeRate,
        );
        const visualGlow = this.smoothVisualControl(
          "visualGlow",
          read("visualGlow", 0.6),
          safeRate,
        );
        return {
          Bloom: visualBloom,
          Brightness: visualBrightness,
          Dim: screenDim,
          Glow: visualGlow,
        };
      },
      rgbaHsla: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const rgbRed = this.visualControlIntensity(mixInput(nodeId, "Red"), nodeId, "rgba hsla red");
        const rgbGreen = this.visualControlIntensity(mixInput(nodeId, "Green"), nodeId, "rgba hsla green");
        const rgbBlue = this.visualControlIntensity(mixInput(nodeId, "Blue"), nodeId, "rgba hsla blue");
        const hue = this.visualControlIntensity(mixInput(nodeId, "Hue"), nodeId, "rgba hsla hue");
        const saturation = this.visualControlIntensity(mixInput(nodeId, "Saturation"), nodeId, "rgba hsla saturation");
        const lightness = this.visualControlIntensity(mixInput(nodeId, "Lightness"), nodeId, "rgba hsla lightness");
        const hslMix = this.visualControlIntensity(mixInput(nodeId, "HSL Mix"), nodeId, "rgba hsla hsl mix");
        const hslRgb = this.visualHslToRgb(hue, saturation, lightness);
        const red = this.smoothVisualControl("red", rgbRed * (1 - hslMix) + hslRgb[0] * hslMix, safeRate);
        const green = this.smoothVisualControl("green", rgbGreen * (1 - hslMix) + hslRgb[1] * hslMix, safeRate);
        const blue = this.smoothVisualControl("blue", rgbBlue * (1 - hslMix) + hslRgb[2] * hslMix, safeRate);
        const alpha = this.smoothVisualControl(
          "screenDim",
          this.visualControlIntensity(mixInput(nodeId, "Alpha"), nodeId, "rgba hsla alpha"),
          safeRate,
        );
        return { Alpha: alpha, Blue: blue, Green: green, Red: red };
      },
      chromaColor: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const chromaHue = this.smoothVisualControl(
          "chromaHue",
          read("chromaHue", 0.58),
          safeRate,
        );
        const chromaSaturation = this.smoothVisualControl(
          "chromaSaturation",
          read("chromaSaturation", 0.82),
          safeRate,
        );
        const chromaLightness = this.smoothVisualControl(
          "chromaLightness",
          read("chromaLightness", 0.52),
          safeRate,
        );
        const chromaAlpha = this.smoothVisualControl(
          "chromaAlpha",
          read("chromaAlpha", 0.35),
          safeRate,
        );
        const chromaDrift = this.smoothVisualControl(
          "chromaDrift",
          read("chromaDrift", 0.25),
          safeRate,
        );
        const chromaSpread = this.smoothVisualControl(
          "chromaSpread",
          read("chromaSpread", 0.4),
          safeRate,
        );
        const visualBrightness = this.smoothVisualControl(
          "visualBrightness",
          read("visualBrightness", 0.55),
          safeRate,
        );
        const visualBloom = this.smoothVisualControl(
          "visualBloom",
          read("visualBloom", 0.45),
          safeRate,
        );
        const visualGlow = this.smoothVisualControl(
          "visualGlow",
          read("visualGlow", 0.6),
          safeRate,
        );
        return {
          Alpha: chromaAlpha,
          Bloom: visualBloom,
          Chroma: chromaSaturation,
          Drift: chromaDrift,
          Glow: visualGlow,
          Hue: chromaHue,
          Light: chromaLightness,
          Spread: chromaSpread,
          TraceBrightness: visualBrightness,
        };
      },
      badvalMonitor: (node, nodeId, frame, frames, frameValues, mixInput) => this.monitorBadValueSample(mixInput(nodeId), nodeId),
      speakerProtection: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const speakerProtectionMono = mixInput(nodeId);
        return {
          Out: this.speakerProtectionSample(speakerProtectionMono, nodeId),
          Left: this.speakerProtectionSample(mixInput(nodeId, "Left") + speakerProtectionMono, nodeId),
          Right: this.speakerProtectionSample(mixInput(nodeId, "Right") + speakerProtectionMono, nodeId),
        };
      },
      groupOutput: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: mixInput(nodeId, "In"),
      }),
      clapPlugin: () => ({
        Left: 0,
        Right: 0,
      }),
      output: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const outputMonoIn = mixInput(nodeId, "Mono");
        const outputLeftIn = mixInput(nodeId, "Left");
        const outputRightIn = mixInput(nodeId, "Right");
        return {
          Left: outputMonoIn + outputLeftIn,
          Out: outputMonoIn + (outputLeftIn + outputRightIn) * 0.5,
          Right: outputMonoIn + outputRightIn,
        };
      },
      groupInput: (node, nodeId) => ({
        Out: Number(this.externalGroupInputs?.get(nodeId)) || 0,
      }),
      audioPlayer: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const readParam = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.audioPlayerSample(
          node,
          nodeId,
          (port) => mixInput(nodeId, port),
          readParam,
          safeRate,
        );
      },
      moduleGroup: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame) => this.evaluateModuleGroup(node, mixInput, frame, frames, safeRate, inputFrame),
      codeblock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame) => this.evaluateCodeblock(node, mixInput, frame, frames, safeRate, inputFrame),
      osc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.polyBlepOscillatorWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      polyBlep: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.polyBlepOscillatorWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      blit: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.polyBlepOscillatorWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      graph2: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue, graphOutputValue) =>
        graphOutputValue(node, nodeId),
      graphCopy: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue, graphOutputValue) =>
        graphOutputValue(node, nodeId),
      additiveOsc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue) =>
        this.additiveOscWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate, graphInputValue),
      gpuAdditiveOsc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue) =>
        this.additiveOscWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate, graphInputValue),
      ellipsoid: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.ellipsoidWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      sineWavetable: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.sineWavetableWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
      metallicRatio: (node, nodeId, frame, frames, frameValues) => ({
        Ratio: this.metallicRatioSample(
          this.readEffectiveParameter(node, "index", 1, frame, frames, frameValues),
        ),
      }),
      radar: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.radarStates.get(nodeId) || this.createRadarState();
        this.radarStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const radar = this.radarSample(state, {
          density: read("density", 1),
          direction: read("direction", 0),
          fade: read("fade", 1),
          frequency: read("frequency", 1),
          frontring: read("frontring", 0),
          inner: read("inner", 0),
          lap: read("lap", 0),
          length: read("length", 1),
          phaseInv: read("phaseInv", 0),
          phaseOffset: read("phaseOffset", 0),
          pow1Down: read("pow1Down", 0),
          pow1Up: read("pow1Up", 0),
          pow2Bend: read("pow2Bend", 0),
          ratio: read("ratio", 0),
          reset: mixInput(nodeId, "Reset"),
          ringcut: read("ringcut", 0),
          rotation: read("rotation", 0),
          sampleRate: safeRate,
          shade: read("shade", 1),
          sharp: read("sharp", 0),
          spiralReturn: read("spiralReturn", 0),
          tunnelInv: read("tunnelInv", 0),
          x: read("x", 0),
          y: read("y", 0),
          zDepth: read("zDepth", 0),
          zoom: read("zoom", 0),
        });
        const radarLevel = read("level", 1);
        return {
          X: radar.x * radarLevel,
          Y: radar.y * radarLevel,
        };
      },
      gainBiasMix: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.gainBiasMixStates.get(nodeId) || this.createGainBiasMixState();
        this.gainBiasMixStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.gainBiasMixSample(state, {
          bias1: read("bias1", 0),
          bias2: read("bias2", 0),
          bias3: read("bias3", 0),
          bias4: read("bias4", 0),
          bleed2to1: read("bleed2to1", 0),
          bleed3to1: read("bleed3to1", 0),
          bleed4to1: read("bleed4to1", 0),
          in1: mixInput(nodeId, "In1"),
          in2: mixInput(nodeId, "In2"),
          in3: mixInput(nodeId, "In3"),
          in4: mixInput(nodeId, "In4"),
          volume1: read("volume1", 1),
          volume2: read("volume2", 1),
          volume3: read("volume3", 1),
          volume4: read("volume4", 1),
        }, nodeId);
      },
      sinc: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.sincStates.get(nodeId) || this.createSincState();
        this.sincStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const baseFreq = Math.max(0, read("freq", 100));
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote) ? this.pitchReferenceMidiNote : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const pitchInput = this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"))
          ? this.clampValue(this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null), -1, 1)
          : referenceVoltage;
        return this.sincSample(state, {
          freq: Math.max(0, baseFreq * (2 ** ((pitchInput - referenceVoltage) / 0.1))),
          phase: read("phase", 0),
          lobes: read("lobes", 4),
          bandLimit: read("bandLimit", 1),
        }, nodeId);
      },
    };
  }


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


  // RobinSupersaw -- see native_modules/robin_supersaw/robin_supersaw.cpp
  // for the full derivation (Robin Schmidt's pitch dithering,
  // RobinSchmidt/RS-MET). This worklet's JS fallback is fully self-
  // contained (not calling the shared public/node-graph-robin-supersaw.js
  // globals) -- the AudioWorkletProcessor runs in its own isolated global
  // scope that never loads that file. Calling those globals here silently
  // threw a ReferenceError inside the audio thread whenever the native
  // path wasn't active, producing total silence with no visible console
  // error -- the same pitfall DSF Oscillator's fallback already avoids by
  // inlining its own copy instead of sharing one.


  destroyRobinSupersawNativeState(state) {
    if (state?.nativeHandle && this.nativeRobinSupersaw?.soemdsp_robin_supersaw_destroy) {
      this.nativeRobinSupersaw.soemdsp_robin_supersaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
  }

  // rsPitchDitherOsc<T>::calcCycleDistribution(), transcribed.

  // rsPitchDitherOsc<T>::updateCycleLength(), transcribed.

  // rsPitchDitherOsc<T>::getSamplePhasor() + updateSampleCount(), transcribed.




  // Hypersaw -- see native_modules/hypersaw/hypersaw.cpp for the full
  // derivation (a proof-of-concept port of soundemote's own
  // HypersawUnit/HypersawMaster, docs/reference/Hypersaw.hpp). Fully
  // self-contained JS fallback for the same isolated-worklet-scope reason
  // as RobinSupersaw above -- never calls the shared
  // public/node-graph-hypersaw.js globals, which this worklet's isolated
  // scope never loads.





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

  // Advances each voice's phase accumulator + drift/dispersion exactly
  // once per sample() call and returns the per-voice sawtooth samples
  // plus the post-dispersion renderPhase array (used to drive the
  // phosphor-burn display). Factored out of hypersawSampleJs so the
  // native-audio path below can call it too (advancing this JS shadow
  // state purely for the display, in parallel with native's own opaque
  // internal state) without duplicating -- and thereby double-stepping --
  // the phase math.












  evaluateFrame(frame, frames, inputs = [], rate = this.engineSampleRate || sampleRate, inputFrame = frame) {
    const safeRate = Math.max(1, Number(rate) || sampleRate || 44100);
    // Advance free-running sample clock used by graph LFO Rate mode.
    this.absoluteFrame = (Number(this.absoluteFrame) || 0) + 1;
    const frameValues = new Map();
    const mixInput = (nodeId, port = "In") => {
      const base = (
        this.inputConnections.get(this.inputKey(nodeId, port)) || []
      ).reduce((sum, connection) => sum + this.readRuntimePortOutput(
        frameValues,
        connection.sourceNode,
        connection.sourcePort,
        frame,
        frames,
      ), 0);
      const triggerKey = this.inputKey(nodeId, port);
      if (this.inputWireBreakTriggers.has(triggerKey)) {
        this.inputWireBreakTriggers.delete(triggerKey);
        return base + 1;
      }
      return base;
    };
    const hasInput = (nodeId, port) => this.inputConnections.has(this.inputKey(nodeId, port));
    const incomingClockRate = (nodeId) => {
      const connection = (this.inputConnections.get(this.inputKey(nodeId, "Clock")) || [])[0];
      const sourceNode = this.nodes.get(connection?.sourceNode);
      return sourceNode?.type === "clock"
        ? Math.max(0, Number(sourceNode.params?.rate) || 0)
        : 0;
    };
    // Map a raw control input from [inputMin, inputMax] into the graph's unit
    // domain [0, 1]. Equal endpoints fall back to 0 so a zero-width range does
    // not produce NaN; result is not clamped so wrap/phase can still loop.
    const graphMapInputToUnit = (raw, inputMin, inputMax) => {
      const min = Number(inputMin);
      const max = Number(inputMax);
      const lo = Number.isFinite(min) ? min : 0;
      const hi = Number.isFinite(max) ? max : 1;
      const span = hi - lo;
      if (Math.abs(span) < 1e-12) {
        return 0;
      }
      return ((Number(raw) || 0) - lo) / span;
    };
    const graphSampleX = (node, nodeId) => {
      const mode = Math.round(this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues));
      const phaseValue = this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues);
      // Phase is always a pure time/position offset: same loop, just starts
      // reading at phase instead of 0.
      if (mode <= 0) {
        const inputMin = this.readEffectiveParameter(node, "inputMin", 0, frame, frames, frameValues);
        const inputMax = this.readEffectiveParameter(node, "inputMax", 1, frame, frames, frameValues);
        return this.wrapValue(
          graphMapInputToUnit(mixInput(nodeId), inputMin, inputMax) + phaseValue,
          0,
          1,
        );
      }
      const rateValue = Math.max(0, this.readEffectiveParameter(node, "rate", 1, frame, frames, frameValues));
      const state = this.graphLfoStates.get(nodeId) || this.createGraphLfoState();
      this.graphLfoStates.set(nodeId, state);
      const resetValue = 0;
      const currentFrame = Number(this.absoluteFrame) || 0;
      if (state.lastReset <= 0 && resetValue > 0) {
        state.resetFrame = currentFrame;
      }
      state.lastReset = resetValue;
      const resetFrame = Number.isFinite(state.resetFrame) ? state.resetFrame : 0;
      return this.wrapValue(((currentFrame - resetFrame) / safeRate) * rateValue + phaseValue, 0, 1);
    };
    const graphOutputValue = (node, nodeId) => {
      const sampleX = graphSampleX(node, nodeId);
      const nodeTension = Number(node?.params?.tension) ?? 1;
      const normalizedValue = this.graphValueAt(this.graphForNode(node), sampleX, this.graphSmoothingModeForNode(node), nodeTension);
      const outputMin = this.readEffectiveParameter(node, "outputMin", 0, frame, frames, frameValues);
      const outputMax = this.readEffectiveParameter(node, "outputMax", 1, frame, frames, frameValues);
      return {
        Out: outputMin + normalizedValue * (outputMax - outputMin),
        // Live playhead on the graph editor reads this port.
        __GraphPhase: sampleX,
      };
    };
    const graphInputValue = (nodeId, graphInput, x, fallback) => {
      const connection = (this.graphInputConnections.get(this.graphInputKey(nodeId, graphInput)) || [])[0];
      const source = connection ? this.nodes.get(connection.sourceNode) : null;
      if (!source || (source.type !== "graph2" && source.type !== "graphCopy")) {
        return fallback;
      }
      return this.graphValueAt(this.graphForNode(source), this.clampValue(Number(x) || 0, 0, 1), this.graphSmoothingModeForNode(source), Number(source?.params?.tension) ?? 1);
    };

    for (const nodeId of this.order) {
      const node = this.nodes.get(nodeId);
      let value = 0;
      const liveModuleEvaluator = node?.type ? this.liveModuleEvaluators[node.type] : null;
      if (liveModuleEvaluator) {
        value = liveModuleEvaluator(node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput, inputFrame, graphInputValue, graphOutputValue);
      } else if (node?.type === "audioInput") {
        const input = inputs[0] || [];
        const leftChannel = input[0] || input[1] || null;
        const rightChannel = input[1] || input[0] || null;
        const left = Number(leftChannel?.[inputFrame]) || 0;
        const right = Number(rightChannel?.[inputFrame]) || left;
        const level = this.readEffectiveParameter(node, "level", 1, frame, frames, frameValues);
        value = {
          Left: left * level,
          Out: ((left + right) * 0.5) * level,
          Right: right * level,
        };
      }
      frameValues.set(nodeId, value);
      this.nodeOutputs.set(nodeId, value);
    }

    const outputNode = this.nodes.get(this.outputNode || "output");
    const outputVolume = outputNode
      ? this.readEffectiveParameter(outputNode, "volume", 0.1, frame, frames, frameValues)
      : 1;

    const outputMono = mixInput(this.outputNode || "output", "Mono");
    this.currentFrameValues = frameValues;
    return {
      left: (outputMono + mixInput(this.outputNode || "output", "Left")) * outputVolume,
      right: (outputMono + mixInput(this.outputNode || "output", "Right")) * outputVolume,
    };
  }

  process(inputs, outputs) {
    const blockStartedAt = globalThis.performance?.now?.() || 0;
    const output = outputs[0] || [];
    const frames = output[0]?.length || 128;
    const input = inputs[0] || [];
    const oversamplingRatio = Math.max(1, Math.min(4, Math.round(this.oversamplingRatio) || 1));
    const rawEngineSampleRate = Math.max(1, this.engineSampleRate || sampleRate || 44100);
    const effectiveRate = Math.max(1, rawEngineSampleRate * Math.max(0, this.speedMultiplier ?? 1));
    const engineFrames = frames * oversamplingRatio;
    // Speed 0 = pause: fill silence and return immediately.
    if (this.speedMultiplier === 0) {
      for (const channel of output) {
        channel.fill(0);
      }
      return true;
    }
    if (!this.nodes.size || !this.order.length) {
      for (const channel of output) {
        channel.fill(0);
      }
      return true;
    }

    for (let frame = 0; frame < frames; frame += 1) {
      const inputLeft = Number(input[0]?.[frame]) || 0;
      const inputRight = Number(input[1]?.[frame]) || inputLeft;
      this.inputMeterPeak = Math.max(this.inputMeterPeak, Math.abs(inputLeft), Math.abs(inputRight));
      this.inputMeterSquareSum += (inputLeft * inputLeft + inputRight * inputRight) * 0.5;
      this.inputMeterSamples += 1;
      let leftSum = 0;
      let rightSum = 0;
      let decimatedLeft = 0;
      let decimatedRight = 0;
      const useRaptEllipticDecimator = oversamplingRatio === 4;
      for (let subframe = 0; subframe < oversamplingRatio; subframe += 1) {
        const engineFrame = frame * oversamplingRatio + subframe;
        const subframeOutput = this.evaluateFrame(engineFrame, engineFrames, inputs, effectiveRate, frame);
        if (useRaptEllipticDecimator) {
          decimatedLeft = this.processRaptEllipticDecimatorSample(
            subframeOutput.left,
            this.raptEllipticDecimatorLeft,
          );
          decimatedRight = this.processRaptEllipticDecimatorSample(
            subframeOutput.right,
            this.raptEllipticDecimatorRight,
          );
        } else {
          leftSum += subframeOutput.left;
          rightSum += subframeOutput.right;
        }
        this.captureModuleScopeFrame(this.currentFrameValues, engineFrame, engineFrames);
        this.scopeCounter += 1;
        if (this.scopeCounter >= Math.max(1, Math.floor(effectiveRate / 30))) {
          this.scopeCounter = 0;
          this.postModuleScopeSnapshot();
        }
        this.visualControlCounter += 1;
        if (this.visualControlCounter >= Math.max(1, Math.floor(effectiveRate / 30))) {
          this.visualControlCounter = 0;
          this.postVisualControls();
        }
      }
      const frameOutput = {
        left: useRaptEllipticDecimator ? decimatedLeft : leftSum / oversamplingRatio,
        right: useRaptEllipticDecimator ? decimatedRight : rightSum / oversamplingRatio,
      };
      if (this.outputSampleClipped(frameOutput.left)) {
        this.meterClipCount += 1;
      }
      if (this.outputSampleClipped(frameOutput.right)) {
        this.meterClipCount += 1;
      }
      if (
        this.outputSampleTripsEarProtection(frameOutput.left) ||
        this.outputSampleTripsEarProtection(frameOutput.right)
      ) {
        this.meterProtectionMuteCount += 1;
        this.speakerProtectionPeak = Math.max(
          Number(this.speakerProtectionPeak) || 0,
          Number.isFinite(Number(frameOutput.left)) ? Math.abs(Number(frameOutput.left)) : Infinity,
          Number.isFinite(Number(frameOutput.right)) ? Math.abs(Number(frameOutput.right)) : Infinity,
        );
        this.speakerProtectionNodeId = "output";
        for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
          output[channelIndex][frame] = 0;
        }
        continue;
      }
      const protectedFrame = this.earProtector.protect(frameOutput.left, frameOutput.right);
      if (protectedFrame.muted) {
        this.meterProtectionMuteCount += 1;
      }
      const left = this.clampValue(protectedFrame.left, -0.95, 0.95);
      const right = this.clampValue(protectedFrame.right, -0.95, 0.95);
      this.meterPeak = Math.max(this.meterPeak, Math.abs(left), Math.abs(right));
      this.meterSquareSum += (left * left + right * right) * 0.5;
      this.meterSamples += 1;
      this.gpuAdditiveStatusCounter += 1;
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex][frame] = channelIndex === 0 ? left : right;
      }
    }
    this.finishSmoothing();
    if (blockStartedAt > 0) {
      const elapsedMs = Math.max(0, (globalThis.performance?.now?.() || blockStartedAt) - blockStartedAt);
      const blockBudgetMs = (frames / Math.max(1, sampleRate || this.hostSampleRate || 44100)) * 1000;
      const budgetRatio = blockBudgetMs > 0 ? elapsedMs / blockBudgetMs : 0;
      this.maxBlockProcessMs = Math.max(Number(this.maxBlockProcessMs) || 0, elapsedMs);
      this.maxBlockBudgetRatio = Math.max(Number(this.maxBlockBudgetRatio) || 0, budgetRatio);
      if (budgetRatio >= 0.85) {
        this.meterOverrunCount += 1;
      }
    }
    this.meterCounter += frames;
    if (this.meterCounter >= sampleRate / 60) {
      this.port.postMessage({
        audioPlayerNodeId: this.audioPlayerMeterNodeId || this.audioPlayerNodeIds[0] || "",
        audioPlayerNodeIds: [...this.audioPlayerNodeIds],
        audioPlayerPeak: this.audioPlayerMeterPeak,
        audioPlayerPhase: this.audioPlayerMeterPhase,
        audioPlayerReason: this.audioPlayerMeterReason,
        audioPlayerSamples: this.audioPlayerMeterSamples,
        clipCount: this.meterClipCount,
        badNumberCount: this.badNumberCount,
        lastBadValueReason: this.lastBadValueReason,
        lastBadValueNodeId: this.lastBadValueNodeId,
        lastBadValueSource: this.lastBadValueSource,
        inputPeak: this.inputMeterPeak,
        inputRms: Math.sqrt(this.inputMeterSquareSum / Math.max(1, this.inputMeterSamples)),
        maxBlockBudgetRatio: this.maxBlockBudgetRatio,
        maxBlockProcessMs: this.maxBlockProcessMs,
        overrunCount: this.meterOverrunCount,
        peak: this.meterPeak,
        protectionNodeId: this.speakerProtectionNodeId || "",
        protectionPeak: Number(this.speakerProtectionPeak) || 0,
        protectionMuteCount: this.meterProtectionMuteCount,
        sessionId: this.sessionId,
        rms: Math.sqrt(this.meterSquareSum / Math.max(1, this.meterSamples)),
        type: "meter",
      });
      this.meterCounter = 0;
      this.inputMeterPeak = 0;
      this.audioPlayerMeterNodeId = "";
      this.audioPlayerMeterPeak = 0;
      this.audioPlayerMeterPhase = 0;
      this.audioPlayerMeterReason = "";
      this.audioPlayerMeterSamples = 0;
      this.inputMeterSamples = 0;
      this.inputMeterSquareSum = 0;
      this.meterClipCount = 0;
      this.badNumberCount = 0;
      this.maxBlockProcessMs = 0;
      this.maxBlockBudgetRatio = 0;
      this.meterOverrunCount = 0;
      this.lastBadValueReason = "";
      this.lastBadValueNodeId = "";
      this.lastBadValueSource = "";
      this.meterPeak = 0;
      this.meterProtectionMuteCount = 0;
      this.speakerProtectionNodeId = "";
      this.speakerProtectionPeak = 0;
      this.meterSamples = 0;
      this.meterSquareSum = 0;
    }
    if (this.gpuAdditiveStatusCounter >= sampleRate / 20) {
      this.gpuAdditiveStatusCounter = 0;
      this.postGpuAdditiveStatus();
    }
    return true;
  }
}
