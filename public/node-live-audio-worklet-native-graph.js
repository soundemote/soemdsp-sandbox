// MVEP GraphEngine host (PR-E4): setPlan → native compile; process → one
// soemdsp_graph_process_block per quantum. Efficient path: write Control
// targets (+ smooth times) only — native SmootherManager chases. Live ƒ / CV
// ports map into the native graph; scope taps from node_port_ptr.
// Node id hashing: FNV-1a 32-bit (offset 2166136261, prime 16777619).

NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS = Object.freeze({
  polyBlep: 1,
  ladderFilter: 2,
  softClipper: 3,
  reverbEffect: 4,
  pingPongDelay: 5,
  output: 6,
  attenuverter: 7,
  range: 8,
  inv: 9,
  u2b: 10,
  b2u: 11,
  bias: 12,
  gain: 13,
  noiseGenerator: 14,
  robinSinusoid: 15,
  robinSupersaw: 16,
  slewLimiter: 17,
  comparator: 18,
  sampleDelay: 19,
  sampleHold: 20,
  minMax: 21,
  mix: 22,
  mixStereo: 23,
  clipperLimiter: 24,
  midSideEncode: 25,
  vectorscopeTransform: 26,
  rotate3dTo2d: 27,
  clock: 28,
  triggerDivider: 29,
  delayedTrigger: 30,
  randomClock: 31,
  triggerCounter: 32,
  metallicRatio: 33,
  lutCell: 34,
  lookaheadLimiter: 35,
  limiter: 109, // Pump Limiter
  stepSequencer: 36,
  transport: 37,
  aliasSine: 38,
  blit: 39,
  sineWavetable: 40,
  antisaw: 41,
  archimedes: 42,
  additiveOsc: 43,
  surgeOscillator: 44,
  softwaveOsc: 45,
  dsfOscillator: 46,
  hypersaw: 47,
  sinc: 48,
  bradley2a: 49,
  ellipsoid: 50,
  snowflake: 51,
  butterworth: 52,
  linkwitzRiley: 53,
  bessel: 54,
  chebyshev: 55,
  elliptic: 56,
  eqFilter: 57,
  activeFilter: 58,
  passiveFilter: 59,
  tb303Filter: 60,
  flowerChildFilter: 61,
  yellowjacketFilter: 62,
  superloveFilter: 63,
  humanFilter: 64,
  resonatorFilter: 65,
  combResonator: 66,
  modeResonator: 67,
  chaoticPhaseLockingFilter: 68,
  inertialFilter: 69,
  expAdsr: 70,
  linearEnvelope: 71,
  pluckEnvelope: 72,
  flowerChildEnvelopeFollower: 73,
  // removed: vactrol (was 74)
  delayEffect: 75,
  // wallDelay skipped — native placeholder only
  soemReverb: 76,
  pll: 77,
  lorenzAttractor: 78,
  logisticMap: 79,
  henonMap: 80,
  chuaAttractor: 81,
  rayBouncer: 82,
  chordMemory: 83,
  chordSequencer: 84,
  pitchQuantizer: 85,
  turingMachine: 86,
  fractalBrownianNoise: 87,
  piSpigotNoise: 88,
  randomWalk: 89,
  cheapWalk: 108,
  pulseExplosion: 90,
  spiral: 91,
  fractalSpiral: 92,
  logSpiral: 93,
  blubb: 94,
  boing: 95,
  keplerBouwkamp: 96,
  mushroom: 97,
  nyquistShannon: 98,
  radar: 99,
  torus: 100,
  wirdoSpiral: 101,
  phosphillator: 102,
  crossover2: 103,
  crossover3: 104,
  crossover4: 105,
  crossover5: 106,
  crossover6: 107,
});

// Param IDs — keep in sync with graph_engine.cpp kParam*.
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_VOLUME_DB = 0;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_PAN = 1;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_FREQUENCY = 10;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_WAVEFORM = 11;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_AMPLITUDE = 12;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_SHAPE = 13;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_PHASE = 14;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_RESONANCE = 20;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_MODE = 21;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_STAGES = 22;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_CENTER = 30;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_WIDTH = 31;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_OVERSAMPLE = 32;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_MIX = 40;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE = 41;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT = 42;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_DELAY_SIZE = 43;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_RECYCLE = 44;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_AMPLITUDE = 45;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_BASE_SPEED = 46;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_VARIATION = 47;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_SEED = 48;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_FEEDBACK = 50;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LEVEL = 51;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_TIME_NUMERATOR = 52;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR = 53;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_TIMING_MODE = 54;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_OFFSET_MS = 55;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_STYLE = 56;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LFO_RATE = 57;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_SATURATE = 58;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LPF_FREQUENCY = 59;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_HPF_FREQUENCY = 60;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_TEMPO_BPM = 61;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_ATT_AMPLITUDE = 70;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_ATT_OFFSET = 71;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_IN_LOW = 80;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_IN_HIGH = 81;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_OUT_LOW = 82;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_OUT_HIGH = 83;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_GAIN_DB = 90;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_GAIN_LEFT_DB = 91;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_GAIN_RIGHT_DB = 92;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_GAIN_MONO_SUM = 93;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LANE_VOL1 = 100;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LANE_VOL2 = 101;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LANE_VOL3 = 102;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LANE_VOL4 = 103;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LANE_BIAS1 = 104;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LANE_BIAS2 = 105;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LANE_BIAS3 = 106;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_LANE_BIAS4 = 107;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_BLEED2 = 108;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_BLEED3 = 109;
NodeLiveAudioProcessor.NATIVE_GRAPH_PARAM_BLEED4 = 110;

// Ports: 0 Mono/Out, 1 Left/Mix L, 2 Right/Mix R, 3 Saw/Dry L, 4 Ramp/Dry R, 5–7 taps.
// 8–11: crossover5/6 extra band taps. Live SIGNAL IN: 16 ƒ, 17 0.1V/Oct, 18 Inc, 19 Reset.
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO = 0;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT = 1;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT = 2;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW = 3;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP = 4;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE = 5;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI = 6;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE = 7;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_L = 3;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_R = 4;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_F = 16;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_PITCH_CV = 17;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_INCREMENT = 18;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RESET = 19;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRIGGER = 20;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MIX_STEREO_R4 = 21;
NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MORPH = 22; // block-rate ZOH (turquoise)

NodeLiveAudioProcessor.prototype.fnv1aHash32 = function fnv1aHash32(text) {
  let hash = 2166136261 >>> 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

NodeLiveAudioProcessor.prototype.mapNativeGraphTypeId = function mapNativeGraphTypeId(type) {
  const id = NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS[String(type || "").trim()];
  return Number.isFinite(id) ? id : 0;
};

/** Audio tap ports only (0–7). Never maps Live aliases — those are destination-only.
 *  Optional `type` disambiguates module-local names that reuse tap slots (Thru, etc.).
 */
NodeLiveAudioProcessor.prototype.mapNativeGraphSrcPortId = function mapNativeGraphSrcPortId(
  port,
  type,
) {
  const raw = String(port || "").trim();
  const p = raw.toLowerCase();
  const t = String(type || "").trim();
  if (
    p === "left" || p === "l" || p === "mix l" || p === "wet l" || p === "left mix"
    || p === "left out"
  ) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  }
  if (
    p === "right" || p === "r" || p === "mix r" || p === "wet r" || p === "right mix"
    || p === "right out"
  ) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if (p === "dry l" || p === "left dry" || p === "mono dry") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_L;
  }
  if (p === "dry r" || p === "right dry") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_R;
  }
  if (p === "saw" || p === "mod l") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  if (p === "ramp" || p === "mod r") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
  if (p === "square") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE;
  if (p === "tri" || p === "triangle") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI;
  if (p === "sine" || p === "sin") {
    // Archimedes / sineWavetable primary → Mono; polyBlep/blit tap → Sine bus.
    return (t === "archimedes" || t === "sineWavetable" || t === "sinCos")
      ? NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO
      : NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE;
  }
  if (t === "archimedes") {
    if (p === "cosine" || p === "cos") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "pi") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
    if (p === "noise below") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
    if (p === "noise above") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
  }
  if (t === "surgeOscillator") {
    if (p === "synced") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
    if (p === "internal sync") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if ((t === "sineWavetable" || t === "sinCos") && (p === "cos" || p === "cosine")) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  }
  if (t === "ellipsoid") {
    if (p === "bi x" || p === "x") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "bi y" || p === "y") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
    if (p === "uni x") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
    if (p === "uni y") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
  }
  if (t === "snowflake") {
    if (p === "x") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "y") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  // Comparator named outs (reuse tap slots; see graph_engine kPortCmp*).
  if (p === "up") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  if (p === "down") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
  if (p === "change") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE;
  if (p === "steady") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI;
  if (p === "sign") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE;
  if (p === "delayed") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  if (p === "thru") {
    // comparator Thru → Mono; sampleDelay Thru → Dry L.
    return t === "sampleDelay"
      ? NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_DRY_L
      : NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  }
  // minMax / mix numbered I/O (buses 0–3).
  if (p === "in 1" || p === "in1" || p === "out1" || p === "max") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  }
  if (p === "in 2" || p === "in2" || p === "out2" || p === "min") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  }
  if (p === "in 3" || p === "in3" || p === "out3") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if (p === "in 4" || p === "in4" || p === "out4") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  }
  // lutCell A/B/C/D (+ Q/Out handled below); metallic Ratio.
  if (p === "a") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  if (p === "b") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  if (p === "c") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  if (p === "d") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  if (p === "q") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  if (p === "ratio") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  if (p === "gain" && (t === "lookaheadLimiter" || t === "limiter")) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  }
  if (p === "env" && t === "limiter") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
  }
  // transport outs
  if (t === "transport") {
    if (p === "-1..1" || p === "-1…1") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "0..1" || p === "0…1") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "trigger") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
    if (p === "f") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  }
  // mixStereo pair jacks (L1/R1 share Left/Right; L2–L4/R2–R3 on taps; R4 aux).
  if (t === "mixStereo") {
    if (p === "l1") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "r1") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
    if (p === "l2") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
    if (p === "r2") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
    if (p === "l3") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE;
    if (p === "r3") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI;
    if (p === "l4") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE;
    if (p === "r4") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MIX_STEREO_R4;
  }
  // midSideEncode outs; vectorscope / rotate3d X/Y(/Z) outs.
  if (p === "mid") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  if (p === "side") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  // clock named outs
  if (p === "digital out" || p === "digital") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  if (p === "analog out" || p === "analog" || p === "\u223f") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  }
  if (p === "gate") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  if (p === "env") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  if (p === "count") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  if (p === "pulse") {
    return t === "triggerCounter"
      ? NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO
      : NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT; // clock T
  }
  if (p === "t" || p === "trigger") {
    // randomClock Trigger → Mono; clock Pulse/T → Right; Trigger dest handled in dst map
    return t === "randomClock"
      ? NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO
      : NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if (p === "x" && (t === "vectorscopeTransform" || t === "rotate3dTo2d")) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  }
  if (p === "y" && (t === "vectorscopeTransform" || t === "rotate3dTo2d")) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  }
  if (p === "z" && t === "rotate3dTo2d") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if (t === "pll") {
    if (p === "vco out" || p === "vco") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "pc out" || p === "pc") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "lpf out" || p === "lfp out" || p === "lpf") {
      return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
    }
    if (p === "locked") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  }
  if (t === "delayEffect" && (p === "wet" || p === "mix")) {
    return p === "wet"
      ? NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW
      : NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  }
  if (
    t === "lorenzAttractor" || t === "henonMap" || t === "chuaAttractor"
    || t === "rayBouncer" || t === "ellipsoid" || t === "snowflake"
    || t === "spiral" || t === "fractalSpiral" || t === "logSpiral"
    || t === "blubb" || t === "boing" || t === "keplerBouwkamp"
    || t === "mushroom" || t === "nyquistShannon" || t === "radar"
    || t === "torus" || t === "wirdoSpiral" || t === "phosphillator"
  ) {
    if (p === "x") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "y") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "z") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if (t === "chordMemory") {
    if (p === "note 1" || p === "note1") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "note 2" || p === "note2") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "note 3" || p === "note3") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
    if (p === "note 4" || p === "note4") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
    if (p === "arp") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
    if (p === "gate") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE;
  }
  if (t === "chordSequencer") {
    if (p === "scale") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "root") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "gate") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
    if (p === "step") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
  }
  if (t === "turingMachine") {
    if (p === "cv") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "scale") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "gate") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if (t === "fractalBrownianNoise") {
    if (p === "out x" || p === "x") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "out y" || p === "y") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "out z" || p === "z") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  if (t === "piSpigotNoise") {
    if (p === "left out" || p === "sum") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "right out" || p === "term") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "hex") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
    if (p === "n") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SAW;
    if (p === "t") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RAMP;
    if (p === "b3") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SQUARE;
    if (p === "b2") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRI;
    if (p === "b1") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_SINE;
  }
  if (t === "pulseExplosion") {
    if (p === "out") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "curve") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
  }
  // crossover2..6: sequential band L/R (band0=0/1, band1=2/3, …).
  if (
    t === "crossover2" || t === "crossover3" || t === "crossover4"
    || t === "crossover5" || t === "crossover6"
  ) {
    if (p === "lfl") return 0;
    if (p === "lfr") return 1;
    if (t === "crossover2") {
      if (p === "hfl") return 2;
      if (p === "hfr") return 3;
    } else if (t === "crossover3") {
      if (p === "ml" || p === "l1") return 2;
      if (p === "mr" || p === "r1") return 3;
      if (p === "hfl") return 4;
      if (p === "hfr") return 5;
    } else if (t === "crossover4") {
      if (p === "l1") return 2;
      if (p === "r1") return 3;
      if (p === "l2") return 4;
      if (p === "r2") return 5;
      if (p === "hfl") return 6;
      if (p === "hfr") return 7;
    } else if (t === "crossover5") {
      if (p === "l1") return 2;
      if (p === "r1") return 3;
      if (p === "l2") return 4;
      if (p === "r2") return 5;
      if (p === "l3") return 6;
      if (p === "r3") return 7;
      if (p === "hfl") return 8;
      if (p === "hfr") return 9;
    } else {
      if (p === "l1") return 2;
      if (p === "r1") return 3;
      if (p === "l2") return 4;
      if (p === "r2") return 5;
      if (p === "l3") return 6;
      if (p === "r3") return 7;
      if (p === "l4") return 8;
      if (p === "r4") return 9;
      if (p === "hfl") return 10;
      if (p === "hfr") return 11;
    }
  }
  // Mono / Out / In / Wave Out / Noise / Frequency (MIDI out) / empty → mono bus
  return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
};

