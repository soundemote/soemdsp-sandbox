$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$clang = "C:\Program Files\LLVM\bin\clang++.exe"

if (!(Test-Path -LiteralPath $clang)) {
  throw "clang++ not found at $clang"
}

# Each native module compiles standalone (single .cpp -> .wasm, no cross-
# module linking), so this is a data-driven loop over the module list below
# instead of one repeated clang++ invocation per module. Add a new module by
# adding one entry here (Name, Exports, and Simd only if it uses <wasm_simd128.h>).
$modules = @(
  @{ Name = "wall_delay"; Simd = $false; Exports = @("soemdsp_wall_delay_version") }
  @{ Name = "comparator"; Simd = $false; Exports = @("soemdsp_comparator_create", "soemdsp_comparator_destroy", "soemdsp_comparator_sample", "soemdsp_comparator_up", "soemdsp_comparator_down", "soemdsp_comparator_change", "soemdsp_comparator_steady", "soemdsp_comparator_sign", "soemdsp_comparator_thru", "soemdsp_comparator_version") },
  @{ Name = "sample_delay"; Simd = $false; Exports = @("soemdsp_sample_delay_create", "soemdsp_sample_delay_destroy", "soemdsp_sample_delay_sample", "soemdsp_sample_delay_max_samples", "soemdsp_sample_delay_max_seconds", "soemdsp_sample_delay_version") },
  @{ Name = "min_max"; Simd = $false; Exports = @("soemdsp_min_max_create", "soemdsp_min_max_destroy", "soemdsp_min_max_sample", "soemdsp_min_max_min", "soemdsp_min_max_version") }
  @{ Name = "alias_sine"; Simd = $false; Exports = @("soemdsp_alias_sine_create", "soemdsp_alias_sine_destroy", "soemdsp_alias_sine_sample", "soemdsp_alias_sine_version", "soemdsp_alias_sine_metadata_json", "soemdsp_alias_sine_metadata_json_size") }
  @{ Name = "ellipsoid"; Simd = $false; Exports = @("soemdsp_ellipsoid_sample", "soemdsp_ellipsoid_version") }
  @{ Name = "sabrina_reverb"; Simd = $true; Exports = @("soemdsp_sabrina_reverb_create", "soemdsp_sabrina_reverb_destroy", "soemdsp_sabrina_reverb_reset", "soemdsp_sabrina_reverb_set_params", "soemdsp_sabrina_reverb_process", "soemdsp_sabrina_reverb_left", "soemdsp_sabrina_reverb_right", "soemdsp_sabrina_reverb_wet", "soemdsp_sabrina_reverb_wet_left", "soemdsp_sabrina_reverb_wet_right", "soemdsp_sabrina_reverb_version", "soemdsp_sabrina_reverb_process_block", "soemdsp_sabrina_reverb_block_input_left_ptr", "soemdsp_sabrina_reverb_block_input_right_ptr", "soemdsp_sabrina_reverb_block_output_left_ptr", "soemdsp_sabrina_reverb_block_output_right_ptr", "soemdsp_sabrina_reverb_max_block_frames") }
  @{ Name = "pll"; Simd = $false; Exports = @("soemdsp_pll_version", "soemdsp_pll_create", "soemdsp_pll_destroy", "soemdsp_pll_reset", "soemdsp_pll_set_params", "soemdsp_pll_process", "soemdsp_pll_vco_out", "soemdsp_pll_pc_out", "soemdsp_pll_lpf_out", "soemdsp_pll_locked") }
  @{ Name = "helmholtz"; Simd = $false; Exports = @("soemdsp_helmholtz_version", "soemdsp_helmholtz_create", "soemdsp_helmholtz_destroy", "soemdsp_helmholtz_set_params", "soemdsp_helmholtz_process", "soemdsp_helmholtz_frequency", "soemdsp_helmholtz_fidelity") }
  @{ Name = "noise_generator"; Simd = $true; Exports = @("soemdsp_noise_generator_create", "soemdsp_noise_generator_destroy", "soemdsp_noise_generator_sample", "soemdsp_noise_generator_left", "soemdsp_noise_generator_right", "soemdsp_noise_generator_version", "soemdsp_noise_generator_process_block", "soemdsp_noise_generator_block_output_left_ptr", "soemdsp_noise_generator_block_output_right_ptr", "soemdsp_noise_generator_max_block_frames") }
  @{ Name = "soft_clipper"; Simd = $false; Exports = @("soemdsp_soft_clipper_sample", "soemdsp_soft_clipper_version", "soemdsp_soft_clipper_metadata_json", "soemdsp_soft_clipper_metadata_json_size") }
  @{ Name = "fractal_brownian_noise"; Simd = $true; Exports = @("soemdsp_fbm_create", "soemdsp_fbm_destroy", "soemdsp_fbm_reset", "soemdsp_fbm_sample", "soemdsp_fbm_x", "soemdsp_fbm_y", "soemdsp_fbm_z", "soemdsp_fbm_x_raw", "soemdsp_fbm_y_raw", "soemdsp_fbm_z_raw", "soemdsp_fbm_version", "soemdsp_fbm_process_block", "soemdsp_fbm_block_output_x_ptr", "soemdsp_fbm_block_output_y_ptr", "soemdsp_fbm_block_output_z_ptr", "soemdsp_fbm_block_output_x_raw_ptr", "soemdsp_fbm_block_output_y_raw_ptr", "soemdsp_fbm_block_output_z_raw_ptr", "soemdsp_fbm_max_block_frames") }
  @{ Name = "ladder_filter"; Simd = $false; Exports = @("soemdsp_ladder_filter_create", "soemdsp_ladder_filter_destroy", "soemdsp_ladder_filter_sample", "soemdsp_ladder_filter_version", "soemdsp_ladder_filter_metadata_json", "soemdsp_ladder_filter_metadata_json_size") }
  @{ Name = "flower_child_filter"; Simd = $false; Exports = @("soemdsp_flower_child_filter_create", "soemdsp_flower_child_filter_destroy", "soemdsp_flower_child_filter_sample", "soemdsp_flower_child_filter_version") }
  @{ Name = "rsmet_filter"; Simd = $false; Exports = @("soemdsp_rsmet_filter_create", "soemdsp_rsmet_filter_destroy", "soemdsp_rsmet_filter_sample", "soemdsp_rsmet_filter_version") }
  @{ Name = "yellowjacket_filter"; Simd = $false; Exports = @("soemdsp_yellowjacket_filter_create", "soemdsp_yellowjacket_filter_destroy", "soemdsp_yellowjacket_filter_sample", "soemdsp_yellowjacket_filter_version") }
  @{ Name = "superlove_filter"; Simd = $false; Exports = @("soemdsp_superlove_filter_create", "soemdsp_superlove_filter_destroy", "soemdsp_superlove_filter_sample", "soemdsp_superlove_filter_version") }
  @{ Name = "chaotic_phase_locking_filter"; Simd = $false; Exports = @("soemdsp_chaotic_phase_locking_filter_create", "soemdsp_chaotic_phase_locking_filter_destroy", "soemdsp_chaotic_phase_locking_filter_sample", "soemdsp_chaotic_phase_locking_filter_version") }
  @{ Name = "resonator_filter"; Simd = $false; Exports = @("soemdsp_resonator_filter_create", "soemdsp_resonator_filter_destroy", "soemdsp_resonator_filter_sample", "soemdsp_resonator_filter_version") }
  @{ Name = "human_filter"; Simd = $false; Exports = @("soemdsp_human_filter_create", "soemdsp_human_filter_destroy", "soemdsp_human_filter_sample", "soemdsp_human_filter_version") }
  @{ Name = "pulse_explosion"; Simd = $false; Exports = @("soemdsp_pulse_explosion_create", "soemdsp_pulse_explosion_destroy", "soemdsp_pulse_explosion_sample", "soemdsp_pulse_explosion_curve", "soemdsp_pulse_explosion_version") }
  @{ Name = "tb303_filter"; Simd = $false; Exports = @("soemdsp_tb303_filter_create", "soemdsp_tb303_filter_destroy", "soemdsp_tb303_filter_sample", "soemdsp_tb303_filter_version", "soemdsp_tb303_filter_metadata_json", "soemdsp_tb303_filter_metadata_json_size") }
  @{ Name = "passive_filter"; Simd = $false; Exports = @("soemdsp_passive_filter_create", "soemdsp_passive_filter_destroy", "soemdsp_passive_filter_sample", "soemdsp_passive_filter_version", "soemdsp_passive_filter_metadata_json", "soemdsp_passive_filter_metadata_json_size") }
  @{ Name = "vactrol_envelope"; Simd = $false; Exports = @("soemdsp_vactrol_envelope_create", "soemdsp_vactrol_envelope_destroy", "soemdsp_vactrol_envelope_sample", "soemdsp_vactrol_envelope_version", "soemdsp_vactrol_envelope_metadata_json", "soemdsp_vactrol_envelope_metadata_json_size") }
  @{ Name = "shooting_star_explosion"; Simd = $false; Exports = @("soemdsp_shooting_star_explosion_power", "soemdsp_shooting_star_explosion_version", "soemdsp_shooting_star_explosion_metadata_json", "soemdsp_shooting_star_explosion_metadata_json_size") }
  @{ Name = "polyblep"; Simd = $false; Exports = @("soemdsp_polyblep_create", "soemdsp_polyblep_destroy", "soemdsp_polyblep_reset", "soemdsp_polyblep_sample", "soemdsp_polyblep_out", "soemdsp_polyblep_saw", "soemdsp_polyblep_ramp", "soemdsp_polyblep_square", "soemdsp_polyblep_tri", "soemdsp_polyblep_sine", "soemdsp_polyblep_version") }
  @{ Name = "logistic_map"; Simd = $false; Exports = @("soemdsp_logistic_map_create", "soemdsp_logistic_map_destroy", "soemdsp_logistic_map_sample", "soemdsp_logistic_map_version") }
  @{ Name = "pitch_quantizer"; Simd = $false; Exports = @("soemdsp_pitch_quantizer_create", "soemdsp_pitch_quantizer_destroy", "soemdsp_pitch_quantizer_sample", "soemdsp_pitch_quantizer_version") }
  @{ Name = "surge_oscillator"; Simd = $false; Exports = @("soemdsp_surge_oscillator_create", "soemdsp_surge_oscillator_destroy", "soemdsp_surge_oscillator_reset", "soemdsp_surge_oscillator_sample", "soemdsp_surge_oscillator_out", "soemdsp_surge_oscillator_saw", "soemdsp_surge_oscillator_square", "soemdsp_surge_oscillator_tri", "soemdsp_surge_oscillator_sine", "soemdsp_surge_oscillator_synced", "soemdsp_surge_oscillator_internal_sync", "soemdsp_surge_oscillator_version") }
  @{ Name = "dsf_oscillator"; Simd = $false; Exports = @("soemdsp_dsf_oscillator_create", "soemdsp_dsf_oscillator_destroy", "soemdsp_dsf_oscillator_reset", "soemdsp_dsf_oscillator_sample", "soemdsp_dsf_oscillator_out", "soemdsp_dsf_oscillator_version") }
  @{ Name = "robin_supersaw"; Simd = $false; Exports = @("soemdsp_robin_supersaw_create", "soemdsp_robin_supersaw_destroy", "soemdsp_robin_supersaw_reset", "soemdsp_robin_supersaw_sample", "soemdsp_robin_supersaw_left", "soemdsp_robin_supersaw_right", "soemdsp_robin_supersaw_mono", "soemdsp_robin_supersaw_version") }
  @{ Name = "henon_map"; Simd = $false; Exports = @("soemdsp_henon_map_create", "soemdsp_henon_map_destroy", "soemdsp_henon_map_sample", "soemdsp_henon_map_x", "soemdsp_henon_map_y", "soemdsp_henon_map_version") }
  @{ Name = "ray_bouncer"; Simd = $false; Exports = @("soemdsp_ray_bouncer_create", "soemdsp_ray_bouncer_destroy", "soemdsp_ray_bouncer_sample", "soemdsp_ray_bouncer_x", "soemdsp_ray_bouncer_y", "soemdsp_ray_bouncer_version") }
  @{ Name = "chua_attractor"; Simd = $false; Exports = @("soemdsp_chua_attractor_create", "soemdsp_chua_attractor_destroy", "soemdsp_chua_attractor_sample", "soemdsp_chua_attractor_x", "soemdsp_chua_attractor_y", "soemdsp_chua_attractor_z", "soemdsp_chua_attractor_version") }
  @{ Name = "jerobeam_wirdo_spiral"; Simd = $false; Exports = @("soemdsp_jbwirdo_create", "soemdsp_jbwirdo_destroy", "soemdsp_jbwirdo_reset", "soemdsp_jbwirdo_sample", "soemdsp_jbwirdo_x", "soemdsp_jbwirdo_y", "soemdsp_jbwirdo_version") }
  @{ Name = "jerobeam_blubb"; Simd = $false; Exports = @("soemdsp_jbblubb_create", "soemdsp_jbblubb_destroy", "soemdsp_jbblubb_reset", "soemdsp_jbblubb_sample", "soemdsp_jbblubb_x", "soemdsp_jbblubb_y", "soemdsp_jbblubb_version") }
  @{ Name = "jerobeam_mushroom"; Simd = $false; Exports = @("soemdsp_jbmushroom_create", "soemdsp_jbmushroom_destroy", "soemdsp_jbmushroom_reset", "soemdsp_jbmushroom_sample", "soemdsp_jbmushroom_x", "soemdsp_jbmushroom_y", "soemdsp_jbmushroom_version") }
  @{ Name = "jerobeam_boing"; Simd = $false; Exports = @("soemdsp_jbboing_create", "soemdsp_jbboing_destroy", "soemdsp_jbboing_reset", "soemdsp_jbboing_sample", "soemdsp_jbboing_x", "soemdsp_jbboing_y", "soemdsp_jbboing_version") }
  @{ Name = "jerobeam_torus"; Simd = $false; Exports = @("soemdsp_jbtorus_create", "soemdsp_jbtorus_destroy", "soemdsp_jbtorus_reset", "soemdsp_jbtorus_sample", "soemdsp_jbtorus_x", "soemdsp_jbtorus_y", "soemdsp_jbtorus_version") }
  @{ Name = "jerobeam_kepler_bouwkamp"; Simd = $false; Exports = @("soemdsp_jbkepler_create", "soemdsp_jbkepler_destroy", "soemdsp_jbkepler_reset", "soemdsp_jbkepler_sample", "soemdsp_jbkepler_x", "soemdsp_jbkepler_y", "soemdsp_jbkepler_version") }
  @{ Name = "jerobeam_nyquist_shannon"; Simd = $false; Exports = @("soemdsp_jbnyquist_create", "soemdsp_jbnyquist_destroy", "soemdsp_jbnyquist_reset", "soemdsp_jbnyquist_sample", "soemdsp_jbnyquist_x", "soemdsp_jbnyquist_y", "soemdsp_jbnyquist_version") }
  @{ Name = "jerobeam_radar"; Simd = $false; Exports = @("soemdsp_jbradar_create", "soemdsp_jbradar_destroy", "soemdsp_jbradar_reset", "soemdsp_jbradar_sample", "soemdsp_jbradar_x", "soemdsp_jbradar_y", "soemdsp_jbradar_version") }
  @{ Name = "archimedes"; Simd = $false; Exports = @("soemdsp_archimedes_create", "soemdsp_archimedes_destroy", "soemdsp_archimedes_reset", "soemdsp_archimedes_reset_counters", "soemdsp_archimedes_step", "soemdsp_archimedes_sine", "soemdsp_archimedes_cosine", "soemdsp_archimedes_extract_pi", "soemdsp_archimedes_total_steps", "soemdsp_archimedes_zero_crossings", "soemdsp_archimedes_set_profile", "soemdsp_archimedes_set_frequency", "soemdsp_archimedes_set_amplitude", "soemdsp_archimedes_set_phase", "soemdsp_archimedes_shift_phase", "soemdsp_archimedes_version") }
  @{ Name = "blit"; Simd = $false; Exports = @("soemdsp_blit_create", "soemdsp_blit_destroy", "soemdsp_blit_reset", "soemdsp_blit_sample", "soemdsp_blit_out", "soemdsp_blit_saw", "soemdsp_blit_square", "soemdsp_blit_tri", "soemdsp_blit_sine", "soemdsp_blit_ramp", "soemdsp_blit_version") }
  @{ Name = "linear_envelope"; Simd = $false; Exports = @("soemdsp_linear_envelope_create", "soemdsp_linear_envelope_destroy", "soemdsp_linear_envelope_sample", "soemdsp_linear_envelope_version", "soemdsp_linear_envelope_metadata_json", "soemdsp_linear_envelope_metadata_json_size") }
  @{ Name = "pluck_envelope"; Simd = $false; Exports = @("soemdsp_pluck_envelope_create", "soemdsp_pluck_envelope_destroy", "soemdsp_pluck_envelope_sample", "soemdsp_pluck_envelope_version", "soemdsp_pluck_envelope_metadata_json", "soemdsp_pluck_envelope_metadata_json_size") }
  @{ Name = "exp_adsr"; Simd = $false; Exports = @("soemdsp_exp_adsr_create", "soemdsp_exp_adsr_destroy", "soemdsp_exp_adsr_sample", "soemdsp_exp_adsr_version", "soemdsp_exp_adsr_metadata_json", "soemdsp_exp_adsr_metadata_json_size") }
  @{ Name = "random_walk"; Simd = $false; Exports = @("soemdsp_random_walk_create", "soemdsp_random_walk_destroy", "soemdsp_random_walk_reset_seed", "soemdsp_random_walk_sample", "soemdsp_random_walk_version", "soemdsp_random_walk_metadata_json", "soemdsp_random_walk_metadata_json_size") }
  @{ Name = "pi_spigot_noise"; Simd = $false; Exports = @("soemdsp_pi_spigot_noise_create", "soemdsp_pi_spigot_noise_destroy", "soemdsp_pi_spigot_noise_reset_seed", "soemdsp_pi_spigot_noise_sample", "soemdsp_pi_spigot_noise_version", "soemdsp_pi_spigot_noise_metadata_json", "soemdsp_pi_spigot_noise_metadata_json_size") }
  @{ Name = "lorenz_attractor"; Simd = $false; Exports = @("soemdsp_lorenz_attractor_create", "soemdsp_lorenz_attractor_destroy", "soemdsp_lorenz_attractor_sample", "soemdsp_lorenz_attractor_x", "soemdsp_lorenz_attractor_y", "soemdsp_lorenz_attractor_z", "soemdsp_lorenz_attractor_version", "soemdsp_lorenz_attractor_metadata_json", "soemdsp_lorenz_attractor_metadata_json_size") }
  @{ Name = "sine_wavetable"; Simd = $false; Exports = @("soemdsp_sine_wavetable_create", "soemdsp_sine_wavetable_destroy", "soemdsp_sine_wavetable_sample", "soemdsp_sine_wavetable_sin", "soemdsp_sine_wavetable_cos", "soemdsp_sine_wavetable_version", "soemdsp_sine_wavetable_metadata_json", "soemdsp_sine_wavetable_metadata_json_size") }
  @{ Name = "log_spiral"; Simd = $false; Exports = @("soemdsp_log_spiral_create", "soemdsp_log_spiral_destroy", "soemdsp_log_spiral_sample", "soemdsp_log_spiral_x", "soemdsp_log_spiral_y", "soemdsp_log_spiral_z", "soemdsp_log_spiral_version", "soemdsp_log_spiral_metadata_json", "soemdsp_log_spiral_metadata_json_size") }
  @{ Name = "fractal_spiral"; Simd = $false; Exports = @("soemdsp_fractal_spiral_create", "soemdsp_fractal_spiral_destroy", "soemdsp_fractal_spiral_sample", "soemdsp_fractal_spiral_x", "soemdsp_fractal_spiral_y", "soemdsp_fractal_spiral_z", "soemdsp_fractal_spiral_version", "soemdsp_fractal_spiral_metadata_json", "soemdsp_fractal_spiral_metadata_json_size") }
  @{ Name = "jerobeam_spiral"; Simd = $false; Exports = @("soemdsp_jerobeam_spiral_create", "soemdsp_jerobeam_spiral_destroy", "soemdsp_jerobeam_spiral_sample", "soemdsp_jerobeam_spiral_x", "soemdsp_jerobeam_spiral_y", "soemdsp_jerobeam_spiral_z", "soemdsp_jerobeam_spiral_left", "soemdsp_jerobeam_spiral_right", "soemdsp_jerobeam_spiral_version", "soemdsp_jerobeam_spiral_metadata_json", "soemdsp_jerobeam_spiral_metadata_json_size") }
  @{ Name = "additive_osc"; Simd = $false; Exports = @("soemdsp_additive_osc_sample", "soemdsp_additive_osc_version", "soemdsp_additive_osc_metadata_json", "soemdsp_additive_osc_metadata_json_size") }
  @{ Name = "delay_effect"; Simd = $false; Exports = @("soemdsp_delay_effect_create", "soemdsp_delay_effect_destroy", "soemdsp_delay_effect_sample", "soemdsp_delay_effect_out", "soemdsp_delay_effect_wet", "soemdsp_delay_effect_version", "soemdsp_delay_effect_metadata_json", "soemdsp_delay_effect_metadata_json_size") }
  @{ Name = "basic_oscillator"; Simd = $false; Exports = @("soemdsp_basic_oscillator_create", "soemdsp_basic_oscillator_destroy", "soemdsp_basic_oscillator_sample", "soemdsp_basic_oscillator_version", "soemdsp_basic_oscillator_metadata_json", "soemdsp_basic_oscillator_metadata_json_size") }
  @{ Name = "hypersaw"; Simd = $false; Exports = @("soemdsp_hypersaw_create", "soemdsp_hypersaw_destroy", "soemdsp_hypersaw_reset", "soemdsp_hypersaw_sample", "soemdsp_hypersaw_left", "soemdsp_hypersaw_right", "soemdsp_hypersaw_voice_phase", "soemdsp_hypersaw_max_voices", "soemdsp_hypersaw_version") }
  @{ Name = "video_synth_raster"; Simd = $false; Exports = @("soemdsp_video_synth_raster_create", "soemdsp_video_synth_raster_destroy", "soemdsp_video_synth_raster_reset", "soemdsp_video_synth_raster_process_block", "soemdsp_video_synth_raster_output_ptr", "soemdsp_video_synth_raster_max_width", "soemdsp_video_synth_raster_max_height", "soemdsp_video_synth_raster_version") }
  @{ Name = "chord_sequencer"; Simd = $false; Exports = @("soemdsp_chord_sequencer_create", "soemdsp_chord_sequencer_destroy", "soemdsp_chord_sequencer_sample", "soemdsp_chord_sequencer_scale", "soemdsp_chord_sequencer_root", "soemdsp_chord_sequencer_step", "soemdsp_chord_sequencer_version") }
  @{ Name = "lut_cell"; Simd = $false; Exports = @("soemdsp_lut_cell_create", "soemdsp_lut_cell_destroy", "soemdsp_lut_cell_sample", "soemdsp_lut_cell_q", "soemdsp_lut_cell_version") }
  @{ Name = "metallic_ratio"; Simd = $false; Exports = @("soemdsp_metallic_ratio_sample", "soemdsp_metallic_ratio_version", "soemdsp_metallic_ratio_metadata_json", "soemdsp_metallic_ratio_metadata_json_size") }
  @{ Name = "bradley_2a"; Simd = $false; Exports = @("soemdsp_bradley_2a_create", "soemdsp_bradley_2a_destroy", "soemdsp_bradley_2a_sample", "soemdsp_bradley_2a_version", "soemdsp_bradley_2a_metadata_json", "soemdsp_bradley_2a_metadata_json_size") }
  @{ Name = "antisaw"; Simd = $false; Exports = @("soemdsp_antisaw_create", "soemdsp_antisaw_destroy", "soemdsp_antisaw_sample", "soemdsp_antisaw_version", "soemdsp_antisaw_metadata_json", "soemdsp_antisaw_metadata_json_size") }
  @{ Name = "videoscope"; Simd = $false; Exports = @("soemdsp_videoscope_create", "soemdsp_videoscope_destroy", "soemdsp_videoscope_push", "soemdsp_videoscope_window_size", "soemdsp_videoscope_column_min", "soemdsp_videoscope_column_max", "soemdsp_videoscope_xy_a", "soemdsp_videoscope_xy_b", "soemdsp_videoscope_version") }
  @{ Name = "transport"; Simd = $false; Exports = @("soemdsp_transport_create", "soemdsp_transport_destroy", "soemdsp_transport_sample", "soemdsp_transport_unipolar", "soemdsp_transport_version") }
  @{ Name = "slew_limiter"; Simd = $false; Exports = @("soemdsp_slew_limiter_create", "soemdsp_slew_limiter_destroy", "soemdsp_slew_limiter_sample", "soemdsp_slew_limiter_version") }
  @{ Name = "sample_hold"; Simd = $false; Exports = @("soemdsp_sample_hold_create", "soemdsp_sample_hold_destroy", "soemdsp_sample_hold_sample", "soemdsp_sample_hold_version") }
  @{ Name = "chord_memory"; Simd = $false; Exports = @("soemdsp_chord_memory_create", "soemdsp_chord_memory_destroy", "soemdsp_chord_memory_sample", "soemdsp_chord_memory_note2", "soemdsp_chord_memory_note3", "soemdsp_chord_memory_note4", "soemdsp_chord_memory_arp", "soemdsp_chord_memory_gate", "soemdsp_chord_memory_version") }
  @{ Name = "turing_machine"; Simd = $false; Exports = @("soemdsp_turing_machine_create", "soemdsp_turing_machine_destroy", "soemdsp_turing_machine_sample", "soemdsp_turing_machine_scale", "soemdsp_turing_machine_gate", "soemdsp_turing_machine_version") }
  @{ Name = "flower_child_envelope_follower"; Simd = $false; Exports = @("soemdsp_flower_child_envelope_follower_create", "soemdsp_flower_child_envelope_follower_destroy", "soemdsp_flower_child_envelope_follower_sample", "soemdsp_flower_child_envelope_follower_version") }
  @{ Name = "trigger_divider"; Simd = $false; Exports = @("soemdsp_trigger_divider_create", "soemdsp_trigger_divider_destroy", "soemdsp_trigger_divider_sample", "soemdsp_trigger_divider_version") }
  @{ Name = "step_sequencer"; Simd = $false; Exports = @("soemdsp_step_sequencer_create", "soemdsp_step_sequencer_destroy", "soemdsp_step_sequencer_sample", "soemdsp_step_sequencer_gate", "soemdsp_step_sequencer_version") }
  @{ Name = "trigger_counter"; Simd = $false; Exports = @("soemdsp_trigger_counter_create", "soemdsp_trigger_counter_destroy", "soemdsp_trigger_counter_sample", "soemdsp_trigger_counter_count", "soemdsp_trigger_counter_version") }
  @{ Name = "delayed_trigger"; Simd = $false; Exports = @("soemdsp_delayed_trigger_create", "soemdsp_delayed_trigger_destroy", "soemdsp_delayed_trigger_sample", "soemdsp_delayed_trigger_version") }
  @{ Name = "clock"; Simd = $false; Exports = @("soemdsp_clock_create", "soemdsp_clock_destroy", "soemdsp_clock_sample", "soemdsp_clock_analog_out", "soemdsp_clock_pulse", "soemdsp_clock_version") }
  @{ Name = "random_clock"; Simd = $false; Exports = @("soemdsp_random_clock_create", "soemdsp_random_clock_destroy", "soemdsp_random_clock_sample", "soemdsp_random_clock_gate", "soemdsp_random_clock_version") },
  @{ Name = "ping_pong_delay"; Simd = $false; Exports = @("soemdsp_ping_pong_delay_create", "soemdsp_ping_pong_delay_destroy", "soemdsp_ping_pong_delay_sample", "soemdsp_ping_pong_delay_right", "soemdsp_ping_pong_delay_version") },
  @{ Name = "papoulis_filter"; Simd = $false; Exports = @("soemdsp_papoulis_filter_create", "soemdsp_papoulis_filter_destroy", "soemdsp_papoulis_filter_sample", "soemdsp_papoulis_filter_snap", "soemdsp_papoulis_filter_version") },
  @{ Name = "phosphillator"; Simd = $false; Exports = @("soemdsp_phosphillator_create", "soemdsp_phosphillator_destroy", "soemdsp_phosphillator_path_x_ptr", "soemdsp_phosphillator_path_y_ptr", "soemdsp_phosphillator_max_path_points", "soemdsp_phosphillator_set_path", "soemdsp_phosphillator_clear_path", "soemdsp_phosphillator_sample", "soemdsp_phosphillator_y", "soemdsp_phosphillator_version") }
)

