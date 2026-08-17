// Extracted from node-live-audio-worklet-core.js (Phase D — native destroy).
// Load after core class, before registerProcessor.

NodeLiveAudioProcessor.prototype.destroySabrinaReverbState = function destroySabrinaReverbState(state) {
    if (state) {
      this.resetSabrinaBlockCache?.(state);
      state.nativeBoundParams = null;
      state.cachedParams = null;
    }
    if (!state?.nativeHandle || !this.nativeSabrinaReverb?.soemdsp_sabrina_reverb_destroy) {
      return;
    }
    this.nativeSabrinaReverb.soemdsp_sabrina_reverb_destroy(state.nativeHandle);
    state.nativeHandle = 0;
};

NodeLiveAudioProcessor.prototype.destroyStereoFilterNativeState = function destroyStereoFilterNativeState(bundle, destroyFn) {
    for (const channelState of [bundle?.mono, bundle?.left, bundle?.right]) {
      if (channelState) {
        destroyFn(channelState);
      }
    }
};

NodeLiveAudioProcessor.prototype.destroyFbmNativeState = function destroyFbmNativeState(state) {
    if (state.nativeHandle && this.nativeFbm?.soemdsp_fbm_destroy) {
      this.nativeFbm.soemdsp_fbm_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyLadderFilterNativeState = function destroyLadderFilterNativeState(state) {
    if (state.nativeHandle && this.nativeLadderFilter?.soemdsp_ladder_filter_destroy) {
      this.nativeLadderFilter.soemdsp_ladder_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyFlowerChildFilterNativeState = function destroyFlowerChildFilterNativeState(state) {
    if (state.nativeHandle && this.nativeFlowerChildFilter?.soemdsp_flower_child_filter_destroy) {
      this.nativeFlowerChildFilter.soemdsp_flower_child_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyActiveFilterNativeState = function destroyActiveFilterNativeState(state) {
    if (state.nativeHandle && this.nativeActiveFilter?.soemdsp_active_filter_destroy) {
      this.nativeActiveFilter.soemdsp_active_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

// destroyScientificIirNativeState is defined in scientific-iir-worklet-evaluator.js

NodeLiveAudioProcessor.prototype.destroyYellowjacketFilterNativeState = function destroyYellowjacketFilterNativeState(state) {
    if (state.nativeHandle && this.nativeYellowjacketFilter?.soemdsp_yellowjacket_filter_destroy) {
      this.nativeYellowjacketFilter.soemdsp_yellowjacket_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroySuperloveFilterNativeState = function destroySuperloveFilterNativeState(state) {
    if (state.nativeHandle && this.nativeSuperloveFilter?.soemdsp_superlove_filter_destroy) {
      this.nativeSuperloveFilter.soemdsp_superlove_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyChaoticPhaseLockingFilterNativeState = function destroyChaoticPhaseLockingFilterNativeState(state) {
    if (state.nativeHandle && this.nativeChaoticPhaseLockingFilter?.soemdsp_chaotic_phase_locking_filter_destroy) {
      this.nativeChaoticPhaseLockingFilter.soemdsp_chaotic_phase_locking_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyResonatorFilterNativeState = function destroyResonatorFilterNativeState(state) {
    if (state.nativeHandle && this.nativeResonatorFilter?.soemdsp_resonator_filter_destroy) {
      this.nativeResonatorFilter.soemdsp_resonator_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyHumanFilterNativeState = function destroyHumanFilterNativeState(state) {
    if (state.nativeHandle && this.nativeHumanFilter?.soemdsp_human_filter_destroy) {
      this.nativeHumanFilter.soemdsp_human_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyPulseExplosionNativeState = function destroyPulseExplosionNativeState(state) {
    if (state.nativeHandle && this.nativePulseExplosion?.soemdsp_pulse_explosion_destroy) {
      this.nativePulseExplosion.soemdsp_pulse_explosion_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyComparatorNativeState = function destroyComparatorNativeState(state) {
    if (state.nativeHandle && this.nativeComparator?.soemdsp_comparator_destroy) {
      this.nativeComparator.soemdsp_comparator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroySampleDelayNativeState = function destroySampleDelayNativeState(state) {
    if (state?.nativeHandle && this.nativeSampleDelay?.soemdsp_sample_delay_destroy) {
      this.nativeSampleDelay.soemdsp_sample_delay_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyMinMaxNativeState = function destroyMinMaxNativeState(state) {
    if (state.nativeHandle && this.nativeMinMax?.soemdsp_min_max_destroy) {
      this.nativeMinMax.soemdsp_min_max_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyTransportNativeState = function destroyTransportNativeState(state) {
    if (state.nativeHandle && this.nativeTransport?.soemdsp_transport_destroy) {
      this.nativeTransport.soemdsp_transport_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroySlewLimiterNativeState = function destroySlewLimiterNativeState(state) {
    if (state.nativeHandle && this.nativeSlewLimiter?.soemdsp_slew_limiter_destroy) {
      this.nativeSlewLimiter.soemdsp_slew_limiter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroySampleHoldNativeState = function destroySampleHoldNativeState(state) {
    if (state.nativeHandle && this.nativeSampleHold?.soemdsp_sample_hold_destroy) {
      this.nativeSampleHold.soemdsp_sample_hold_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyChordMemoryNativeState = function destroyChordMemoryNativeState(state) {
    if (state.nativeHandle && this.nativeChordMemory?.soemdsp_chord_memory_destroy) {
      this.nativeChordMemory.soemdsp_chord_memory_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyTuringMachineNativeState = function destroyTuringMachineNativeState(state) {
    if (state.nativeHandle && this.nativeTuringMachine?.soemdsp_turing_machine_destroy) {
      this.nativeTuringMachine.soemdsp_turing_machine_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyFlowerChildEnvelopeFollowerNativeState = function destroyFlowerChildEnvelopeFollowerNativeState(state) {
    if (state.nativeHandle && this.nativeFlowerChildEnvelopeFollower?.soemdsp_flower_child_envelope_follower_destroy) {
      this.nativeFlowerChildEnvelopeFollower.soemdsp_flower_child_envelope_follower_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyTriggerDividerNativeState = function destroyTriggerDividerNativeState(state) {
    if (state.nativeHandle && this.nativeTriggerDivider?.soemdsp_trigger_divider_destroy) {
      this.nativeTriggerDivider.soemdsp_trigger_divider_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyStepSequencerNativeState = function destroyStepSequencerNativeState(state) {
    if (state.nativeHandle && this.nativeStepSequencer?.soemdsp_step_sequencer_destroy) {
      this.nativeStepSequencer.soemdsp_step_sequencer_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyTriggerCounterNativeState = function destroyTriggerCounterNativeState(state) {
    if (state.nativeHandle && this.nativeTriggerCounter?.soemdsp_trigger_counter_destroy) {
      this.nativeTriggerCounter.soemdsp_trigger_counter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyDelayedTriggerNativeState = function destroyDelayedTriggerNativeState(state) {
    if (state.nativeHandle && this.nativeDelayedTrigger?.soemdsp_delayed_trigger_destroy) {
      this.nativeDelayedTrigger.soemdsp_delayed_trigger_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyClockNativeState = function destroyClockNativeState(state) {
    if (state.nativeHandle && this.nativeClock?.soemdsp_clock_destroy) {
      this.nativeClock.soemdsp_clock_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyRandomClockNativeState = function destroyRandomClockNativeState(state) {
    if (state.nativeHandle && this.nativeRandomClock?.soemdsp_random_clock_destroy) {
      this.nativeRandomClock.soemdsp_random_clock_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyPingPongDelayNativeState = function destroyPingPongDelayNativeState(state) {
    if (state.nativeHandle && this.nativePingPongDelay?.soemdsp_ping_pong_delay_destroy) {
      this.nativePingPongDelay.soemdsp_ping_pong_delay_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyPapoulisFilterNativeState = function destroyPapoulisFilterNativeState(state) {
    if (state.nativeHandle && this.nativePapoulisFilter?.soemdsp_papoulis_filter_destroy) {
      this.nativePapoulisFilter.soemdsp_papoulis_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyPapoulisParameterSmootherNativeState = function destroyPapoulisParameterSmootherNativeState(smoother) {
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
};

NodeLiveAudioProcessor.prototype.destroyAllPapoulisParameterSmootherNativeStates = function destroyAllPapoulisParameterSmootherNativeStates() {
    for (const smoother of this.smoothers.values()) {
      this.destroyPapoulisParameterSmootherNativeState(smoother);
    }
};

NodeLiveAudioProcessor.prototype.destroyPhosphillatorNativeState = function destroyPhosphillatorNativeState(state) {
    if (state.nativeHandle && this.nativePhosphillator?.soemdsp_phosphillator_destroy) {
      this.nativePhosphillator.soemdsp_phosphillator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
    state.nativePathRef = null;
};

NodeLiveAudioProcessor.prototype.destroyAliasSineNativeState = function destroyAliasSineNativeState(state) {
    if (state.nativeHandle && this.nativeAliasSine?.soemdsp_alias_sine_destroy) {
      this.nativeAliasSine.soemdsp_alias_sine_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyTb303FilterNativeState = function destroyTb303FilterNativeState(state) {
    if (state.nativeHandle && this.nativeTb303Filter?.soemdsp_tb303_filter_destroy) {
      this.nativeTb303Filter.soemdsp_tb303_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyPassiveFilterNativeState = function destroyPassiveFilterNativeState(state) {
    if (state?.nativeHandle && this.nativePassiveFilter?.soemdsp_passive_filter_destroy) {
      this.nativePassiveFilter.soemdsp_passive_filter_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyVactrolEnvelopeNativeState = function destroyVactrolEnvelopeNativeState(state) {
    if (state?.nativeHandle && this.nativeVactrolEnvelope?.soemdsp_vactrol_envelope_destroy) {
      this.nativeVactrolEnvelope.soemdsp_vactrol_envelope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyLogisticMapNativeState = function destroyLogisticMapNativeState(state) {
    if (state?.nativeHandle && this.nativeLogisticMap?.soemdsp_logistic_map_destroy) {
      this.nativeLogisticMap.soemdsp_logistic_map_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyPolyBlepNativeState = function destroyPolyBlepNativeState(state) {
    if (state?.nativeHandle && this.nativePolyBlep?.soemdsp_polyblep_destroy) {
      this.nativePolyBlep.soemdsp_polyblep_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyBlitNativeState = function destroyBlitNativeState(state) {
    if (state?.nativeHandle && this.nativeBlit?.soemdsp_blit_destroy) {
      this.nativeBlit.soemdsp_blit_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyArchimedesNativeState = function destroyArchimedesNativeState(state) {
    if (state?.nativeHandle && this.nativeArchimedes?.soemdsp_archimedes_destroy) {
      this.nativeArchimedes.soemdsp_archimedes_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyHenonMapNativeState = function destroyHenonMapNativeState(state) {
    if (state?.nativeHandle && this.nativeHenonMap?.soemdsp_henon_map_destroy) {
      this.nativeHenonMap.soemdsp_henon_map_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyWirdoSpiralNativeState = function destroyWirdoSpiralNativeState(state) {
    if (state?.nativeHandle && this.nativeWirdoSpiral?.soemdsp_jbwirdo_destroy) {
      this.nativeWirdoSpiral.soemdsp_jbwirdo_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyBlubbNativeState = function destroyBlubbNativeState(state) {
    if (state?.nativeHandle && this.nativeBlubb?.soemdsp_jbblubb_destroy) {
      this.nativeBlubb.soemdsp_jbblubb_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyMushroomNativeState = function destroyMushroomNativeState(state) {
    if (state?.nativeHandle && this.nativeMushroom?.soemdsp_jbmushroom_destroy) {
      this.nativeMushroom.soemdsp_jbmushroom_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyBoingNativeState = function destroyBoingNativeState(state) {
    if (state?.nativeHandle && this.nativeBoing?.soemdsp_jbboing_destroy) {
      this.nativeBoing.soemdsp_jbboing_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyTorusNativeState = function destroyTorusNativeState(state) {
    if (state?.nativeHandle && this.nativeTorus?.soemdsp_jbtorus_destroy) {
      this.nativeTorus.soemdsp_jbtorus_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyKeplerBouwkampNativeState = function destroyKeplerBouwkampNativeState(state) {
    if (state?.nativeHandle && this.nativeKeplerBouwkamp?.soemdsp_jbkepler_destroy) {
      this.nativeKeplerBouwkamp.soemdsp_jbkepler_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyNyquistShannonNativeState = function destroyNyquistShannonNativeState(state) {
    if (state?.nativeHandle && this.nativeNyquistShannon?.soemdsp_jbnyquist_destroy) {
      this.nativeNyquistShannon.soemdsp_jbnyquist_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyRadarNativeState = function destroyRadarNativeState(state) {
    if (state?.nativeHandle && this.nativeRadar?.soemdsp_jbradar_destroy) {
      this.nativeRadar.soemdsp_jbradar_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyChuaAttractorNativeState = function destroyChuaAttractorNativeState(state) {
    if (state?.nativeHandle && this.nativeChuaAttractor?.soemdsp_chua_attractor_destroy) {
      this.nativeChuaAttractor.soemdsp_chua_attractor_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyPitchQuantizerNativeState = function destroyPitchQuantizerNativeState(state) {
    if (state?.nativeHandle && this.nativePitchQuantizer?.soemdsp_pitch_quantizer_destroy) {
      this.nativePitchQuantizer.soemdsp_pitch_quantizer_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyChordSequencerNativeState = function destroyChordSequencerNativeState(state) {
    if (state?.nativeHandle && this.nativeChordSequencer?.soemdsp_chord_sequencer_destroy) {
      this.nativeChordSequencer.soemdsp_chord_sequencer_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyLutCellNativeState = function destroyLutCellNativeState(state) {
    if (state?.nativeHandle && this.nativeLutCell?.soemdsp_lut_cell_destroy) {
      this.nativeLutCell.soemdsp_lut_cell_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroySurgeOscillatorNativeState = function destroySurgeOscillatorNativeState(state) {
    if (state?.nativeHandle && this.nativeSurgeOscillator?.soemdsp_surge_oscillator_destroy) {
      this.nativeSurgeOscillator.soemdsp_surge_oscillator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyDsfOscillatorNativeState = function destroyDsfOscillatorNativeState(state) {
    if (state?.nativeHandle && this.nativeDsfOscillator?.soemdsp_dsf_oscillator_destroy) {
      this.nativeDsfOscillator.soemdsp_dsf_oscillator_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyLinearEnvelopeNativeState = function destroyLinearEnvelopeNativeState(state) {
    if (state?.nativeHandle && this.nativeLinearEnvelope?.soemdsp_linear_envelope_destroy) {
      this.nativeLinearEnvelope.soemdsp_linear_envelope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroySineWavetableNativeState = function destroySineWavetableNativeState(state) {
    if (state?.nativeHandle && this.nativeSineWavetable?.soemdsp_sine_wavetable_destroy) {
      this.nativeSineWavetable.soemdsp_sine_wavetable_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyLogSpiralNativeState = function destroyLogSpiralNativeState(state) {
    if (state?.nativeHandle && this.nativeLogSpiral?.soemdsp_log_spiral_destroy) {
      this.nativeLogSpiral.soemdsp_log_spiral_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroySnowflakeNativeState = function destroySnowflakeNativeState(state) {
    if (state?.nativeHandle && this.nativeSnowflake?.soemdsp_snowflake_destroy) {
      this.nativeSnowflake.soemdsp_snowflake_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyFractalSpiralNativeState = function destroyFractalSpiralNativeState(state) {
    if (state?.nativeHandle && this.nativeFractalSpiral?.soemdsp_fractal_spiral_destroy) {
      this.nativeFractalSpiral.soemdsp_fractal_spiral_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyJerobeamSpiralNativeState = function destroyJerobeamSpiralNativeState(state) {
    if (state?.nativeHandle && this.nativeJerobeamSpiral?.soemdsp_jerobeam_spiral_destroy) {
      this.nativeJerobeamSpiral.soemdsp_jerobeam_spiral_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyDelayEffectNativeState = function destroyDelayEffectNativeState(state) {
    for (const channelState of [state?.mono, state?.left, state?.right]) {
      if (channelState?.nativeHandle && this.nativeDelayEffect?.soemdsp_delay_effect_destroy) {
        this.nativeDelayEffect.soemdsp_delay_effect_destroy(channelState.nativeHandle);
        channelState.nativeHandle = 0;
      }
    }
};

NodeLiveAudioProcessor.prototype.destroyPluckEnvelopeNativeState = function destroyPluckEnvelopeNativeState(state) {
    if (state?.nativeHandle && this.nativePluckEnvelope?.soemdsp_pluck_envelope_destroy) {
      this.nativePluckEnvelope.soemdsp_pluck_envelope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyExpAdsrNativeState = function destroyExpAdsrNativeState(state) {
    if (state?.nativeHandle && this.nativeExpAdsr?.soemdsp_exp_adsr_destroy) {
      this.nativeExpAdsr.soemdsp_exp_adsr_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyRandomWalkNativeState = function destroyRandomWalkNativeState(state) {
    if (state?.nativeHandle && this.nativeRandomWalk?.soemdsp_random_walk_destroy) {
      this.nativeRandomWalk.soemdsp_random_walk_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyPiSpigotNoiseNativeState = function destroyPiSpigotNoiseNativeState(state) {
    if (state?.nativeHandle && this.nativePiSpigotNoise?.soemdsp_pi_spigot_noise_destroy) {
      this.nativePiSpigotNoise.soemdsp_pi_spigot_noise_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyBradley2ANativeState = function destroyBradley2ANativeState(state) {
    if (state?.nativeHandle && this.nativeBradley2A?.soemdsp_bradley_2a_destroy) {
      this.nativeBradley2A.soemdsp_bradley_2a_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyAntisawNativeState = function destroyAntisawNativeState(state) {
    if (state?.nativeHandle && this.nativeAntisaw?.soemdsp_antisaw_destroy) {
      this.nativeAntisaw.soemdsp_antisaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyLorenzAttractorNativeState = function destroyLorenzAttractorNativeState(state) {
    if (state?.nativeHandle && this.nativeLorenzAttractor?.soemdsp_lorenz_attractor_destroy) {
      this.nativeLorenzAttractor.soemdsp_lorenz_attractor_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyRobinSupersawNativeState = function destroyRobinSupersawNativeState(state) {
    if (state?.nativeHandle && this.nativeRobinSupersaw?.soemdsp_robin_supersaw_destroy) {
      this.nativeRobinSupersaw.soemdsp_robin_supersaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyHypersawNativeState = function destroyHypersawNativeState(state) {
    if (state?.nativeHandle && this.nativeHypersaw?.soemdsp_hypersaw_destroy) {
      this.nativeHypersaw.soemdsp_hypersaw_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

NodeLiveAudioProcessor.prototype.destroyVideoscopeNativeState = function destroyVideoscopeNativeState(state) {
    if (state?.nativeHandle && this.nativeVideoscope?.soemdsp_videoscope_destroy) {
      this.nativeVideoscope.soemdsp_videoscope_destroy(state.nativeHandle);
      state.nativeHandle = 0;
    }
};