/** Destination ports: audio buses + Live SIGNAL IN (ƒ / 0.1V / Inc / Reset). */
NodeLiveAudioProcessor.prototype.mapNativeGraphDstPortId = function mapNativeGraphDstPortId(
  port,
  type,
) {
  const raw = String(port || "").trim();
  const p = raw.toLowerCase();
  // Live absolute-Hz jack (must not fall through to Mono — would inject CV into audio).
  if (p === "f" || p === "ƒ" || p === "freq" || p === "frequency") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_F;
  }
  if (p === "0.1v/oct" || p === "0.1v" || p === "v/oct" || p === "pitch") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_PITCH_CV;
  }
  if (p === "increment" || p === "inc." || p === "inc") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_INCREMENT;
  }
  if (p === "reset" || (p === "clear" && type === "chordMemory")) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RESET;
  }
  if (p === "trigger" || p === "trig" || (p === "latch" && type === "chordMemory")) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRIGGER;
  }
  if (p === "morph") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MORPH;
  }
  // Pump Limiter sidechain key — audio detect on Morph bus slot.
  if ((p === "sidechain" || p === "sc" || p === "key") && type === "limiter") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MORPH;
  }
  if (p === "clock") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_TRIGGER;
  }
  if (p === "advance" && type === "chordMemory") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_INCREMENT;
  }
  if (p === "scale" && (type === "pitchQuantizer" || type === "turingMachine")) {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  }
  // Envelope audio-rate control jacks (fold via Mono+L+R mix).
  if (p === "gate" || p === "light" || p === "release") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  }
  const t = String(type || "").trim();
  if (t === "pll") {
    if (p === "signal in" || p === "signal") {
      return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    }
    if (p === "vco cv in" || p === "vco cv" || p === "cv") {
      return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    }
  }
  // surgeOscillator Sync audio in (reuses Mono bus as destination-only).
  if (p === "sync" && t === "surgeOscillator") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
  }
  // mixStereo R4 is destination-only (aux bus, not a Node.buf tap).
  if (p === "r4" && t === "mixStereo") {
    return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MIX_STEREO_R4;
  }
  // vectorscope: X/Y aliases land on L/R inputs (not the X/Y output buses).
  if (t === "vectorscopeTransform") {
    if (p === "x" || p === "l") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "y" || p === "r") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  // rotate3dTo2d: X/Y/Z inputs on Mono/Left/Right.
  if (t === "rotate3dTo2d") {
    if (p === "x") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_MONO;
    if (p === "y") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_LEFT;
    if (p === "z") return NodeLiveAudioProcessor.NATIVE_GRAPH_PORT_RIGHT;
  }
  return this.mapNativeGraphSrcPortId(port, type);
};

/** @deprecated Prefer mapNativeGraphSrcPortId / mapNativeGraphDstPortId. */
NodeLiveAudioProcessor.prototype.mapNativeGraphPortId = function mapNativeGraphPortId(port) {
  return this.mapNativeGraphDstPortId(port);
};

NodeLiveAudioProcessor.prototype.pushNativeGraphParam = function pushNativeGraphParam(
  native,
  hash,
  paramId,
  value,
) {
  if (!native?.soemdsp_graph_set_param || !this.nativeGraphHandle) return;
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  try {
    native.soemdsp_graph_set_param(this.nativeGraphHandle, hash, paramId, v);
  } catch (_e) { /* ignore */ }
};

/**
 * Jump every native Control out → target (clears chase list).
 * Call after compile + initial param sync so the first audible sample is
 * on-patch. Do NOT call on pause→play — frozen mid-ramps must resume.
 */
NodeLiveAudioProcessor.prototype.snapNativeGraphControls = function snapNativeGraphControls() {
  if (!this.efficientProduct || !this.nativeGraphHandle) return false;
  const native = this.nativeGraph;
  if (typeof native?.soemdsp_graph_snap_controls !== "function") return false;
  try {
    return (native.soemdsp_graph_snap_controls(this.nativeGraphHandle) | 0) === 0;
  } catch (_e) {
    return false;
  }
};

NodeLiveAudioProcessor.prototype.pushNativeGraphSmoothTime = function pushNativeGraphSmoothTime(
  native,
  hash,
  paramId,
  timeSamples,
) {
  if (!native?.soemdsp_graph_set_smooth_time || !this.nativeGraphHandle) return;
  const t = Number(timeSamples);
  if (!Number.isFinite(t) || t < 0) return;
  try {
    native.soemdsp_graph_set_smooth_time(this.nativeGraphHandle, hash, paramId, t);
  } catch (_e) { /* ignore */ }
};

NodeLiveAudioProcessor.prototype.pushNativeGraphSmoothMode = function pushNativeGraphSmoothMode(
  native,
  hash,
  paramId,
  mode,
) {
  if (!native?.soemdsp_graph_set_smooth_mode || !this.nativeGraphHandle) return;
  const m = Number(mode);
  if (!Number.isFinite(m)) return;
  try {
    native.soemdsp_graph_set_smooth_mode(this.nativeGraphHandle, hash, paramId, m | 0);
  } catch (_e) { /* ignore */ }
};

NodeLiveAudioProcessor.prototype.pushNativeGraphSmoothType = function pushNativeGraphSmoothType(
  native,
  hash,
  paramId,
  type,
) {
  if (!native?.soemdsp_graph_set_smooth_type || !this.nativeGraphHandle) return;
  const t = Number(type);
  if (!Number.isFinite(t)) return;
  try {
    native.soemdsp_graph_set_smooth_type(this.nativeGraphHandle, hash, paramId, t | 0);
  } catch (_e) { /* ignore */ }
};

/** paramMeta.smoothingSeconds → samples (same rules as worklet smoother). */
NodeLiveAudioProcessor.prototype.nativeGraphSmoothTimeSamplesFromMeta = function nativeGraphSmoothTimeSamplesFromMeta(
  metadata = {},
) {
  const value = Number(metadata?.smoothingSeconds);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rate = Math.max(1, Number(this.engineSampleRate || sampleRate) || 44100);
  if (value > 0 && value < 1) {
    return Math.max(1, Math.round(value * rate));
  }
  return Math.max(0, Math.round(value));
};

/** Map patch smoothingMode → native enum (0 internal, 1 global, 2 internalGlobal, 3 off). */
NodeLiveAudioProcessor.prototype.nativeGraphSmoothModeFromMeta = function nativeGraphSmoothModeFromMeta(
  metadata = {},
) {
  const raw = metadata?.smoothingMode;
  const mode = typeof nodeSmoothingModeNormalize === "function"
    ? nodeSmoothingModeNormalize(raw)
    : String(raw || "internal");
  if (mode === "global") return 1;
  if (mode === "internalGlobal") return 2;
  if (mode === "off") return 3;
  return 0; // internal (default)
};

/** Map patch smoothingType → native (0 1P, 1 L, 2 2P, 3 none, 4 Π, 5 3P). */
NodeLiveAudioProcessor.prototype.nativeGraphSmoothTypeFromMeta = function nativeGraphSmoothTypeFromMeta(
  metadata = {},
) {
  const raw = metadata?.smoothingType;
  const type = typeof normalizeNodeGraphParameterSmootherFilterType === "function"
    ? normalizeNodeGraphParameterSmootherFilterType(raw)
    : (typeof this.smoothingTypeFromMetadata === "function"
      ? this.smoothingTypeFromMetadata(metadata)
      : String(raw || "onePole"));
  if (type === "linear") return 1;
  if (type === "twoPole") return 2;
  if (type === "none" || type === "off" || type === "instant") return 3;
  if (type === "papoulis") return 4;
  if (type === "threePole") return 5;
  return 0; // onePole
};

NodeLiveAudioProcessor.prototype.nativeGraphExportsReady = function nativeGraphExportsReady() {
  const n = this.nativeGraph;
  return Boolean(
    this.nativeGraphReady
    && n?.soemdsp_graph_create
    && n?.soemdsp_graph_clear
    && n?.soemdsp_graph_add_node
    && n?.soemdsp_graph_connect
    && n?.soemdsp_graph_set_param
    && n?.soemdsp_graph_set_smooth_time
    && n?.soemdsp_graph_set_smooth_mode
    && n?.soemdsp_graph_set_smooth_type
    && n?.soemdsp_graph_set_global_smooth_time
    && n?.soemdsp_graph_set_bypassed
    && n?.soemdsp_graph_set_sample_rate
    && n?.soemdsp_graph_compile
    && n?.soemdsp_graph_process_block
    && n?.soemdsp_graph_block_output_left_ptr
    && n?.soemdsp_graph_block_output_right_ptr
    && n?.soemdsp_graph_node_port_ptr
    && n?.soemdsp_graph_max_block_frames
  );
};

/** Topology fingerprint — bypass-only changes must NOT rebuild natives. */
NodeLiveAudioProcessor.prototype.nativeGraphTopologyKey = function nativeGraphTopologyKey() {
  const audioTypes = NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS;
  const nodeParts = [];
  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(audioTypes, type)) continue;
    nodeParts.push(`${id}\0${type}`);
  }
  nodeParts.sort();
  const connParts = [];
  const connections = Array.isArray(this._planConnections) ? this._planConnections : [];
  for (const c of connections) {
    const src = String(c?.sourceNode || "");
    const dst = String(c?.destinationNode || "");
    if (!src || !dst) continue;
    connParts.push(
      `${src}\0${String(c?.sourcePort || "")}\0${dst}\0${String(c?.destinationPort || "")}`,
    );
  }
  connParts.sort();
  return `${nodeParts.join("|")}#${connParts.join("|")}`;
};

NodeLiveAudioProcessor.prototype.syncNativeGraphBypass = function syncNativeGraphBypass() {
  if (!this.efficientProduct || !this.nativeGraphCompiled || !this.nativeGraphHandle) {
    return;
  }
  const native = this.nativeGraph;
  if (!native?.soemdsp_graph_set_bypassed) return;
  const audioTypes = NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS;
  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(audioTypes, type)) continue;
    const hash = this.fnv1aHash32(id);
    try {
      native.soemdsp_graph_set_bypassed(
        this.nativeGraphHandle,
        hash,
        node?.bypassed ? 1 : 0,
      );
    } catch (_e) { /* ignore */ }
  }
};

/** Recompile only when nodes/wires change; bypass is a light flag sync. */
NodeLiveAudioProcessor.prototype.syncNativeGraphFromPlan = function syncNativeGraphFromPlan() {
  if (!this.efficientProduct) return false;
  const key = this.nativeGraphTopologyKey();
  if (this.nativeGraphCompiled && key === this._nativeGraphTopologyKey) {
    this.syncNativeGraphBypass();
    if (typeof this.syncNativeGraphParams === "function") {
      this.syncNativeGraphParams();
    }
    return true;
  }
  const ok = this.compileNativeGraphFromPlan();
  if (ok) {
    this._nativeGraphTopologyKey = key;
    this.syncNativeGraphBypass();
  } else {
    this._nativeGraphTopologyKey = "";
  }
  return ok;
};

/**
 * Efficient compile owns allowlist natives. Release leftover per-module
 * evaluator handles so pools are not double-allocated after full→efficient
 * toggles without a session restart (sabrina pool is only 2).
 */
NodeLiveAudioProcessor.prototype.releaseEfficientLegacyNativeHandles =
  function releaseEfficientLegacyNativeHandles() {
    if (this.polyBlepStates instanceof Map) {
      for (const state of this.polyBlepStates.values()) {
        this.destroyPolyBlepNativeState?.(state);
        if (state) state.blockCache = null;
      }
      this.polyBlepStates.clear();
    }
    if (this.ladderFilterStates instanceof Map) {
      for (const state of this.ladderFilterStates.values()) {
        this.destroyStereoFilterNativeState?.(state, (s) => this.destroyLadderFilterNativeState?.(s));
        this.resetLadderBlockCache?.(state?.mono);
        this.resetLadderBlockCache?.(state?.left);
        this.resetLadderBlockCache?.(state?.right);
      }
      this.ladderFilterStates.clear();
    }
    if (this.softClipperStates instanceof Map) {
      for (const state of this.softClipperStates.values()) {
        this.destroySoftClipperState?.(state);
      }
      this.softClipperStates.clear();
    }
    if (this.reverbEffectStates instanceof Map) {
      for (const state of this.reverbEffectStates.values()) {
        this.destroySabrinaReverbState?.(state);
      }
      this.reverbEffectStates.clear();
    }
    if (this.pingPongDelayStates instanceof Map) {
      for (const state of this.pingPongDelayStates.values()) {
        this.destroyPingPongDelayNativeState?.(state);
      }
      this.pingPongDelayStates.clear();
    }
  };

NodeLiveAudioProcessor.prototype.destroyNativeGraphHandle = function destroyNativeGraphHandle() {
  if (this.nativeGraphHandle && this.nativeGraph?.soemdsp_graph_destroy) {
    try {
      this.nativeGraph.soemdsp_graph_destroy(this.nativeGraphHandle);
    } catch (_e) { /* ignore */ }
  }
  this.nativeGraphHandle = 0;
  this.nativeGraphCompiled = false;
  this.nativeGraphStatus = "";
  this.nativeGraphStatusMessage = "";
  this.nativeGraphBlockViews = null;
  this.nativeGraphPortViewCache = null;
  this._nativeGraphParamCache = null;
  this._nativeGraphParamCachePlanSerial = undefined;
};

