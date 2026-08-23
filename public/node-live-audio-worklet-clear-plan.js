// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: clearPlan — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.clearPlan = function clearPlan() {
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
    this.attackDecayStates = new Map();
    for (const state of this.fractalBrownianNoiseStates.values()) {
      this.destroyFbmNativeState(state);
    }
    this.fractalBrownianNoiseStates = new Map();
    for (const state of this.fbmFieldStates.values()) {
      this.destroyFbmFieldNativeState?.(state);
    }
    this.fbmFieldStates = new Map();
    this.rgbFractalStates = new Map();
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
    if (this.activeFilterStates) {
      for (const state of this.activeFilterStates.values()) {
        this.destroyStereoFilterNativeState(state, (s) => this.destroyActiveFilterNativeState(s));
      }
    }
    this.activeFilterStates = new Map();
    for (const sci of [
      ["butterworthStates", "butterworth"],
      ["linkwitzRileyStates", "linkwitzRiley"],
      ["besselStates", "bessel"],
      ["chebyshevStates", "chebyshev"],
      ["ellipticStates", "elliptic"],
    ]) {
      const map = this[sci[0]];
      if (map) {
        for (const state of map.values()) {
          this.destroyStereoFilterNativeState(state, (s) => this.destroyScientificIirNativeState?.(sci[1], s));
        }
      }
      this[sci[0]] = new Map();
    }
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
    this.stftBlurStates = new Map();
    this.softpopOscillatorStates = new Map();
    this.sinepulseStates = new Map();
    this.kickEnvelopeStates = new Map();
    this.sineKickStates = new Map();
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
    this.noiseDetectorStates = new Map();
    this.speedColorInertiaStates = new Map();
    this.inertialFilterStates = new Map();
    this.tiltFilterStates = new Map();
    this.eqFilterStates = new Map();
    for (const state of this.sampleDelayStates.values()) {
      this.destroySampleDelayNativeState(state);
    }
    this.sampleDelayStates = new Map();
    for (const state of this.minMaxStates.values()) {
      this.destroyMinMaxNativeState(state);
    }
    this.minMaxStates = new Map();
    this.robinSinusoidStates = new Map();
    this.phoneToneStates = new Map();
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
    this.pluckEnvelopeStates = new Map();
    for (const state of this.randomClockStates.values()) {
      this.destroyRandomClockNativeState(state);
    }
    this.randomClockStates = new Map();
    for (const state of this.reverbEffectStates.values()) {
      this.destroySabrinaReverbState(state);
    }
    this.reverbEffectStates = new Map();
    if (this.soemReverbStates) {
      for (const state of this.soemReverbStates.values()) {
        if (state?.nativeHandle && this.nativeSoemReverb?.soemdsp_soem_reverb_destroy) {
          this.nativeSoemReverb.soemdsp_soem_reverb_destroy(state.nativeHandle);
        }
      }
      this.soemReverbStates = new Map();
    }
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
    this.airClipperStates = new Map();
    this.scopeBuffers = new Map();
    this.scopeCounter = 0;
    this.scopeSnapshotCounter = 0;
    this.destroyAllPapoulisParameterSmootherNativeStates?.();
    this.smoothers = new Map();
    this.activeSmoothers = [];
    this.activeSmootherKeys = new Set();
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
    this.keypadStates = new Map();
    this.polyBlepStates = new Map();
    this.visualSinks = [];
    this.resetVisualControls();
};
