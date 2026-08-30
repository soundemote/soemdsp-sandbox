// Extracted cluster of buildLiveModuleEvaluators map entries (Phase D navigation split).
// Behavior must match the prior monolith bit-for-bit.

NodeLiveAudioProcessor.prototype.buildLiveModuleEvaluators_processors = function buildLiveModuleEvaluators_processors() {
  return {
      passiveFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.passiveFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createPassiveFilterState());
        this.passiveFilterStates.set(nodeId, state);
        const { params: p } = this.resolveModuleControlParams(
          node,
          state,
          {
            mode: 0,
            sweep: 0,
            lowFrequency: 200,
            highFrequency: 1000,
            slope: 0,
            stagger: 1,
            gainCompensation: 1,
          },
          frame,
          frames,
          frameValues,
        );
        const passiveMode = p.mode;
        const passiveSweep = p.sweep;
        const passiveLowFrequency = this.sweepFrequencyHz(p.lowFrequency, passiveSweep);
        const passiveHighFrequency = this.sweepFrequencyHz(p.highFrequency, passiveSweep);
        const passiveSlope = p.slope;
        const passiveStagger = p.stagger;
        const passiveGainComp = p.gainCompensation;
        const passiveMono = mixInput(nodeId);
        const passiveCoeff = typeof nodeGraphPassiveFilterPrepare === "function"
          ? nodeGraphPassiveFilterPrepare(
            state,
            passiveMode,
            passiveLowFrequency,
            passiveHighFrequency,
            passiveSlope,
            passiveStagger,
            passiveGainComp,
          )
          : null;
        if (passiveCoeff && typeof nodeGraphPassiveFilterProcess === "function") {
          const outM = this.safeFilterNumber(
            nodeGraphPassiveFilterProcess(state.mono, passiveMono, passiveCoeff, safeRate, null, ""),
            state.mono,
          );
          return this.stereoProcessPorts(nodeId, hasInput, outM,
            () => this.safeFilterNumber(
              nodeGraphPassiveFilterProcess(state.left, mixInput(nodeId, "Left") + passiveMono, passiveCoeff, safeRate, null, ""),
              state.left,
            ),
            () => this.safeFilterNumber(
              nodeGraphPassiveFilterProcess(state.right, mixInput(nodeId, "Right") + passiveMono, passiveCoeff, safeRate, null, ""),
              state.right,
            ));
        }
        const outM = this.passiveFilterSample(state.mono, passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate, passiveSlope, passiveStagger, passiveGainComp);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.passiveFilterSample(state.left, mixInput(nodeId, "Left") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate, passiveSlope, passiveStagger, passiveGainComp),
          () => this.passiveFilterSample(state.right, mixInput(nodeId, "Right") + passiveMono, passiveMode, passiveLowFrequency, passiveHighFrequency, safeRate, passiveSlope, passiveStagger, passiveGainComp));
      },
      papoulisFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.papoulisFilterStates.get(nodeId) || this.createPapoulisFilterState();
        this.papoulisFilterStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node, state, { cutoff: 1000 }, frame, frames, frameValues,
        );
        const cutoff = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.cutoff;
        return this.papoulisFilterSample(
          state,
          mixInput(nodeId),
          cutoff,
          safeRate,
        );
      },
      phosphillator: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        const state = this.phosphillatorPlaybackStates.get(nodeId) || this.createPhosphillatorPlaybackState();
        this.phosphillatorPlaybackStates.set(nodeId, state);
        const knobHz = this.readEffectiveParameter(node, "frequency", 2, frame, frames, frameValues);
        const frequency = this.resolveSoftpopOrBandpassHz
          ? this.resolveSoftpopOrBandpassHz(node, nodeId, knobHz, frame, frames, frameValues, mixInput)
          : knobHz;
        return this.phosphillatorPlaybackSample(
          state,
          node,
          nodeId,
          mixInput(nodeId, "0.1V/Oct"),
          frequency,
          this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues),
          mixInput(nodeId, "Reset"),
          safeRate,
          this.readEffectiveParameter(node, "sharpness", 0.5, frame, frames, frameValues),
        );
      },
      cookbookFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.cookbookFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createCookbookFilterState());
        this.cookbookFilterStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          { mode: 1, frequency: 1000, q: 1, gain: 0, stages: 2 },
          frame,
          frames,
          frameValues,
        );
        const cookbookMode = params.mode;
        const cookbookFrequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.frequency;
        const cookbookQ = params.q;
        const cookbookGain = params.gain;
        const cookbookStages = params.stages;
        const cookbookMono = mixInput(nodeId);
        const outM = this.cookbookFilterSample(state.mono, cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.cookbookFilterSample(state.left, mixInput(nodeId, "Left") + cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate),
          () => this.cookbookFilterSample(state.right, mixInput(nodeId, "Right") + cookbookMono, cookbookMode, cookbookFrequency, cookbookQ, cookbookGain, cookbookStages, safeRate));
      },
      ladderFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.ladderFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createLadderFilterState());
        this.ladderFilterStates.set(nodeId, state);
        // Control knobs: only re-resolve when smoother/mod hasChanged.
        const controls = this.resolveModuleControlParams(
          node,
          state,
          { mode: 1, resonance: 0.2, stages: 4, frequency: 1000 },
          frame,
          frames,
          frameValues,
        );
        // LIVE: audio-rate `f` jack overrides frequency every sample.
        const ladderParams = {
          ...controls.params,
          frequency: (typeof hasInput === "function" && hasInput(nodeId, "f"))
            ? mixInput(nodeId, "f")
            : controls.params.frequency,
        };
        const ladderMono = mixInput(nodeId);
        const outM = this.ladderFilterSample(state.mono, ladderMono, ladderParams, safeRate);
        return this.stereoProcessPorts(
          nodeId,
          hasInput,
          outM,
          () => this.ladderFilterSample(state.left, mixInput(nodeId, "Left") + ladderMono, ladderParams, safeRate),
          () => this.ladderFilterSample(state.right, mixInput(nodeId, "Right") + ladderMono, ladderParams, safeRate),
        );
      },
      flowerChildFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.flowerChildFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createFlowerChildFilterState());
        this.flowerChildFilterStates.set(nodeId, state);
        const { params: flowerChildParams } = this.resolveModuleControlParams(
          node,
          state,
          { chaos: 0, frequency: 0.5, mode: 0, resonance: 0.2 },
          frame,
          frames,
          frameValues,
        );
        const flowerChildMono = mixInput(nodeId);
        const outM = this.flowerChildFilterSample(state.mono, flowerChildMono, flowerChildParams, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.flowerChildFilterSample(state.left, mixInput(nodeId, "Left") + flowerChildMono, flowerChildParams, safeRate),
          () => this.flowerChildFilterSample(state.right, mixInput(nodeId, "Right") + flowerChildMono, flowerChildParams, safeRate));
      },
      activeFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.activeFilterStates) {
          this.activeFilterStates = new Map();
        }
        const state = this.activeFilterStates.get(nodeId) || this.createStereoActiveFilterState();
        this.activeFilterStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          {
            mode: 3,
            feedbackCircuit: 3,
            gainCompensation: 1,
            highFrequency: 1000,
            hpSlope: 1,
            lowFrequency: 200,
            lpSlope: 1,
            resonance: 0.2,
            sweep: 0,
          },
          frame,
          frames,
          frameValues,
        );
        const activeMode = params.mode;
        const activeFreqWired = typeof hasInput === "function" && hasInput(nodeId, "f");
        const activeFreqJack = activeFreqWired ? mixInput(nodeId, "f") : null;
        const activeBandpass = typeof nodeGraphActiveFilterIsBandpass === "function"
          ? nodeGraphActiveFilterIsBandpass(activeMode)
          : Math.round(Number(activeMode) || 0) >= 8;
        const activeHp = !activeBandpass && Math.round(Number(activeMode) || 0) >= 4;
        const activeLp = !activeBandpass && !activeHp;
        const activeParams = {
          feedbackCircuit: params.feedbackCircuit,
          centerFrequency: activeFreqWired && activeBandpass ? activeFreqJack : undefined,
          gainCompensation: params.gainCompensation,
          highFrequency: activeFreqWired && activeLp ? activeFreqJack : params.highFrequency,
          hpSlope: params.hpSlope,
          lowFrequency: activeFreqWired && activeHp ? activeFreqJack : params.lowFrequency,
          lpSlope: params.lpSlope,
          mode: activeMode,
          resonance: params.resonance,
          sweep: params.sweep,
        };
        const activeMono = mixInput(nodeId);
        const outM = this.activeFilterProcess(state.mono, activeMono, activeParams, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.activeFilterProcess(state.left, mixInput(nodeId, "Left") + activeMono, activeParams, safeRate),
          () => this.activeFilterProcess(state.right, mixInput(nodeId, "Right") + activeMono, activeParams, safeRate));
      },
      butterworth: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.butterworthStates) this.butterworthStates = new Map();
        const state = this.butterworthStates.get(nodeId) || this.createStereoScientificIirState();
        this.butterworthStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          { mode: 0, frequency: 1000, order: 4, bandwidth: 1 },
          frame,
          frames,
          frameValues,
        );
        const mode = params.mode;
        const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.frequency;
        const order = params.order;
        const bandwidth = params.bandwidth;
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("butterworth", 0, ch, x, mode, frequency, order, bandwidth, 1, safeRate);
        const outM = run(state.mono, mono);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => run(state.left, mixInput(nodeId, "Left") + mono),
          () => run(state.right, mixInput(nodeId, "Right") + mono));
      },
      linkwitzRiley: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.linkwitzRileyStates) this.linkwitzRileyStates = new Map();
        const state = this.linkwitzRileyStates.get(nodeId) || this.createStereoScientificIirState();
        this.linkwitzRileyStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          { mode: 0, frequency: 1000, order: 4, bandwidth: 1 },
          frame,
          frames,
          frameValues,
        );
        const mode = params.mode;
        const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.frequency;
        const order = params.order;
        const bandwidth = params.bandwidth;
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("linkwitzRiley", 1, ch, x, mode, frequency, order, bandwidth, 1, safeRate);
        const outM = run(state.mono, mono);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => run(state.left, mixInput(nodeId, "Left") + mono),
          () => run(state.right, mixInput(nodeId, "Right") + mono));
      },
      bessel: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.besselStates) this.besselStates = new Map();
        const state = this.besselStates.get(nodeId) || this.createStereoScientificIirState();
        this.besselStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          { mode: 0, frequency: 1000, order: 4, bandwidth: 1 },
          frame,
          frames,
          frameValues,
        );
        const mode = params.mode;
        const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.frequency;
        const order = params.order;
        const bandwidth = params.bandwidth;
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("bessel", 2, ch, x, mode, frequency, order, bandwidth, 1, safeRate);
        const outM = run(state.mono, mono);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => run(state.left, mixInput(nodeId, "Left") + mono),
          () => run(state.right, mixInput(nodeId, "Right") + mono));
      },
      chebyshev: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.chebyshevStates) this.chebyshevStates = new Map();
        const state = this.chebyshevStates.get(nodeId) || this.createStereoScientificIirState();
        this.chebyshevStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          { mode: 0, frequency: 1000, order: 4, bandwidth: 1, ripple: 1 },
          frame,
          frames,
          frameValues,
        );
        const mode = params.mode;
        const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.frequency;
        const order = params.order;
        const bandwidth = params.bandwidth;
        const ripple = params.ripple;
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("chebyshev", 3, ch, x, mode, frequency, order, bandwidth, ripple, safeRate);
        const outM = run(state.mono, mono);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => run(state.left, mixInput(nodeId, "Left") + mono),
          () => run(state.right, mixInput(nodeId, "Right") + mono));
      },
      elliptic: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.ellipticStates) this.ellipticStates = new Map();
        const state = this.ellipticStates.get(nodeId) || this.createStereoScientificIirState();
        this.ellipticStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          { mode: 0, frequency: 1000, order: 4, bandwidth: 1, ripple: 1 },
          frame,
          frames,
          frameValues,
        );
        const mode = params.mode;
        const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.frequency;
        const order = params.order;
        const bandwidth = params.bandwidth;
        const ripple = params.ripple;
        const mono = mixInput(nodeId);
        const run = (ch, x) => this.scientificIirSample("elliptic", 4, ch, x, mode, frequency, order, bandwidth, ripple, safeRate);
        const outM = run(state.mono, mono);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => run(state.left, mixInput(nodeId, "Left") + mono),
          () => run(state.right, mixInput(nodeId, "Right") + mono));
      },
      bandpass: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.bandpassStates) this.bandpassStates = new Map();
        const state = this.bandpassStates.get(nodeId) || this.createStereoBandpassState();
        this.bandpassStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node, state, { frequency: 1000, q: 1 }, frame, frames, frameValues,
        );
        const frequency = this.resolveSoftpopOrBandpassHz(node, nodeId, params.frequency, frame, frames, frameValues, mixInput);
        const q = params.q;
        const mono = mixInput(nodeId);
        const outM = this.bandpassSample(state.mono, mono, frequency, q, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.bandpassSample(state.left, mixInput(nodeId, "Left") + mono, frequency, q, safeRate),
          () => this.bandpassSample(state.right, mixInput(nodeId, "Right") + mono, frequency, q, safeRate));
      },
      allpass: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.allpassStates) this.allpassStates = new Map();
        const state = this.allpassStates.get(nodeId) || this.createStereoAllpassState();
        this.allpassStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node, state, { frequency: 1000, q: 0.707 }, frame, frames, frameValues,
        );
        const frequency = this.resolveSoftpopOrBandpassHz(node, nodeId, params.frequency, frame, frames, frameValues, mixInput);
        const q = params.q;
        const mono = mixInput(nodeId);
        const outM = this.allpassSample(state.mono, mono, frequency, q, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.allpassSample(state.left, mixInput(nodeId, "Left") + mono, frequency, q, safeRate),
          () => this.allpassSample(state.right, mixInput(nodeId, "Right") + mono, frequency, q, safeRate));
      },
      crossover2: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        return this.crossoverEvaluator(2, node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput);
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
      phaseDisperse: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.phaseDisperseStates) this.phaseDisperseStates = new Map();
        let state = this.phaseDisperseStates.get(nodeId);
        if (!state) {
          state = this.createPhaseDisperseState();
          this.phaseDisperseStates.set(nodeId, state);
        }
        const knobHz = this.readEffectiveParameter(node, "frequency", 100, frame, frames, frameValues);
        const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : knobHz;
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
      formantFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const mono = mixInput(nodeId);
        const outM = this.formantFilterSample(null, mono);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.formantFilterSample(null, mixInput(nodeId, "Left") + mono),
          () => this.formantFilterSample(null, mixInput(nodeId, "Right") + mono));
      },
      besselThomson: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const mono = mixInput(nodeId);
        const outM = this.besselThomsonSample(null, mono);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.besselThomsonSample(null, mixInput(nodeId, "Left") + mono),
          () => this.besselThomsonSample(null, mixInput(nodeId, "Right") + mono));
      },
      massSpringDamper: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const mono = mixInput(nodeId);
        const outM = this.massSpringDamperSample(null, mono);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.massSpringDamperSample(null, mixInput(nodeId, "Left") + mono),
          () => this.massSpringDamperSample(null, mixInput(nodeId, "Right") + mono));
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
      yellowjacketFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.yellowjacketFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createYellowjacketFilterState());
        this.yellowjacketFilterStates.set(nodeId, state);
        const { params: yellowjacketParams } = this.resolveModuleControlParams(
          node, state, { chaos: 0, frequency: 0.5, resonance: 0.2 }, frame, frames, frameValues,
        );
        const yellowjacketMono = mixInput(nodeId);
        const outM = this.yellowjacketFilterSample(state.mono, yellowjacketMono, yellowjacketParams, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.yellowjacketFilterSample(state.left, mixInput(nodeId, "Left") + yellowjacketMono, yellowjacketParams, safeRate),
          () => this.yellowjacketFilterSample(state.right, mixInput(nodeId, "Right") + yellowjacketMono, yellowjacketParams, safeRate));
      },
      superloveFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.superloveFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createSuperloveFilterState());
        this.superloveFilterStates.set(nodeId, state);
        const { params: superloveParams } = this.resolveModuleControlParams(
          node, state, { chaos: 0.5, frequency: 0.5, mode: 0, resonance: 0.2 }, frame, frames, frameValues,
        );
        const superloveMono = mixInput(nodeId);
        const outM = this.superloveFilterSample(state.mono, superloveMono, superloveParams, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.superloveFilterSample(state.left, mixInput(nodeId, "Left") + superloveMono, superloveParams, safeRate),
          () => this.superloveFilterSample(state.right, mixInput(nodeId, "Right") + superloveMono, superloveParams, safeRate));
      },
      chaoticPhaseLockingFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.chaoticPhaseLockingFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createChaoticPhaseLockingFilterState());
        this.chaoticPhaseLockingFilterStates.set(nodeId, state);
        const { params: chaoticPhaseLockingParams } = this.resolveModuleControlParams(
          node, state, { chaos: 1, frequency: 0.5, resonance: 0.2 }, frame, frames, frameValues,
        );
        const chaoticPhaseLockingMono = mixInput(nodeId);
        const outM = this.chaoticPhaseLockingFilterSample(state.mono, chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.chaoticPhaseLockingFilterSample(state.left, mixInput(nodeId, "Left") + chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate),
          () => this.chaoticPhaseLockingFilterSample(state.right, mixInput(nodeId, "Right") + chaoticPhaseLockingMono, chaoticPhaseLockingParams, safeRate));
      },
      resonatorFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.resonatorFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createResonatorFilterState());
        this.resonatorFilterStates.set(nodeId, state);
        const { params: resonatorParams } = this.resolveModuleControlParams(
          node, state, { chaos: 0, frequency: 0.5, mode: 0, resonance: 0.2 }, frame, frames, frameValues,
        );
        const resonatorMono = mixInput(nodeId);
        const outM = this.resonatorFilterSample(state.mono, resonatorMono, resonatorParams, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.resonatorFilterSample(state.left, mixInput(nodeId, "Left") + resonatorMono, resonatorParams, safeRate),
          () => this.resonatorFilterSample(state.right, mixInput(nodeId, "Right") + resonatorMono, resonatorParams, safeRate));
      },
      humanFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.humanFilterStates.get(nodeId) || this.createStereoFilterState(() => this.createHumanFilterState());
        this.humanFilterStates.set(nodeId, state);
        const { params: humanFilterParams } = this.resolveModuleControlParams(
          node, state, { chaos: 0, frequency: 0.5, mode: 0, resonance: 0.2 }, frame, frames, frameValues,
        );
        const humanFilterMono = mixInput(nodeId);
        const outM = this.humanFilterSample(state.mono, humanFilterMono, humanFilterParams, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.humanFilterSample(state.left, mixInput(nodeId, "Left") + humanFilterMono, humanFilterParams, safeRate),
          () => this.humanFilterSample(state.right, mixInput(nodeId, "Right") + humanFilterMono, humanFilterParams, safeRate));
      },
      tb303Filter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.tb303FilterStates.get(nodeId) || this.createStereoFilterState(() => this.createTb303FilterState());
        this.tb303FilterStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node, state, { cutoff: 1000, drive: 0, mode: 4, resonance: 0 }, frame, frames, frameValues,
        );
        const tb303Params = {
          cutoff: (typeof hasInput === "function" && hasInput(nodeId, "f"))
            ? mixInput(nodeId, "f")
            : params.cutoff,
          drive: params.drive,
          mode: params.mode,
          resonance: params.resonance,
        };
        const tb303Mono = mixInput(nodeId);
        const outM = this.tb303FilterSample(state.mono, tb303Mono, tb303Params, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.tb303FilterSample(state.left, mixInput(nodeId, "Left") + tb303Mono, tb303Params, safeRate),
          () => this.tb303FilterSample(state.right, mixInput(nodeId, "Right") + tb303Mono, tb303Params, safeRate));
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
      phoneTone: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.phoneToneStates) this.phoneToneStates = new Map();
        const state = this.phoneToneStates.get(nodeId) || this.createPhoneToneState();
        this.phoneToneStates.set(nodeId, state);
        const referenceMidiNote = Number.isFinite(this.pitchReferenceMidiNote)
          ? this.pitchReferenceMidiNote
          : 48;
        const referenceVoltage = referenceMidiNote / 120;
        const hasPitch = typeof hasInput === "function"
          ? hasInput(nodeId, "0.1V/Oct")
          : this.inputConnections.has(this.inputKey(nodeId, "0.1V/Oct"));
        const pitchCv = hasPitch
          ? (this.safeFilterNumber(mixInput(nodeId, "0.1V/Oct"), null) ?? 0)
          : referenceVoltage;
        const pitchCvRatio = typeof nodeGraphPhoneTonePitchCvRatio === "function"
          ? nodeGraphPhoneTonePitchCvRatio(hasPitch, pitchCv, referenceVoltage)
          : 1;
        return this.phoneToneSample(state, {
          amplitude: this.readEffectiveParameter(node, "amplitude", 0.5, frame, frames, frameValues),
          analog: mixInput(nodeId, "Analog"),
          digital: mixInput(nodeId, "Digital"),
          freqOffset: this.readEffectiveParameter(node, "freqOffset", 0, frame, frames, frameValues),
          gate: mixInput(nodeId, "Gate"),
          hasAnalog: hasInput(nodeId, "Analog"),
          hasDigital: hasInput(nodeId, "Digital"),
          hasGate: hasInput(nodeId, "Gate"),
          pitchCvRatio,
          pitchOffset: this.readEffectiveParameter(node, "pitchOffset", 0, frame, frames, frameValues),
          sampleRate: safeRate,
        });
      },
      robinSinusoid: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.robinSinusoidStates) {
          this.robinSinusoidStates = new Map();
        }
        const state = this.robinSinusoidStates.get(nodeId) || this.createRobinSinusoidState();
        this.robinSinusoidStates.set(nodeId, state);
        const hasFreqInput = this.inputConnections.has(this.inputKey(nodeId, "f"));
        if (frame === 0 || !state.cachedParams || hasFreqInput) {
          const freqKnob = this.readEffectiveParameter(node, "frequency", 440, frame, frames, frameValues);
          state.cachedParams = {
            frequency: hasFreqInput ? mixInput(nodeId, "f") : freqKnob,
            amp: this.readEffectiveParameter(node, "amplitude", 1, frame, frames, frameValues),
            startPhase: (Number(this.readEffectiveParameter(node, "phase", 0, frame, frames, frameValues)) || 0) * Math.PI * 2,
          };
        } else if (!hasFreqInput) {
          // Frequency jack unconnected: keep the quantum-cached knob values.
        }
        const resetIn = Number(mixInput(nodeId, "Reset")) || 0;
        const resetEdge = resetIn >= 0.5 && state.resetPrev < 0.5;
        state.resetPrev = resetIn;
        return {
          Out: this.robinSinusoidSample(
            state,
            state.cachedParams.frequency,
            state.cachedParams.amp,
            safeRate,
            state.cachedParams.startPhase,
            resetEdge,
            !hasFreqInput,
          ),
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
          interpolation: read("interpolation", 0),
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
        // hasChanged: only re-resolve while smoothing/modulated; idle knobs stay off the list.
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          {
            feedback: 0.35,
            hpfFrequency: 20,
            interpolation: 0,
            level: 1,
            lfoRate: 0.35,
            lfoStyle: 0,
            lfoVariation: 0.25,
            lpfFrequency: 8000,
            mix: 0.35,
            offsetMs: 0,
            saturate: 1,
            timeDenominator: 4,
            timeNumerator: 1,
            timingMode: 0,
          },
          frame,
          frames,
          frameValues,
        );
        return this.pingPongDelaySample(
          state,
          mixInput(nodeId) + mixInput(nodeId, "Left") + mixInput(nodeId, "Right"),
          params,
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
        // hasChanged: idle unmodulated knobs stay cached (not re-read every sample/quantum).
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          {
            delaySize: 0.02,
            diffusionAmount: 0.70,
            diffusionSize: 0.35,
            lfoAmplitude: 0.07,
            lfoBaseSpeed: 0.83,
            lfoVariation: 0.001,
            mix: 0.43,
            recycle: 0.70,
            seed: 0,
          },
          frame,
          frames,
          frameValues,
        );
        const monoInput = mixInput(nodeId, "In");
        const leftInput = mixInput(nodeId, "Left") + monoInput;
        const rightInput = mixInput(nodeId, "Right") + monoInput;
        return this.sabrinaReverbSample(
          state,
          leftInput,
          rightInput,
          params,
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
      noiseDetector: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.noiseDetectorStates.get(nodeId) || this.createNoiseDetectorState();
        this.noiseDetectorStates.set(nodeId, state);
        return this.noiseDetectorSample(
          state,
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Mono"),
          mixInput(nodeId, "Right"),
          this.readEffectiveParameter(node, "threshold", 0.9, frame, frames, frameValues),
          safeRate,
          hasInput(nodeId, "Left"),
          hasInput(nodeId, "Mono"),
          hasInput(nodeId, "Right"),
        );
      },
      rms: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.rmsStates.get(nodeId) || this.createRmsState();
        this.rmsStates.set(nodeId, state);
        return this.rmsSample(
          state,
          mixInput(nodeId, "In"),
          this.rmsReadOptions(node, frame, frames, frameValues),
          safeRate,
          hasInput(nodeId, "In"),
        );
      },
      rmsStereo: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.rmsStates.get(nodeId) || this.createRmsState();
        this.rmsStates.set(nodeId, state);
        return this.rmsStereoSample(
          state,
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          this.rmsReadOptions(node, frame, frames, frameValues),
          safeRate,
          hasInput(nodeId, "Left"),
          hasInput(nodeId, "Right"),
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
      slewLimiter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.slewLimiterStates.get(nodeId) || this.createStereoSlewLimiterState();
        this.slewLimiterStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node, state, { upTime: 0.05, downTime: 0.20, shape: 0, bias: 0 }, frame, frames, frameValues,
        );
        const slewUpTime = params.upTime;
        const slewDownTime = params.downTime;
        const slewShape = params.shape;
        const slewBias = params.bias;
        const slewMono = mixInput(nodeId) + slewBias;
        const outM = this.slewLimiterSample(state.mono, slewMono, slewUpTime, slewDownTime, safeRate, slewShape);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.slewLimiterSample(state.left, mixInput(nodeId, "Left") + slewMono, slewUpTime, slewDownTime, safeRate, slewShape),
          () => this.slewLimiterSample(state.right, mixInput(nodeId, "Right") + slewMono, slewUpTime, slewDownTime, safeRate, slewShape));
      },
      // Stereo → Mid/Side (0.5 matrix). Math: mid-side-encode-math.js.
      midSideEncode: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.midSideEncodeSample(
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          this.readEffectiveParameter(node, "midGain", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "sideGain", 0, frame, frames, frameValues),
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
      // Mono Hilbert (+90 / −90 / 0°). Math: hilbert-math.js.
      hilbert: (node, nodeId, frame, frames, frameValues, mixInput) => {
        if (!this.hilbertStates) {
          this.hilbertStates = new Map();
        }
        const state = this.hilbertStates.get(nodeId) || this.createHilbertState();
        this.hilbertStates.set(nodeId, state);
        const shift = this.readEffectiveParameter(node, "shift", 0, frame, frames, frameValues);
        return this.hilbertFrame(state, mixInput(nodeId), shift);
      },
      // Look-ahead Brickwall (protective). Math: lookahead-limiter-math.js.
      lookaheadLimiter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.lookaheadLimiterStates) {
          this.lookaheadLimiterStates = new Map();
        }
        const state = this.lookaheadLimiterStates.get(nodeId) || this.createLookaheadLimiterState();
        this.lookaheadLimiterStates.set(nodeId, state);
        const mono = mixInput(nodeId);
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          {
            ceiling: -1,
            lookaheadMs: 5,
            lookaheadSamples: 0,
            attack: 0.2,
            release: 100,
            lookaheadEnabled: 1,
            gainCompensation: 0,
            dipGain: 1,
          },
          frame,
          frames,
          frameValues,
        );
        return this.lookaheadLimiterFrame(
          state,
          mixInput(nodeId, "Left") + mono,
          mixInput(nodeId, "Right") + mono,
          params.ceiling,
          params.lookaheadMs,
          params.lookaheadSamples,
          params.attack,
          params.release,
          safeRate,
          params.lookaheadEnabled,
          params.gainCompensation,
          params.dipGain,
        );
      },
      // Musical Limiter (input gain / threshold / ratio, sidechain, Env). Same math file.
      limiter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.pumpingLimiterStates) {
          this.pumpingLimiterStates = new Map();
        }
        const state = this.pumpingLimiterStates.get(nodeId) || this.createPumpingLimiterState();
        this.pumpingLimiterStates.set(nodeId, state);
        const mono = mixInput(nodeId);
        const scWired = typeof hasInput === "function" ? hasInput(nodeId, "Sidechain") : false;
        const { params } = this.resolveModuleControlParams(
          node,
          state,
          {
            inputGain: 0,
            threshold: -18,
            ratio: 8,
            lookaheadMs: 5,
            lookaheadSamples: 0,
            attack: 5,
            release: 250,
            lookaheadEnabled: 1,
            amplitude: 1,
          },
          frame,
          frames,
          frameValues,
        );
        return this.pumpingLimiterFrame(
          state,
          mixInput(nodeId, "Left") + mono,
          mixInput(nodeId, "Right") + mono,
          scWired ? mixInput(nodeId, "Sidechain") : 0,
          scWired,
          params.inputGain,
          params.threshold,
          params.ratio,
          params.lookaheadMs,
          params.lookaheadSamples,
          params.attack,
          params.release,
          safeRate,
          params.lookaheadEnabled,
          params.amplitude,
        );
      },
      inertialFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.inertialFilterStates) {
          this.inertialFilterStates = new Map();
        }
        const state = this.inertialFilterStates.get(nodeId) || this.createStereoInertialFilterState();
        this.inertialFilterStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node, state, { attack: 20000, release: 20 }, frame, frames, frameValues,
        );
        const attackHz = params.attack;
        const releaseHz = params.release;
        const mono = mixInput(nodeId);
        const outM = this.inertialFilterSample(state.mono, mono, attackHz, releaseHz, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.inertialFilterSample(state.left, mixInput(nodeId, "Left") + mono, attackHz, releaseHz, safeRate),
          () => this.inertialFilterSample(state.right, mixInput(nodeId, "Right") + mono, attackHz, releaseHz, safeRate));
      },
      tiltFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.tiltFilterStates) {
          this.tiltFilterStates = new Map();
        }
        const state = this.tiltFilterStates.get(nodeId) || this.createStereoTiltFilterState();
        this.tiltFilterStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node, state, { amount: 0, pivot: 1000 }, frame, frames, frameValues,
        );
        const amount = params.amount;
        const pivot = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.pivot;
        const mono = mixInput(nodeId);
        const outM = this.tiltFilterSample(state.mono, mono, amount, pivot, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.tiltFilterSample(state.left, mixInput(nodeId, "Left") + mono, amount, pivot, safeRate),
          () => this.tiltFilterSample(state.right, mixInput(nodeId, "Right") + mono, amount, pivot, safeRate));
      },
      eqFilter: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.eqFilterStates) {
          this.eqFilterStates = new Map();
        }
        const state = this.eqFilterStates.get(nodeId) || this.createStereoEqFilterState();
        this.eqFilterStates.set(nodeId, state);
        const { params } = this.resolveModuleControlParams(
          node, state, { mode: 1, frequency: 1000, q: 0.707, gain: 0 }, frame, frames, frameValues,
        );
        const mode = params.mode;
        const frequency = (typeof hasInput === "function" && hasInput(nodeId, "f"))
          ? mixInput(nodeId, "f")
          : params.frequency;
        const q = params.q;
        const gain = params.gain;
        const mono = mixInput(nodeId);
        const outM = this.eqFilterSample(state.mono, mono, mode, frequency, q, gain, safeRate);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.eqFilterSample(state.left, mixInput(nodeId, "Left") + mono, mode, frequency, q, gain, safeRate),
          () => this.eqFilterSample(state.right, mixInput(nodeId, "Right") + mono, mode, frequency, q, gain, safeRate));
      },
      sampleHold: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.sampleHoldStates.get(nodeId) || this.createStereoSampleHoldState();
        this.sampleHoldStates.set(nodeId, state);
        const sampleHoldTrigger = mixInput(nodeId, "Trigger");
        const sampleHoldThreshold = this.readEffectiveParameter(node, "threshold", 0, frame, frames, frameValues);
        const sampleHoldFrequency = this.readEffectiveParameter(node, "sampleFrequency", 0, frame, frames, frameValues);
        const sampleHoldMonoHasIn = hasInput(nodeId, "In");
        const sampleHoldMono = mixInput(nodeId, "In");
        const outM = this.sampleHoldSample(state.mono, sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn, `${nodeId}:mono`);
        return this.stereoProcessPorts(nodeId, hasInput, outM,
          () => this.sampleHoldSample(state.left, mixInput(nodeId, "Left") + sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn || hasInput(nodeId, "Left"), `${nodeId}:left`),
          () => this.sampleHoldSample(state.right, mixInput(nodeId, "Right") + sampleHoldMono, sampleHoldTrigger, sampleHoldThreshold, sampleHoldFrequency, safeRate, sampleHoldMonoHasIn || hasInput(nodeId, "Right"), `${nodeId}:right`));
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
      simulationTime: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => (
        typeof this.simulationTimeWorkletEvaluate === "function"
          ? this.simulationTimeWorkletEvaluate(node, nodeId, frame, frames, frameValues, mixInput, safeRate)
          : { Time: 0, A: 1 }
      ),
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
      keypad: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        const state = this.keypadStates.get(nodeId) || this.createKeypadState();
        this.keypadStates.set(nodeId, state);
        return this.keypadSample(state, {
          analog: mixInput(nodeId, "Analog"),
          digital: mixInput(nodeId, "Digital"),
          hasAnalog: hasInput(nodeId, "Analog"),
          hasDigital: hasInput(nodeId, "Digital"),
          mode: this.readEffectiveParameter(node, "mode", 0, frame, frames, frameValues),
          offset: this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues),
          slot: node?.params?.slot,
        });
      },
      ...Object.fromEntries(
        ["t", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"].map((type) => [
          type,
          (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) =>
            this.tSeriesEvaluate(node, nodeId, mixInput, hasInput),
        ]),
      ),
      vectorRgb: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.vectorRgbSample(mixInput, nodeId),
      rasterRgb: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const state = this.rasterRgbStates?.get(nodeId) || this.createRasterRgbState();
        if (!this.rasterRgbStates) this.rasterRgbStates = new Map();
        this.rasterRgbStates.set(nodeId, state);
        const read = (key, fallback) => this.readEffectiveParameter(
          node,
          key,
          fallback,
          frame,
          frames,
          frameValues,
        );
        return this.rasterRgbSample(mixInput, nodeId, {
          brightness: read("brightness", 1),
          contrast: read("contrast", 1),
          hue: read("hue", 0),
          invert: read("invert", 0),
          state,
        });
      },
      gradientVectorscope: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.gradientVectorscopeSample(mixInput, nodeId),
      traceXyz: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.traceXyzSample(mixInput, nodeId),
      traceRgb: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.traceRgbSample(mixInput, nodeId),
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
      gain: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const amount = this.readEffectiveParameter(node, "amount", 1, frame, frames, frameValues);
        const gainDb = this.readEffectiveParameter(node, "gainDb", 0, frame, frames, frameValues);
        return this.gainFrameDb(
          mixInput(nodeId),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          {
            masterDb: nodeGraphGainResolveMasterDb(node?.params, amount, gainDb),
            leftDb: this.readEffectiveParameter(node, "leftDb", 0, frame, frames, frameValues),
            rightDb: this.readEffectiveParameter(node, "rightDb", 0, frame, frames, frameValues),
            monoSum: this.readEffectiveParameter(node, "monoSum", 0, frame, frames, frameValues),
            offset: this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues),
          },
        );
      },
      // Legacy type id → same as gain (offset included).
      gainBias: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.liveModuleEvaluators.gain(node, nodeId, frame, frames, frameValues, mixInput),
      bias: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.biasFrame(
          mixInput(nodeId),
          0,
          0,
          this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues),
        ),
      attenuverter: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.attenuverterFrame(
          mixInput(nodeId),
          this.readEffectiveParameter(node, "amplitude", 0.5, frame, frames, frameValues),
          this.readEffectiveParameter(node, "offset", 0, frame, frames, frameValues),
        ),
      range: (node, nodeId, frame, frames, frameValues, mixInput) =>
        this.rangeFrame(
          mixInput(nodeId),
          this.readEffectiveParameter(node, "inLow", -1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "inHigh", 1, frame, frames, frameValues),
          this.readEffectiveParameter(node, "outLow", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "outHigh", 1000, frame, frames, frameValues),
        ),
      u2b: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.u2bSample(mixInput(nodeId)),
      }),
      b2u: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.b2uSample(mixInput(nodeId)),
      }),
      inv: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.invSample(mixInput(nodeId)),
      }),
      softClipper: (node, nodeId, frame, frames, frameValues, mixInput, safeRate, hasInput) => {
        if (!this.softClipperStates) this.softClipperStates = new Map();
        const state = this.softClipperStates.get(nodeId) || this.createSoftClipperState();
        this.softClipperStates.set(nodeId, state);
        const controls = this.resolveModuleControlParams(
          node,
          state,
          { oversample: 2, gainDb: 0, center: 0, width: 2 },
          frame,
          frames,
          frameValues,
        );
        const softClipperOs = controls.params.oversample;
        const softClipperGainDb = controls.params.gainDb;
        const softClipperCenter = controls.params.center;
        const softClipperWidth = controls.params.width;
        const drive = typeof nodeGraphClipperDbToLin === "function"
          ? nodeGraphClipperDbToLin(softClipperGainDb)
          : 10 ** ((Number(softClipperGainDb) || 0) / 20);
        const softClipperMono = mixInput(nodeId) * drive;
        const outM = this.nativeSoftClipperSample(softClipperMono, softClipperCenter, softClipperWidth, state, softClipperOs, 0);
        return this.stereoProcessPorts(
          nodeId,
          hasInput,
          outM,
          () => this.nativeSoftClipperSample(mixInput(nodeId, "Left") * drive + softClipperMono, softClipperCenter, softClipperWidth, state, softClipperOs, 1),
          () => this.nativeSoftClipperSample(mixInput(nodeId, "Right") * drive + softClipperMono, softClipperCenter, softClipperWidth, state, softClipperOs, 2),
        );
      },
      speakerProtector2: (node, nodeId, frame, frames, frameValues, mixInput, safeRate) => {
        if (!this.speakerProtector2States) this.speakerProtector2States = new Map();
        const state = this.speakerProtector2States.get(nodeId) || this.createSpeakerProtector2State(safeRate);
        this.speakerProtector2States.set(nodeId, state);
        return this.speakerProtector2Frame(
          state,
          mixInput(nodeId),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          safeRate,
          {
            dropSeconds: this.readEffectiveParameter(node, "dropSeconds", 0.008, frame, frames, frameValues),
            holdSeconds: this.readEffectiveParameter(node, "holdSeconds", 0.333, frame, frames, frameValues),
            riseSeconds: this.readEffectiveParameter(node, "riseSeconds", 0.75, frame, frames, frameValues),
          },
        );
      },
      clipperLimiter: (node, nodeId, frame, frames, frameValues, mixInput) => {
        if (!this.clipperLimiterStates) this.clipperLimiterStates = new Map();
        const state = this.clipperLimiterStates.get(nodeId) || this.createSoftClipperState();
        this.clipperLimiterStates.set(nodeId, state);
        return this.clipperLimiterFrame(
          mixInput(nodeId),
          mixInput(nodeId, "Left"),
          mixInput(nodeId, "Right"),
          this.readEffectiveParameter(node, "minDb", -12, frame, frames, frameValues),
          this.readEffectiveParameter(node, "maxDb", 0, frame, frames, frameValues),
          this.readEffectiveParameter(node, "gainDb", 0, frame, frames, frameValues),
          state,
          this.readEffectiveParameter(node, "oversample", 2, frame, frames, frameValues),
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
        this.vectorscopeTransformSample(
          mixInput(nodeId, "L"),
          mixInput(nodeId, "R"),
          this.readEffectiveParameter(node, "rotate", 0, frame, frames, frameValues),
        ),
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
        rgba: 0,
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
      traceDisplayXyz: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        X: this.safeFilterNumber(mixInput(nodeId, "X"), null),
        Y: this.safeFilterNumber(mixInput(nodeId, "Y"), null),
        Z: this.safeFilterNumber(mixInput(nodeId, "Z"), null),
      }),
      dotOscilloscope: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      vectorDot: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      lcdDot: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Thru: this.safeFilterNumber(mixInput(nodeId, "In"), null),
      }),
      led: (node, nodeId, frame, frames, frameValues, mixInput) => ({
        Out: this.safeFilterNumber(mixInput(nodeId, "In"), null),
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
      mixStereo: (node, nodeId, frame, frames, frameValues, mixInput) => {
        const read = (key, fallback) => this.readEffectiveParameter(node, key, fallback, frame, frames, frameValues);
        return this.mixStereoFrame(
          {
            Mono: mixInput(nodeId, "Mono"),
            L1: mixInput(nodeId, "L1"),
            R1: mixInput(nodeId, "R1"),
            L2: mixInput(nodeId, "L2"),
            R2: mixInput(nodeId, "R2"),
            L3: mixInput(nodeId, "L3"),
            R3: mixInput(nodeId, "R3"),
            L4: mixInput(nodeId, "L4"),
            R4: mixInput(nodeId, "R4"),
          },
          {
            volume1: read("volume1", 0),
            pan1: read("pan1", 0),
            volume2: read("volume2", 0),
            pan2: read("pan2", 0),
            volume3: read("volume3", 0),
            pan3: read("pan3", 0),
            volume4: read("volume4", 0),
            pan4: read("pan4", 0),
            amplitude: read("amplitude", 0),
          },
        );
      },
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
