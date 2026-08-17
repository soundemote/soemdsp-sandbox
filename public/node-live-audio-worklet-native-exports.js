// Extracted from node-live-audio-worklet-core.js (Phase D mechanical split).
// Method: applyNativeModuleExports — load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.applyNativeModuleExports = function applyNativeModuleExports(name, targetType, exports) {
      if (name === "ellipsoid" || targetType === "ellipsoid") {
        this.nativeEllipsoid = exports;
        this.nativeEllipsoidReady = Boolean(
          this.nativeEllipsoid?.soemdsp_ellipsoid_sine_to_square_mode
          || this.nativeEllipsoid?.soemdsp_ellipsoid_sine_to_square_aa
          || this.nativeEllipsoid?.soemdsp_ellipsoid_sine_to_square
          || this.nativeEllipsoid?.soemdsp_ellipsoid_sample,
        );
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
      if (name === "soem_reverb" || targetType === "soemReverb") {
        if (this.soemReverbStates) {
          for (const state of this.soemReverbStates.values()) {
            if (state?.nativeHandle && this.nativeSoemReverb?.soemdsp_soem_reverb_destroy) {
              this.nativeSoemReverb.soemdsp_soem_reverb_destroy(state.nativeHandle);
              state.nativeHandle = 0;
            }
          }
        }
        this.nativeSoemReverb = exports;
        this.nativeSoemReverbReady = Boolean(
          this.nativeSoemReverb?.soemdsp_soem_reverb_create
          && this.nativeSoemReverb?.soemdsp_soem_reverb_process
          && this.nativeSoemReverb?.soemdsp_soem_reverb_left
          && this.nativeSoemReverb?.soemdsp_soem_reverb_right,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "soem_reverb",
          status: this.nativeSoemReverbReady ? "ready" : "missing exports",
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
        if (this.softClipperStates) {
          for (const state of this.softClipperStates.values()) {
            this.destroySoftClipperState?.(state);
          }
        }
        if (this.clipperLimiterStates) {
          for (const state of this.clipperLimiterStates.values()) {
            this.destroySoftClipperState?.(state);
          }
        }
        this.nativeSoftClipper = exports;
        this.nativeSoftClipperReady = Boolean(
          this.nativeSoftClipper?.soemdsp_soft_clipper_sample
          || this.nativeSoftClipper?.soemdsp_soft_clipper_sample_aa,
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
      if (name === "fbm_field" || targetType === "fbmField") {
        if (this.fbmFieldStates && typeof this.fbmFieldStates.values === "function") {
          for (const state of this.fbmFieldStates.values()) {
            this.destroyFbmFieldNativeState?.(state);
          }
        }
        this.nativeFbmField = exports;
        this.nativeFbmFieldReady = Boolean(
          this.nativeFbmField?.soemdsp_fbm_field_create &&
          this.nativeFbmField?.soemdsp_fbm_field_sample &&
          this.nativeFbmField?.soemdsp_fbm_field_x &&
          this.nativeFbmField?.soemdsp_fbm_field_y &&
          this.nativeFbmField?.soemdsp_fbm_field_z,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "fbm_field",
          status: this.nativeFbmFieldReady ? "ready" : "missing exports",
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
      if (name === "active_filter" || targetType === "activeFilter") {
        if (this.activeFilterStates) {
          for (const state of this.activeFilterStates.values()) {
            this.destroyStereoFilterNativeState(state, (s) => this.destroyActiveFilterNativeState(s));
          }
        }
        this.nativeActiveFilter = exports;
        this.nativeActiveFilterReady = Boolean(
          this.nativeActiveFilter?.soemdsp_active_filter_create &&
          this.nativeActiveFilter?.soemdsp_active_filter_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "active_filter",
          status: this.nativeActiveFilterReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "butterworth" || targetType === "butterworth") {
        if (this.butterworthStates) {
          for (const state of this.butterworthStates.values()) {
            this.destroyStereoFilterNativeState(state, (s) => this.destroyScientificIirNativeState("butterworth", s));
          }
        }
        this.nativeButterworth = exports;
        this.nativeButterworthReady = Boolean(exports?.soemdsp_butterworth_create && exports?.soemdsp_butterworth_sample);
        this.port.postMessage({ type: "nativeModuleStatus", name: "butterworth", status: this.nativeButterworthReady ? "ready" : "missing exports" });
        return;
      }
      if (name === "linkwitz_riley" || targetType === "linkwitzRiley") {
        if (this.linkwitzRileyStates) {
          for (const state of this.linkwitzRileyStates.values()) {
            this.destroyStereoFilterNativeState(state, (s) => this.destroyScientificIirNativeState("linkwitzRiley", s));
          }
        }
        this.nativeLinkwitzRiley = exports;
        this.nativeLinkwitzRileyReady = Boolean(exports?.soemdsp_linkwitz_riley_create && exports?.soemdsp_linkwitz_riley_sample);
        this.port.postMessage({ type: "nativeModuleStatus", name: "linkwitz_riley", status: this.nativeLinkwitzRileyReady ? "ready" : "missing exports" });
        return;
      }
      if (
        name === "crossover"
        || targetType === "crossover2"
        || targetType === "crossover3"
        || targetType === "crossover4"
        || targetType === "crossover5"
        || targetType === "crossover6"
      ) {
        for (const mapName of ["crossover2States", "crossover3States", "crossover4States", "crossover5States", "crossover6States"]) {
          const map = this[mapName];
          if (!map) continue;
          for (const state of map.values()) {
            if (state?.nativeHandle && this.nativeCrossover?.soemdsp_crossover_destroy) {
              try { this.nativeCrossover.soemdsp_crossover_destroy(state.nativeHandle); } catch (_) { /* ignore */ }
            }
            if (state) state.nativeHandle = 0;
          }
        }
        this.nativeCrossover = exports;
        this.nativeCrossoverReady = Boolean(
          exports?.soemdsp_crossover_create
          && exports?.soemdsp_crossover_sample
          && exports?.soemdsp_crossover_band_l
          && exports?.soemdsp_crossover_band_r,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "crossover",
          status: this.nativeCrossoverReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "mode_resonator" || targetType === "modeResonator") {
        if (this.modeResonatorStates) {
          for (const state of this.modeResonatorStates.values()) {
            if (state?.nativeHandle && this.nativeModeResonator?.soemdsp_mode_resonator_destroy) {
              try { this.nativeModeResonator.soemdsp_mode_resonator_destroy(state.nativeHandle); } catch (_) { /* ignore */ }
            }
            if (state) state.nativeHandle = 0;
          }
        }
        this.nativeModeResonator = exports;
        this.nativeModeResonatorReady = Boolean(
          exports?.soemdsp_mode_resonator_create && exports?.soemdsp_mode_resonator_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "mode_resonator",
          status: this.nativeModeResonatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "comb_resonator" || targetType === "combResonator") {
        if (this.combResonatorStates) {
          for (const state of this.combResonatorStates.values()) {
            if (state?.nativeHandle && this.nativeCombResonator?.soemdsp_comb_resonator_destroy) {
              try { this.nativeCombResonator.soemdsp_comb_resonator_destroy(state.nativeHandle); } catch (_) { /* ignore */ }
            }
            if (state) state.nativeHandle = 0;
          }
        }
        this.nativeCombResonator = exports;
        this.nativeCombResonatorReady = Boolean(
          exports?.soemdsp_comb_resonator_create && exports?.soemdsp_comb_resonator_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "comb_resonator",
          status: this.nativeCombResonatorReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "bessel" || targetType === "bessel") {
        if (this.besselStates) {
          for (const state of this.besselStates.values()) {
            this.destroyStereoFilterNativeState(state, (s) => this.destroyScientificIirNativeState("bessel", s));
          }
        }
        this.nativeBessel = exports;
        this.nativeBesselReady = Boolean(exports?.soemdsp_bessel_create && exports?.soemdsp_bessel_sample);
        this.port.postMessage({ type: "nativeModuleStatus", name: "bessel", status: this.nativeBesselReady ? "ready" : "missing exports" });
        return;
      }
      if (name === "chebyshev" || targetType === "chebyshev") {
        if (this.chebyshevStates) {
          for (const state of this.chebyshevStates.values()) {
            this.destroyStereoFilterNativeState(state, (s) => this.destroyScientificIirNativeState("chebyshev", s));
          }
        }
        this.nativeChebyshev = exports;
        this.nativeChebyshevReady = Boolean(exports?.soemdsp_chebyshev_create && exports?.soemdsp_chebyshev_sample);
        this.port.postMessage({ type: "nativeModuleStatus", name: "chebyshev", status: this.nativeChebyshevReady ? "ready" : "missing exports" });
        return;
      }
      if (name === "elliptic" || targetType === "elliptic") {
        if (this.ellipticStates) {
          for (const state of this.ellipticStates.values()) {
            this.destroyStereoFilterNativeState(state, (s) => this.destroyScientificIirNativeState("elliptic", s));
          }
        }
        this.nativeElliptic = exports;
        this.nativeEllipticReady = Boolean(exports?.soemdsp_elliptic_create && exports?.soemdsp_elliptic_sample);
        this.port.postMessage({ type: "nativeModuleStatus", name: "elliptic", status: this.nativeEllipticReady ? "ready" : "missing exports" });
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
      if (name === "sample_delay" || targetType === "sampleDelay") {
        for (const state of this.sampleDelayStates.values()) {
          this.destroySampleDelayNativeState(state);
        }
        this.nativeSampleDelay = exports;
        this.nativeSampleDelayReady = Boolean(
          this.nativeSampleDelay?.soemdsp_sample_delay_create &&
          this.nativeSampleDelay?.soemdsp_sample_delay_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "sample_delay",
          status: this.nativeSampleDelayReady ? "ready" : "missing exports",
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
        // Param smoothers also hold native Papoulis handles — release before swap.
        this.destroyAllPapoulisParameterSmootherNativeStates();
        this.nativePapoulisFilter = exports;
        this.nativePapoulisFilterReady = Boolean(
          this.nativePapoulisFilter?.soemdsp_papoulis_filter_create &&
          this.nativePapoulisFilter?.soemdsp_papoulis_filter_sample,
        );
        this.bindPapoulisParameterSmootherNativeHost();
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
      if (name === "ray_bouncer" || targetType === "rayBouncer") {
        for (const state of this.rayBouncerStates.values()) {
          this.destroyRayBouncerNativeState(state);
        }
        this.nativeRayBouncer = exports;
        this.nativeRayBouncerReady = Boolean(
          this.nativeRayBouncer?.soemdsp_ray_bouncer_create &&
          this.nativeRayBouncer?.soemdsp_ray_bouncer_sample &&
          this.nativeRayBouncer?.soemdsp_ray_bouncer_x &&
          this.nativeRayBouncer?.soemdsp_ray_bouncer_y,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "ray_bouncer",
          status: this.nativeRayBouncerReady ? "ready" : "missing exports",
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
      if (name === "u2b" || targetType === "u2b") {
        this.nativeU2b = exports;
        this.nativeU2bReady = Boolean(this.nativeU2b?.soemdsp_u2b_sample);
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "u2b",
          status: this.nativeU2bReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "b2u" || targetType === "b2u") {
        this.nativeB2u = exports;
        this.nativeB2uReady = Boolean(this.nativeB2u?.soemdsp_b2u_sample);
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "b2u",
          status: this.nativeB2uReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "inv" || targetType === "inv") {
        this.nativeInv = exports;
        this.nativeInvReady = Boolean(this.nativeInv?.soemdsp_inv_sample);
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "inv",
          status: this.nativeInvReady ? "ready" : "missing exports",
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
      if (name === "robin_sinusoid" || targetType === "robinSinusoid") {
        if (this.robinSinusoidStates) {
          for (const state of this.robinSinusoidStates.values()) {
            this.destroyRobinSinusoidNativeState(state);
          }
        }
        this.nativeRobinSinusoid = exports;
        this.nativeRobinSinusoidReady = Boolean(
          this.nativeRobinSinusoid?.soemdsp_robin_sinusoid_create &&
          this.nativeRobinSinusoid?.soemdsp_robin_sinusoid_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "robin_sinusoid",
          status: this.nativeRobinSinusoidReady ? "ready" : "missing exports",
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
      if (name === "snowflake" || targetType === "snowflake") {
        if (this.snowflakeStates) {
          for (const state of this.snowflakeStates.values()) {
            this.destroySnowflakeNativeState?.(state);
          }
        }
        this.nativeSnowflake = exports;
        this.nativeSnowflakeReady = Boolean(
          this.nativeSnowflake?.soemdsp_snowflake_create &&
          this.nativeSnowflake?.soemdsp_snowflake_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "snowflake",
          status: this.nativeSnowflakeReady ? "ready" : "missing exports",
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
      if (name === "raster_rgb" || targetType === "rasterRgb") {
        if (this.rasterRgbStates) {
          for (const state of this.rasterRgbStates.values()) {
            if (state?.nativeHandle && this.nativeRasterRgb?.soemdsp_raster_rgb_destroy) {
              this.nativeRasterRgb.soemdsp_raster_rgb_destroy(state.nativeHandle);
              state.nativeHandle = 0;
            }
          }
        }
        this.nativeRasterRgb = exports;
        this.nativeRasterRgbReady = Boolean(
          this.nativeRasterRgb?.soemdsp_raster_rgb_create
          && this.nativeRasterRgb?.soemdsp_raster_rgb_sample
          && this.nativeRasterRgb?.soemdsp_raster_rgb_r,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "raster_rgb",
          status: this.nativeRasterRgbReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "sinc" || targetType === "sinc") {
        for (const state of this.sincStates.values()) {
          if (state?.nativeHandle && this.nativeSinc?.soemdsp_sinc_destroy) {
            this.nativeSinc.soemdsp_sinc_destroy(state.nativeHandle);
            state.nativeHandle = 0;
          }
        }
        this.nativeSinc = exports;
        this.nativeSincReady = Boolean(
          this.nativeSinc?.soemdsp_sinc_create && this.nativeSinc?.soemdsp_sinc_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "sinc",
          status: this.nativeSincReady ? "ready" : "missing exports",
        });
        return;
      }
      if (name === "softwave" || targetType === "softwaveOsc") {
        if (this.softwaveOscStates) {
          for (const state of this.softwaveOscStates.values()) {
            if (state?.nativeHandle && this.nativeSoftwave?.soemdsp_softwave_destroy) {
              this.nativeSoftwave.soemdsp_softwave_destroy(state.nativeHandle);
              state.nativeHandle = 0;
            }
          }
        }
        this.nativeSoftwave = exports;
        this.nativeSoftwaveReady = Boolean(
          this.nativeSoftwave?.soemdsp_softwave_create && this.nativeSoftwave?.soemdsp_softwave_sample,
        );
        this.port.postMessage({
          type: "nativeModuleStatus",
          name: "softwave",
          status: this.nativeSoftwaveReady ? "ready" : "missing exports",
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
};