foreach ($module in $modules) {
  # -msimd128 for ALL modules (not just the ones using <wasm_simd128.h>
  # explicitly): wasm SIMD has been baseline in every browser since 2021,
  # and the flag lets clang autovectorize ordinary scalar DSP loops.
  $clangArgs = @("--target=wasm32", "-O3", "-msimd128", "-nostdlib", "-fno-exceptions", "-fno-rtti")
  $clangArgs += "-Wl,--no-entry"
  foreach ($export in $module.Exports) {
    $clangArgs += "-Wl,--export=$export"
  }
  $clangArgs += "-Wl,--export-memory"
  # Declare a bounded maximum for each module's linear memory. No module
  # calls memory.grow (all state is static; -nostdlib, no malloc), so a
  # bound changes nothing at runtime -- but an UNbounded wasm memory makes
  # V8 reserve the full 4GB growth range of virtual address space, and
  # Chrome caps the per-process total of such reservations (~100 memories).
  # With ~77 modules live in the audio worklet at once, unbounded memories
  # sat right at that cap and instantiation OOM'd. 768 pages (48MB) covers
  # the largest module (ping_pong_delay, 752 initial pages).
  $clangArgs += "-Wl,--max-memory=50331648"
  $clangArgs += "-o"
  $clangArgs += "$root\native_modules\$($module.Name)\$($module.Name).wasm"
  $clangArgs += "$root\native_modules\$($module.Name)\$($module.Name).cpp"

  & $clang @clangArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed for native module: $($module.Name)"
  }
}