NodeLiveAudioProcessor.prototype.postNativeGraphStatus = function postNativeGraphStatus(status, message = "") {
  const next = String(status || "");
  const msg = String(message || "");
  // Skip no-op re-posts (idle silence path must not flood the message port).
  if (next === this.nativeGraphStatus && msg === (this.nativeGraphStatusMessage || "")) {
    return;
  }
  this.nativeGraphStatus = next;
  this.nativeGraphStatusMessage = msg;
  try {
    this.port.postMessage({
      type: "nativeGraphStatus",
      status: this.nativeGraphStatus,
      message: msg,
      compiled: Boolean(this.nativeGraphCompiled),
      handle: Number(this.nativeGraphHandle) || 0,
      planSerial: this.planSerial,
      sessionId: this.sessionId,
    });
  } catch (_e) { /* ignore */ }
};

// Discrete Controls: push snapped targets (avoid fractional enum while ramping).
NodeLiveAudioProcessor.NATIVE_GRAPH_DISCRETE_PARAMS = Object.freeze({
  waveform: true,
  mode: true,
  stages: true,
  voices: true,
  oversample: true,
  timingMode: true,
  lfoStyle: true,
  seed: true,
  monoSum: true,
  reflections: true,
  profile: true,
  harmonics: true,
  lobes: true,
  bandLimit: true,
  order: true,
  feedbackCircuit: true,
  gainCompensation: true,
  hold: true,
  topology: true,
  invert: true,
  loop: true,
  part: true,
  echoMode: true,
  pingPong: true,
  doModulateEcho: true,
  numDelays: true,
  lpfStages: true,
  bandStages: true,
  echoTempoSync: true,
  range: true,
  type: true,
});

/**
 * Write Control targets (+ smooth times from paramMeta) into native graph.
 * Efficient path must not sample JS smoothers — native SmootherManager chases.
 * Only pushes when the domain target / time changed (dirty cache).
 */
