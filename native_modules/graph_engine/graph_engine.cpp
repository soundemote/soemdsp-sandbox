// soemdsp-native-module: graph_engine
// soemdsp-native-label: Graph Engine
// soemdsp-native-target: graphEngine
// soemdsp-native-kind: engine
//
// MVEP GraphEngine: orchestrates efficient-product natives
// (polyBlep, ladderFilter, softClipper, reverb, pingPong, attenuverter, range,
// output) inside soemdsp_graph_process_block. Live ƒ jacks mix from wired
// buffers; Control knobs: set_param writes targets; native SmootherManager
// chases out. Scope taps via node_port_ptr. DSP lives in natives; this is glue.

#include "../sandbox_native_maths/sandbox_native_maths.h"
#include "../sandbox_native_maths/exp_log.h"
#include "../sandbox_native_maths/analog_filter_trig.h"
#include "../sandbox_native_maths/scalar_helpers.h"

// Combined wasm resolves these; standalone graph_engine.wasm links with
// --allow-undefined (stubs unused — product loads soemdsp_combined.wasm).
extern "C" int soemdsp_polyblep_create();
extern "C" void soemdsp_polyblep_destroy(int handle);
extern "C" void soemdsp_polyblep_reset(int handle);
extern "C" void soemdsp_polyblep_process_block(
  int handle, int frameCount, double phase0, double phaseIncrement,
  int waveform, double level, double morph, int tapMask
);
extern "C" void soemdsp_polyblep_sample_masked(
  int handle, double phase, double phaseIncrement,
  int waveform, double level, double morph, int tapMask
);
extern "C" int soemdsp_polyblep_block_out_ptr(int handle, int tapIndex);
extern "C" double soemdsp_polyblep_out(int handle);
extern "C" double soemdsp_polyblep_saw(int handle);
extern "C" double soemdsp_polyblep_ramp(int handle);
extern "C" double soemdsp_polyblep_square(int handle);
extern "C" double soemdsp_polyblep_tri(int handle);
extern "C" double soemdsp_polyblep_sine(int handle);

extern "C" int soemdsp_ladder_filter_create();
extern "C" void soemdsp_ladder_filter_destroy(int handle);
extern "C" void soemdsp_ladder_filter_set_params(
  int handle, double frequency, double resonance, int mode, int stages, double sampleRate
);
extern "C" double soemdsp_ladder_filter_sample(
  int handle, double input, double frequency, double resonance,
  int mode, int stages, double sampleRate
);
extern "C" void soemdsp_ladder_filter_process_block(int handle, int frameCount);
extern "C" int soemdsp_ladder_filter_block_input_ptr(int handle);
extern "C" int soemdsp_ladder_filter_block_output_ptr(int handle);

extern "C" int soemdsp_soft_clipper_create();
extern "C" void soemdsp_soft_clipper_destroy(int handle);
extern "C" void soemdsp_soft_clipper_set_params(
  int handle, double center, double width, double antialias, int oversampleMode
);
extern "C" void soemdsp_soft_clipper_process_block(int handle, int channel, int frameCount);
extern "C" int soemdsp_soft_clipper_block_input_ptr(int handle, int channel);
extern "C" int soemdsp_soft_clipper_block_output_ptr(int handle, int channel);

extern "C" int soemdsp_sabrina_reverb_create(double sampleRate);
extern "C" void soemdsp_sabrina_reverb_destroy(int handle);
extern "C" void soemdsp_sabrina_reverb_reset(int handle, double sampleRate);
extern "C" void soemdsp_sabrina_reverb_set_params(
  int handle,
  double mix, double diffusionSize, double diffusionAmount, double delaySize,
  double recycle, double lfoAmplitude, double lfoBaseSpeed, double lfoVariation,
  double seed
);
extern "C" void soemdsp_sabrina_reverb_process_block(int handle, int frameCount, int useSimd);
extern "C" int soemdsp_sabrina_reverb_block_input_left_ptr(int handle);
extern "C" int soemdsp_sabrina_reverb_block_input_right_ptr(int handle);
extern "C" int soemdsp_sabrina_reverb_block_output_left_ptr(int handle);
extern "C" int soemdsp_sabrina_reverb_block_output_right_ptr(int handle);

extern "C" int soemdsp_ping_pong_delay_create();
extern "C" void soemdsp_ping_pong_delay_destroy(int handle);
extern "C" void soemdsp_ping_pong_delay_reset(int handle);
extern "C" void soemdsp_ping_pong_delay_set_params(
  int handle,
  double feedback, double mix, double level,
  double timeNumerator, double timeDenominator, double timingMode,
  double offsetMs, double lfoStyle, double lfoRate, double lfoVariation,
  double saturate, double lpfFrequency, double hpfFrequency,
  double tempoBpm, double sampleRate
);
extern "C" void soemdsp_ping_pong_delay_process_block(int handle, int frameCount);
extern "C" int soemdsp_ping_pong_delay_block_input_ptr(int handle);
extern "C" int soemdsp_ping_pong_delay_block_output_left_ptr(int handle);
extern "C" int soemdsp_ping_pong_delay_block_output_right_ptr(int handle);
extern "C" int soemdsp_ping_pong_delay_block_output_mod_left_ptr(int handle);
extern "C" int soemdsp_ping_pong_delay_block_output_mod_right_ptr(int handle);

extern "C" int soemdsp_attenuverter_create();
extern "C" void soemdsp_attenuverter_destroy(int handle);
extern "C" void soemdsp_attenuverter_set_params(int handle, double amplitude, double offset);
extern "C" void soemdsp_attenuverter_process_block(int handle, int frameCount);
extern "C" int soemdsp_attenuverter_block_input_ptr(int handle);
extern "C" int soemdsp_attenuverter_block_output_ptr(int handle);

extern "C" int soemdsp_range_create();
extern "C" void soemdsp_range_destroy(int handle);
extern "C" void soemdsp_range_set_params(
  int handle, double inLow, double inHigh, double outLow, double outHigh
);
extern "C" void soemdsp_range_process_block(int handle, int frameCount);
extern "C" int soemdsp_range_block_input_ptr(int handle);
extern "C" int soemdsp_range_block_output_ptr(int handle);

// Free-function Gain (no instance) — matches native_modules/gain/gain.cpp.
extern "C" double soemdsp_gain_sample(
  double channel, double mono, double left, double right,
  double masterDb, double leftDb, double rightDb,
  double monoSum, double offset
);

extern "C" int soemdsp_noise_generator_create();
extern "C" void soemdsp_noise_generator_destroy(int handle);
extern "C" void soemdsp_noise_generator_process_block(
  int handle,
  double seedValue,
  int mode,
  double mean,
  double deviation,
  double shape,
  double level,
  int frameCount,
  int useSimd
);
extern "C" int soemdsp_noise_generator_block_output_left_ptr(int handle);
extern "C" int soemdsp_noise_generator_block_output_right_ptr(int handle);

extern "C" int soemdsp_robin_sinusoid_create();
extern "C" void soemdsp_robin_sinusoid_destroy(int handle);
extern "C" void soemdsp_robin_sinusoid_reset(int handle);
extern "C" double soemdsp_robin_sinusoid_sample(
  int handle, double frequencyHz, double amplitude, double sampleRate,
  double startPhaseRadians, double reset
);
extern "C" void soemdsp_robin_sinusoid_process_block(
  int handle, double frequencyHz, double amplitude, double sampleRate,
  double startPhaseRadians, double reset, int frameCount
);
extern "C" int soemdsp_robin_sinusoid_block_output_ptr(int handle);

extern "C" int soemdsp_robin_supersaw_create();
extern "C" void soemdsp_robin_supersaw_destroy(int handle);
extern "C" void soemdsp_robin_supersaw_reset(int handle);
extern "C" void soemdsp_robin_supersaw_process_block(
  int handle, double frequencyHz, double sampleRate, double detuneCents,
  int voices, double level, int frameCount
);
extern "C" int soemdsp_robin_supersaw_block_output_left_ptr(int handle);
extern "C" int soemdsp_robin_supersaw_block_output_right_ptr(int handle);
extern "C" int soemdsp_robin_supersaw_block_output_mono_ptr(int handle);

extern "C" int soemdsp_slew_limiter_create();
extern "C" void soemdsp_slew_limiter_destroy(int handle);
extern "C" void soemdsp_slew_limiter_process_block(
  int handle, double upTime, double downTime, double shape, double bias,
  double sampleRate, int frameCount
);
extern "C" int soemdsp_slew_limiter_block_input_ptr(int handle);
extern "C" int soemdsp_slew_limiter_block_output_ptr(int handle);

extern "C" int soemdsp_comparator_create();
extern "C" void soemdsp_comparator_destroy(int handle);
extern "C" double soemdsp_comparator_sample(int handle, double signalIn);
extern "C" double soemdsp_comparator_up(int handle);
extern "C" double soemdsp_comparator_down(int handle);
extern "C" double soemdsp_comparator_change(int handle);
extern "C" double soemdsp_comparator_steady(int handle);
extern "C" double soemdsp_comparator_sign(int handle);
extern "C" double soemdsp_comparator_thru(int handle);

extern "C" int soemdsp_sample_delay_create();
extern "C" void soemdsp_sample_delay_destroy(int handle);
extern "C" double soemdsp_sample_delay_sample(
  int handle, double input, double timeSeconds, double samplesParam, double sampleRate
);

extern "C" int soemdsp_sample_hold_create();
extern "C" void soemdsp_sample_hold_destroy(int handle);
extern "C" double soemdsp_sample_hold_sample(
  int handle, double input, double trigger, double threshold,
  double sampleFrequency, double sampleRate, int hasInConnected, int seed
);

extern "C" int soemdsp_min_max_create();
extern "C" void soemdsp_min_max_destroy(int handle);
extern "C" double soemdsp_min_max_sample(
  int handle, double in1, double in2, double in3, double in4, int connectedMask
);
extern "C" double soemdsp_min_max_min(int handle);

// Free-function Mix / MixStereo (no instance) — matches native mix*.cpp.
extern "C" double soemdsp_mix_sample(
  double channel,
  double in1, double in2, double in3, double in4,
  double volume1, double volume2, double volume3, double volume4,
  double bias1, double bias2, double bias3, double bias4,
  double bleed2to1, double bleed3to1, double bleed4to1
);
extern "C" double soemdsp_mix_stereo_sample(
  double channel,
  double l1, double r1, double l2, double r2, double l3, double r3, double l4, double r4,
  double mono,
  double vol1, double pan1, double vol2, double pan2, double vol3, double pan3, double vol4, double pan4,
  double amplitude
);

extern "C" int soemdsp_clipper_limiter_create();
extern "C" void soemdsp_clipper_limiter_destroy(int handle);
extern "C" double soemdsp_clipper_limiter_sample(
  int handle, int channel, double input, double minDb, double maxDb, double gainDb, double antialias
);

extern "C" double soemdsp_mid_side_encode_sample(
  double channel, double left, double right, double midGainDb, double sideGainDb
);
extern "C" double soemdsp_vectorscope_transform_sample(
  double channel, double left, double right, double rotateDeg
);
extern "C" double soemdsp_rotate_3d_to_2d_sample(
  double channel, double x, double y, double z,
  double rotateXCycles, double rotateYCycles, double rotateZCycles
);

extern "C" int soemdsp_clock_create();
extern "C" void soemdsp_clock_destroy(int handle);
extern "C" double soemdsp_clock_sample(
  int handle, double reset, double phaseOffset, double rate, double duty,
  double level, double sampleRate
);
extern "C" double soemdsp_clock_analog_out(int handle);
extern "C" double soemdsp_clock_pulse(int handle);

extern "C" int soemdsp_trigger_divider_create();
extern "C" void soemdsp_trigger_divider_destroy(int handle);
extern "C" double soemdsp_trigger_divider_sample(
  int handle, double trigger, double reset, double threshold, double division,
  double pulseTime, double level, double sampleRate
);

extern "C" int soemdsp_delayed_trigger_create();
extern "C" void soemdsp_delayed_trigger_destroy(int handle);
extern "C" double soemdsp_delayed_trigger_sample(
  int handle, double trigger, double reset, double threshold, double delay,
  double pulseTime, double level, double sampleRate
);

extern "C" int soemdsp_random_clock_create();
extern "C" void soemdsp_random_clock_destroy(int handle);
extern "C" double soemdsp_random_clock_sample(
  int handle, double reset, double threshold, double minSeconds, double maxSeconds,
  double duty, double triggerTime, double level, double sampleRate, int seedKey
);
extern "C" double soemdsp_random_clock_gate(int handle);

extern "C" int soemdsp_trigger_counter_create();
extern "C" void soemdsp_trigger_counter_destroy(int handle);
extern "C" double soemdsp_trigger_counter_sample(
  int handle, double trigger, double reset, double threshold, double countMax,
  double increment, double pulseTime, double level, double sampleRate
);
extern "C" double soemdsp_trigger_counter_count(int handle);

extern "C" double soemdsp_metallic_ratio_sample(double index);
extern "C" double soemdsp_harmonic_series_sample(double baseHz, double harmonic, double offset);

extern "C" int soemdsp_lut_cell_create();
extern "C" void soemdsp_lut_cell_destroy(int handle);
extern "C" int soemdsp_lut_cell_sample(
  int handle, double a, double b, double c, double d, double clock, double truthTable
);
extern "C" int soemdsp_lut_cell_q(int handle);

extern "C" int soemdsp_lookahead_limiter_create();
extern "C" void soemdsp_lookahead_limiter_destroy(int handle);
extern "C" double soemdsp_lookahead_limiter_sample(
  int handle, double left, double right,
  double ceilingDb, double lookaheadMs, double lookaheadSamples,
  double attackMs, double releaseMs, double sampleRate,
  double lookaheadEnabled, double gainCompensation, double dipGain
);
extern "C" double soemdsp_lookahead_limiter_left(int handle);
extern "C" double soemdsp_lookahead_limiter_right(int handle);
extern "C" double soemdsp_lookahead_limiter_gain(int handle);

extern "C" int soemdsp_pumping_limiter_create();
extern "C" void soemdsp_pumping_limiter_destroy(int handle);
extern "C" double soemdsp_pumping_limiter_sample(
  int handle, double left, double right, double sidechain, int hasSidechain,
  double inputGainDb, double thresholdDb, double ratio,
  double lookaheadMs, double lookaheadSamples,
  double attackMs, double releaseMs, double sampleRate,
  double lookaheadEnabled, double amplitude
);
extern "C" double soemdsp_pumping_limiter_left(int handle);
extern "C" double soemdsp_pumping_limiter_right(int handle);
extern "C" double soemdsp_pumping_limiter_gain(int handle);
extern "C" double soemdsp_pumping_limiter_env(int handle);

extern "C" int soemdsp_audio_player_create();
extern "C" void soemdsp_audio_player_destroy(int handle);
extern "C" double soemdsp_audio_player_sample(
  int handle,
  double reset, double speedCv, double phaseCv, int hasPhase,
  double transportMode, double speedParam, double start, double end,
  double amplitude, double phaseOffset, double phaseSkip, double playlistScrub,
  double antialias, double engineSampleRate
);
extern "C" double soemdsp_audio_player_left(int handle);
extern "C" double soemdsp_audio_player_right(int handle);
extern "C" double soemdsp_audio_player_phase(int handle);
extern "C" double soemdsp_audio_player_trigger(int handle);

extern "C" int soemdsp_step_sequencer_create();
extern "C" void soemdsp_step_sequencer_destroy(int handle);
extern "C" double soemdsp_step_sequencer_sample(
  int handle, double trigger, double reset, double threshold, double steps, double level,
  double v0, double v1, double v2, double v3, double v4, double v5, double v6, double v7
);
extern "C" double soemdsp_step_sequencer_gate(int handle);

extern "C" int soemdsp_transport_create();
extern "C" void soemdsp_transport_destroy(int handle);
extern "C" double soemdsp_transport_sample(
  int handle, double amplitude, double divisions, double tempoBpm, double sampleRate
);
extern "C" double soemdsp_transport_unipolar(int handle);
extern "C" double soemdsp_transport_frequency(int handle);

extern "C" int soemdsp_alias_sine_create();
extern "C" void soemdsp_alias_sine_destroy(int handle);
extern "C" double soemdsp_alias_sine_sample(
  int handle, double normFreq, double level, double sampleRate
);

extern "C" int soemdsp_phone_tone_create();
extern "C" void soemdsp_phone_tone_destroy(int handle);
extern "C" double soemdsp_phone_tone_sample(
  int handle,
  double sampleRate,
  double amplitude,
  double pitchOffsetOctaves,
  double freqOffsetHz,
  double pitchCv,
  double hasPitchCv,
  double analog,
  double hasAnalog,
  double digital,
  double hasDigital,
  double gate,
  double hasGate,
  double referenceVoltage
);
extern "C" double soemdsp_phone_tone_tone(int handle);
extern "C" double soemdsp_phone_tone_tone_l(int handle);
extern "C" double soemdsp_phone_tone_tone_r(int handle);
extern "C" double soemdsp_phone_tone_f1(int handle);
extern "C" double soemdsp_phone_tone_f2(int handle);
extern "C" double soemdsp_phone_tone_analog_thru(int handle);
extern "C" double soemdsp_phone_tone_digital_thru(int handle);

extern "C" int soemdsp_blit_create();
extern "C" void soemdsp_blit_destroy(int handle);
extern "C" void soemdsp_blit_reset(int handle);
extern "C" void soemdsp_blit_sample(
  int handle, double phase, double phaseIncrement, int waveform, double level
);
extern "C" double soemdsp_blit_out(int handle);
extern "C" double soemdsp_blit_saw(int handle);
extern "C" double soemdsp_blit_ramp(int handle);
extern "C" double soemdsp_blit_square(int handle);
extern "C" double soemdsp_blit_tri(int handle);
extern "C" double soemdsp_blit_sine(int handle);

extern "C" int soemdsp_sine_wavetable_create();
extern "C" void soemdsp_sine_wavetable_destroy(int handle);
extern "C" void soemdsp_sine_wavetable_sample(
  int handle, double phaseOffsetRadians, double frequency, double amplitude, double sampleRate
);
extern "C" double soemdsp_sine_wavetable_sin(int handle);
extern "C" double soemdsp_sine_wavetable_cos(int handle);

extern "C" int soemdsp_antisaw_create();
extern "C" void soemdsp_antisaw_destroy(int handle);
extern "C" double soemdsp_antisaw_sample(
  int handle, double fundamental, double reflections, double tilt, double level, double sampleRate
);

extern "C" int soemdsp_archimedes_create();
extern "C" void soemdsp_archimedes_destroy(int handle);
extern "C" void soemdsp_archimedes_reset(int handle);
extern "C" void soemdsp_archimedes_reset_counters(int handle);
extern "C" void soemdsp_archimedes_set_profile(int handle, int dtShift);
extern "C" void soemdsp_archimedes_set_frequency(int handle, int freqHz);
extern "C" double soemdsp_archimedes_step(int handle, int ditherBits);
extern "C" double soemdsp_archimedes_sine(int handle);
extern "C" double soemdsp_archimedes_cosine(int handle);
extern "C" double soemdsp_archimedes_extract_pi(int handle);
extern "C" double soemdsp_archimedes_noise_below(int handle);
extern "C" double soemdsp_archimedes_noise_above(int handle);

// additiveOsc: free-fn (no create/destroy) — host owns phase (radians).
extern "C" double soemdsp_additive_osc_sample(
  double phase,
  double frequency,
  double harmonics,
  double waveform,
  double morph,
  double harmonicPhaseAdd,
  double harmonicPhaseMultiply,
  double level,
  double dampingFilterFrequency,
  double sampleRate
);

extern "C" int soemdsp_surge_oscillator_create();
extern "C" void soemdsp_surge_oscillator_destroy(int handle);
extern "C" void soemdsp_surge_oscillator_reset(int handle);
extern "C" void soemdsp_surge_oscillator_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double syncIn,
  int hasExternalSync,
  double syncFrequencyHz,
  int waveform,
  double level
);
extern "C" double soemdsp_surge_oscillator_out(int handle);
extern "C" double soemdsp_surge_oscillator_saw(int handle);
extern "C" double soemdsp_surge_oscillator_square(int handle);
extern "C" double soemdsp_surge_oscillator_tri(int handle);
extern "C" double soemdsp_surge_oscillator_sine(int handle);
extern "C" double soemdsp_surge_oscillator_synced(int handle);
extern "C" double soemdsp_surge_oscillator_internal_sync(int handle);

extern "C" int soemdsp_softwave_create();
extern "C" void soemdsp_softwave_destroy(int handle);
extern "C" double soemdsp_softwave_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double waveform,
  double morph,
  double phaseOffset,
  double level,
  double antialias
);

extern "C" int soemdsp_dsf_oscillator_create();
extern "C" void soemdsp_dsf_oscillator_destroy(int handle);
extern "C" void soemdsp_dsf_oscillator_reset(int handle);
extern "C" void soemdsp_dsf_oscillator_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  int waveform,
  double morph,
  double pulseWidth,
  double blend,
  double phase,
  double level
);
extern "C" double soemdsp_dsf_oscillator_out(int handle);

extern "C" int soemdsp_hypersaw_create();
extern "C" void soemdsp_hypersaw_destroy(int handle);
extern "C" void soemdsp_hypersaw_reset(int handle);
extern "C" void soemdsp_hypersaw_sample(
  int handle,
  double frequencyHz,
  double sampleRate,
  double phaseOffset,
  int numVoices,
  double spread,
  double randomAmount,
  double driftAmount,
  double level
);
extern "C" double soemdsp_hypersaw_left(int handle);
extern "C" double soemdsp_hypersaw_right(int handle);

extern "C" int soemdsp_sinc_create();
extern "C" void soemdsp_sinc_destroy(int handle);
extern "C" double soemdsp_sinc_sample(
  int handle,
  double freq,
  double phaseShift,
  double lobes,
  double bandLimit,
  double sampleRate
);

extern "C" int soemdsp_bradley_2a_create();
extern "C" void soemdsp_bradley_2a_destroy(int handle);
extern "C" double soemdsp_bradley_2a_sample(
  int handle,
  double carrierFreq,
  double freqOffset,
  double jitterDepth,
  double jitterRate,
  double ampDepth,
  double ampRate,
  double interfLevel,
  double interfFreq,
  double harm2,
  double harm3,
  double hitRate,
  double hitDuration,
  double hitGain,
  double hitPhase,
  double impulseLevel,
  double level,
  double sampleRate
);

// ellipsoid RoundShape: free-fn (host owns phase in cycles).
extern "C" double soemdsp_ellipsoid_sine_to_square_aa(
  double phaseCycles,
  double shape,
  double frequencyHz,
  double sampleRate,
  int antialias
);

extern "C" int soemdsp_snowflake_create();
extern "C" void soemdsp_snowflake_destroy(int handle);
extern "C" void soemdsp_snowflake_sample(
  int handle,
  double frequencyHz,
  double pattern,
  double iterations,
  double angleDeg,
  double sizeArg,
  double directionArg,
  double spin,
  double level,
  double reset,
  double phaseArg,
  double sampleRate
);
extern "C" double soemdsp_snowflake_x(int handle);
extern "C" double soemdsp_snowflake_y(int handle);

extern "C" int soemdsp_butterworth_create();
extern "C" void soemdsp_butterworth_destroy(int handle);
extern "C" double soemdsp_butterworth_sample(
  int handle, double input, int mode, double frequencyHz, int order,
  double bandwidthOct, double rippleDb, double sampleRate
);

extern "C" int soemdsp_linkwitz_riley_create();
extern "C" void soemdsp_linkwitz_riley_destroy(int handle);
extern "C" double soemdsp_linkwitz_riley_sample(
  int handle, double input, int mode, double frequencyHz, int order,
  double bandwidthOct, double rippleDb, double sampleRate
);

extern "C" int soemdsp_bessel_create();
extern "C" void soemdsp_bessel_destroy(int handle);
extern "C" double soemdsp_bessel_sample(
  int handle, double input, int mode, double frequencyHz, int order,
  double bandwidthOct, double rippleDb, double sampleRate
);

extern "C" int soemdsp_chebyshev_create();
extern "C" void soemdsp_chebyshev_destroy(int handle);
extern "C" double soemdsp_chebyshev_sample(
  int handle, double input, int mode, double frequencyHz, int order,
  double bandwidthOct, double rippleDb, double sampleRate
);

extern "C" int soemdsp_elliptic_create();
extern "C" void soemdsp_elliptic_destroy(int handle);
extern "C" double soemdsp_elliptic_sample(
  int handle, double input, int mode, double frequencyHz, int order,
  double bandwidthOct, double rippleDb, double sampleRate
);

extern "C" int soemdsp_eq_filter_create();
extern "C" void soemdsp_eq_filter_destroy(int handle);
extern "C" double soemdsp_eq_filter_sample(
  int handle, double input, double mode, double frequency, double q,
  double gainDb, double sampleRate
);

extern "C" int soemdsp_active_filter_create();
extern "C" void soemdsp_active_filter_destroy(int handle);
extern "C" double soemdsp_active_filter_sample(
  int handle, double input, double frequencyHz, double resonance, int mode,
  int feedbackCircuit, int gainCompensation, double sampleRate
);

extern "C" int soemdsp_passive_filter_create();
extern "C" void soemdsp_passive_filter_destroy(int handle);
extern "C" double soemdsp_passive_filter_sample(
  int handle, double input, int mode, double lowFrequency,
  double highFrequency, double sampleRate
);

extern "C" int soemdsp_tb303_filter_create();
extern "C" void soemdsp_tb303_filter_destroy(int handle);
extern "C" double soemdsp_tb303_filter_sample(
  int handle, double input, double cutoff, double resonance, int mode,
  double drive, double sampleRate
);

extern "C" int soemdsp_flower_child_filter_create();
extern "C" void soemdsp_flower_child_filter_destroy(int handle);
extern "C" double soemdsp_flower_child_filter_sample(
  int handle, double input, double frequency, double resonance,
  double chaosAmount, int mode, double sampleRate
);

extern "C" int soemdsp_yellowjacket_filter_create();
extern "C" void soemdsp_yellowjacket_filter_destroy(int handle);
extern "C" double soemdsp_yellowjacket_filter_sample(
  int handle, double input, double frequency, double resonance,
  double chaosAmount, double sampleRate
);

extern "C" int soemdsp_superlove_filter_create();
extern "C" void soemdsp_superlove_filter_destroy(int handle);
extern "C" double soemdsp_superlove_filter_sample(
  int handle, double input, double frequency, double resonance,
  double chaosAmount, int mode, double sampleRate
);

extern "C" int soemdsp_human_filter_create();
extern "C" void soemdsp_human_filter_destroy(int handle);
extern "C" double soemdsp_human_filter_sample(
  int handle, double input, double frequency, double resonance,
  double chaosAmount, int mode, double sampleRate
);

extern "C" int soemdsp_resonator_filter_create();
extern "C" void soemdsp_resonator_filter_destroy(int handle);
extern "C" double soemdsp_resonator_filter_sample(
  int handle, double input, double frequency, double resonance,
  double chaosAmount, int mode, double sampleRate
);

extern "C" int soemdsp_comb_resonator_create();
extern "C" void soemdsp_comb_resonator_destroy(int handle);
extern "C" double soemdsp_comb_resonator_sample(
  int handle, double input, double frequencyHz, double decaySec, int hold,
  double damping, int topology, int invert, double depth, double amplitude,
  double sampleRate
);

extern "C" int soemdsp_mode_resonator_create();
extern "C" void soemdsp_mode_resonator_destroy(int handle);
extern "C" double soemdsp_mode_resonator_sample(
  int handle, double input, double frequencyHz, double decaySec, int hold,
  double amplitude, double sampleRate
);

extern "C" int soemdsp_chaotic_phase_locking_filter_create();
extern "C" void soemdsp_chaotic_phase_locking_filter_destroy(int handle);
extern "C" double soemdsp_chaotic_phase_locking_filter_sample(
  int handle, double input, double frequency, double resonance,
  double chaosAmount, double sampleRate
);

extern "C" int soemdsp_inertial_filter_create();
extern "C" void soemdsp_inertial_filter_destroy(int handle);
extern "C" double soemdsp_inertial_filter_sample(
  int handle, double input, double attackHz, double releaseHz, double sampleRate
);

extern "C" int soemdsp_exp_adsr_create();
extern "C" void soemdsp_exp_adsr_destroy(int handle);
extern "C" double soemdsp_exp_adsr_sample(
  int handle, double gate, double delay, double attack, double attackShape,
  double decay, double sustain, double release, double releaseShape,
  double loop, double level, double sampleRate
);

extern "C" int soemdsp_attack_decay_create();
extern "C" void soemdsp_attack_decay_destroy(int handle);
extern "C" double soemdsp_attack_decay_sample(
  int handle, double gate, double attack, double decay, double curve,
  double amplitude, double inputMode, double cycle, double sampleRate
);

extern "C" int soemdsp_basic_shape_create();
extern "C" void soemdsp_basic_shape_destroy(int handle);
extern "C" double soemdsp_basic_shape_sample(
  int handle, double frequencyHz, double sampleRate, double waveform,
  double motion, double phaseOffset, double morph, double amplitude,
  double increment, double reset
);
extern "C" double soemdsp_basic_shape_out(int handle);
extern "C" double soemdsp_basic_shape_sine(int handle);
extern "C" double soemdsp_basic_shape_tri(int handle);
extern "C" double soemdsp_basic_shape_saw(int handle);
extern "C" double soemdsp_basic_shape_ramp(int handle);
extern "C" double soemdsp_basic_shape_square(int handle);
extern "C" double soemdsp_basic_shape_trisaw(int handle);
extern "C" double soemdsp_basic_shape_center_square(int handle);

extern "C" int soemdsp_linear_envelope_create();
extern "C" void soemdsp_linear_envelope_destroy(int handle);
extern "C" double soemdsp_linear_envelope_sample(
  int handle, double gate, double delay, double attack, double decay,
  double sustain, double release, double loop, double level, double sampleRate
);

extern "C" int soemdsp_pluck_envelope_create();
extern "C" void soemdsp_pluck_envelope_destroy(int handle);
extern "C" double soemdsp_pluck_envelope_sample(
  int handle, double trigger, double release, double delayTime,
  double attackFeedback, double decay, double decayModStart, double decayModEnd,
  double endingDecay, double decayModCurve, double decayModFrequency,
  double autoReleaseTime, double releaseFeedback, double velocity,
  double velocitySensitivity, double level, double sampleRate
);

extern "C" int soemdsp_flower_child_envelope_follower_create();
extern "C" void soemdsp_flower_child_envelope_follower_destroy(int handle);
extern "C" double soemdsp_flower_child_envelope_follower_sample(
  int handle, double input, double attack, double hold, double decay,
  double sampleRate
);

extern "C" int soemdsp_delay_effect_create();
extern "C" void soemdsp_delay_effect_destroy(int handle);
extern "C" void soemdsp_delay_effect_sample(
  int handle, double input, double time, double feedback, double mix,
  double level, double modAmount, double modRate, double modVariation,
  double mode, unsigned int seed, double sampleRate
);
extern "C" double soemdsp_delay_effect_out(int handle);
extern "C" double soemdsp_delay_effect_wet(int handle);

extern "C" int soemdsp_soem_reverb_create(double sampleRate);
extern "C" void soemdsp_soem_reverb_destroy(int handle);
extern "C" void soemdsp_soem_reverb_reset(int handle);
extern "C" void soemdsp_soem_reverb_set_params(
  int handle,
  double mix, double volume, double echoTime, double recycle, double numDelays,
  double diffusionSize, double diffusionAmount, double seed, double lfoAmp,
  double lfoFrequency, double lfoVariation, double lfoStyle, double echoMode,
  double pingPong, double doModulateEcho, double saturate, double lpfFrequency,
  double hpfFrequency, double bandFrequency, double bandDecibels, double bandQ,
  double lpfStages, double bandStages, double duckLimit, double duckRelease
);
extern "C" void soemdsp_soem_reverb_process(int handle, double inL, double inR);
extern "C" double soemdsp_soem_reverb_left(int handle);
extern "C" double soemdsp_soem_reverb_right(int handle);
extern "C" double soemdsp_soem_reverb_wet_left(int handle);
extern "C" double soemdsp_soem_reverb_wet_right(int handle);
extern "C" double soemdsp_soem_reverb_dry_left(int handle);
extern "C" double soemdsp_soem_reverb_dry_right(int handle);

extern "C" int soemdsp_pll_create(double sampleRate);
extern "C" void soemdsp_pll_destroy(int handle);
extern "C" void soemdsp_pll_reset(int handle, double sampleRate);
extern "C" void soemdsp_pll_set_params(
  int handle, double sampleRate, int range, double offset, int type, double frequ
);
extern "C" void soemdsp_pll_process(
  int handle, double signalIn, double cvIn, double cvConnected
);
extern "C" double soemdsp_pll_vco_out(int handle);
extern "C" double soemdsp_pll_pc_out(int handle);
extern "C" double soemdsp_pll_lpf_out(int handle);
extern "C" double soemdsp_pll_locked(int handle);

extern "C" int soemdsp_lorenz_attractor_create();
extern "C" void soemdsp_lorenz_attractor_destroy(int handle);
extern "C" void soemdsp_lorenz_attractor_sample(
  int handle, double reset, double speed, double sigma, double rho, double beta,
  double rotate, double scale, double zDepth, double sampleRate
);
extern "C" double soemdsp_lorenz_attractor_x(int handle);
extern "C" double soemdsp_lorenz_attractor_y(int handle);
extern "C" double soemdsp_lorenz_attractor_z(int handle);

extern "C" int soemdsp_logistic_map_create();
extern "C" void soemdsp_logistic_map_destroy(int handle);
extern "C" double soemdsp_logistic_map_sample(
  int handle, double reset, double rate, double r, double seed, double level,
  double sampleRate
);

extern "C" int soemdsp_henon_map_create();
extern "C" void soemdsp_henon_map_destroy(int handle);
extern "C" void soemdsp_henon_map_sample(
  int handle, double reset, double rate, double a, double b, double seedX,
  double seedY, double sampleRate
);
extern "C" double soemdsp_henon_map_x(int handle);
extern "C" double soemdsp_henon_map_y(int handle);

extern "C" int soemdsp_chua_attractor_create();
extern "C" void soemdsp_chua_attractor_destroy(int handle);
extern "C" void soemdsp_chua_attractor_sample(
  int handle, double reset, double speed, double alpha, double beta,
  double m0, double m1, double sampleRate
);
extern "C" double soemdsp_chua_attractor_x(int handle);
extern "C" double soemdsp_chua_attractor_y(int handle);
extern "C" double soemdsp_chua_attractor_z(int handle);

extern "C" int soemdsp_ray_bouncer_create();
extern "C" void soemdsp_ray_bouncer_destroy(int handle);
extern "C" void soemdsp_ray_bouncer_sample(
  int handle, double reset, double frequency, double launchAngleDeg,
  double startX, double startY, double size, double aspect, double rotateDeg,
  double centerX, double centerY, double maxDistance, double bend,
  double xToY, double yToX, double sampleRate
);
extern "C" double soemdsp_ray_bouncer_x(int handle);
extern "C" double soemdsp_ray_bouncer_y(int handle);

extern "C" int soemdsp_chord_memory_create();
extern "C" void soemdsp_chord_memory_destroy(int handle);
extern "C" double soemdsp_chord_memory_sample(
  int handle, double latch, double clear, double advance, double pitch
);
extern "C" double soemdsp_chord_memory_note2(int handle);
extern "C" double soemdsp_chord_memory_note3(int handle);
extern "C" double soemdsp_chord_memory_note4(int handle);
extern "C" double soemdsp_chord_memory_arp(int handle);
extern "C" double soemdsp_chord_memory_gate(int handle);

extern "C" int soemdsp_chord_sequencer_create();
extern "C" void soemdsp_chord_sequencer_destroy(int handle);
extern "C" void soemdsp_chord_sequencer_sample(
  int handle, double clock, double reset, double progression
);
extern "C" int soemdsp_chord_sequencer_scale(int handle, double progression);
extern "C" double soemdsp_chord_sequencer_root(int handle, double progression);
extern "C" int soemdsp_chord_sequencer_step(int handle);

extern "C" int soemdsp_pitch_quantizer_create();
extern "C" void soemdsp_pitch_quantizer_destroy(int handle);
extern "C" double soemdsp_pitch_quantizer_sample(int handle, double pitch, int scaleMask);

extern "C" int soemdsp_turing_machine_create(unsigned int entropySeed);
extern "C" void soemdsp_turing_machine_destroy(int handle);
extern "C" double soemdsp_turing_machine_sample(
  int handle, double clock, double reset, double length, double probability, double level
);
extern "C" double soemdsp_turing_machine_scale(int handle);
extern "C" double soemdsp_turing_machine_gate(int handle);

extern "C" int soemdsp_chord_pad_create();
extern "C" void soemdsp_chord_pad_destroy(int handle);
extern "C" double soemdsp_chord_pad_sample(
  int handle, double select, double hasSelect, double key, double mode,
  double degree, double level
);
extern "C" double soemdsp_chord_pad_root(int handle);
extern "C" double soemdsp_chord_pad_gate(int handle);

extern "C" int soemdsp_note_glide_create();
extern "C" void soemdsp_note_glide_destroy(int handle);
extern "C" double soemdsp_note_glide_sample(
  int handle, double pitch, double timeSeconds, double sampleRate
);

extern "C" int soemdsp_note_transpose_create();
extern "C" void soemdsp_note_transpose_destroy(int handle);
extern "C" double soemdsp_note_transpose_sample(
  int handle, double pitch, double semitones, double octaves
);

extern "C" int soemdsp_degree_turing_create(unsigned int entropySeed);
extern "C" void soemdsp_degree_turing_destroy(int handle);
extern "C" double soemdsp_degree_turing_sample(
  int handle, double clock, double reset, double length, double probability,
  double octaves, double level, double scaleIn, double hasScale, double root,
  double scaleChoice
);
extern "C" double soemdsp_degree_turing_gate(int handle);
extern "C" double soemdsp_degree_turing_trigger(int handle);
extern "C" double soemdsp_degree_turing_degree(int handle);
extern "C" double soemdsp_degree_turing_cv(int handle);

extern "C" int soemdsp_degree_phrase_create(unsigned int entropySeed);
extern "C" void soemdsp_degree_phrase_destroy(int handle);
extern "C" double soemdsp_degree_phrase_sample(
  int handle, double clock, double reset, double stepsIn, double mutateIn,
  double octaves, double level, double scaleIn, double hasScale, double root,
  double scaleChoice,
  double step1, double step2, double step3, double step4,
  double step5, double step6, double step7, double step8,
  double rest1, double rest2, double rest3, double rest4,
  double rest5, double rest6, double rest7, double rest8
);
extern "C" double soemdsp_degree_phrase_gate(int handle);
extern "C" double soemdsp_degree_phrase_trigger(int handle);
extern "C" double soemdsp_degree_phrase_phase(int handle);

extern "C" int soemdsp_gravity_walker_create(unsigned int entropySeed);
extern "C" void soemdsp_gravity_walker_destroy(int handle);
extern "C" double soemdsp_gravity_walker_sample(
  int handle, double clock, double reset, double gravityIn, double leapIn,
  double leapCv, double octaves, double level, double scaleIn, double hasScale,
  double root, double scaleChoice
);
extern "C" double soemdsp_gravity_walker_gate(int handle);
extern "C" double soemdsp_gravity_walker_trigger(int handle);
extern "C" double soemdsp_gravity_walker_degree(int handle);

extern "C" int soemdsp_fbm_create();
extern "C" void soemdsp_fbm_destroy(int handle);
extern "C" void soemdsp_fbm_reset(int handle);
extern "C" void soemdsp_fbm_sample(
  int handle, int seedInt, int octaves, double persistence, double scale,
  double frequency, double level, double sampleRate
);
extern "C" double soemdsp_fbm_x(int handle);
extern "C" double soemdsp_fbm_y(int handle);
extern "C" double soemdsp_fbm_z(int handle);

extern "C" int soemdsp_pi_spigot_noise_create();
extern "C" void soemdsp_pi_spigot_noise_destroy(int handle);
extern "C" void soemdsp_pi_spigot_noise_reset_seed(int handle, double start, double stride);
extern "C" void soemdsp_pi_spigot_noise_sample(int handle, double color, double smoothing, double level);
extern "C" double soemdsp_pi_spigot_noise_left(int handle);
extern "C" double soemdsp_pi_spigot_noise_right(int handle);
extern "C" double soemdsp_pi_spigot_noise_hex(int handle);
extern "C" double soemdsp_pi_spigot_noise_n(int handle);
extern "C" double soemdsp_pi_spigot_noise_t(int handle);
extern "C" double soemdsp_pi_spigot_noise_b3(int handle);
extern "C" double soemdsp_pi_spigot_noise_b2(int handle);
extern "C" double soemdsp_pi_spigot_noise_b1(int handle);
extern "C" double soemdsp_pi_spigot_noise_b0(int handle);

extern "C" int soemdsp_random_walk_create();
extern "C" void soemdsp_random_walk_destroy(int handle);
extern "C" void soemdsp_random_walk_reset_seed(int handle, double seed);
extern "C" double soemdsp_random_walk_sample(
  int handle, double method, double frequency, double jitter, double level, double sampleRate
);

extern "C" int soemdsp_cheap_walk_create();
extern "C" void soemdsp_cheap_walk_destroy(int handle);
extern "C" double soemdsp_cheap_walk_sample(
  int handle, double rateHz, double amplitude, double seedParam, double sampleRate
);
extern "C" void soemdsp_cheap_walk_sample_stereo(
  int handle, double rateHz, double amplitude, double seedParam, double sampleRate,
  double* outLeft, double* outRight
);

extern "C" int soemdsp_pulse_explosion_create();
extern "C" void soemdsp_pulse_explosion_destroy(int handle);
extern "C" double soemdsp_pulse_explosion_sample(
  int handle, double trigger, double startTime, double centerTime, double endTime,
  double timeSpread, int numberOfPulses, double lowAmplitude, double highAmplitude,
  double seed, double sampleRate
);
extern "C" double soemdsp_pulse_explosion_curve(int handle);

extern "C" int soemdsp_jerobeam_spiral_create();
extern "C" void soemdsp_jerobeam_spiral_destroy(int handle);
extern "C" void soemdsp_jerobeam_spiral_sample(
  int handle, double frequency, double density, double size, double sharp,
  double sharpCurve, double sharpCurveMult, double morph, double morphSpeed,
  double position, double positionSpeed, double rotX, double rotXSpeed,
  double rotY, double rotYSpeed, double zAmount, double zDepth, double sampleRate
);
extern "C" double soemdsp_jerobeam_spiral_x(int handle);
extern "C" double soemdsp_jerobeam_spiral_y(int handle);
extern "C" double soemdsp_jerobeam_spiral_z(int handle);

extern "C" int soemdsp_fractal_spiral_create();
extern "C" void soemdsp_fractal_spiral_destroy(int handle);
extern "C" void soemdsp_fractal_spiral_sample(
  int handle, double frequency, double spin, double size, double growth,
  double gain, double lacunarity, double octaves, double twist, double sampleRate
);
extern "C" double soemdsp_fractal_spiral_x(int handle);
extern "C" double soemdsp_fractal_spiral_y(int handle);
extern "C" double soemdsp_fractal_spiral_z(int handle);

extern "C" int soemdsp_log_spiral_create();
extern "C" void soemdsp_log_spiral_destroy(int handle);
extern "C" void soemdsp_log_spiral_sample(
  int handle, double frequency, double spin, double size, double growth,
  double turns, double sampleRate
);
extern "C" double soemdsp_log_spiral_x(int handle);
extern "C" double soemdsp_log_spiral_y(int handle);
extern "C" double soemdsp_log_spiral_z(int handle);

extern "C" int soemdsp_jbblubb_create();
extern "C" void soemdsp_jbblubb_destroy(int handle);
extern "C" void soemdsp_jbblubb_reset(int handle);
extern "C" void soemdsp_jbblubb_sample(
  int handle, double frequency, double shape, double rotX, double rotY,
  double zDepth, double sampleRate
);
extern "C" double soemdsp_jbblubb_x(int handle);
extern "C" double soemdsp_jbblubb_y(int handle);

extern "C" int soemdsp_jbboing_create();
extern "C" void soemdsp_jbboing_destroy(int handle);
extern "C" void soemdsp_jbboing_reset(int handle);
extern "C" void soemdsp_jbboing_sample(
  int handle, double frequency, double density, double sharpness, double rotX,
  double rotY, double zDepth, double zAmount, double ends, double boing,
  double boingStrength, double dir, double shape, double volume,
  double volumePreJump, double sampleRate
);
extern "C" double soemdsp_jbboing_x(int handle);
extern "C" double soemdsp_jbboing_y(int handle);

extern "C" int soemdsp_jbkepler_create();
extern "C" void soemdsp_jbkepler_destroy(int handle);
extern "C" void soemdsp_jbkepler_reset(int handle);
extern "C" void soemdsp_jbkepler_sample(
  int handle, double frequency, double start, double length, double circles,
  double zoom, double rotation, double tri, double sampleRate
);
extern "C" double soemdsp_jbkepler_x(int handle);
extern "C" double soemdsp_jbkepler_y(int handle);

extern "C" int soemdsp_jbmushroom_create();
extern "C" void soemdsp_jbmushroom_destroy(int handle);
extern "C" void soemdsp_jbmushroom_reset(int handle);
extern "C" void soemdsp_jbmushroom_sample(
  int handle, double frequency, double phaseOffset, double numMushrooms,
  double grow, double density, double capRotation, double stemRotationSpeed,
  double head, double spread, double wobble, double clusterRotation,
  double clusterRotationSpeed, double sharp, double width, double stem,
  double apart, double capStemTransition, double sampleRate
);
extern "C" double soemdsp_jbmushroom_x(int handle);
extern "C" double soemdsp_jbmushroom_y(int handle);

extern "C" int soemdsp_jbnyquist_create();
extern "C" void soemdsp_jbnyquist_destroy(int handle);
extern "C" void soemdsp_jbnyquist_reset(int handle);
extern "C" void soemdsp_jbnyquist_sample(
  int handle, double frequencyA, double midiNoteRaw, double rate, double sampleDots,
  double phaseOffset, double frequencyB, double subPhase, double subPhaseRotationSpeed,
  double tone, double toneSmoothTime, double artifact, double enableToneModPitch,
  double enableToneModFreq, double enableToneModNote, double sampleRate
);
extern "C" double soemdsp_jbnyquist_x(int handle);
extern "C" double soemdsp_jbnyquist_y(int handle);

extern "C" int soemdsp_jbradar_create();
extern "C" void soemdsp_jbradar_destroy(int handle);
extern "C" void soemdsp_jbradar_reset(int handle);
extern "C" void soemdsp_jbradar_sample(
  int handle, double frequency, double phaseOffset, double density, double sharp,
  double fade, double rotation, double direction, double shade, double lap,
  double ringcut, double pow1Up, double pow1Down, double pow2Bend, double phaseInv,
  double tunnelInv, double spiralReturn, double length, double ratio, double frontring,
  double zoom, double zDepth, double inner, double x, double y, double sampleRate
);
extern "C" double soemdsp_jbradar_x(int handle);
extern "C" double soemdsp_jbradar_y(int handle);

extern "C" int soemdsp_jbtorus_create();
extern "C" void soemdsp_jbtorus_destroy(int handle);
extern "C" void soemdsp_jbtorus_reset(int handle);
extern "C" void soemdsp_jbtorus_sample(
  int handle, double frequency, double density, double quantizeDensity,
  double subdensity, double quantizeSubDensity, double sharp, double size,
  double length, double balance, double wander, double darkAngle, double darkIntensity,
  double rotX, double rotY, double rotZ, double zAngleX, double zAngleY,
  double zDepth, double sampleRate
);
extern "C" double soemdsp_jbtorus_x(int handle);
extern "C" double soemdsp_jbtorus_y(int handle);

extern "C" int soemdsp_jbwirdo_create();
extern "C" void soemdsp_jbwirdo_destroy(int handle);
extern "C" void soemdsp_jbwirdo_reset(int handle);
extern "C" void soemdsp_jbwirdo_sample(
  int handle, double frequency, double sharp, double cross, double density,
  double length, double rotate, double splashDepth, double splashDensity,
  double cut, double scrap, double ringCut, double splashSpeed, double syncCut,
  double sampleRate
);
extern "C" double soemdsp_jbwirdo_x(int handle);
extern "C" double soemdsp_jbwirdo_y(int handle);

extern "C" int soemdsp_phosphillator_create();
extern "C" void soemdsp_phosphillator_destroy(int handle);
extern "C" int soemdsp_phosphillator_path_x_ptr(int handle);
extern "C" int soemdsp_phosphillator_path_y_ptr(int handle);
extern "C" int soemdsp_phosphillator_set_path(int handle, int count);
extern "C" double soemdsp_phosphillator_sample(
  int handle, double cvInput, double frequency, double phaseOffset, double reset,
  double rate, double sharpness
);
extern "C" double soemdsp_phosphillator_y(int handle);


extern "C" int soemdsp_crossover_create(int bandCount);
extern "C" void soemdsp_crossover_destroy(int handle);
extern "C" void soemdsp_crossover_sample(
  int handle,
  double mono,
  double leftIn,
  double rightIn,
  double f0,
  double f1,
  double f2,
  double f3,
  double f4,
  int lrOrder,
  double sampleRate
);
extern "C" double soemdsp_crossover_band_l(int handle, int bandIndex);
extern "C" double soemdsp_crossover_band_r(int handle, int bandIndex);
extern "C" int soemdsp_crossover_band_count(int handle);

// Param-chase Papoulis (Control smooth type Π).
extern "C" int soemdsp_papoulis_filter_create();
extern "C" void soemdsp_papoulis_filter_destroy(int handle);
extern "C" void soemdsp_papoulis_filter_snap(int handle, double value);
extern "C" double soemdsp_papoulis_filter_sample(
  int handle, double input, double cutoffHz, double sampleRate
);

// Speaker Protection (hard mute) + Speaker Protector 2.0 (slew VCA).
extern "C" int soemdsp_speaker_protection_create();
extern "C" void soemdsp_speaker_protection_destroy(int handle);
extern "C" double soemdsp_speaker_protection_sample(int handle, double input);

extern "C" int soemdsp_speaker_protector2_create();
extern "C" void soemdsp_speaker_protector2_destroy(int handle);
extern "C" void soemdsp_speaker_protector2_sample(
  int handle,
  double leftIn,
  double rightIn,
  double sampleRate,
  double dropSeconds,
  double holdSeconds,
  double riseSeconds,
  double* outLeft,
  double* outRight,
  double* outMono
);

namespace {

using soemdsp_maths::dsp_exp;
using soemdsp_maths::dsp_cos;
using soemdsp_maths::dsp_sin_cos_turns;
using soemdsp_maths::dsp_floor;
using soemdsp_maths::dsp_fabs;
using soemdsp_maths::kPlanck;

static const int kMaxInstances = 4;
static const int kMaxNodes = 64;
static const int kMaxConnections = 256;
static const int kMaxToSmooth = 256;
// Hard product invariant: AudioWorklet quantum and all orchestrated natives
// use 128. Host must chunk if frames ever exceed this (see processNativeGraphQuantum).
static const int kMaxBlockFrames = 128;
// Default Control chase (~JS nodeGraphModuleSmoothingDefaultSeconds).
static const double kDefaultSmoothSeconds = 0.0333;
// 0=Mono/Out, 1=Left/Mix L, 2=Right/Mix R, 3=Saw/Dry L, 4=Ramp/Dry R,
// 5=Square, 6=Tri, 7=Sine (polyBlep taps; Dry L/R share 3/4 on reverb).
// 8–11: extra band taps (crossover5/6).
static const int kChannels = 12;

static const int kTypeUnknown = 0;
static const int kTypePolyBlep = 1;
static const int kTypeLadderFilter = 2;
static const int kTypeSoftClipper = 3;
static const int kTypeReverbEffect = 4;
static const int kTypePingPongDelay = 5;
static const int kTypeOutput = 6;
static const int kTypeAttenuverter = 7;
static const int kTypeRange = 8;
static const int kTypeInv = 9;
static const int kTypeU2b = 10;
static const int kTypeB2u = 11;
static const int kTypeBias = 12;
static const int kTypeGain = 13;
static const int kTypeNoiseGenerator = 14;
static const int kTypeRobinSinusoid = 15;
static const int kTypeRobinSupersaw = 16;
static const int kTypeSlewLimiter = 17;
static const int kTypeComparator = 18;
static const int kTypeSampleDelay = 19;
static const int kTypeSampleHold = 20;
static const int kTypeMinMax = 21;
static const int kTypeMix = 22;
static const int kTypeMixStereo = 23;
static const int kTypeClipperLimiter = 24;
static const int kTypeMidSideEncode = 25;
static const int kTypeVectorscopeTransform = 26;
static const int kTypeRotate3dTo2d = 27;
static const int kTypeClock = 28;
static const int kTypeTriggerDivider = 29;
static const int kTypeDelayedTrigger = 30;
static const int kTypeRandomClock = 31;
static const int kTypeTriggerCounter = 32;
static const int kTypeMetallicRatio = 33;
static const int kTypeLutCell = 34;
static const int kTypeLookaheadLimiter = 35;
static const int kTypeStepSequencer = 36;
static const int kTypeTransport = 37;
static const int kTypeAliasSine = 38;
static const int kTypeBlit = 39;
static const int kTypeSineWavetable = 40;
static const int kTypeAntisaw = 41;
static const int kTypeArchimedes = 42;
static const int kTypeAdditiveOsc = 43;
static const int kTypeSurgeOscillator = 44;
static const int kTypeSoftwaveOsc = 45;
static const int kTypeDsfOscillator = 46;
static const int kTypeHypersaw = 47;
static const int kTypeSinc = 48;
static const int kTypeBradley2a = 49;
static const int kTypeEllipsoid = 50;
static const int kTypeSnowflake = 51;
static const int kTypeButterworth = 52;
static const int kTypeLinkwitzRiley = 53;
static const int kTypeBessel = 54;
static const int kTypeChebyshev = 55;
static const int kTypeElliptic = 56;
static const int kTypeEqFilter = 57;
static const int kTypeActiveFilter = 58;
static const int kTypePassiveFilter = 59;
static const int kTypeTb303Filter = 60;
static const int kTypeFlowerChildFilter = 61;
static const int kTypeYellowjacketFilter = 62;
static const int kTypeSuperloveFilter = 63;
static const int kTypeHumanFilter = 64;
static const int kTypeResonatorFilter = 65;
static const int kTypeCombResonator = 66;
static const int kTypeModeResonator = 67;
static const int kTypeChaoticPhaseLockingFilter = 68;
static const int kTypeInertialFilter = 69;
static const int kTypeExpAdsr = 70;
static const int kTypeLinearEnvelope = 71;
static const int kTypePluckEnvelope = 72;
static const int kTypeFlowerChildEnvelopeFollower = 73;
// removed: vactrol (was kTypeVactrolEnvelope = 74)
static const int kTypeDelayEffect = 75;
// wallDelay skipped — native is placeholder (version only).
static const int kTypeSoemReverb = 76;
static const int kTypePll = 77;
static const int kTypeLorenzAttractor = 78;
static const int kTypeLogisticMap = 79;
static const int kTypeHenonMap = 80;
static const int kTypeChuaAttractor = 81;
static const int kTypeRayBouncer = 82;
static const int kTypeChordMemory = 83;
static const int kTypeChordSequencer = 84;
static const int kTypePitchQuantizer = 85;
static const int kTypeTuringMachine = 86;
static const int kTypeFractalBrownianNoise = 87;
static const int kTypePiSpigotNoise = 88;
static const int kTypeRandomWalk = 89;
static const int kTypePulseExplosion = 90;
static const int kTypeSpiral = 91;
static const int kTypeFractalSpiral = 92;
static const int kTypeLogSpiral = 93;
static const int kTypeBlubb = 94;
static const int kTypeBoing = 95;
static const int kTypeKeplerBouwkamp = 96;
static const int kTypeMushroom = 97;
static const int kTypeNyquistShannon = 98;
static const int kTypeRadar = 99;
static const int kTypeTorus = 100;
static const int kTypeWirdoSpiral = 101;
static const int kTypePhosphillator = 102;
static const int kTypeCrossover2 = 103;
static const int kTypeCrossover3 = 104;
static const int kTypeCrossover4 = 105;
static const int kTypeCrossover5 = 106;
static const int kTypeCrossover6 = 107;
static const int kTypeCheapWalk = 108;
static const int kTypePumpLimiter = 109; // musical Pump Limiter (type `limiter`)
static const int kTypeAudioPlayer = 110; // Music Player (PCM upload)
// Yellow Graph (Additive) — A1+A2 (see additive_yellow_graph.h)
static const int kTypeAdditiveGenerator = 111;
static const int kTypeAdditiveBubble = 112;
static const int kTypeAdditiveOut = 113;
static const int kTypeAdditiveLinearFilter = 114;
static const int kTypeAdditiveAnalogFilter = 115; // Butterworth
static const int kTypeAdditiveLadderFilter = 116;
static const int kTypeAdditiveFrequencySkew = 117;
static const int kTypeAdditiveQuantizeFreq = 118;
static const int kTypeAdditiveQuantizePhase = 119;
static const int kTypeAdditivePan = 120;
static const int kTypeAdditiveNoisyFreq = 121;
static const int kTypeAdditiveNoisyPhase = 122;
static const int kTypeAdditiveNoisyPan = 123;
static const int kTypeAdditiveNoisyAmp = 124;
static const int kTypeAdditivePhaseEntry = 125;
static const int kTypeAdditiveBlaster = 126;
static const int kTypeAdditiveDiffusor = 127;
static const int kTypeHarmonicSeries = 128;
static const int kTypePhoneTone = 129;
// Chromeless patch portals (all lane variants share one process).
static const int kTypePortalOutlet = 130;
static const int kTypePortalInlet = 131;
static const int kTypeAudioInput = 132;
// Shop Papoulis Filter node (shares WASM pool with Control papHandle smoothers).
static const int kTypePapoulisFilter = 133;
static const int kTypeSpeakerProtection = 134;
static const int kTypeSpeakerProtector2 = 135;
static const int kTypeAttackDecay = 136;
static const int kTypeBandpass = 137;
static const int kTypeAllpass = 138;
static const int kTypeBasicShape = 139;
static const int kTypeChordPad = 140;
static const int kTypeNoteGlide = 141;
static const int kTypeNoteTranspose = 142;
static const int kTypeDegreeTuring = 143;
static const int kTypeDegreePhrase = 144;
static const int kTypeGravityWalker = 145;

static const int kPortMono = 0;
static const int kPortLeft = 1;
static const int kPortRight = 2;
static const int kPortSaw = 3;
static const int kPortRamp = 4;
static const int kPortSquare = 5;
static const int kPortTri = 6;
static const int kPortSine = 7;
// basicShape extra taps (crossover5/6 also use 8–11).
static const int kPortTrisaw = 8;
static const int kPortCenterSquare = 9;
static const int kPortDryL = 3; // reverb Dry L (shares Saw index)
static const int kPortDryR = 4; // reverb Dry R (shares Ramp index)
// Comparator named outs reuse tap slots (module-local meaning, like Dry L/R):
static const int kPortCmpThru = 0;    // Thru
static const int kPortCmpUp = 3;      // Up
static const int kPortCmpDown = 4;    // Down
static const int kPortCmpChange = 5;  // Change
static const int kPortCmpSteady = 6;  // Steady
static const int kPortCmpSign = 7;    // Sign
// sampleDelay: Delayed on Mono (fan L/R); Thru on Dry L slot.
static const int kPortDelayDelayed = 0;
static const int kPortDelayThru = 3;
// Live SIGNAL IN ports — not audio output channels (not stored in Node.buf).
static const int kPortF = 16;          // absolute Hz (ƒ)
static const int kPortPitchCv = 17;    // 0.1V/Oct
static const int kPortIncrement = 18;  // phase increment add (cycles/sample)
static const int kPortReset = 19;      // reset gate
static const int kPortTrigger = 20;    // sampleHold Trigger (not an audio bus)
// mixStereo R4 (9th input); L1..L4/R1..R3 use audio buses 1..7, Mono=0.
static const int kPortMixStereoR4 = 21;
static const int kPortMorph = 22; // block-rate ZOH morph CV (turquoise)
static const int kPortGraph = 23; // Yellow Graph data-plane (not sample audio)
// Numbered multi-in aliases (minMax / mix): In1..In4 → buses 0..3.
static const int kPortIn1 = 0;
static const int kPortIn2 = 1;
static const int kPortIn3 = 2;
static const int kPortIn4 = 3;
static const int kPortMax = 0; // minMax Max
static const int kPortMin = 1; // minMax Min
static const int kPortOut1 = 0;
static const int kPortOut2 = 1;
static const int kPortOut3 = 2;
static const int kPortOut4 = 3;

// Param IDs (keep in sync with JS NATIVE_GRAPH_PARAM_*).
static const int kParamVolumeDb = 0;
static const int kParamPan = 1;
static const int kParamFrequency = 10;   // polyBlep Hz / ladder cutoff
static const int kParamWaveform = 11;    // polyBlep
static const int kParamAmplitude = 12;   // polyBlep level
static const int kParamShape = 13;       // polyBlep morph
static const int kParamPhase = 14;       // polyBlep phase offset (radians fraction→applied as 2π*)
static const int kParamResonance = 20;   // ladder
static const int kParamMode = 21;        // ladder
static const int kParamStages = 22;      // ladder
static const int kParamCenter = 30;      // softClipper
static const int kParamWidth = 31;       // softClipper
static const int kParamOversample = 32;  // softClipper
static const int kParamMix = 40;               // reverb / pingPong
static const int kParamDiffusionSize = 41;     // reverb
static const int kParamDiffusionAmount = 42;   // reverb
static const int kParamDelaySize = 43;         // reverb
static const int kParamRecycle = 44;           // reverb
static const int kParamLfoAmplitude = 45;      // reverb
static const int kParamLfoBaseSpeed = 46;      // reverb
static const int kParamLfoVariation = 47;      // reverb / pingPong
static const int kParamSeed = 48;              // reverb
static const int kParamFeedback = 50;          // pingPong
static const int kParamLevel = 51;             // pingPong
static const int kParamTimeNumerator = 52;     // pingPong
static const int kParamTimeDenominator = 53;   // pingPong
static const int kParamTimingMode = 54;        // pingPong
static const int kParamOffsetMs = 55;          // pingPong LFO amp
static const int kParamLfoStyle = 56;          // pingPong
static const int kParamLfoRate = 57;           // pingPong
static const int kParamSaturate = 58;          // pingPong
static const int kParamLpfFrequency = 59;      // pingPong
static const int kParamHpfFrequency = 60;      // pingPong
static const int kParamTempoBpm = 61;          // pingPong
static const int kParamAttAmplitude = 70;      // attenuverter
static const int kParamAttOffset = 71;         // attenuverter
static const int kParamInLow = 80;             // range
static const int kParamInHigh = 81;            // range
static const int kParamOutLow = 82;            // range
static const int kParamOutHigh = 83;           // range
static const int kParamGainDb = 90;            // gain master (dB)
static const int kParamGainLeftDb = 91;        // gain left (dB)
static const int kParamGainRightDb = 92;       // gain right (dB)
static const int kParamGainMonoSum = 93;       // gain mono-sum law (discrete)
// mix / mixStereo lane Controls (shared slots; meaning is type-local).
static const int kParamLaneVol1 = 100;
static const int kParamLaneVol2 = 101;
static const int kParamLaneVol3 = 102;
static const int kParamLaneVol4 = 103;
static const int kParamLaneBias1 = 104; // mix bias1 OR mixStereo pan1
static const int kParamLaneBias2 = 105;
static const int kParamLaneBias3 = 106;
static const int kParamLaneBias4 = 107;
static const int kParamBleed2 = 108; // mix bleed2to1
static const int kParamBleed3 = 109;
static const int kParamBleed4 = 110;

static const int kTapOut = 1;
static const int kTapSaw = 2;
static const int kTapRamp = 4;
static const int kTapSquare = 8;
static const int kTapTri = 16;
static const int kTapSine = 32;

static const double kTwoPi = 6.28318530717958647692;
static const double kPi = 3.14159265358979323846;

static const unsigned char kSmoothModeInternal = 0;
static const unsigned char kSmoothModeGlobal = 1;
static const unsigned char kSmoothModeInternalGlobal = 2;
static const unsigned char kSmoothModeOff = 3;

// Filter kind (JS smoothingType). Papoulis uses papoulis_filter native pool.
static const unsigned char kSmoothTypeOnePole = 0;
static const unsigned char kSmoothTypeLinear = 1;
static const unsigned char kSmoothTypeTwoPole = 2;
static const unsigned char kSmoothTypeNone = 3; // instant
static const unsigned char kSmoothTypePapoulis = 4;
static const unsigned char kSmoothTypeThreePole = 5; // 3× real one-pole (no overshoot)

// Freestanding Control slot: host writes target/time; DSP reads out.
struct Control {
  double target;
  double timeSamples; // internal cell; <=0 → default seconds*sr when resolving
  double out;
  double coeff; // one/two/three-pole b0, or linear increment (cached)
  double stage1; // multi-pole cascade stage
  double stage2; // three-pole second stage
  int papHandle; // soemdsp_papoulis_filter_* instance (0 = none)
  bool dirty;
  bool active;
  unsigned char mode;
  unsigned char type; // kSmoothType*
  unsigned char snap; // discrete: out=target immediately, never on toSmooth_
  unsigned char blockStepped; // sample path already advanced this quantum
};

struct Node {
  unsigned int idHash;
  int typeId;
  bool used;
  bool bypassed; // dry/silence passthrough; DSP state kept (no recreate)
  int nativeHandle;
  int nativeHandleL; // independent L filter state (mono-native MLR types)
  int nativeHandleR; // independent R filter state
  int nativeKind; // type at create time — destroy keys off this, not typeId
  Control volumeDb;
  Control pan;
  Control frequency;
  Control waveform;
  Control amplitude;
  Control shape;
  Control phaseParam;
  Control resonance;
  Control mode;
  Control stages;
  Control center;
  Control width;
  Control oversample;
  Control mix;
  Control diffusionSize;
  Control diffusionAmount;
  Control delaySize;
  Control recycle;
  Control lfoAmplitude;
  Control lfoBaseSpeed;
  Control lfoVariation;
  Control seed;
  Control feedback;
  Control level;
  Control timeNumerator;
  Control timeDenominator;
  Control timingMode;
  Control offsetMs;
  Control lfoStyle;
  Control lfoRate;
  Control saturate;
  Control lpfFrequency;
  Control hpfFrequency;
  Control tempoBpm;
  Control offset; // attenuverter / bias / gain DC offset
  Control inLow;  // range
  Control inHigh;
  Control outLow;
  Control outHigh;
  Control gainDb;      // gain master (dB)
  Control gainLeftDb;  // gain left (dB)
  Control gainRightDb; // gain right (dB)
  Control gainMonoSum; // gain mono-sum law (discrete)
  // mix volume1-4 / mixStereo volume1-4 (dB for stereo, linear for mix)
  Control laneVol[4];
  // mix bias1-4 / mixStereo pan1-4
  Control laneBias[4];
  Control bleed2; // mix bleed2to1
  Control bleed3;
  Control bleed4;
  double phase; // polyBlep running phase (radians)
  double lastReset; // Live Reset rising-edge latch (persists across blocks)
  // Yellow Graph (Additive): processors publish GraphPayload; Out sums.
  soemdsp_yellow_graph::GraphPayload yellowGraph;
  double yellowPhaseAcc[soemdsp_yellow_graph::kMaxHarmonics];
  int yellowPhaseAccLen;
  int yellowLastHarmonics; // Generator H-change → phaseReset
  // Noisy* persistent walk + quantum lerpFrom (not wiped by graph_copy).
  soemdsp_yellow_graph::YellowWalk yellowWalks[soemdsp_yellow_graph::kMaxHarmonics];
  int yellowWalkCount;
  unsigned int yellowWalkSeed;
  unsigned int yellowWalkSalt;
  float yellowLerpFrom[soemdsp_yellow_graph::kMaxHarmonics];
  int yellowLerpFromLen;
  // Host-uploaded Bubble Cutoff strip (0…1). Frames>0 → sample-accurate amp gate at Out.
  float yellowCutoffStrip[kMaxBlockFrames];
  int yellowCutoffStripFrames;
  double buf[kChannels][kMaxBlockFrames];
};

struct Conn {
  unsigned int srcHash;
  int srcPort;
  unsigned int dstHash;
  int dstPort;
  bool used;
};

struct Circuit {
  bool active;
  bool compiled;
  float sampleRate;
  double globalTimeSamples;
  int nodeCount;
  int connCount;
  int orderCount;
  int toSmoothCount;
  int order[kMaxNodes];
  int outputNodeIndex;
  Control* toSmooth[kMaxToSmooth];
  Node nodes[kMaxNodes];
  Conn conns[kMaxConnections];
  double outL[kMaxBlockFrames];
  double outR[kMaxBlockFrames];
  double mixMono[kMaxBlockFrames];
  double mixLeft[kMaxBlockFrames];
  double mixRight[kMaxBlockFrames];
  double mixF[kMaxBlockFrames];
  double mixPitch[kMaxBlockFrames];
  double mixIncrement[kMaxBlockFrames];
  double mixReset[kMaxBlockFrames];
  double mixTrigger[kMaxBlockFrames];
  double mixMorph[kMaxBlockFrames];
};

// Morph ZOH: one sample per quantum. additiveCv = knob + Morph[0] (softwave-style);
// otherwise Morph[0] replaces the Control (additiveOsc proving-ground style).
static double morph_zoh_hold(Circuit& g, Node& node, bool liveMorph, bool additiveCv) {
  double m = node.shape.out;
  if (!(m == m)) m = 0.5;
  if (liveMorph) {
    double cv = g.mixMorph[0];
    if (!(cv == cv)) cv = 0.0;
    m = additiveCv ? (m + cv) : cv;
  }
  if (m < 0.0) m = 0.0;
  if (m > 1.0) m = 1.0;
  return m;
}

static Circuit gPool[kMaxInstances];

static void zero_buf(double* p, int n) {
  for (int i = 0; i < n; i++) p[i] = 0.0;
}

static double* ptr_from_export(int addr) {
  if (addr == 0) return nullptr;
  return (double*)(unsigned)addr;
}

static void destroy_native_kind_handle(int kind, int handle) {
  if (handle <= 0) return;
  if (kind == kTypePolyBlep) {
    soemdsp_polyblep_destroy(handle);
  } else if (kind == kTypeLadderFilter) {
    soemdsp_ladder_filter_destroy(handle);
  } else if (kind == kTypeSoftClipper) {
    soemdsp_soft_clipper_destroy(handle);
  } else if (kind == kTypeReverbEffect) {
    soemdsp_sabrina_reverb_destroy(handle);
  } else if (kind == kTypePingPongDelay) {
    soemdsp_ping_pong_delay_destroy(handle);
  } else if (kind == kTypeAttenuverter) {
    soemdsp_attenuverter_destroy(handle);
  } else if (kind == kTypeRange) {
    soemdsp_range_destroy(handle);
  } else if (kind == kTypeNoiseGenerator) {
    soemdsp_noise_generator_destroy(handle);
  } else if (kind == kTypeRobinSinusoid) {
    soemdsp_robin_sinusoid_destroy(handle);
  } else if (kind == kTypeRobinSupersaw) {
    soemdsp_robin_supersaw_destroy(handle);
  } else if (kind == kTypeSlewLimiter) {
    soemdsp_slew_limiter_destroy(handle);
  } else if (kind == kTypeComparator) {
    soemdsp_comparator_destroy(handle);
  } else if (kind == kTypeSampleDelay) {
    soemdsp_sample_delay_destroy(handle);
  } else if (kind == kTypeSampleHold) {
    soemdsp_sample_hold_destroy(handle);
  } else if (kind == kTypeMinMax) {
    soemdsp_min_max_destroy(handle);
  } else if (kind == kTypeClipperLimiter) {
    soemdsp_clipper_limiter_destroy(handle);
  } else if (kind == kTypeClock) {
    soemdsp_clock_destroy(handle);
  } else if (kind == kTypeTriggerDivider) {
    soemdsp_trigger_divider_destroy(handle);
  } else if (kind == kTypeDelayedTrigger) {
    soemdsp_delayed_trigger_destroy(handle);
  } else if (kind == kTypeRandomClock) {
    soemdsp_random_clock_destroy(handle);
  } else if (kind == kTypeTriggerCounter) {
    soemdsp_trigger_counter_destroy(handle);
  } else if (kind == kTypeLutCell) {
    soemdsp_lut_cell_destroy(handle);
  } else if (kind == kTypeLookaheadLimiter) {
    soemdsp_lookahead_limiter_destroy(handle);
  } else if (kind == kTypePumpLimiter) {
    soemdsp_pumping_limiter_destroy(handle);
  } else if (kind == kTypeAudioPlayer) {
    soemdsp_audio_player_destroy(handle);
  } else if (kind == kTypeStepSequencer) {
    soemdsp_step_sequencer_destroy(handle);
  } else if (kind == kTypeTransport) {
    soemdsp_transport_destroy(handle);
  } else if (kind == kTypeAliasSine) {
    soemdsp_alias_sine_destroy(handle);
  } else if (kind == kTypePhoneTone) {
    soemdsp_phone_tone_destroy(handle);
  } else if (kind == kTypeBlit) {
    soemdsp_blit_destroy(handle);
  } else if (kind == kTypeSineWavetable) {
    soemdsp_sine_wavetable_destroy(handle);
  } else if (kind == kTypeAntisaw) {
    soemdsp_antisaw_destroy(handle);
  } else if (kind == kTypeArchimedes) {
    soemdsp_archimedes_destroy(handle);
  } else if (kind == kTypeSurgeOscillator) {
    soemdsp_surge_oscillator_destroy(handle);
  } else if (kind == kTypeSoftwaveOsc) {
    soemdsp_softwave_destroy(handle);
  } else if (kind == kTypeDsfOscillator) {
    soemdsp_dsf_oscillator_destroy(handle);
  } else if (kind == kTypeHypersaw) {
    soemdsp_hypersaw_destroy(handle);
  } else if (kind == kTypeSinc) {
    soemdsp_sinc_destroy(handle);
  } else if (kind == kTypeBradley2a) {
    soemdsp_bradley_2a_destroy(handle);
  } else if (kind == kTypeSnowflake) {
    soemdsp_snowflake_destroy(handle);
  } else if (kind == kTypeButterworth) {
    soemdsp_butterworth_destroy(handle);
  } else if (kind == kTypeLinkwitzRiley) {
    soemdsp_linkwitz_riley_destroy(handle);
  } else if (kind == kTypeBessel) {
    soemdsp_bessel_destroy(handle);
  } else if (kind == kTypePapoulisFilter) {
    soemdsp_papoulis_filter_destroy(handle);
  } else if (kind == kTypeSpeakerProtection) {
    soemdsp_speaker_protection_destroy(handle);
  } else if (kind == kTypeSpeakerProtector2) {
    soemdsp_speaker_protector2_destroy(handle);
  } else if (kind == kTypeAttackDecay) {
    soemdsp_attack_decay_destroy(handle);
  } else if (kind == kTypeBandpass || kind == kTypeAllpass) {
    soemdsp_eq_filter_destroy(handle);
  } else if (kind == kTypeBasicShape) {
    soemdsp_basic_shape_destroy(handle);
  } else if (kind == kTypeChordPad) {
    soemdsp_chord_pad_destroy(handle);
  } else if (kind == kTypeNoteGlide) {
    soemdsp_note_glide_destroy(handle);
  } else if (kind == kTypeNoteTranspose) {
    soemdsp_note_transpose_destroy(handle);
  } else if (kind == kTypeDegreeTuring) {
    soemdsp_degree_turing_destroy(handle);
  } else if (kind == kTypeDegreePhrase) {
    soemdsp_degree_phrase_destroy(handle);
  } else if (kind == kTypeGravityWalker) {
    soemdsp_gravity_walker_destroy(handle);
  } else if (kind == kTypeChebyshev) {
    soemdsp_chebyshev_destroy(handle);
  } else if (kind == kTypeElliptic) {
    soemdsp_elliptic_destroy(handle);
  } else if (kind == kTypeEqFilter) {
    soemdsp_eq_filter_destroy(handle);
  } else if (kind == kTypeActiveFilter) {
    soemdsp_active_filter_destroy(handle);
  } else if (kind == kTypePassiveFilter) {
    soemdsp_passive_filter_destroy(handle);
  } else if (kind == kTypeTb303Filter) {
    soemdsp_tb303_filter_destroy(handle);
  } else if (kind == kTypeFlowerChildFilter) {
    soemdsp_flower_child_filter_destroy(handle);
  } else if (kind == kTypeYellowjacketFilter) {
    soemdsp_yellowjacket_filter_destroy(handle);
  } else if (kind == kTypeSuperloveFilter) {
    soemdsp_superlove_filter_destroy(handle);
  } else if (kind == kTypeHumanFilter) {
    soemdsp_human_filter_destroy(handle);
  } else if (kind == kTypeResonatorFilter) {
    soemdsp_resonator_filter_destroy(handle);
  } else if (kind == kTypeCombResonator) {
    soemdsp_comb_resonator_destroy(handle);
  } else if (kind == kTypeModeResonator) {
    soemdsp_mode_resonator_destroy(handle);
  } else if (kind == kTypeChaoticPhaseLockingFilter) {
    soemdsp_chaotic_phase_locking_filter_destroy(handle);
  } else if (kind == kTypeInertialFilter) {
    soemdsp_inertial_filter_destroy(handle);
  } else if (kind == kTypeExpAdsr) {
    soemdsp_exp_adsr_destroy(handle);
  } else if (kind == kTypeLinearEnvelope) {
    soemdsp_linear_envelope_destroy(handle);
  } else if (kind == kTypePluckEnvelope) {
    soemdsp_pluck_envelope_destroy(handle);
  } else if (kind == kTypeFlowerChildEnvelopeFollower) {
    soemdsp_flower_child_envelope_follower_destroy(handle);
  } else if (kind == kTypeDelayEffect) {
    soemdsp_delay_effect_destroy(handle);
  } else if (kind == kTypeSoemReverb) {
    soemdsp_soem_reverb_destroy(handle);
  } else if (kind == kTypePll) {
    soemdsp_pll_destroy(handle);
  } else if (kind == kTypeLorenzAttractor) {
    soemdsp_lorenz_attractor_destroy(handle);
  } else if (kind == kTypeLogisticMap) {
    soemdsp_logistic_map_destroy(handle);
  } else if (kind == kTypeHenonMap) {
    soemdsp_henon_map_destroy(handle);
  } else if (kind == kTypeChuaAttractor) {
    soemdsp_chua_attractor_destroy(handle);
  } else if (kind == kTypeRayBouncer) {
    soemdsp_ray_bouncer_destroy(handle);
  } else if (kind == kTypeChordMemory) {
    soemdsp_chord_memory_destroy(handle);
  } else if (kind == kTypeChordSequencer) {
    soemdsp_chord_sequencer_destroy(handle);
  } else if (kind == kTypePitchQuantizer) {
    soemdsp_pitch_quantizer_destroy(handle);
  } else if (kind == kTypeTuringMachine) {
    soemdsp_turing_machine_destroy(handle);
  } else if (kind == kTypeFractalBrownianNoise) {
    soemdsp_fbm_destroy(handle);
  } else if (kind == kTypePiSpigotNoise) {
    soemdsp_pi_spigot_noise_destroy(handle);
  } else if (kind == kTypeRandomWalk) {
    soemdsp_random_walk_destroy(handle);
  } else if (kind == kTypeCheapWalk) {
    soemdsp_cheap_walk_destroy(handle);
  } else if (kind == kTypePulseExplosion) {
    soemdsp_pulse_explosion_destroy(handle);
  } else if (kind == kTypeSpiral) {
    soemdsp_jerobeam_spiral_destroy(handle);
  } else if (kind == kTypeFractalSpiral) {
    soemdsp_fractal_spiral_destroy(handle);
  } else if (kind == kTypeLogSpiral) {
    soemdsp_log_spiral_destroy(handle);
  } else if (kind == kTypeBlubb) {
    soemdsp_jbblubb_destroy(handle);
  } else if (kind == kTypeBoing) {
    soemdsp_jbboing_destroy(handle);
  } else if (kind == kTypeKeplerBouwkamp) {
    soemdsp_jbkepler_destroy(handle);
  } else if (kind == kTypeMushroom) {
    soemdsp_jbmushroom_destroy(handle);
  } else if (kind == kTypeNyquistShannon) {
    soemdsp_jbnyquist_destroy(handle);
  } else if (kind == kTypeRadar) {
    soemdsp_jbradar_destroy(handle);
  } else if (kind == kTypeTorus) {
    soemdsp_jbtorus_destroy(handle);
  } else if (kind == kTypeWirdoSpiral) {
    soemdsp_jbwirdo_destroy(handle);
  } else if (kind == kTypePhosphillator) {
    soemdsp_phosphillator_destroy(handle);
  } else if (kind >= kTypeCrossover2 && kind <= kTypeCrossover6) {
    soemdsp_crossover_destroy(handle);
  }
}

static void destroy_node_native(Node& n) {
  // Key destroy off create-time kind so a later typeId retarget cannot leak.
  const int kind = n.nativeKind != 0 ? n.nativeKind : n.typeId;
  destroy_native_kind_handle(kind, n.nativeHandle);
  destroy_native_kind_handle(kind, n.nativeHandleL);
  destroy_native_kind_handle(kind, n.nativeHandleR);
  n.nativeHandle = 0;
  n.nativeHandleL = 0;
  n.nativeHandleR = 0;
  n.nativeKind = 0;
}

static bool type_wants_mlr_native_handles(int typeId) {
  return typeId == kTypeLadderFilter
    || typeId == kTypeEqFilter
    || typeId == kTypeBandpass
    || typeId == kTypeAllpass
    || typeId == kTypeActiveFilter
    || typeId == kTypePassiveFilter
    || typeId == kTypeTb303Filter
    || typeId == kTypeFlowerChildFilter
    || typeId == kTypeYellowjacketFilter
    || typeId == kTypeSuperloveFilter
    || typeId == kTypeHumanFilter
    || typeId == kTypeResonatorFilter
    || typeId == kTypeChaoticPhaseLockingFilter;
}

static void control_release_papoulis(Control& c) {
  if (c.papHandle > 0) {
    soemdsp_papoulis_filter_destroy(c.papHandle);
    c.papHandle = 0;
  }
}

static void control_ensure_papoulis(Control& c) {
  if (c.type != kSmoothTypePapoulis || c.snap) {
    control_release_papoulis(c);
    return;
  }
  if (c.papHandle <= 0) {
    c.papHandle = soemdsp_papoulis_filter_create();
    if (c.papHandle > 0) {
      soemdsp_papoulis_filter_snap(c.papHandle, c.out);
    }
  }
}

static void init_control(Control& c, double value, bool snap) {
  c.target = value;
  c.out = value;
  c.timeSamples = 0.0; // resolve → default seconds * sr
  c.coeff = 1.0;
  c.stage1 = value;
  c.stage2 = value;
  c.papHandle = 0;
  c.dirty = true;
  c.active = false;
  c.mode = kSmoothModeInternal;
  c.type = kSmoothTypeOnePole;
  c.snap = snap ? 1 : 0;
  c.blockStepped = 0;
}

static void init_node_defaults(Node& n, int typeId) {
  n.typeId = typeId;
  n.bypassed = false;
  n.nativeHandle = 0;
  n.nativeHandleL = 0;
  n.nativeHandleR = 0;
  n.nativeKind = 0;
  init_control(n.volumeDb, (typeId == kTypeMixStereo) ? 0.0 : -3.0, false);
  init_control(n.pan, 0.0, false);
  // lookaheadLimiter: mode = look-ahead on/off; timingMode = gainCompensation.
  init_control(
    n.frequency,
    (typeId == kTypeLadderFilter
      || typeId == kTypeButterworth || typeId == kTypeLinkwitzRiley
      || typeId == kTypeBessel || typeId == kTypeChebyshev || typeId == kTypeElliptic
      || typeId == kTypeEqFilter || typeId == kTypeBandpass || typeId == kTypeAllpass
      || typeId == kTypeActiveFilter
      || typeId == kTypeTb303Filter
      || typeId == kTypePapoulisFilter)
      ? 1000.0
      : (typeId == kTypeFlowerChildFilter || typeId == kTypeYellowjacketFilter
          || typeId == kTypeSuperloveFilter || typeId == kTypeHumanFilter
          || typeId == kTypeResonatorFilter || typeId == kTypeChaoticPhaseLockingFilter)
        ? 0.5
      : (typeId == kTypeModeResonator) ? 440.0
      : (typeId == kTypeCombResonator) ? 110.0
      : (typeId == kTypeInertialFilter) ? 20000.0 // attack Hz
      : (typeId == kTypeRobinSupersaw) ? 100.0
      : (typeId == kTypeRobinSinusoid) ? 440.0
      : (typeId == kTypeSampleHold) ? 0.0
      : (typeId == kTypeClock) ? 2.0
      : (typeId == kTypeAliasSine) ? 0.1 // normFreq (0→sr)
      : (typeId == kTypePhoneTone) ? 0.0 // freqOffset Hz
      : (typeId == kTypeBlit || typeId == kTypeSineWavetable || typeId == kTypeArchimedes
          || typeId == kTypeAdditiveOsc || typeId == kTypeSurgeOscillator
          || typeId == kTypeSoftwaveOsc || typeId == kTypeDsfOscillator
          || typeId == kTypeHypersaw || typeId == kTypeSinc
          || typeId == kTypeAdditiveOut) ? 100.0
      : (typeId == kTypeAdditiveBubble) ? 1.0 // cutoff 0..1 (settled default)
      : (typeId == kTypeAdditiveLinearFilter || typeId == kTypeAdditiveAnalogFilter
          || typeId == kTypeAdditiveLadderFilter) ? 2000.0 // cutoff Hz
      : (typeId == kTypeAdditiveNoisyFreq || typeId == kTypeAdditiveNoisyPhase
          || typeId == kTypeAdditiveNoisyPan || typeId == kTypeAdditiveNoisyAmp
          || typeId == kTypeAdditiveDiffusor)
        ? 35.0 // speed Hz
      : (typeId == kTypeAdditivePan) ? 0.25 // AutoPan rate Hz
      : (typeId == kTypeBradley2a) ? 1004.0 // carrier
      : (typeId == kTypeEllipsoid || typeId == kTypeBasicShape) ? 1.0 // RoundShape / LFO clock Hz
      : (typeId == kTypeSnowflake) ? 55.0
      : (typeId == kTypeAntisaw) ? 110.0
      : (typeId == kTypeHarmonicSeries) ? 100.0
      : (typeId == kTypePluckEnvelope) ? 1.5 // decayModFrequency
      : (typeId == kTypePll) ? 10.0 // LPF cutoff
      : (typeId == kTypeSoemReverb) ? 1000.0 // bandFrequency
      : (typeId == kTypeLorenzAttractor || typeId == kTypeChuaAttractor) ? 1.0 // speed
      : (typeId == kTypeLogisticMap || typeId == kTypeHenonMap
          || typeId == kTypeRayBouncer) ? 8.0 // rate/frequency
      : (typeId == kTypeFractalBrownianNoise) ? 0.5
      : (typeId == kTypeCheapWalk) ? 8.0 // rate Hz
      : (typeId == kTypeRandomWalk) ? 2.0
      : (typeId == kTypeSpiral || typeId == kTypeNyquistShannon) ? 440.0
      : (typeId == kTypeFractalSpiral || typeId == kTypeLogSpiral
          || typeId == kTypeRadar) ? 1.0
      : (typeId == kTypePhosphillator) ? 2.0
      : (typeId == kTypeBlubb || typeId == kTypeBoing || typeId == kTypeKeplerBouwkamp
          || typeId == kTypeMushroom || typeId == kTypeTorus
          || typeId == kTypeWirdoSpiral) ? 8.0
      : (typeId == kTypeCrossover2) ? 1000.0
      : (typeId == kTypeCrossover3) ? 300.0
      : (typeId == kTypeCrossover4) ? 200.0
      : (typeId == kTypeCrossover5) ? 150.0
      : (typeId == kTypeCrossover6) ? 100.0
      : (typeId == kTypeAudioPlayer) ? 1.0 // speed ×
      : 220.0,
    false
  );
  init_control(
    n.waveform,
    (typeId == kTypeAdditiveOsc || typeId == kTypeDsfOscillator) ? 1.0
      : (typeId == kTypeSoemReverb) ? 1.0 // doModulateEcho On
      : (typeId == kTypeAdditiveGenerator) ? 0.0 // Saw
      : (typeId == kTypeAdditiveBlaster) ? 1.0 // curveKind Exponential (PoC)
      : (typeId == kTypeAdditiveDiffusor) ? 0.0 // curveKind Rational
      : 0.0,
    true
  );
  init_control(
    n.amplitude,
    (typeId == kTypeAttenuverter) ? 0.5
      : (typeId == kTypePhoneTone) ? 0.5
      : (typeId == kTypeAdditiveOsc || typeId == kTypeHypersaw
          || typeId == kTypeAdditiveOut) ? 0.35
      : (typeId == kTypeAdditiveNoisyFreq) ? 0.5 // add
      : (typeId == kTypeAdditiveNoisyPhase || typeId == kTypeAdditiveNoisyPan
          || typeId == kTypeAdditiveNoisyAmp) ? 0.25 // add
      : (typeId == kTypePumpLimiter) ? 1.0 // output trim
      : (typeId == kTypeAdditiveBlaster) ? 1.0757 // jump (PoC)
      : (typeId == kTypeAdditiveDiffusor) ? 1.0 // diffusion
      : (typeId == kTypeAdditivePan) ? 0.85 // AutoPan depth
      : 1.0,
    false
  );
  init_control(
    n.shape,
    (typeId == kTypeAdditivePan) ? 1.0 // AutoPan spread (turns across bank)
      : (typeId == kTypeNoiseGenerator || typeId == kTypeSlewLimiter || typeId == kTypeAntisaw
      || typeId == kTypeBradley2a || typeId == kTypeEllipsoid || typeId == kTypeSnowflake
      || typeId == kTypeFlowerChildFilter || typeId == kTypeYellowjacketFilter
      || typeId == kTypeHumanFilter || typeId == kTypeResonatorFilter
      || typeId == kTypeCombResonator || typeId == kTypePluckEnvelope
      || typeId == kTypeAdditiveBubble || typeId == kTypeAdditiveGenerator
      || typeId == kTypeAdditiveFrequencySkew)
      ? 0.0 // chaos/damping/pwm/bubble/freqSkew off
      : (typeId == kTypeAdditiveBlaster) ? 179.0 // quantization (PoC default)
      : (typeId == kTypeAdditiveDiffusor) ? 0.0 // skew (rational)
      : (typeId == kTypeAdditiveLinearFilter) ? 0.25 // slope 0..1
      : (typeId == kTypeAdditiveAnalogFilter || typeId == kTypeAdditiveLadderFilter)
        ? 12.0 // slope dB/oct
      : (typeId == kTypeChaoticPhaseLockingFilter) ? 1.0 // chaos default
      : (typeId == kTypeDsfOscillator) ? 1.0 // harmonics
      : (typeId == kTypeHypersaw) ? 1.0 // spread
      : (typeId == kTypeSoftwaveOsc || typeId == kTypeSuperloveFilter
          || typeId == kTypeBasicShape) ? 0.5 // morph/chaos
      : (typeId == kTypeExpAdsr) ? 0.3 // attackShape
      : (typeId == kTypeAttackDecay) ? 1.0 // curve γ
      : (typeId == kTypeLorenzAttractor) ? 10.0 // sigma
      : (typeId == kTypeLogisticMap) ? 3.9 // r
      : (typeId == kTypeHenonMap) ? 1.4 // a
      : (typeId == kTypeChuaAttractor) ? 15.6 // alpha
      : (typeId == kTypeTuringMachine) ? 0.25 // probability
      : (typeId == kTypeDegreeTuring) ? 0.18 // probability
      : (typeId == kTypeDegreePhrase) ? 0.08 // mutate
      : (typeId == kTypeGravityWalker) ? 0.65 // gravity
      : (typeId == kTypeFractalBrownianNoise) ? 0.5 // persistence
      : (typeId == kTypePiSpigotNoise) ? 0.0 // smoothing
      : (typeId == kTypeSpiral || typeId == kTypeTorus) ? 1.0 // density
      : (typeId == kTypeFractalSpiral) ? 1.5 // growth
      : (typeId == kTypeLogSpiral) ? 3.0 // growth
      : (typeId == kTypeMushroom) ? 3.0 // density
      : (typeId == kTypeWirdoSpiral) ? 0.8 // density
      : (typeId == kTypeRadar) ? 1.0 // density
      : (typeId == kTypeKeplerBouwkamp) ? 0.5 // circles
      : (typeId == kTypePhosphillator) ? 0.5 // sharpness
      : (typeId == kTypeAudioPlayer) ? 0.0 // Scratch
      : 0.5,
    (typeId == kTypeSlewLimiter) // discrete Lin/Log/Exp/Smooth
  );
  init_control(
    n.phaseParam,
    (typeId == kTypeRayBouncer) ? 30.0 // launchAngle deg
      : (typeId == kTypeAdditiveBlaster) ? 145.84 // depth cycles (PoC)
      : (typeId == kTypeAdditivePan) ? 18.0 // AutoPan shimmer Hz
      : 0.0,
    false
  );
  init_control(
    n.resonance,
    (typeId == kTypeAdditiveBlaster) ? -0.2 // curve bend (PoC)
      : (typeId == kTypeChebyshev || typeId == kTypeElliptic) ? 1.0 // ripple dB
      : (typeId == kTypeEqFilter || typeId == kTypeAllpass) ? 0.707 // Q
      : (typeId == kTypeBandpass) ? 1.0 // Q
      : (typeId == kTypeTb303Filter) ? 0.0 // %
      : (typeId == kTypeSoemReverb) ? 1.0 // bandQ
      : (typeId == kTypeLorenzAttractor) ? 28.0 // rho
      : (typeId == kTypeAdditiveBubble) ? 481.53 // unskew (settled default)
      : (typeId == kTypeAdditiveLadderFilter) ? 0.0 // resonance
      : 0.2,
    false
  );
  init_control(
    n.mode,
    (typeId == kTypeNoiseGenerator
      || typeId == kTypeButterworth || typeId == kTypeLinkwitzRiley
      || typeId == kTypeBessel || typeId == kTypeChebyshev || typeId == kTypeElliptic
      || typeId == kTypePassiveFilter
      || typeId == kTypeFlowerChildFilter || typeId == kTypeSuperloveFilter
      || typeId == kTypeHumanFilter || typeId == kTypeResonatorFilter
      || typeId == kTypeCombResonator
      || typeId == kTypeAdditiveLinearFilter || typeId == kTypeAdditiveAnalogFilter
      || typeId == kTypeAdditiveLadderFilter || typeId == kTypeAdditiveFrequencySkew
      || typeId == kTypeAdditiveQuantizeFreq || typeId == kTypeAdditiveQuantizePhase
      || typeId == kTypeAdditiveNoisyFreq || typeId == kTypeAdditiveNoisyPhase
      || typeId == kTypeAdditiveNoisyPan || typeId == kTypeAdditiveNoisyAmp
      || typeId == kTypeAdditiveBubble // invertBubble Off
      || typeId == kTypeAttackDecay) // inputMode Gate
      ? 0.0 // LP / Clean / BP6 / Feedback / filter / curve / noise / Gate

      : (typeId == kTypeEqFilter) ? 1.0 // HP12
      : (typeId == kTypeBandpass) ? 4.0 // forced BP12 Peak
      : (typeId == kTypeAllpass) ? 6.0 // forced AP12
      : (typeId == kTypeActiveFilter) ? 3.0 // LP24
      : (typeId == kTypeTb303Filter) ? 4.0 // LP_24
      : (typeId == kTypeLookaheadLimiter || typeId == kTypePumpLimiter) ? 1.0 // look-ahead On
      : (typeId == kTypeSineWavetable) ? 2.0 // sincos
      : (typeId == kTypeSinc) ? 1.0 // band-limit kernel
      : (typeId == kTypeEllipsoid || typeId == kTypeBasicShape) ? 1.0 // CounterClock(Ph)
      : (typeId == kTypeSnowflake) ? 1.0 // Koch Snowflake pattern
      : (typeId == kTypeChordSequencer) ? 0.0 // progression
      : (typeId == kTypeChordPad) ? 0.0 // key C
      : (typeId == kTypeNoteTranspose) ? 0.0 // octaves
      : (typeId == kTypeDegreeTuring || typeId == kTypeDegreePhrase
          || typeId == kTypeGravityWalker) ? 1.0 // octaves
      : (typeId == kTypeRandomWalk) ? 3.0 // Fixed Steps
      : (typeId == kTypePiSpigotNoise) ? 0.0 // color White
      : (typeId == kTypeAudioPlayer) ? 4.0 // Play
      : (typeId == kTypeAdditiveOut) ? 0.0 // optimize Inaudible off
      : (typeId == kTypeAdditiveGenerator) ? 1.0 // HarmonicFade Smoothed
      : 1.0,
    true
  );
  // Ladder stages default 4; robinSupersaw = voices; triggerDivider = division;
  // triggerCounter/stepSequencer = counts; transport = divisions (can be ≤0);
  // antisaw = reflections; archimedes = profile dtShift;
  // additiveOsc = harmonics; hypersaw = voices; sinc = lobes;
  // snowflake = iterations.
  init_control(
    n.stages,
    (typeId == kTypeRobinSupersaw) ? 7.0
      : (typeId == kTypeTriggerDivider) ? 2.0
      : (typeId == kTypeTriggerCounter || typeId == kTypeStepSequencer
          || typeId == kTypeTuringMachine || typeId == kTypeDegreeTuring
          || typeId == kTypeDegreePhrase) ? 8.0
      : (typeId == kTypeChordPad || typeId == kTypeNoteTranspose) ? 0.0 // degree / semis
      : (typeId == kTypeFractalBrownianNoise) ? 4.0 // octaves
      : (typeId == kTypePiSpigotNoise) ? 1.0 // stride
      : (typeId == kTypePulseExplosion) ? 20.0 // numberOfPulses
      : (typeId == kTypeFractalSpiral) ? 5.0 // octaves
      : (typeId == kTypeLogSpiral) ? 4.0 // turns
      : (typeId == kTypeMushroom || typeId == kTypeKeplerBouwkamp
          || typeId == kTypeRadar || typeId == kTypeWirdoSpiral) ? 1.0
      : (typeId == kTypeTransport) ? 0.0
      : (typeId == kTypeAntisaw) ? 64.0
      : (typeId == kTypeArchimedes) ? 12.0
      : (typeId == kTypeAdditiveOsc || typeId == kTypeAdditiveGenerator) ? 32.0
      : (typeId == kTypeHypersaw) ? 8.0
      : (typeId == kTypeSinc) ? 4.0
      : (typeId == kTypeSnowflake) ? 3.0 // iterations
      : (typeId >= kTypeCrossover2 && typeId <= kTypeCrossover6) ? 4.0 // LR order
      : (typeId == kTypeActiveFilter) ? 3.0 // feedbackCircuit Res+Clip
      : (typeId == kTypeCombResonator) ? 0.0 // invert Off
      : (typeId == kTypeSoemReverb) ? 10.0 // numDelays
      : (typeId == kTypePll) ? 1.0 // PC type RS Flip
      : (typeId == kTypeAdditiveDiffusor) ? 0.0 // quantize off
      : 4.0,
    // Generator Harmonics must stay continuous for Decimal trailing amp.
    (typeId != kTypeAdditiveGenerator)
  );
  init_control(
    n.center,
    (typeId == kTypeHypersaw) ? 0.1 // drift
      : (typeId == kTypeExpAdsr) ? 0.0001 // releaseShape
      : (typeId == kTypeSoemReverb) ? 2.0 // bandStages
      : (typeId == kTypeLorenzAttractor) ? 1.0 // scale
      : (typeId == kTypeLogisticMap) ? 0.5 // seed
      : (typeId == kTypeHenonMap) ? 0.1 // seedX
      : (typeId == kTypeChuaAttractor) ? -1.143 // m0
      : (typeId == kTypeRayBouncer) ? 1.5 // aspect
      : (typeId == kTypeFractalBrownianNoise) ? 1.0 // scale
      : (typeId == kTypePiSpigotNoise) ? 0.0 // start
      : (typeId == kTypePulseExplosion) ? 0.5 // centerTime
      : (typeId == kTypeHarmonicSeries) ? 0.0 // offset
      : (typeId == kTypeAdditiveBlaster) ? 0.44 // bias (PoC)
      : (typeId == kTypeAdditivePan) ? 0.35 // AutoPan shimmer amount
      : (typeId == kTypeCrossover3) ? 3000.0
      : (typeId == kTypeCrossover4) ? 1000.0
      : (typeId == kTypeCrossover5) ? 500.0
      : (typeId == kTypeCrossover6) ? 300.0
      : 0.0,
    false
  );
  // Soft-clipper width default 2; noise = deviation; supersaw = detune;
  // triggerCounter = increment; archimedes = dither bits;
  // surge = syncFrequency; dsf = pulseWidth; hypersaw = random;
  // bradley2a = freqOffset; snowflake = angle°.
  init_control(
    n.width,
    (typeId == kTypeNoiseGenerator) ? 0.5
      : (typeId == kTypeRobinSupersaw) ? 30.0
      : (typeId == kTypeTriggerCounter) ? 1.0
      : (typeId == kTypePumpLimiter) ? 8.0 // ratio
      : (typeId == kTypeMetallicRatio) ? 1.0 // index n
      : (typeId == kTypeHarmonicSeries) ? 0.0 // harmonic
      : (typeId == kTypeArchimedes) ? 3.0
      : (typeId == kTypeSurgeOscillator) ? 50.0 // syncFrequency Hz
      : (typeId == kTypeDsfOscillator) ? 0.5 // PWM
      : (typeId == kTypeHypersaw) ? 0.15 // random
      : (typeId == kTypeAdditiveOsc) ? 0.0 // harmonicPhaseMultiply
      : (typeId == kTypeAdditiveQuantizeFreq) ? 0.0 // random
      : (typeId == kTypeAdditivePan) ? 0.75 // AutoPan Width (odd/even fan)
      : (typeId == kTypeAdditiveBlaster) ? 0.58 // offset (PoC)
      : (typeId == kTypeBradley2a) ? 0.0 // freqOffset
      : (typeId == kTypeSnowflake) ? 60.0 // angle°
      : (typeId == kTypeButterworth || typeId == kTypeLinkwitzRiley
          || typeId == kTypeBessel || typeId == kTypeChebyshev || typeId == kTypeElliptic)
        ? 1.0 // bandwidth octaves
      : (typeId == kTypeCombResonator) ? 1.0 // depth
      : (typeId == kTypePluckEnvelope) ? 1.0 // velocity
      : (typeId == kTypeSoemReverb) ? 2.0 // lpfStages
      : (typeId == kTypeLorenzAttractor) ? 2.6666666666666665 // beta
      : (typeId == kTypeHenonMap) ? 0.3 // b
      : (typeId == kTypeChuaAttractor) ? 28.0 // beta
      : (typeId == kTypeRayBouncer) ? 1.0 // size
      : (typeId == kTypeRandomWalk) ? 0.25 // jitter
      : (typeId == kTypeGravityWalker) ? 0.15 // leap
      : (typeId == kTypeSpiral || typeId == kTypeFractalSpiral
          || typeId == kTypeLogSpiral) ? 0.5 // size
      : (typeId == kTypeTorus || typeId == kTypeMushroom) ? 1.0 // size/width
      : (typeId == kTypeWirdoSpiral) ? 1.0 // length
      : (typeId == kTypeCrossover4) ? 5000.0
      : (typeId == kTypeCrossover5) ? 2000.0
      : (typeId == kTypeCrossover6) ? 1000.0
      : 2.0,
    false
  );
  init_control(n.oversample, 2.0, true); // softClipper / clipperLimiter antialias mode
  init_control(
    n.mix,
    (typeId == kTypePingPongDelay || typeId == kTypeDelayEffect) ? 0.35
      : (typeId == kTypeDsfOscillator) ? 0.5 // SquSaw blend
      : (typeId == kTypeBradley2a) ? 0.0 // interfLevel
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope) ? 0.55 // sustain
      : (typeId == kTypeLorenzAttractor) ? 0.4 // zDepth
      : (typeId == kTypeHenonMap) ? 0.1 // seedY
      : (typeId == kTypeChuaAttractor) ? -0.714 // m1
      : (typeId == kTypeRayBouncer) ? 0.0 // rotate deg
      : (typeId == kTypePulseExplosion) ? 0.3 // timeSpread
      : (typeId == kTypeAdditivePan) ? 1.0 // AutoPan orbit skew
      : 0.43,
    false
  );
  init_control(
    n.diffusionSize,
    (typeId == kTypeBradley2a) ? 0.0 // harm2
      : (typeId == kTypePluckEnvelope) ? 0.08 // decayModStart
      : 0.35,
    false
  );
  init_control(
    n.diffusionAmount,
    (typeId == kTypeBradley2a) ? 0.0 // harm3
      : (typeId == kTypePluckEnvelope) ? 0.55 // decayModEnd
      : 0.70,
    false
  );
  init_control(
    n.delaySize,
    (typeId == kTypePluckEnvelope) ? 0.8 // endingDecay
      : (typeId == kTypeSoemReverb) ? 0.35 // echoTime
      : 0.02,
    false
  );
  init_control(
    n.recycle,
    (typeId == kTypeBradley2a) ? 0.0 // impulseLevel
      : (typeId == kTypePluckEnvelope) ? 0.35 // releaseFeedback
      : (typeId == kTypeSoemReverb) ? 0.5
      : 0.70,
    false
  );
  init_control(
    n.lfoAmplitude,
    (typeId == kTypeBradley2a) ? 0.0 // ampDepth
      : (typeId == kTypeDelayEffect) ? 0.02 // modAmount
      : (typeId == kTypeSoemReverb) ? 0.002 // lfoAmp
      : 0.07,
    false
  );
  init_control(
    n.lfoBaseSpeed,
    (typeId == kTypeBradley2a) ? 40.0 // ampRate
      : (typeId == kTypeSoemReverb) ? 0.5 // lfoFrequency
      : 0.83,
    false
  );
  init_control(
    n.lfoVariation,
    (typeId == kTypePingPongDelay) ? 0.25
      : (typeId == kTypeSoemReverb) ? 1.0
      : (typeId == kTypeDelayEffect) ? 0.0
      : 0.001,
    false
  );
  init_control(
    n.seed,
    (typeId == kTypeNoiseGenerator || typeId == kTypeRandomClock) ? 1.0
      : (typeId == kTypeLutCell) ? 27030.0 // default truth table
      : (typeId == kTypeSoemReverb) ? 500.0
      : (typeId == kTypePitchQuantizer) ? 2741.0 // major scale mask
      : (typeId == kTypeDegreeTuring || typeId == kTypeDegreePhrase
          || typeId == kTypeGravityWalker) ? 1.0 // Major scale choice
      : (typeId == kTypeFractalBrownianNoise || typeId == kTypeRandomWalk || typeId == kTypeCheapWalk) ? 1.0
      : (typeId == kTypeAdditiveQuantizeFreq || typeId == kTypeAdditiveQuantizePhase
          || typeId == kTypeAdditiveNoisyFreq || typeId == kTypeAdditiveNoisyPhase
          || typeId == kTypeAdditiveNoisyPan || typeId == kTypeAdditiveNoisyAmp) ? 1.0
      : 0.0,
    // Music Player playlistScrub is continuous on this Control — do not snap.
    (typeId == kTypeAudioPlayer) ? false : true
  );
  init_control(
    n.feedback,
    (typeId == kTypeBradley2a) ? 1.0 // hitRate
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope) ? 0.22 // decay
      : (typeId == kTypeAttackDecay) ? 0.25 // decay
      : (typeId == kTypePluckEnvelope) ? 0.35 // decay
      : (typeId == kTypeFlowerChildEnvelopeFollower) ? 0.001 // decay
      : (typeId == kTypeDelayEffect) ? 0.25
      : (typeId == kTypeSoemReverb) ? 1.0 // duckLimit
      : 0.35,
    false
  );
  init_control(n.level, 1.0, false); // bradley2a hitGain
  // Ping-pong beat fraction; slew = up/down; sampleDelay = time/samples;
  // triggerDivider pulseTime; delayedTrigger delay/pulseTime;
  // bradley2a = hitDuration.
  init_control(
    n.timeNumerator,
    (typeId == kTypePulseExplosion) ? 0.0 // startTime
      : (typeId == kTypeSlewLimiter) ? 0.05
      : (typeId == kTypeNoteGlide) ? 0.05
      : (typeId == kTypeSampleDelay) ? 0.0
      : (typeId == kTypeTriggerDivider || typeId == kTypeTriggerCounter) ? 0.01
      : (typeId == kTypeDelayedTrigger) ? 0.1
      : (typeId == kTypeRandomClock) ? 0.25
      : (typeId == kTypeLookaheadLimiter || typeId == kTypePumpLimiter) ? 5.0 // look-ahead ms
      : (typeId == kTypeBradley2a) ? 0.005 // hitDuration
      : (typeId == kTypeModeResonator || typeId == kTypeCombResonator) ? 1.0 // decay s
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope
          || typeId == kTypePluckEnvelope) ? 0.0 // delay
      : (typeId == kTypeFlowerChildEnvelopeFollower) ? 0.001 // attack
      : (typeId == kTypeDelayEffect) ? 0.18 // time s
      : (typeId == kTypeAudioPlayer) ? 0.0 // start phase
      : (typeId == kTypeSpeakerProtector2) ? 0.008 // dropSeconds
      : 1.0,
    false
  );
  init_control(
    n.timeDenominator,
    (typeId == kTypePulseExplosion) ? 1.0 // endTime
      : (typeId == kTypeSlewLimiter) ? 0.05
      : (typeId == kTypeSampleDelay) ? 0.0
      : (typeId == kTypeDelayedTrigger) ? 0.01
      : (typeId == kTypeRandomClock) ? 1.0
      : (typeId == kTypeLookaheadLimiter || typeId == kTypePumpLimiter) ? 0.0 // look-ahead samples
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope) ? 0.08 // attack
      : (typeId == kTypeAttackDecay) ? 0.01 // attack
      : (typeId == kTypePluckEnvelope) ? 0.002 // attackFeedback
      : (typeId == kTypeFlowerChildEnvelopeFollower) ? 0.001 // hold
      : (typeId == kTypeAudioPlayer) ? 1.0 // end phase
      : (typeId == kTypeSpeakerProtector2) ? 0.333 // holdSeconds
      : 4.0,
    false
  );
  init_control(
    n.timingMode,
    (typeId == kTypeActiveFilter) ? 1.0 // gainCompensation On
      : (typeId == kTypeAttackDecay) ? 0.0 // cycle Off
      : 0.0, // also mode/comb resonator hold Off
    true
  ); // pingPong timing; lookaheadLimiter / activeFilter = gainCompensation
  init_control(
    n.offsetMs,
    (typeId == kTypeRandomClock) ? 0.01
      : (typeId == kTypeLookaheadLimiter) ? 0.2 // attack ms
      : (typeId == kTypePumpLimiter) ? 5.0 // attack ms
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope) ? 0.45 // release s
      : (typeId == kTypePluckEnvelope) ? 0.08 // autoReleaseTime
      : (typeId == kTypeSoemReverb) ? 0.04 // duckRelease
      : (typeId == kTypeSpeakerProtector2) ? 0.75 // riseSeconds
      : 0.0,
    false
  );
  init_control(n.lfoStyle, 0.0, true);
  init_control(
    n.lfoRate,
    (typeId == kTypeBradley2a) ? 60.0 // jitterRate
      : (typeId == kTypeDelayEffect) ? 0.1 // modRate
      : 0.35,
    false
  );
  init_control(n.saturate, 1.0, false);
  init_control(
    n.lpfFrequency,
    (typeId == kTypeAdditiveOsc) ? 20000.0 // dampingFilterFrequency
      : (typeId == kTypeBradley2a) ? 2600.0 // interfFreq
      : (typeId == kTypeActiveFilter || typeId == kTypePassiveFilter) ? 1000.0 // highCut
      : (typeId == kTypeInertialFilter) ? 20.0 // release Hz
      : (typeId == kTypeCrossover5) ? 8000.0
      : (typeId == kTypeCrossover6) ? 3000.0
      : 8000.0,
    false
  );
  init_control(
    n.hpfFrequency,
    (typeId == kTypeActiveFilter || typeId == kTypePassiveFilter) ? 200.0 // lowCut
      : (typeId == kTypeCrossover6) ? 10000.0
      : 20.0,
    false
  );
  init_control(n.tempoBpm, 120.0, false);
  init_control(n.offset, (typeId == kTypePll) ? 5.0 : 0.0, false); // degreePhrase rest8
  init_control(
    n.inLow,
    (typeId == kTypePulseExplosion) ? 0.3 // lowAmplitude
      : (typeId == kTypeAdditiveFrequencySkew) ? 1.0 // lowStretch
      : (typeId == kTypeDegreePhrase) ? 0.0 // rest1
      : (typeId == kTypeRange) ? -1.0 : (typeId == kTypeClipperLimiter) ? -12.0 : 0.0,
    (typeId == kTypeDegreePhrase)
  );
  init_control(
    n.inHigh,
    (typeId == kTypePulseExplosion) ? 1.0 // highAmplitude
      : (typeId == kTypeAdditiveFrequencySkew) ? 1.0 // highStretch
      : (typeId == kTypeDegreePhrase) ? 0.0 // rest2
      : (typeId == kTypeRange) ? 1.0 : (typeId == kTypeClipperLimiter) ? 0.0 : 1.0,
    (typeId == kTypeDegreePhrase)
  );
  init_control(n.outLow, 0.0, (typeId == kTypeDegreePhrase)); // rest3
  init_control(
    n.outHigh,
    (typeId == kTypeRange) ? 1000.0
      : (typeId == kTypeDegreePhrase) ? 1.0 // rest4
      : 1.0,
    (typeId == kTypeDegreePhrase)
  );
  init_control(
    n.gainDb,
    (typeId == kTypeLookaheadLimiter) ? -1.0 // ceiling dB
      : (typeId == kTypePumpLimiter) ? 0.0 // inputGain dB
      : 0.0,
    false
  );
  init_control(n.gainLeftDb, 0.0, false);
  init_control(n.gainRightDb, 0.0, false);
  init_control(n.gainMonoSum, 0.0, true); // discrete mono-sum law
  // mix: linear volumes default 1; mixStereo: dB volumes default 0; pans/bias 0; bleeds 0
  // lookaheadLimiter: laneBias[0]=release ms, laneBias[1]=dipGain
  // pumpLimiter: laneBias[0]=release ms, laneBias[1]=threshold dB
  // stepSequencer: laneVol[0..3]=step1..4, laneBias[0..3]=step5..8
  // degreePhrase: same lanes for Deg 1..8; rests on in*/out*/bleed*/offset
  const double laneVolDefault = (typeId == kTypeMix) ? 1.0 : 0.0;
  static const double kStepDefaults[8] = {
    0.0, 0.25, 0.5, 0.75, 1.0, 0.75, 0.5, 0.25
  };
  static const double kDegreePhraseSteps[8] = {
    0.0, 0.25, 0.5, 0.15, 0.75, 0.4, 0.6, 0.0
  };
  for (int i = 0; i < 4; i++) {
    double volDef = laneVolDefault;
    if (typeId == kTypeStepSequencer) volDef = kStepDefaults[i];
    else if (typeId == kTypeDegreePhrase) volDef = kDegreePhraseSteps[i];
    init_control(n.laneVol[i], volDef, false);
    double biasDef = 0.0;
    if (typeId == kTypeLookaheadLimiter) {
      if (i == 0) biasDef = 100.0;
      else if (i == 1) biasDef = 1.0;
    } else if (typeId == kTypePumpLimiter) {
      if (i == 0) biasDef = 250.0; // release ms
      else if (i == 1) biasDef = -18.0; // threshold dB
    } else if (typeId == kTypeStepSequencer) {
      biasDef = kStepDefaults[i + 4];
    } else if (typeId == kTypeDegreePhrase) {
      biasDef = kDegreePhraseSteps[i + 4];
    }
    init_control(n.laneBias[i], biasDef, false);
  }
  // degreePhrase rests: rest4=1, rest7=1
  init_control(n.bleed2, 0.0, false); // rest5
  init_control(n.bleed3, 0.0, false); // rest6
  init_control(n.bleed4, (typeId == kTypeDegreePhrase) ? 1.0 : 0.0, true); // rest7
  n.phase = 0.0;
  n.lastReset = 0.0;
  n.yellowPhaseAccLen = 0;
  n.yellowLastHarmonics = -1;
  n.yellowWalkCount = 0;
  n.yellowWalkSeed = 0xFFFFFFFFu;
  n.yellowWalkSalt = 0;
  n.yellowLerpFromLen = 0;
  n.yellowCutoffStripFrames = 0;
  if (
    typeId == kTypeAdditiveGenerator
    || typeId == kTypeAdditiveBubble
    || typeId == kTypeAdditiveOut
    || typeId == kTypeAdditiveLinearFilter
    || typeId == kTypeAdditiveAnalogFilter
    || typeId == kTypeAdditiveLadderFilter
    || typeId == kTypeAdditiveFrequencySkew
    || typeId == kTypeAdditiveQuantizeFreq
    || typeId == kTypeAdditiveQuantizePhase
    || typeId == kTypeAdditivePan
    || typeId == kTypeAdditiveNoisyFreq
    || typeId == kTypeAdditiveNoisyPhase
    || typeId == kTypeAdditiveNoisyPan
    || typeId == kTypeAdditiveNoisyAmp
    || typeId == kTypeAdditivePhaseEntry
    || typeId == kTypeAdditiveBlaster
    || typeId == kTypeAdditiveDiffusor
  ) {
    soemdsp_yellow_graph::graph_clear(n.yellowGraph);
    for (int i = 0; i < soemdsp_yellow_graph::kMaxHarmonics; i += 1) {
      n.yellowPhaseAcc[i] = 0.0;
      n.yellowWalks[i].seed = 0;
      n.yellowWalks[i].x = 0.0f;
      n.yellowWalks[i].y = 0.0f;
      n.yellowWalks[i].out = 0.0f;
      n.yellowLerpFrom[i] = 0.0f;
    }
    for (int i = 0; i < kMaxBlockFrames; i += 1) n.yellowCutoffStrip[i] = 1.0f;
  }
}

static Control* control_for_param(Node& n, int paramId) {
  if (paramId == kParamVolumeDb) return &n.volumeDb;
  if (paramId == kParamPan) return &n.pan;
  if (paramId == kParamFrequency) return &n.frequency;
  if (paramId == kParamWaveform) return &n.waveform;
  if (paramId == kParamAmplitude) return &n.amplitude;
  if (paramId == kParamShape) return &n.shape;
  if (paramId == kParamPhase) return &n.phaseParam;
  if (paramId == kParamResonance) return &n.resonance;
  if (paramId == kParamMode) return &n.mode;
  if (paramId == kParamStages) return &n.stages;
  if (paramId == kParamCenter) return &n.center;
  if (paramId == kParamWidth) return &n.width;
  if (paramId == kParamOversample) return &n.oversample;
  if (paramId == kParamMix) return &n.mix;
  if (paramId == kParamDiffusionSize) return &n.diffusionSize;
  if (paramId == kParamDiffusionAmount) return &n.diffusionAmount;
  if (paramId == kParamDelaySize) return &n.delaySize;
  if (paramId == kParamRecycle) return &n.recycle;
  if (paramId == kParamLfoAmplitude) return &n.lfoAmplitude;
  if (paramId == kParamLfoBaseSpeed) return &n.lfoBaseSpeed;
  if (paramId == kParamLfoVariation) return &n.lfoVariation;
  if (paramId == kParamSeed) return &n.seed;
  if (paramId == kParamFeedback) return &n.feedback;
  if (paramId == kParamLevel) return &n.level;
  if (paramId == kParamTimeNumerator) return &n.timeNumerator;
  if (paramId == kParamTimeDenominator) return &n.timeDenominator;
  if (paramId == kParamTimingMode) return &n.timingMode;
  if (paramId == kParamOffsetMs) return &n.offsetMs;
  if (paramId == kParamLfoStyle) return &n.lfoStyle;
  if (paramId == kParamLfoRate) return &n.lfoRate;
  if (paramId == kParamSaturate) return &n.saturate;
  if (paramId == kParamLpfFrequency) return &n.lpfFrequency;
  if (paramId == kParamHpfFrequency) return &n.hpfFrequency;
  if (paramId == kParamTempoBpm) return &n.tempoBpm;
  if (paramId == kParamAttAmplitude) return &n.amplitude;
  if (paramId == kParamAttOffset) return &n.offset;
  if (paramId == kParamInLow) return &n.inLow;
  if (paramId == kParamInHigh) return &n.inHigh;
  if (paramId == kParamOutLow) return &n.outLow;
  if (paramId == kParamOutHigh) return &n.outHigh;
  if (paramId == kParamGainDb) return &n.gainDb;
  if (paramId == kParamGainLeftDb) return &n.gainLeftDb;
  if (paramId == kParamGainRightDb) return &n.gainRightDb;
  if (paramId == kParamGainMonoSum) return &n.gainMonoSum;
  if (paramId == kParamLaneVol1) return &n.laneVol[0];
  if (paramId == kParamLaneVol2) return &n.laneVol[1];
  if (paramId == kParamLaneVol3) return &n.laneVol[2];
  if (paramId == kParamLaneVol4) return &n.laneVol[3];
  if (paramId == kParamLaneBias1) return &n.laneBias[0];
  if (paramId == kParamLaneBias2) return &n.laneBias[1];
  if (paramId == kParamLaneBias3) return &n.laneBias[2];
  if (paramId == kParamLaneBias4) return &n.laneBias[3];
  if (paramId == kParamBleed2) return &n.bleed2;
  if (paramId == kParamBleed3) return &n.bleed3;
  if (paramId == kParamBleed4) return &n.bleed4;
  return nullptr;
}

static void dirty_node_control_coeffs(Node& n) {
  n.volumeDb.dirty = true;
  n.pan.dirty = true;
  n.frequency.dirty = true;
  n.waveform.dirty = true;
  n.amplitude.dirty = true;
  n.shape.dirty = true;
  n.phaseParam.dirty = true;
  n.resonance.dirty = true;
  n.mode.dirty = true;
  n.stages.dirty = true;
  n.center.dirty = true;
  n.width.dirty = true;
  n.oversample.dirty = true;
  n.mix.dirty = true;
  n.diffusionSize.dirty = true;
  n.diffusionAmount.dirty = true;
  n.delaySize.dirty = true;
  n.recycle.dirty = true;
  n.lfoAmplitude.dirty = true;
  n.lfoBaseSpeed.dirty = true;
  n.lfoVariation.dirty = true;
  n.seed.dirty = true;
  n.feedback.dirty = true;
  n.level.dirty = true;
  n.timeNumerator.dirty = true;
  n.timeDenominator.dirty = true;
  n.timingMode.dirty = true;
  n.offsetMs.dirty = true;
  n.lfoStyle.dirty = true;
  n.lfoRate.dirty = true;
  n.saturate.dirty = true;
  n.lpfFrequency.dirty = true;
  n.hpfFrequency.dirty = true;
  n.tempoBpm.dirty = true;
  n.offset.dirty = true;
  n.inLow.dirty = true;
  n.inHigh.dirty = true;
  n.outLow.dirty = true;
  n.outHigh.dirty = true;
  n.gainDb.dirty = true;
  n.gainLeftDb.dirty = true;
  n.gainRightDb.dirty = true;
  n.gainMonoSum.dirty = true;
  for (int i = 0; i < 4; i++) {
    n.laneVol[i].dirty = true;
    n.laneBias[i].dirty = true;
  }
  n.bleed2.dirty = true;
  n.bleed3.dirty = true;
  n.bleed4.dirty = true;
}

static void dirty_all_control_coeffs(Circuit& g) {
  for (int i = 0; i < g.nodeCount; i++) {
    if (g.nodes[i].used) dirty_node_control_coeffs(g.nodes[i]);
  }
}

static double resolve_control_time_samples(const Control& c, const Circuit& g) {
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double defSamples = kDefaultSmoothSeconds * sr;
  const double internal = c.timeSamples > 0.0 ? c.timeSamples : defSamples;
  const double global = g.globalTimeSamples > 0.0 ? g.globalTimeSamples : defSamples;
  if (c.mode == kSmoothModeOff) return 0.0;
  if (c.mode == kSmoothModeGlobal) return global;
  if (c.mode == kSmoothModeInternalGlobal) return internal + global;
  // internal (default)
  return internal;
}

static void control_ensure_coeff(Control& c, Circuit& g) {
  if (!c.dirty) return;
  c.dirty = false;
  if (c.snap || c.type == kSmoothTypeNone) {
    c.coeff = 1.0;
    return;
  }
  const double t = resolve_control_time_samples(c, g);
  if (!(t > 0.0)) {
    c.coeff = 1.0;
    return;
  }
  if (c.type == kSmoothTypeLinear) {
    // Constant-rate lerp: delta per sample toward target (recomputed on dirty).
    c.coeff = (c.target - c.out) / t;
    return;
  }
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  // Match JS onePole / twoPole / threePole: frequencyHz = 1/seconds = sr/tSamples
  const double frequencyValue = sr / t;
  double wUnit = kTwoPi / sr;
  if (wUnit > 0.000142475857) wUnit = 0.000142475857;
  const double w = wUnit * frequencyValue;
  const double a1 = dsp_exp(-w);
  c.coeff = 1.0 - a1;
  if (!(c.coeff == c.coeff) || c.coeff < 0.0) c.coeff = 1.0;
  if (c.coeff > 1.0) c.coeff = 1.0;
}

static void smoother_add(Circuit& g, Control& c) {
  if (c.snap || c.active) return;
  if (g.toSmoothCount >= kMaxToSmooth) return;
  c.active = true;
  g.toSmooth[g.toSmoothCount++] = &c;
}

static void control_set_target(Circuit& g, Control& c, double value) {
  c.target = value;
  c.dirty = true; // linear increment depends on (target - out)
  if (c.snap || c.type == kSmoothTypeNone) {
    c.out = value;
    c.stage1 = value;
    c.stage2 = value;
    if (c.papHandle > 0) soemdsp_papoulis_filter_snap(c.papHandle, value);
    return;
  }
  if (c.type == kSmoothTypePapoulis) {
    control_ensure_papoulis(c);
    if (resolve_control_time_samples(c, g) <= 0.0) {
      c.out = value;
      c.stage1 = value;
      c.stage2 = value;
      if (c.papHandle > 0) soemdsp_papoulis_filter_snap(c.papHandle, value);
      return;
    }
    if (dsp_fabs(c.out - c.target) <= kPlanck) {
      c.out = value;
      c.stage1 = value;
      c.stage2 = value;
      if (c.papHandle > 0) soemdsp_papoulis_filter_snap(c.papHandle, value);
      return;
    }
    smoother_add(g, c);
    return;
  }
  control_ensure_coeff(c, g);
  if (c.type != kSmoothTypeLinear && (c.coeff >= 1.0 - 1e-15 || resolve_control_time_samples(c, g) <= 0.0)) {
    c.out = value;
    c.stage1 = value;
    c.stage2 = value;
    return;
  }
  if (dsp_fabs(c.out - c.target) <= kPlanck) {
    c.out = value;
    c.stage1 = value;
    c.stage2 = value;
    return;
  }
  smoother_add(g, c);
}

static void control_set_time(Circuit& g, Control& c, double timeSamples) {
  if (!(timeSamples == timeSamples) || timeSamples < 0.0) timeSamples = 0.0;
  c.timeSamples = timeSamples;
  c.dirty = true;
  if (c.snap) return;
  if (dsp_fabs(c.out - c.target) > kPlanck) smoother_add(g, c);
}

static void control_step(Control& c, Circuit& g) {
  if (c.snap || c.type == kSmoothTypeNone) {
    c.out = c.target;
    c.stage1 = c.target;
    c.stage2 = c.target;
    if (c.papHandle > 0) soemdsp_papoulis_filter_snap(c.papHandle, c.target);
    return;
  }
  if (c.type == kSmoothTypePapoulis) {
    control_ensure_papoulis(c);
    const double t = resolve_control_time_samples(c, g);
    const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
    if (c.papHandle <= 0 || !(t > 0.0)) {
      c.out = c.target;
      c.stage1 = c.target;
      c.stage2 = c.target;
      if (c.papHandle > 0) soemdsp_papoulis_filter_snap(c.papHandle, c.target);
      return;
    }
    // Same cutoff mapping as JS param smoother: frequencyHz = 1/seconds = sr/t.
    const double cutoffHz = sr / t;
    c.out = soemdsp_papoulis_filter_sample(c.papHandle, c.target, cutoffHz, sr);
    c.stage1 = c.out;
    c.stage2 = c.out;
    return;
  }
  control_ensure_coeff(c, g);
  if (c.coeff >= 1.0 - 1e-15) {
    c.out = c.target;
    c.stage1 = c.target;
    c.stage2 = c.target;
    return;
  }
  if (c.type == kSmoothTypeLinear) {
    // coeff holds per-sample increment (set on dirty from target/out/time).
    const double inc = c.coeff;
    c.out += inc;
    if ((inc > 0.0 && c.out > c.target) || (inc < 0.0 && c.out < c.target) || dsp_fabs(inc) < 1e-30) {
      c.out = c.target;
      c.stage1 = c.target;
      c.stage2 = c.target;
    }
    return;
  }
  if (c.type == kSmoothTypeTwoPole) {
    // Cascaded one-poles (same b0), matching JS twoPole.
    c.stage1 += c.coeff * (c.target - c.stage1);
    c.out += c.coeff * (c.stage1 - c.out);
    return;
  }
  if (c.type == kSmoothTypeThreePole) {
    // 3× real one-pole: steeper than 2P, never overshoots (unlike Π).
    c.stage1 += c.coeff * (c.target - c.stage1);
    c.stage2 += c.coeff * (c.stage1 - c.stage2);
    c.out += c.coeff * (c.stage2 - c.out);
    return;
  }
  // onePole (default)
  c.out += c.coeff * (c.target - c.out);
}

static void smoother_run(Circuit& g, int n) {
  if (g.toSmoothCount <= 0 || n < 1) return;
  for (int f = 0; f < n; f++) {
    for (int i = 0; i < g.toSmoothCount; i++) {
      Control* c = g.toSmooth[i];
      // Skip Controls already advanced sample-accurately this quantum.
      if (c && !c->blockStepped) control_step(*c, g);
    }
  }
}

static void control_snap_to_target(Control& c) {
  c.out = c.target;
  c.stage1 = c.target;
  c.stage2 = c.target;
  c.active = false;
  c.blockStepped = 0;
  c.dirty = true;
  if (c.papHandle > 0) soemdsp_papoulis_filter_snap(c.papHandle, c.target);
}

// Jump every Control to its target and clear the chase list. Call after
// initial param load / audio engine start so the first sample is on-target.
static void smoother_snap_all(Circuit& g) {
  for (int i = 0; i < g.nodeCount; i++) {
    if (!g.nodes[i].used) continue;
    Node& n = g.nodes[i];
    Control* slots[] = {
      &n.volumeDb, &n.pan, &n.frequency, &n.waveform, &n.amplitude, &n.shape,
      &n.phaseParam, &n.resonance, &n.mode, &n.stages, &n.center, &n.width,
      &n.oversample, &n.mix, &n.diffusionSize, &n.diffusionAmount, &n.delaySize,
      &n.recycle, &n.lfoAmplitude, &n.lfoBaseSpeed, &n.lfoVariation, &n.seed,
      &n.feedback, &n.level, &n.timeNumerator, &n.timeDenominator, &n.timingMode,
      &n.offsetMs, &n.lfoStyle, &n.lfoRate, &n.saturate, &n.lpfFrequency,
      &n.hpfFrequency, &n.tempoBpm, &n.offset, &n.inLow, &n.inHigh, &n.outLow,
      &n.outHigh, &n.gainDb, &n.gainLeftDb, &n.gainRightDb, &n.gainMonoSum,
      &n.laneVol[0], &n.laneVol[1], &n.laneVol[2], &n.laneVol[3],
      &n.laneBias[0], &n.laneBias[1], &n.laneBias[2], &n.laneBias[3],
      &n.bleed2, &n.bleed3, &n.bleed4
    };
    for (unsigned si = 0; si < sizeof(slots) / sizeof(slots[0]); si++) {
      if (slots[si]) control_snap_to_target(*slots[si]);
    }
  }
  g.toSmoothCount = 0;
}

// One sample of a node's continuous Controls (sample-accurate osc/filter path).
static void smoother_step_node(Circuit& g, Node& node) {
  Control* slots[] = {
    &node.volumeDb, &node.pan, &node.frequency, &node.amplitude, &node.shape,
    &node.phaseParam, &node.resonance, &node.center, &node.width, &node.mix,
    &node.diffusionSize, &node.diffusionAmount, &node.delaySize, &node.recycle,
    &node.lfoAmplitude, &node.lfoBaseSpeed, &node.lfoVariation, &node.feedback,
    &node.level, &node.timeNumerator, &node.timeDenominator, &node.offsetMs,
    &node.lfoRate, &node.saturate, &node.lpfFrequency, &node.hpfFrequency,
    &node.tempoBpm, &node.offset, &node.inLow, &node.inHigh, &node.outLow,
    &node.outHigh, &node.gainDb, &node.gainLeftDb, &node.gainRightDb
  };
  for (unsigned i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
    Control* c = slots[i];
    if (c && c->active && !c->snap) {
      control_step(*c, g);
      c->blockStepped = 1;
    }
  }
}

static bool node_control_smoothing(const Node& node) {
  const Control* slots[] = {
    &node.frequency, &node.amplitude, &node.shape, &node.phaseParam,
    &node.resonance, &node.center, &node.width, &node.mix, &node.volumeDb, &node.pan
  };
  for (unsigned i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
    if (slots[i]->active && !slots[i]->snap) return true;
  }
  return false;
}

static void smoother_clean(Circuit& g) {
  int w = 0;
  for (int i = 0; i < g.toSmoothCount; i++) {
    Control* c = g.toSmooth[i];
    if (!c) continue;
    c->blockStepped = 0;
    if (dsp_fabs(c->out - c->target) <= kPlanck) {
      c->out = c->target;
      c->stage1 = c->target;
      c->stage2 = c->target;
      c->active = false;
      if (c->papHandle > 0) soemdsp_papoulis_filter_snap(c->papHandle, c->target);
      continue;
    }
    g.toSmooth[w++] = c;
  }
  g.toSmoothCount = w;
}

// Reduce radians to (-π, π] with one floor — no open while spin.
static double wrap_phase_pi(double x) {
  if (!(x * 0.0 == 0.0)) return 0.0;
  return x - kTwoPi * dsp_floor(x / kTwoPi + 0.5);
}

static int create_native_for_type(int typeId, float sampleRate) {
  if (typeId == kTypePolyBlep) return soemdsp_polyblep_create();
  if (typeId == kTypeLadderFilter) return soemdsp_ladder_filter_create();
  if (typeId == kTypeSoftClipper) return soemdsp_soft_clipper_create();
  if (typeId == kTypeReverbEffect) {
    const double sr = sampleRate < 1.0f ? 44100.0 : (double)sampleRate;
    return soemdsp_sabrina_reverb_create(sr);
  }
  if (typeId == kTypePingPongDelay) return soemdsp_ping_pong_delay_create();
  if (typeId == kTypeAttenuverter) return soemdsp_attenuverter_create();
  if (typeId == kTypeRange) return soemdsp_range_create();
  if (typeId == kTypeNoiseGenerator) return soemdsp_noise_generator_create();
  if (typeId == kTypeRobinSinusoid) return soemdsp_robin_sinusoid_create();
  if (typeId == kTypeRobinSupersaw) return soemdsp_robin_supersaw_create();
  if (typeId == kTypeSlewLimiter) return soemdsp_slew_limiter_create();
  if (typeId == kTypeComparator) return soemdsp_comparator_create();
  if (typeId == kTypeSampleDelay) return soemdsp_sample_delay_create();
  if (typeId == kTypeSampleHold) return soemdsp_sample_hold_create();
  if (typeId == kTypeMinMax) return soemdsp_min_max_create();
  if (typeId == kTypeClipperLimiter) return soemdsp_clipper_limiter_create();
  if (typeId == kTypeClock) return soemdsp_clock_create();
  if (typeId == kTypeTriggerDivider) return soemdsp_trigger_divider_create();
  if (typeId == kTypeDelayedTrigger) return soemdsp_delayed_trigger_create();
  if (typeId == kTypeRandomClock) return soemdsp_random_clock_create();
  if (typeId == kTypeTriggerCounter) return soemdsp_trigger_counter_create();
  if (typeId == kTypeLutCell) return soemdsp_lut_cell_create();
  if (typeId == kTypeLookaheadLimiter) return soemdsp_lookahead_limiter_create();
  if (typeId == kTypePumpLimiter) return soemdsp_pumping_limiter_create();
  if (typeId == kTypeAudioPlayer) return soemdsp_audio_player_create();
  if (typeId == kTypeStepSequencer) return soemdsp_step_sequencer_create();
  if (typeId == kTypeTransport) return soemdsp_transport_create();
  if (typeId == kTypeAliasSine) return soemdsp_alias_sine_create();
  if (typeId == kTypePhoneTone) return soemdsp_phone_tone_create();
  if (typeId == kTypeBlit) return soemdsp_blit_create();
  if (typeId == kTypeSineWavetable) return soemdsp_sine_wavetable_create();
  if (typeId == kTypeAntisaw) return soemdsp_antisaw_create();
  if (typeId == kTypeArchimedes) return soemdsp_archimedes_create();
  // kTypeAdditiveOsc / Yellow Graph 111–124: free-fn, no instance
  if (typeId == kTypeSurgeOscillator) return soemdsp_surge_oscillator_create();
  if (typeId == kTypeSoftwaveOsc) return soemdsp_softwave_create();
  if (typeId == kTypeDsfOscillator) return soemdsp_dsf_oscillator_create();
  if (typeId == kTypeHypersaw) return soemdsp_hypersaw_create();
  if (typeId == kTypeSinc) return soemdsp_sinc_create();
  if (typeId == kTypeBradley2a) return soemdsp_bradley_2a_create();
  // kTypeEllipsoid: free-fn, no instance
  if (typeId == kTypeSnowflake) return soemdsp_snowflake_create();
  if (typeId == kTypeButterworth) return soemdsp_butterworth_create();
  if (typeId == kTypeLinkwitzRiley) return soemdsp_linkwitz_riley_create();
  if (typeId == kTypeBessel) return soemdsp_bessel_create();
  if (typeId == kTypePapoulisFilter) return soemdsp_papoulis_filter_create();
  if (typeId == kTypeSpeakerProtection) return soemdsp_speaker_protection_create();
  if (typeId == kTypeSpeakerProtector2) return soemdsp_speaker_protector2_create();
  if (typeId == kTypeAttackDecay) return soemdsp_attack_decay_create();
  if (typeId == kTypeBasicShape) return soemdsp_basic_shape_create();
  if (typeId == kTypeChordPad) return soemdsp_chord_pad_create();
  if (typeId == kTypeNoteGlide) return soemdsp_note_glide_create();
  if (typeId == kTypeNoteTranspose) return soemdsp_note_transpose_create();
  if (typeId == kTypeDegreeTuring) {
    static unsigned int degreeTuringEntropy = 0xD3A7EEu;
    degreeTuringEntropy = degreeTuringEntropy * 1664525u + 1013904223u;
    return soemdsp_degree_turing_create(degreeTuringEntropy ? degreeTuringEntropy : 1u);
  }
  if (typeId == kTypeDegreePhrase) {
    static unsigned int degreePhraseEntropy = 0xBEEF01u;
    degreePhraseEntropy = degreePhraseEntropy * 1664525u + 1013904223u;
    return soemdsp_degree_phrase_create(degreePhraseEntropy ? degreePhraseEntropy : 1u);
  }
  if (typeId == kTypeGravityWalker) {
    static unsigned int gravityWalkerEntropy = 0xA11CEEu;
    gravityWalkerEntropy = gravityWalkerEntropy * 1664525u + 1013904223u;
    return soemdsp_gravity_walker_create(gravityWalkerEntropy ? gravityWalkerEntropy : 1u);
  }
  if (typeId == kTypeChebyshev) return soemdsp_chebyshev_create();
  if (typeId == kTypeElliptic) return soemdsp_elliptic_create();
  if (typeId == kTypeEqFilter || typeId == kTypeBandpass || typeId == kTypeAllpass) {
    return soemdsp_eq_filter_create();
  }
  if (typeId == kTypeActiveFilter) return soemdsp_active_filter_create();
  if (typeId == kTypePassiveFilter) return soemdsp_passive_filter_create();
  if (typeId == kTypeTb303Filter) return soemdsp_tb303_filter_create();
  if (typeId == kTypeFlowerChildFilter) return soemdsp_flower_child_filter_create();
  if (typeId == kTypeYellowjacketFilter) return soemdsp_yellowjacket_filter_create();
  if (typeId == kTypeSuperloveFilter) return soemdsp_superlove_filter_create();
  if (typeId == kTypeHumanFilter) return soemdsp_human_filter_create();
  if (typeId == kTypeResonatorFilter) return soemdsp_resonator_filter_create();
  if (typeId == kTypeCombResonator) return soemdsp_comb_resonator_create();
  if (typeId == kTypeModeResonator) return soemdsp_mode_resonator_create();
  if (typeId == kTypeChaoticPhaseLockingFilter) return soemdsp_chaotic_phase_locking_filter_create();
  if (typeId == kTypeInertialFilter) return soemdsp_inertial_filter_create();
  if (typeId == kTypeExpAdsr) return soemdsp_exp_adsr_create();
  if (typeId == kTypeLinearEnvelope) return soemdsp_linear_envelope_create();
  if (typeId == kTypePluckEnvelope) return soemdsp_pluck_envelope_create();
  if (typeId == kTypeFlowerChildEnvelopeFollower) {
    return soemdsp_flower_child_envelope_follower_create();
  }
  if (typeId == kTypeDelayEffect) return soemdsp_delay_effect_create();
  if (typeId == kTypeSoemReverb) {
    const double sr = sampleRate < 1.0f ? 44100.0 : (double)sampleRate;
    return soemdsp_soem_reverb_create(sr);
  }
  if (typeId == kTypePll) {
    const double sr = sampleRate < 1.0f ? 44100.0 : (double)sampleRate;
    return soemdsp_pll_create(sr);
  }
  if (typeId == kTypeLorenzAttractor) return soemdsp_lorenz_attractor_create();
  if (typeId == kTypeLogisticMap) return soemdsp_logistic_map_create();
  if (typeId == kTypeHenonMap) return soemdsp_henon_map_create();
  if (typeId == kTypeChuaAttractor) return soemdsp_chua_attractor_create();
  if (typeId == kTypeRayBouncer) return soemdsp_ray_bouncer_create();
  if (typeId == kTypeChordMemory) return soemdsp_chord_memory_create();
  if (typeId == kTypeChordSequencer) return soemdsp_chord_sequencer_create();
  if (typeId == kTypePitchQuantizer) return soemdsp_pitch_quantizer_create();
  if (typeId == kTypeTuringMachine) {
    static unsigned int turingEntropy = 0xC0FFEEu;
    turingEntropy = turingEntropy * 1664525u + 1013904223u;
    return soemdsp_turing_machine_create(turingEntropy ? turingEntropy : 1u);
  }
  if (typeId == kTypeFractalBrownianNoise) return soemdsp_fbm_create();
  if (typeId == kTypePiSpigotNoise) return soemdsp_pi_spigot_noise_create();
  if (typeId == kTypeRandomWalk) return soemdsp_random_walk_create();
  if (typeId == kTypeCheapWalk) return soemdsp_cheap_walk_create();
  if (typeId == kTypePulseExplosion) return soemdsp_pulse_explosion_create();
  if (typeId == kTypeSpiral) return soemdsp_jerobeam_spiral_create();
  if (typeId == kTypeFractalSpiral) return soemdsp_fractal_spiral_create();
  if (typeId == kTypeLogSpiral) return soemdsp_log_spiral_create();
  if (typeId == kTypeBlubb) return soemdsp_jbblubb_create();
  if (typeId == kTypeBoing) return soemdsp_jbboing_create();
  if (typeId == kTypeKeplerBouwkamp) return soemdsp_jbkepler_create();
  if (typeId == kTypeMushroom) return soemdsp_jbmushroom_create();
  if (typeId == kTypeNyquistShannon) return soemdsp_jbnyquist_create();
  if (typeId == kTypeRadar) return soemdsp_jbradar_create();
  if (typeId == kTypeTorus) return soemdsp_jbtorus_create();
  if (typeId == kTypeWirdoSpiral) return soemdsp_jbwirdo_create();
  if (typeId == kTypePhosphillator) {
    const int h = soemdsp_phosphillator_create();
    return h;
  }
  if (typeId >= kTypeCrossover2 && typeId <= kTypeCrossover6) {
    return soemdsp_crossover_create(2 + (typeId - kTypeCrossover2));
  }
  return 0;
}

static void release_node_papoulis_controls(Node& n) {
  Control* slots[] = {
    &n.volumeDb, &n.pan, &n.frequency, &n.waveform, &n.amplitude, &n.shape,
    &n.phaseParam, &n.resonance, &n.mode, &n.stages, &n.center, &n.width,
    &n.oversample, &n.mix, &n.diffusionSize, &n.diffusionAmount, &n.delaySize,
    &n.recycle, &n.lfoAmplitude, &n.lfoBaseSpeed, &n.lfoVariation, &n.seed,
    &n.feedback, &n.level, &n.timeNumerator, &n.timeDenominator, &n.timingMode,
    &n.offsetMs, &n.lfoStyle, &n.lfoRate, &n.saturate, &n.lpfFrequency,
    &n.hpfFrequency, &n.tempoBpm, &n.offset, &n.inLow, &n.inHigh, &n.outLow, &n.outHigh,
    &n.gainDb, &n.gainLeftDb, &n.gainRightDb, &n.gainMonoSum,
    &n.laneVol[0], &n.laneVol[1], &n.laneVol[2], &n.laneVol[3],
    &n.laneBias[0], &n.laneBias[1], &n.laneBias[2], &n.laneBias[3],
    &n.bleed2, &n.bleed3, &n.bleed4
  };
  for (unsigned i = 0; i < sizeof(slots) / sizeof(slots[0]); i++) {
    if (slots[i]) control_release_papoulis(*slots[i]);
  }
}

static void clear_graph_contents(Circuit& g) {
  g.compiled = false;
  for (int i = 0; i < g.nodeCount; i++) {
    if (g.nodes[i].used) {
      release_node_papoulis_controls(g.nodes[i]);
      destroy_node_native(g.nodes[i]);
    }
  }
  g.nodeCount = 0;
  g.connCount = 0;
  g.orderCount = 0;
  g.toSmoothCount = 0;
  g.outputNodeIndex = -1;
  for (int i = 0; i < kMaxNodes; i++) {
    g.nodes[i].used = false;
    g.nodes[i].idHash = 0;
    init_node_defaults(g.nodes[i], kTypeUnknown);
    g.order[i] = -1;
  }
  for (int i = 0; i < kMaxConnections; i++) {
    g.conns[i].used = false;
  }
  zero_buf(g.outL, kMaxBlockFrames);
  zero_buf(g.outR, kMaxBlockFrames);
}

static Circuit* get(int handle) {
  if (handle < 1 || handle > kMaxInstances) return nullptr;
  Circuit& g = gPool[handle - 1];
  return g.active ? &g : nullptr;
}

static int find_node(Circuit& g, unsigned int idHash) {
  for (int i = 0; i < g.nodeCount; i++) {
    if (g.nodes[i].used && g.nodes[i].idHash == idHash) return i;
  }
  return -1;
}

static bool is_live_dst_port(int port) {
  return port == kPortF
    || port == kPortPitchCv
    || port == kPortIncrement
    || port == kPortReset
    || port == kPortTrigger
    || port == kPortMixStereoR4
    || port == kPortMorph;
}

static bool is_graph_port(int port) {
  return port == kPortGraph;
}

static int clamp_src_port(int port) {
  if (is_graph_port(port)) return kPortGraph;
  if (port < 0) return kPortMono;
  if (port >= kChannels) return kPortMono;
  return port;
}

// Destination may be audio bus (0..7), Live SIGNAL IN (16+), or Yellow Graph (23).
static int clamp_dst_port(int port) {
  if (port < 0) return kPortMono;
  if (port < kChannels) return port;
  if (is_live_dst_port(port)) return port;
  if (is_graph_port(port)) return kPortGraph;
  return kPortMono;
}

static float db_to_lin(float db) {
  if (!(db == db) || db <= -140.0f) return 0.0f;
  return (float)dsp_exp((double)db * 0.11512925464970229); // ln(10)/20
}

static void pan_gains(float pan, float* left, float* right) {
  float p = pan;
  if (!(p == p)) p = 0.0f;
  if (p < -1.0f) p = -1.0f;
  if (p > 1.0f) p = 1.0f;
  const double halfPi = 1.5707963267948966;
  if (p <= 0.0f) {
    *left = 1.0f;
    *right = (float)dsp_cos((double)(-p) * halfPi);
  } else {
    *left = (float)dsp_cos((double)p * halfPi);
    *right = 1.0f;
  }
}

static void mix_node_inputs(Circuit& g, const Node& node, int frames) {
  zero_buf(g.mixMono, frames);
  zero_buf(g.mixLeft, frames);
  zero_buf(g.mixRight, frames);
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.dstHash != node.idHash) continue;
    const int dp = clamp_dst_port(c.dstPort);
    if (is_live_dst_port(dp)) continue; // Live ƒ / CV — not audio bus
    if (is_graph_port(dp)) continue; // Yellow Graph data-plane
    const int si = find_node(g, c.srcHash);
    if (si < 0) continue;
    Node& src = g.nodes[si];
    const int sp = clamp_src_port(c.srcPort);
    if (is_graph_port(sp)) continue;
    double* dstAcc = g.mixMono;
    if (dp == kPortLeft) dstAcc = g.mixLeft;
    else if (dp == kPortRight) dstAcc = g.mixRight;
    for (int f = 0; f < frames; f++) {
      dstAcc[f] += src.buf[sp][f];
    }
  }
}

// Mix Live destination port into dest[]; returns true if any cable present.
static bool mix_live_port(Circuit& g, const Node& node, int livePort, int frames, double* dest) {
  zero_buf(dest, frames);
  bool any = false;
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.dstHash != node.idHash) continue;
    if (clamp_dst_port(c.dstPort) != livePort) continue;
    const int si = find_node(g, c.srcHash);
    if (si < 0) continue;
    Node& src = g.nodes[si];
    const int sp = clamp_src_port(c.srcPort);
    for (int f = 0; f < frames; f++) {
      dest[f] += src.buf[sp][f];
    }
    any = true;
  }
  return any;
}

static int polyblep_tap_mask(Circuit& g, const Node& node) {
  int mask = 0;
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.srcHash != node.idHash) continue;
    const int sp = clamp_src_port(c.srcPort);
    if (sp == kPortMono || sp == kPortLeft || sp == kPortRight) mask |= kTapOut;
    else if (sp == kPortSaw) mask |= kTapSaw;
    else if (sp == kPortRamp) mask |= kTapRamp;
    else if (sp == kPortSquare) mask |= kTapSquare;
    else if (sp == kPortTri) mask |= kTapTri;
    else if (sp == kPortSine) mask |= kTapSine;
  }
  return mask == 0 ? kTapOut : mask;
}

static double clamp_hz_nyquist(double freq, double sr) {
  if (!(freq == freq)) return 0.0;
  const double nyquist = 0.5 * sr;
  if (freq > nyquist) return nyquist;
  if (freq < -nyquist) return -nyquist;
  return freq;
}

static double pitched_hz(double baseHz, double pitchCv, double referenceVoltage) {
  // Same scale as JS nodeGraphPitchedFrequency: +0.1 CV → +1 octave.
  const double out = baseHz * dsp_exp(((pitchCv - referenceVoltage) / 0.1) * 0.6931471805599453);
  if (!(out == out)) return 0.0;
  return out;
}

static void copy_tap_to_buf(double* dst, const double* src, int frames) {
  if (!src) {
    zero_buf(dst, frames);
    return;
  }
  for (int i = 0; i < frames; i++) dst[i] = src[i];
}

static void process_polyblep(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool liveMorph = mix_live_port(g, node, kPortMorph, frames, g.mixMorph);
  const bool controlSmoothing = node_control_smoothing(node);
  const bool audioRatePitch = liveF || livePitch || liveInc || liveReset || controlSmoothing;
  const int mask = polyblep_tap_mask(g, node);

  // Midi note 48 → 0.4 reference voltage (matches worklet default).
  const double referenceVoltage = 48.0 / 120.0;

  // ZOH shape path: Morph / waveform / amplitude held once per quantum.
  if (controlSmoothing) smoother_step_node(g, node);
  const double phaseParam = node.phaseParam.out;
  double level = node.amplitude.out;
  if (!(level == level)) level = 0.0;
  const double morph = morph_zoh_hold(g, node, liveMorph, true);
  const double waveV = node.waveform.out;
  int waveform = (int)(waveV + (waveV >= 0.0 ? 0.5 : -0.5));
  if (waveform < 0) waveform = 0;
  if (waveform > 8) waveform = 8;

  if (!audioRatePitch) {
    double freq = clamp_hz_nyquist(node.frequency.out, srD);
    double phaseInc = freq / srD;
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;
    const double phase0 = wrap_phase_pi(node.phase + phaseParam * kTwoPi);
    soemdsp_polyblep_process_block(
      node.nativeHandle, frames, phase0, phaseInc, waveform, level, morph, mask
    );
    double* outPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 0));
    double* sawPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 1));
    double* rampPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 2));
    double* sqPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 3));
    double* triPtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 4));
    double* sinePtr = ptr_from_export(soemdsp_polyblep_block_out_ptr(node.nativeHandle, 5));
    if (mask & kTapOut) {
      copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
      copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
      copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
    }
    if (mask & kTapSaw) copy_tap_to_buf(node.buf[kPortSaw], sawPtr, frames);
    if (mask & kTapRamp) copy_tap_to_buf(node.buf[kPortRamp], rampPtr, frames);
    if (mask & kTapSquare) copy_tap_to_buf(node.buf[kPortSquare], sqPtr, frames);
    if (mask & kTapTri) copy_tap_to_buf(node.buf[kPortTri], triPtr, frames);
    if (mask & kTapSine) copy_tap_to_buf(node.buf[kPortSine], sinePtr, frames);
    node.phase = wrap_phase_pi(node.phase + kTwoPi * phaseInc * (double)frames);
    return;
  }

  // Live ƒ / 0.1V / Inc / Reset: per-sample phaseInc (ƒ is absolute Hz when wired).
  // Morph / waveform / amplitude stay ZOH for the block (smoothers may still step).
  // PhaseOffset = free-running phase + Control phase (cycles→radians). Re-apply
  // offset every sample while the smoother chases — locking render phase to the
  // block-start offset made Hz=0 Phase scrubbing appear broken.
  double freePhase = node.phase;
  if (!liveReset) {
    // Cable gone → clear latch so the next connect can rising-edge.
    node.lastReset = 0.0;
  }
  for (int f = 0; f < frames; f++) {
    if (f > 0 && controlSmoothing) smoother_step_node(g, node);
    const double phaseParamNow = node.phaseParam.out;

    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        // Match JS: hard phase jump + clear native integrator / noise state.
        soemdsp_polyblep_reset(node.nativeHandle);
        freePhase = 0.0;
      }
      node.lastReset = rv;
    }
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, srD);
    double phaseInc = freq / srD;
    if (liveInc) phaseInc += g.mixIncrement[f];
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;
    const double renderPhase = wrap_phase_pi(freePhase + phaseParamNow * kTwoPi);
    soemdsp_polyblep_sample_masked(
      node.nativeHandle, renderPhase, phaseInc, waveform, level, morph, mask
    );
    const double out = soemdsp_polyblep_out(node.nativeHandle);
    if (mask & kTapOut) {
      node.buf[kPortMono][f] = out;
      node.buf[kPortLeft][f] = out;
      node.buf[kPortRight][f] = out;
    }
    if (mask & kTapSaw) node.buf[kPortSaw][f] = soemdsp_polyblep_saw(node.nativeHandle);
    if (mask & kTapRamp) node.buf[kPortRamp][f] = soemdsp_polyblep_ramp(node.nativeHandle);
    if (mask & kTapSquare) node.buf[kPortSquare][f] = soemdsp_polyblep_square(node.nativeHandle);
    if (mask & kTapTri) node.buf[kPortTri][f] = soemdsp_polyblep_tri(node.nativeHandle);
    if (mask & kTapSine) node.buf[kPortSine][f] = soemdsp_polyblep_sine(node.nativeHandle);
    freePhase = wrap_phase_pi(freePhase + kTwoPi * phaseInc);
  }
  node.phase = freePhase;
}

static void probe_mlr_cables(
  Circuit& g, const Node& node, bool* hasMonoIn, bool* hasLeftIn, bool* hasRightIn, bool* monoOutWired
);

static void process_ladder(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  double reso = node.resonance.out;
  if (!(reso == reso)) reso = 0.0;
  if (reso < 0.0) reso = 0.0;
  if (reso > 0.999) reso = 0.999;
  const double modeV = node.mode.out;
  int mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 3) mode = 3;
  const double stagesV = node.stages.out;
  int stages = (int)(stagesV + (stagesV >= 0.0 ? 0.5 : -0.5));
  if (stages < 1) stages = 1;
  if (stages > 4) stages = 4;

  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool controlSmoothing =
    node.frequency.active || node.resonance.active || node.amplitude.active;

  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  double amp = node.amplitude.out;
  if (!(amp == amp)) amp = 1.0;

  if (!liveF && !controlSmoothing) {
    double freq = clamp_hz_nyquist(node.frequency.out, srD);
    if (freq < 0.0) freq = 0.0;
    double* out0 = nullptr;
    if (needMono) {
      soemdsp_ladder_filter_set_params(node.nativeHandle, freq, reso, mode, stages, srD);
      double* inPtr = ptr_from_export(soemdsp_ladder_filter_block_input_ptr(node.nativeHandle));
      out0 = ptr_from_export(soemdsp_ladder_filter_block_output_ptr(node.nativeHandle));
      if (!inPtr || !out0) return;
      for (int f = 0; f < frames; f++) {
        inPtr[f] = g.mixMono[f];
        if (!hasLeftIn && !hasRightIn) inPtr[f] += g.mixLeft[f] + g.mixRight[f];
      }
      soemdsp_ladder_filter_process_block(node.nativeHandle, frames);
      copy_tap_to_buf(node.buf[kPortMono], out0, frames);
    }
    if (hasLeftIn && node.nativeHandleL > 0) {
      soemdsp_ladder_filter_set_params(node.nativeHandleL, freq, reso, mode, stages, srD);
      double* inL = ptr_from_export(soemdsp_ladder_filter_block_input_ptr(node.nativeHandleL));
      double* outL = ptr_from_export(soemdsp_ladder_filter_block_output_ptr(node.nativeHandleL));
      if (inL && outL) {
        for (int f = 0; f < frames; f++) inL[f] = g.mixLeft[f] + g.mixMono[f];
        soemdsp_ladder_filter_process_block(node.nativeHandleL, frames);
        copy_tap_to_buf(node.buf[kPortLeft], outL, frames);
      }
    } else if (out0) {
      copy_tap_to_buf(node.buf[kPortLeft], out0, frames);
    }
    if (hasRightIn && node.nativeHandleR > 0) {
      soemdsp_ladder_filter_set_params(node.nativeHandleR, freq, reso, mode, stages, srD);
      double* inR = ptr_from_export(soemdsp_ladder_filter_block_input_ptr(node.nativeHandleR));
      double* outR = ptr_from_export(soemdsp_ladder_filter_block_output_ptr(node.nativeHandleR));
      if (inR && outR) {
        for (int f = 0; f < frames; f++) inR[f] = g.mixRight[f] + g.mixMono[f];
        soemdsp_ladder_filter_process_block(node.nativeHandleR, frames);
        copy_tap_to_buf(node.buf[kPortRight], outR, frames);
      }
    } else if (out0) {
      copy_tap_to_buf(node.buf[kPortRight], out0, frames);
    }
    if (amp != 1.0) {
      for (int f = 0; f < frames; f++) {
        node.buf[kPortMono][f] *= amp;
        node.buf[kPortLeft][f] *= amp;
        node.buf[kPortRight][f] *= amp;
      }
    }
    return;
  }

  // Live ƒ and/or Control chase: per-sample cutoff / resonance.
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    amp = node.amplitude.out;
    if (!(amp == amp)) amp = 1.0;
    reso = node.resonance.out;
    if (!(reso == reso)) reso = 0.0;
    if (reso < 0.0) reso = 0.0;
    if (reso > 0.999) reso = 0.999;
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, srD);
    if (freq < 0.0) freq = 0.0;
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      const double out = soemdsp_ladder_filter_sample(
        node.nativeHandle, in, freq, reso, mode, stages, srD
      ) * amp;
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn && node.nativeHandleL > 0) {
      node.buf[kPortLeft][f] = soemdsp_ladder_filter_sample(
        node.nativeHandleL, g.mixLeft[f] + g.mixMono[f], freq, reso, mode, stages, srD
      ) * amp;
    }
    if (hasRightIn && node.nativeHandleR > 0) {
      node.buf[kPortRight][f] = soemdsp_ladder_filter_sample(
        node.nativeHandleR, g.mixRight[f] + g.mixMono[f], freq, reso, mode, stages, srD
      ) * amp;
    }
  }
}

// Shared M/L/R cable probe (softClipper / clipperLimiter).
static void probe_mlr_cables(
  Circuit& g, const Node& node, bool* hasMonoIn, bool* hasLeftIn, bool* hasRightIn, bool* monoOutWired
) {
  *hasMonoIn = false;
  *hasLeftIn = false;
  *hasRightIn = false;
  *monoOutWired = false;
  for (int ci = 0; ci < g.connCount; ci++) {
    if (!g.conns[ci].used) continue;
    if (g.conns[ci].dstHash == node.idHash) {
      const int dp = clamp_dst_port(g.conns[ci].dstPort);
      if (is_live_dst_port(dp)) continue;
      if (is_graph_port(dp)) continue;
      if (dp == kPortLeft) *hasLeftIn = true;
      else if (dp == kPortRight) *hasRightIn = true;
      else *hasMonoIn = true;
    }
    if (g.conns[ci].srcHash == node.idHash) {
      if (clamp_src_port(g.conns[ci].srcPort) == kPortMono) *monoOutWired = true;
    }
  }
}

// clipperLimiter: per-channel sample (native ch 0/1/2). SoftClipper-style wiring.
static void process_clipper_limiter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double minDb = node.inLow.out;
  const double maxDb = node.inHigh.out;
  const double gainDb = node.gainDb.out;
  const double osV = node.oversample.out;
  int os = (int)(osV + (osV >= 0.0 ? 0.5 : -0.5));
  if (os < 0) os = 0;
  if (os > 2) os = 2;
  const double aa = os > 0 ? 1.0 : 0.0;

  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);

  for (int f = 0; f < frames; f++) {
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      const double out = soemdsp_clipper_limiter_sample(
        node.nativeHandle, 0, in, minDb, maxDb, gainDb, aa
      );
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn) {
      node.buf[kPortLeft][f] = soemdsp_clipper_limiter_sample(
        node.nativeHandle, 1, g.mixLeft[f] + g.mixMono[f], minDb, maxDb, gainDb, aa
      );
    }
    if (hasRightIn) {
      node.buf[kPortRight][f] = soemdsp_clipper_limiter_sample(
        node.nativeHandle, 2, g.mixRight[f] + g.mixMono[f], minDb, maxDb, gainDb, aa
      );
    }
  }
}

static void process_soft_clipper(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  double center = node.center.out;
  if (!(center == center)) center = 0.0;
  double width = node.width.out;
  // Width 0 is valid (hardest knee) — only replace non-finite.
  if (!(width == width)) width = 2.0;
  const double drive = (double)db_to_lin((float)node.gainDb.out);
  const double osV = node.oversample.out;
  int os = (int)(osV + (osV >= 0.0 ? 0.5 : -0.5));
  if (os < 0) os = 0;
  if (os > 2) os = 2;
  const double aa = os > 0 ? 1.0 : 0.0;
  soemdsp_soft_clipper_set_params(node.nativeHandle, center, width, aa, os);

  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  // Canonical chain is mono. Skip ch0 only when purely stereo-sided and Out unused.
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);

  double* out0 = nullptr;
  if (needMono) {
    double* in0 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 0));
    out0 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 0));
    if (!in0 || !out0) return;
    for (int f = 0; f < frames; f++) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) {
        in += g.mixLeft[f] + g.mixRight[f];
      }
      in0[f] = in * drive;
    }
    soemdsp_soft_clipper_process_block(node.nativeHandle, 0, frames);
    copy_tap_to_buf(node.buf[kPortMono], out0, frames);
  }

  if (hasLeftIn) {
    double* in1 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 1));
    double* out1 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 1));
    if (in1 && out1) {
      for (int f = 0; f < frames; f++) {
        in1[f] = (g.mixLeft[f] + g.mixMono[f]) * drive;
      }
      soemdsp_soft_clipper_process_block(node.nativeHandle, 1, frames);
      copy_tap_to_buf(node.buf[kPortLeft], out1, frames);
    }
  } else if (out0) {
    copy_tap_to_buf(node.buf[kPortLeft], out0, frames);
  }

  if (hasRightIn) {
    double* in2 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 2));
    double* out2 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 2));
    if (in2 && out2) {
      for (int f = 0; f < frames; f++) {
        in2[f] = (g.mixRight[f] + g.mixMono[f]) * drive;
      }
      soemdsp_soft_clipper_process_block(node.nativeHandle, 2, frames);
      copy_tap_to_buf(node.buf[kPortRight], out2, frames);
    }
  } else if (out0) {
    copy_tap_to_buf(node.buf[kPortRight], out0, frames);
  }
}

static void process_reverb(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);

  soemdsp_sabrina_reverb_set_params(
    node.nativeHandle,
    node.mix.out,
    node.diffusionSize.out,
    node.diffusionAmount.out,
    node.delaySize.out,
    node.recycle.out,
    node.lfoAmplitude.out,
    node.lfoBaseSpeed.out,
    node.lfoVariation.out,
    node.seed.out
  );

  double* inL = ptr_from_export(soemdsp_sabrina_reverb_block_input_left_ptr(node.nativeHandle));
  double* inR = ptr_from_export(soemdsp_sabrina_reverb_block_input_right_ptr(node.nativeHandle));
  double* outL = ptr_from_export(soemdsp_sabrina_reverb_block_output_left_ptr(node.nativeHandle));
  double* outR = ptr_from_export(soemdsp_sabrina_reverb_block_output_right_ptr(node.nativeHandle));
  if (!inL || !inR || !outL || !outR) return;

  // Mono In folds into both sides; dedicated L/R add on top (JS mixInput).
  for (int f = 0; f < frames; f++) {
    const double mono = g.mixMono[f];
    inL[f] = mono + g.mixLeft[f];
    inR[f] = mono + g.mixRight[f];
  }
  soemdsp_sabrina_reverb_process_block(node.nativeHandle, frames, 1);

  // Mix L/R = dry/wet blend from native block outs; Dry L/R = pre-FX input.
  copy_tap_to_buf(node.buf[kPortLeft], outL, frames);
  copy_tap_to_buf(node.buf[kPortRight], outR, frames);
  for (int f = 0; f < frames; f++) {
    node.buf[kPortDryL][f] = inL[f];
    node.buf[kPortDryR][f] = inR[f];
    node.buf[kPortMono][f] = 0.5 * (outL[f] + outR[f]);
  }
}

static void process_ping_pong(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;

  soemdsp_ping_pong_delay_set_params(
    node.nativeHandle,
    node.feedback.out,
    node.mix.out,
    node.level.out,
    node.timeNumerator.out,
    node.timeDenominator.out,
    node.timingMode.out,
    node.offsetMs.out,
    node.lfoStyle.out,
    node.lfoRate.out,
    node.lfoVariation.out,
    node.saturate.out,
    node.lpfFrequency.out,
    node.hpfFrequency.out,
    node.tempoBpm.out,
    (double)sr
  );

  double* inPtr = ptr_from_export(soemdsp_ping_pong_delay_block_input_ptr(node.nativeHandle));
  double* outL = ptr_from_export(soemdsp_ping_pong_delay_block_output_left_ptr(node.nativeHandle));
  double* outR = ptr_from_export(soemdsp_ping_pong_delay_block_output_right_ptr(node.nativeHandle));
  double* modL = ptr_from_export(soemdsp_ping_pong_delay_block_output_mod_left_ptr(node.nativeHandle));
  double* modR = ptr_from_export(soemdsp_ping_pong_delay_block_output_mod_right_ptr(node.nativeHandle));
  if (!inPtr || !outL || !outR) return;

  // Native ping-pong is mono-in; fold Mono+L+R like the worklet evaluator.
  for (int f = 0; f < frames; f++) {
    inPtr[f] = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
  }
  soemdsp_ping_pong_delay_process_block(node.nativeHandle, frames);

  copy_tap_to_buf(node.buf[kPortLeft], outL, frames);
  copy_tap_to_buf(node.buf[kPortRight], outR, frames);
  // Mod L/R = normalized delay tap times (module outputs / stereoTracePorts).
  if (modL) copy_tap_to_buf(node.buf[kPortSaw], modL, frames);
  if (modR) copy_tap_to_buf(node.buf[kPortRamp], modR, frames);
  for (int f = 0; f < frames; f++) {
    node.buf[kPortMono][f] = 0.5 * (outL[f] + outR[f]);
  }
}

// Mono utility: fold Mono+L+R → process_block → fan Out to Mono/Left/Right.
static void process_attenuverter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  soemdsp_attenuverter_set_params(node.nativeHandle, node.amplitude.out, node.offset.out);
  double* inPtr = ptr_from_export(soemdsp_attenuverter_block_input_ptr(node.nativeHandle));
  double* outPtr = ptr_from_export(soemdsp_attenuverter_block_output_ptr(node.nativeHandle));
  if (!inPtr || !outPtr) return;
  for (int f = 0; f < frames; f++) {
    inPtr[f] = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
  }
  soemdsp_attenuverter_process_block(node.nativeHandle, frames);
  copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
  copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
  copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
}

static void process_range(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  soemdsp_range_set_params(
    node.nativeHandle,
    node.inLow.out,
    node.inHigh.out,
    node.outLow.out,
    node.outHigh.out
  );
  double* inPtr = ptr_from_export(soemdsp_range_block_input_ptr(node.nativeHandle));
  double* outPtr = ptr_from_export(soemdsp_range_block_output_ptr(node.nativeHandle));
  if (!inPtr || !outPtr) return;
  for (int f = 0; f < frames; f++) {
    inPtr[f] = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
  }
  soemdsp_range_process_block(node.nativeHandle, frames);
  copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
  copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
  copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
}

// Stateless wire maps — no native instance (nativeHandle stays 0).
static void process_inv(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    const double out = -(g.mixMono[f] + g.mixLeft[f] + g.mixRight[f]);
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

static void process_u2b(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = 2.0 * in - 1.0;
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

static void process_b2u(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = (in + 1.0) * 0.5;
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// minMax: four numbered Ins (buses 0–3), connected-mask, Max→0 Min→1.
static void process_min_max(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  double in1[kMaxBlockFrames];
  double in2[kMaxBlockFrames];
  double in3[kMaxBlockFrames];
  double in4[kMaxBlockFrames];
  const bool c1 = mix_live_port(g, node, kPortIn1, frames, in1);
  const bool c2 = mix_live_port(g, node, kPortIn2, frames, in2);
  const bool c3 = mix_live_port(g, node, kPortIn3, frames, in3);
  const bool c4 = mix_live_port(g, node, kPortIn4, frames, in4);
  const int mask = (c1 ? 1 : 0) | (c2 ? 2 : 0) | (c3 ? 4 : 0) | (c4 ? 8 : 0);
  for (int f = 0; f < frames; f++) {
    const double mx = soemdsp_min_max_sample(
      node.nativeHandle, in1[f], in2[f], in3[f], in4[f], mask
    );
    node.buf[kPortMax][f] = mx;
    node.buf[kPortMin][f] = soemdsp_min_max_min(node.nativeHandle);
  }
}

// mix: free-function 4-in/4-out; In/Out on buses 0–3. No invented stereo.
static void process_mix(Circuit& g, Node& node, int frames) {
  double in1[kMaxBlockFrames];
  double in2[kMaxBlockFrames];
  double in3[kMaxBlockFrames];
  double in4[kMaxBlockFrames];
  mix_live_port(g, node, kPortIn1, frames, in1);
  mix_live_port(g, node, kPortIn2, frames, in2);
  mix_live_port(g, node, kPortIn3, frames, in3);
  mix_live_port(g, node, kPortIn4, frames, in4);
  const double v1 = node.laneVol[0].out;
  const double v2 = node.laneVol[1].out;
  const double v3 = node.laneVol[2].out;
  const double v4 = node.laneVol[3].out;
  const double b1 = node.laneBias[0].out;
  const double b2 = node.laneBias[1].out;
  const double b3 = node.laneBias[2].out;
  const double b4 = node.laneBias[3].out;
  const double bl2 = node.bleed2.out;
  const double bl3 = node.bleed3.out;
  const double bl4 = node.bleed4.out;
  for (int f = 0; f < frames; f++) {
    node.buf[kPortOut1][f] = soemdsp_mix_sample(
      1.0, in1[f], in2[f], in3[f], in4[f], v1, v2, v3, v4, b1, b2, b3, b4, bl2, bl3, bl4
    );
    node.buf[kPortOut2][f] = soemdsp_mix_sample(
      2.0, in1[f], in2[f], in3[f], in4[f], v1, v2, v3, v4, b1, b2, b3, b4, bl2, bl3, bl4
    );
    node.buf[kPortOut3][f] = soemdsp_mix_sample(
      3.0, in1[f], in2[f], in3[f], in4[f], v1, v2, v3, v4, b1, b2, b3, b4, bl2, bl3, bl4
    );
    node.buf[kPortOut4][f] = soemdsp_mix_sample(
      4.0, in1[f], in2[f], in3[f], in4[f], v1, v2, v3, v4, b1, b2, b3, b4, bl2, bl3, bl4
    );
  }
}

// Clock source: Reset live port; Digital→Mono, Analog→Left, Pulse/T→Right.
static void process_clock(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double rate = node.frequency.out;
  const double phaseOff = node.phaseParam.out;
  const double duty = node.shape.out;
  const double level = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    const double reset = hasReset ? g.mixReset[f] : 0.0;
    const double digital = soemdsp_clock_sample(
      node.nativeHandle, reset, phaseOff, rate, duty, level, sr
    );
    node.buf[kPortMono][f] = digital;
    node.buf[kPortLeft][f] = soemdsp_clock_analog_out(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_clock_pulse(node.nativeHandle);
  }
}

// Trigger divider: Trigger + Reset live ports → Out (fan M/L/R).
static void process_trigger_divider(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double threshold = node.center.out;
  const double division = node.stages.out;
  const double pulseTime = node.timeNumerator.out;
  const double level = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    const double out = soemdsp_trigger_divider_sample(
      node.nativeHandle,
      hasTrig ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      threshold,
      division,
      pulseTime,
      level,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Alias Sine: normFreq (frequency Control) × level (amplitude) → Mono/L/R.
static void process_alias_sine(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double normFreq = node.frequency.out;
  const double level = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    const double y = soemdsp_alias_sine_sample(node.nativeHandle, normFreq, level, sr);
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

// Phone Tone: Tone→Mono, ToneL→Left, ToneR→Right;
// ƒ1/ƒ2→Saw/Ramp; Analog/Digital Thru→Square/Tri (module-local taps).
static void process_phone_tone(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveAnalog = mix_live_port(g, node, kPortMono, frames, g.mixMono);
  const bool liveDigital = mix_live_port(g, node, kPortLeft, frames, g.mixLeft);
  const bool liveGate = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool controlSmoothing = node_control_smoothing(node);
  const double referenceVoltage = 48.0 / 120.0;
  for (int f = 0; f < frames; f++) {
    if (f > 0 && controlSmoothing) smoother_step_node(g, node);
    double amp = node.amplitude.out;
    if (!(amp == amp)) amp = 0.0;
    const double pitchOff = node.shape.out;
    const double freqOff = node.frequency.out;
    const double analog = liveAnalog ? g.mixMono[f] : 0.0;
    const double digital = liveDigital ? g.mixLeft[f] : 0.0;
    const double gate = liveGate ? g.mixTrigger[f] : 0.0;
    const double pitchCv = livePitch ? g.mixPitch[f] : referenceVoltage;
    soemdsp_phone_tone_sample(
      node.nativeHandle,
      sr,
      amp,
      pitchOff,
      freqOff,
      pitchCv,
      livePitch ? 1.0 : 0.0,
      analog,
      liveAnalog ? 1.0 : 0.0,
      digital,
      liveDigital ? 1.0 : 0.0,
      gate,
      liveGate ? 1.0 : 0.0,
      referenceVoltage
    );
    node.buf[kPortMono][f] = soemdsp_phone_tone_tone(node.nativeHandle);
    node.buf[kPortLeft][f] = soemdsp_phone_tone_tone_l(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_phone_tone_tone_r(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_phone_tone_f1(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_phone_tone_f2(node.nativeHandle);
    node.buf[kPortSquare][f] = soemdsp_phone_tone_analog_thru(node.nativeHandle);
    node.buf[kPortTri][f] = soemdsp_phone_tone_digital_thru(node.nativeHandle);
  }
}

// BLIT: host-owned phase (radians) like polyBlep sample path; taps match polyBlep.
static void process_blit(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  const int mask = polyblep_tap_mask(g, node);
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  const double referenceVoltage = 48.0 / 120.0;

  // PhaseOffset = freePhase + Control phase; re-apply offset every sample.
  double freePhase = node.phase;
  if (!liveReset) node.lastReset = 0.0;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double level = node.amplitude.out;
    if (!(level == level)) level = 0.0;
    const double phaseParamNow = node.phaseParam.out;
    const double waveNow = node.waveform.out;
    int waveform = (int)(waveNow + (waveNow >= 0.0 ? 0.5 : -0.5));
    if (waveform < 0) waveform = 0;
    if (waveform > 4) waveform = 4;

    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        soemdsp_blit_reset(node.nativeHandle);
        freePhase = 0.0;
      }
      node.lastReset = rv;
    }

    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, srD);
    double phaseInc = freq / srD;
    if (liveInc) phaseInc += g.mixIncrement[f];
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;

    const double renderPhase = wrap_phase_pi(freePhase + phaseParamNow * kTwoPi);
    soemdsp_blit_sample(node.nativeHandle, renderPhase, phaseInc, waveform, level);
    const double out = soemdsp_blit_out(node.nativeHandle);
    if (mask & kTapOut) {
      node.buf[kPortMono][f] = out;
      node.buf[kPortLeft][f] = out;
      node.buf[kPortRight][f] = out;
    }
    if (mask & kTapSaw) node.buf[kPortSaw][f] = soemdsp_blit_saw(node.nativeHandle);
    if (mask & kTapRamp) node.buf[kPortRamp][f] = soemdsp_blit_ramp(node.nativeHandle);
    if (mask & kTapSquare) node.buf[kPortSquare][f] = soemdsp_blit_square(node.nativeHandle);
    if (mask & kTapTri) node.buf[kPortTri][f] = soemdsp_blit_tri(node.nativeHandle);
    if (mask & kTapSine) node.buf[kPortSine][f] = soemdsp_blit_sine(node.nativeHandle);
    freePhase = wrap_phase_pi(freePhase + kTwoPi * phaseInc);
  }
  node.phase = freePhase;
}

// SinCos4 / sineWavetable: native sin/cos pair → A/B/C/D via mode.
static void sin_cos4_from_pair(
  double sn, double cn, int mode, double* a, double* b, double* c, double* d
) {
  const int m = mode < 0 ? 0 : (mode > 5 ? 5 : mode);
  if (m == 0) {
    *a = sn; *b = 0.0; *c = 0.0; *d = 0.0;
  } else if (m == 1) {
    *a = cn; *b = 0.0; *c = 0.0; *d = 0.0;
  } else if (m == 2) {
    *a = sn; *b = cn; *c = 0.0; *d = 0.0;
  } else if (m == 3) {
    *a = sn; *b = -sn; *c = 0.0; *d = 0.0;
  } else if (m == 4) {
    const double k = 0.8660254037844386; // √3/2
    *a = sn;
    *b = sn * -0.5 + cn * k;
    *c = sn * -0.5 - cn * k;
    *d = 0.0;
  } else {
    *a = sn; *b = cn; *c = -sn; *d = -cn;
  }
}

static void process_sine_wavetable(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double referenceVoltage = 48.0 / 120.0;
  const double phaseOff = node.phaseParam.out * kTwoPi;
  const double amp = node.amplitude.out;
  const double modeV = node.mode.out;
  int mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 5) mode = 5;

  for (int f = 0; f < frames; f++) {
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    soemdsp_sine_wavetable_sample(node.nativeHandle, phaseOff, freq, amp, sr);
    const double sn = soemdsp_sine_wavetable_sin(node.nativeHandle);
    const double cn = soemdsp_sine_wavetable_cos(node.nativeHandle);
    double a = 0.0, b = 0.0, c = 0.0, d = 0.0;
    sin_cos4_from_pair(sn, cn, mode, &a, &b, &c, &d);
    node.buf[kPortMono][f] = a;
    node.buf[kPortLeft][f] = b;
    node.buf[kPortRight][f] = c;
    node.buf[kPortSaw][f] = d;
  }
}

// Antisaw: aliased-partial saw → Mono/L/R. frequency=fundamental, stages=reflections,
// shape=tilt, amplitude=level.
static void process_antisaw(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const double reflections = node.stages.out;
  const double tilt = node.shape.out;
  const double level = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    const double fundamental = liveF ? g.mixF[f] : node.frequency.out;
    const double y = soemdsp_antisaw_sample(
      node.nativeHandle, fundamental, reflections, tilt, level, sr
    );
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

// Archimedes: stages=profile, width=dither, amplitude scales sine/cosine outs.
// Sine→Mono, Cosine→Left, Pi→Right, Noise Below→Saw, Noise Above→Ramp.
static void process_archimedes(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double referenceVoltage = 48.0 / 120.0;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;

  double profileV = node.stages.out;
  int profile = (int)(profileV + (profileV >= 0.0 ? 0.5 : -0.5));
  if (profile < 4) profile = 4;
  if (profile > 24) profile = 24;
  double ditherV = node.width.out;
  int dither = (int)(ditherV + (ditherV >= 0.0 ? 0.5 : -0.5));
  if (dither < 0) dither = 0;
  if (dither > 63) dither = 63;
  const double amp = node.amplitude.out;

  soemdsp_archimedes_set_profile(node.nativeHandle, profile);
  if (!liveReset) node.lastReset = 0.0;

  for (int f = 0; f < frames; f++) {
    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        soemdsp_archimedes_reset(node.nativeHandle);
        soemdsp_archimedes_reset_counters(node.nativeHandle);
      }
      node.lastReset = rv;
    }
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    int freqHz = (int)(freq + (freq >= 0.0 ? 0.5 : -0.5));
    if (freqHz < 0) freqHz = -freqHz;
    soemdsp_archimedes_set_frequency(node.nativeHandle, freqHz);
    soemdsp_archimedes_step(node.nativeHandle, dither);
    const double sn = soemdsp_archimedes_sine(node.nativeHandle) * amp;
    const double cn = soemdsp_archimedes_cosine(node.nativeHandle) * amp;
    node.buf[kPortMono][f] = sn;
    node.buf[kPortLeft][f] = cn;
    node.buf[kPortRight][f] = soemdsp_archimedes_extract_pi(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_archimedes_noise_below(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_archimedes_noise_above(node.nativeHandle);
  }
}

// Additive Osc: free-fn. Host phase in radians. stages=harmonics, shape=morph,
// center=harmonicPhaseAdd, width=harmonicPhaseMultiply, lpf=dampingFilterFrequency.
// Proving ground for block-rate ZOH: Morph / waveform / harmonics / damping /
// amplitude / phase-add/mul are sampled once per quantum (smoothers may still
// advance every sample; we hold the values used for the expensive path).
static void process_additive_osc(Circuit& g, Node& node, int frames) {
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool liveMorph = mix_live_port(g, node, kPortMorph, frames, g.mixMorph);
  const bool controlSmoothing = node_control_smoothing(node);
  const double referenceVoltage = 48.0 / 120.0;

  // PhaseOffset = freePhase + Control phase; re-apply offset every sample.
  double freePhase = node.phase;
  if (!liveReset) node.lastReset = 0.0;

  // ZOH capture after first smoother step so knob chase still moves over time.
  if (controlSmoothing) smoother_step_node(g, node);
  const double heldHarmonics = node.stages.out;
  const double heldWaveform = node.waveform.out;
  // Morph CV (turquoise): one sample per quantum, zero-order held.
  const double heldMorph = morph_zoh_hold(g, node, liveMorph, false);
  const double heldPhaseAdd = node.center.out;
  const double heldPhaseMul = node.width.out;
  const double heldAmp = node.amplitude.out;
  const double heldDamp = node.lpfFrequency.out;

  for (int f = 0; f < frames; f++) {
    if (f > 0 && controlSmoothing) smoother_step_node(g, node);
    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        freePhase = 0.0;
      }
      node.lastReset = rv;
    }
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, srD);
    double phaseInc = freq / srD;
    if (liveInc) phaseInc += g.mixIncrement[f];
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;

    const double renderPhase = wrap_phase_pi(freePhase + node.phaseParam.out * kTwoPi);
    const double y = soemdsp_additive_osc_sample(
      renderPhase,
      freq,
      heldHarmonics,
      heldWaveform,
      heldMorph,
      heldPhaseAdd,
      heldPhaseMul,
      heldAmp,
      heldDamp,
      srD
    );
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
    freePhase = wrap_phase_pi(freePhase + kTwoPi * phaseInc);
  }
  node.phase = freePhase;
}

// Yellow Graph upstream: first used connection with dstPort==Graph.
static int find_graph_src_index(Circuit& g, unsigned int dstHash) {
  for (int i = 0; i < g.connCount; i += 1) {
    const Conn& c = g.conns[i];
    if (!c.used) continue;
    if (c.dstHash != dstHash) continue;
    if (c.dstPort != kPortGraph) continue;
    return find_node(g, c.srcHash);
  }
  return -1;
}

// A1 Additive Generator: builds GraphPayload (no audio outs).
// HarmonicFade (mode): 0 Instant / 1 Smoothed (1-quantum ampLerp) / 2 Decimal.
// Out must only init *new* phaseAcc slots (not wipe all).
static void process_additive_generator(Circuit& g, Node& node, int frames) {
  (void)g;
  (void)frames;
  if (node.bypassed) {
    soemdsp_yellow_graph::graph_clear(node.yellowGraph);
    return;
  }
  const int prevH = node.yellowLastHarmonics;
  float prevAmp[soemdsp_yellow_graph::kMaxHarmonics];
  float prevRatio[soemdsp_yellow_graph::kMaxHarmonics];
  float prevPhase[soemdsp_yellow_graph::kMaxHarmonics];
  const int saveH = (prevH > 0 && prevH <= soemdsp_yellow_graph::kMaxHarmonics)
    ? prevH
    : 0;
  if (saveH > 0) {
    for (int i = 0; i < saveH; i += 1) {
      prevAmp[i] = node.yellowGraph.amplitude[i];
      prevRatio[i] = node.yellowGraph.ratio[i];
      prevPhase[i] = node.yellowGraph.phase[i];
    }
  }
  int waveform = (int)(node.waveform.out + (node.waveform.out >= 0.0 ? 0.5 : -0.5));
  if (waveform < 0) waveform = 0;
  if (waveform > 6) waveform = 6;
  const float pwm = (float)node.shape.out;
  const float harmonics = (float)node.stages.out;
  const float phaseRotation = (float)node.phaseParam.out;
  const float harmonicFade = (float)node.mode.out;
  soemdsp_yellow_graph::build_from_waveform(
    node.yellowGraph, waveform, pwm, harmonics, phaseRotation, harmonicFade
  );
  const int newH = node.yellowGraph.harmonics;
  const int fade = soemdsp_yellow_graph::normalize_harmonic_fade(harmonicFade);
  if (prevH >= 0 && prevH != newH) {
    // Face: stamp phaseReset so publish/fingerprint refreshes immediately.
    node.yellowGraph.phaseReset = 1;
    // Smoothed only — Instant hard-cuts; Decimal trailing amp is the fade.
    if (fade == 1 && (saveH > 0 || newH > 0)) {
      soemdsp_yellow_graph::apply_generator_harmonics_count_lerp(
        node.yellowGraph,
        saveH > 0 ? prevAmp : nullptr,
        saveH > 0 ? prevRatio : nullptr,
        saveH > 0 ? prevPhase : nullptr,
        saveH,
        newH
      );
    }
  }
  // Remember target slot count (not the temporary lerp width).
  node.yellowLastHarmonics = newH;
}

// A1 Additive Bubble: Graph in → skew/cutoff/unskew → Graph out.
// Host param map: phaseSkew→phaseParam, bubble→shape (0…1),
// invertBubble→mode, cutoff→frequency, unskew→resonance.
// Keeps previous quantum To planes for phase/amp lerp into Out.
static void process_additive_bubble(Circuit& g, Node& node, int frames) {
  (void)frames;
  const int srcIdx = find_graph_src_index(g, node.idHash);
  if (srcIdx < 0) {
    soemdsp_yellow_graph::graph_clear(node.yellowGraph);
    return;
  }
  // Snapshot previous To before upstream copy overwrites the payload.
  const int prevH = node.yellowGraph.harmonics;
  const bool hadPhase = node.yellowGraph.hasPhaseLerp != 0;
  const bool hadAmp = node.yellowGraph.hasAmpLerp != 0;
  float prevPhase[soemdsp_yellow_graph::kMaxHarmonics];
  float prevAmp[soemdsp_yellow_graph::kMaxHarmonics];
  const int copyH = (prevH > 0 && prevH <= soemdsp_yellow_graph::kMaxHarmonics) ? prevH : 0;
  if (hadPhase && copyH > 0) {
    for (int i = 0; i < copyH; i += 1) prevPhase[i] = node.yellowGraph.phaseTo[i];
  }
  if (hadAmp && copyH > 0) {
    for (int i = 0; i < copyH; i += 1) prevAmp[i] = node.yellowGraph.ampTo[i];
  }
  soemdsp_yellow_graph::graph_copy(node.yellowGraph, g.nodes[srcIdx].yellowGraph);
  if (node.bypassed) {
    node.yellowGraph.hasPhaseLerp = 0;
    node.yellowGraph.hasAmpLerp = 0;
    return;
  }
  // Same Control ownership as Pan / filters / Quantize: do NOT step here.
  // process_block's smoother_run advances knobs for the full quantum. A lone
  // smoother_step_node() marked blockStepped after 1 sample and starved the
  // rest of the chase (~frames× too slow). Stamp Growl from Control.out
  // (end of previous quantum) + plane lerp across this block — like Pan.
  // Host-uploaded yellowCutoffStrip → defer amp bake; Out gates per sample.
  const bool deferCutoffAmp = node.yellowCutoffStripFrames > 0;
  // Bubble 0…1 + Invert Bubble → signed log-curve amount (−1…+1).
  float bubble01 = (float)node.shape.out;
  if (!(bubble01 * 0.0f == 0.0f)) bubble01 = 0.0f;
  if (bubble01 < 0.0f) bubble01 = 0.0f;
  if (bubble01 > 1.0f) bubble01 = 1.0f;
  const bool invertBubble = node.mode.out >= 0.5;
  float curveAmt = invertBubble ? -bubble01 : bubble01;
  if (curveAmt > 0.9999f) curveAmt = 0.9999f;
  if (curveAmt < -0.9999f) curveAmt = -0.9999f;
  soemdsp_yellow_graph::apply_bubble(
    node.yellowGraph,
    (float)node.phaseParam.out, // phaseSkew
    curveAmt,                   // Bubble ± Invert → log curve
    (float)node.frequency.out,  // cutoff 0..1
    (float)node.resonance.out,  // unskew
    hadPhase ? prevPhase : nullptr,
    hadAmp ? prevAmp : nullptr,
    hadPhase ? copyH : 0,
    deferCutoffAmp
  );
  if (deferCutoffAmp) {
    int n = node.yellowCutoffStripFrames;
    if (n > kMaxBlockFrames) n = kMaxBlockFrames;
    if (n > soemdsp_yellow_graph::kCutoffStripMax) n = soemdsp_yellow_graph::kCutoffStripMax;
    node.yellowGraph.hasCutoffStrip = 1;
    node.yellowGraph.cutoffStripFrames = (unsigned short)n;
    for (int i = 0; i < n; i += 1) {
      node.yellowGraph.cutoffStrip[i] = node.yellowCutoffStrip[i];
    }
  } else {
    node.yellowGraph.hasCutoffStrip = 0;
    node.yellowGraph.cutoffStripFrames = 0;
  }
}

// Resolve fund Hz for spectral filters: walk Graph downstream to AdditiveOut,
// else any AdditiveOut in the circuit, else 100.
static float resolve_yellow_fund_hz(Circuit& g, unsigned int fromHash) {
  unsigned int queue[64];
  int qn = 0;
  unsigned char seen[kMaxNodes];
  for (int i = 0; i < kMaxNodes; i += 1) seen[i] = 0;
  queue[qn++] = fromHash;
  while (qn > 0) {
    const unsigned int id = queue[--qn];
    const int ni = find_node(g, id);
    if (ni < 0) continue;
    if (seen[ni]) continue;
    seen[ni] = 1;
    if (g.nodes[ni].typeId == kTypeAdditiveOut) {
      const double hz = g.nodes[ni].frequency.out;
      if (hz * 0.0 == 0.0 && hz > 0.0) return (float)hz;
      return 100.0f;
    }
    for (int c = 0; c < g.connCount; c += 1) {
      const Conn& conn = g.conns[c];
      if (!conn.used) continue;
      if (conn.srcHash != id) continue;
      if (conn.dstPort != kPortGraph) continue;
      if (qn < 64) queue[qn++] = conn.dstHash;
    }
  }
  for (int i = 0; i < g.nodeCount; i += 1) {
    if (!g.nodes[i].used) continue;
    if (g.nodes[i].typeId != kTypeAdditiveOut) continue;
    const double hz = g.nodes[i].frequency.out;
    if (hz * 0.0 == 0.0 && hz > 0.0) return (float)hz;
  }
  return 100.0f;
}

static bool yellow_graph_copy_in(Circuit& g, Node& node) {
  const int srcIdx = find_graph_src_index(g, node.idHash);
  if (srcIdx < 0) {
    soemdsp_yellow_graph::graph_clear(node.yellowGraph);
    return false;
  }
  soemdsp_yellow_graph::graph_copy(node.yellowGraph, g.nodes[srcIdx].yellowGraph);
  return true;
}

// filter→mode, cutoff→frequency, slope→shape, skew→phaseParam
static void process_additive_linear_filter(Circuit& g, Node& node, int frames) {
  (void)frames;
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_linear_filter(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.frequency.out,
    (float)node.shape.out,
    (float)node.phaseParam.out,
    resolve_yellow_fund_hz(g, node.idHash),
    sr
  );
}

static void process_additive_analog_filter(Circuit& g, Node& node, int frames) {
  (void)frames;
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_butterworth_filter(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.frequency.out,
    (float)node.shape.out,
    (float)node.phaseParam.out,
    resolve_yellow_fund_hz(g, node.idHash),
    sr
  );
}

// filter→mode, cutoff→frequency, slope→shape, resonance→resonance
static void process_additive_ladder_filter(Circuit& g, Node& node, int frames) {
  (void)frames;
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_ladder_filter(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.frequency.out,
    (float)node.shape.out,
    (float)node.resonance.out,
    resolve_yellow_fund_hz(g, node.idHash),
    sr
  );
}

// curve→mode, lowStretch→inLow, highStretch→inHigh, skew→shape
static void process_additive_frequency_skew(Circuit& g, Node& node, int frames) {
  (void)frames;
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  soemdsp_yellow_graph::apply_frequency_skew(
    node.yellowGraph,
    (float)node.inLow.out,
    (float)node.inHigh.out,
    (float)node.shape.out,
    (float)node.mode.out
  );
}

// quantizeFreq→mode, randomFreqAmount→width, seed→seed,
// affectFundamental→timingMode. yellowLerpFrom = ratio lerp continuity.
static void process_additive_quantize_freq(Circuit& g, Node& node, int frames) {
  (void)frames;
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  soemdsp_yellow_graph::apply_quantize_freq(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.width.out,
    (float)node.seed.out,
    (float)node.timingMode.out,
    node.yellowLerpFrom,
    node.yellowLerpFromLen
  );
}

// quantizePhase→mode, randomPhaseAmount→phaseParam, seed→seed
static void process_additive_quantize_phase(Circuit& g, Node& node, int frames) {
  (void)frames;
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  soemdsp_yellow_graph::apply_quantize_phase(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.phaseParam.out,
    (float)node.seed.out
  );
}

// AutoPan: width→Width, frequency→rate, amplitude→depth, shape→spread,
// pan→bias, center→shimmer, mix→orbit, phaseParam→shimmerHz.
// node.phase = rotator phase; node.lastReset = shimmer phase (cycles).
static void process_additive_pan(Circuit& g, Node& node, int frames) {
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_pan(
    node.yellowGraph,
    (float)node.width.out,
    (float)node.frequency.out,
    (float)node.amplitude.out,
    (float)node.shape.out,
    (float)node.pan.out,
    (float)node.center.out,
    (float)node.mix.out,
    (float)node.phaseParam.out,
    node.phase,
    node.lastReset,
    node.yellowLerpFrom,
    node.yellowLerpFromLen,
    sr,
    frames
  );
}

// Phase Entry: mode→mode (0 Lock / 1 Free / 2 Random). Stamps Graph.phaseEntryMode
// so Out seeds newly added harmonics accordingly. Pass-through otherwise.
static void process_additive_phase_entry(Circuit& g, Node& node, int frames) {
  (void)frames;
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  soemdsp_yellow_graph::apply_phase_entry(node.yellowGraph, (float)node.mode.out);
}

// Blaster Control map:
// shape→quantization, phaseParam→depth, resonance→curve, waveform→curveKind,
// width→offset, timingMode→phaseMode, oversample→invert, center→bias,
// amplitude→jump. (Layout/Seed removed — face is always index columns.)
static void process_additive_blaster(Circuit& g, Node& node, int frames) {
  (void)frames;
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  soemdsp_yellow_graph::apply_blaster(
    node.yellowGraph,
    (float)node.shape.out,
    0.0f,
    100.0f,
    44100.0f,
    1.0f, // fixed seed if Phase=Random
    (float)node.phaseParam.out,
    (float)node.resonance.out,
    (float)node.waveform.out,
    (float)node.width.out,
    (float)node.timingMode.out,
    (float)node.oversample.out,
    (float)node.center.out,
    (float)node.amplitude.out
  );
}

// Diffusor: amplitude→diffusion, frequency→speed, seed→seed.
static void process_additive_diffusor(Circuit& g, Node& node, int frames) {
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_diffusor(
    node.yellowGraph,
    (float)node.amplitude.out,
    (float)node.seed.out,
    (float)node.frequency.out,
    node.yellowWalks,
    node.yellowWalkCount,
    node.yellowWalkSeed,
    node.yellowWalkSalt,
    node.yellowLerpFrom,
    node.yellowLerpFromLen,
    sr,
    frames
  );
}

// noise→mode, add→amplitude, speed→frequency, seed→seed
static void process_additive_noisy_freq(Circuit& g, Node& node, int frames) {
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_noisy_freq(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.amplitude.out,
    (float)node.frequency.out,
    (float)node.seed.out,
    node.yellowWalks,
    node.yellowWalkCount,
    node.yellowWalkSeed,
    node.yellowWalkSalt,
    node.yellowLerpFrom,
    node.yellowLerpFromLen,
    sr,
    frames
  );
}

static void process_additive_noisy_phase(Circuit& g, Node& node, int frames) {
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_noisy_phase(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.amplitude.out,
    (float)node.frequency.out,
    (float)node.seed.out,
    node.yellowWalks,
    node.yellowWalkCount,
    node.yellowWalkSeed,
    node.yellowWalkSalt,
    node.yellowLerpFrom,
    node.yellowLerpFromLen,
    sr,
    frames
  );
}

static void process_additive_noisy_pan(Circuit& g, Node& node, int frames) {
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_noisy_pan(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.amplitude.out,
    (float)node.frequency.out,
    (float)node.seed.out,
    node.yellowWalks,
    node.yellowWalkCount,
    node.yellowWalkSeed,
    node.yellowWalkSalt,
    node.yellowLerpFrom,
    node.yellowLerpFromLen,
    sr,
    frames
  );
}

static void process_additive_noisy_amp(Circuit& g, Node& node, int frames) {
  if (!yellow_graph_copy_in(g, node)) return;
  if (node.bypassed) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  soemdsp_yellow_graph::apply_noisy_amp(
    node.yellowGraph,
    (float)node.mode.out,
    (float)node.amplitude.out,
    (float)node.frequency.out,
    (float)node.seed.out,
    node.yellowWalks,
    node.yellowWalkCount,
    node.yellowWalkSeed,
    node.yellowWalkSalt,
    node.yellowLerpFrom,
    node.yellowLerpFromLen,
    sr,
    frames
  );
}

// WhiteNoise LCGs advance on Out's GraphPayload copy — push seeds upstream so
// the owning Noisy* node's yellowWalks stay continuous across quanta (JS shared ref).
static void sync_yellow_noise_seeds_upstream(
  Circuit& g, int idx, const soemdsp_yellow_graph::GraphPayload& advanced
) {
  int guard = 0;
  int cur = idx;
  while (cur >= 0 && guard < kMaxNodes) {
    guard += 1;
    Node& n = g.nodes[cur];
    soemdsp_yellow_graph::GraphPayload& yg = n.yellowGraph;
    const int H = advanced.harmonics < soemdsp_yellow_graph::kMaxHarmonics
      ? advanced.harmonics
      : soemdsp_yellow_graph::kMaxHarmonics;
    soemdsp_yellow_graph::noise_recipe_copy(yg.ratioNoise, advanced.ratioNoise, H);
    soemdsp_yellow_graph::noise_recipe_copy(yg.phaseNoise, advanced.phaseNoise, H);
    soemdsp_yellow_graph::noise_recipe_copy(yg.panNoise, advanced.panNoise, H);
    soemdsp_yellow_graph::noise_recipe_copy(yg.ampNoise, advanced.ampNoise, H);
    if (n.typeId == kTypeAdditiveNoisyFreq) {
      soemdsp_yellow_graph::sync_walk_seeds_from_recipe(
        n.yellowWalks, n.yellowWalkCount, advanced.ratioNoise, H
      );
    } else if (n.typeId == kTypeAdditiveNoisyPhase) {
      soemdsp_yellow_graph::sync_walk_seeds_from_recipe(
        n.yellowWalks, n.yellowWalkCount, advanced.phaseNoise, H
      );
    } else if (n.typeId == kTypeAdditiveNoisyPan) {
      soemdsp_yellow_graph::sync_walk_seeds_from_recipe(
        n.yellowWalks, n.yellowWalkCount, advanced.panNoise, H
      );
    } else if (n.typeId == kTypeAdditiveNoisyAmp) {
      soemdsp_yellow_graph::sync_walk_seeds_from_recipe(
        n.yellowWalks, n.yellowWalkCount, advanced.ampNoise, H
      );
    }
    cur = find_graph_src_index(g, n.idHash);
  }
}

// A1 Additive Out: Graph in → sum_sample → Mono/Left/Right.
static void process_additive_out(Circuit& g, Node& node, int frames) {
  const int srcIdx = find_graph_src_index(g, node.idHash);
  if (srcIdx < 0 || node.bypassed) {
    soemdsp_yellow_graph::graph_clear(node.yellowGraph);
    return; // audio bufs already zeroed by process_block
  }
  soemdsp_yellow_graph::graph_copy(node.yellowGraph, g.nodes[srcIdx].yellowGraph);
  soemdsp_yellow_graph::GraphPayload& local = node.yellowGraph;
  const int H = local.harmonics < soemdsp_yellow_graph::kMaxHarmonics
    ? local.harmonics
    : soemdsp_yellow_graph::kMaxHarmonics;
  // Slot-count / phaseReset: only init *new* accumulators. Default lock-seeds
  // from fund so the bank stays in phase; Phase Entry can select Free/Random.
  if (node.yellowPhaseAccLen != H) {
    if (H > node.yellowPhaseAccLen) {
      const int oldLen = node.yellowPhaseAccLen;
      const double fundPhase = oldLen > 0 ? node.yellowPhaseAcc[0] : 0.0;
      unsigned int rng = node.yellowWalkSeed;
      if (rng == 0 || rng == 0xFFFFFFFFu) rng = node.idHash ? node.idHash : 0xA5A5A5A5u;
      for (int i = oldLen; i < H; i += 1) {
        node.yellowPhaseAcc[i] = soemdsp_yellow_graph::seed_new_phase_acc(
          local, i, fundPhase, local.phaseEntryMode, rng
        );
      }
      node.yellowWalkSeed = rng;
    }
    node.yellowPhaseAccLen = H;
  }
  local.phaseReset = 0;

  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  const double referenceVoltage = 48.0 / 120.0;
  const int optimize = (int)(node.mode.out + (node.mode.out >= 0.0 ? 0.5 : -0.5));
  if (!liveReset) node.lastReset = 0.0;

  if (controlSmoothing) smoother_step_node(g, node);

  for (int f = 0; f < frames; f += 1) {
    if (f > 0 && controlSmoothing) smoother_step_node(g, node);
    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        for (int i = 0; i < H; i += 1) node.yellowPhaseAcc[i] = 0.0;
      }
      node.lastReset = rv;
    }
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, srD);
    if (liveInc) {
      // Increment is cycles/sample add on fundamental; convert to Hz offset.
      freq += g.mixIncrement[f] * srD;
      freq = clamp_hz_nyquist(freq, srD);
    }
    float mono = 0.0f;
    float left = 0.0f;
    float right = 0.0f;
    soemdsp_yellow_graph::sum_sample(
      local,
      node.yellowPhaseAcc,
      (float)freq,
      (float)node.amplitude.out,
      sr,
      &mono,
      &left,
      &right,
      optimize,
      f,
      frames
    );
    node.buf[kPortMono][f] = (double)mono;
    node.buf[kPortLeft][f] = (double)left;
    node.buf[kPortRight][f] = (double)right;
  }

  if (
    local.ratioNoise.active
    || local.phaseNoise.active
    || local.panNoise.active
    || local.ampNoise.active
  ) {
    sync_yellow_noise_seeds_upstream(g, srcIdx, local);
  }
}

// Surge hard-sync osc. width=syncFrequencyHz. Sync audio in → Mono dst.
// Out→Mono, Saw→Saw, Square→Square, Tri→Tri, Sine→Sine,
// Synced→Ramp, Internal Sync→Right.
static void process_surge_oscillator(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool hasSync = mix_live_port(g, node, kPortMono, frames, g.mixMono);
  const double referenceVoltage = 48.0 / 120.0;
  const double syncFreq = node.width.out;
  const double level = node.amplitude.out;
  const double waveV = node.waveform.out;
  int waveform = (int)(waveV + (waveV >= 0.0 ? 0.5 : -0.5));
  if (waveform < 0) waveform = 0;
  if (waveform > 3) waveform = 3;

  for (int f = 0; f < frames; f++) {
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    const double syncIn = hasSync ? g.mixMono[f] : 0.0;
    soemdsp_surge_oscillator_sample(
      node.nativeHandle,
      freq,
      sr,
      syncIn,
      hasSync ? 1 : 0,
      syncFreq,
      waveform,
      level
    );
    const double out = soemdsp_surge_oscillator_out(node.nativeHandle);
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = soemdsp_surge_oscillator_internal_sync(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_surge_oscillator_saw(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_surge_oscillator_synced(node.nativeHandle);
    node.buf[kPortSquare][f] = soemdsp_surge_oscillator_square(node.nativeHandle);
    node.buf[kPortTri][f] = soemdsp_surge_oscillator_tri(node.nativeHandle);
    node.buf[kPortSine][f] = soemdsp_surge_oscillator_sine(node.nativeHandle);
  }
}

// Softwave: shape=morph, center=antialias, amplitude=level, phaseParam=phase.
// Morph CV is turquoise ZOH (additive to knob, matches softwave JS SIGNAL IN).
static void process_softwave_osc(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveMorph = mix_live_port(g, node, kPortMorph, frames, g.mixMorph);
  const double referenceVoltage = 48.0 / 120.0;
  const double morph = morph_zoh_hold(g, node, liveMorph, true);
  const double phaseOff = node.phaseParam.out;
  const double level = node.amplitude.out;
  const double antialias = node.center.out;
  const double waveV = node.waveform.out;

  for (int f = 0; f < frames; f++) {
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    const double y = soemdsp_softwave_sample(
      node.nativeHandle, freq, sr, waveV, morph, phaseOff, level, antialias
    );
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

// DSF: shape=morph/harmonics, width=pulseWidth, mix=blend, phaseParam=phase.
// Morph CV is turquoise ZOH (additive to knob).
static void process_dsf_oscillator(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveMorph = mix_live_port(g, node, kPortMorph, frames, g.mixMorph);
  const double referenceVoltage = 48.0 / 120.0;
  const double morph = morph_zoh_hold(g, node, liveMorph, true);
  const double pulseWidth = node.width.out;
  const double blend = node.mix.out;
  const double phase = node.phaseParam.out;
  const double level = node.amplitude.out;
  const double waveV = node.waveform.out;
  int waveform = (int)(waveV + (waveV >= 0.0 ? 0.5 : -0.5));
  if (waveform < 0) waveform = 0;
  if (waveform > 4) waveform = 4;

  for (int f = 0; f < frames; f++) {
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    soemdsp_dsf_oscillator_sample(
      node.nativeHandle, freq, sr, waveform, morph, pulseWidth, blend, phase, level
    );
    const double y = soemdsp_dsf_oscillator_out(node.nativeHandle);
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

// Hypersaw stereo bank. stages=voices, shape=spread, width=random, center=drift.
// Left/Right native; Mono = (L+R)/2. Reset → hypersaw_reset.
static void process_hypersaw(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double referenceVoltage = 48.0 / 120.0;
  const double phaseOff = node.phaseParam.out;
  const double spread = node.shape.out;
  const double randomAmt = node.width.out;
  const double driftAmt = node.center.out;
  const double level = node.amplitude.out;
  int voices = (int)(node.stages.out + (node.stages.out >= 0.0 ? 0.5 : -0.5));
  if (voices < 1) voices = 1;
  if (voices > 32) voices = 32;
  if (!liveReset) node.lastReset = 0.0;

  for (int f = 0; f < frames; f++) {
    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        soemdsp_hypersaw_reset(node.nativeHandle);
      }
      node.lastReset = rv;
    }
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    soemdsp_hypersaw_sample(
      node.nativeHandle, freq, sr, phaseOff, voices, spread, randomAmt, driftAmt, level
    );
    const double L = soemdsp_hypersaw_left(node.nativeHandle);
    const double R = soemdsp_hypersaw_right(node.nativeHandle);
    node.buf[kPortLeft][f] = L;
    node.buf[kPortRight][f] = R;
    node.buf[kPortMono][f] = 0.5 * (L + R);
  }
}

// Sinc: stages=lobes, mode=bandLimit, phaseParam=phase, frequency=freq.
static void process_sinc(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double referenceVoltage = 48.0 / 120.0;
  const double phaseOff = node.phaseParam.out;
  const double lobes = node.stages.out;
  const double bandLimit = node.mode.out;

  for (int f = 0; f < frames; f++) {
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    const double y = soemdsp_sinc_sample(
      node.nativeHandle, freq, phaseOff, lobes, bandLimit, sr
    );
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

// Bradley 2A: many params remapped onto existing Controls (see JS push map).
static void process_bradley2a(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double referenceVoltage = 48.0 / 120.0;
  const double freqOffset = node.width.out;
  const double jitterDepth = node.shape.out;
  const double jitterRate = node.lfoRate.out;
  const double ampDepth = node.lfoAmplitude.out;
  const double ampRate = node.lfoBaseSpeed.out;
  const double interfLevel = node.mix.out;
  const double interfFreq = node.lpfFrequency.out;
  const double harm2 = node.diffusionSize.out;
  const double harm3 = node.diffusionAmount.out;
  const double hitRate = node.feedback.out;
  const double hitDuration = node.timeNumerator.out;
  const double hitGain = node.level.out;
  const double hitPhase = node.phaseParam.out;
  const double impulseLevel = node.recycle.out;
  const double level = node.amplitude.out;

  for (int f = 0; f < frames; f++) {
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    const double y = soemdsp_bradley_2a_sample(
      node.nativeHandle,
      freq,
      freqOffset,
      jitterDepth,
      jitterRate,
      ampDepth,
      ampRate,
      interfLevel,
      interfFreq,
      harm2,
      harm3,
      hitRate,
      hitDuration,
      hitGain,
      hitPhase,
      impulseLevel,
      level,
      sr
    );
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

// RoundShape ellipsoid: free-fn sine→square; Bi X/Y + Uni X/Y.
// mode=motion (0 ClockPh, 1 CounterClockPh, 2 ClockT, 3 CounterClockT).
// Ports: Left=Bi X, Right=Bi Y, Saw=Uni X, Ramp=Uni Y, Mono=Bi X.
// Morph CV is turquoise ZOH (additive to knob).
static void process_ellipsoid(Circuit& g, Node& node, int frames) {
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool liveMorph = mix_live_port(g, node, kPortMorph, frames, g.mixMorph);
  const double referenceVoltage = 48.0 / 120.0;
  const double phaseOff = node.phaseParam.out;
  const double shape = morph_zoh_hold(g, node, liveMorph, true);
  const double level = node.amplitude.out;
  int motion = (int)(node.mode.out + (node.mode.out >= 0.0 ? 0.5 : -0.5));
  if (motion < 0) motion = 0;
  if (motion > 3) motion = 3;
  const bool clockWise = (motion == 0 || motion == 2);
  const bool useSimTime = motion >= 2;
  const double dir = clockWise ? -1.0 : 1.0;

  double phase = node.phase; // cycles 0..1
  if (!liveReset) node.lastReset = 0.0;
  for (int f = 0; f < frames; f++) {
    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        phase = 0.0;
        node.phase = 0.0;
      }
      node.lastReset = rv;
    }
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    // RoundShape allows negative Hz (reverse); do not clamp to +Nyquist only.
    if (!(freq == freq)) freq = 0.0;
    const double ny = 0.5 * sr;
    if (freq > ny) freq = ny;
    if (freq < -ny) freq = -ny;
    double phaseInc = dir * (freq / sr);
    if (liveInc) phaseInc += g.mixIncrement[f];

    double samplePhase;
    if (useSimTime) {
      const double t = g.globalTimeSamples + (double)f;
      samplePhase = phaseInc * t + phaseOff;
    } else {
      samplePhase = phase + phaseOff;
    }
    samplePhase -= dsp_floor(samplePhase);

    const double biX = soemdsp_ellipsoid_sine_to_square_aa(
      samplePhase, shape, freq < 0.0 ? -freq : freq, sr, 1
    ) * level;
    const double biY = soemdsp_ellipsoid_sine_to_square_aa(
      samplePhase - 0.25, shape, freq < 0.0 ? -freq : freq, sr, 1
    ) * level;
    const double uniX = 0.5 * (biX + level);
    const double uniY = 0.5 * (biY + level);

    node.buf[kPortLeft][f] = biX;
    node.buf[kPortRight][f] = biY;
    node.buf[kPortSaw][f] = uniX;
    node.buf[kPortRamp][f] = uniY;
    node.buf[kPortMono][f] = biX;

    if (!useSimTime) {
      phase += phaseInc;
      phase -= dsp_floor(phase);
    }
  }
  if (!useSimTime) node.phase = phase;
}

// Snowflake: stereo X/Y path walk. mode=pattern, stages=iterations,
// width=angle°, shape=direction, center=spin, phaseParam=phase.
static void process_snowflake(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double referenceVoltage = 48.0 / 120.0;
  const double pattern = node.mode.out;
  const double iterations = node.stages.out;
  const double angleDeg = node.width.out;
  const double direction = node.shape.out;
  const double spin = node.center.out;
  const double phaseArg = node.phaseParam.out;
  const double level = node.amplitude.out;
  if (!liveReset) node.lastReset = 0.0;

  for (int f = 0; f < frames; f++) {
    double resetGate = 0.0;
    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) resetGate = 1.0;
      node.lastReset = rv;
    }
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    soemdsp_snowflake_sample(
      node.nativeHandle,
      freq,
      pattern,
      iterations,
      angleDeg,
      1.0, // sizeArg ignored
      direction,
      spin,
      level,
      resetGate,
      phaseArg,
      sr
    );
    const double X = soemdsp_snowflake_x(node.nativeHandle);
    const double Y = soemdsp_snowflake_y(node.nativeHandle);
    node.buf[kPortLeft][f] = X;
    node.buf[kPortRight][f] = Y;
    node.buf[kPortMono][f] = 0.5 * (X + Y);
  }
}

// Speaker Protection: hard mute per channel if !finite or |x| > 1.
static void process_speaker_protection(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  for (int f = 0; f < frames; f++) {
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      const double out = soemdsp_speaker_protection_sample(node.nativeHandle, in);
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn) {
      node.buf[kPortLeft][f] = soemdsp_speaker_protection_sample(
        node.nativeHandle, g.mixLeft[f] + g.mixMono[f]
      );
    }
    if (hasRightIn) {
      node.buf[kPortRight][f] = soemdsp_speaker_protection_sample(
        node.nativeHandle, g.mixRight[f] + g.mixMono[f]
      );
    }
  }
}

// Speaker Protector 2.0: stereo-linked slew VCA + HP trip.
static void process_speaker_protector2(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  // drop/hold/rise reused on timeNumerator / timeDenominator / offsetMs.
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double l = g.mixLeft[f] + g.mixMono[f];
    const double r = g.mixRight[f] + g.mixMono[f];
    double outL = 0.0, outR = 0.0, outM = 0.0;
    soemdsp_speaker_protector2_sample(
      node.nativeHandle,
      l,
      r,
      sr,
      node.timeNumerator.out,
      node.timeDenominator.out,
      node.offsetMs.out,
      &outL,
      &outR,
      &outM
    );
    node.buf[kPortLeft][f] = outL;
    node.buf[kPortRight][f] = outR;
    node.buf[kPortMono][f] = outM;
  }
}

// Shop Papoulis Filter (3-pole optimum-L). Distinct from Control papHandle
// smoothers — uses Node.nativeHandle from the same 256-slot pool.
static void process_papoulis_filter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_papoulis_filter_sample(
      node.nativeHandle, in, freq, sr
    );
    node.buf[kPortMono][f] = out * node.amplitude.out;
  }
}

// Classical scientific IIR (butterworth / LR / bessel / cheby / elliptic).
// No process_block on natives — per-sample cascade_process via sample().
// stages=order, width=bandwidth oct, resonance=ripple dB (cheby/elliptic).
typedef double (*ScientificIirSampleFn)(
  int handle, double input, int mode, double frequencyHz, int order,
  double bandwidthOct, double rippleDb, double sampleRate
);

static void process_scientific_iir(
  Circuit& g, Node& node, int frames, ScientificIirSampleFn sampleFn
) {
  if (node.nativeHandle <= 0 || !sampleFn) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool controlSmoothing = node_control_smoothing(node);
  const double modeV = node.mode.out;
  int mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 3) mode = 3;
  int order = (int)(node.stages.out + (node.stages.out >= 0.0 ? 0.5 : -0.5));
  if (order < 2) order = 2;
  if (order > 8) order = 8;
  if (order & 1) order += 1; // even only
  const double bandwidth = node.width.out;
  const double ripple = node.resonance.out;

  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = sampleFn(
      node.nativeHandle, in, mode, freq, order, bandwidth, ripple, sr
    );
    node.buf[kPortMono][f] = out;
  }
}

// EQ Filter (ZDF SVF): resonance=Q, gainDb=shelf/peak gain.
static void process_eq_filter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool controlSmoothing = node_control_smoothing(node);
  const double modeV = node.mode.out;
  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    const double q = node.resonance.out;
    const double gain = node.gainDb.out;
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      const double out = soemdsp_eq_filter_sample(
        node.nativeHandle, in, modeV, freq, q, gain, sr
      );
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn && node.nativeHandleL > 0) {
      node.buf[kPortLeft][f] = soemdsp_eq_filter_sample(
        node.nativeHandleL, g.mixLeft[f] + g.mixMono[f], modeV, freq, q, gain, sr
      );
    }
    if (hasRightIn && node.nativeHandleR > 0) {
      node.buf[kPortRight][f] = soemdsp_eq_filter_sample(
        node.nativeHandleR, g.mixRight[f] + g.mixMono[f], modeV, freq, q, gain, sr
      );
    }
  }
}

// bandpass (mode 4) / allpass (mode 6): eq_filter handles + 0.1V/Oct pitch.
// gain hard-coded 0; amplitude scales outs.
static void process_eq_filter_fixed_mode(
  Circuit& g, Node& node, int frames, double forcedMode
) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool controlSmoothing = node_control_smoothing(node);
  const double referenceVoltage = 48.0 / 120.0;
  const double modeV = forcedMode;
  const double gain = 0.0;
  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    const double q = node.resonance.out;
    const double amp = node.amplitude.out;
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      const double out = soemdsp_eq_filter_sample(
        node.nativeHandle, in, modeV, freq, q, gain, sr
      ) * amp;
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn && node.nativeHandleL > 0) {
      node.buf[kPortLeft][f] = soemdsp_eq_filter_sample(
        node.nativeHandleL, g.mixLeft[f] + g.mixMono[f], modeV, freq, q, gain, sr
      ) * amp;
    }
    if (hasRightIn && node.nativeHandleR > 0) {
      node.buf[kPortRight][f] = soemdsp_eq_filter_sample(
        node.nativeHandleR, g.mixRight[f] + g.mixMono[f], modeV, freq, q, gain, sr
      ) * amp;
    }
  }
}

static void process_bandpass(Circuit& g, Node& node, int frames) {
  process_eq_filter_fixed_mode(g, node, frames, 4.0);
}

static void process_allpass(Circuit& g, Node& node, int frames) {
  process_eq_filter_fixed_mode(g, node, frames, 6.0);
}

// Active ladder: stages=feedbackCircuit, timingMode=gainCompensation.
// Cutoff: live ƒ, else HP→hpfFrequency, LP/BP→lpfFrequency (fallback frequency).
static void process_active_filter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool controlSmoothing = node_control_smoothing(node)
    || node.hpfFrequency.active || node.lpfFrequency.active;
  const double modeV = node.mode.out;
  int mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 9) mode = 9;
  int circuit = (int)(node.stages.out + (node.stages.out >= 0.0 ? 0.5 : -0.5));
  if (circuit < 0) circuit = 0;
  if (circuit > 3) circuit = 3;
  const int gainComp = (int)(node.timingMode.out + (node.timingMode.out >= 0.0 ? 0.5 : -0.5));
  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (mode >= 4 && mode <= 7) {
      freq = node.hpfFrequency.out;
    } else {
      freq = node.lpfFrequency.out;
      if (!(freq == freq)) freq = node.frequency.out;
    }
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    const double reso = node.resonance.out;
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      const double out = soemdsp_active_filter_sample(
        node.nativeHandle, in, freq, reso, mode, circuit, gainComp, sr
      );
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn && node.nativeHandleL > 0) {
      node.buf[kPortLeft][f] = soemdsp_active_filter_sample(
        node.nativeHandleL, g.mixLeft[f] + g.mixMono[f], freq, reso, mode, circuit, gainComp, sr
      );
    }
    if (hasRightIn && node.nativeHandleR > 0) {
      node.buf[kPortRight][f] = soemdsp_active_filter_sample(
        node.nativeHandleR, g.mixRight[f] + g.mixMono[f], freq, reso, mode, circuit, gainComp, sr
      );
    }
  }
}

// Passive 1-pole: hpfFrequency=lowCut, lpfFrequency=highCut (native slope=6 only).
static void process_passive_filter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node)
    || node.hpfFrequency.active || node.lpfFrequency.active;
  const double modeV = node.mode.out;
  int mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 2) mode = 2;
  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double lo = node.hpfFrequency.out;
    const double hi = node.lpfFrequency.out;
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      const double out = soemdsp_passive_filter_sample(
        node.nativeHandle, in, mode, lo, hi, sr
      );
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn && node.nativeHandleL > 0) {
      node.buf[kPortLeft][f] = soemdsp_passive_filter_sample(
        node.nativeHandleL, g.mixLeft[f] + g.mixMono[f], mode, lo, hi, sr
      );
    }
    if (hasRightIn && node.nativeHandleR > 0) {
      node.buf[kPortRight][f] = soemdsp_passive_filter_sample(
        node.nativeHandleR, g.mixRight[f] + g.mixMono[f], mode, lo, hi, sr
      );
    }
  }
}

// TB-303: frequency=cutoff Hz, gainDb=drive dB, resonance=%.
static void process_tb303_filter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool controlSmoothing =
    node_control_smoothing(node) || node.gainDb.active || node.amplitude.active;
  const double modeV = node.mode.out;
  int mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 14) mode = 14;
  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    const double reso = node.resonance.out;
    const double drive = node.gainDb.out;
    double amp = node.amplitude.out;
    if (!(amp == amp)) amp = 1.0;
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      const double out = soemdsp_tb303_filter_sample(
        node.nativeHandle, in, freq, reso, mode, drive, sr
      ) * amp;
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn && node.nativeHandleL > 0) {
      node.buf[kPortLeft][f] = soemdsp_tb303_filter_sample(
        node.nativeHandleL, g.mixLeft[f] + g.mixMono[f], freq, reso, mode, drive, sr
      ) * amp;
    }
    if (hasRightIn && node.nativeHandleR > 0) {
      node.buf[kPortRight][f] = soemdsp_tb303_filter_sample(
        node.nativeHandleR, g.mixRight[f] + g.mixMono[f], freq, reso, mode, drive, sr
      ) * amp;
    }
  }
}

// Character filters with 0..1 normalized frequency; shape=chaos.
static void process_norm_chaos_filter(
  Circuit& g, Node& node, int frames, bool hasMode,
  double (*sample4)(int, double, double, double, double, double),
  double (*sample5)(int, double, double, double, double, int, double)
) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node) || node.amplitude.active;
  int mode = 0;
  if (hasMode) {
    const double modeV = node.mode.out;
    mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  }
  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = node.frequency.out;
    if (!(freq == freq)) freq = 0.5;
    if (freq < 0.0) freq = 0.0;
    if (freq > 1.0) freq = 1.0;
    const double reso = node.resonance.out;
    const double chaos = node.shape.out;
    double amp = node.amplitude.out;
    if (!(amp == amp)) amp = 1.0;
    if (needMono) {
      double in = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) in += g.mixLeft[f] + g.mixRight[f];
      double out = 0.0;
      if (hasMode && sample5) {
        out = sample5(node.nativeHandle, in, freq, reso, chaos, mode, sr);
      } else if (sample4) {
        out = sample4(node.nativeHandle, in, freq, reso, chaos, sr);
      }
      out *= amp;
      node.buf[kPortMono][f] = out;
      if (!hasLeftIn) node.buf[kPortLeft][f] = out;
      if (!hasRightIn) node.buf[kPortRight][f] = out;
    }
    if (hasLeftIn && node.nativeHandleL > 0) {
      const double inL = g.mixLeft[f] + g.mixMono[f];
      if (hasMode && sample5) {
        node.buf[kPortLeft][f] = sample5(
          node.nativeHandleL, inL, freq, reso, chaos, mode, sr
        ) * amp;
      } else if (sample4) {
        node.buf[kPortLeft][f] = sample4(
          node.nativeHandleL, inL, freq, reso, chaos, sr
        ) * amp;
      }
    }
    if (hasRightIn && node.nativeHandleR > 0) {
      const double inR = g.mixRight[f] + g.mixMono[f];
      if (hasMode && sample5) {
        node.buf[kPortRight][f] = sample5(
          node.nativeHandleR, inR, freq, reso, chaos, mode, sr
        ) * amp;
      } else if (sample4) {
        node.buf[kPortRight][f] = sample4(
          node.nativeHandleR, inR, freq, reso, chaos, sr
        ) * amp;
      }
    }
  }
}

static void process_flower_child_filter(Circuit& g, Node& node, int frames) {
  process_norm_chaos_filter(
    g, node, frames, true, nullptr, soemdsp_flower_child_filter_sample
  );
}

static void process_yellowjacket_filter(Circuit& g, Node& node, int frames) {
  process_norm_chaos_filter(
    g, node, frames, false, soemdsp_yellowjacket_filter_sample, nullptr
  );
}

static void process_superlove_filter(Circuit& g, Node& node, int frames) {
  process_norm_chaos_filter(
    g, node, frames, true, nullptr, soemdsp_superlove_filter_sample
  );
}

static void process_human_filter(Circuit& g, Node& node, int frames) {
  process_norm_chaos_filter(
    g, node, frames, true, nullptr, soemdsp_human_filter_sample
  );
}

static void process_resonator_filter(Circuit& g, Node& node, int frames) {
  process_norm_chaos_filter(
    g, node, frames, true, nullptr, soemdsp_resonator_filter_sample
  );
}

// Always dual-instance stereo: independent L/R native states (chaos diverges).
// Mono In folds into both; Mono Out = (L+R)/2 when needed.
static void process_chaotic_phase_locking_filter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandleL <= 0 || node.nativeHandleR <= 0) {
    // Fallback: single-handle path if MLR pool failed.
    process_norm_chaos_filter(
      g, node, frames, false, soemdsp_chaotic_phase_locking_filter_sample, nullptr
    );
    return;
  }
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node) || node.amplitude.active;
  bool hasLeftIn = false, hasRightIn = false, hasMonoIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  const bool needMono = hasMonoIn || monoOutWired || (!hasLeftIn && !hasRightIn);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = node.frequency.out;
    if (!(freq == freq)) freq = 0.5;
    if (freq < 0.0) freq = 0.0;
    if (freq > 1.0) freq = 1.0;
    const double reso = node.resonance.out;
    const double chaos = node.shape.out;
    double amp = node.amplitude.out;
    if (!(amp == amp)) amp = 1.0;
    const double monoIn = g.mixMono[f];
    const double inL = g.mixLeft[f] + monoIn;
    const double inR = g.mixRight[f] + monoIn;
    const double outL = soemdsp_chaotic_phase_locking_filter_sample(
      node.nativeHandleL, inL, freq, reso, chaos, sr
    ) * amp;
    const double outR = soemdsp_chaotic_phase_locking_filter_sample(
      node.nativeHandleR, inR, freq, reso, chaos, sr
    ) * amp;
    node.buf[kPortLeft][f] = outL;
    node.buf[kPortRight][f] = outR;
    if (needMono) {
      node.buf[kPortMono][f] = 0.5 * (outL + outR);
    }
  }
}

// Mode resonator: timeNumerator=decay, timingMode=hold.
static void process_mode_resonator(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node)
    || node.timeNumerator.active || node.amplitude.active;
  const int hold = (int)(node.timingMode.out + (node.timingMode.out >= 0.0 ? 0.5 : -0.5));
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    if (hasTrig) in += g.mixTrigger[f];
    const double out = soemdsp_mode_resonator_sample(
      node.nativeHandle, in, freq, node.timeNumerator.out, hold,
      node.amplitude.out, sr
    );
    node.buf[kPortMono][f] = out;
  }
}

// Comb resonator: decay=timeNumerator, hold=timingMode, damping=shape,
// topology=mode, invert=stages, depth=width.
static void process_comb_resonator(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node)
    || node.timeNumerator.active || node.amplitude.active;
  const int hold = (int)(node.timingMode.out + (node.timingMode.out >= 0.0 ? 0.5 : -0.5));
  const double modeV = node.mode.out;
  int topology = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (topology < 0) topology = 0;
  if (topology > 1) topology = 1;
  int invert = (int)(node.stages.out + (node.stages.out >= 0.0 ? 0.5 : -0.5));
  if (invert < 0) invert = 0;
  if (invert > 1) invert = 1;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    if (hasTrig) in += g.mixTrigger[f];
    const double out = soemdsp_comb_resonator_sample(
      node.nativeHandle, in, freq, node.timeNumerator.out, hold,
      node.shape.out, topology, invert, node.width.out, node.amplitude.out, sr
    );
    node.buf[kPortMono][f] = out;
  }
}

// Inertial: frequency=attack Hz, lpfFrequency=release Hz.
static void process_inertial_filter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node) || node.lpfFrequency.active;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_inertial_filter_sample(
      node.nativeHandle, in, node.frequency.out, node.lpfFrequency.out, sr
    );
    node.buf[kPortMono][f] = out;
  }
}

// Curve ADSR: Gate on Mono(+L/R).
// timeNumerator=delay, timeDenominator=attack, feedback=decay, mix=sustain,
// offsetMs=release (seconds), shape=attackShape, center=releaseShape,
// mode=loop, level=level.
static void process_exp_adsr(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double gate = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_exp_adsr_sample(
      node.nativeHandle,
      gate,
      node.timeNumerator.out,
      node.timeDenominator.out,
      node.shape.out,
      node.feedback.out,
      node.mix.out,
      node.offsetMs.out,
      node.center.out,
      node.mode.out,
      node.level.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Attack/Decay: Gate on Mono(+L/R).
// timeDenominator=attack, feedback=decay, shape=curve, mode=inputMode,
// timingMode=cycle, amplitude=amplitude.
static void process_attack_decay(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double gate = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_attack_decay_sample(
      node.nativeHandle,
      gate,
      node.timeDenominator.out,
      node.feedback.out,
      node.shape.out,
      node.amplitude.out,
      node.mode.out,
      node.timingMode.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// BasicShape naive LFO: mode=motion, shape=morph, waveform selects Wave out.
// Taps: Sine/Tri/Saw/Square/Ramp + Trisaw(8) + Center Square(9).
static void process_basic_shape(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double referenceVoltage = 48.0 / 120.0;
  const double phaseOff = node.phaseParam.out;
  const double morph = node.shape.out;
  const double amp = node.amplitude.out;
  const double waveV = node.waveform.out;
  const double motion = node.mode.out;
  if (!liveReset) node.lastReset = 0.0;

  for (int f = 0; f < frames; f++) {
    double freq;
    if (liveF) {
      freq = g.mixF[f];
    } else if (livePitch) {
      freq = pitched_hz(node.frequency.out, g.mixPitch[f], referenceVoltage);
    } else {
      freq = node.frequency.out;
    }
    if (!(freq == freq)) freq = 0.0;
    const double ny = 0.5 * sr;
    if (freq > ny) freq = ny;
    if (freq < -ny) freq = -ny;
    const double inc = liveInc ? g.mixIncrement[f] : 0.0;
    const double reset = liveReset ? g.mixReset[f] : 0.0;
    const double y = soemdsp_basic_shape_sample(
      node.nativeHandle, freq, sr, waveV, motion, phaseOff, morph, amp, inc, reset
    );
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
    node.buf[kPortSine][f] = soemdsp_basic_shape_sine(node.nativeHandle);
    node.buf[kPortTri][f] = soemdsp_basic_shape_tri(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_basic_shape_saw(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_basic_shape_ramp(node.nativeHandle);
    node.buf[kPortSquare][f] = soemdsp_basic_shape_square(node.nativeHandle);
    node.buf[kPortTrisaw][f] = soemdsp_basic_shape_trisaw(node.nativeHandle);
    node.buf[kPortCenterSquare][f] = soemdsp_basic_shape_center_square(node.nativeHandle);
  }
}

// Linear ADSR: same Control map as expAdsr minus shape knobs.
static void process_linear_envelope(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double gate = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_linear_envelope_sample(
      node.nativeHandle,
      gate,
      node.timeNumerator.out,
      node.timeDenominator.out,
      node.feedback.out,
      node.mix.out,
      node.offsetMs.out,
      node.mode.out,
      node.level.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Pluck: Trigger→kPortTrigger, Release→Mono(+L/R).
// timeNumerator=delayTime, timeDenominator=attackFeedback, feedback=decay,
// diffusionSize/Amount=decayModStart/End, delaySize=endingDecay,
// shape=decayModCurve, frequency=decayModFrequency, offsetMs=autoReleaseTime,
// recycle=releaseFeedback, width=velocity, center=velocitySensitivity,
// level=level.
static void process_pluck_envelope(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double trigger = hasTrig ? g.mixTrigger[f] : 0.0;
    const double release = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_pluck_envelope_sample(
      node.nativeHandle,
      trigger,
      release,
      node.timeNumerator.out,
      node.timeDenominator.out,
      node.feedback.out,
      node.diffusionSize.out,
      node.diffusionAmount.out,
      node.delaySize.out,
      node.shape.out,
      node.frequency.out,
      node.offsetMs.out,
      node.recycle.out,
      node.width.out,
      node.center.out,
      node.level.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Envelope follower: timeNumerator=attack, timeDenominator=hold,
// feedback=decay; amplitude scales Out.
static void process_flower_child_envelope_follower(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double env = soemdsp_flower_child_envelope_follower_sample(
      node.nativeHandle,
      in,
      node.timeNumerator.out,
      node.timeDenominator.out,
      node.feedback.out,
      sr
    );
    const double out = env * node.amplitude.out;
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Mono delay: timeNumerator=time, feedback, mix, level=outLevel,
// lfoAmplitude=modAmount, lfoRate=modRate, lfoVariation=modVariation;
// mode invert unused (0). Mix→Mono/L/R; Wet→Saw.
static void process_delay_effect(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const unsigned int seed = node.idHash;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    soemdsp_delay_effect_sample(
      node.nativeHandle,
      in,
      node.timeNumerator.out,
      node.feedback.out,
      node.mix.out,
      node.level.out,
      node.lfoAmplitude.out,
      node.lfoRate.out,
      node.lfoVariation.out,
      0.0,
      seed,
      sr
    );
    const double mixOut = soemdsp_delay_effect_out(node.nativeHandle);
    const double wet = soemdsp_delay_effect_wet(node.nativeHandle);
    node.buf[kPortMono][f] = mixOut;
    node.buf[kPortLeft][f] = mixOut;
    node.buf[kPortRight][f] = mixOut;
    node.buf[kPortSaw][f] = wet;
  }
}

// SoEmReverb (distinct from sabrina reverbEffect).
// mix, amplitude=volume, delaySize=echoTime, recycle, stages=numDelays,
// diffusionSize/Amount, seed, lfoAmplitude=lfoAmp, lfoBaseSpeed=lfoFrequency,
// lfoVariation, lfoStyle, mode=echoMode, timingMode=pingPong,
// waveform=doModulateEcho, saturate, lpf/hpf, frequency=bandFrequency,
// gainDb=bandDecibels, resonance=bandQ, width=lpfStages, center=bandStages,
// feedback=duckLimit, offsetMs=duckRelease.
static void process_soem_reverb(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  soemdsp_soem_reverb_set_params(
    node.nativeHandle,
    node.mix.out,
    node.amplitude.out,
    node.delaySize.out,
    node.recycle.out,
    node.stages.out,
    node.diffusionSize.out,
    node.diffusionAmount.out,
    node.seed.out,
    node.lfoAmplitude.out,
    node.lfoBaseSpeed.out,
    node.lfoVariation.out,
    node.lfoStyle.out,
    node.mode.out,
    node.timingMode.out,
    node.waveform.out,
    node.saturate.out,
    node.lpfFrequency.out,
    node.hpfFrequency.out,
    node.frequency.out,
    node.gainDb.out,
    node.resonance.out,
    node.width.out,
    node.center.out,
    node.feedback.out,
    node.offsetMs.out
  );
  for (int f = 0; f < frames; f++) {
    const double mono = g.mixMono[f];
    const double inL = mono + g.mixLeft[f];
    const double inR = mono + g.mixRight[f];
    soemdsp_soem_reverb_process(node.nativeHandle, inL, inR);
    node.buf[kPortLeft][f] = soemdsp_soem_reverb_left(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_soem_reverb_right(node.nativeHandle);
    node.buf[kPortDryL][f] = soemdsp_soem_reverb_dry_left(node.nativeHandle);
    node.buf[kPortDryR][f] = soemdsp_soem_reverb_dry_right(node.nativeHandle);
    node.buf[kPortMono][f] =
      0.5 * (node.buf[kPortLeft][f] + node.buf[kPortRight][f]);
  }
}

// PLL: Signal In→Mono, VCO CV In→Left (cvConnected if Left wired).
// mode=range, offset=offset, stages=type, frequency=frequ.
// VCO→Mono, PC→Left, LPF→Right, Locked→Saw.
static void process_pll(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  bool cvConnected = false;
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.dstHash != node.idHash) continue;
    if (clamp_dst_port(c.dstPort) == kPortLeft) {
      cvConnected = true;
      break;
    }
  }
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  soemdsp_pll_set_params(
    node.nativeHandle,
    sr,
    (int)(node.mode.out + 0.5),
    node.offset.out,
    (int)(node.stages.out + 0.5),
    node.frequency.out
  );
  for (int f = 0; f < frames; f++) {
    soemdsp_pll_process(
      node.nativeHandle,
      g.mixMono[f],
      g.mixLeft[f],
      cvConnected ? 1.0 : 0.0
    );
    node.buf[kPortMono][f] = soemdsp_pll_vco_out(node.nativeHandle);
    node.buf[kPortLeft][f] = soemdsp_pll_pc_out(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_pll_lpf_out(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_pll_locked(node.nativeHandle);
  }
}

// Lorenz: Reset live. frequency=speed, shape=sigma, resonance=rho, width=beta,
// phase=rotate, center=scale, mix=zDepth; amplitude scales outs.
// X→Mono, Y→Left, Z→Right.
static void process_lorenz_attractor(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_lorenz_attractor_sample(
      node.nativeHandle,
      hasReset ? g.mixReset[f] : 0.0,
      node.frequency.out,
      node.shape.out,
      node.resonance.out,
      node.width.out,
      node.phaseParam.out,
      node.center.out,
      node.mix.out,
      sr
    );
    const double amp = node.amplitude.out;
    node.buf[kPortMono][f] = soemdsp_lorenz_attractor_x(node.nativeHandle) * amp;
    node.buf[kPortLeft][f] = soemdsp_lorenz_attractor_y(node.nativeHandle) * amp;
    node.buf[kPortRight][f] = soemdsp_lorenz_attractor_z(node.nativeHandle) * amp;
  }
}

// Logistic: Reset live. frequency=rate, shape=r, center=seed, amplitude=level.
// Out→Mono/L/R.
static void process_logistic_map(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double out = soemdsp_logistic_map_sample(
      node.nativeHandle,
      hasReset ? g.mixReset[f] : 0.0,
      node.frequency.out,
      node.shape.out,
      node.center.out,
      node.amplitude.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Henon: Reset live. frequency=rate, shape=a, width=b, center=seedX, mix=seedY.
// X→Mono, Y→Left (+Right).
static void process_henon_map(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_henon_map_sample(
      node.nativeHandle,
      hasReset ? g.mixReset[f] : 0.0,
      node.frequency.out,
      node.shape.out,
      node.width.out,
      node.center.out,
      node.mix.out,
      sr
    );
    const double amp = node.amplitude.out;
    const double x = soemdsp_henon_map_x(node.nativeHandle) * amp;
    const double y = soemdsp_henon_map_y(node.nativeHandle) * amp;
    node.buf[kPortMono][f] = x;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

// Chua: Reset live. frequency=speed, shape=alpha, width=beta, center=m0, mix=m1.
// X→Mono, Y→Left, Z→Right.
static void process_chua_attractor(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_chua_attractor_sample(
      node.nativeHandle,
      hasReset ? g.mixReset[f] : 0.0,
      node.frequency.out,
      node.shape.out,
      node.width.out,
      node.center.out,
      node.mix.out,
      sr
    );
    const double amp = node.amplitude.out;
    node.buf[kPortMono][f] = soemdsp_chua_attractor_x(node.nativeHandle) * amp;
    node.buf[kPortLeft][f] = soemdsp_chua_attractor_y(node.nativeHandle) * amp;
    node.buf[kPortRight][f] = soemdsp_chua_attractor_z(node.nativeHandle) * amp;
  }
}

// Ray bouncer: Reset live. Crowded ellipse billiard params on spare Controls.
// X→Mono, Y→Left (+Right). level scales.
static void process_ray_bouncer(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_ray_bouncer_sample(
      node.nativeHandle,
      hasReset ? g.mixReset[f] : 0.0,
      node.frequency.out,
      node.phaseParam.out,
      node.inLow.out,
      node.inHigh.out,
      node.width.out,
      node.center.out,
      node.mix.out,
      node.outLow.out,
      node.outHigh.out,
      node.timeNumerator.out,
      node.feedback.out,
      node.diffusionSize.out,
      node.diffusionAmount.out,
      sr
    );
    const double amp = node.level.out;
    const double x = soemdsp_ray_bouncer_x(node.nativeHandle) * amp;
    const double y = soemdsp_ray_bouncer_y(node.nativeHandle) * amp;
    node.buf[kPortMono][f] = x;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

// Chord memory: Latch→Trigger, Clear→Reset, Advance→Increment, Pitch→PitchCV.
// Note1→Mono … Note4→Saw, Arp→Ramp, Gate→Square.
static void process_chord_memory(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasLatch = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasClear = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool hasAdvance = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool hasPitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  for (int f = 0; f < frames; f++) {
    const double note1 = soemdsp_chord_memory_sample(
      node.nativeHandle,
      hasLatch ? g.mixTrigger[f] : 0.0,
      hasClear ? g.mixReset[f] : 0.0,
      hasAdvance ? g.mixIncrement[f] : 0.0,
      hasPitch ? g.mixPitch[f] : 0.0
    );
    node.buf[kPortMono][f] = note1;
    node.buf[kPortLeft][f] = soemdsp_chord_memory_note2(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_chord_memory_note3(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_chord_memory_note4(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_chord_memory_arp(node.nativeHandle);
    node.buf[kPortSquare][f] = soemdsp_chord_memory_gate(node.nativeHandle);
  }
}

// Chord sequencer: Clock→Trigger, Reset→Reset. mode=progression, amplitude=level.
// Scale→Mono, Root→Left, Gate→Right, Step→Saw.
static void process_chord_sequencer(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasClock = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double progression = node.mode.out;
    const double clock = hasClock ? g.mixTrigger[f] : 0.0;
    soemdsp_chord_sequencer_sample(
      node.nativeHandle,
      clock,
      hasReset ? g.mixReset[f] : 0.0,
      progression
    );
    const double scale = (double)soemdsp_chord_sequencer_scale(node.nativeHandle, progression);
    const double root = soemdsp_chord_sequencer_root(node.nativeHandle, progression);
    const double gate = (clock > 0.0 ? 1.0 : 0.0) * node.amplitude.out;
    const double step = (double)soemdsp_chord_sequencer_step(node.nativeHandle);
    node.buf[kPortMono][f] = scale;
    node.buf[kPortLeft][f] = root;
    node.buf[kPortRight][f] = gate;
    node.buf[kPortSaw][f] = step;
  }
}

// Pitch quantizer: PitchCV + optional Scale on Mono. seed=scaleMask (12-bit).
static void process_pitch_quantizer(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasPitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool hasScale = mix_live_port(g, node, kPortMono, frames, g.mixMono);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double pitch = hasPitch ? g.mixPitch[f] : 0.0;
    int mask;
    if (hasScale) {
      mask = (int)(g.mixMono[f] + (g.mixMono[f] >= 0.0 ? 0.5 : -0.5)) & 0xFFF;
    } else {
      mask = (int)(node.seed.out + 0.5) & 0xFFF;
    }
    const double out = soemdsp_pitch_quantizer_sample(node.nativeHandle, pitch, mask);
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Turing machine: Clock→Trigger, Reset→Reset.
// stages=length, shape=probability, level=amplitude. CV→Mono, Scale→Left, Gate→Right.
static void process_turing_machine(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasClock = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double cv = soemdsp_turing_machine_sample(
      node.nativeHandle,
      hasClock ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      node.stages.out,
      node.shape.out,
      node.amplitude.out
    );
    node.buf[kPortMono][f] = cv;
    node.buf[kPortLeft][f] = soemdsp_turing_machine_scale(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_turing_machine_gate(node.nativeHandle);
  }
}

// Chord pad: Select→Mono. mode=key, waveform=mode, stages=degree, amplitude=level.
// Scale→Mono, Root→Left, Gate→Right.
static void process_chord_pad(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasSelect = mix_live_port(g, node, kPortMono, frames, g.mixMono);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double scale = soemdsp_chord_pad_sample(
      node.nativeHandle,
      hasSelect ? g.mixMono[f] : 0.0,
      hasSelect ? 1.0 : 0.0,
      node.mode.out,
      node.waveform.out,
      node.stages.out,
      node.amplitude.out
    );
    node.buf[kPortMono][f] = scale;
    node.buf[kPortLeft][f] = soemdsp_chord_pad_root(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_chord_pad_gate(node.nativeHandle);
  }
}

// Note glide: PitchCV in, one-pole time on timeNumerator. Pitch→Mono/L/R.
static void process_note_glide(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasPitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double out = soemdsp_note_glide_sample(
      node.nativeHandle,
      hasPitch ? g.mixPitch[f] : 0.0,
      node.timeNumerator.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Note transpose: PitchCV in; stages=semitones, mode=octaves.
static void process_note_transpose(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasPitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double out = soemdsp_note_transpose_sample(
      node.nativeHandle,
      hasPitch ? g.mixPitch[f] : 0.0,
      node.stages.out,
      node.mode.out
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Degree Turing: Clock→Trigger, Reset→Reset, Scale→Mono, Root→PitchCV.
// stages=length, shape=prob, mode=octaves, seed=scaleChoice, amplitude=level.
// Pitch→Mono, Gate→Left, Trigger→Right, Degree→Saw, CV→Ramp.
static void process_degree_turing(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasClock = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool hasScale = mix_live_port(g, node, kPortMono, frames, g.mixMono);
  const bool hasRoot = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double pitch = soemdsp_degree_turing_sample(
      node.nativeHandle,
      hasClock ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      node.stages.out,
      node.shape.out,
      node.mode.out,
      node.amplitude.out,
      hasScale ? g.mixMono[f] : 0.0,
      hasScale ? 1.0 : 0.0,
      hasRoot ? g.mixPitch[f] : (60.0 / 120.0),
      node.seed.out
    );
    node.buf[kPortMono][f] = pitch;
    node.buf[kPortLeft][f] = soemdsp_degree_turing_gate(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_degree_turing_trigger(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_degree_turing_degree(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_degree_turing_cv(node.nativeHandle);
  }
}

// Degree Phrase: same Scale/Root/Clock/Reset wiring as degreeTuring.
// stages=steps, shape=mutate, mode=octaves, seed=scaleChoice.
// laneVol/Bias=step1..8; inLow/High/outLow/High/bleed2/3/4/offset=rest1..8.
// Pitch→Mono, Gate→Left, Trigger→Right, Phase→Saw.
static void process_degree_phrase(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasClock = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool hasScale = mix_live_port(g, node, kPortMono, frames, g.mixMono);
  const bool hasRoot = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double pitch = soemdsp_degree_phrase_sample(
      node.nativeHandle,
      hasClock ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      node.stages.out,
      node.shape.out,
      node.mode.out,
      node.amplitude.out,
      hasScale ? g.mixMono[f] : 0.0,
      hasScale ? 1.0 : 0.0,
      hasRoot ? g.mixPitch[f] : (60.0 / 120.0),
      node.seed.out,
      node.laneVol[0].out, node.laneVol[1].out, node.laneVol[2].out, node.laneVol[3].out,
      node.laneBias[0].out, node.laneBias[1].out, node.laneBias[2].out, node.laneBias[3].out,
      node.inLow.out, node.inHigh.out, node.outLow.out, node.outHigh.out,
      node.bleed2.out, node.bleed3.out, node.bleed4.out, node.offset.out
    );
    node.buf[kPortMono][f] = pitch;
    node.buf[kPortLeft][f] = soemdsp_degree_phrase_gate(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_degree_phrase_trigger(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_degree_phrase_phase(node.nativeHandle);
  }
}

// Gravity Walker: Leap CV→Morph. shape=gravity, width=leap, mode=octaves, seed=scale.
// Pitch→Mono, Gate→Left, Trigger→Right, Degree→Saw.
static void process_gravity_walker(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasClock = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool hasScale = mix_live_port(g, node, kPortMono, frames, g.mixMono);
  const bool hasRoot = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool hasLeap = mix_live_port(g, node, kPortMorph, frames, g.mixMorph);
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double pitch = soemdsp_gravity_walker_sample(
      node.nativeHandle,
      hasClock ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      node.shape.out,
      node.width.out,
      hasLeap ? g.mixMorph[f] : 0.0,
      node.mode.out,
      node.amplitude.out,
      hasScale ? g.mixMono[f] : 0.0,
      hasScale ? 1.0 : 0.0,
      hasRoot ? g.mixPitch[f] : (60.0 / 120.0),
      node.seed.out
    );
    node.buf[kPortMono][f] = pitch;
    node.buf[kPortLeft][f] = soemdsp_gravity_walker_gate(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_gravity_walker_trigger(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_gravity_walker_degree(node.nativeHandle);
  }
}

// fBm noise: Reset live. frequency/stages=octaves/shape=persistence/center=scale/
// seed/amplitude. X→Mono Y→Left Z→Right.
static void process_fractal_brownian_noise(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const bool high = hasReset && g.mixReset[f] > 0.0;
    if (high && !wasHigh) soemdsp_fbm_reset(node.nativeHandle);
    wasHigh = high;
    soemdsp_fbm_sample(
      node.nativeHandle,
      (int)(node.seed.out + 0.5),
      (int)(node.stages.out + 0.5),
      node.shape.out,
      node.center.out,
      node.frequency.out,
      node.amplitude.out,
      sr
    );
    node.buf[kPortMono][f] = soemdsp_fbm_x(node.nativeHandle);
    node.buf[kPortLeft][f] = soemdsp_fbm_y(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_fbm_z(node.nativeHandle);
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

// Pi spigot: center=start, stages=stride, mode=color, shape=smoothing, amplitude.
// Sum→Mono Term→Left Hex→Right N→Saw T→Ramp B3..B0→Square/Tri/Sine/DryR(Ramp+1?).
// Buses: Square=B3 Tri=B2 Sine=B1 — B0 folds onto Saw alongside N? Prefer:
// Hex→Right N→Saw T→Ramp B3→Square B2→Tri B1→Sine; B0 unused on 8th → overwrite
// DryR share of Ramp is taken; put B0 on leftover — actually 8 buses 0..7:
// Mono Sum, Left Term, Right Hex, Saw N, Ramp T, Square B3, Tri B2, Sine B1.
// B0 omitted from graph taps (still computed in native).
static void process_pi_spigot_noise(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool controlSmoothing = node_control_smoothing(node);
  const double start = node.center.out;
  const double stride = node.stages.out;
  const double key = start * 1000.0 + stride;
  if (key != node.lastReset) {
    soemdsp_pi_spigot_noise_reset_seed(node.nativeHandle, start, stride);
    node.lastReset = key;
  }
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_pi_spigot_noise_sample(
      node.nativeHandle, node.mode.out, node.shape.out, node.amplitude.out
    );
    node.buf[kPortMono][f] = soemdsp_pi_spigot_noise_left(node.nativeHandle);
    node.buf[kPortLeft][f] = soemdsp_pi_spigot_noise_right(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_pi_spigot_noise_hex(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_pi_spigot_noise_n(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_pi_spigot_noise_t(node.nativeHandle);
    node.buf[kPortSquare][f] = soemdsp_pi_spigot_noise_b3(node.nativeHandle);
    node.buf[kPortTri][f] = soemdsp_pi_spigot_noise_b2(node.nativeHandle);
    node.buf[kPortSine][f] = soemdsp_pi_spigot_noise_b1(node.nativeHandle);
  }
}

// Cheap walk: independent L/R reflecting walks (one Seed control).
static void process_cheap_walk(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node) || node.amplitude.active;
  // rate → frequency Control; seed → seed Control
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double left = 0.0;
    double right = 0.0;
    soemdsp_cheap_walk_sample_stereo(
      node.nativeHandle, node.frequency.out, node.amplitude.out, node.seed.out, sr,
      &left, &right
    );
    node.buf[kPortLeft][f] = left;
    node.buf[kPortRight][f] = right;
    node.buf[kPortMono][f] = (left + right) * 0.5;
  }
}

static void process_random_walk(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  const double seed = node.seed.out;
  if (seed != node.lastReset) {
    const unsigned int seedU = (unsigned int)(seed < 1.0 ? 1.0 : seed);
    soemdsp_random_walk_reset_seed(node.nativeHandle, (double)seedU);
    if (node.nativeHandleR > 0) {
      unsigned int rightSeed = seedU ^ 0x9E3779B9u;
      if (rightSeed == 0u) rightSeed = 1u;
      soemdsp_random_walk_reset_seed(node.nativeHandleR, (double)rightSeed);
    }
    node.lastReset = seed;
  }
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double left = soemdsp_random_walk_sample(
      node.nativeHandle,
      node.mode.out,
      node.frequency.out,
      node.width.out,
      node.amplitude.out,
      sr
    );
    double right = left;
    if (node.nativeHandleR > 0) {
      right = soemdsp_random_walk_sample(
        node.nativeHandleR,
        node.mode.out,
        node.frequency.out,
        node.width.out,
        node.amplitude.out,
        sr
      );
    }
    node.buf[kPortLeft][f] = left;
    node.buf[kPortRight][f] = right;
    node.buf[kPortMono][f] = (left + right) * 0.5;
  }
}

// Pulse explosion: Trigger live. Crowded timing/amp params. Out→Mono Curve→Left.
static void process_pulse_explosion(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double out = soemdsp_pulse_explosion_sample(
      node.nativeHandle,
      hasTrig ? g.mixTrigger[f] : 0.0,
      node.timeNumerator.out,   // startTime
      node.center.out,          // centerTime
      node.timeDenominator.out, // endTime
      node.mix.out,             // timeSpread
      (int)(node.stages.out + 0.5),
      node.inLow.out,           // lowAmplitude
      node.inHigh.out,          // highAmplitude
      node.seed.out,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = soemdsp_pulse_explosion_curve(node.nativeHandle);
    node.buf[kPortRight][f] = out;
  }
}

static void xy_amp(Node& node, int f, double x, double y, double z = 0.0, bool hasZ = false) {
  const double amp = node.amplitude.out;
  node.buf[kPortMono][f] = x * amp;
  node.buf[kPortLeft][f] = y * amp;
  node.buf[kPortRight][f] = hasZ ? (z * amp) : (y * amp);
}

static bool rising_reset(Circuit& g, Node& node, int frames, bool hasReset, int f, bool& wasHigh) {
  const bool high = hasReset && g.mixReset[f] > 0.0;
  const bool rise = high && !wasHigh;
  wasHigh = high;
  return rise;
}

static void process_jerobeam_spiral(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_jerobeam_spiral_sample(
      node.nativeHandle,
      node.frequency.out, node.shape.out, node.width.out, node.resonance.out,
      node.mix.out, node.center.out, node.phaseParam.out, 0.0,
      node.offset.out, 0.0, node.inLow.out, 0.0, node.inHigh.out, 0.0,
      node.feedback.out, node.level.out, sr
    );
    xy_amp(node, f,
      soemdsp_jerobeam_spiral_x(node.nativeHandle),
      soemdsp_jerobeam_spiral_y(node.nativeHandle),
      soemdsp_jerobeam_spiral_z(node.nativeHandle), true);
  }
}

static void process_fractal_spiral(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_fractal_spiral_sample(
      node.nativeHandle,
      node.frequency.out, node.phaseParam.out, node.width.out, node.shape.out,
      node.resonance.out, node.center.out, node.stages.out, node.mix.out, sr
    );
    xy_amp(node, f,
      soemdsp_fractal_spiral_x(node.nativeHandle),
      soemdsp_fractal_spiral_y(node.nativeHandle),
      soemdsp_fractal_spiral_z(node.nativeHandle), true);
  }
}

static void process_log_spiral(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    soemdsp_log_spiral_sample(
      node.nativeHandle,
      node.frequency.out, node.phaseParam.out, node.width.out, node.shape.out,
      node.stages.out, sr
    );
    xy_amp(node, f,
      soemdsp_log_spiral_x(node.nativeHandle),
      soemdsp_log_spiral_y(node.nativeHandle),
      soemdsp_log_spiral_z(node.nativeHandle), true);
  }
}

static void process_blubb(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbblubb_reset(node.nativeHandle);
    }
    soemdsp_jbblubb_sample(
      node.nativeHandle,
      node.frequency.out, node.shape.out, node.inLow.out, node.inHigh.out,
      node.level.out, sr
    );
    xy_amp(node, f, soemdsp_jbblubb_x(node.nativeHandle), soemdsp_jbblubb_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_boing(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbboing_reset(node.nativeHandle);
    }
    soemdsp_jbboing_sample(
      node.nativeHandle,
      node.frequency.out, node.shape.out, node.resonance.out,
      node.inLow.out, node.inHigh.out, node.level.out, node.feedback.out,
      node.mix.out, node.center.out, node.width.out, node.mode.out,
      node.phaseParam.out, node.offset.out > 0.0 ? node.offset.out : 1.0,
      node.timingMode.out, sr
    );
    xy_amp(node, f, soemdsp_jbboing_x(node.nativeHandle), soemdsp_jbboing_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_kepler_bouwkamp(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbkepler_reset(node.nativeHandle);
    }
    soemdsp_jbkepler_sample(
      node.nativeHandle,
      node.frequency.out, node.center.out, node.stages.out, node.shape.out,
      node.mix.out, node.phaseParam.out, node.resonance.out, sr
    );
    xy_amp(node, f, soemdsp_jbkepler_x(node.nativeHandle), soemdsp_jbkepler_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_mushroom(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbmushroom_reset(node.nativeHandle);
    }
    // Face defaults for lesser-used visual knobs when not chased separately.
    soemdsp_jbmushroom_sample(
      node.nativeHandle,
      node.frequency.out, node.phaseParam.out, node.stages.out, node.mix.out,
      node.shape.out, node.inLow.out, node.lfoRate.out, node.center.out,
      node.width.out, node.resonance.out, node.inHigh.out, node.offsetMs.out,
      node.feedback.out, node.level.out, node.mode.out, node.oversample.out,
      node.recycle.out, sr
    );
    xy_amp(node, f, soemdsp_jbmushroom_x(node.nativeHandle), soemdsp_jbmushroom_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_nyquist_shannon(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbnyquist_reset(node.nativeHandle);
    }
    soemdsp_jbnyquist_sample(
      node.nativeHandle,
      node.frequency.out, node.seed.out, node.center.out, node.mix.out,
      node.phaseParam.out, node.width.out, node.inLow.out, node.lfoRate.out,
      node.shape.out, node.timeNumerator.out, node.resonance.out,
      node.mode.out, node.stages.out, node.oversample.out, sr
    );
    xy_amp(node, f, soemdsp_jbnyquist_x(node.nativeHandle), soemdsp_jbnyquist_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_radar(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbradar_reset(node.nativeHandle);
    }
    // Discrete visual flags default off (0); core shape/audio Controls mapped.
    soemdsp_jbradar_sample(
      node.nativeHandle,
      node.frequency.out, node.phaseParam.out, node.shape.out, node.resonance.out,
      node.center.out, node.mix.out, node.mode.out, node.width.out, node.level.out,
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      node.stages.out, node.feedback.out, node.offset.out, node.diffusionSize.out,
      node.inHigh.out, node.inLow.out, node.outLow.out, node.outHigh.out, sr
    );
    xy_amp(node, f, soemdsp_jbradar_x(node.nativeHandle), soemdsp_jbradar_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_torus(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbtorus_reset(node.nativeHandle);
    }
    soemdsp_jbtorus_sample(
      node.nativeHandle,
      node.frequency.out, node.shape.out, node.mode.out, node.center.out,
      node.stages.out, node.resonance.out, node.width.out, node.mix.out,
      node.phaseParam.out, node.level.out, node.offset.out, node.seed.out,
      node.inLow.out, node.inHigh.out, node.outLow.out, node.outHigh.out,
      node.feedback.out, node.diffusionSize.out, sr
    );
    xy_amp(node, f, soemdsp_jbtorus_x(node.nativeHandle), soemdsp_jbtorus_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void process_wirdo_spiral(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (rising_reset(g, node, frames, hasReset, f, wasHigh)) {
      soemdsp_jbwirdo_reset(node.nativeHandle);
    }
    soemdsp_jbwirdo_sample(
      node.nativeHandle,
      node.frequency.out, node.resonance.out, node.mix.out, node.shape.out,
      node.width.out, node.phaseParam.out, node.center.out, node.level.out,
      node.stages.out, node.feedback.out, node.offset.out, node.lfoRate.out,
      node.mode.out, sr
    );
    xy_amp(node, f, soemdsp_jbwirdo_x(node.nativeHandle), soemdsp_jbwirdo_y(node.nativeHandle));
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

static void phosphillator_ensure_circle(int handle) {
  float* px = (float*)(void*)(long long)soemdsp_phosphillator_path_x_ptr(handle);
  float* py = (float*)(void*)(long long)soemdsp_phosphillator_path_y_ptr(handle);
  if (!px || !py) return;
  const int n = 64;
  for (int i = 0; i < n; i++) {
    const double t = (double)i / (double)(n - 1);
    double s = 0.0, c = 0.0;
    dsp_sin_cos_turns(t, &s, &c);
    px[i] = (float)c;
    py[i] = (float)s;
  }
  soemdsp_phosphillator_set_path(handle, n);
}

static void process_phosphillator(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  if (node.lastReset < 0.0) {
    phosphillator_ensure_circle(node.nativeHandle);
    node.lastReset = 0.0;
  }
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool hasPitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double x = soemdsp_phosphillator_sample(
      node.nativeHandle,
      hasPitch ? g.mixPitch[f] : 0.0,
      node.frequency.out,
      node.phaseParam.out,
      hasReset ? g.mixReset[f] : 0.0,
      sr,
      node.shape.out
    );
    const double y = soemdsp_phosphillator_y(node.nativeHandle);
    xy_amp(node, f, x, y);
  }
}

// Master Clock / transport: tempo square.
// -1..1→Mono, 0..1→Left, Trigger→Right, f (Hz)→Saw.
// Trigger = rising edge of unipolar high (node.lastReset = wasHigh latch).
static void process_transport(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double amplitude = node.amplitude.out;
  const double divisions = node.stages.out;
  const double tempoBpm = node.tempoBpm.out;
  bool wasHigh = node.lastReset > 0.5;
  for (int f = 0; f < frames; f++) {
    const double bipolar = soemdsp_transport_sample(
      node.nativeHandle, amplitude, divisions, tempoBpm, sr
    );
    const double unipolar = soemdsp_transport_unipolar(node.nativeHandle);
    const double freqHz = soemdsp_transport_frequency(node.nativeHandle);
    const bool isHigh = unipolar > 0.0;
    const double trigger = (isHigh && !wasHigh) ? amplitude : 0.0;
    wasHigh = isHigh;
    node.buf[kPortMono][f] = bipolar;
    node.buf[kPortLeft][f] = unipolar;
    node.buf[kPortRight][f] = trigger;
    node.buf[kPortSaw][f] = freqHz;
  }
  node.lastReset = wasHigh ? 1.0 : 0.0;
}

// Step sequencer: Trigger+Reset → Out (Mono) + Gate (Left). Steps on laneVol/Bias.
static void process_step_sequencer(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double threshold = node.center.out;
  const double steps = node.stages.out;
  const double level = node.amplitude.out;
  const double v0 = node.laneVol[0].out;
  const double v1 = node.laneVol[1].out;
  const double v2 = node.laneVol[2].out;
  const double v3 = node.laneVol[3].out;
  const double v4 = node.laneBias[0].out;
  const double v5 = node.laneBias[1].out;
  const double v6 = node.laneBias[2].out;
  const double v7 = node.laneBias[3].out;
  for (int f = 0; f < frames; f++) {
    const double out = soemdsp_step_sequencer_sample(
      node.nativeHandle,
      hasTrig ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      threshold,
      steps,
      level,
      v0, v1, v2, v3, v4, v5, v6, v7
    );
    const double gate = soemdsp_step_sequencer_gate(node.nativeHandle);
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = gate;
    node.buf[kPortRight][f] = out;
  }
}

// Pump Limiter: look-ahead + threshold/ratio GR. Sidechain on Morph bus when wired.
// Out=mono avg, L/R wet, Gain on Saw, Env on Ramp.
static void process_pump_limiter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const bool hasSc = mix_live_port(g, node, kPortMorph, frames, g.mixMorph);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double inputGainDb = node.gainDb.out;
  const double thresholdDb = node.laneBias[1].out;
  const double ratio = node.width.out;
  const double lookaheadMs = node.timeNumerator.out;
  const double lookaheadSamples = node.timeDenominator.out;
  const double attackMs = node.offsetMs.out;
  const double releaseMs = node.laneBias[0].out;
  const double lookaheadEnabled = node.mode.out;
  const double amplitude = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    const double l = g.mixMono[f] + g.mixLeft[f];
    const double r = g.mixMono[f] + g.mixRight[f];
    const double sc = hasSc ? g.mixMorph[f] : 0.0;
    const double monoOut = soemdsp_pumping_limiter_sample(
      node.nativeHandle,
      l,
      r,
      sc,
      hasSc ? 1 : 0,
      inputGainDb,
      thresholdDb,
      ratio,
      lookaheadMs,
      lookaheadSamples,
      attackMs,
      releaseMs,
      sr,
      lookaheadEnabled,
      amplitude
    );
    node.buf[kPortMono][f] = monoOut;
    node.buf[kPortLeft][f] = soemdsp_pumping_limiter_left(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_pumping_limiter_right(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_pumping_limiter_gain(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_pumping_limiter_env(node.nativeHandle);
  }
}

// Music Player — PCM-backed; host uploads via set_pcm + l_ptr/r_ptr.
// Params: mode=transport, frequency≈speed, timeNum/Den=start/end,
// amplitude, phaseParam=phaseOffset, shape=phase skip, seed=playlistScrub,
// stages=antialias, level unused.
static void process_audio_player(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool hasSpeed = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool hasPhase = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  // Sample-accurate Internal glides for ◀◀▶▶ / Scratch / playlist scrub.
  const bool controlSmoothing = node.phaseParam.active || node.shape.active
    || node.seed.active || node.frequency.active || node.amplitude.active
    || node.timeNumerator.active || node.timeDenominator.active;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) {
      Control* chase[] = {
        &node.phaseParam, &node.shape, &node.seed, &node.frequency, &node.amplitude,
        &node.timeNumerator, &node.timeDenominator
      };
      for (unsigned ci = 0; ci < sizeof(chase) / sizeof(chase[0]); ci += 1) {
        Control* c = chase[ci];
        if (c && c->active && !c->snap) {
          control_step(*c, g);
          c->blockStepped = 1;
        }
      }
    }
    const double reset = hasReset ? g.mixReset[f] : 0.0;
    const double speedCv = hasSpeed ? g.mixPitch[f] : 0.0;
    const double phaseCv = hasPhase ? g.mixIncrement[f] : 0.0;
    const double mono = soemdsp_audio_player_sample(
      node.nativeHandle,
      reset,
      speedCv,
      phaseCv,
      hasPhase ? 1 : 0,
      node.mode.out,
      node.frequency.out,
      node.timeNumerator.out,
      node.timeDenominator.out,
      node.amplitude.out,
      node.phaseParam.out,
      node.shape.out,
      node.seed.out,
      node.stages.out,
      sr
    );
    node.buf[kPortMono][f] = mono;
    node.buf[kPortLeft][f] = soemdsp_audio_player_left(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_audio_player_right(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_audio_player_phase(node.nativeHandle);
    node.buf[kPortRamp][f] = soemdsp_audio_player_trigger(node.nativeHandle);
  }
}

// Lookahead brickwall: true stereo L/R rings + linked GR. Mono In folds into both sides.
// Out=mono avg, Left/Right wet, Gain on Saw tap.
static void process_lookahead_limiter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double ceilingDb = node.gainDb.out;
  const double lookaheadMs = node.timeNumerator.out;
  const double lookaheadSamples = node.timeDenominator.out;
  const double attackMs = node.offsetMs.out;
  const double releaseMs = node.laneBias[0].out;
  const double lookaheadEnabled = node.mode.out;
  const double gainCompensation = node.timingMode.out;
  const double dipGain = node.laneBias[1].out;
  for (int f = 0; f < frames; f++) {
    const double l = g.mixMono[f] + g.mixLeft[f];
    const double r = g.mixMono[f] + g.mixRight[f];
    const double monoOut = soemdsp_lookahead_limiter_sample(
      node.nativeHandle,
      l,
      r,
      ceilingDb,
      lookaheadMs,
      lookaheadSamples,
      attackMs,
      releaseMs,
      sr,
      lookaheadEnabled,
      gainCompensation,
      dipGain
    );
    node.buf[kPortMono][f] = monoOut;
    node.buf[kPortLeft][f] = soemdsp_lookahead_limiter_left(node.nativeHandle);
    node.buf[kPortRight][f] = soemdsp_lookahead_limiter_right(node.nativeHandle);
    node.buf[kPortSaw][f] = soemdsp_lookahead_limiter_gain(node.nativeHandle);
  }
}

// Metallic mean: Ratio = (n + sqrt(n^2+4))/2. Free-function; fan M/L/R.
static void process_metallic_ratio(Circuit& g, Node& node, int frames) {
  const double index = node.width.out;
  const double ratio = soemdsp_metallic_ratio_sample(index);
  for (int f = 0; f < frames; f++) {
    node.buf[kPortMono][f] = ratio;
    node.buf[kPortLeft][f] = ratio;
    node.buf[kPortRight][f] = ratio;
  }
}

// Harmonic Series: ƒ = base × mult(harmonic + offset); ƒ0 = base unchanged.
// Wired ƒ cancels Frequency. Mono=ƒ, Left=ƒ0, Right fans ƒ.
static void process_harmonic_series(Circuit& g, Node& node, int frames) {
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const double harmonic = node.width.out;
  const double offset = node.center.out;
  const double knobHz = node.frequency.out;
  if (!liveF) {
    const double hz = soemdsp_harmonic_series_sample(knobHz, harmonic, offset);
    for (int f = 0; f < frames; f++) {
      node.buf[kPortMono][f] = hz;
      node.buf[kPortLeft][f] = knobHz;
      node.buf[kPortRight][f] = hz;
    }
    return;
  }
  for (int f = 0; f < frames; f++) {
    const double base = g.mixF[f];
    const double hz = soemdsp_harmonic_series_sample(base, harmonic, offset);
    node.buf[kPortMono][f] = hz;
    node.buf[kPortLeft][f] = base;
    node.buf[kPortRight][f] = hz;
  }
}

// LUT cell: A/B/C/D on buses 0–3, Clock on Trigger dest; Out→Mono, Q→Left.
static void process_lut_cell(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  double a[kMaxBlockFrames], b[kMaxBlockFrames], c[kMaxBlockFrames], d[kMaxBlockFrames];
  mix_live_port(g, node, kPortMono, frames, a);
  mix_live_port(g, node, kPortLeft, frames, b);
  mix_live_port(g, node, kPortRight, frames, c);
  mix_live_port(g, node, kPortSaw, frames, d);
  const bool hasClk = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const double truth = node.seed.out;
  for (int f = 0; f < frames; f++) {
    const double clk = hasClk ? g.mixTrigger[f] : 0.0;
    const int comb = soemdsp_lut_cell_sample(
      node.nativeHandle, a[f], b[f], c[f], d[f], clk, truth
    );
    const double out = comb ? 1.0 : 0.0;
    const double q = soemdsp_lut_cell_q(node.nativeHandle) ? 1.0 : 0.0;
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = q;
    node.buf[kPortRight][f] = out;
  }
}

// Random clock: Reset live port; Trigger→Mono, Gate→Left (fan Right=Trigger).
static void process_random_clock(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double threshold = node.center.out;
  const double minSec = node.timeNumerator.out;
  const double maxSec = node.timeDenominator.out;
  const double duty = node.shape.out;
  const double triggerTime = node.offsetMs.out;
  const double level = node.amplitude.out;
  const int seedKey = (int)(node.seed.out + (node.seed.out >= 0.0 ? 0.5 : -0.5));
  for (int f = 0; f < frames; f++) {
    const double trig = soemdsp_random_clock_sample(
      node.nativeHandle,
      hasReset ? g.mixReset[f] : 0.0,
      threshold,
      minSec,
      maxSec,
      duty,
      triggerTime,
      level,
      sr,
      seedKey
    );
    const double gate = soemdsp_random_clock_gate(node.nativeHandle);
    node.buf[kPortMono][f] = trig;
    node.buf[kPortLeft][f] = gate;
    node.buf[kPortRight][f] = trig;
  }
}

// Trigger counter: Trigger+Reset → Pulse (Mono) + Count (Left).
static void process_trigger_counter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double threshold = node.center.out;
  const double countMax = node.stages.out;
  const double increment = node.width.out;
  const double pulseTime = node.timeNumerator.out;
  const double level = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    const double pulse = soemdsp_trigger_counter_sample(
      node.nativeHandle,
      hasTrig ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      threshold,
      countMax,
      increment,
      pulseTime,
      level,
      sr
    );
    node.buf[kPortMono][f] = pulse;
    node.buf[kPortLeft][f] = soemdsp_trigger_counter_count(node.nativeHandle);
    node.buf[kPortRight][f] = pulse;
  }
}

// Delayed trigger: Trigger + Reset → Out after delay (fan M/L/R).
static void process_delayed_trigger(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const bool hasReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double threshold = node.center.out;
  const double delay = node.timeNumerator.out;
  const double pulseTime = node.timeDenominator.out;
  const double level = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    const double out = soemdsp_delayed_trigger_sample(
      node.nativeHandle,
      hasTrig ? g.mixTrigger[f] : 0.0,
      hasReset ? g.mixReset[f] : 0.0,
      threshold,
      delay,
      pulseTime,
      level,
      sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Mid/Side encode: L/R in → Mid/Side out (true stereo matrix, free-function).
static void process_mid_side_encode(Circuit& g, Node& node, int frames) {
  double left[kMaxBlockFrames];
  double right[kMaxBlockFrames];
  mix_live_port(g, node, kPortLeft, frames, left);
  mix_live_port(g, node, kPortRight, frames, right);
  const double midGain = node.gainDb.out;
  const double sideGain = node.gainLeftDb.out;
  for (int f = 0; f < frames; f++) {
    node.buf[kPortMono][f] = soemdsp_mid_side_encode_sample(
      0.0, left[f], right[f], midGain, sideGain
    );
    node.buf[kPortLeft][f] = soemdsp_mid_side_encode_sample(
      1.0, left[f], right[f], midGain, sideGain
    );
  }
}

// Vectorscope: L/R → X/Y after classic 45° + Rotate (degrees).
static void process_vectorscope_transform(Circuit& g, Node& node, int frames) {
  double left[kMaxBlockFrames];
  double right[kMaxBlockFrames];
  mix_live_port(g, node, kPortLeft, frames, left);
  mix_live_port(g, node, kPortRight, frames, right);
  const double rotateDeg = node.laneBias[0].out;
  for (int f = 0; f < frames; f++) {
    node.buf[kPortMono][f] = soemdsp_vectorscope_transform_sample(
      0.0, left[f], right[f], rotateDeg
    );
    node.buf[kPortLeft][f] = soemdsp_vectorscope_transform_sample(
      1.0, left[f], right[f], rotateDeg
    );
  }
}

// 3D rotate then project to 2D: X/Y/Z in → X/Y out. Angles in cycles.
static void process_rotate_3d_to_2d(Circuit& g, Node& node, int frames) {
  double xIn[kMaxBlockFrames];
  double yIn[kMaxBlockFrames];
  double zIn[kMaxBlockFrames];
  mix_live_port(g, node, kPortMono, frames, xIn);
  mix_live_port(g, node, kPortLeft, frames, yIn);
  mix_live_port(g, node, kPortRight, frames, zIn);
  const double rx = node.laneBias[0].out;
  const double ry = node.laneBias[1].out;
  const double rz = node.laneBias[2].out;
  for (int f = 0; f < frames; f++) {
    node.buf[kPortMono][f] = soemdsp_rotate_3d_to_2d_sample(
      0.0, xIn[f], yIn[f], zIn[f], rx, ry, rz
    );
    node.buf[kPortLeft][f] = soemdsp_rotate_3d_to_2d_sample(
      1.0, xIn[f], yIn[f], zIn[f], rx, ry, rz
    );
  }
}


static bool is_crossover_type(int typeId) {
  return typeId >= kTypeCrossover2 && typeId <= kTypeCrossover6;
}

static int crossover_band_count_for_type(int typeId) {
  if (!is_crossover_type(typeId)) return 2;
  return 2 + (typeId - kTypeCrossover2);
}

// Stereo LR crossover: Mono+L/R in; per-band L/R on sequential ports
// (band0 L/R = 0/1, band1 L/R = 2/3, …). Splits: frequency,center,width,lpf,hpf.
// stages = LR order (2/4/8). Live ƒ overrides first split when wired.
static void process_crossover(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node)
    || node.lpfFrequency.active || node.hpfFrequency.active;
  const int bands = crossover_band_count_for_type(node.typeId);
  const double amp = node.amplitude.out;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double f0 = liveF ? g.mixF[f] : node.frequency.out;
    double f1 = node.center.out;
    double f2 = node.width.out;
    double f3 = node.lpfFrequency.out;
    double f4 = node.hpfFrequency.out;
    if (!(f0 == f0) || f0 < 20.0) f0 = 20.0;
    if (!(f1 == f1) || f1 < 20.0) f1 = 20.0;
    if (!(f2 == f2) || f2 < 20.0) f2 = 20.0;
    if (!(f3 == f3) || f3 < 20.0) f3 = 20.0;
    if (!(f4 == f4) || f4 < 20.0) f4 = 20.0;
    int order = (int)(node.stages.out + (node.stages.out >= 0.0 ? 0.5 : -0.5));
    if (order <= 2) order = 2;
    else if (order <= 4) order = 4;
    else order = 8;
    soemdsp_crossover_sample(
      node.nativeHandle,
      g.mixMono[f], g.mixLeft[f], g.mixRight[f],
      f0, f1, f2, f3, f4, order, sr
    );
    for (int b = 0; b < bands; b++) {
      const int pl = b * 2;
      const int pr = pl + 1;
      if (pl < kChannels) {
        node.buf[pl][f] = soemdsp_crossover_band_l(node.nativeHandle, b) * amp;
      }
      if (pr < kChannels) {
        node.buf[pr][f] = soemdsp_crossover_band_r(node.nativeHandle, b) * amp;
      }
    }
  }
}

// mixStereo: true stereo summer (native already L/R). Mono + 4 pairs; R4 on aux port 21.
static void process_mix_stereo(Circuit& g, Node& node, int frames) {
  double mono[kMaxBlockFrames];
  double l1[kMaxBlockFrames], r1[kMaxBlockFrames];
  double l2[kMaxBlockFrames], r2[kMaxBlockFrames];
  double l3[kMaxBlockFrames], r3[kMaxBlockFrames];
  double l4[kMaxBlockFrames], r4[kMaxBlockFrames];
  mix_live_port(g, node, kPortMono, frames, mono);
  mix_live_port(g, node, kPortLeft, frames, l1);
  mix_live_port(g, node, kPortRight, frames, r1);
  mix_live_port(g, node, 3, frames, l2);
  mix_live_port(g, node, 4, frames, r2);
  mix_live_port(g, node, 5, frames, l3);
  mix_live_port(g, node, 6, frames, r3);
  mix_live_port(g, node, 7, frames, l4);
  mix_live_port(g, node, kPortMixStereoR4, frames, r4);
  const double vol1 = node.laneVol[0].out;
  const double vol2 = node.laneVol[1].out;
  const double vol3 = node.laneVol[2].out;
  const double vol4 = node.laneVol[3].out;
  const double pan1 = node.laneBias[0].out;
  const double pan2 = node.laneBias[1].out;
  const double pan3 = node.laneBias[2].out;
  const double pan4 = node.laneBias[3].out;
  const double amp = node.volumeDb.out; // Amplitude (All) in dB
  for (int f = 0; f < frames; f++) {
    node.buf[kPortMono][f] = soemdsp_mix_stereo_sample(
      0.0,
      l1[f], r1[f], l2[f], r2[f], l3[f], r3[f], l4[f], r4[f], mono[f],
      vol1, pan1, vol2, pan2, vol3, pan3, vol4, pan4, amp
    );
    node.buf[kPortLeft][f] = soemdsp_mix_stereo_sample(
      1.0,
      l1[f], r1[f], l2[f], r2[f], l3[f], r3[f], l4[f], r4[f], mono[f],
      vol1, pan1, vol2, pan2, vol3, pan3, vol4, pan4, amp
    );
    node.buf[kPortRight][f] = soemdsp_mix_stereo_sample(
      2.0,
      l1[f], r1[f], l2[f], r2[f], l3[f], r3[f], l4[f], r4[f], mono[f],
      vol1, pan1, vol2, pan2, vol3, pan3, vol4, pan4, amp
    );
  }
}

// Mono sample & hold: fold Mono+L+R for In; Trigger is a live-style dest port.
// One handle per node (not invented M/L/R inside native). Seed = node id hash.
static void process_sample_hold(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const bool hasTrig = mix_live_port(g, node, kPortTrigger, frames, g.mixTrigger);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double threshold = node.center.out;
  const double sampleFreq = node.frequency.out;
  const int seed = (int)node.idHash;
  // hasInConnected: any audio bus cable (Trigger alone does not count).
  bool hasIn = false;
  for (int ci = 0; ci < g.connCount; ci++) {
    const Conn& c = g.conns[ci];
    if (!c.used || c.dstHash != node.idHash) continue;
    const int dp = clamp_dst_port(c.dstPort);
    if (is_live_dst_port(dp) || is_graph_port(dp)) continue;
    hasIn = true;
    break;
  }
  for (int f = 0; f < frames; f++) {
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double trig = hasTrig ? g.mixTrigger[f] : 0.0;
    const double out = soemdsp_sample_hold_sample(
      node.nativeHandle,
      in,
      trig,
      threshold,
      sampleFreq,
      sr,
      hasIn ? 1 : 0,
      seed
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// Mono sample delay: fold Mono+L+R → ring → Delayed (fan M/L/R) + Thru (tap 3).
// Native is mono-per-handle with a fixed ring — do not invent stereo rings.
static void process_sample_delay(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const double timeSec = node.timeNumerator.out;
  const double samples = node.timeDenominator.out;
  for (int f = 0; f < frames; f++) {
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double delayed = soemdsp_sample_delay_sample(
      node.nativeHandle, in, timeSec, samples, sr
    );
    node.buf[kPortDelayDelayed][f] = delayed;
    node.buf[kPortLeft][f] = delayed;
    node.buf[kPortRight][f] = delayed;
    node.buf[kPortDelayThru][f] = in;
  }
}

// Mono edge detector: fold Mono+L+R → sample → named outs on tap slots.
// Native is mono-per-handle; Thru on Mono, Up/Down/Change/Steady/Sign on 3–7.
static void process_comparator(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    soemdsp_comparator_sample(node.nativeHandle, in);
    node.buf[kPortCmpThru][f] = soemdsp_comparator_thru(node.nativeHandle);
    node.buf[kPortCmpUp][f] = soemdsp_comparator_up(node.nativeHandle);
    node.buf[kPortCmpDown][f] = soemdsp_comparator_down(node.nativeHandle);
    node.buf[kPortCmpChange][f] = soemdsp_comparator_change(node.nativeHandle);
    node.buf[kPortCmpSteady][f] = soemdsp_comparator_steady(node.nativeHandle);
    node.buf[kPortCmpSign][f] = soemdsp_comparator_sign(node.nativeHandle);
  }
}

// Mono utility: fold Mono+L+R → one slew channel → fan Out to Mono/Left/Right.
// Native is mono-per-handle (same as original); do not invent stereo inside C++.
static void process_slew_limiter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  double* inPtr = ptr_from_export(soemdsp_slew_limiter_block_input_ptr(node.nativeHandle));
  if (!inPtr) return;
  for (int f = 0; f < frames; f++) {
    inPtr[f] = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
  }
  // timeNumerator=upTime, timeDenominator=downTime, shape=shape, offset=bias
  soemdsp_slew_limiter_process_block(
    node.nativeHandle,
    node.timeNumerator.out,
    node.timeDenominator.out,
    node.shape.out,
    node.offset.out,
    (double)sr,
    frames
  );
  double* outPtr = ptr_from_export(soemdsp_slew_limiter_block_output_ptr(node.nativeHandle));
  if (!outPtr) return;
  copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
  copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
  copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
}

// Bias: out = in + offset (Control `offset`, same slot as attenuverter DC).
static void process_bias(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  const double bias = node.offset.out;
  for (int f = 0; f < frames; f++) {
    const double out = (g.mixMono[f] + g.mixLeft[f] + g.mixRight[f]) + bias;
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

static void process_robin_sinusoid(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double amp = node.amplitude.out;
  const double phase0 = node.phaseParam.out * kTwoPi;
  if (!liveF && !liveReset) {
    const double freq = clamp_hz_nyquist(node.frequency.out, srD);
    soemdsp_robin_sinusoid_process_block(
      node.nativeHandle, freq, amp, srD, phase0, 0.0, frames
    );
    double* outPtr = ptr_from_export(soemdsp_robin_sinusoid_block_output_ptr(node.nativeHandle));
    if (!outPtr) return;
    copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
    copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
    copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
    return;
  }
  if (!liveReset) node.lastReset = 0.0;
  for (int f = 0; f < frames; f++) {
    double resetGate = 0.0;
    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) resetGate = 1.0;
      node.lastReset = rv;
    }
    const double freq = liveF
      ? clamp_hz_nyquist(g.mixF[f], srD)
      : clamp_hz_nyquist(node.frequency.out, srD);
    const double y = soemdsp_robin_sinusoid_sample(
      node.nativeHandle, freq, amp, srD, phase0, resetGate
    );
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
  }
}

static void process_robin_supersaw(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double amp = node.amplitude.out;
  const double detune = node.width.out; // detune cents
  int voices = (int)(node.stages.out + (node.stages.out >= 0.0 ? 0.5 : -0.5));
  if (voices < 1) voices = 1;
  if (voices > 9) voices = 9;
  const double referenceVoltage = 48.0 / 120.0;

  if (!liveF && !livePitch) {
    const double freq = clamp_hz_nyquist(node.frequency.out, srD);
    soemdsp_robin_supersaw_process_block(
      node.nativeHandle, freq, srD, detune, voices, amp, frames
    );
    double* outL = ptr_from_export(soemdsp_robin_supersaw_block_output_left_ptr(node.nativeHandle));
    double* outR = ptr_from_export(soemdsp_robin_supersaw_block_output_right_ptr(node.nativeHandle));
    double* outM = ptr_from_export(soemdsp_robin_supersaw_block_output_mono_ptr(node.nativeHandle));
    if (!outL || !outR) return;
    copy_tap_to_buf(node.buf[kPortLeft], outL, frames);
    copy_tap_to_buf(node.buf[kPortRight], outR, frames);
    if (outM) copy_tap_to_buf(node.buf[kPortMono], outM, frames);
    else {
      for (int f = 0; f < frames; f++) {
        node.buf[kPortMono][f] = 0.5 * (outL[f] + outR[f]);
      }
    }
    return;
  }

  // Live ƒ / pitch: fall back to process_block with per-block freq from first
  // live sample (block-rate). Full sample-accurate path can come later.
  double freq = node.frequency.out;
  if (liveF) freq = g.mixF[0];
  else if (livePitch) freq = pitched_hz(node.frequency.out, g.mixPitch[0], referenceVoltage);
  freq = clamp_hz_nyquist(freq, srD);
  soemdsp_robin_supersaw_process_block(
    node.nativeHandle, freq, srD, detune, voices, amp, frames
  );
  double* outL = ptr_from_export(soemdsp_robin_supersaw_block_output_left_ptr(node.nativeHandle));
  double* outR = ptr_from_export(soemdsp_robin_supersaw_block_output_right_ptr(node.nativeHandle));
  double* outM = ptr_from_export(soemdsp_robin_supersaw_block_output_mono_ptr(node.nativeHandle));
  if (!outL || !outR) return;
  copy_tap_to_buf(node.buf[kPortLeft], outL, frames);
  copy_tap_to_buf(node.buf[kPortRight], outR, frames);
  if (outM) copy_tap_to_buf(node.buf[kPortMono], outM, frames);
  else {
    for (int f = 0; f < frames; f++) {
      node.buf[kPortMono][f] = 0.5 * (outL[f] + outR[f]);
    }
  }
}

// Noise generator source — stereo block outs; no audio inputs.
static void process_noise_generator(Circuit& g, Node& node, int frames) {
  (void)g;
  if (node.nativeHandle <= 0) return;
  const int mode = (int)(node.mode.out + (node.mode.out >= 0.0 ? 0.5 : -0.5));
  soemdsp_noise_generator_process_block(
    node.nativeHandle,
    node.seed.out,
    mode,
    node.offset.out,   // mean
    node.width.out,    // deviation
    node.shape.out,
    node.amplitude.out,
    frames,
    1
  );
  double* outL = ptr_from_export(soemdsp_noise_generator_block_output_left_ptr(node.nativeHandle));
  double* outR = ptr_from_export(soemdsp_noise_generator_block_output_right_ptr(node.nativeHandle));
  if (!outL || !outR) return;
  copy_tap_to_buf(node.buf[kPortLeft], outL, frames);
  copy_tap_to_buf(node.buf[kPortRight], outR, frames);
  for (int f = 0; f < frames; f++) {
    node.buf[kPortMono][f] = 0.5 * (outL[f] + outR[f]);
  }
}

// Gain: soemdsp_gain_sample (master/L/R dB, mono-sum law, offset).
static void process_gain(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  const double masterDb = node.gainDb.out;
  const double leftDb = node.gainLeftDb.out;
  const double rightDb = node.gainRightDb.out;
  const double monoSum = node.gainMonoSum.out;
  const double off = node.offset.out;
  for (int f = 0; f < frames; f++) {
    const double mono = g.mixMono[f];
    const double left = g.mixLeft[f];
    const double right = g.mixRight[f];
    node.buf[kPortMono][f] = soemdsp_gain_sample(
      0.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
    node.buf[kPortLeft][f] = soemdsp_gain_sample(
      1.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
    node.buf[kPortRight][f] = soemdsp_gain_sample(
      2.0, mono, left, right, masterDb, leftDb, rightDb, monoSum, off
    );
  }
}

static void process_output(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  float gL = 1.0f, gR = 1.0f;
  pan_gains((float)node.pan.out, &gL, &gR);
  const float vol = db_to_lin((float)node.volumeDb.out);
  for (int f = 0; f < frames; f++) {
    const double m = g.mixMono[f];
    const double l = (m + g.mixLeft[f]) * (double)vol * (double)gL;
    const double r = (m + g.mixRight[f]) * (double)vol * (double)gR;
    node.buf[kPortMono][f] = m * (double)vol;
    node.buf[kPortLeft][f] = l;
    node.buf[kPortRight][f] = r;
    g.outL[f] += l;
    g.outR[f] += r;
  }
}

// Portal outlet: local M/L/R thru + auto-sum into speaker bus (JS portalMixOutlets).
static void process_portal_outlet(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  bool hasMonoIn = false, hasLeftIn = false, hasRightIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  (void)monoOutWired;
  for (int f = 0; f < frames; f++) {
    const double m = hasMonoIn ? g.mixMono[f] : 0.0;
    const double lIn = hasLeftIn ? g.mixLeft[f] : 0.0;
    const double rIn = hasRightIn ? g.mixRight[f] : 0.0;
    const double left = (hasMonoIn ? m : 0.0) + (hasLeftIn ? lIn : 0.0);
    const double right = (hasMonoIn ? m : 0.0) + (hasRightIn ? rIn : 0.0);
    double mid = 0.0;
    if (hasMonoIn && hasLeftIn && hasRightIn) {
      mid = m + (lIn + rIn) * 0.5;
    } else if (hasLeftIn && hasRightIn) {
      mid = (left + right) * 0.5;
    } else if (hasMonoIn) {
      mid = m;
    } else if (hasLeftIn) {
      mid = left;
    } else {
      mid = right;
    }
    node.buf[kPortMono][f] = mid;
    node.buf[kPortLeft][f] = left;
    node.buf[kPortRight][f] = right;
    g.outL[f] += left;
    g.outR[f] += right;
  }
}

// Portal inlet: wired →/← thru mix; live mic bus not in graph_engine yet (silence addend).
static void process_portal_inlet(Circuit& g, Node& node, int frames) {
  mix_node_inputs(g, node, frames);
  bool hasMonoIn = false, hasLeftIn = false, hasRightIn = false, monoOutWired = false;
  probe_mlr_cables(g, node, &hasMonoIn, &hasLeftIn, &hasRightIn, &monoOutWired);
  (void)monoOutWired;
  for (int f = 0; f < frames; f++) {
    const double m = hasMonoIn ? g.mixMono[f] : 0.0;
    const double lIn = hasLeftIn ? g.mixLeft[f] : 0.0;
    const double rIn = hasRightIn ? g.mixRight[f] : 0.0;
    const double left = (hasMonoIn ? m : 0.0) + (hasLeftIn ? lIn : 0.0);
    const double right = (hasMonoIn ? m : 0.0) + (hasRightIn ? rIn : 0.0);
    double mid = 0.0;
    if (hasMonoIn && hasLeftIn && hasRightIn) {
      mid = m + (lIn + rIn) * 0.5;
    } else if (hasLeftIn && hasRightIn) {
      mid = (left + right) * 0.5;
    } else if (hasMonoIn) {
      mid = m;
    } else if (hasLeftIn) {
      mid = left;
    } else {
      mid = right;
    }
    node.buf[kPortMono][f] = mid;
    node.buf[kPortLeft][f] = left;
    node.buf[kPortRight][f] = right;
  }
}

// Bypass: route dry audio (or silence for sources). Do NOT call native
// process_block / reset — tails and filter state stay warm.
static void process_bypass(Circuit& g, Node& node, int frames) {
  if (
    node.typeId == kTypePolyBlep
    || node.typeId == kTypeNoiseGenerator
    || node.typeId == kTypeRobinSinusoid
    || node.typeId == kTypeRobinSupersaw
    || node.typeId == kTypeClock
    || node.typeId == kTypeRandomClock
    || node.typeId == kTypeMetallicRatio
    || node.typeId == kTypeHarmonicSeries
    || node.typeId == kTypeTransport
    || node.typeId == kTypeAliasSine
    || node.typeId == kTypePhoneTone
    || node.typeId == kTypeAudioInput
    || node.typeId == kTypePortalInlet
    || node.typeId == kTypeBlit
    || node.typeId == kTypeSineWavetable
    || node.typeId == kTypeAntisaw
    || node.typeId == kTypeArchimedes
    || node.typeId == kTypeAdditiveOsc
    || node.typeId == kTypeAdditiveGenerator
    || node.typeId == kTypeAdditiveOut
    || node.typeId == kTypeSurgeOscillator
    || node.typeId == kTypeSoftwaveOsc
    || node.typeId == kTypeDsfOscillator
    || node.typeId == kTypeHypersaw
    || node.typeId == kTypeSinc
    || node.typeId == kTypeBradley2a
    || node.typeId == kTypeEllipsoid
    || node.typeId == kTypeSnowflake
  ) {
    return; // sources: silence
  }
  if (node.typeId == kTypeOutput) {
    process_output(g, node, frames);
    return;
  }
  mix_node_inputs(g, node, frames);
  for (int f = 0; f < frames; f++) {
    const double mono = g.mixMono[f];
    const double left = mono + g.mixLeft[f];
    const double right = mono + g.mixRight[f];
    node.buf[kPortMono][f] = mono + g.mixLeft[f] + g.mixRight[f];
    node.buf[kPortLeft][f] = left;
    node.buf[kPortRight][f] = right;
    if (node.typeId == kTypeReverbEffect) {
      // Dry + Mix both carry dry while bypassed (JS reverb bypass policy).
      node.buf[kPortDryL][f] = left;
      node.buf[kPortDryR][f] = right;
    }
  }
}

}  // namespace

extern "C" int soemdsp_graph_create() {
  for (int i = 0; i < kMaxInstances; i++) {
    if (!gPool[i].active) {
      gPool[i].active = true;
      gPool[i].sampleRate = 44100.0f;
      gPool[i].globalTimeSamples = kDefaultSmoothSeconds * 44100.0;
      gPool[i].nodeCount = 0;
      gPool[i].toSmoothCount = 0;
      clear_graph_contents(gPool[i]);
      return i + 1;
    }
  }
  return 0;
}

extern "C" void soemdsp_graph_destroy(int handle) {
  Circuit* g = get(handle);
  if (!g) {
    if (handle >= 1 && handle <= kMaxInstances) {
      gPool[handle - 1].active = false;
    }
    return;
  }
  clear_graph_contents(*g);
  g->active = false;
}

extern "C" void soemdsp_graph_clear(int handle) {
  Circuit* g = get(handle);
  if (!g) return;
  clear_graph_contents(*g);
}

extern "C" void soemdsp_graph_set_sample_rate(int handle, float sampleRate) {
  Circuit* g = get(handle);
  if (!g) return;
  if (!(sampleRate == sampleRate) || sampleRate < 1.0f) sampleRate = 44100.0f;
  g->sampleRate = sampleRate;
  // Coeff depends on SR (and default time-in-samples resolution).
  dirty_all_control_coeffs(*g);
  for (int i = 0; i < g->nodeCount; i++) {
    Node& n = g->nodes[i];
    if (!n.used || n.nativeHandle <= 0) continue;
    if (n.nativeKind == kTypeReverbEffect) {
      soemdsp_sabrina_reverb_reset(n.nativeHandle, (double)sampleRate);
    } else if (n.nativeKind == kTypePingPongDelay) {
      soemdsp_ping_pong_delay_reset(n.nativeHandle);
    } else if (n.nativeKind == kTypeSoemReverb) {
      soemdsp_soem_reverb_reset(n.nativeHandle);
    } else if (n.nativeKind == kTypePll) {
      soemdsp_pll_reset(n.nativeHandle, (double)sampleRate);
    }
  }
}

extern "C" int soemdsp_graph_add_node(int handle, unsigned int nodeIdHash, int typeId) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->compiled = false;
  if (nodeIdHash == 0) return -2;
  if (find_node(*g, nodeIdHash) >= 0) return -3;
  if (g->nodeCount >= kMaxNodes) return -4;
  if (typeId < 0) typeId = kTypeUnknown;

  Node& n = g->nodes[g->nodeCount];
  n.used = true;
  n.idHash = nodeIdHash;
  init_node_defaults(n, typeId);
  for (int c = 0; c < kChannels; c++) zero_buf(n.buf[c], kMaxBlockFrames);

  const bool needsNative =
    typeId == kTypePolyBlep
    || typeId == kTypeLadderFilter
    || typeId == kTypeSoftClipper
    || typeId == kTypeReverbEffect
    || typeId == kTypePingPongDelay
    || typeId == kTypeAttenuverter
    || typeId == kTypeRange
    || typeId == kTypeNoiseGenerator
    || typeId == kTypeRobinSinusoid
    || typeId == kTypeRobinSupersaw
    || typeId == kTypeSlewLimiter
    || typeId == kTypeComparator
    || typeId == kTypeSampleDelay
    || typeId == kTypeSampleHold
    || typeId == kTypeMinMax
    || typeId == kTypeClipperLimiter
    || typeId == kTypeClock
    || typeId == kTypeTriggerDivider
    || typeId == kTypeDelayedTrigger
    || typeId == kTypeRandomClock
    || typeId == kTypeTriggerCounter
    || typeId == kTypeLutCell
    || typeId == kTypeLookaheadLimiter
    || typeId == kTypePumpLimiter
    || typeId == kTypeAudioPlayer
    || typeId == kTypeStepSequencer
    || typeId == kTypeTransport
    || typeId == kTypeAliasSine
    || typeId == kTypePhoneTone
    || typeId == kTypeBlit
    || typeId == kTypeSineWavetable
    || typeId == kTypeAntisaw
    || typeId == kTypeArchimedes
    || typeId == kTypeSurgeOscillator
    || typeId == kTypeSoftwaveOsc
    || typeId == kTypeDsfOscillator
    || typeId == kTypeHypersaw
    || typeId == kTypeSinc
    || typeId == kTypeBradley2a
    || typeId == kTypeSnowflake
    || typeId == kTypeButterworth
    || typeId == kTypeLinkwitzRiley
    || typeId == kTypeBessel
    || typeId == kTypePapoulisFilter
    || typeId == kTypeSpeakerProtection
    || typeId == kTypeSpeakerProtector2
    || typeId == kTypeAttackDecay
    || typeId == kTypeBandpass
    || typeId == kTypeAllpass
    || typeId == kTypeBasicShape
    || typeId == kTypeChordPad
    || typeId == kTypeNoteGlide
    || typeId == kTypeNoteTranspose
    || typeId == kTypeDegreeTuring
    || typeId == kTypeDegreePhrase
    || typeId == kTypeGravityWalker
    || typeId == kTypeChebyshev
    || typeId == kTypeElliptic
    || typeId == kTypeEqFilter
    || typeId == kTypeActiveFilter
    || typeId == kTypePassiveFilter
    || typeId == kTypeTb303Filter
    || typeId == kTypeFlowerChildFilter
    || typeId == kTypeYellowjacketFilter
    || typeId == kTypeSuperloveFilter
    || typeId == kTypeHumanFilter
    || typeId == kTypeResonatorFilter
    || typeId == kTypeCombResonator
    || typeId == kTypeModeResonator
    || typeId == kTypeChaoticPhaseLockingFilter
    || typeId == kTypeInertialFilter
    || typeId == kTypeExpAdsr
    || typeId == kTypeLinearEnvelope
    || typeId == kTypePluckEnvelope
    || typeId == kTypeFlowerChildEnvelopeFollower
    || typeId == kTypeDelayEffect
    || typeId == kTypeSoemReverb
    || typeId == kTypePll
    || typeId == kTypeLorenzAttractor
    || typeId == kTypeLogisticMap
    || typeId == kTypeHenonMap
    || typeId == kTypeChuaAttractor
    || typeId == kTypeRayBouncer
    || typeId == kTypeChordMemory
    || typeId == kTypeChordSequencer
    || typeId == kTypePitchQuantizer
    || typeId == kTypeTuringMachine
    || typeId == kTypeFractalBrownianNoise
    || typeId == kTypePiSpigotNoise
    || typeId == kTypeRandomWalk
    || typeId == kTypeCheapWalk
    || typeId == kTypePulseExplosion
    || typeId == kTypeSpiral
    || typeId == kTypeFractalSpiral
    || typeId == kTypeLogSpiral
    || typeId == kTypeBlubb
    || typeId == kTypeBoing
    || typeId == kTypeKeplerBouwkamp
    || typeId == kTypeMushroom
    || typeId == kTypeNyquistShannon
    || typeId == kTypeRadar
    || typeId == kTypeTorus
    || typeId == kTypeWirdoSpiral
    || typeId == kTypePhosphillator
    || (typeId >= kTypeCrossover2 && typeId <= kTypeCrossover6);
  // additiveOsc / ellipsoid / Yellow Graph A1 are free-fn (no native handle).
  if (needsNative) {
    n.nativeHandle = create_native_for_type(typeId, g->sampleRate);
    if (n.nativeHandle <= 0) {
      n.used = false;
      n.nativeKind = 0;
      return -5; // native instance pool exhausted
    }
    n.nativeKind = typeId;
    if (type_wants_mlr_native_handles(typeId)) {
      n.nativeHandleL = create_native_for_type(typeId, g->sampleRate);
      n.nativeHandleR = create_native_for_type(typeId, g->sampleRate);
      if (n.nativeHandleL <= 0 || n.nativeHandleR <= 0) {
        destroy_node_native(n);
        n.used = false;
        return -5;
      }
    }
    // Random Walk: second instance for independent Right lane.
    if (typeId == kTypeRandomWalk) {
      n.nativeHandleR = create_native_for_type(typeId, g->sampleRate);
      if (n.nativeHandleR <= 0) {
        destroy_node_native(n);
        n.used = false;
        return -5;
      }
    }
    if (typeId == kTypePolyBlep) {
      soemdsp_polyblep_reset(n.nativeHandle);
    } else if (typeId == kTypeRobinSinusoid) {
      soemdsp_robin_sinusoid_reset(n.nativeHandle);
    } else if (typeId == kTypeRobinSupersaw) {
      soemdsp_robin_supersaw_reset(n.nativeHandle);
    } else if (typeId == kTypeBlit) {
      soemdsp_blit_reset(n.nativeHandle);
    } else if (typeId == kTypeArchimedes) {
      soemdsp_archimedes_reset(n.nativeHandle);
      soemdsp_archimedes_reset_counters(n.nativeHandle);
    } else if (typeId == kTypeSurgeOscillator) {
      soemdsp_surge_oscillator_reset(n.nativeHandle);
    } else if (typeId == kTypeDsfOscillator) {
      soemdsp_dsf_oscillator_reset(n.nativeHandle);
    } else if (typeId == kTypeHypersaw) {
      soemdsp_hypersaw_reset(n.nativeHandle);
    } else if (typeId == kTypePhosphillator) {
      n.lastReset = -1.0; // seed default circle path on first process
    }
  }

  g->nodeCount += 1;
  return 0;
}

extern "C" int soemdsp_graph_connect(
  int handle,
  unsigned int srcHash,
  int srcPort,
  unsigned int dstHash,
  int dstPort
) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->compiled = false;
  if (find_node(*g, srcHash) < 0 || find_node(*g, dstHash) < 0) return -2;
  if (g->connCount >= kMaxConnections) return -3;
  Conn& c = g->conns[g->connCount];
  c.used = true;
  c.srcHash = srcHash;
  c.srcPort = clamp_src_port(srcPort);
  c.dstHash = dstHash;
  c.dstPort = clamp_dst_port(dstPort);
  g->connCount += 1;
  return 0;
}

extern "C" int soemdsp_graph_set_bypassed(int handle, unsigned int nodeHash, int bypassed) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  g->nodes[idx].bypassed = bypassed != 0;
  return 0;
}

extern "C" int soemdsp_graph_snap_controls(int handle) {
  Circuit* g = get(handle);
  if (!g) return -1;
  smoother_snap_all(*g);
  return 0;
}

extern "C" int soemdsp_graph_set_param(int handle, unsigned int nodeHash, int paramId, float value) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  if (!(value == value)) return 0;
  Control* c = control_for_param(g->nodes[idx], paramId);
  if (!c) return 0;
  control_set_target(*g, *c, (double)value);
  return 0;
}

extern "C" int soemdsp_graph_set_smooth_time(
  int handle, unsigned int nodeHash, int paramId, float timeSamples
) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  Control* c = control_for_param(g->nodes[idx], paramId);
  if (!c) return 0;
  control_set_time(*g, *c, (double)timeSamples);
  return 0;
}

extern "C" int soemdsp_graph_set_smooth_mode(
  int handle, unsigned int nodeHash, int paramId, int mode
) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  Control* c = control_for_param(g->nodes[idx], paramId);
  if (!c) return 0;
  unsigned char m = kSmoothModeInternal;
  if (mode == (int)kSmoothModeGlobal) m = kSmoothModeGlobal;
  else if (mode == (int)kSmoothModeInternalGlobal) m = kSmoothModeInternalGlobal;
  else if (mode == (int)kSmoothModeOff) m = kSmoothModeOff;
  c->mode = m;
  c->dirty = true;
  if (!c->snap && c->type != kSmoothTypeNone && dsp_fabs(c->out - c->target) > kPlanck) {
    smoother_add(*g, *c);
  }
  return 0;
}

extern "C" int soemdsp_graph_set_smooth_type(
  int handle, unsigned int nodeHash, int paramId, int type
) {
  Circuit* g = get(handle);
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -2;
  Control* c = control_for_param(g->nodes[idx], paramId);
  if (!c) return 0;
  unsigned char t = kSmoothTypeOnePole;
  if (type == (int)kSmoothTypeLinear) t = kSmoothTypeLinear;
  else if (type == (int)kSmoothTypeTwoPole) t = kSmoothTypeTwoPole;
  else if (type == (int)kSmoothTypeNone) t = kSmoothTypeNone;
  else if (type == (int)kSmoothTypePapoulis) t = kSmoothTypePapoulis;
  else if (type == (int)kSmoothTypeThreePole) t = kSmoothTypeThreePole;
  if (c->type == t) return 0;
  if (c->type == kSmoothTypePapoulis && t != kSmoothTypePapoulis) {
    control_release_papoulis(*c);
  }
  c->type = t;
  c->dirty = true;
  c->stage1 = c->out;
  c->stage2 = c->out;
  if (t == kSmoothTypePapoulis) {
    control_ensure_papoulis(*c);
  }
  if (t == kSmoothTypeNone || c->snap) {
    c->out = c->target;
    c->stage1 = c->target;
    c->stage2 = c->target;
    if (c->papHandle > 0) soemdsp_papoulis_filter_snap(c->papHandle, c->target);
    return 0;
  }
  if (dsp_fabs(c->out - c->target) > kPlanck) smoother_add(*g, *c);
  return 0;
}

extern "C" int soemdsp_graph_set_global_smooth_time(int handle, float timeSamples) {
  Circuit* g = get(handle);
  if (!g) return -1;
  double t = (double)timeSamples;
  if (!(t == t) || t < 0.0) t = 0.0;
  g->globalTimeSamples = t;
  dirty_all_control_coeffs(*g);
  for (int i = 0; i < g->toSmoothCount; i++) {
    Control* c = g->toSmooth[i];
    if (c) c->dirty = true;
  }
  // Wake controls that use global time and are not yet converged.
  for (int i = 0; i < g->nodeCount; i++) {
    if (!g->nodes[i].used) continue;
    Node& n = g->nodes[i];
    Control* slots[] = {
      &n.volumeDb, &n.pan, &n.frequency, &n.waveform, &n.amplitude, &n.shape,
      &n.phaseParam, &n.resonance, &n.mode, &n.stages, &n.center, &n.width,
      &n.oversample, &n.mix, &n.diffusionSize, &n.diffusionAmount, &n.delaySize,
      &n.recycle, &n.lfoAmplitude, &n.lfoBaseSpeed, &n.lfoVariation, &n.seed,
      &n.feedback, &n.level, &n.timeNumerator, &n.timeDenominator, &n.timingMode,
      &n.offsetMs, &n.lfoStyle, &n.lfoRate, &n.saturate, &n.lpfFrequency,
      &n.hpfFrequency, &n.tempoBpm, &n.offset, &n.inLow, &n.inHigh, &n.outLow,
      &n.outHigh, &n.gainDb, &n.gainLeftDb, &n.gainRightDb, &n.gainMonoSum,
      &n.laneVol[0], &n.laneVol[1], &n.laneVol[2], &n.laneVol[3],
      &n.laneBias[0], &n.laneBias[1], &n.laneBias[2], &n.laneBias[3],
      &n.bleed2, &n.bleed3, &n.bleed4
    };
    for (unsigned si = 0; si < sizeof(slots) / sizeof(slots[0]); si++) {
      Control* c = slots[si];
      if (!c || c->snap) continue;
      if (c->mode != kSmoothModeGlobal && c->mode != kSmoothModeInternalGlobal) continue;
      if (dsp_fabs(c->out - c->target) > kPlanck) smoother_add(*g, *c);
    }
  }
  return 0;
}

extern "C" int soemdsp_graph_compile(int handle) {
  Circuit* g = get(handle);
  if (!g) return -1;
  g->compiled = false;
  g->orderCount = 0;
  g->outputNodeIndex = -1;

  int indeg[kMaxNodes];
  unsigned char removed[kMaxNodes];
  for (int i = 0; i < g->nodeCount; i++) {
    indeg[i] = 0;
    removed[i] = 0;
  }
  for (int i = 0; i < g->connCount; i++) {
    if (!g->conns[i].used) continue;
    const int d = find_node(*g, g->conns[i].dstHash);
    const int s = find_node(*g, g->conns[i].srcHash);
    if (d < 0 || s < 0 || s == d) continue;
    indeg[d] += 1;
  }

  while (g->orderCount < g->nodeCount) {
    int pick = -1;
    int pickOut = -1;
    for (int i = 0; i < g->nodeCount; i++) {
      if (removed[i] || indeg[i] > 0) continue;
      if (g->nodes[i].typeId == kTypeOutput) {
        if (pickOut < 0) pickOut = i;
      } else if (pick < 0) {
        pick = i;
      }
    }
    if (pick < 0) pick = pickOut;
    if (pick < 0) {
      for (int pass = 0; pass < 2; pass++) {
        for (int i = 0; i < g->nodeCount; i++) {
          if (removed[i]) continue;
          const bool isOut = g->nodes[i].typeId == kTypeOutput;
          if (pass == 0 && isOut) continue;
          if (pass == 1 && !isOut) continue;
          removed[i] = 1;
          g->order[g->orderCount++] = i;
        }
      }
      break;
    }
    removed[pick] = 1;
    g->order[g->orderCount++] = pick;
    for (int i = 0; i < g->connCount; i++) {
      if (!g->conns[i].used) continue;
      if (g->conns[i].srcHash != g->nodes[pick].idHash) continue;
      const int d = find_node(*g, g->conns[i].dstHash);
      if (d >= 0 && indeg[d] > 0) indeg[d] -= 1;
    }
  }

  for (int i = 0; i < g->nodeCount; i++) {
    if (g->nodes[i].typeId == kTypeOutput) {
      g->outputNodeIndex = i;
      break;
    }
  }

  g->compiled = true;
  return 0;
}

extern "C" int soemdsp_graph_process_block(int handle, int n) {
  Circuit* g = get(handle);
  if (!g || !g->compiled) return -1;
  int frames = n;
  if (frames < 1) return -2;
  if (frames > kMaxBlockFrames) frames = kMaxBlockFrames;

  zero_buf(g->outL, frames);
  zero_buf(g->outR, frames);

  // Block-rate Control: DSP reads current outs (start of quantum), then the
  // chase advances for the next quantum. Matches "JS is interface / per block."
  // Osc/filter sample paths may step their own Controls per sample instead.
  for (int oi = 0; oi < g->orderCount; oi++) {
    const int ni = g->order[oi];
    if (ni < 0 || ni >= g->nodeCount || !g->nodes[ni].used) continue;
    Node& node = g->nodes[ni];
    for (int c = 0; c < kChannels; c++) zero_buf(node.buf[c], frames);

    // Yellow Graph: handle before generic bypass so Graph copy-thru / clear works.
    if (node.typeId == kTypeAdditiveGenerator) {
      process_additive_generator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveBubble) {
      process_additive_bubble(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveLinearFilter) {
      process_additive_linear_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveAnalogFilter) {
      process_additive_analog_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveLadderFilter) {
      process_additive_ladder_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveFrequencySkew) {
      process_additive_frequency_skew(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveQuantizeFreq) {
      process_additive_quantize_freq(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveQuantizePhase) {
      process_additive_quantize_phase(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditivePan) {
      process_additive_pan(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditivePhaseEntry) {
      process_additive_phase_entry(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveBlaster) {
      process_additive_blaster(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveDiffusor) {
      process_additive_diffusor(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveNoisyFreq) {
      process_additive_noisy_freq(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveNoisyPhase) {
      process_additive_noisy_phase(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveNoisyPan) {
      process_additive_noisy_pan(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveNoisyAmp) {
      process_additive_noisy_amp(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveOut) {
      process_additive_out(*g, node, frames);
      continue;
    }

    if (node.bypassed) {
      process_bypass(*g, node, frames);
      continue;
    }

    if (node.typeId == kTypePolyBlep) {
      process_polyblep(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeNoiseGenerator) {
      process_noise_generator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRobinSinusoid) {
      process_robin_sinusoid(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRobinSupersaw) {
      process_robin_supersaw(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSlewLimiter) {
      process_slew_limiter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeComparator) {
      process_comparator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSampleDelay) {
      process_sample_delay(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSampleHold) {
      process_sample_hold(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeMinMax) {
      process_min_max(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeMix) {
      process_mix(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeMixStereo) {
      process_mix_stereo(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLadderFilter) {
      process_ladder(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSoftClipper) {
      process_soft_clipper(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeClipperLimiter) {
      process_clipper_limiter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeMidSideEncode) {
      process_mid_side_encode(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeVectorscopeTransform) {
      process_vectorscope_transform(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRotate3dTo2d) {
      process_rotate_3d_to_2d(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeClock) {
      process_clock(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeTriggerDivider) {
      process_trigger_divider(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeDelayedTrigger) {
      process_delayed_trigger(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRandomClock) {
      process_random_clock(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeTriggerCounter) {
      process_trigger_counter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeMetallicRatio) {
      process_metallic_ratio(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeHarmonicSeries) {
      process_harmonic_series(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLutCell) {
      process_lut_cell(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLookaheadLimiter) {
      process_lookahead_limiter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePumpLimiter) {
      process_pump_limiter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAudioPlayer) {
      process_audio_player(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeStepSequencer) {
      process_step_sequencer(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeTransport) {
      process_transport(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAliasSine) {
      process_alias_sine(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePhoneTone) {
      process_phone_tone(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBlit) {
      process_blit(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSineWavetable) {
      process_sine_wavetable(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAntisaw) {
      process_antisaw(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeArchimedes) {
      process_archimedes(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAdditiveOsc) {
      process_additive_osc(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSurgeOscillator) {
      process_surge_oscillator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSoftwaveOsc) {
      process_softwave_osc(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeDsfOscillator) {
      process_dsf_oscillator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeHypersaw) {
      process_hypersaw(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSinc) {
      process_sinc(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBradley2a) {
      process_bradley2a(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeEllipsoid) {
      process_ellipsoid(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSnowflake) {
      process_snowflake(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeButterworth) {
      process_scientific_iir(*g, node, frames, soemdsp_butterworth_sample);
      continue;
    }
    if (node.typeId == kTypeLinkwitzRiley) {
      process_scientific_iir(*g, node, frames, soemdsp_linkwitz_riley_sample);
      continue;
    }
    if (node.typeId == kTypeBessel) {
      process_scientific_iir(*g, node, frames, soemdsp_bessel_sample);
      continue;
    }
    if (node.typeId == kTypePapoulisFilter) {
      process_papoulis_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSpeakerProtection) {
      process_speaker_protection(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSpeakerProtector2) {
      process_speaker_protector2(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAttackDecay) {
      process_attack_decay(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBandpass) {
      process_bandpass(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAllpass) {
      process_allpass(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBasicShape) {
      process_basic_shape(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeChordPad) {
      process_chord_pad(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeNoteGlide) {
      process_note_glide(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeNoteTranspose) {
      process_note_transpose(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeDegreeTuring) {
      process_degree_turing(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeDegreePhrase) {
      process_degree_phrase(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeGravityWalker) {
      process_gravity_walker(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeChebyshev) {
      process_scientific_iir(*g, node, frames, soemdsp_chebyshev_sample);
      continue;
    }
    if (node.typeId == kTypeElliptic) {
      process_scientific_iir(*g, node, frames, soemdsp_elliptic_sample);
      continue;
    }
    if (node.typeId == kTypeEqFilter) {
      process_eq_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeActiveFilter) {
      process_active_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePassiveFilter) {
      process_passive_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeTb303Filter) {
      process_tb303_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeFlowerChildFilter) {
      process_flower_child_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeYellowjacketFilter) {
      process_yellowjacket_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSuperloveFilter) {
      process_superlove_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeHumanFilter) {
      process_human_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeResonatorFilter) {
      process_resonator_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeCombResonator) {
      process_comb_resonator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeModeResonator) {
      process_mode_resonator(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeChaoticPhaseLockingFilter) {
      process_chaotic_phase_locking_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeInertialFilter) {
      process_inertial_filter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeExpAdsr) {
      process_exp_adsr(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLinearEnvelope) {
      process_linear_envelope(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePluckEnvelope) {
      process_pluck_envelope(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeFlowerChildEnvelopeFollower) {
      process_flower_child_envelope_follower(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeDelayEffect) {
      process_delay_effect(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSoemReverb) {
      process_soem_reverb(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePll) {
      process_pll(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLorenzAttractor) {
      process_lorenz_attractor(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLogisticMap) {
      process_logistic_map(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeHenonMap) {
      process_henon_map(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeChuaAttractor) {
      process_chua_attractor(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRayBouncer) {
      process_ray_bouncer(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeChordMemory) {
      process_chord_memory(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeChordSequencer) {
      process_chord_sequencer(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePitchQuantizer) {
      process_pitch_quantizer(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeTuringMachine) {
      process_turing_machine(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeFractalBrownianNoise) {
      process_fractal_brownian_noise(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePiSpigotNoise) {
      process_pi_spigot_noise(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRandomWalk) {
      process_random_walk(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeCheapWalk) {
      process_cheap_walk(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePulseExplosion) {
      process_pulse_explosion(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeSpiral) {
      process_jerobeam_spiral(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeFractalSpiral) {
      process_fractal_spiral(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLogSpiral) {
      process_log_spiral(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBlubb) {
      process_blubb(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBoing) {
      process_boing(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeKeplerBouwkamp) {
      process_kepler_bouwkamp(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeMushroom) {
      process_mushroom(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeNyquistShannon) {
      process_nyquist_shannon(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRadar) {
      process_radar(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeTorus) {
      process_torus(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeWirdoSpiral) {
      process_wirdo_spiral(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePhosphillator) {
      process_phosphillator(*g, node, frames);
      continue;
    }
    if (node.typeId >= kTypeCrossover2 && node.typeId <= kTypeCrossover6) {
      process_crossover(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeReverbEffect) {
      process_reverb(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePingPongDelay) {
      process_ping_pong(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAttenuverter) {
      process_attenuverter(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeRange) {
      process_range(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeInv) {
      process_inv(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeU2b) {
      process_u2b(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeB2u) {
      process_b2u(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeBias) {
      process_bias(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeGain) {
      process_gain(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeOutput) {
      process_output(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePortalOutlet) {
      process_portal_outlet(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypePortalInlet) {
      process_portal_inlet(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeAudioInput) {
      // Host mic bus not in graph_engine yet — silence (module stays plan-legal).
      for (int f = 0; f < frames; f++) {
        node.buf[kPortMono][f] = 0.0;
        node.buf[kPortLeft][f] = 0.0;
        node.buf[kPortRight][f] = 0.0;
      }
      continue;
    }
    // unknown: silence
  }

  smoother_run(*g, frames);
  smoother_clean(*g);
  return frames;
}

extern "C" double* soemdsp_graph_block_output_left_ptr(int handle) {
  Circuit* g = get(handle);
  return g ? g->outL : nullptr;
}

extern "C" double* soemdsp_graph_block_output_right_ptr(int handle) {
  Circuit* g = get(handle);
  return g ? g->outR : nullptr;
}

// Observe-only: pointer to last process_block's node.buf[port] (audio ports 0..7).
extern "C" double* soemdsp_graph_node_port_ptr(int handle, unsigned int nodeHash, int port) {
  Circuit* g = get(handle);
  if (!g) return nullptr;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return nullptr;
  // Graph is a data-plane port (no sample buffer).
  if (is_graph_port(port)) return nullptr;
  const int p = clamp_src_port(port);
  return g->nodes[idx].buf[p];
}

// Upload glue for modules that need host→WASM buffer fill (Music Player PCM,
// phosphillator path, future sample banks). Returns the node's nativeHandle
// created at add_node time (0 if missing / free-fn type).
extern "C" int soemdsp_graph_node_native_handle(int handle, unsigned int nodeHash) {
  Circuit* g = get(handle);
  if (!g) return 0;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return 0;
  return g->nodes[idx].nativeHandle;
}

// Yellow Graph face publish: host copies planar arrays for data-bus relay.
static int yellow_node_index(Circuit* g, unsigned int nodeHash) {
  if (!g) return -1;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return -1;
  const int t = g->nodes[idx].typeId;
  if (
    t == kTypeAdditiveGenerator || t == kTypeAdditiveBubble || t == kTypeAdditiveOut
    || t == kTypeAdditiveLinearFilter || t == kTypeAdditiveAnalogFilter
    || t == kTypeAdditiveLadderFilter || t == kTypeAdditiveFrequencySkew
    || t == kTypeAdditiveQuantizeFreq || t == kTypeAdditiveQuantizePhase
    || t == kTypeAdditivePan || t == kTypeAdditivePhaseEntry || t == kTypeAdditiveBlaster
    || t == kTypeAdditiveDiffusor
    || t == kTypeAdditiveNoisyFreq || t == kTypeAdditiveNoisyPhase
    || t == kTypeAdditiveNoisyPan || t == kTypeAdditiveNoisyAmp
  ) {
    return idx;
  }
  return -1;
}

extern "C" int soemdsp_graph_yellow_harmonics(int handle, unsigned int nodeHash) {
  Circuit* g = get(handle);
  const int idx = yellow_node_index(g, nodeHash);
  if (idx < 0) return 0;
  const int H = g->nodes[idx].yellowGraph.harmonics;
  if (H < 0) return 0;
  if (H > soemdsp_yellow_graph::kMaxHarmonics) return soemdsp_yellow_graph::kMaxHarmonics;
  return H;
}

extern "C" float* soemdsp_graph_yellow_ratio_ptr(int handle, unsigned int nodeHash) {
  Circuit* g = get(handle);
  const int idx = yellow_node_index(g, nodeHash);
  if (idx < 0 || g->nodes[idx].yellowGraph.harmonics < 1) return nullptr;
  return g->nodes[idx].yellowGraph.ratio;
}

extern "C" float* soemdsp_graph_yellow_phase_ptr(int handle, unsigned int nodeHash) {
  Circuit* g = get(handle);
  const int idx = yellow_node_index(g, nodeHash);
  if (idx < 0 || g->nodes[idx].yellowGraph.harmonics < 1) return nullptr;
  return g->nodes[idx].yellowGraph.phase;
}

extern "C" float* soemdsp_graph_yellow_amplitude_ptr(int handle, unsigned int nodeHash) {
  Circuit* g = get(handle);
  const int idx = yellow_node_index(g, nodeHash);
  if (idx < 0 || g->nodes[idx].yellowGraph.harmonics < 1) return nullptr;
  return g->nodes[idx].yellowGraph.amplitude;
}

extern "C" float* soemdsp_graph_yellow_pan_ptr(int handle, unsigned int nodeHash) {
  Circuit* g = get(handle);
  const int idx = yellow_node_index(g, nodeHash);
  if (idx < 0 || g->nodes[idx].yellowGraph.harmonics < 1) return nullptr;
  return g->nodes[idx].yellowGraph.pan;
}

// Bubble Cutoff sample-accurate strip: host writes Float32[0..frames) then set.
// Returns 1 on success. frames<=0 clears the strip (quantum cutoff path).
extern "C" int soemdsp_graph_set_yellow_cutoff_strip(
  int handle, unsigned int nodeHash, int frames
) {
  Circuit* g = get(handle);
  if (!g) return 0;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return 0;
  Node& node = g->nodes[idx];
  if (node.typeId != kTypeAdditiveBubble) return 0;
  if (frames <= 0) {
    node.yellowCutoffStripFrames = 0;
    return 1;
  }
  int n = frames;
  if (n > kMaxBlockFrames) n = kMaxBlockFrames;
  node.yellowCutoffStripFrames = n;
  return 1;
}

extern "C" float* soemdsp_graph_yellow_cutoff_strip_ptr(int handle, unsigned int nodeHash) {
  Circuit* g = get(handle);
  if (!g) return nullptr;
  const int idx = find_node(*g, nodeHash);
  if (idx < 0) return nullptr;
  Node& node = g->nodes[idx];
  if (node.typeId != kTypeAdditiveBubble) return nullptr;
  return node.yellowCutoffStrip;
}

extern "C" int soemdsp_graph_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_graph_version() {
  // 103: chordPad(140) + noteGlide(141) + noteTranspose(142)
  //      + degreeTuring(143) + degreePhrase(144) + gravityWalker(145)
  return 103;
}