Write-Output "Built $($modules.Count) native modules."

# ---------------------------------------------------------------------------
# Combined build: link every module into ONE .wasm sharing ONE linear memory.
#
# Why: each standalone .wasm instantiated in the audio worklet gets its own
# WebAssembly memory, and Chrome/V8 caps the per-process number of wasm
# memories (~100, via per-memory virtual address space reservations). The
# full catalog live at once sat at that cap and instantiation OOM'd. One
# combined instance uses exactly one memory, so the cap is out of the
# picture entirely. The per-module .wasm files above are still built and
# shipped -- the "Check All Modules" self-test and any standalone demo pages
# use them -- but the live worklet loads only the combined binary.
#
# Every module keeps its own statics (separate translation units), and all
# exports are prefix-namespaced (soemdsp_<module>_*), so linking them
# together changes nothing about their behavior. Verified: all objects link
# with zero duplicate-symbol errors and all 525 exports resolve.
$wasmLd = Join-Path (Split-Path -Parent $clang) "wasm-ld.exe"
if (!(Test-Path -LiteralPath $wasmLd)) {
  throw "wasm-ld not found at $wasmLd"
}
$combinedDir = "$root\native_modules\combined"
$objDir = "$combinedDir\obj"
New-Item -ItemType Directory -Force -Path $objDir | Out-Null

