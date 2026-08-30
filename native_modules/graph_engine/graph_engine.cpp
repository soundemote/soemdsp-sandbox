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
  double modA,
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

extern "C" int soemdsp_vactrol_envelope_create();
extern "C" void soemdsp_vactrol_envelope_destroy(int handle);
extern "C" double soemdsp_vactrol_envelope_sample(
  int handle, double light, double attack, double release, double curve,
  double sensitivity, double lightOffset, double darkCurrent, double sampleRate
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

// Param-chase Papoulis (Control smooth type Π).
extern "C" int soemdsp_papoulis_filter_create();
extern "C" void soemdsp_papoulis_filter_destroy(int handle);
extern "C" void soemdsp_papoulis_filter_snap(int handle, double value);
extern "C" double soemdsp_papoulis_filter_sample(
  int handle, double input, double cutoffHz, double sampleRate
);

namespace {

using soemdsp_maths::dsp_exp;
using soemdsp_maths::dsp_cos;
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
static const int kChannels = 8;

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
static const int kTypeVactrolEnvelope = 74; // series + custom share native
static const int kTypeDelayEffect = 75;
// wallDelay skipped — native is placeholder (version only).
static const int kTypeSoemReverb = 76;
static const int kTypePll = 77;
static const int kTypeLorenzAttractor = 78;
static const int kTypeLogisticMap = 79;
static const int kTypeHenonMap = 80;
static const int kTypeChuaAttractor = 81;
static const int kTypeRayBouncer = 82;

static const int kPortMono = 0;
static const int kPortLeft = 1;
static const int kPortRight = 2;
static const int kPortSaw = 3;
static const int kPortRamp = 4;
static const int kPortSquare = 5;
static const int kPortTri = 6;
static const int kPortSine = 7;
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
};

static Circuit gPool[kMaxInstances];

static void zero_buf(double* p, int n) {
  for (int i = 0; i < n; i++) p[i] = 0.0;
}

static double* ptr_from_export(int addr) {
  if (addr == 0) return nullptr;
  return (double*)(unsigned)addr;
}

static void destroy_node_native(Node& n) {
  if (n.nativeHandle <= 0) {
    n.nativeHandle = 0;
    n.nativeKind = 0;
    return;
  }
  // Key destroy off create-time kind so a later typeId retarget cannot leak.
  const int kind = n.nativeKind != 0 ? n.nativeKind : n.typeId;
  if (kind == kTypePolyBlep) {
    soemdsp_polyblep_destroy(n.nativeHandle);
  } else if (kind == kTypeLadderFilter) {
    soemdsp_ladder_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeSoftClipper) {
    soemdsp_soft_clipper_destroy(n.nativeHandle);
  } else if (kind == kTypeReverbEffect) {
    soemdsp_sabrina_reverb_destroy(n.nativeHandle);
  } else if (kind == kTypePingPongDelay) {
    soemdsp_ping_pong_delay_destroy(n.nativeHandle);
  } else if (kind == kTypeAttenuverter) {
    soemdsp_attenuverter_destroy(n.nativeHandle);
  } else if (kind == kTypeRange) {
    soemdsp_range_destroy(n.nativeHandle);
  } else if (kind == kTypeNoiseGenerator) {
    soemdsp_noise_generator_destroy(n.nativeHandle);
  } else if (kind == kTypeRobinSinusoid) {
    soemdsp_robin_sinusoid_destroy(n.nativeHandle);
  } else if (kind == kTypeRobinSupersaw) {
    soemdsp_robin_supersaw_destroy(n.nativeHandle);
  } else if (kind == kTypeSlewLimiter) {
    soemdsp_slew_limiter_destroy(n.nativeHandle);
  } else if (kind == kTypeComparator) {
    soemdsp_comparator_destroy(n.nativeHandle);
  } else if (kind == kTypeSampleDelay) {
    soemdsp_sample_delay_destroy(n.nativeHandle);
  } else if (kind == kTypeSampleHold) {
    soemdsp_sample_hold_destroy(n.nativeHandle);
  } else if (kind == kTypeMinMax) {
    soemdsp_min_max_destroy(n.nativeHandle);
  } else if (kind == kTypeClipperLimiter) {
    soemdsp_clipper_limiter_destroy(n.nativeHandle);
  } else if (kind == kTypeClock) {
    soemdsp_clock_destroy(n.nativeHandle);
  } else if (kind == kTypeTriggerDivider) {
    soemdsp_trigger_divider_destroy(n.nativeHandle);
  } else if (kind == kTypeDelayedTrigger) {
    soemdsp_delayed_trigger_destroy(n.nativeHandle);
  } else if (kind == kTypeRandomClock) {
    soemdsp_random_clock_destroy(n.nativeHandle);
  } else if (kind == kTypeTriggerCounter) {
    soemdsp_trigger_counter_destroy(n.nativeHandle);
  } else if (kind == kTypeLutCell) {
    soemdsp_lut_cell_destroy(n.nativeHandle);
  } else if (kind == kTypeLookaheadLimiter) {
    soemdsp_lookahead_limiter_destroy(n.nativeHandle);
  } else if (kind == kTypeStepSequencer) {
    soemdsp_step_sequencer_destroy(n.nativeHandle);
  } else if (kind == kTypeTransport) {
    soemdsp_transport_destroy(n.nativeHandle);
  } else if (kind == kTypeAliasSine) {
    soemdsp_alias_sine_destroy(n.nativeHandle);
  } else if (kind == kTypeBlit) {
    soemdsp_blit_destroy(n.nativeHandle);
  } else if (kind == kTypeSineWavetable) {
    soemdsp_sine_wavetable_destroy(n.nativeHandle);
  } else if (kind == kTypeAntisaw) {
    soemdsp_antisaw_destroy(n.nativeHandle);
  } else if (kind == kTypeArchimedes) {
    soemdsp_archimedes_destroy(n.nativeHandle);
  } else if (kind == kTypeSurgeOscillator) {
    soemdsp_surge_oscillator_destroy(n.nativeHandle);
  } else if (kind == kTypeSoftwaveOsc) {
    soemdsp_softwave_destroy(n.nativeHandle);
  } else if (kind == kTypeDsfOscillator) {
    soemdsp_dsf_oscillator_destroy(n.nativeHandle);
  } else if (kind == kTypeHypersaw) {
    soemdsp_hypersaw_destroy(n.nativeHandle);
  } else if (kind == kTypeSinc) {
    soemdsp_sinc_destroy(n.nativeHandle);
  } else if (kind == kTypeBradley2a) {
    soemdsp_bradley_2a_destroy(n.nativeHandle);
  } else if (kind == kTypeSnowflake) {
    soemdsp_snowflake_destroy(n.nativeHandle);
  } else if (kind == kTypeButterworth) {
    soemdsp_butterworth_destroy(n.nativeHandle);
  } else if (kind == kTypeLinkwitzRiley) {
    soemdsp_linkwitz_riley_destroy(n.nativeHandle);
  } else if (kind == kTypeBessel) {
    soemdsp_bessel_destroy(n.nativeHandle);
  } else if (kind == kTypeChebyshev) {
    soemdsp_chebyshev_destroy(n.nativeHandle);
  } else if (kind == kTypeElliptic) {
    soemdsp_elliptic_destroy(n.nativeHandle);
  } else if (kind == kTypeEqFilter) {
    soemdsp_eq_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeActiveFilter) {
    soemdsp_active_filter_destroy(n.nativeHandle);
  } else if (kind == kTypePassiveFilter) {
    soemdsp_passive_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeTb303Filter) {
    soemdsp_tb303_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeFlowerChildFilter) {
    soemdsp_flower_child_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeYellowjacketFilter) {
    soemdsp_yellowjacket_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeSuperloveFilter) {
    soemdsp_superlove_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeHumanFilter) {
    soemdsp_human_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeResonatorFilter) {
    soemdsp_resonator_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeCombResonator) {
    soemdsp_comb_resonator_destroy(n.nativeHandle);
  } else if (kind == kTypeModeResonator) {
    soemdsp_mode_resonator_destroy(n.nativeHandle);
  } else if (kind == kTypeChaoticPhaseLockingFilter) {
    soemdsp_chaotic_phase_locking_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeInertialFilter) {
    soemdsp_inertial_filter_destroy(n.nativeHandle);
  } else if (kind == kTypeExpAdsr) {
    soemdsp_exp_adsr_destroy(n.nativeHandle);
  } else if (kind == kTypeLinearEnvelope) {
    soemdsp_linear_envelope_destroy(n.nativeHandle);
  } else if (kind == kTypePluckEnvelope) {
    soemdsp_pluck_envelope_destroy(n.nativeHandle);
  } else if (kind == kTypeFlowerChildEnvelopeFollower) {
    soemdsp_flower_child_envelope_follower_destroy(n.nativeHandle);
  } else if (kind == kTypeVactrolEnvelope) {
    soemdsp_vactrol_envelope_destroy(n.nativeHandle);
  } else if (kind == kTypeDelayEffect) {
    soemdsp_delay_effect_destroy(n.nativeHandle);
  } else if (kind == kTypeSoemReverb) {
    soemdsp_soem_reverb_destroy(n.nativeHandle);
  } else if (kind == kTypePll) {
    soemdsp_pll_destroy(n.nativeHandle);
  } else if (kind == kTypeLorenzAttractor) {
    soemdsp_lorenz_attractor_destroy(n.nativeHandle);
  } else if (kind == kTypeLogisticMap) {
    soemdsp_logistic_map_destroy(n.nativeHandle);
  } else if (kind == kTypeHenonMap) {
    soemdsp_henon_map_destroy(n.nativeHandle);
  } else if (kind == kTypeChuaAttractor) {
    soemdsp_chua_attractor_destroy(n.nativeHandle);
  } else if (kind == kTypeRayBouncer) {
    soemdsp_ray_bouncer_destroy(n.nativeHandle);
  }
  n.nativeHandle = 0;
  n.nativeKind = 0;
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
  n.nativeKind = 0;
  init_control(n.volumeDb, (typeId == kTypeMixStereo) ? 0.0 : -3.0, false);
  init_control(n.pan, 0.0, false);
  // lookaheadLimiter: mode = look-ahead on/off; timingMode = gainCompensation.
  init_control(
    n.frequency,
    (typeId == kTypeLadderFilter
      || typeId == kTypeButterworth || typeId == kTypeLinkwitzRiley
      || typeId == kTypeBessel || typeId == kTypeChebyshev || typeId == kTypeElliptic
      || typeId == kTypeEqFilter || typeId == kTypeActiveFilter
      || typeId == kTypeTb303Filter)
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
      : (typeId == kTypeBlit || typeId == kTypeSineWavetable || typeId == kTypeArchimedes
          || typeId == kTypeAdditiveOsc || typeId == kTypeSurgeOscillator
          || typeId == kTypeSoftwaveOsc || typeId == kTypeDsfOscillator
          || typeId == kTypeHypersaw || typeId == kTypeSinc) ? 100.0
      : (typeId == kTypeBradley2a) ? 1004.0 // carrier
      : (typeId == kTypeEllipsoid) ? 1.0 // RoundShape clock Hz
      : (typeId == kTypeSnowflake) ? 55.0
      : (typeId == kTypeAntisaw) ? 110.0
      : (typeId == kTypePluckEnvelope) ? 1.5 // decayModFrequency
      : (typeId == kTypePll) ? 10.0 // LPF cutoff
      : (typeId == kTypeSoemReverb) ? 1000.0 // bandFrequency
      : (typeId == kTypeLorenzAttractor || typeId == kTypeChuaAttractor) ? 1.0 // speed
      : (typeId == kTypeLogisticMap || typeId == kTypeHenonMap
          || typeId == kTypeRayBouncer) ? 8.0 // rate/frequency
      : 220.0,
    false
  );
  init_control(
    n.waveform,
    (typeId == kTypeAdditiveOsc || typeId == kTypeDsfOscillator) ? 1.0
      : (typeId == kTypeSoemReverb) ? 1.0 // doModulateEcho On
      : 0.0,
    true
  );
  init_control(
    n.amplitude,
    (typeId == kTypeAttenuverter) ? 0.5
      : (typeId == kTypeAdditiveOsc || typeId == kTypeHypersaw) ? 0.35
      : 1.0,
    false
  );
  init_control(
    n.shape,
    (typeId == kTypeNoiseGenerator || typeId == kTypeSlewLimiter || typeId == kTypeAntisaw
      || typeId == kTypeBradley2a || typeId == kTypeEllipsoid || typeId == kTypeSnowflake
      || typeId == kTypeFlowerChildFilter || typeId == kTypeYellowjacketFilter
      || typeId == kTypeHumanFilter || typeId == kTypeResonatorFilter
      || typeId == kTypeCombResonator || typeId == kTypePluckEnvelope)
      ? 0.0 // chaos/damping/decayModCurve off
      : (typeId == kTypeChaoticPhaseLockingFilter) ? 1.0 // chaos default
      : (typeId == kTypeDsfOscillator) ? 1.0 // harmonics
      : (typeId == kTypeHypersaw) ? 1.0 // spread
      : (typeId == kTypeSoftwaveOsc || typeId == kTypeSuperloveFilter) ? 0.5 // morph/chaos
      : (typeId == kTypeExpAdsr) ? 0.3 // attackShape
      : (typeId == kTypeVactrolEnvelope) ? 1.0 // curve gamma
      : (typeId == kTypeLorenzAttractor) ? 10.0 // sigma
      : (typeId == kTypeLogisticMap) ? 3.9 // r
      : (typeId == kTypeHenonMap) ? 1.4 // a
      : (typeId == kTypeChuaAttractor) ? 15.6 // alpha
      : 0.5,
    (typeId == kTypeSlewLimiter) // discrete Lin/Log/Exp/Smooth
  );
  init_control(
    n.phaseParam,
    (typeId == kTypeRayBouncer) ? 30.0 // launchAngle deg
      : 0.0,
    false
  );
  init_control(
    n.resonance,
    (typeId == kTypeChebyshev || typeId == kTypeElliptic) ? 1.0 // ripple dB
      : (typeId == kTypeEqFilter) ? 0.707 // Q
      : (typeId == kTypeTb303Filter) ? 0.0 // %
      : (typeId == kTypeSoemReverb) ? 1.0 // bandQ
      : (typeId == kTypeLorenzAttractor) ? 28.0 // rho
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
      || typeId == kTypeCombResonator)
      ? 0.0 // LP / Clean / BP6 / Feedback
      : (typeId == kTypeEqFilter) ? 1.0 // HP12
      : (typeId == kTypeActiveFilter) ? 3.0 // LP24
      : (typeId == kTypeTb303Filter) ? 4.0 // LP_24
      : (typeId == kTypeLookaheadLimiter) ? 1.0 // look-ahead On
      : (typeId == kTypeSineWavetable) ? 2.0 // sincos
      : (typeId == kTypeSinc) ? 1.0 // band-limit kernel
      : (typeId == kTypeEllipsoid) ? 1.0 // CounterClock(Ph)
      : (typeId == kTypeSnowflake) ? 1.0 // Koch Snowflake pattern
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
      : (typeId == kTypeTriggerCounter || typeId == kTypeStepSequencer) ? 8.0
      : (typeId == kTypeTransport) ? 0.0
      : (typeId == kTypeAntisaw) ? 64.0
      : (typeId == kTypeArchimedes) ? 12.0
      : (typeId == kTypeAdditiveOsc) ? 32.0
      : (typeId == kTypeHypersaw) ? 8.0
      : (typeId == kTypeSinc) ? 4.0
      : (typeId == kTypeSnowflake) ? 3.0 // iterations
      : (typeId == kTypeActiveFilter) ? 3.0 // feedbackCircuit Res+Clip
      : (typeId == kTypeCombResonator) ? 0.0 // invert Off
      : (typeId == kTypeSoemReverb) ? 10.0 // numDelays
      : (typeId == kTypePll) ? 1.0 // PC type RS Flip
      : 4.0,
    true
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
      : (typeId == kTypeMetallicRatio) ? 1.0 // index n
      : (typeId == kTypeArchimedes) ? 3.0
      : (typeId == kTypeSurgeOscillator) ? 50.0 // syncFrequency Hz
      : (typeId == kTypeDsfOscillator) ? 0.5 // PWM
      : (typeId == kTypeHypersaw) ? 0.15 // random
      : (typeId == kTypeAdditiveOsc) ? 0.0 // harmonicPhaseMultiply
      : (typeId == kTypeBradley2a) ? 0.0 // freqOffset
      : (typeId == kTypeSnowflake) ? 60.0 // angle°
      : (typeId == kTypeButterworth || typeId == kTypeLinkwitzRiley
          || typeId == kTypeBessel || typeId == kTypeChebyshev || typeId == kTypeElliptic)
        ? 1.0 // bandwidth octaves
      : (typeId == kTypeCombResonator) ? 1.0 // depth
      : (typeId == kTypePluckEnvelope || typeId == kTypeVactrolEnvelope) ? 1.0 // velocity/sensitivity
      : (typeId == kTypeSoemReverb) ? 2.0 // lpfStages
      : (typeId == kTypeLorenzAttractor) ? 2.6666666666666665 // beta
      : (typeId == kTypeHenonMap) ? 0.3 // b
      : (typeId == kTypeChuaAttractor) ? 28.0 // beta
      : (typeId == kTypeRayBouncer) ? 1.0 // size
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
      : (typeId == kTypeVactrolEnvelope) ? 0.0 // darkCurrent
      : (typeId == kTypeLorenzAttractor) ? 0.4 // zDepth
      : (typeId == kTypeHenonMap) ? 0.1 // seedY
      : (typeId == kTypeChuaAttractor) ? -0.714 // m1
      : (typeId == kTypeRayBouncer) ? 0.0 // rotate deg
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
      : 0.0,
    true
  );
  init_control(
    n.feedback,
    (typeId == kTypeBradley2a) ? 1.0 // hitRate
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope) ? 0.22 // decay
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
    (typeId == kTypeSlewLimiter) ? 0.05
      : (typeId == kTypeSampleDelay) ? 0.0
      : (typeId == kTypeTriggerDivider || typeId == kTypeTriggerCounter) ? 0.01
      : (typeId == kTypeDelayedTrigger) ? 0.1
      : (typeId == kTypeRandomClock) ? 0.25
      : (typeId == kTypeLookaheadLimiter) ? 5.0 // look-ahead ms
      : (typeId == kTypeBradley2a) ? 0.005 // hitDuration
      : (typeId == kTypeModeResonator || typeId == kTypeCombResonator) ? 1.0 // decay s
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope
          || typeId == kTypePluckEnvelope) ? 0.0 // delay
      : (typeId == kTypeFlowerChildEnvelopeFollower) ? 0.001 // attack
      : (typeId == kTypeVactrolEnvelope) ? 0.01 // attack (custom default)
      : (typeId == kTypeDelayEffect) ? 0.18 // time s
      : 1.0,
    false
  );
  init_control(
    n.timeDenominator,
    (typeId == kTypeSlewLimiter) ? 0.20
      : (typeId == kTypeSampleDelay) ? 0.0
      : (typeId == kTypeDelayedTrigger) ? 0.01
      : (typeId == kTypeRandomClock) ? 1.0
      : (typeId == kTypeLookaheadLimiter) ? 0.0 // look-ahead samples
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope) ? 0.08 // attack
      : (typeId == kTypePluckEnvelope) ? 0.002 // attackFeedback
      : (typeId == kTypeFlowerChildEnvelopeFollower) ? 0.001 // hold
      : (typeId == kTypeVactrolEnvelope) ? 0.1 // release (custom default)
      : 4.0,
    false
  );
  init_control(
    n.timingMode,
    (typeId == kTypeActiveFilter) ? 1.0 // gainCompensation On
      : 0.0, // also mode/comb resonator hold Off
    true
  ); // pingPong timing; lookaheadLimiter / activeFilter = gainCompensation
  init_control(
    n.offsetMs,
    (typeId == kTypeRandomClock) ? 0.01
      : (typeId == kTypeLookaheadLimiter) ? 0.2 // attack ms
      : (typeId == kTypeExpAdsr || typeId == kTypeLinearEnvelope) ? 0.45 // release s
      : (typeId == kTypePluckEnvelope) ? 0.08 // autoReleaseTime
      : (typeId == kTypeSoemReverb) ? 0.04 // duckRelease
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
      : 8000.0,
    false
  );
  init_control(
    n.hpfFrequency,
    (typeId == kTypeActiveFilter || typeId == kTypePassiveFilter) ? 200.0 // lowCut
      : 20.0,
    false
  );
  init_control(n.tempoBpm, 120.0, false);
  init_control(n.offset, (typeId == kTypePll) ? 5.0 : 0.0, false);
  init_control(
    n.inLow,
    (typeId == kTypeRange) ? -1.0 : (typeId == kTypeClipperLimiter) ? -12.0 : 0.0,
    false
  );
  init_control(
    n.inHigh,
    (typeId == kTypeRange) ? 1.0 : (typeId == kTypeClipperLimiter) ? 0.0 : 1.0,
    false
  );
  init_control(n.outLow, 0.0, false);
  init_control(
    n.outHigh,
    (typeId == kTypeRange) ? 1000.0 : 1.0,
    false
  );
  init_control(n.gainDb, (typeId == kTypeLookaheadLimiter) ? -1.0 : 0.0, false); // ceiling dB
  init_control(n.gainLeftDb, 0.0, false);
  init_control(n.gainRightDb, 0.0, false);
  init_control(n.gainMonoSum, 0.0, true); // discrete mono-sum law
  // mix: linear volumes default 1; mixStereo: dB volumes default 0; pans/bias 0; bleeds 0
  // lookaheadLimiter: laneBias[0]=release ms, laneBias[1]=dipGain
  // stepSequencer: laneVol[0..3]=step1..4, laneBias[0..3]=step5..8
  const double laneVolDefault = (typeId == kTypeMix) ? 1.0 : 0.0;
  static const double kStepDefaults[8] = {
    0.0, 0.25, 0.5, 0.75, 1.0, 0.75, 0.5, 0.25
  };
  for (int i = 0; i < 4; i++) {
    const double volDef = (typeId == kTypeStepSequencer) ? kStepDefaults[i] : laneVolDefault;
    init_control(n.laneVol[i], volDef, false);
    double biasDef = 0.0;
    if (typeId == kTypeLookaheadLimiter) {
      if (i == 0) biasDef = 100.0;
      else if (i == 1) biasDef = 1.0;
    } else if (typeId == kTypeStepSequencer) {
      biasDef = kStepDefaults[i + 4];
    }
    init_control(n.laneBias[i], biasDef, false);
  }
  init_control(n.bleed2, 0.0, false);
  init_control(n.bleed3, 0.0, false);
  init_control(n.bleed4, 0.0, false);
  n.phase = 0.0;
  n.lastReset = 0.0;
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
  if (typeId == kTypeStepSequencer) return soemdsp_step_sequencer_create();
  if (typeId == kTypeTransport) return soemdsp_transport_create();
  if (typeId == kTypeAliasSine) return soemdsp_alias_sine_create();
  if (typeId == kTypeBlit) return soemdsp_blit_create();
  if (typeId == kTypeSineWavetable) return soemdsp_sine_wavetable_create();
  if (typeId == kTypeAntisaw) return soemdsp_antisaw_create();
  if (typeId == kTypeArchimedes) return soemdsp_archimedes_create();
  // kTypeAdditiveOsc: free-fn, no instance
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
  if (typeId == kTypeChebyshev) return soemdsp_chebyshev_create();
  if (typeId == kTypeElliptic) return soemdsp_elliptic_create();
  if (typeId == kTypeEqFilter) return soemdsp_eq_filter_create();
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
  if (typeId == kTypeVactrolEnvelope) return soemdsp_vactrol_envelope_create();
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
    || port == kPortMixStereoR4;
}

