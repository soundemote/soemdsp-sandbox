// Extracted cluster of buildLiveModuleEvaluators map entries (Phase D navigation split).
// Behavior must match the prior monolith bit-for-bit.

NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators_processors = function buildLiveModuleEvaluators_processors() {
  return {
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
          this.readEffectiveParameter(node, "sharpness", 0.5, frame, frames, frameValues),
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
      activeFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.activeFilterStates) {
          this.activeFilterStates = new Map();
        }
        const state = this.activeFilterStates.get(nodeId) || this.createStereoActiveFilterState();
        this.activeFilterStates.set(nodeId, state);
        const activeParams = {
          feedbackCircuit: this.readEffectiveParameter(node, "feedbackCircuit", 3, frame, frames, frameValues),
          frequency: this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues),
          gainCompensation: this.readEffectiveParameter(node, "gainCompensation", 1, frame, frames, frameValues),
          mode: this.readEffectiveParameter(node, "mode", 3, frame, frames, frameValues),
          resonance: this.readEffectiveParameter(node, "resonance", 0.2, frame, frames, frameValues),
        };
        const activeMono = mixInput(nodeId);
        return {
          Out: this.activeFilterSample(state.mono, activeMono, activeParams, safeRate),
          Left: this.activeFilterSample(state.left, mixInput(nodeId, "Left") + activeMono, activeParams, safeRate),
          Right: this.activeFilterSample(state.right, mixInput(nodeId, "Right") + activeMono, activeParams, safeRate),
        };
      },
      butterworth: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.butterworthStates) this.butterworthStates = new Map();
        const state = this.butterworthStates.get(nodeId) || this.createStereoScientificIirState();
        this.butterworthStates.set(nodeId, state);
        const mode = this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues);
        const frequency = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const order = this.readEffectiveParameter(node, "order", 4, frame, frames, frameValues);
        const bandwidth = this.readEffectiveParameter(node, "bandwidth", 1, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("butterworth", 0, ch, x, mode, frequency, order, bandwidth, 1, safeRate);
        return { Out: run(state.mono, mono), Left: run(state.left, mixInput(nodeId, "Left") + mono), Right: run(state.right, mixInput(nodeId, "Right") + mono) };
      },
      linkwitzRiley: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.linkwitzRileyStates) this.linkwitzRileyStates = new Map();
        const state = this.linkwitzRileyStates.get(nodeId) || this.createStereoScientificIirState();
        this.linkwitzRileyStates.set(nodeId, state);
        const mode = this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues);
        const frequency = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const order = this.readEffectiveParameter(node, "order", 4, frame, frames, frameValues);
        const bandwidth = this.readEffectiveParameter(node, "bandwidth", 1, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("linkwitzRiley", 1, ch, x, mode, frequency, order, bandwidth, 1, safeRate);
        return { Out: run(state.mono, mono), Left: run(state.left, mixInput(nodeId, "Left") + mono), Right: run(state.right, mixInput(nodeId, "Right") + mono) };
      },
      bessel: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.besselStates) this.besselStates = new Map();
        const state = this.besselStates.get(nodeId) || this.createStereoScientificIirState();
        this.besselStates.set(nodeId, state);
        const mode = this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues);
        const frequency = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const order = this.readEffectiveParameter(node, "order", 4, frame, frames, frameValues);
        const bandwidth = this.readEffectiveParameter(node, "bandwidth", 1, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("bessel", 2, ch, x, mode, frequency, order, bandwidth, 1, safeRate);
        return { Out: run(state.mono, mono), Left: run(state.left, mixInput(nodeId, "Left") + mono), Right: run(state.right, mixInput(nodeId, "Right") + mono) };
      },
      chebyshev: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.chebyshevStates) this.chebyshevStates = new Map();
        const state = this.chebyshevStates.get(nodeId) || this.createStereoScientificIirState();
        this.chebyshevStates.set(nodeId, state);
        const mode = this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues);
        const frequency = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const order = this.readEffectiveParameter(node, "order", 4, frame, frames, frameValues);
        const bandwidth = this.readEffectiveParameter(node, "bandwidth", 1, frame, frames, frameValues);
        const ripple = this.readEffectiveParameter(node, "ripple", 1, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("chebyshev", 3, ch, x, mode, frequency, order, bandwidth, ripple, safeRate);
        return { Out: run(state.mono, mono), Left: run(state.left, mixInput(nodeId, "Left") + mono), Right: run(state.right, mixInput(nodeId, "Right") + mono) };
      },
      elliptic: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.ellipticStates) this.ellipticStates = new Map();
        const state = this.ellipticStates.get(nodeId) || this.createStereoScientificIirState();
        this.ellipticStates.set(nodeId, state);
        const mode = this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues);
        const frequency = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const order = this.readEffectiveParameter(node, "order", 4, frame, frames, frameValues);
        const bandwidth = this.readEffectiveParameter(node, "bandwidth", 1, frame, frames, frameValues);
        const ripple = this.readEffectiveParameter(node, "ripple", 1, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("elliptic", 4, ch, x, mode, frequency, order, bandwidth, ripple, safeRate);
        return { Out: run(state.mono, mono), Left: run(state.left, mixInput(nodeId, "Left") + mono), Right: run(state.right, mixInput(nodeId, "Right") + mono) };
      },
      bandpass: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.bandpassStates) this.bandpassStates = new Map();
        const state = this.bandpassStates.get(nodeId) || this.createStereoBandpassState();
        this.bandpassStates.set(nodeId, state);
        const baseFreq = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const frequency = this.resolveSoftpopOrBandpassHz(node, nodeId, baseFreq, frame, frames, frameValues, mixInput);
        const q = this.readEffectiveParameter(node, "q", 1, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        return {
          Out: this.bandpassSample(state.mono, mono, frequency, q, safeRate),
          Left: this.bandpassSample(state.left, mixInput(nodeId, "Left") + mono, frequency, q, safeRate),
          Right: this.bandpassSample(state.right, mixInput(nodeId, "Right") + mono, frequency, q, safeRate),
        };
      },
      allpass: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.allpassStates) this.allpassStates = new Map();
        const state = this.allpassStates.get(nodeId) || this.createStereoAllpassState();
        this.allpassStates.set(nodeId, state);
        const baseFreq = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const frequency = this.resolveSoftpopOrBandpassHz(node, nodeId, baseFreq, frame, frames, frameValues, mixInput);
        const q = this.readEffectiveParameter(node, "q", 0.707, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        return {
          Out: this.allpassSample(state.mono, mono, frequency, q, safeRate),
          Left: this.allpassSample(state.left, mixInput(nodeId, "Left") + mono, frequency, q, safeRate),
          Right: this.allpassSample(state.right, mixInput(nodeId, "Right") + mono, frequency, q, safeRate),
        };
      },
      crossover2: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        return this.crossoverEvaluator(2, node, nodeId, frame, frames, frameValues, mixInput, safeRate);
      },
      crossover3: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        return this.crossoverEvaluator(3, node, nodeId, frame, frames, frameValues, mixInput, safeRate);
      },
      crossover4: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        return this.crossoverEvaluator(4, node, nodeId, frame, frames, frameValues, mixInput, safeRate);
      },
      crossover5: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        return this.crossoverEvaluator(5, node, nodeId, frame, frames, frameValues, mixInput, safeRate);
      },
      crossover6: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        return this.crossoverEvaluator(6, node, nodeId, frame, frames, frameValues, mixInput, safeRate);
      },
      modeResonator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.modeResonatorStates) this.modeResonatorStates = new Map();
        let state = this.modeResonatorStates.get(nodeId);
        if (!state) {
          state = this.createModeResonatorState();
          this.modeResonatorStates.set(nodeId, state);
        }
        const baseFreq = this.readEffectiveParameter(node, "frequency", 440, frame, frames, frameValues);
        const frequency = this.resolveSoftpopOrBandpassHz
          ? this.resolveSoftpopOrBandpassHz(node, nodeId, baseFreq, frame, frames, frameValues, mixInput)
          : baseFreq;
        const decay = this.readEffectiveParameter(node, "decay", 1, frame, frames, frameValues);
        const hold = Math.round(this.readEffectiveParameter(node, "hold", 0, frame, frames, frameValues)) !== 0;
        const amplitude = this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues);
        const audioIn = this.safeFilterNumber(mixInput(nodeId), null) ?? 0;
        const trig = this.modeResonatorTriggerEdge(state, mixInput(nodeId, "Trigger"));
        return this.modeResonatorSample(
          state,
          audioIn + trig,
          Math.max(0, frequency),
          decay,
          hold,
          amplitude,
          safeRate,
        );
      },
      combResonator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.combResonatorStates) this.combResonatorStates = new Map();
        let state = this.combResonatorStates.get(nodeId);
        if (!state) {
          state = this.createCombResonatorState();
          this.combResonatorStates.set(nodeId, state);
        }
        const baseFreq = this.readEffectiveParameter(node, "frequency", 110, frame, frames, frameValues);
        const frequency = this.resolveSoftpopOrBandpassHz
          ? this.resolveSoftpopOrBandpassHz(node, nodeId, baseFreq, frame, frames, frameValues, mixInput)
          : baseFreq;
        const decay = this.readEffectiveParameter(node, "decay", 1, frame, frames, frameValues);
        const hold = Math.round(this.readEffectiveParameter(node, "hold", 0, frame, frames, frameValues)) !== 0;
        const damping = this.readEffectiveParameter(node, "damping", 0, frame, frames, frameValues);
        const topology = Math.round(this.readEffectiveParameter(node, "topology", 0, frame, frames, frameValues));
        const invert = Math.round(this.readEffectiveParameter(node, "invert", 0, frame, frames, frameValues));
        const depth = this.readEffectiveParameter(node, "depth", 1, frame, frames, frameValues);
        const amplitude = this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues);
        const audioIn = this.safeFilterNumber(mixInput(nodeId), null) ?? 0;
        const trig = this.combResonatorTriggerEdge(state, mixInput(nodeId, "Trigger"));
        return this.combResonatorSample(
          state,
          audioIn + trig,
          Math.max(0, frequency),
          decay,
          hold,
          damping,
          topology,
          invert,
          depth,
          amplitude,
          safeRate,
        );
      },
      // Under construction: dry passthrough × Amplitude only.
      waveguide: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.waveguideStates) this.waveguideStates = new Map();
        let state = this.waveguideStates.get(nodeId);
        if (!state) {
          state = this.createWaveguideState();
          this.waveguideStates.set(nodeId, state);
        }
        const amplitude = this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues);
        const audioIn = this.safeFilterNumber(mixInput(nodeId), null) ?? 0;
        return this.waveguideSample(state, audioIn, amplitude);
      },
      // Under construction classic FX / spectral shells — dry passthrough.
      phaser: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.classicFxStubPassthrough(mixInput(nodeId)),
      flanger: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.classicFxStubPassthrough(mixInput(nodeId)),
      chorus: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.classicFxStubPassthrough(mixInput(nodeId)),
      stftBlur: (node, nodeId, frame, frames, frameValues, mixInput) => {
        if (!this.stftBlurStates) this.stftBlurStates = new Map();
        let state = this.stftBlurStates.get(nodeId);
        const fftSize = this.readEffectiveParameter(node, "fftSize", 2048, frame, frames, frameValues);
        const snap = typeof nodeGraphStftBlurSnapFftSize === "function"
          ? nodeGraphStftBlurSnapFftSize(fftSize)
          : 2048;
        if (!state || state.n !== snap) {
          state = this.createStftBlurState(fftSize);
          this.stftBlurStates.set(nodeId, state);
        }
        const blurTime = this.readEffectiveParameter(node, "blurTime", 0.5, frame, frames, frameValues);
        const blurFreq = this.readEffectiveParameter(node, "blurFreq", 0, frame, frames, frameValues);
        const mix = this.readEffectiveParameter(node, "mix", 1, frame, frames, frameValues);
        const audioIn = this.safeFilterNumber(mixInput(nodeId), null) ?? 0;
        return this.stftBlurSample(state, audioIn, blurTime, blurFreq, fftSize, mix);
      },
      phaseDisperse: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.phaseDisperseStates) this.phaseDisperseStates = new Map();
        let state = this.phaseDisperseStates.get(nodeId);
        if (!state) {
          state = this.createPhaseDisperseState();
          this.phaseDisperseStates.set(nodeId, state);
        }
        const frequency = this.readEffectiveParameter(node, "frequency", 100, frame, frames, frameValues);
        // Filters = cascade depth (CPU). Legacy Amount 0…1 still accepted.
        let filters = this.readEffectiveParameter(node, "filters", NaN, frame, frames, frameValues);
        if (!Number.isFinite(Number(filters))) {
          filters = this.readEffectiveParameter(node, "amount", 0.5, frame, frames, frameValues);
        }
        const pinch = this.readEffectiveParameter(node, "pinch", 0.5, frame, frames, frameValues);
        const audioIn = this.safeFilterNumber(mixInput(nodeId), null) ?? 0;
        return this.phaseDisperseSample(state, audioIn, frequency, filters, pinch, safeRate);
      },
      bode: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.bodeStates) this.bodeStates = new Map();
        let state = this.bodeStates.get(nodeId);
        if (!state) {
          state = this.createBodeState();
          this.bodeStates.set(nodeId, state);
        }
        const shift = this.readEffectiveParameter(node, "shift", 0, frame, frames, frameValues);
        const fine = this.readEffectiveParameter(node, "fine", 0, frame, frames, frameValues);
        const feedback = this.readEffectiveParameter(node, "feedback", 0, frame, frames, frameValues);
        const mix = this.readEffectiveParameter(node, "mix", 1, frame, frames, frameValues);
        const audioIn = this.safeFilterNumber(mixInput(nodeId), null) ?? 0;
        return this.bodeSample(state, audioIn, shift, fine, feedback, mix, safeRate);
      },
      formantFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const mono = mixInput(nodeId);
        return {
          Out: this.formantFilterSample(null, mono),
          Left: this.formantFilterSample(null, mixInput(nodeId, "Left") + mono),
          Right: this.formantFilterSample(null, mixInput(nodeId, "Right") + mono),
        };
      },
      binaryClock: () => this.binaryClockSample(),
      theremin: () => this.thereminSample(),
      osc: () => this.oscSample(),
      electroKick: () => this.electroKickSample(),
      electroSnare: () => this.electroSnareSample(),
      electroHat: () => this.electroHatSample(),
      wavetable2d: () => this.wavetable2dSample(),
      wavetable3d: () => this.wavetable3dSample(),
      pixelGrid: () => this.pixelGridSample(),
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
      comparator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.comparatorStates.get(nodeId) || this.createComparatorState();
        this.comparatorStates.set(nodeId, state);
        return this.comparatorSample(state, mixInput(nodeId, "In"));
      },
      sampleDelay: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.sampleDelayStates.get(nodeId) || this.createSampleDelayState();
        this.sampleDelayStates.set(nodeId, state);
        return this.sampleDelaySample(
          state,
          mixInput(nodeId, "In"),
          this.readEffectiveParameter(node, "time", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "samples", 0, frame, frames, frameValues),
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
        const normFromKnob = this.readEffectiveParameter(node, "normFreq", 0.1, frame, frames, frameValues);
        const normFreq = normFromKnob;
        return this.aliasSineSample(
          state,
          normFreq,
          this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues),
          safeRate,
        );
      },
      // RS-MET recursive free-running sine. Math: robin-sinusoid-math.js.
      robinSinusoid: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.robinSinusoidStates) {
          this.robinSinusoidStates = new Map();
        }
        const state = this.robinSinusoidStates.get(nodeId) || this.createRobinSinusoidState();
        this.robinSinusoidStates.set(nodeId, state);
        const freqKnob = this.readEffectiveParameter(node, "frequency", 440, frame, frames, frameValues);
        const frequency = freqKnob;
        const amp = this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues);
        const phaseCycle = this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues);
        const startPhase = (Number(phaseCycle) || 0) * Math.PI * 2;
        const resetIn = Number(mixInput(nodeId, "Reset")) || 0;
        const resetEdge = resetIn >= 0.5 && state.resetPrev < 0.5;
        state.resetPrev = resetIn;
        return {
          Out: this.robinSinusoidSample(state, frequency, amp, safeRate, startPhase, resetEdge),
        };
      },
      delayEffect: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.delayEffectStates.get(nodeId) || this.createStereoDelayEffectState();
        this.delayEffectStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        const legacyLevel = read("level", 1);
        const outLevelRead = read("outLevel", Number.NaN);
        const delayParams = {
          feedback: read("feedback", 0.25),
          inLevel: read("inLevel", 1),
          // Prefer outLevel; fall back to legacy Level for old patches.
          outLevel: Number.isFinite(outLevelRead) ? outLevelRead : legacyLevel,
          mix: read("mix", 0.35),
          modAmount: read("modAmount", 0.02),
          modRate: read("modRate", 0.1),
          modStyle: read("modStyle", 0),
          modVariation: read("modVariation", 0),
          time: read("time", 0.18),
          // 0 = linear, 1 = hermite (default hermite).
          interpolation: read("interpolation", 1),
        };
        // Mono In sums into both sides (not a third independent delay line).
        // Mix M = (Mix L + Mix R) * 0.5 — house mono-sum convention.
        const delayMono = mixInput(nodeId);
        const leftResult = this.delayEffectSample(
          state.left,
          mixInput(nodeId, "Left") + delayMono,
          delayParams,
          safeRate,
          `${nodeId}:left`,
        );
        const rightResult = this.delayEffectSample(
          state.right,
          mixInput(nodeId, "Right") + delayMono,
          delayParams,
          safeRate,
          `${nodeId}:right`,
        );
        const mixL = leftResult.Mix ?? leftResult.Out ?? 0;
        const mixR = rightResult.Mix ?? rightResult.Out ?? 0;
        const mixM = (mixL + mixR) * 0.5;
        return {
          Mix: mixM,
          Out: mixM,
          Left: mixL,
          Right: mixR,
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
            hpfFrequency: read("hpfFrequency", 20),
            // 0 = linear, 1 = hermite (default hermite).
            interpolation: read("interpolation", 1),
            level: read("level", 1),
            lfoRate: read("lfoRate", 0.35),
            lfoStyle: read("lfoStyle", 0),
            lfoVariation: read("lfoVariation", 0.25),
            lpfFrequency: read("lpfFrequency", 8000),
            mix: read("mix", 0.35),
            offsetMs: read("offsetMs", 0),
            saturate: read("saturate", 1),
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
      soemReverb: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) =>
        this.soemReverbWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput),
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
            windowSize: read("windowSize", 1024),
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
        const slewShape = this.readEffectiveParameter(node, "shape", 0, frame, frames, frameValues);
        const slewMono = mixInput(nodeId);
        return {
          Out: this.slewLimiterSample(state.mono, slewMono, slewUpTime, slewDownTime, safeRate, slewShape),
          Left: this.slewLimiterSample(state.left, mixInput(nodeId, "Left") + slewMono, slewUpTime, slewDownTime, safeRate, slewShape),
          Right: this.slewLimiterSample(state.right, mixInput(nodeId, "Right") + slewMono, slewUpTime, slewDownTime, safeRate, slewShape),
        };
      },
      // Stereo → Mid/Side (0.5 matrix). Math: mid-side-encode-math.js.
      midSideEncode: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.midSideEncodeSample(
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          this.readEffectiveParameter(node, "midGain", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "sideGain", 1, frame, frames, frameValues),
        ),
      // IIR quadrature I/Q. Math: quadrature-math.js.
      quadrature: (node, nodeId, frame, frames, frameValues, mixInput) => {
        if (!this.quadratureStates) {
          this.quadratureStates = new Map();
        }
        const state = this.quadratureStates.get(nodeId) || this.createQuadratureState();
        this.quadratureStates.set(nodeId, state);
        const sideIn = mixInput(nodeId, "Side") + mixInput(nodeId, "In");
        const midIn = mixInput(nodeId, "Mid");
        return this.quadratureFrame(state, sideIn, midIn);
      },
      // Look-ahead brickwall limiter (delay = LA, no host PDC). Math: lookahead-limiter-math.js.
      lookaheadLimiter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.lookaheadLimiterStates) {
          this.lookaheadLimiterStates = new Map();
        }
        const state = this.lookaheadLimiterStates.get(nodeId) || this.createLookaheadLimiterState();
        this.lookaheadLimiterStates.set(nodeId, state);
        const mono = mixInput(nodeId);
        return this.lookaheadLimiterFrame(
          state,
          mixInput(nodeId, "Left") + mono,
          mixInput(nodeId, "Right") + mono,
          this.readEffectiveParameter(node, "ceiling", -1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "lookaheadMs", 5, frame, frames, frameValues),
          this.readEffectiveParameter(node, "lookaheadSamples", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "attack", 0.2, frame, frames, frameValues),
          this.readEffectiveParameter(node, "release", 100, frame, frames, frameValues),
          safeRate,
          this.readEffectiveParameter(node, "lookaheadEnabled", 1, frame, frames, frameValues),
        );
      },
      inertialFilter: (node, nodeId, frame, frames, frameValues, mixInput) => {
        if (!this.inertialFilterStates) {
          this.inertialFilterStates = new Map();
        }
        const state = this.inertialFilterStates.get(nodeId) || this.createStereoInertialFilterState();
        this.inertialFilterStates.set(nodeId, state);
        const attack = this.readEffectiveParameter(node, "attack", 1, frame, frames, frameValues);
        const release = this.readEffectiveParameter(node, "release", 0.005, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        return {
          Out: this.inertialFilterSample(state.mono, mono, attack, release),
          Left: this.inertialFilterSample(state.left, mixInput(nodeId, "Left") + mono, attack, release),
          Right: this.inertialFilterSample(state.right, mixInput(nodeId, "Right") + mono, attack, release),
        };
      },
      tiltFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.tiltFilterStates) {
          this.tiltFilterStates = new Map();
        }
        const state = this.tiltFilterStates.get(nodeId) || this.createStereoTiltFilterState();
        this.tiltFilterStates.set(nodeId, state);
        const amount = this.readEffectiveParameter(node, "amount", 0, frame, frames, frameValues);
        const pivot = this.readEffectiveParameter(node, "pivot", 1000, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        return {
          Out: this.tiltFilterSample(state.mono, mono, amount, pivot, safeRate),
          Left: this.tiltFilterSample(state.left, mixInput(nodeId, "Left") + mono, amount, pivot, safeRate),
          Right: this.tiltFilterSample(state.right, mixInput(nodeId, "Right") + mono, amount, pivot, safeRate),
        };
      },
      eqFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.eqFilterStates) {
          this.eqFilterStates = new Map();
        }
        const state = this.eqFilterStates.get(nodeId) || this.createStereoEqFilterState();
        this.eqFilterStates.set(nodeId, state);
        const mode = this.readEffectiveParameter(node, "mode", 1, frame, frames, frameValues);
        const frequency = this.readEffectiveParameter(node, "frequency", 1000, frame, frames, frameValues);
        const q = this.readEffectiveParameter(node, "q", 0.707, frame, frames, frameValues);
        const gain = this.readEffectiveParameter(node, "gain", 0, frame, frames, frameValues);
        const mono = mixInput(nodeId);
        return {
          Out: this.eqFilterSample(state.mono, mono, mode, frequency, q, gain, safeRate),
          Left: this.eqFilterSample(state.left, mixInput(nodeId, "Left") + mono, mode, frequency, q, gain, safeRate),
          Right: this.eqFilterSample(state.right, mixInput(nodeId, "Right") + mono, mode, frequency, q, gain, safeRate),
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
      attackDecay: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.attackDecayStates) this.attackDecayStates = new Map();
        const state = this.attackDecayStates.get(nodeId) || this.createAttackDecayState();
        this.attackDecayStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.attackDecaySample(
          state,
          mixInput(nodeId, "Gate"),
          {
            amplitude: read("amplitude", 1),
            attack: read("attack", 0.01),
            curve: read("curve", 1),
            cycle: read("cycle", 0),
            decay: read("decay", 0.25),
            inputMode: read("inputMode", 0),
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
      clock: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.clockStates.get(nodeId) || this.createClockState();
        this.clockStates.set(nodeId, state);
        return this.clockSample(
          state,
          mixInput(nodeId, "Reset"),
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "rate", 2, frame, frames, frameValues),
          this.readEffectiveParameter(node, "duty", 0.5, frame, frames, frameValues),
          this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues),
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
      gain: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.gainFrame(
          mixInput(nodeId),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues),
        ),
      // Legacy type id → same as gain (offset included).
      gainBias: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.gainFrame(
          mixInput(nodeId),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues),
        ),
      bias: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.biasFrame(
          mixInput(nodeId),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues),
        ),
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
      // Airwindows Density3. Math: air-clipper-math.js.
      airClipper: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.airClipperStates) {
          this.airClipperStates = new Map();
        }
        const state = this.airClipperStates.get(nodeId) || this.createAirClipperState();
        this.airClipperStates.set(nodeId, state);
        return this.airClipperFrame(
          state,
          mixInput(nodeId),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          this.readEffectiveParameter(node, "density", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "highpass", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "output", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "wet", 1, frame, frames, frameValues),
          safeRate,
        );
      },
      // 3D rotation → XY. Math: rotate-3d-to-2d-math.js.,
      rotate3dTo2d: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.rotate3dTo2dSample(
          mixInput(nodeId, "X"),
          mixInput(nodeId, "Y"),
          mixInput(nodeId, "Z"),
          this.readEffectiveParameter(node, "rotateX", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "rotateY", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "rotateZ", 0, frame, frames, frameValues),
        ),
      // Stereo L/R → goniometer X/Y axes. Math: vectorscope-transform-math.js.
      vectorscopeTransform: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.vectorscopeTransformSample(mixInput(nodeId, "L"), mixInput(nodeId, "R")),
      // |Δsample| speed + sat inertia. Math: speed-color-inertia-math.js.
      speedColorInertia: (node, nodeId, frame, frames, frameValues, mixInput) => {
        if (!this.speedColorInertiaStates) {
          this.speedColorInertiaStates = new Map();
        }
        const state = this.speedColorInertiaStates.get(nodeId) || this.createSpeedColorInertiaState();
        this.speedColorInertiaStates.set(nodeId, state);
        return this.speedColorInertiaSample(
          state,
          mixInput(nodeId, "In"),
          this.readEffectiveParameter(node, "gain", 8, frame, frames, frameValues),
          this.readEffectiveParameter(node, "attack", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "release", 0.005, frame, frames, frameValues),
        );
      },
      // Spectrogram: face analyzes buffered In; Thru is dry passthrough.
      spectrogram: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      // Signal-path displays: dry Thru (→ jack) so faces can sit in-line.
      customDisplay: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In1"), null),
      }),
      traceDisplay: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      traceDisplayStereo: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Left: this.safeFilterNumber(mixInput(nodeId, "Left"), null),
        Right: this.safeFilterNumber(mixInput(nodeId, "Right"), null),
      }),
      dotOscilloscope: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      videoscope: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "A"), null),
      }),
      matrixDisplay: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      asciiscope: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        X: this.safeFilterNumber(mixInput(nodeId, "X"), null),
        Y: this.safeFilterNumber(mixInput(nodeId, "Y"), null),
      }),
      valueOscilloscope: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      lineBurnOscilloscope: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      scope2d: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        X: this.safeFilterNumber(mixInput(nodeId, "X"), null),
        Y: this.safeFilterNumber(mixInput(nodeId, "Y"), null),
      }),
      phosphorLight: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        X: this.safeFilterNumber(mixInput(nodeId, "X"), null),
        Y: this.safeFilterNumber(mixInput(nodeId, "Y"), null),
      }),
      scope2dTrace: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        X: this.safeFilterNumber(mixInput(nodeId, "X"), null),
        Y: this.safeFilterNumber(mixInput(nodeId, "Y"), null),
      }),
      visualOscilloscope: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        X: this.safeFilterNumber(mixInput(nodeId, "X"), null),
        Y: this.safeFilterNumber(mixInput(nodeId, "Y"), null),
      }),
      numberReadout: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      valueLcd: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      mix: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.mixStates) this.mixStates = this.gainBiasMixStates || new Map();
        const state = this.mixStates.get(nodeId) || this.createGainBiasMixState();
        this.mixStates.set(nodeId, state);
        if (this.gainBiasMixStates) this.gainBiasMixStates.set(nodeId, state);
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
      // Legacy type id for Mix.
      gainBiasMix: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) =>
        this.liveModuleEvaluators.mix(node, nodeId, frame, frames, frameValues, mixInput, safeRate),
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
  };
};