$objFiles = @()
foreach ($module in $modules) {
  # -msimd128 everywhere (autovectorization; baseline since 2021) and -flto:
  # objects carry LLVM bitcode so wasm-ld optimizes ACROSS module boundaries
  # at link time -- the modules share a lot of structurally identical helper
  # math (clamps, interpolators, smoothers) that LTO merges and inlines.
  $compileArgs = @("--target=wasm32", "-O3", "-msimd128", "-flto", "-nostdlib", "-fno-exceptions", "-fno-rtti")
  $obj = "$objDir\$($module.Name).o"
  $compileArgs += @("-c", "$root\native_modules\$($module.Name)\$($module.Name).cpp", "-o", $obj)
  & $clang @compileArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Combined build: compile failed for $($module.Name)"
  }
  $objFiles += $obj
}
# Freestanding memset/memcpy/etc. -- the one-step per-module clang link
# resolves these via the driver, but a direct wasm-ld link of many objects
# does not, so shim.cpp provides them once for the combined binary.
$shimObj = "$objDir\zz_shim.o"
& $clang @("--target=wasm32", "-O3", "-msimd128", "-flto", "-nostdlib", "-fno-builtin", "-fno-exceptions", "-fno-rtti", "-c", "$combinedDir\shim.cpp", "-o", $shimObj)
if ($LASTEXITCODE -ne 0) {
  throw "Combined build: compile failed for shim.cpp"
}
$objFiles += $shimObj