NodeLiveAudioProcessor.prototype.syncNativeGraphParams = function syncNativeGraphParams(_frames = 128) {
  if (!this.efficientProduct || !this.nativeGraphCompiled || !this.nativeGraphHandle) {
    return;
  }
  const native = this.nativeGraph;
  if (!native?.soemdsp_graph_set_param) {
    return;
  }
  const P = NodeLiveAudioProcessor;
  const cacheById = this._nativeGraphParamCache || (this._nativeGraphParamCache = new Map());
  const forceAll = this._nativeGraphParamCachePlanSerial !== this.planSerial;
  this._nativeGraphParamCachePlanSerial = this.planSerial;

  // Optional global time cell from worklet autoSmoothingSeconds.
  if (native.soemdsp_graph_set_global_smooth_time) {
    const rate = Math.max(1, Number(this.engineSampleRate || sampleRate) || 44100);
    const seconds = Math.max(0, Number(this.autoSmoothingSeconds) || 0);
    const globalSamples = seconds > 0 ? Math.max(1, Math.round(seconds * rate)) : 0;
    if (forceAll || this._nativeGraphGlobalSmoothSamples !== globalSamples) {
      this._nativeGraphGlobalSmoothSamples = globalSamples;
      try {
        native.soemdsp_graph_set_global_smooth_time(this.nativeGraphHandle, globalSamples);
      } catch (_e) { /* ignore */ }
    }
  }

  // Domain target + MOD fold from controller Bias/Out (published by controller peel).
  const readContinuous = (node, key, fallback) => {
    const raw = Number(node?.params?.[key]);
    const base = Number.isFinite(raw) ? raw : fallback;
    if (typeof this.foldEfficientParamModulations === "function") {
      return this.foldEfficientParamModulations(node, key, base);
    }
    return base;
  };
  // Enum / choice knobs: snapped domain target (MOD still folded, then rounded).
  const readDiscrete = (node, key, fallback) => {
    let v = Number(node?.params?.[key]);
    if (!Number.isFinite(v)) v = fallback;
    if (typeof this.foldEfficientParamModulations === "function") {
      v = this.foldEfficientParamModulations(node, key, v);
    }
    return Math.round(v);
  };
  const pushChanged = (hash, cache, key, paramId, value, node) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    if (forceAll || cache[key] !== v) {
      cache[key] = v;
      this.pushNativeGraphParam(native, hash, paramId, v);
    }
    if (P.NATIVE_GRAPH_DISCRETE_PARAMS[key]) return;
    const meta = node?.paramMeta?.[key];
    const timeKey = `${key}__smoothTime`;
    const modeKey = `${key}__smoothMode`;
    const typeKey = `${key}__smoothType`;
    const timeSamples = this.nativeGraphSmoothTimeSamplesFromMeta?.(meta) || 0;
    const smoothMode = this.nativeGraphSmoothModeFromMeta?.(meta) ?? 0;
    const smoothType = this.nativeGraphSmoothTypeFromMeta?.(meta) ?? 0;
    if (forceAll || cache[modeKey] !== smoothMode) {
      cache[modeKey] = smoothMode;
      this.pushNativeGraphSmoothMode(native, hash, paramId, smoothMode);
    }
    if (forceAll || cache[typeKey] !== smoothType) {
      cache[typeKey] = smoothType;
      this.pushNativeGraphSmoothType(native, hash, paramId, smoothType);
    }
    if (forceAll || cache[timeKey] !== timeSamples) {
      cache[timeKey] = timeSamples;
      this.pushNativeGraphSmoothTime(native, hash, paramId, timeSamples);
    }
  };

  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(P.NATIVE_GRAPH_TYPE_IDS, type)) continue;
    const hash = this.fnv1aHash32(id);
    let cache = cacheById.get(id);
    if (!cache || forceAll) {
      cache = Object.create(null);
      cacheById.set(id, cache);
    }
    const cont = (key, fallback) => readContinuous(node, key, fallback);
    const disc = (key, fallback) => readDiscrete(node, key, fallback);
    const push = (key, paramId, value) => pushChanged(hash, cache, key, paramId, value, node);

    if (type === "output") {
      push("volume", P.NATIVE_GRAPH_PARAM_VOLUME_DB, cont("volume", -3));
      push("pan", P.NATIVE_GRAPH_PARAM_PAN, cont("pan", 0));
      continue;
    }
    if (type === "polyBlep") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 220));
      push("waveform", P.NATIVE_GRAPH_PARAM_WAVEFORM, disc("waveform", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      push("morph", P.NATIVE_GRAPH_PARAM_SHAPE, cont("morph", 0.5));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      continue;
    }
    if (type === "ladderFilter") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1000));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 1));
      push("stages", P.NATIVE_GRAPH_PARAM_STAGES, disc("stages", 4));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "softClipper") {
      push("center", P.NATIVE_GRAPH_PARAM_CENTER, cont("center", 0));
      push("width", P.NATIVE_GRAPH_PARAM_WIDTH, cont("width", 2));
      push("oversample", P.NATIVE_GRAPH_PARAM_OVERSAMPLE, disc("oversample", 2));
      continue;
    }
    if (type === "reverbEffect") {
      push("mix", P.NATIVE_GRAPH_PARAM_MIX, cont("mix", 0.43));
      push("diffusionSize", P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, cont("diffusionSize", 0.35));
      push("diffusionAmount", P.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT, cont("diffusionAmount", 0.7));
      push("delaySize", P.NATIVE_GRAPH_PARAM_DELAY_SIZE, cont("delaySize", 0.02));
      push("recycle", P.NATIVE_GRAPH_PARAM_RECYCLE, cont("recycle", 0.7));
      push("lfoAmplitude", P.NATIVE_GRAPH_PARAM_LFO_AMPLITUDE, cont("lfoAmplitude", 0.07));
      push("lfoBaseSpeed", P.NATIVE_GRAPH_PARAM_LFO_BASE_SPEED, cont("lfoBaseSpeed", 0.83));
      push("lfoVariation", P.NATIVE_GRAPH_PARAM_LFO_VARIATION, cont("lfoVariation", 0.001));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 0));
      continue;
    }
    if (type === "pingPongDelay") {
      push("feedback", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("feedback", 0.35));
      push("mix", P.NATIVE_GRAPH_PARAM_MIX, cont("mix", 0.35));
      push("level", P.NATIVE_GRAPH_PARAM_LEVEL, cont("level", 1));
      push("timeNumerator", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("timeNumerator", 1));
      push("timeDenominator", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("timeDenominator", 4));
      push("timingMode", P.NATIVE_GRAPH_PARAM_TIMING_MODE, disc("timingMode", 0));
      push("offsetMs", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("offsetMs", 0));
      push("lfoStyle", P.NATIVE_GRAPH_PARAM_LFO_STYLE, disc("lfoStyle", 0));
      push("lfoRate", P.NATIVE_GRAPH_PARAM_LFO_RATE, cont("lfoRate", 0.35));
      push("lfoVariation", P.NATIVE_GRAPH_PARAM_LFO_VARIATION, cont("lfoVariation", 0.25));
      push("saturate", P.NATIVE_GRAPH_PARAM_SATURATE, cont("saturate", 1));
      push("lpfFrequency", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("lpfFrequency", 8000));
      push("hpfFrequency", P.NATIVE_GRAPH_PARAM_HPF_FREQUENCY, cont("hpfFrequency", 20));
      const bpm = Number(this.timing?.tempoBpm);
      push(
        "tempoBpm",
        P.NATIVE_GRAPH_PARAM_TEMPO_BPM,
        Number.isFinite(bpm) && bpm > 0 ? bpm : 120,
      );
      continue;
    }
    if (type === "attenuverter") {
      push("amplitude", P.NATIVE_GRAPH_PARAM_ATT_AMPLITUDE, cont("amplitude", 0.5));
      push("offset", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("offset", 0));
      continue;
    }
    if (type === "bias") {
      push("offset", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("offset", 0));
      continue;
    }
    if (type === "gain") {
      push("gainDb", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("gainDb", 0));
      push("leftDb", P.NATIVE_GRAPH_PARAM_GAIN_LEFT_DB, cont("leftDb", 0));
      push("rightDb", P.NATIVE_GRAPH_PARAM_GAIN_RIGHT_DB, cont("rightDb", 0));
      push("monoSum", P.NATIVE_GRAPH_PARAM_GAIN_MONO_SUM, disc("monoSum", 0));
      push("offset", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("offset", 0));
      continue;
    }
    if (type === "noiseGenerator") {
      // Reuse existing Control slots: mode, shape, offset=mean, width=deviation,
      // seed, amplitude=level.
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 0));
      push("shape", P.NATIVE_GRAPH_PARAM_SHAPE, cont("shape", 0));
      push("mean", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("mean", 0));
      push("deviation", P.NATIVE_GRAPH_PARAM_WIDTH, cont("deviation", 0.5));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "robinSinusoid") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 440));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      continue;
    }
    if (type === "aliasSine") {
      // frequency Control slot holds normFreq (0→sampleRate); amplitude = level.
      push("normFreq", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("normFreq", 0.1));
      push("level", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("level", 1));
      continue;
    }
    if (type === "blit") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("waveform", P.NATIVE_GRAPH_PARAM_WAVEFORM, disc("waveform", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      continue;
    }
    if (type === "sineWavetable") {
      // freq/amp/phase keys match module defs; mode → A/B/C/D layout from sin/cos.
      push("freq", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("freq", 100));
      push("amp", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amp", 1));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 2));
      continue;
    }
    if (type === "antisaw") {
      // stages = reflections, shape = tilt, amplitude → native level.
      push("fundamental", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("fundamental", 110));
      push("reflections", P.NATIVE_GRAPH_PARAM_STAGES, disc("reflections", 64));
      push("tilt", P.NATIVE_GRAPH_PARAM_SHAPE, cont("tilt", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "archimedes") {
      // stages = profile dtShift, width = dither bits.
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("profile", P.NATIVE_GRAPH_PARAM_STAGES, disc("profile", 12));
      push("dither", P.NATIVE_GRAPH_PARAM_WIDTH, cont("dither", 3));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "additiveOsc") {
      // stages=harmonics, shape=morph, center=phaseAdd, width=phaseMul, lpf=damping.
      // waveform 0..16 = soemdsp AdditiveWaveform enum.
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("waveform", P.NATIVE_GRAPH_PARAM_WAVEFORM, disc("waveform", 0));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("morph", P.NATIVE_GRAPH_PARAM_SHAPE, cont("morph", 0.5));
      push("harmonicPhaseAdd", P.NATIVE_GRAPH_PARAM_CENTER, cont("harmonicPhaseAdd", 0));
      push("harmonicPhaseMultiply", P.NATIVE_GRAPH_PARAM_WIDTH, cont("harmonicPhaseMultiply", 0));
      push("harmonics", P.NATIVE_GRAPH_PARAM_STAGES, disc("harmonics", 32));
      push("dampingFilterFrequency", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("dampingFilterFrequency", 20000));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 0.35));
      continue;
    }
    if (type === "surgeOscillator") {
      // width = syncFrequency Hz.
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("waveform", P.NATIVE_GRAPH_PARAM_WAVEFORM, disc("waveform", 0));
      push("syncFrequency", P.NATIVE_GRAPH_PARAM_WIDTH, cont("syncFrequency", 50));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "softwaveOsc") {
      // shape=morph, center=antialias.
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("waveform", P.NATIVE_GRAPH_PARAM_WAVEFORM, disc("waveform", 0));
      push("morph", P.NATIVE_GRAPH_PARAM_SHAPE, cont("morph", 0.5));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("antialias", P.NATIVE_GRAPH_PARAM_CENTER, cont("antialias", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "dsfOscillator") {
      // shape=morph/harmonics, width=PWM, mix=SquSaw blend.
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("waveform", P.NATIVE_GRAPH_PARAM_WAVEFORM, disc("waveform", 1));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("morph", P.NATIVE_GRAPH_PARAM_SHAPE, cont("morph", 1));
      push("pulseWidth", P.NATIVE_GRAPH_PARAM_WIDTH, cont("pulseWidth", 0.5));
      push("blend", P.NATIVE_GRAPH_PARAM_MIX, cont("blend", 0.5));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "hypersaw") {
      // stages=voices, shape=spread, width=random, center=drift.
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("voices", P.NATIVE_GRAPH_PARAM_STAGES, disc("voices", 8));
      push("spread", P.NATIVE_GRAPH_PARAM_SHAPE, cont("spread", 1));
      push("random", P.NATIVE_GRAPH_PARAM_WIDTH, cont("random", 0.15));
      push("drift", P.NATIVE_GRAPH_PARAM_CENTER, cont("drift", 0.1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 0.35));
      continue;
    }
    if (type === "sinc") {
      // stages=lobes, mode=bandLimit; freq key matches module def.
      push("freq", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("freq", 100));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("lobes", P.NATIVE_GRAPH_PARAM_STAGES, disc("lobes", 4));
      push("bandLimit", P.NATIVE_GRAPH_PARAM_MODE, disc("bandLimit", 1));
      continue;
    }
    if (type === "bradley2a") {
      // Remap crowded params onto spare Controls (see process_bradley2a).
      push("carrierFreq", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("carrierFreq", 1004));
      push("freqOffset", P.NATIVE_GRAPH_PARAM_WIDTH, cont("freqOffset", 0));
      push("jitterDepth", P.NATIVE_GRAPH_PARAM_SHAPE, cont("jitterDepth", 0));
      push("jitterRate", P.NATIVE_GRAPH_PARAM_LFO_RATE, cont("jitterRate", 60));
      push("ampDepth", P.NATIVE_GRAPH_PARAM_LFO_AMPLITUDE, cont("ampDepth", 0));
      push("ampRate", P.NATIVE_GRAPH_PARAM_LFO_BASE_SPEED, cont("ampRate", 40));
      push("interfLevel", P.NATIVE_GRAPH_PARAM_MIX, cont("interfLevel", 0));
      push("interfFreq", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("interfFreq", 2600));
      push("harm2", P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, cont("harm2", 0));
      push("harm3", P.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT, cont("harm3", 0));
      push("hitRate", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("hitRate", 1));
      push("hitDuration", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("hitDuration", 0.005));
      push("hitGain", P.NATIVE_GRAPH_PARAM_LEVEL, cont("hitGain", 1));
      push("hitPhase", P.NATIVE_GRAPH_PARAM_PHASE, cont("hitPhase", 0));
      push("impulseLevel", P.NATIVE_GRAPH_PARAM_RECYCLE, cont("impulseLevel", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "ellipsoid") {
      // mode=motion; shape=morph (sine→square); free-fn host phase.
      push("motion", P.NATIVE_GRAPH_PARAM_MODE, disc("motion", 1));
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("morph", P.NATIVE_GRAPH_PARAM_SHAPE, cont("morph", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "snowflake") {
      // mode=pattern, stages=iterations, width=angle, shape=direction, center=spin.
      push("pattern", P.NATIVE_GRAPH_PARAM_MODE, disc("pattern", 1));
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 55));
      push("iterations", P.NATIVE_GRAPH_PARAM_STAGES, disc("iterations", 3));
      push("angle", P.NATIVE_GRAPH_PARAM_WIDTH, cont("angle", 60));
      push("direction", P.NATIVE_GRAPH_PARAM_SHAPE, cont("direction", 0));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("spin", P.NATIVE_GRAPH_PARAM_CENTER, cont("spin", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (
      type === "butterworth" || type === "linkwitzRiley" || type === "bessel"
      || type === "chebyshev" || type === "elliptic"
    ) {
      // stages=order, width=bandwidth oct; resonance=ripple (cheby/elliptic).
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1000));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 0));
      push("order", P.NATIVE_GRAPH_PARAM_STAGES, disc("order", 4));
      push("bandwidth", P.NATIVE_GRAPH_PARAM_WIDTH, cont("bandwidth", 1));
      if (type === "chebyshev" || type === "elliptic") {
        push("ripple", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("ripple", 1));
      }
      continue;
    }
    if (
      type === "crossover2" || type === "crossover3" || type === "crossover4"
      || type === "crossover5" || type === "crossover6"
    ) {
      // stages=LR order; splits on frequency/center/width/lpf/hpf.
      push("order", P.NATIVE_GRAPH_PARAM_STAGES, disc("order", 4));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      if (type === "crossover2") {
        push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1000));
      } else {
        const fDefaults = {
          crossover3: [300, 3000],
          crossover4: [200, 1000, 5000],
          crossover5: [150, 500, 2000, 8000],
          crossover6: [100, 300, 1000, 3000, 10000],
        };
        const fs = fDefaults[type] || [1000];
        push("frequency1", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency1", fs[0]));
        if (fs[1] != null) {
          push("frequency2", P.NATIVE_GRAPH_PARAM_CENTER, cont("frequency2", fs[1]));
        }
        if (fs[2] != null) {
          push("frequency3", P.NATIVE_GRAPH_PARAM_WIDTH, cont("frequency3", fs[2]));
        }
        if (fs[3] != null) {
          push("frequency4", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("frequency4", fs[3]));
        }
        if (fs[4] != null) {
          push("frequency5", P.NATIVE_GRAPH_PARAM_HPF_FREQUENCY, cont("frequency5", fs[4]));
        }
      }
      continue;
    }
    if (type === "eqFilter") {
      // resonance=Q, gainDb=shelf/peak gain.
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1000));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 1));
      push("q", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("q", 0.707));
      push("gain", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("gain", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "activeFilter") {
      // stages=feedbackCircuit, timingMode=gainCompensation; LP/BP→lpf, HP→hpf.
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 3));
      push("highFrequency", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("highFrequency", 1000));
      push("lowFrequency", P.NATIVE_GRAPH_PARAM_HPF_FREQUENCY, cont("lowFrequency", 200));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("feedbackCircuit", P.NATIVE_GRAPH_PARAM_STAGES, disc("feedbackCircuit", 3));
      push("gainCompensation", P.NATIVE_GRAPH_PARAM_TIMING_MODE, disc("gainCompensation", 1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "passiveFilter") {
      // Native is 1-pole; slope/stagger stay UI-only until native grows.
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 0));
      push("lowFrequency", P.NATIVE_GRAPH_PARAM_HPF_FREQUENCY, cont("lowFrequency", 200));
      push("highFrequency", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("highFrequency", 1000));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "tb303Filter") {
      // frequency←cutoff Hz, gainDb←drive, amplitude←output scale.
      push("cutoff", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("cutoff", 1000));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 4));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0));
      push("drive", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("drive", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "flowerChildFilter") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 0.5));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 0));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("chaos", P.NATIVE_GRAPH_PARAM_SHAPE, cont("chaos", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "yellowjacketFilter") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 0.5));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("chaos", P.NATIVE_GRAPH_PARAM_SHAPE, cont("chaos", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "superloveFilter") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 0.5));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 0));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("chaos", P.NATIVE_GRAPH_PARAM_SHAPE, cont("chaos", 0.5));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "humanFilter") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 0.5));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 0));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("chaos", P.NATIVE_GRAPH_PARAM_SHAPE, cont("chaos", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "resonatorFilter") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 0.5));
      push("mode", P.NATIVE_GRAPH_PARAM_MODE, disc("mode", 0));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("chaos", P.NATIVE_GRAPH_PARAM_SHAPE, cont("chaos", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "combResonator") {
      // decay=timeNumerator, hold=timingMode, damping=shape, topology=mode,
      // invert=stages, depth=width.
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 110));
      push("decay", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("decay", 1));
      push("hold", P.NATIVE_GRAPH_PARAM_TIMING_MODE, disc("hold", 0));
      push("damping", P.NATIVE_GRAPH_PARAM_SHAPE, cont("damping", 0));
      push("topology", P.NATIVE_GRAPH_PARAM_MODE, disc("topology", 0));
      push("invert", P.NATIVE_GRAPH_PARAM_STAGES, disc("invert", 0));
      push("depth", P.NATIVE_GRAPH_PARAM_WIDTH, cont("depth", 1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "modeResonator") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 440));
      push("decay", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("decay", 1));
      push("hold", P.NATIVE_GRAPH_PARAM_TIMING_MODE, disc("hold", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "chaoticPhaseLockingFilter") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 0.5));
      push("resonance", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("resonance", 0.2));
      push("chaos", P.NATIVE_GRAPH_PARAM_SHAPE, cont("chaos", 1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "inertialFilter") {
      push("attack", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("attack", 20000));
      push("release", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("release", 20));
      continue;
    }
    if (type === "expAdsr") {
      // timeNum=delay, timeDen=attack, feedback=decay, mix=sustain,
      // offsetMs=release s, shape=attackShape, center=releaseShape,
      // mode=loop, level=level.
      push("delay", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("delay", 0));
      push("attack", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("attack", 0.08));
      push("decay", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("decay", 0.22));
      push("sustain", P.NATIVE_GRAPH_PARAM_MIX, cont("sustain", 0.55));
      push("release", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("release", 0.45));
      push("attackShape", P.NATIVE_GRAPH_PARAM_SHAPE, cont("attackShape", 0.3));
      push("releaseShape", P.NATIVE_GRAPH_PARAM_CENTER, cont("releaseShape", 0.0001));
      push("loop", P.NATIVE_GRAPH_PARAM_MODE, disc("loop", 0));
      push("level", P.NATIVE_GRAPH_PARAM_LEVEL, cont("level", 1));
      continue;
    }
    if (type === "linearEnvelope") {
      push("delay", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("delay", 0));
      push("attack", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("attack", 0.08));
      push("decay", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("decay", 0.22));
      push("sustain", P.NATIVE_GRAPH_PARAM_MIX, cont("sustain", 0.55));
      push("release", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("release", 0.45));
      push("loop", P.NATIVE_GRAPH_PARAM_MODE, disc("loop", 0));
      push("level", P.NATIVE_GRAPH_PARAM_LEVEL, cont("level", 1));
      continue;
    }
    if (type === "pluckEnvelope") {
      push("delayTime", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("delayTime", 0));
      push("attackFeedback", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("attackFeedback", 0.002));
      push("decay", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("decay", 0.35));
      push("decayModStart", P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, cont("decayModStart", 0.08));
      push("decayModEnd", P.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT, cont("decayModEnd", 0.55));
      push("endingDecay", P.NATIVE_GRAPH_PARAM_DELAY_SIZE, cont("endingDecay", 0.8));
      push("decayModCurve", P.NATIVE_GRAPH_PARAM_SHAPE, cont("decayModCurve", 0));
      push("decayModFrequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("decayModFrequency", 1.5));
      push("autoReleaseTime", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("autoReleaseTime", 0.08));
      push("releaseFeedback", P.NATIVE_GRAPH_PARAM_RECYCLE, cont("releaseFeedback", 0.35));
      push("velocity", P.NATIVE_GRAPH_PARAM_WIDTH, cont("velocity", 1));
      push("velocitySensitivity", P.NATIVE_GRAPH_PARAM_CENTER, cont("velocitySensitivity", 0));
      push("level", P.NATIVE_GRAPH_PARAM_LEVEL, cont("level", 1));
      continue;
    }
    if (type === "flowerChildEnvelopeFollower") {
      push("attack", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("attack", 0.001));
      push("hold", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("hold", 0.001));
      push("decay", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("decay", 0.001));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "delayEffect") {
      // Native parabolic mod only; JS modStyle/interp/inLevel stay UI-side.
      push("time", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("time", 0.18));
      push("feedback", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("feedback", 0.25));
      push("mix", P.NATIVE_GRAPH_PARAM_MIX, cont("mix", 0.35));
      push("outLevel", P.NATIVE_GRAPH_PARAM_LEVEL, cont("outLevel", 1));
      push("modAmount", P.NATIVE_GRAPH_PARAM_LFO_AMPLITUDE, cont("modAmount", 0.02));
      push("modRate", P.NATIVE_GRAPH_PARAM_LFO_RATE, cont("modRate", 0.1));
      push("modVariation", P.NATIVE_GRAPH_PARAM_LFO_VARIATION, cont("modVariation", 0));
      continue;
    }
    if (type === "soemReverb") {
      // Tempo sync resolved here → delaySize/echoTime seconds.
      let echoTime = cont("echoTime", 0.35);
      if (disc("echoTempoSync", 0) >= 1) {
        const bpm = Number(this.timing?.tempoBpm);
        const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
        const num = Math.max(0, cont("timeNumerator", 1));
        const denRaw = cont("timeDenominator", 4);
        const den = denRaw > 0 ? denRaw : 1;
        const mode = disc("timingMode", 0);
        const mult = mode === 1 ? 1.5 : mode === 2 ? 2 / 3 : 1;
        const offsetSec = cont("offsetMs", 0) * 0.001;
        echoTime = (num / den) * (240 / safeBpm) * mult + offsetSec;
        if (!(echoTime > 0.0001)) echoTime = 0.0001;
        if (echoTime > 1) echoTime = 1;
      }
      push("mix", P.NATIVE_GRAPH_PARAM_MIX, cont("mix", 0.43));
      push("volume", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("volume", 1));
      push("echoTime", P.NATIVE_GRAPH_PARAM_DELAY_SIZE, echoTime);
      push("recycle", P.NATIVE_GRAPH_PARAM_RECYCLE, cont("recycle", 0.5));
      push("numDelays", P.NATIVE_GRAPH_PARAM_STAGES, disc("numDelays", 10));
      push("diffusionSize", P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, cont("diffusionSize", 0.35));
      push("diffusionAmount", P.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT, cont("diffusionAmount", 0.7));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 500));
      push("lfoAmp", P.NATIVE_GRAPH_PARAM_LFO_AMPLITUDE, cont("lfoAmp", 0.002));
      push("lfoFrequency", P.NATIVE_GRAPH_PARAM_LFO_BASE_SPEED, cont("lfoFrequency", 0.5));
      push("lfoVariation", P.NATIVE_GRAPH_PARAM_LFO_VARIATION, cont("lfoVariation", 1));
      push("lfoStyle", P.NATIVE_GRAPH_PARAM_LFO_STYLE, disc("lfoStyle", 0));
      push("echoMode", P.NATIVE_GRAPH_PARAM_MODE, disc("echoMode", 0));
      push("pingPong", P.NATIVE_GRAPH_PARAM_TIMING_MODE, disc("pingPong", 0));
      push("doModulateEcho", P.NATIVE_GRAPH_PARAM_WAVEFORM, disc("doModulateEcho", 1));
      push("saturate", P.NATIVE_GRAPH_PARAM_SATURATE, cont("saturate", 1));
      push("lpfFrequency", P.NATIVE_GRAPH_PARAM_LPF_FREQUENCY, cont("lpfFrequency", 8000));
      push("hpfFrequency", P.NATIVE_GRAPH_PARAM_HPF_FREQUENCY, cont("hpfFrequency", 20));
      push("bandFrequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("bandFrequency", 1000));
      push("bandDecibels", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("bandDecibels", 0));
      push("bandQ", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("bandQ", 1));
      push("lpfStages", P.NATIVE_GRAPH_PARAM_WIDTH, disc("lpfStages", 2));
      push("bandStages", P.NATIVE_GRAPH_PARAM_CENTER, disc("bandStages", 2));
      push("duckLimit", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("duckLimit", 1));
      push("duckRelease", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("duckRelease", 0.04));
      continue;
    }
    if (type === "pll") {
      push("range", P.NATIVE_GRAPH_PARAM_MODE, disc("range", 1));
      push("offset", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("offset", 5));
      push("type", P.NATIVE_GRAPH_PARAM_STAGES, disc("type", 1));
      push("frequ", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequ", 10));
      continue;
    }
    if (type === "lorenzAttractor") {
      push("speed", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("speed", 1));
      push("sigma", P.NATIVE_GRAPH_PARAM_SHAPE, cont("sigma", 10));
      push("rho", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("rho", 28));
      push("beta", P.NATIVE_GRAPH_PARAM_WIDTH, cont("beta", 2.6667));
      push("rotate", P.NATIVE_GRAPH_PARAM_PHASE, cont("rotate", 0));
      push("scale", P.NATIVE_GRAPH_PARAM_CENTER, cont("scale", 1));
      push("zDepth", P.NATIVE_GRAPH_PARAM_MIX, cont("zDepth", 0.4));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "logisticMap") {
      push("rate", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("rate", 8));
      push("r", P.NATIVE_GRAPH_PARAM_SHAPE, cont("r", 3.9));
      push("seed", P.NATIVE_GRAPH_PARAM_CENTER, cont("seed", 0.5));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "henonMap") {
      push("rate", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("rate", 8));
      push("a", P.NATIVE_GRAPH_PARAM_SHAPE, cont("a", 1.4));
      push("b", P.NATIVE_GRAPH_PARAM_WIDTH, cont("b", 0.3));
      push("seedX", P.NATIVE_GRAPH_PARAM_CENTER, cont("seedX", 0.1));
      push("seedY", P.NATIVE_GRAPH_PARAM_MIX, cont("seedY", 0.1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "chuaAttractor") {
      push("speed", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("speed", 1));
      push("alpha", P.NATIVE_GRAPH_PARAM_SHAPE, cont("alpha", 15.6));
      push("beta", P.NATIVE_GRAPH_PARAM_WIDTH, cont("beta", 28));
      push("m0", P.NATIVE_GRAPH_PARAM_CENTER, cont("m0", -1.143));
      push("m1", P.NATIVE_GRAPH_PARAM_MIX, cont("m1", -0.714));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "rayBouncer") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 8));
      push("launchAngle", P.NATIVE_GRAPH_PARAM_PHASE, cont("launchAngle", 30));
      push("startX", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("startX", 0));
      push("startY", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("startY", 0));
      push("size", P.NATIVE_GRAPH_PARAM_WIDTH, cont("size", 1));
      push("aspect", P.NATIVE_GRAPH_PARAM_CENTER, cont("aspect", 1.5));
      push("rotate", P.NATIVE_GRAPH_PARAM_MIX, cont("rotate", 0));
      push("centerX", P.NATIVE_GRAPH_PARAM_OUT_LOW, cont("centerX", 0));
      push("centerY", P.NATIVE_GRAPH_PARAM_OUT_HIGH, cont("centerY", 0));
      push("maxDistance", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("maxDistance", 0));
      push("bend", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("bend", 0));
      push("xToY", P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, cont("xToY", 0));
      push("yToX", P.NATIVE_GRAPH_PARAM_DIFFUSION_AMOUNT, cont("yToX", 0));
      push("level", P.NATIVE_GRAPH_PARAM_LEVEL, cont("level", 1));
      continue;
    }
    if (type === "chordMemory") {
      continue;
    }
    if (type === "chordSequencer") {
      push("progression", P.NATIVE_GRAPH_PARAM_MODE, disc("progression", 0));
      push("level", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("level", 1));
      continue;
    }
    if (type === "pitchQuantizer") {
      push("scaleMask", P.NATIVE_GRAPH_PARAM_SEED, disc("scaleMask", 2741));
      continue;
    }
    if (type === "turingMachine") {
      push("length", P.NATIVE_GRAPH_PARAM_STAGES, disc("length", 8));
      push("probability", P.NATIVE_GRAPH_PARAM_SHAPE, cont("probability", 0.25));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "fractalBrownianNoise") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 0.5));
      push("octaves", P.NATIVE_GRAPH_PARAM_STAGES, disc("octaves", 4));
      push("persistence", P.NATIVE_GRAPH_PARAM_SHAPE, cont("persistence", 0.5));
      push("scale", P.NATIVE_GRAPH_PARAM_CENTER, cont("scale", 1));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "piSpigotNoise") {
      push("start", P.NATIVE_GRAPH_PARAM_CENTER, cont("start", 0));
      push("stride", P.NATIVE_GRAPH_PARAM_STAGES, disc("stride", 1));
      push("color", P.NATIVE_GRAPH_PARAM_MODE, disc("color", 0));
      push("smoothing", P.NATIVE_GRAPH_PARAM_SHAPE, cont("smoothing", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "randomWalk") {
      push("method", P.NATIVE_GRAPH_PARAM_MODE, disc("method", 3));
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 2));
      push("jitter", P.NATIVE_GRAPH_PARAM_WIDTH, cont("jitter", 0.25));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "cheapWalk") {
      // rate → frequency Control (process_cheap_walk reads node.frequency)
      push("rate", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("rate", 8));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 1));
      continue;
    }
    if (type === "pulseExplosion") {
      push("startTime", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("startTime", 0));
      push("centerTime", P.NATIVE_GRAPH_PARAM_CENTER, cont("centerTime", 0.5));
      push("endTime", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("endTime", 1));
      push("timeSpread", P.NATIVE_GRAPH_PARAM_MIX, cont("timeSpread", 0.3));
      push("numberOfPulses", P.NATIVE_GRAPH_PARAM_STAGES, disc("numberOfPulses", 20));
      push("lowAmplitude", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("lowAmplitude", 0.3));
      push("highAmplitude", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("highAmplitude", 1));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 0));
      continue;
    }
    if (type === "spiral") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 440));
      push("density", P.NATIVE_GRAPH_PARAM_SHAPE, cont("density", 1));
      push("size", P.NATIVE_GRAPH_PARAM_WIDTH, cont("size", 0.5));
      push("sharp", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("sharp", 0.5));
      push("sharpCurve", P.NATIVE_GRAPH_PARAM_MIX, cont("sharpCurve", 0));
      push("sharpCurveMult", P.NATIVE_GRAPH_PARAM_CENTER, cont("sharpCurveMult", 1));
      push("morph", P.NATIVE_GRAPH_PARAM_PHASE, cont("morph", 0));
      push("position", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("position", 0));
      push("rotX", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("rotX", 0));
      push("rotY", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("rotY", 0));
      push("zAmount", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("zAmount", 0));
      push("zDepth", P.NATIVE_GRAPH_PARAM_LEVEL, cont("zDepth", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "fractalSpiral") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1));
      push("spin", P.NATIVE_GRAPH_PARAM_PHASE, cont("spin", 0.05));
      push("size", P.NATIVE_GRAPH_PARAM_WIDTH, cont("size", 0.5));
      push("growth", P.NATIVE_GRAPH_PARAM_SHAPE, cont("growth", 1.5));
      push("gain", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("gain", 0.5));
      push("lacunarity", P.NATIVE_GRAPH_PARAM_CENTER, cont("lacunarity", 2));
      push("octaves", P.NATIVE_GRAPH_PARAM_STAGES, disc("octaves", 5));
      push("twist", P.NATIVE_GRAPH_PARAM_MIX, cont("twist", 0.381966));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "logSpiral") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1));
      push("spin", P.NATIVE_GRAPH_PARAM_PHASE, cont("spin", 0.05));
      push("size", P.NATIVE_GRAPH_PARAM_WIDTH, cont("size", 0.5));
      push("growth", P.NATIVE_GRAPH_PARAM_SHAPE, cont("growth", 3));
      push("turns", P.NATIVE_GRAPH_PARAM_STAGES, cont("turns", 4));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "blubb") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 8));
      push("shape", P.NATIVE_GRAPH_PARAM_SHAPE, disc("shape", 0));
      push("rotX", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("rotX", 0));
      push("rotY", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("rotY", 0));
      push("zDepth", P.NATIVE_GRAPH_PARAM_LEVEL, cont("zDepth", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "boing") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 8));
      push("density", P.NATIVE_GRAPH_PARAM_SHAPE, cont("density", 1));
      push("sharpness", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("sharpness", 0));
      push("rotX", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("rotX", 0));
      push("rotY", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("rotY", 0));
      push("zDepth", P.NATIVE_GRAPH_PARAM_LEVEL, cont("zDepth", 0));
      push("zAmount", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("zAmount", 0));
      push("ends", P.NATIVE_GRAPH_PARAM_MIX, cont("ends", 0));
      push("boing", P.NATIVE_GRAPH_PARAM_CENTER, cont("boing", 0));
      push("boingStrength", P.NATIVE_GRAPH_PARAM_WIDTH, cont("boingStrength", 0));
      push("dir", P.NATIVE_GRAPH_PARAM_MODE, cont("dir", 0));
      push("shape", P.NATIVE_GRAPH_PARAM_PHASE, cont("shape", 0));
      push("volume", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("volume", 1));
      push("volumePreJump", P.NATIVE_GRAPH_PARAM_TIMING_MODE, disc("volumePreJump", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "keplerBouwkamp") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 8));
      push("start", P.NATIVE_GRAPH_PARAM_CENTER, disc("start", 3));
      push("length", P.NATIVE_GRAPH_PARAM_STAGES, disc("length", 1));
      push("circles", P.NATIVE_GRAPH_PARAM_SHAPE, cont("circles", 0.5));
      push("zoom", P.NATIVE_GRAPH_PARAM_MIX, cont("zoom", 0));
      push("rotation", P.NATIVE_GRAPH_PARAM_PHASE, cont("rotation", 0));
      push("tri", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("tri", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "mushroom") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 8));
      push("phaseOffset", P.NATIVE_GRAPH_PARAM_PHASE, cont("phaseOffset", 0));
      push("numMushrooms", P.NATIVE_GRAPH_PARAM_STAGES, disc("numMushrooms", 1));
      push("grow", P.NATIVE_GRAPH_PARAM_MIX, cont("grow", 1));
      push("density", P.NATIVE_GRAPH_PARAM_SHAPE, cont("density", 3));
      push("capRotation", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("capRotation", 0));
      push("stemRotationSpeed", P.NATIVE_GRAPH_PARAM_LFO_RATE, cont("stemRotationSpeed", 0));
      push("head", P.NATIVE_GRAPH_PARAM_CENTER, cont("head", 0.6667));
      push("spread", P.NATIVE_GRAPH_PARAM_WIDTH, cont("spread", 0.5));
      push("wobble", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("wobble", 0.0625));
      push("clusterRotation", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("clusterRotation", 0));
      push("clusterRotationSpeed", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("clusterRotationSpeed", 0));
      push("sharp", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("sharp", 0));
      push("width", P.NATIVE_GRAPH_PARAM_LEVEL, cont("width", 1));
      push("stem", P.NATIVE_GRAPH_PARAM_MODE, cont("stem", 0));
      push("apart", P.NATIVE_GRAPH_PARAM_OVERSAMPLE, cont("apart", 0));
      push("capStemTransition", P.NATIVE_GRAPH_PARAM_RECYCLE, cont("capStemTransition", 0.1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "nyquistShannon") {
      push("frequencyA", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequencyA", 440));
      push("midiNoteRaw", P.NATIVE_GRAPH_PARAM_SEED, disc("midiNoteRaw", 48));
      push("rate", P.NATIVE_GRAPH_PARAM_CENTER, cont("rate", 20));
      push("sampleDots", P.NATIVE_GRAPH_PARAM_MIX, cont("sampleDots", 0));
      push("phaseOffset", P.NATIVE_GRAPH_PARAM_PHASE, cont("phaseOffset", 0));
      push("frequencyB", P.NATIVE_GRAPH_PARAM_WIDTH, cont("frequencyB", 5));
      push("subPhase", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("subPhase", 0));
      push("subPhaseRotationSpeed", P.NATIVE_GRAPH_PARAM_LFO_RATE, cont("subPhaseRotationSpeed", 0));
      push("tone", P.NATIVE_GRAPH_PARAM_SHAPE, cont("tone", 0));
      push("toneSmoothTime", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("toneSmoothTime", 0.01));
      push("artifact", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("artifact", 0));
      push("enableToneModPitch", P.NATIVE_GRAPH_PARAM_MODE, disc("enableToneModPitch", 1));
      push("enableToneModFreq", P.NATIVE_GRAPH_PARAM_STAGES, disc("enableToneModFreq", 0));
      push("enableToneModNote", P.NATIVE_GRAPH_PARAM_OVERSAMPLE, disc("enableToneModNote", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "radar") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 1));
      push("phaseOffset", P.NATIVE_GRAPH_PARAM_PHASE, cont("phaseOffset", 0));
      push("density", P.NATIVE_GRAPH_PARAM_SHAPE, cont("density", 1));
      push("sharp", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("sharp", 0));
      push("fade", P.NATIVE_GRAPH_PARAM_CENTER, cont("fade", 1));
      push("rotation", P.NATIVE_GRAPH_PARAM_MIX, cont("rotation", 0));
      push("direction", P.NATIVE_GRAPH_PARAM_MODE, cont("direction", 0));
      push("shade", P.NATIVE_GRAPH_PARAM_WIDTH, cont("shade", 1));
      push("lap", P.NATIVE_GRAPH_PARAM_LEVEL, cont("lap", 0));
      push("length", P.NATIVE_GRAPH_PARAM_STAGES, cont("length", 1));
      push("ratio", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("ratio", 0));
      push("frontring", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("frontring", 0));
      push("zoom", P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, cont("zoom", 0));
      push("zDepth", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("zDepth", 0));
      push("inner", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("inner", 0));
      push("x", P.NATIVE_GRAPH_PARAM_OUT_LOW, cont("x", 0));
      push("y", P.NATIVE_GRAPH_PARAM_OUT_HIGH, cont("y", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "torus") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 8));
      push("density", P.NATIVE_GRAPH_PARAM_SHAPE, cont("density", 1));
      push("quantizeDensity", P.NATIVE_GRAPH_PARAM_MODE, disc("quantizeDensity", 1));
      push("subdensity", P.NATIVE_GRAPH_PARAM_CENTER, cont("subdensity", 0));
      push("quantizeSubDensity", P.NATIVE_GRAPH_PARAM_STAGES, disc("quantizeSubDensity", 1));
      push("sharp", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("sharp", 0.5));
      push("size", P.NATIVE_GRAPH_PARAM_WIDTH, cont("size", 1));
      push("length", P.NATIVE_GRAPH_PARAM_MIX, cont("length", 0));
      push("balance", P.NATIVE_GRAPH_PARAM_PHASE, cont("balance", 0));
      push("wander", P.NATIVE_GRAPH_PARAM_LEVEL, cont("wander", 0));
      push("darkAngle", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("darkAngle", 0));
      push("darkIntensity", P.NATIVE_GRAPH_PARAM_SEED, disc("darkIntensity", 0));
      push("rotX", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("rotX", 0));
      push("rotY", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("rotY", 0));
      push("rotZ", P.NATIVE_GRAPH_PARAM_OUT_LOW, cont("rotZ", 0));
      push("zAngleX", P.NATIVE_GRAPH_PARAM_OUT_HIGH, cont("zAngleX", 0));
      push("zAngleY", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("zAngleY", 0));
      push("zDepth", P.NATIVE_GRAPH_PARAM_DIFFUSION_SIZE, cont("zDepth", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "wirdoSpiral") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 8));
      push("sharp", P.NATIVE_GRAPH_PARAM_RESONANCE, cont("sharp", 0));
      push("cross", P.NATIVE_GRAPH_PARAM_MIX, cont("cross", 0));
      push("density", P.NATIVE_GRAPH_PARAM_SHAPE, cont("density", 0.8));
      push("length", P.NATIVE_GRAPH_PARAM_WIDTH, cont("length", 1));
      push("rotate", P.NATIVE_GRAPH_PARAM_PHASE, cont("rotate", 0));
      push("splashDepth", P.NATIVE_GRAPH_PARAM_CENTER, cont("splashDepth", 0));
      push("splashDensity", P.NATIVE_GRAPH_PARAM_LEVEL, cont("splashDensity", 0));
      push("cut", P.NATIVE_GRAPH_PARAM_STAGES, disc("cut", 1000));
      push("scrap", P.NATIVE_GRAPH_PARAM_FEEDBACK, cont("scrap", 1));
      push("ringCut", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("ringCut", 10));
      push("splashSpeed", P.NATIVE_GRAPH_PARAM_LFO_RATE, cont("splashSpeed", 0));
      push("syncCut", P.NATIVE_GRAPH_PARAM_MODE, cont("syncCut", 1));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "phosphillator") {
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 2));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("sharpness", P.NATIVE_GRAPH_PARAM_SHAPE, cont("sharpness", 0.5));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "robinSupersaw") {
      // width = detuneCents, stages = voices
      push("frequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("frequency", 100));
      push("detuneCents", P.NATIVE_GRAPH_PARAM_WIDTH, cont("detuneCents", 30));
      push("voices", P.NATIVE_GRAPH_PARAM_STAGES, disc("voices", 7));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "slewLimiter") {
      // timeNumerator=upTime, timeDenominator=downTime, shape, offset=bias
      push("upTime", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("upTime", 0.05));
      push("downTime", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("downTime", 0.20));
      push("shape", P.NATIVE_GRAPH_PARAM_SHAPE, disc("shape", 0));
      push("bias", P.NATIVE_GRAPH_PARAM_ATT_OFFSET, cont("bias", 0));
      continue;
    }
    // comparator: no Control params
    if (type === "sampleDelay") {
      // timeNumerator=time (s), timeDenominator=samples
      push("time", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("time", 0));
      push("samples", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("samples", 0));
      continue;
    }
    if (type === "sampleHold") {
      // center=threshold, frequency=sampleFrequency; noise seed = node id hash in C++.
      push("threshold", P.NATIVE_GRAPH_PARAM_CENTER, cont("threshold", 0));
      push("sampleFrequency", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("sampleFrequency", 0));
      continue;
    }
    // minMax: no Control params
    if (type === "mix") {
      push("volume1", P.NATIVE_GRAPH_PARAM_LANE_VOL1, cont("volume1", 1));
      push("volume2", P.NATIVE_GRAPH_PARAM_LANE_VOL2, cont("volume2", 1));
      push("volume3", P.NATIVE_GRAPH_PARAM_LANE_VOL3, cont("volume3", 1));
      push("volume4", P.NATIVE_GRAPH_PARAM_LANE_VOL4, cont("volume4", 1));
      push("bias1", P.NATIVE_GRAPH_PARAM_LANE_BIAS1, cont("bias1", 0));
      push("bias2", P.NATIVE_GRAPH_PARAM_LANE_BIAS2, cont("bias2", 0));
      push("bias3", P.NATIVE_GRAPH_PARAM_LANE_BIAS3, cont("bias3", 0));
      push("bias4", P.NATIVE_GRAPH_PARAM_LANE_BIAS4, cont("bias4", 0));
      push("bleed2to1", P.NATIVE_GRAPH_PARAM_BLEED2, cont("bleed2to1", 0));
      push("bleed3to1", P.NATIVE_GRAPH_PARAM_BLEED3, cont("bleed3to1", 0));
      push("bleed4to1", P.NATIVE_GRAPH_PARAM_BLEED4, cont("bleed4to1", 0));
      continue;
    }
    if (type === "mixStereo") {
      push("volume1", P.NATIVE_GRAPH_PARAM_LANE_VOL1, cont("volume1", 0));
      push("volume2", P.NATIVE_GRAPH_PARAM_LANE_VOL2, cont("volume2", 0));
      push("volume3", P.NATIVE_GRAPH_PARAM_LANE_VOL3, cont("volume3", 0));
      push("volume4", P.NATIVE_GRAPH_PARAM_LANE_VOL4, cont("volume4", 0));
      push("pan1", P.NATIVE_GRAPH_PARAM_LANE_BIAS1, cont("pan1", 0));
      push("pan2", P.NATIVE_GRAPH_PARAM_LANE_BIAS2, cont("pan2", 0));
      push("pan3", P.NATIVE_GRAPH_PARAM_LANE_BIAS3, cont("pan3", 0));
      push("pan4", P.NATIVE_GRAPH_PARAM_LANE_BIAS4, cont("pan4", 0));
      push("amplitude", P.NATIVE_GRAPH_PARAM_VOLUME_DB, cont("amplitude", 0));
      continue;
    }
    if (type === "clipperLimiter") {
      // gainDb, minDb→inLow, maxDb→inHigh, oversample→antialias mode
      push("gainDb", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("gainDb", 0));
      push("minDb", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("minDb", -12));
      push("maxDb", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("maxDb", 0));
      push("oversample", P.NATIVE_GRAPH_PARAM_OVERSAMPLE, disc("oversample", 2));
      continue;
    }
    if (type === "midSideEncode") {
      push("midGain", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("midGain", 0));
      push("sideGain", P.NATIVE_GRAPH_PARAM_GAIN_LEFT_DB, cont("sideGain", 0));
      continue;
    }
    if (type === "vectorscopeTransform") {
      push("rotate", P.NATIVE_GRAPH_PARAM_LANE_BIAS1, cont("rotate", 0));
      continue;
    }
    if (type === "rotate3dTo2d") {
      push("rotateX", P.NATIVE_GRAPH_PARAM_LANE_BIAS1, cont("rotateX", 0));
      push("rotateY", P.NATIVE_GRAPH_PARAM_LANE_BIAS2, cont("rotateY", 0));
      push("rotateZ", P.NATIVE_GRAPH_PARAM_LANE_BIAS3, cont("rotateZ", 0));
      continue;
    }
    if (type === "clock") {
      // frequency=rate, phaseParam=phase, shape=duty, amplitude=level
      push("rate", P.NATIVE_GRAPH_PARAM_FREQUENCY, cont("rate", 2));
      push("phase", P.NATIVE_GRAPH_PARAM_PHASE, cont("phase", 0));
      push("duty", P.NATIVE_GRAPH_PARAM_SHAPE, cont("duty", 0.5));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "triggerDivider") {
      push("threshold", P.NATIVE_GRAPH_PARAM_CENTER, cont("threshold", 0));
      push("division", P.NATIVE_GRAPH_PARAM_STAGES, disc("division", 2));
      push("pulseTime", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("pulseTime", 0.01));
      push("level", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("level", 1));
      continue;
    }
    if (type === "delayedTrigger") {
      push("threshold", P.NATIVE_GRAPH_PARAM_CENTER, cont("threshold", 0));
      push("delay", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("delay", 0.1));
      push("pulseTime", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("pulseTime", 0.01));
      push("level", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("level", 1));
      continue;
    }
    if (type === "randomClock") {
      // timeNumerator=minSeconds, timeDenominator=maxSeconds, shape=duty,
      // offsetMs=triggerTime (seconds), seed, center=threshold, amplitude=level
      push("minSeconds", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("minSeconds", 0.25));
      push("maxSeconds", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("maxSeconds", 1));
      push("duty", P.NATIVE_GRAPH_PARAM_SHAPE, cont("duty", 0.5));
      push("triggerTime", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("triggerTime", 0.01));
      push("level", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("level", 1));
      push("seed", P.NATIVE_GRAPH_PARAM_SEED, disc("seed", 1));
      push("threshold", P.NATIVE_GRAPH_PARAM_CENTER, cont("threshold", 0));
      continue;
    }
    if (type === "triggerCounter") {
      push("threshold", P.NATIVE_GRAPH_PARAM_CENTER, cont("threshold", 0));
      push("countMax", P.NATIVE_GRAPH_PARAM_STAGES, disc("countMax", 8));
      push("increment", P.NATIVE_GRAPH_PARAM_WIDTH, cont("increment", 1));
      push("pulseTime", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("pulseTime", 0.01));
      push("level", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("level", 1));
      continue;
    }
    if (type === "metallicRatio") {
      push("index", P.NATIVE_GRAPH_PARAM_WIDTH, cont("index", 1));
      continue;
    }
    if (type === "lutCell") {
      push("truthTable", P.NATIVE_GRAPH_PARAM_SEED, disc("truthTable", 27030));
      continue;
    }
    if (type === "lookaheadLimiter") {
      push("ceiling", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("ceiling", -1));
      push("lookaheadEnabled", P.NATIVE_GRAPH_PARAM_MODE, disc("lookaheadEnabled", 1));
      push("lookaheadMs", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("lookaheadMs", 5));
      push("lookaheadSamples", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("lookaheadSamples", 0));
      push("attack", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("attack", 0.2));
      push("release", P.NATIVE_GRAPH_PARAM_LANE_BIAS1, cont("release", 100));
      push("gainCompensation", P.NATIVE_GRAPH_PARAM_TIMING_MODE, disc("gainCompensation", 0));
      push("dipGain", P.NATIVE_GRAPH_PARAM_LANE_BIAS2, cont("dipGain", 1));
      continue;
    }
    if (type === "limiter") {
      push("inputGain", P.NATIVE_GRAPH_PARAM_GAIN_DB, cont("inputGain", 0));
      push("threshold", P.NATIVE_GRAPH_PARAM_LANE_BIAS2, cont("threshold", -18));
      push("ratio", P.NATIVE_GRAPH_PARAM_WIDTH, cont("ratio", 8));
      push("lookaheadEnabled", P.NATIVE_GRAPH_PARAM_MODE, disc("lookaheadEnabled", 1));
      push("lookaheadMs", P.NATIVE_GRAPH_PARAM_TIME_NUMERATOR, cont("lookaheadMs", 5));
      push("lookaheadSamples", P.NATIVE_GRAPH_PARAM_TIME_DENOMINATOR, cont("lookaheadSamples", 0));
      push("attack", P.NATIVE_GRAPH_PARAM_OFFSET_MS, cont("attack", 5));
      push("release", P.NATIVE_GRAPH_PARAM_LANE_BIAS1, cont("release", 250));
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      continue;
    }
    if (type === "stepSequencer") {
      push("threshold", P.NATIVE_GRAPH_PARAM_CENTER, cont("threshold", 0));
      push("steps", P.NATIVE_GRAPH_PARAM_STAGES, disc("steps", 8));
      push("level", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("level", 1));
      push("step1", P.NATIVE_GRAPH_PARAM_LANE_VOL1, cont("step1", 0));
      push("step2", P.NATIVE_GRAPH_PARAM_LANE_VOL2, cont("step2", 0.25));
      push("step3", P.NATIVE_GRAPH_PARAM_LANE_VOL3, cont("step3", 0.5));
      push("step4", P.NATIVE_GRAPH_PARAM_LANE_VOL4, cont("step4", 0.75));
      push("step5", P.NATIVE_GRAPH_PARAM_LANE_BIAS1, cont("step5", 1));
      push("step6", P.NATIVE_GRAPH_PARAM_LANE_BIAS2, cont("step6", 0.75));
      push("step7", P.NATIVE_GRAPH_PARAM_LANE_BIAS3, cont("step7", 0.5));
      push("step8", P.NATIVE_GRAPH_PARAM_LANE_BIAS4, cont("step8", 0.25));
      continue;
    }
    if (type === "transport") {
      push("amplitude", P.NATIVE_GRAPH_PARAM_AMPLITUDE, cont("amplitude", 1));
      push("divisions", P.NATIVE_GRAPH_PARAM_STAGES, disc("divisions", 0));
      push("bpm", P.NATIVE_GRAPH_PARAM_TEMPO_BPM, cont("bpm", 120));
      continue;
    }
    if (type === "range") {
      push("inLow", P.NATIVE_GRAPH_PARAM_IN_LOW, cont("inLow", -1));
      push("inHigh", P.NATIVE_GRAPH_PARAM_IN_HIGH, cont("inHigh", 1));
      push("outLow", P.NATIVE_GRAPH_PARAM_OUT_LOW, cont("outLow", 0));
      push("outHigh", P.NATIVE_GRAPH_PARAM_OUT_HIGH, cont("outHigh", 1000));
      continue;
    }
    // inv / u2b / b2u: no Control params
  }
};

