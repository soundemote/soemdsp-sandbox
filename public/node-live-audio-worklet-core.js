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
    this.attackDecayStates = new Map();
    this.ellipsoidOutputFrames = new Map();
    this.nativeEllipsoid = null;
    this.nativeEllipsoidReady = false;
    this.nativeSabrinaReverb = null;
    this.nativeSabrinaReverbReady = false;
    this.nativeSoemReverb = null;
    this.nativeSoemReverbReady = false;
    this.soemReverbStates = new Map();
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
    this.nativeFbmField = null;
    this.nativeFbmFieldReady = false;
    this.nativeLadderFilter = null;
    this.nativeLadderFilterReady = false;
    this.nativeFlowerChildFilter = null;
    this.nativeFlowerChildFilterReady = false;
    this.nativeActiveFilter = null;
    this.nativeActiveFilterReady = false;
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
    this.fbmFieldStates = new Map();
    this.rgbFractalStates = new Map();
    this.graphInputConnections = new Map();
    this.gpuAdditiveQueues = new Map();
    this.gpuAdditiveStatusCounter = 0;
    this.gpuAdditiveUnderruns = 0;
    this.flowerChildEnvelopeFollowerStates = new Map();
    this.flowerChildFilterStates = new Map();
    this.activeFilterStates = new Map();
    this.butterworthStates = new Map();
    this.linkwitzRileyStates = new Map();
    this.besselStates = new Map();
    this.chebyshevStates = new Map();
    this.ellipticStates = new Map();
    this.bandpassStates = new Map();
    this.allpassStates = new Map();
    this.crossover2States = new Map();
    this.crossover3States = new Map();
    this.crossover4States = new Map();
    this.crossover5States = new Map();
    this.crossover6States = new Map();
    this.modeResonatorStates = new Map();
    this.combResonatorStates = new Map();
    this.waveguideStates = new Map();
    this.phaseDisperseStates = new Map();
    this.bodeStates = new Map();
    this.softpopOscillatorStates = new Map();
    this.nativeButterworth = null;
    this.nativeButterworthReady = false;
    this.nativeLinkwitzRiley = null;
    this.nativeLinkwitzRileyReady = false;
    this.nativeBessel = null;
    this.nativeBesselReady = false;
    this.nativeChebyshev = null;
    this.nativeChebyshevReady = false;
    this.nativeElliptic = null;
    this.nativeEllipticReady = false;
    this.yellowjacketFilterStates = new Map();
    this.superloveFilterStates = new Map();
    this.chaoticPhaseLockingFilterStates = new Map();
    this.resonatorFilterStates = new Map();
    this.humanFilterStates = new Map();
    this.pulseExplosionStates = new Map();
    this.comparatorStates = new Map();
    this.speedColorInertiaStates = new Map();
    this.inertialFilterStates = new Map();
    this.tiltFilterStates = new Map();
    this.eqFilterStates = new Map();
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
    this.nativeSinc = null;
    this.nativeSincReady = false;
    this.nativeSoftwave = null;
    this.nativeSoftwaveReady = false;
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

  // Phase D: all other methods live on NodeLiveAudioProcessor.prototype in
  // sibling node-live-audio-worklet-*.js files loaded after this class in the
  // worklet Blob (graph, smoother, events, dsp-state, evaluators, process, …).

}