static int clamp_src_port(int port) {
  if (port < 0) return kPortMono;
  if (port >= kChannels) return kPortMono;
  return port;
}

// Destination may be audio bus (0..7) or Live SIGNAL IN (16+).
static int clamp_dst_port(int port) {
  if (port < 0) return kPortMono;
  if (port < kChannels) return port;
  if (is_live_dst_port(port)) return port;
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
    const int si = find_node(g, c.srcHash);
    if (si < 0) continue;
    Node& src = g.nodes[si];
    const int sp = clamp_src_port(c.srcPort);
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
  const double waveV = node.waveform.out;
  int waveform = (int)(waveV + (waveV >= 0.0 ? 0.5 : -0.5));
  if (waveform < 0) waveform = 0;
  if (waveform > 8) waveform = 8;
  double level = node.amplitude.out;
  if (!(level == level)) level = 0.0;
  double morph = node.shape.out;
  if (!(morph == morph)) morph = 0.5;
  const double phaseParam = node.phaseParam.out;
  const int mask = polyblep_tap_mask(g, node);

  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  const bool audioRatePitch = liveF || livePitch || liveInc || liveReset || controlSmoothing;

  // Midi note 48 → 0.4 reference voltage (matches worklet default).
  const double referenceVoltage = 48.0 / 120.0;

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
  double phase = wrap_phase_pi(node.phase + phaseParam * kTwoPi);
  if (!liveReset) {
    // Cable gone → clear latch so the next connect can rising-edge.
    node.lastReset = 0.0;
  }
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    // Re-read after step so Control ramps are sample-accurate.
    level = node.amplitude.out;
    if (!(level == level)) level = 0.0;
    morph = node.shape.out;
    if (!(morph == morph)) morph = 0.5;
    const double phaseParamNow = node.phaseParam.out;
    const double waveNow = node.waveform.out;
    waveform = (int)(waveNow + (waveNow >= 0.0 ? 0.5 : -0.5));
    if (waveform < 0) waveform = 0;
    if (waveform > 8) waveform = 8;

    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        // Match JS: hard phase jump + clear native integrator / noise state.
        soemdsp_polyblep_reset(node.nativeHandle);
        phase = phaseParamNow * kTwoPi;
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
    freq = clamp_hz_nyquist(freq, srD);
    double phaseInc = freq / srD;
    if (liveInc) phaseInc += g.mixIncrement[f];
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;
    soemdsp_polyblep_sample_masked(
      node.nativeHandle, phase, phaseInc, waveform, level, morph, mask
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
    phase = wrap_phase_pi(phase + kTwoPi * phaseInc);
  }
  // Store free-running phase without the Control phase offset (matches block path).
  node.phase = wrap_phase_pi(phase - node.phaseParam.out * kTwoPi);
}

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
  const bool controlSmoothing = node.frequency.active || node.resonance.active;

  if (!liveF && !controlSmoothing) {
    double freq = clamp_hz_nyquist(node.frequency.out, srD);
    if (freq < 0.0) freq = 0.0;
    soemdsp_ladder_filter_set_params(node.nativeHandle, freq, reso, mode, stages, srD);
    double* inPtr = ptr_from_export(soemdsp_ladder_filter_block_input_ptr(node.nativeHandle));
    double* outPtr = ptr_from_export(soemdsp_ladder_filter_block_output_ptr(node.nativeHandle));
    if (!inPtr || !outPtr) return;
    for (int f = 0; f < frames; f++) {
      inPtr[f] = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    }
    soemdsp_ladder_filter_process_block(node.nativeHandle, frames);
    copy_tap_to_buf(node.buf[kPortMono], outPtr, frames);
    copy_tap_to_buf(node.buf[kPortLeft], outPtr, frames);
    copy_tap_to_buf(node.buf[kPortRight], outPtr, frames);
    return;
  }

  // Live ƒ and/or Control chase: per-sample cutoff / resonance.
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    reso = node.resonance.out;
    if (!(reso == reso)) reso = 0.0;
    if (reso < 0.0) reso = 0.0;
    if (reso > 0.999) reso = 0.999;
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, srD);
    if (freq < 0.0) freq = 0.0;
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_ladder_filter_sample(
      node.nativeHandle, in, freq, reso, mode, stages, srD
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
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
  if (!(width == width) || width == 0.0) width = 2.0;
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
      in0[f] = g.mixMono[f];
      if (!hasLeftIn && !hasRightIn) {
        in0[f] += g.mixLeft[f] + g.mixRight[f];
      }
    }
    soemdsp_soft_clipper_process_block(node.nativeHandle, 0, frames);
    copy_tap_to_buf(node.buf[kPortMono], out0, frames);
  }

  if (hasLeftIn) {
    double* in1 = ptr_from_export(soemdsp_soft_clipper_block_input_ptr(node.nativeHandle, 1));
    double* out1 = ptr_from_export(soemdsp_soft_clipper_block_output_ptr(node.nativeHandle, 1));
    if (in1 && out1) {
      for (int f = 0; f < frames; f++) in1[f] = g.mixLeft[f] + g.mixMono[f];
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
      for (int f = 0; f < frames; f++) in2[f] = g.mixRight[f] + g.mixMono[f];
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

  double phase = wrap_phase_pi(node.phase + node.phaseParam.out * kTwoPi);
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
        phase = phaseParamNow * kTwoPi;
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
    freq = clamp_hz_nyquist(freq, srD);
    double phaseInc = freq / srD;
    if (liveInc) phaseInc += g.mixIncrement[f];
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;

    soemdsp_blit_sample(node.nativeHandle, phase, phaseInc, waveform, level);
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
    phase = wrap_phase_pi(phase + kTwoPi * phaseInc);
  }
  node.phase = wrap_phase_pi(phase - node.phaseParam.out * kTwoPi);
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

// Additive Osc: free-fn. Host phase in radians. stages=harmonics, shape=modA,
// center=harmonicPhaseAdd, width=harmonicPhaseMultiply, lpf=dampingFilterFrequency.
static void process_additive_osc(Circuit& g, Node& node, int frames) {
  const float sr = g.sampleRate < 1.0f ? 44100.0f : g.sampleRate;
  const double srD = (double)sr;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const bool controlSmoothing = node_control_smoothing(node);
  const double referenceVoltage = 48.0 / 120.0;

  double phase = wrap_phase_pi(node.phase + node.phaseParam.out * kTwoPi);
  if (!liveReset) node.lastReset = 0.0;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    if (liveReset) {
      const double rv = g.mixReset[f];
      if (node.lastReset <= 0.0 && rv > 0.0) {
        phase = node.phaseParam.out * kTwoPi;
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
    freq = clamp_hz_nyquist(freq, srD);
    double phaseInc = freq / srD;
    if (liveInc) phaseInc += g.mixIncrement[f];
    if (phaseInc > 0.5) phaseInc = 0.5;
    if (phaseInc < -0.5) phaseInc = -0.5;

    const double y = soemdsp_additive_osc_sample(
      phase,
      freq,
      node.stages.out,
      node.waveform.out,
      node.shape.out,
      node.center.out,
      node.width.out,
      node.amplitude.out,
      node.lpfFrequency.out,
      srD
    );
    node.buf[kPortMono][f] = y;
    node.buf[kPortLeft][f] = y;
    node.buf[kPortRight][f] = y;
    phase = wrap_phase_pi(phase + kTwoPi * phaseInc);
  }
  node.phase = wrap_phase_pi(phase - node.phaseParam.out * kTwoPi);
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
static void process_softwave_osc(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double referenceVoltage = 48.0 / 120.0;
  const double morph = node.shape.out;
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
static void process_dsf_oscillator(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const double referenceVoltage = 48.0 / 120.0;
  const double morph = node.shape.out;
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
static void process_ellipsoid(Circuit& g, Node& node, int frames) {
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool livePitch = mix_live_port(g, node, kPortPitchCv, frames, g.mixPitch);
  const bool liveInc = mix_live_port(g, node, kPortIncrement, frames, g.mixIncrement);
  const bool liveReset = mix_live_port(g, node, kPortReset, frames, g.mixReset);
  const double referenceVoltage = 48.0 / 120.0;
  const double phaseOff = node.phaseParam.out;
  const double shape = node.shape.out;
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
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
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
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_eq_filter_sample(
      node.nativeHandle, in, modeV, freq, node.resonance.out, node.gainDb.out, sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
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
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_active_filter_sample(
      node.nativeHandle, in, freq, node.resonance.out, mode, circuit, gainComp, sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
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
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_passive_filter_sample(
      node.nativeHandle, in, mode, node.hpfFrequency.out, node.lpfFrequency.out, sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
  }
}

// TB-303: frequency=cutoff Hz, gainDb=drive dB, resonance=%.
static void process_tb303_filter(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool liveF = mix_live_port(g, node, kPortF, frames, g.mixF);
  const bool controlSmoothing = node_control_smoothing(node) || node.gainDb.active;
  const double modeV = node.mode.out;
  int mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  if (mode < 0) mode = 0;
  if (mode > 14) mode = 14;
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = liveF ? g.mixF[f] : node.frequency.out;
    freq = clamp_hz_nyquist(freq, sr);
    if (freq < 0.0) freq = 0.0;
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double out = soemdsp_tb303_filter_sample(
      node.nativeHandle, in, freq, node.resonance.out, mode, node.gainDb.out, sr
    );
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
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
  const bool controlSmoothing = node_control_smoothing(node);
  int mode = 0;
  if (hasMode) {
    const double modeV = node.mode.out;
    mode = (int)(modeV + (modeV >= 0.0 ? 0.5 : -0.5));
  }
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    double freq = node.frequency.out;
    if (!(freq == freq)) freq = 0.5;
    if (freq < 0.0) freq = 0.0;
    if (freq > 1.0) freq = 1.0;
    const double in = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    double out;
    if (hasMode && sample5) {
      out = sample5(
        node.nativeHandle, in, freq, node.resonance.out, node.shape.out, mode, sr
      );
    } else if (sample4) {
      out = sample4(
        node.nativeHandle, in, freq, node.resonance.out, node.shape.out, sr
      );
    } else {
      out = 0.0;
    }
    node.buf[kPortMono][f] = out;
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
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

static void process_chaotic_phase_locking_filter(Circuit& g, Node& node, int frames) {
  process_norm_chaos_filter(
    g, node, frames, false, soemdsp_chaotic_phase_locking_filter_sample, nullptr
  );
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
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
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
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
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
    node.buf[kPortLeft][f] = out;
    node.buf[kPortRight][f] = out;
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

// Vactrol (series+custom): timeNumerator=attack, timeDenominator=release,
// shape=curve, width=sensitivity, center=lightOffset, mix=darkCurrent;
// amplitude scales Out.
static void process_vactrol_envelope(Circuit& g, Node& node, int frames) {
  if (node.nativeHandle <= 0) return;
  mix_node_inputs(g, node, frames);
  const double sr = g.sampleRate < 1.0f ? 44100.0 : (double)g.sampleRate;
  const bool controlSmoothing = node_control_smoothing(node);
  for (int f = 0; f < frames; f++) {
    if (controlSmoothing) smoother_step_node(g, node);
    const double light = g.mixMono[f] + g.mixLeft[f] + g.mixRight[f];
    const double env = soemdsp_vactrol_envelope_sample(
      node.nativeHandle,
      light,
      node.timeNumerator.out,
      node.timeDenominator.out,
      node.shape.out,
      node.width.out,
      node.center.out,
      node.mix.out,
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
    if (is_live_dst_port(clamp_dst_port(c.dstPort))) continue;
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
    || node.typeId == kTypeTransport
    || node.typeId == kTypeAliasSine
    || node.typeId == kTypeBlit
    || node.typeId == kTypeSineWavetable
    || node.typeId == kTypeAntisaw
    || node.typeId == kTypeArchimedes
    || node.typeId == kTypeAdditiveOsc
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
    || typeId == kTypeStepSequencer
    || typeId == kTypeTransport
    || typeId == kTypeAliasSine
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
    || typeId == kTypeVactrolEnvelope
    || typeId == kTypeDelayEffect
    || typeId == kTypeSoemReverb
    || typeId == kTypePll
    || typeId == kTypeLorenzAttractor
    || typeId == kTypeLogisticMap
    || typeId == kTypeHenonMap
    || typeId == kTypeChuaAttractor
    || typeId == kTypeRayBouncer;
  // additiveOsc / ellipsoid are free-fn (no native handle).
  if (needsNative) {
    n.nativeHandle = create_native_for_type(typeId, g->sampleRate);
    if (n.nativeHandle <= 0) {
      n.used = false;
      n.nativeKind = 0;
      return -5; // native instance pool exhausted
    }
    n.nativeKind = typeId;
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
    if (node.typeId == kTypeLutCell) {
      process_lut_cell(*g, node, frames);
      continue;
    }
    if (node.typeId == kTypeLookaheadLimiter) {
      process_lookahead_limiter(*g, node, frames);
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
    if (node.typeId == kTypeVactrolEnvelope) {
      process_vactrol_envelope(*g, node, frames);
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
  const int p = clamp_src_port(port);
  return g->nodes[idx].buf[p];
}

extern "C" int soemdsp_graph_max_block_frames() {
  return kMaxBlockFrames;
}

extern "C" int soemdsp_graph_version() {
  return 48; // + chaos CV 78–82 (lorenz/logistic/henon/chua/rayBouncer)
}