/**
 * Rebuild the native graph from the current plan (DSP allowlist types only).
 * Returns true when compile succeeded.
 */
NodeLiveAudioProcessor.prototype.compileNativeGraphFromPlan = function compileNativeGraphFromPlan() {
  this.nativeGraphCompiled = false;
  this._nativeGraphTopologyKey = "";
  this.nativeGraphBlockViews = null;
  this.nativeGraphPortViewCache = null;
  this._nativeGraphParamCache = null;
  this._nativeGraphParamCachePlanSerial = undefined;

  if (!this.efficientProduct) {
    return false;
  }
  if (!this.nativeGraphExportsReady()) {
    this.postNativeGraphStatus("missing", "graph_engine exports not loaded");
    return false;
  }

  const native = this.nativeGraph;
  if (!this.nativeGraphHandle) {
    try {
      this.nativeGraphHandle = native.soemdsp_graph_create() | 0;
    } catch (_e) {
      this.nativeGraphHandle = 0;
    }
  }
  if (!this.nativeGraphHandle) {
    this.postNativeGraphStatus("error", "soemdsp_graph_create failed");
    return false;
  }

  try {
    // Graph owns the only native DSP instances in efficient mode.
    this.releaseEfficientLegacyNativeHandles();

    native.soemdsp_graph_clear(this.nativeGraphHandle);
    native.soemdsp_graph_set_sample_rate(
      this.nativeGraphHandle,
      Number(this.engineSampleRate) || Number(this.hostSampleRate) || sampleRate || 44100,
    );

    const audioTypes = NodeLiveAudioProcessor.NATIVE_GRAPH_TYPE_IDS;
    const nodes = [];
    const skipped = [];
    for (const [id, node] of this.nodes) {
      const type = String(node?.type || "");
      const typeId = this.mapNativeGraphTypeId(type);
      if (!typeId || !Object.prototype.hasOwnProperty.call(audioTypes, type)) {
        if (type) skipped.push(type);
        continue;
      }
      const hash = this.fnv1aHash32(id);
      const rc = native.soemdsp_graph_add_node(this.nativeGraphHandle, hash, typeId) | 0;
      if (rc !== 0) {
        const poolMsg = rc === -5
          ? `native instance pool exhausted for ${id}`
          : `add_node failed (${rc}) for ${id}`;
        this.postNativeGraphStatus("error", poolMsg);
        return false;
      }
      nodes.push({ id, hash, type: node.type, params: node.params || {} });
    }

    // Never mark compiled with an empty DSP graph — that raced ahead of setPlan
    // (wasm apply while this.nodes was still empty) and left Live silent.
    if (!nodes.length) {
      this.nativeGraphCompiled = false;
      this._nativeGraphTopologyKey = "";
      const skipMsg = skipped.length ? ` skipped=${skipped.join(",")}` : "";
      this.postNativeGraphStatus(
        "idle",
        `nodes=0 (workletNodes=${this.nodes.size}${skipMsg})`,
      );
      return false;
    }

    const idSet = new Set(nodes.map((n) => n.id));
    const hashById = new Map(nodes.map((n) => [n.id, n.hash]));
    const typeById = new Map(nodes.map((n) => [n.id, n.type]));
    const connections = Array.isArray(this._planConnections) ? this._planConnections : [];
    for (const c of connections) {
      const src = String(c?.sourceNode || "");
      const dst = String(c?.destinationNode || "");
      if (!idSet.has(src) || !idSet.has(dst)) continue;
      const rc = native.soemdsp_graph_connect(
        this.nativeGraphHandle,
        hashById.get(src),
        this.mapNativeGraphSrcPortId(c?.sourcePort, typeById.get(src)),
        hashById.get(dst),
        this.mapNativeGraphDstPortId(c?.destinationPort, typeById.get(dst)),
      ) | 0;
      if (rc !== 0) {
        this.postNativeGraphStatus("error", `connect failed (${rc}) ${src}->${dst}`);
        return false;
      }
    }

    const crc = native.soemdsp_graph_compile(this.nativeGraphHandle) | 0;
    if (crc !== 0) {
      this.postNativeGraphStatus("error", `compile failed (${crc})`);
      return false;
    }

    this.nativeGraphCompiled = true;
    this._nativeGraphTopologyKey = this.nativeGraphTopologyKey();
    this.syncNativeGraphParams();
    // Graph recreate starts Controls at C++ defaults; after targets are
    // written, snap so engine-start does not ramp from defaults → patch.
    this.snapNativeGraphControls();
    this.syncNativeGraphBypass();
    this.postNativeGraphStatus("compiled", `nodes=${nodes.length}`);
    return true;
  } catch (error) {
    this.nativeGraphCompiled = false;
    this._nativeGraphTopologyKey = "";
    this.postNativeGraphStatus("error", String(error?.message || error || "compile threw"));
    return false;
  }
};