# All exports via a response file (the flat argument list would exceed
# command-line length limits with 500+ --export flags).
$responseFile = "$objDir\exports.rsp"
$responseLines = foreach ($module in $modules) {
  foreach ($export in $module.Exports) { "--export=$export" }
}
Set-Content -LiteralPath $responseFile -Value $responseLines -Encoding ascii

# 128MB max: the combined static pools (delay lines, reverb, wavetables)
# total ~101MB of initial memory; a bounded max keeps V8's reservation small.
$ldArgs = @(
  "--no-entry",
  "--export-memory",
  "--max-memory=134217728",
  "@$responseFile",
  "-o", "$combinedDir\soemdsp_combined.wasm"
) + $objFiles
& $wasmLd @ldArgs
if ($LASTEXITCODE -ne 0) {
  throw "Combined build: wasm-ld link failed"
}
Write-Output "Built combined native module: native_modules\combined\soemdsp_combined.wasm"

# Smoke test: instantiate the combined binary and call every _version()
# export, failing the build on any missing export or bad startup. Requires
# node; skipped with a loud warning if it isn't installed.
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  & $node.Source "$root\scripts\smoke_test_combined.js" "$combinedDir\soemdsp_combined.wasm" $responseFile
  if ($LASTEXITCODE -ne 0) {
    throw "Combined build: smoke test FAILED (see output above)"
  }
} else {
  Write-Warning "node not found -- combined wasm smoke test SKIPPED. Install Node.js to enable it."
}