NodeLiveAudioProcessor.prototype.bindNativeGraphBlockViews = function bindNativeGraphBlockViews(frames) {
  const native = this.nativeGraph;
  const memory = native?.memory;
  if (!memory?.buffer || !this.nativeGraphHandle || frames < 1) {
    return false;
  }
  const cache = this.nativeGraphBlockViews || (this.nativeGraphBlockViews = {});
  if (cache.left && cache.memory === memory.buffer && cache.frames === frames) {
    return true;
  }
  const leftPtr = native.soemdsp_graph_block_output_left_ptr(this.nativeGraphHandle);
  const rightPtr = native.soemdsp_graph_block_output_right_ptr(this.nativeGraphHandle);
  if (!leftPtr || !rightPtr) {
    return false;
  }
  cache.left = new Float64Array(memory.buffer, leftPtr, frames);
  cache.right = new Float64Array(memory.buffer, rightPtr, frames);
  cache.memory = memory.buffer;
  cache.frames = frames;
  return true;
};

/** Map native audio port id → face port name(s) for nodeOutputs / scopes. */
NodeLiveAudioProcessor.prototype.nativeGraphPortNames = function nativeGraphPortNames(type, portId) {
  const P = NodeLiveAudioProcessor;
  if (portId === P.NATIVE_GRAPH_PORT_MONO) {
    if (type === "polyBlep" || type === "blit") return ["Out", "Wave Out", "Noise"];
    if (type === "sineWavetable") return ["A", "Out", "sin", "Sin"];
    if (type === "archimedes") return ["Sine", "Out"];
    if (type === "comparator") return ["Thru"];
    if (type === "sampleDelay") return ["Delayed", "Out", "Mono"];
    if (type === "minMax") return ["Max"];
    if (type === "mix") return ["Out1"];
    if (type === "midSideEncode") return ["Mid"];
    if (type === "vectorscopeTransform" || type === "rotate3dTo2d") return ["X"];
    if (type === "ellipsoid") return ["Bi X", "Out", "Mono"];
    if (type === "snowflake") return ["Out", "Mono"];
    if (type === "clock") return ["Digital Out", "Out", "Digital"];
    if (type === "randomClock") return ["Trigger"];
    if (type === "triggerCounter") return ["Pulse"];
    if (type === "metallicRatio") return ["Ratio"];
    if (type === "lutCell") return ["Out"];
    if (type === "stepSequencer") return ["Out"];
    if (type === "transport") return ["-1..1"];
    return ["Out", "Mono", "In"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_LEFT) {
    if (type === "sineWavetable") return ["B", "cos", "Cos"];
    if (type === "archimedes") return ["Cosine"];
    if (type === "minMax") return ["Min"];
    if (type === "mix") return ["Out2"];
    if (type === "midSideEncode") return ["Side"];
    if (type === "vectorscopeTransform" || type === "rotate3dTo2d") return ["Y"];
    if (type === "ellipsoid") return ["Bi X", "X"];
    if (type === "snowflake") return ["X"];
    if (type === "clock") return ["Analog Out", "Analog"];
    if (type === "randomClock") return ["Gate"];
    if (type === "triggerCounter") return ["Count"];
    if (type === "lutCell") return ["Q"];
    if (type === "stepSequencer") return ["Gate"];
    if (type === "transport") return ["0..1"];
    if (type === "reverbEffect" || type === "soemReverb") {
      return ["Left", "Mix Left", "Mix L", "Wet L", "Dry Left", "Dry L"];
    }
    if (type === "pingPongDelay") {
      return ["Left", "Mod Left", "Mod L"];
    }
    if (type === "noiseGenerator" || type === "cheapWalk" || type === "randomWalk") {
      return ["Left", "Left Out"];
    }
    return ["Left"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_RIGHT) {
    if (type === "sineWavetable") return ["C"];
    if (type === "archimedes") return ["Pi"];
    if (type === "mix") return ["Out3"];
    if (type === "ellipsoid") return ["Bi Y", "Y"];
    if (type === "snowflake") return ["Y"];
    if (type === "clock") return ["T", "Pulse", "Trigger"];
    if (type === "transport") return ["Trigger"];
    if (type === "reverbEffect" || type === "soemReverb") {
      return ["Right", "Mix Right", "Mix R", "Wet R", "Dry Right", "Dry R"];
    }
    if (type === "pingPongDelay") {
      return ["Right", "Mod Right", "Mod R"];
    }
    if (type === "noiseGenerator" || type === "cheapWalk" || type === "randomWalk") {
      return ["Right", "Right Out"];
    }
    return ["Right"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_SAW) {
    if (type === "sineWavetable") return ["D"];
    if (type === "archimedes") return ["Noise Below"];
    if (type === "ellipsoid") return ["Uni X"];
    if (type === "comparator") return ["Up"];
    if (type === "sampleDelay") return ["Thru"];
    if (type === "mix") return ["Out4"];
    if (type === "mixStereo") return ["L2"];
    if (type === "lookaheadLimiter" || type === "limiter") return ["Gain"];
    if (type === "transport") return ["f"];
    return type === "reverbEffect" ? ["Dry L"] : type === "pingPongDelay" ? ["Mod L", "Saw"] : ["Saw"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_RAMP) {
    if (type === "limiter") return ["Env"];
    if (type === "archimedes") return ["Noise Above"];
    if (type === "ellipsoid") return ["Uni Y"];
    if (type === "comparator") return ["Down"];
    if (type === "mixStereo") return ["R2"];
    return type === "reverbEffect" ? ["Dry R"] : type === "pingPongDelay" ? ["Mod R", "Ramp"] : ["Ramp"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_SQUARE) {
    if (type === "comparator") return ["Change"];
    if (type === "mixStereo") return ["L3"];
    return ["Square"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_TRI) {
    if (type === "comparator") return ["Steady"];
    if (type === "mixStereo") return ["R3"];
    return ["Tri"];
  }
  if (portId === P.NATIVE_GRAPH_PORT_SINE) {
    if (type === "comparator") return ["Sign"];
    if (type === "mixStereo") return ["L4"];
    return ["Sine"];
  }
  return [];
};

NodeLiveAudioProcessor.prototype.bindNativeGraphNodePortView = function bindNativeGraphNodePortView(
  hash,
  portId,
  frames,
) {
  const native = this.nativeGraph;
  const memory = native?.memory;
  if (!memory?.buffer || !this.nativeGraphHandle || !native.soemdsp_graph_node_port_ptr) {
    return null;
  }
  const cache = this.nativeGraphPortViewCache || (this.nativeGraphPortViewCache = new Map());
  const key = `${hash >>> 0}:${portId | 0}:${frames | 0}`;
  const hit = cache.get(key);
  if (hit && hit.memory === memory.buffer && hit.view && hit.view.length === frames) {
    return hit.view;
  }
  let ptr = 0;
  try {
    ptr = native.soemdsp_graph_node_port_ptr(this.nativeGraphHandle, hash, portId) | 0;
  } catch (_e) {
    return null;
  }
  if (!ptr) return null;
  const view = new Float64Array(memory.buffer, ptr, frames);
  cache.set(key, { memory: memory.buffer, view });
  return view;
};

/**
 * Publish last-sample port values + append block samples into scope rings.
 * Observe-only — never walks JS DSP evaluators.
 * Output node taps use ear-protected speaker buffers when provided (options.protected*).
 */
NodeLiveAudioProcessor.prototype.publishNativeGraphScopeTaps = function publishNativeGraphScopeTaps(
  frames,
  options = {},
) {
  if (!this.nativeGraphCompiled || !this.nativeGraphHandle || frames < 1) return;
  const fillRings = options.fillRings !== false;
  const stressed = Boolean(options.stressed);
  const protectedLeft = options.protectedLeft || null;
  const protectedRight = options.protectedRight || protectedLeft;
  const frameOffset = Math.max(0, Number(options.frameOffset) || 0);
  const outputNodeId = this.outputNode || "output";
  const P = NodeLiveAudioProcessor;
  const audioPorts = [
    P.NATIVE_GRAPH_PORT_MONO,
    P.NATIVE_GRAPH_PORT_LEFT,
    P.NATIVE_GRAPH_PORT_RIGHT,
    P.NATIVE_GRAPH_PORT_SAW,
    P.NATIVE_GRAPH_PORT_RAMP,
    P.NATIVE_GRAPH_PORT_SQUARE,
    P.NATIVE_GRAPH_PORT_TRI,
    P.NATIVE_GRAPH_PORT_SINE,
  ];

  for (const [id, node] of this.nodes) {
    const type = String(node?.type || "");
    if (!Object.prototype.hasOwnProperty.call(P.NATIVE_GRAPH_TYPE_IDS, type)) continue;
    // Output nodeOutputs come from ear-protected speaker bus (set after protect).
    if (type === "output") continue;
    const hash = this.fnv1aHash32(id);
    const out = Object.create(null);
    let any = false;
    for (let pi = 0; pi < audioPorts.length; pi += 1) {
      const portId = audioPorts[pi];
      const view = this.bindNativeGraphNodePortView(hash, portId, frames);
      if (!view || !view.length) continue;
      const last = Number(view[frames - 1]);
      const sample = Number.isFinite(last) ? last : 0;
      const names = this.nativeGraphPortNames(type, portId);
      for (let ni = 0; ni < names.length; ni += 1) {
        out[names[ni]] = sample;
        any = true;
      }
    }
    if (any) {
      this.nodeOutputs.set(id, out);
    }
  }

  if (protectedLeft && frames > 0) {
    const lastL = Number(protectedLeft[frameOffset + frames - 1]) || 0;
    const lastR = Number(protectedRight?.[frameOffset + frames - 1] ?? lastL) || 0;
    this.nodeOutputs.set(outputNodeId, {
      Left: lastL,
      Right: lastR,
      Mono: (lastL + lastR) * 0.5,
      Out: (lastL + lastR) * 0.5,
    });
  }

  if (!fillRings || typeof this.appendScopeBufferSample !== "function") {
    return;
  }
  if (!Array.isArray(this.compiledVisualSinks) || !Array.isArray(this.compiledScopeNodes)) {
    this.compileScopeCapture?.();
  }

  // Module face rings: one sample per quantum (last). Under stress, still
  // refresh faces every 8th quantum so Instant Trace / module plates do not
  // freeze solid when robinSupersaw + stereo visual sinks overrun the budget.
  const faceStride = stressed ? 8 : 1;
  const facePhase = (Number(this.scopeCounter) || 0);
  if (Array.isArray(this.compiledScopeNodes) && (facePhase % faceStride) === 0) {
    for (let i = 0; i < this.compiledScopeNodes.length; i += 1) {
      const entry = this.compiledScopeNodes[i];
      const nodeId = entry?.nodeId;
      if (!nodeId || !this.nodeOutputs.has(nodeId)) continue;
      this.captureModuleScopeOutput?.(nodeId, this.nodeOutputs.get(nodeId));
    }
  }

  const readSrcSample = (sourceNode, sourcePort, frame) => {
    const srcType = String(this.nodes.get(sourceNode)?.type || "");
    if (srcType === "output" && protectedLeft) {
      const portId = this.mapNativeGraphSrcPortId(sourcePort, srcType);
      const idx = frameOffset + frame;
      if (portId === P.NATIVE_GRAPH_PORT_RIGHT) {
        return Number(protectedRight?.[idx] ?? protectedLeft[idx]) || 0;
      }
      if (portId === P.NATIVE_GRAPH_PORT_LEFT) {
        return Number(protectedLeft[idx]) || 0;
      }
      const l = Number(protectedLeft[idx]) || 0;
      const r = Number(protectedRight?.[idx] ?? l) || 0;
      return (l + r) * 0.5;
    }
    // Yellow Graph Additive Out is JS-sidecar only — tap Mono / Left / Right rings.
    // Sidecar buffers are this quantum only (0…frames-1), not the speaker ring offset.
    if (srcType === "additiveOut") {
      const port = String(sourcePort || "").toLowerCase();
      let map = this._additiveOutMono;
      let lastKey = "Mono";
      if (port === "left" || port === "l") {
        map = this._additiveOutLeft;
        lastKey = "Left";
      } else if (port === "right" || port === "r") {
        map = this._additiveOutRight;
        lastKey = "Right";
      }
      const buf = map?.get(String(sourceNode));
      if (buf && frame >= 0 && frame < buf.length) {
        const v = Number(buf[frame]);
        return Number.isFinite(v) ? v : 0;
      }
      const last = this.nodeOutputs?.get?.(String(sourceNode));
      return Number(last?.[lastKey] ?? last?.Mono) || 0;
    }
    const portId = this.mapNativeGraphSrcPortId(sourcePort, srcType);
    const hash = this.fnv1aHash32(sourceNode);
    const view = this.bindNativeGraphNodePortView(hash, portId, frames);
    if (view && frame < view.length) {
      const v = Number(view[frame]);
      return Number.isFinite(v) ? v : 0;
    }
    return Number(this.readRuntimePortOutput?.(
      this.nodeOutputs,
      sourceNode,
      sourcePort,
      frame,
      frames,
    )) || 0;
  };

  // Visual sinks (scope/monitor): append block samples from native / protected buffers.
  const sinks = this.compiledVisualSinks;
  if (!Array.isArray(sinks) || !sinks.length) return;
  const stride = stressed ? 8 : 1;
  const engineRate = Math.max(1, Number(this.engineSampleRate) || sampleRate || 44100);
  for (let s = 0; s < sinks.length; s += 1) {
    const sink = sinks[s];
    const inputs = sink?.inputs;
    if (!Array.isArray(inputs) || !inputs.length) continue;
    for (let frame = 0; frame < frames; frame += stride) {
      let aggregate = 0;
      for (let i = 0; i < inputs.length; i += 1) {
        const input = inputs[i];
        const connections = input?.connections;
        let inputValue = 0;
        if (Array.isArray(connections)) {
          for (let c = 0; c < connections.length; c += 1) {
            const connection = connections[c];
            inputValue += readSrcSample(connection.sourceNode, connection.sourcePort, frame);
          }
        }
        aggregate += inputValue;
        if (input.buffered && input.port) {
          this.writeVisualInputBufferSample?.(
            sink.nodeId,
            input.port,
            inputValue,
            sink.bufferSampleLimit,
            {
              sampleStride: stride,
              sourceSampleRate: engineRate,
              writeSampleRate: engineRate / stride,
            },
          );
        }
        if (input.portId && !input.buffered) {
          this.appendScopeBufferSample(input.portId, inputValue);
        }
      }
      if (!sink.skipAggregate) {
        this.appendScopeBufferSample(sink.nodeId, aggregate);
      }
    }
  }
};

/**
 * Efficient-mode quantum: native process_block (chunked at max_block_frames),
 * copy to speakers + ear protect. Timing/meter posts stay in process().
 * Returns true when this path handled audio (caller must not evaluateFrame).
 *
 * Contract: graph + orchestrated natives hard-cap at 128 frames. Host chunks
 * larger quanta so the efficient path never trailing-silences mid-quantum.
 */
NodeLiveAudioProcessor.prototype.processNativeGraphQuantum = function processNativeGraphQuantum(
  output,
  frames,
) {
  if (!this.efficientProduct) {
    return false;
  }

  const fillSilence = () => {
    for (const channel of output) {
      if (channel) channel.fill(0);
    }
  };

  if (!this.nativeGraphCompiled) {
    // setPlan often races ahead of combined-wasm instantiate. Retry compile
    // once exports land so we do not stay silent forever after a cold start.
    if (this.nativeGraphExportsReady()) {
      const now = Number(currentFrame) || 0;
      if (!Number.isFinite(this._nativeGraphCompileRetryFrame)
        || now - this._nativeGraphCompileRetryFrame >= 128) {
        this._nativeGraphCompileRetryFrame = now;
        try {
          this.syncNativeGraphFromPlan?.() || this.compileNativeGraphFromPlan?.();
        } catch (_e) { /* status posted by compile */ }
      }
    }
    if (!this.nativeGraphCompiled) {
      fillSilence();
      if (this.nativeGraphExportsReady()) {
        this.postNativeGraphStatus("idle", "graph not compiled");
      } else {
        this.postNativeGraphStatus("missing", "graph_engine exports not loaded");
      }
      return true;
    }
  }

  // Controllers (knob/slider/toggle) are not native — publish Bias/Out for MOD.
  if (typeof this.processControllerEfficientSidecar === "function") {
    try {
      this.processControllerEfficientSidecar(frames);
    } catch (_e) { /* keep audio */ }
  }

  // Write targets only — native graph_engine SmootherManager chases outs.
  this.syncNativeGraphParams?.(frames);

  // Yellow Graph chain (Generator→Effect→Out) is JS until native Yellow Graph lands.
  // Build Graph + scratch audio once per quantum; mix below before ear-protect.
  if (typeof this.processAdditiveYellowGraphSidecar === "function") {
    try {
      this.processAdditiveYellowGraphSidecar(output, frames);
    } catch (_e) {
      // Keep native audio if Yellow Graph sidecar throws.
    }
  }

  const native = this.nativeGraph;
  const maxBlock = Math.max(1, Number(native.soemdsp_graph_max_block_frames()) || 128);
  let written = 0;
  const stressed = Boolean(this.audioThreadStressed);
  const addL = this._additiveScratchL;
  const addR = this._additiveScratchR;

  while (written < frames) {
    const chunk = Math.min(maxBlock, frames - written);
    let processed = 0;
    try {
      processed = native.soemdsp_graph_process_block(this.nativeGraphHandle, chunk) | 0;
    } catch (_e) {
      processed = -1;
    }
    // Invalidate view cache size when chunk length changes across iterations.
    if (this.nativeGraphBlockViews) this.nativeGraphBlockViews.frames = -1;
    if (processed < 1 || !this.bindNativeGraphBlockViews(chunk)) {
      for (let frame = written; frame < frames; frame += 1) {
        for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
          output[channelIndex][frame] = 0;
        }
      }
      this.nativeGraphCompiled = false;
      this.postNativeGraphStatus("error", "process_block failed");
      return true;
    }

    const leftView = this.nativeGraphBlockViews.left;
    const rightView = this.nativeGraphBlockViews.right;
    const outCount = Math.min(chunk, leftView.length, rightView.length);
    for (let i = 0; i < outCount; i += 1) {
      const frame = written + i;
      let left = Number(leftView[i]);
      let right = Number(rightView[i]);
      if (!Number.isFinite(left)) left = 0;
      if (!Number.isFinite(right)) right = 0;
      if (addL && frame < addL.length) left += Number(addL[frame]) || 0;
      if (addR && frame < addR.length) right += Number(addR[frame]) || 0;
      if (this.outputSampleClipped?.(left)) this.meterClipCount += 1;
      if (this.outputSampleClipped?.(right)) this.meterClipCount += 1;
      if (
        this.outputSampleTripsEarProtection?.(left)
        || this.outputSampleTripsEarProtection?.(right)
      ) {
        this.speakerProtectionPeak = Math.max(
          Number(this.speakerProtectionPeak) || 0,
          Math.abs(left),
          Math.abs(right),
        );
        this.speakerProtectionNodeId = "output";
      }
      const protectedFrame = this.earProtector.protect(left, right);
      if (protectedFrame.engaged || protectedFrame.muted) {
        this.meterProtectionMuteCount += 1;
      }
      this.protectionEngaged = Boolean(protectedFrame.engaged);
      this.protectionGain = Number(protectedFrame.gain);
      const pl = Number.isFinite(Number(protectedFrame.left)) ? Number(protectedFrame.left) : 0;
      const pr = Number.isFinite(Number(protectedFrame.right)) ? Number(protectedFrame.right) : 0;
      this.meterPeak = Math.max(this.meterPeak, Math.abs(pl), Math.abs(pr));
      this.meterSquareSum += (pl * pl + pr * pr) * 0.5;
      this.meterSamples += 1;
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex][frame] = channelIndex === 0 ? pl : pr;
      }
    }
    for (let i = outCount; i < chunk; i += 1) {
      const frame = written + i;
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex][frame] = 0;
      }
    }

    // Scope taps: DSP from native bufs; output sinks from ear-protected speakers.
    this.publishNativeGraphScopeTaps(chunk, {
      fillRings: true,
      stressed,
      protectedLeft: output[0],
      protectedRight: output[1] || output[0],
      frameOffset: written,
    });

    written += chunk;
  }

  return true;
};
