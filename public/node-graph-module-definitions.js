const nodeGraphNodeLabels = Object.freeze({
  audioInput: "Input",
  codeblock: "Codeblock",
  customDisplay: "Custom Display",
  // graph2: point-to-point segments (shape + contour per control point).
  // graphCopy: same as graph2 (kept as an alias-style twin).
  // (The old "graph" type was retired -- see nodeGraphRetiredNodeTypes.)
  graph2: "Smooth Graph",
  graphCopy: "Step Graph",
  animatedTextBox: "Animated Text Box",
  moduleGroup: "Module Group",
  nextPatch: "Next Patch",
  previousPatch: "Previous Patch",
  osc: "BasicShape",
  polyBlep: "PolyBLEP",
  blit: "BLIT",
  archimedes: "Archimedes",
  sineWavetable: "SinCos4",
  sinCos: "SinCos",
  aliasSine: "Alias Sine",
  robinSinusoid: "RobinSinusoid",
  phoneTone: "Phone Tone",
  additiveOsc: "Additive Osc",
  gpuAdditiveOsc: "GPU Additive",
  ellipsoid: "RoundShape",
  ellipsoidOsc: "Ellipsoid",
  basicShape: "BasicShape",
  clock: "Clock",
  transport: "Master Clock",
  clockDivider: "Clock Divider",
  delayedTrigger: "Delayed Trigger",
  buttonEvents: "Button Events",
  wireBreak: "Wire Break",
  wireConnect: "Wire Connect",
  wireDisconnect: "Wire Disconnect",
  windowReopen: "Window Reopen",
  shootingStarTail: "Shooting Star Tail",
  shootingStarExplosion: "Shooting Star Explosion",
  randomClock: "Random Clock",
  triggerCounter: "Trigger Counter",
  triggerDivider: "Trigger Divider",
  comparator: "Comparator",
  sampleDelay: "Sample Delay",
  bitConverter: "Bit Converter",
  t: "t",
  t1: "1t",
  t2: "2t",
  t3: "3t",
  t4: "4t",
  t5: "5t",
  t6: "6t",
  t7: "7t",
  t8: "8t",
  t9: "9t",
  t10: "10t",
  stepSequencer: "Step Sequencer",
  spiral: "Spiral",
  fractalSpiral: "Fractal Spiral",
  logSpiral: "Logarithmic Spiral",
  wirdoSpiral: "WirdoSpiral",
  blubb: "Blubb",
  mushroom: "Mushroom",
  boing: "Boing",
  torus: "Torus",
  keplerBouwkamp: "Kepler-Bouwkamp",
  nyquistShannon: "NyquistShannon",
  radar: "Radar",
  lorenzAttractor: "Lorenz Attractor",
  logisticMap: "Logistic Map",
  bradley2a: "Bradley 2A Jitter/Hit Synth",
  antisaw: "Antisaw",
  henonMap: "Henon Map",
  // rayBouncer label lives in modules/rayBouncer/*-register.js (chromeless).
  chuaAttractor: "Chua Attractor",
  chordMemory: "Chord Memory",
  turingMachine: "Turing Machine",
  pitchQuantizer: "Pitch Quantizer",
  chordPad: "Chord Pad",
  degreeTuring: "Degree Turing",
  gravityWalker: "Gravity Walker",
  degreePhrase: "Degree Phrase",
  noteGlide: "Note Glide",
  noteTranspose: "Note Transpose",
  surgeOscillator: "Surge Oscillator",
  softwaveOsc: "Softwave Oscillator",
  curveOsc: "Curve Oscillator",
  snowflake: "Snowflake",
  dsfOscillator: "DSF Oscillator",
  robinSupersaw: "RobinSupersaw",
  hypersaw: "Hypersaw",
  chordSequencer: "Chord Sequencer",
  lutCell: "LUT Cell",
  metallicRatio: "Metallic Ratio",
  noiseGenerator: "Noise Generator",
  randomWalk: "Random Walk",
  piSpigotNoise: "Pi Spigot Noise",
  fractalBrownianNoise: "Fractal Brownian Motion",
  gain: "Gain",
  // Legacy id — patches migrate to "gain" on load.
  gainBias: "Gain",
  mix: "Mix",
  mixStereo: "MixStereo",
  // Legacy id for Mix
  gainBiasMix: "Mix",
  bias: "Bias",
  attenuverter: "Attenuverter",
  u2b: "U2B",
  b2u: "B2U",
  inv: "Inv",
  softClipper: "Soft Clipper",
  clipperLimiter: "Clipper Limiter",
  airClipper: "AirClipper",
  rotate3dTo2d: "Rotation 3D to 2D",
  vectorscopeTransform: "Vectorscope Rotation",
  knob: "Knob",
  pluginSlider: "Slider",
  toggleButton: "Toggle",
  momentaryButton: "Momentary",
  pluginInput: "Plugin Input",
  pluginOutput: "Plugin Output",
  pluginMidiIn: "Plugin MIDI In",
  pluginMidiOut: "Plugin MIDI Out",
  passiveFilter: "Passive Filter",
  tiltFilter: "Tilt Filter",
  eqFilter: "EQ Filter",
  cookbookFilter: "Multi Stage Filter",
  flowerChildFilter: "Flower Child Filter",
  activeFilter: "Active Filter",
  yellowjacketFilter: "Yellowjacket Filter",
  superloveFilter: "SuperLove Filter",
  chaoticPhaseLockingFilter: "Chaotic Phase Locking Filter",
  resonatorFilter: "Resonator Filter",
  modeResonator: "Mode Resonator",
  combResonator: "Comb Resonator",
  waveguide: "Waveguide",
  phaser: "Phaser",
  flanger: "Flanger",
  chorus: "Chorus",
  bode: "Bode Shifter",
  phaseDisperse: "Phase Disperse",
  stftBlur: "STFT Blur",
  humanFilter: "Human Filter",
  pulseExplosion: "Pulse Explosion",
  ladderFilter: "Ladder Filter",
  tb303Filter: "TB-303 Filter",
  papoulisFilter: "Papoulis Filter",
  butterworth: "Butterworth Filter",
  linkwitzRiley: "Linkwitz-Riley Filter",
  bessel: "Bessel Filter",
  besselThomson: "Bessel-Thomson Filter",
  massSpringDamper: "Mass-Spring-Damper",
  chebyshev: "Chebyshev Filter",
  elliptic: "Elliptic Filter",
  bandpass: "Bandpass Filter",
  allpass: "Allpass Filter",
  crossover2: "2-Crossover",
  crossover3: "3-Crossover",
  crossover4: "4-Crossover",
  crossover5: "5-Crossover",
  crossover6: "6-Crossover",
  softpopOscillator: "Softpop Oscillator",
  sinepulse: "Sinepulse",
  kickEnvelope: "Kick Envelope",
  sineKick: "Sine Kick",
  electroKick: "ElectroKick",
  electroSnare: "ElectroSnare",
  electroHat: "ElectroHat",
  formantFilter: "Formant Filter",
  binaryClock: "Binary Clock",
  theremin: "Theremin",
  osc: "OSC",
  wavetable2d: "Wavetable2D",
  wavetable3d: "Wavetable3D",
  pixelGrid: "PixelGrid",
  flexGrid: "Flex Grid",
  chaosfly: "Chaosfly",
  gravity: "Gravity",
  drummer: "Drummer",
  arp: "Arp",
  // GM program 5 = Electric Piano 1; GM channel 10 = percussion kit.
  ePiano: "E.Piano (5)",
  percussion: "Percussion (10)",
  phosphillator: "Phosphillator",
  delayEffect: "Delay",
  pingPongDelay: "Ping Pong Delay",
  wallDelay: "Wall Delay",
  reverbEffect: "Sabrina Reverb",
  soemReverb: "SoEmReverb",
  pll: "PLL",
  helmholtzPitch: "Pitch Detector",
  noiseDetector: "Noise Detector",
  speedColorInertia: "Speed Color Inertia",
  slewLimiter: "Slew",
  inertialFilter: "Inertial Filter",
  midSideEncode: "Mid/Side",
  quadrature: "Hilbert Pair",
  hilbert: "Hilbert",
  lookaheadLimiter: "Limiter",
  sampleHold: "Sample & Hold",
  midiOut: "Midi Out",
  midiNotePitch: "Midi Note Pitch",
  keyboardController: "MIDI",
  samplePlayer: "Sample Player",
  sampleLooper: "Sample Looper",
  audioPlayer: "Music Player",
  macroControls: "Macro Controls",
  pitchModWheel: "Pitch Mod Wheel",
  expAdsr: "Curve Envelope",
  attackDecay: "Attack Decay",
  flowerChildEnvelopeFollower: "Envelope Follower",
  linearEnvelope: "Linear Envelope",
  pluckEnvelope: "Pluck Envelope",
  vactrolEnvelopeSeries: "VTL5C",
  vactrolEnvelopeCustom: "Vactrol",
  sandboxVisuals: "Screen Visuals",
  screenSpaceShader: "Screen Space Shader",
  bloomGlow: "Bloom & Glow",
  rgbaHsla: "RGBA / HSLA",
  chromaColor: "Chroma Color",
  image: "Image",
  canvas: "Canvas",
  visualOscilloscope: "Display",
  traceDisplay: "1D Waterfall",
  traceDisplayStereo: "1D Waterfall Stereo",
  dotOscilloscope: "Phosphor Dot",
  oscilloscopeBank: "Oscilloscope Bank",
  videoscope: "Videoscope",
  asciiscope: "Asciiscope",
  matrixDisplay: "Matrix Display",
  matrixWaterfall: "Matrix Waterfall",
  textStream: "Text Stream",
  valueOscilloscope: "0D Value",
  // numberReadout (Value LED) + valueLcd labels live in modules/*-register.js (chromeless).
  lineBurnOscilloscope: "1D Phosphor",
  scope2d: "2D Phosphor",
  scope2dTrace: "2D Trace",
  vectorDot: "Vector Dot",
  vectorRgb: "Vector RGB",
  rasterRgb: "Pixel Grid",
  gradientVectorscope: "Gradient Vectorscope",
  traceXyz: "XYZ Trace",
  phosphorLight: "2D Phosphor",
  speakerProtection: "Speaker Protection",
  speakerProtector2: "Speaker Protector 2.0",
  badvalMonitor: "BADVAL Monitor",
  textBox: "Text Box",
  output: "Output",
  // Chromeless / fully-custom-UI modules (stepGrid, led, ...) register
  // their own label instead of it being hardcoded here -- see
  // node-graph-chromeless-module-registry.js.
  ...nodeGraphChromelessModuleLabelEntries(),
});

const nodeGraphLadderFilterModes = Object.freeze(["Flat", "LP", "HP", "BP"]);

// Compact pole labels — no spaces (LP12 not "LP 12").
const nodeGraphTb303FilterModes = Object.freeze([
  "Flat",
  "LP6", "LP12", "LP18", "LP24",
  "HP6", "HP12", "HP18", "HP24",
  "BP12/12", "BP6/18", "BP18/6", "BP6/12", "BP12/6", "BP6/6",
]);

// The PerkinElmer VTL5C-series single-cell parts we have solid datasheet
// figures for. attack/release are seconds; litKohm/darkKohm are the
// R_ON@40mA / R_OFF(dark, min) figures used by vactrolEnvelopeSeries's
// darkCurrent knob resistance readout. Index order matches that module's
// "Part" choice parameter.
//
// Easter egg: VTL5C5 below is NOT a real PerkinElmer part -- there is no
// C5 in the real catalog (the family table jumps C4 -> C6). As the story
// goes: a dual-cell "medium" vactrol slotted between the slow C4 and the
// fast, high-dark-resistance C6, meant to split the difference with a
// ~200ms release. Reportedly reached pre-production samples in the early
// '80s before PerkinElmer's optoelectronics division decided the gap
// wasn't worth its own SKU, and the part number was quietly retired
// rather than reassigned -- which is supposedly why old synth-DIY forum
// posts occasionally mention "the mythical C5," usually turning out to be
// a mislabeled C4. None of that is real. It's a hallucinated bedtime
// story for a photoresistor, given its own row in the switch because it
// was funnier to build than to explain. The numbers below just
// interpolate between VTL5C4 and VTL5C6.
const nodeGraphVactrolSeriesSpecs = Object.freeze([
  { attack: 0.0025, darkKohm: 50000, label: "VTL5C1", litKohm: 0.2, release: 0.035 },
  { attack: 0.0035, darkKohm: 1000, label: "VTL5C2", litKohm: 0.2, release: 0.5 },
  { attack: 0.0025, darkKohm: 10000, label: "VTL5C3", litKohm: 0.0015, release: 0.035 },
  { attack: 0.006, darkKohm: 400, label: "VTL5C4", litKohm: 0.075, release: 1.5 },
  { attack: 0.005, darkKohm: 6000, label: "VTL5C5", litKohm: 0.4, release: 0.2 },
  { attack: 0.0035, darkKohm: 100000, label: "VTL5C6", litKohm: 2, release: 0.05 },
  { attack: 0.006, darkKohm: 1000, label: "VTL5C7", litKohm: 1.1, release: 1.0 },
  { attack: 0.004, darkKohm: 10000, label: "VTL5C8", litKohm: 1, release: 0.06 },
  { attack: 0.004, darkKohm: 50000, label: "VTL5C9", litKohm: 0.63, release: 0.05 },
  { attack: 0.001, darkKohm: 400, label: "VTL5C10", litKohm: 0.4, release: 1.5 },
]);

function nodeGraphVactrolSeriesSpec(partIndex) {
  const index = Math.round(Number(partIndex));
  return nodeGraphVactrolSeriesSpecs[index] || nodeGraphVactrolSeriesSpecs[0];
}

// Reads another parameter's current live value on the same node -- used by
// vactrolEnvelopeSeries's darkCurrent displayTransform so the resistance
// readout reflects whichever "Part" is currently selected.
function nodeGraphParameterSiblingValue(slider, key) {
  const nodeId = slider?.closest?.(".dsp-node")?.dataset?.node;
  const patchNode = typeof nodeGraphPatchNode === "function" ? nodeGraphPatchNode(nodeId) : null;
  return patchNode?.params?.[key];
}

// Module definition shape — three control surfaces (do not mix these up):
//
//   inputs: [...]      → left IO-column jacks (mixInput / hasInput)
//   parameters: [...]  → body sliders; each also gets a tiny mod port on the
//                        row (readEffectiveParam already applies modulation)
//   outputs: [...]     → right IO-column jacks
//
// Chrome (port placement) is separate from face content:
//   chrome: LayoutA | LayoutB  — ports under vs beside the face
//   layout / customDisplayArea — what fills the face (scope, graph, BADVAL, …)
// finalizeNodeGraphModuleDefinitionsChrome seals every entry with explicit chrome
// (default LayoutA) so no type is left "unassigned".
//
// Trap: "add a phase input" often means a left-side CV jack → must list it in
// `inputs`. Putting it only under `parameters` creates a knob, not a left
// jack. PolyBLEP: 0.1V/Oct is an input; Phase/Amplitude are parameters only.
// DSF: uses both (knob + dedicated Phase/Amplitude jacks). Full write-up:
// docs/MODULE_PATTERN_REFERENCE.md § "Three control surfaces".

const nodeGraphOutputAmplitudeParam = Object.freeze({
  defaultValue: "1",
  key: "amplitude",
  label: "Amplitude",
  max: "1",
  mid: "1",
  min: "0",
  nonlinearSlider: false,
  step: "any",
  modClamp: false,
  tooltip: "Output scale.",
});

const nodeGraphActiveFilterDefinition = {
  planRole: "processor",
  inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
  inputLabels: { In: "Mono", f: "ƒ" },
  inputs: ["In", "Left", "Right", "f"],
  layout: "filterCurve",
  outputAliases: { Mono: "Out" },
  outputLabels: { Out: "Mono" },
  outputs: ["Out", "Left", "Right"],
  parameters: [
    {
      choices: ["LP6", "LP12", "LP18", "LP24", "HP6", "HP12", "HP18", "HP24", "BP"],
      defaultValue: "3",
      displayChoices: true,
      divideChoicesVisibly: true,
      key: "mode",
      label: "Mode",
      linearSmoothing: false,
      max: "8",
      mid: "3",
      min: "0",
      nonlinearSlider: false,
      step: "1",
      tooltip: "LP/HP are one ladder. BP is two filters in one: HP then LP, each with its own cutoff and slope. Old BP6/BP12 patches become BP."
    },
    {
      defaultValue: "200",
      key: "lowFrequency",
      kind: "frequency",
      label: "Low Cut",
      max: "20000",
      maxDigits: 5,
      mid: "200",
      min: "0",
      step: "any",
      unit: "Hz",
      tooltip: "Highpass cutoff (HP and BP). Sweep and ƒ move this with High Cut in musical steps. When ƒ is wired in HP, that Hz is the cutoff."
    },
    {
      defaultValue: "1000",
      key: "highFrequency",
      kind: "frequency",
      label: "High Cut",
      max: "20000",
      maxDigits: 5,
      mid: "1000",
      min: "0",
      step: "any",
      unit: "Hz",
      tooltip: "Lowpass cutoff (LP and BP). Sweep and ƒ move this with Low Cut in musical steps. When ƒ is wired in LP, that Hz is the cutoff."
    },
    {
      choices: ["6", "12", "18", "24"],
      defaultValue: "1",
      displayChoices: true,
      divideChoicesVisibly: true,
      key: "hpSlope",
      label: "HP Slope",
      linearSmoothing: false,
      max: "3",
      mid: "1.5",
      min: "0",
      nonlinearSlider: false,
      step: "1",
      tooltip: "Highpass slope in dB/oct. Used in HP and BP."
    },
    {
      choices: ["6", "12", "18", "24"],
      defaultValue: "1",
      displayChoices: true,
      divideChoicesVisibly: true,
      key: "lpSlope",
      label: "LP Slope",
      linearSmoothing: false,
      max: "3",
      mid: "1.5",
      min: "0",
      nonlinearSlider: false,
      step: "1",
      tooltip: "Lowpass slope in dB/oct. Used in LP and BP."
    },
    {
      defaultValue: "0",
      key: "sweep",
      label: "Sweep",
      max: "48",
      mid: "0",
      min: "-48",
      nonlinearSlider: false,
      showSign: true,
      step: "any",
      unit: "st",
      tooltip: "Shift Low Cut and/or High Cut in semitones. BP keeps the interval (ratio) constant."
    },
    {
      defaultValue: "0.2",
      key: "resonance",
      label: "Resonance",
      max: "1",
      mid: "0.2",
      min: "0",
      nonlinearSlider: false,
      step: "any",
      tooltip: "Feedback 0…1 when Feedback Circuit includes resonance. Max 1.0. In BP this applies to both filters."
    },
    {
      choices: ["Off", "Resonance only", "Clipping only", "Res + Clip"],
      defaultValue: "3",
      displayChoices: true,
      divideChoicesVisibly: true,
      key: "feedbackCircuit",
      label: "Feedback Circuit",
      linearSmoothing: false,
      max: "3",
      mid: "1.5",
      min: "0",
      nonlinearSlider: false,
      step: "1",
      tooltip: "Off = clean multipole. Resonance only = feedback. Clipping only = input tanh. Res + Clip = both."
    },
    {
      choices: ["Off", "On"],
      defaultValue: "1",
      displayChoices: true,
      key: "gainCompensation",
      label: "Gain Comp",
      linearSmoothing: false,
      max: "1",
      mid: "1",
      min: "0",
      nonlinearSlider: false,
      step: "1",
      tooltip: "On = classic gain-compensated ladder (g scales with res). Off = g = 1."
    },
      nodeGraphOutputAmplitudeParam,
  ]
};

function nodeGraphTSeriesValueDisplayModes() {
  return [
    {
      key: "value",
      label: "0D Value",
      renderer: "value",
      settingsSchema: "value",
      source: { value: "0" },
    },
  ];
}

function nodeGraphTSeriesModuleDefinition(lastIndex) {
  const last = Math.max(0, Math.min(10, Math.round(Number(lastIndex) || 0)));
  return {
    planRole: "processor",
    chrome: NodeGraphModuleChromeLayout.LayoutA,
    displayType: "value",
    displayHeightGu: 1,
    displayModes: nodeGraphTSeriesValueDisplayModes(),
    digitalInputs: ["Digital"],
    inputAliases: { A: "Analog", D: "Digital", Mono: "In" },
    inputLabels: { Analog: "A", Digital: "D", In: "In" },
    inputs: ["In", "Analog", "Digital"],
    outputs: Array.from({ length: last + 1 }, (_, index) => String(index)),
    parameters: [],
    defaultWidthGu: last >= 10 ? 5 : last >= 1 ? 4 : 3,
    defaultHeightGu: last >= 8 ? 7 : last >= 6 ? 6 : last >= 4 ? 5 : last >= 2 ? 4 : 3,
    defaultUi: {
      buttonsHidden: true,
      titleHidden: false,
    },
  };
}

/** Lone `t` — LayoutB with arrow In/Out so the side bands stay one glyph wide. */
function nodeGraphTSeriesSingleModuleDefinition() {
  return {
    planRole: "processor",
    chrome: NodeGraphModuleChromeLayout.LayoutB,
    layoutBPortLabels: true,
    displayType: "value",
    displayHeightGu: 1,
    displayModes: nodeGraphTSeriesValueDisplayModes(),
    digitalInputs: ["Digital"],
    inputAliases: { A: "Analog", D: "Digital", Mono: "In" },
    inputLabels: { Analog: "A", Digital: "D", In: "→" },
    inputs: ["In", "Analog", "Digital"],
    outputAliases: { Out: "0" },
    outputLabels: { 0: "←" },
    outputs: ["0"],
    parameters: [],
    defaultWidthGu: 3,
    defaultUi: {
      buttonsHidden: true,
      titleHidden: false,
    },
  };
}

/** Knob / Toggle / Momentary: Min/Max, Smooth time/algo, Mouse vs Smoothed face. */
function nodeGraphControllerRangeSmoothingParameters() {
  return [
    {
      defaultValue: "0",
      key: "rangeMin",
      label: "Min",
      max: "10",
      mid: "0",
      min: "-10",
      nonlinearSlider: true,
      step: "any",
      linearSmoothing: false,
      tooltip: "Output range low. Default 0.",
    },
    {
      defaultValue: "1",
      key: "rangeMax",
      label: "Max",
      max: "10",
      mid: "1",
      min: "-10",
      nonlinearSlider: true,
      step: "any",
      linearSmoothing: false,
      tooltip: "Output range high. Default 1.",
    },
    {
      defaultValue: "0.0333",
      key: "smoothingSeconds",
      label: "Smooth",
      max: "10",
      mid: "0.1",
      min: "0",
      step: "any",
      unit: "s",
      // Time-constant params must not be smoothed (app-wide). Type L + source off.
      linearSmoothing: false,
      smoothingMode: "off",
      smoothingType: "linear",
      tooltip: "Time the output takes to reach the mouse target. 0 = snap.",
    },
    {
      choices: ["Lin", "1P", "2P", "Papoulis"],
      defaultValue: "0",
      displayChoices: true,
      divideChoicesVisibly: true,
      key: "smoothingType",
      label: "Algo",
      linearSmoothing: false,
      max: "3",
      mid: "0",
      min: "0",
      step: "1",
      tooltip: "Lin = constant-time ramp. 1P / 2P = exponential. Papoulis = 3rd-order settle.",
    },
    {
      choices: ["Mouse", "Smoothed"],
      defaultValue: "0",
      displayChoices: true,
      divideChoicesVisibly: true,
      key: "displaySource",
      label: "Display",
      linearSmoothing: false,
      max: "1",
      mid: "0",
      min: "0",
      step: "1",
      tooltip: "Mouse = target the pointer set. Smoothed = actual output chasing that target.",
    },
  ];
}

const nodeGraphModuleDefinitions = (
  typeof finalizeNodeGraphModuleDefinitionsChrome === "function"
    ? finalizeNodeGraphModuleDefinitionsChrome
    : Object.freeze
)({
  audioInput: {
    planRole: "source",
    chrome: NodeGraphModuleChromeLayout.LayoutA,
    customDisplayArea: true,
    displayHeightGu: 2,
    outputAliases: { Out: "Mono", M: "Mono", L: "Left", R: "Right" },
    outputLabels: { Mono: "Mono", Left: "Left", Right: "Right" },
    outputs: ["Mono", "Left", "Right"],
    parameters: [
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        step: "0.01",
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        modClamp: false
      },
    ]
  },
  codeblock: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["In1"],
    outputs: ["Out1"],
    parameters: []
  },
  customDisplay: {
    planRole: "monitor",
    bufferedInputs: ["In1"],
    displayHeightGu: 5,
    displayType: "customDisplay",
    inputs: ["In1"],
    layout: "traceDisplay",
    // Dry passthrough so the face can sit in-line (In1 → face + Thru).
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "customDisplayIn1", label: "In1", port: "In1" },
    ],
    visualSink: true
  },
  graph2: {
    planRole: "processor",
    chrome: NodeGraphModuleChromeLayout.LayoutB,
    // Default face height (was hardcoded 4×moduleScopeHeightGu = 8). Min is 1gu app-wide.
    displayHeightGu: 8,
    layoutBPortLabels: true,
    inputs: ["In"],
    inputLabels: { In: "→" },
    layout: "graph",
    outputs: ["Out"],
    outputLabels: { Out: "←" },
    parameters: [
      // 0 Input | 1 LFO (wall-clock) | 2 Phasor (accumulates so rate changes don't jump)
      { choices: ["Input", "LFO", "Phasor"], defaultValue: "0", displayChoices: true, divideChoicesVisibly: true, key: "mode", label: "Mode", linearSmoothing: false, max: "2", mid: "1", min: "0", nonlinearSlider: false, step: "1" },
      // One global curve through the dots (not per-node shape/contour).
      // Catmull = guide-tension curve + Tension param (default).
      {
        choices: ["Linear", "Catmull", "Quadratic", "Cubic"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "smoothingMode",
        label: "Curve",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1",
        key: "tension",
        label: "Tension",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "0.01"
      },
      { choices: ["Off", "On"], defaultValue: "0", displayChoices: true, divideChoicesVisibly: true, key: "lockEndpointY", label: "Lock Ends", linearSmoothing: false, max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "1" },
      { defaultValue: "1", key: "rate", kind: "frequency", label: "Rate", max: "40", maxDigits: 5, mid: "1", min: "0", step: "any", unit: "Hz" },
      { defaultValue: "0", key: "phase", kind: "phase", label: "Phase", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "0.01", unit: "cycle", wraparound: true },
      { defaultValue: "0", key: "inputMin", label: "In Min", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "inputMax", label: "In Max", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "outputMin", label: "Out Min", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "outputMax", label: "Out Max", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
    ]
  },
  // Point-to-point segments + step grid. Shape is global; per-node curve (`c`)
  // is still individual, with curveOffset added as a global bias.
  graphCopy: {
    planRole: "processor",
    chrome: NodeGraphModuleChromeLayout.LayoutB,
    displayHeightGu: 8,
    layoutBPortLabels: true,
    inputs: ["In"],
    inputLabels: { In: "→" },
    layout: "graph",
    outputs: ["Out"],
    outputLabels: { Out: "←" },
    parameters: [
      { choices: ["Input", "LFO", "Phasor"], defaultValue: "0", displayChoices: true, divideChoicesVisibly: true, key: "mode", label: "Mode", linearSmoothing: false, max: "2", mid: "1", min: "0", nonlinearSlider: false, step: "1" },
      {
        choices: ["Linear", "Rational", "Exponential", "Log", "Smoothstep", "Hold"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "segmentShape",
        label: "Shape",
        linearSmoothing: false,
        max: "5",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "0",
        key: "curveOffset",
        label: "Curve Offset",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "0.01"
      },
      { choices: ["Off", "On"], defaultValue: "0", displayChoices: true, divideChoicesVisibly: true, key: "lockEndpointY", label: "Lock Ends", linearSmoothing: false, max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "1" },
      {
        // 0 = no step grid / free X (no auto quantize). 1..64 = vertical grid + snap.
        defaultValue: "8",
        key: "steps",
        label: "Steps",
        max: "64",
        maxDigits: 2,
        mid: "8",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { defaultValue: "1", key: "rate", kind: "frequency", label: "Rate", max: "40", maxDigits: 5, mid: "1", min: "0", step: "any", unit: "Hz" },
      { defaultValue: "0", key: "phase", kind: "phase", label: "Phase", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "0.01", unit: "cycle", wraparound: true },
      { defaultValue: "0", key: "inputMin", label: "In Min", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "inputMax", label: "In Max", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "outputMin", label: "Out Min", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "outputMax", label: "Out Max", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
    ]
  },
  moduleGroup: {
    planRole: "source",
    inputs: [],
    outputs: [],
    parameters: []
  },
  osc: {
    planRole: "source",
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Wave Out" } },
    ],
    displaySignals: [
      { key: "Wave Out", kind: "scalar" },
    ],
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ"},
    outputAliases: {
      Out: "Wave Out",
      Noise: "Wave Out"
    },
    outputLabels: {
      "Wave Out": "Wave"
    },
    outputs: ["Saw", "Ramp", "Square", "Tri", "Sine", "Wave Out"],
    parameters: [
      {
        choices: ["Saw", "Ramp", "Square", "Triangle", "Sine", "Noise"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        kind: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "5",
        mid: "2",
        min: "0",
        step: "1"
      },
      {
        defaultValue: "100",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides."
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  // Reference oscillator for port layout:
  //   inputs[]     = left jacks only (Reset / 0.1V / Increment)
  //   parameters[] = sliders (Waveform / Frequency / Phase / Amplitude)
  // Phase and Amplitude are NOT left-side jacks here — only knobs (+ auto mod
  // ports on each slider row). If a consumer needs full left-column Phase/Amp
  // jacks, see dsfOscillator (knob + dedicated CV input).
  polyBlep: {
    planRole: "source",
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Wave Out" } },
    ],
    displaySignals: [
      { key: "Wave Out", kind: "scalar" },
    ],
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ"},
    outputAliases: {
      Out: "Wave Out",
      Noise: "Wave Out"
    },
    outputLabels: {
      "Wave Out": "Wave"
    },
    outputs: ["Saw", "Ramp", "Square", "Tri", "Sine", "Wave Out"],
    parameters: [
      {
        choices: ["Saw", "Ramp", "Square", "Triangle", "Sine", "Noise"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        kind: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "5",
        mid: "2",
        min: "0",
        step: "1"
      },
      {
        defaultValue: "100",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides."
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        // Slider guide 0…1 (full-scale wave). Domain is not hard-clamped —
        // type larger values or use MOD if you want overdrive / CV gain.
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip:
          "Output level. Slider 0…1 = full-scale bipolar wave. Min/max are guides only — type large values for gain past unity (domain not hard-clamped)."
      },
    ]
  },
  blit: {
    planRole: "source",
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Wave Out" } },
    ],
    displaySignals: [
      { key: "Wave Out", kind: "scalar" },
    ],
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ"},
    outputAliases: {
      Out: "Wave Out"
    },
    outputLabels: {
      "Wave Out": "Wave"
    },
    outputs: ["Saw", "Ramp", "Square", "Tri", "Sine", "Wave Out"],
    parameters: [
      {
        choices: ["Saw", "Ramp", "Square", "Triangle", "Sine"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        kind: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "4",
        mid: "2",
        min: "0",
        step: "1"
      },
      {
        defaultValue: "100",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides."
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  sineWavetable: {
    planRole: "source",
    displayType: "trace",
    // Same left-column jacks as PolyBLEP / BLIT (Phase + Amp are knobs only).
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {
      "0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ",
    },
    outputs: ["A", "B", "C", "D"],
    parameters: [
      {
        choices: ["sine", "cosine", "sincos", "antiphase", "3-phase", "4-phase"],
        defaultValue: "2",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "5",
        mid: "2",
        min: "0",
        step: "1",
        tooltip:
          "How many phase taps. sine / cosine: A only. sincos: A=sin B=cos. antiphase: A and −A. 3-phase: 0°/120°/240°. 4-phase: 0°/90°/180°/270°. Unused A–D sit at 0.",
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        bipolar: false,
        defaultValue: "100",
        key: "freq",
        kind: "frequency",
        label: "Freq",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        tooltip:
          "Hz. Parameter MOD is domain-add (base + CV). Set base 0 and wire Pitch Detector / Knob Bias for absolute Hz. Enable Bipolar in param settings for thru-zero FM (negative Hz = reverse phase).",
        unit: "Hz",
      },
      {
        defaultValue: "1",
        key: "amp",
        label: "Amplitude",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
    ]
  },
  sinCos: {
    planRole: "source",
    displayType: "trace",
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {
      "0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ",
    },
    outputs: ["sin", "cos"],
    outputLabels: {
      sin: "Sin",
      cos: "Cos",
    },
    parameters: [
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        bipolar: false,
        defaultValue: "100",
        key: "freq",
        kind: "frequency",
        label: "Freq",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        tooltip:
          "Hz. Parameter MOD is domain-add (base + CV). Set base 0 and wire Pitch Detector / Knob Bias for absolute Hz. Enable Bipolar in param settings for thru-zero FM (negative Hz = reverse phase).",
        unit: "Hz",
      },
      {
        defaultValue: "1",
        key: "amp",
        label: "Amplitude",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
    ]
  },
  archimedes: {
    planRole: "source",
    displayType: "trace",
    inputs: ["Reset", "0.1V/Oct", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      f: "ƒ"},
    outputs: ["Sine", "Cosine", "Pi", "Noise Below", "Noise Above"],
    parameters: [
      {
        defaultValue: "12",
        key: "profile",
        label: "Profile",
        max: "24",
        mid: "14",
        min: "4",
        step: "1"
      },
      {
        defaultValue: "100",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides."
      },
      {
        defaultValue: "3",
        key: "dither",
        label: "Dither",
        max: "63",
        mid: "16",
        min: "0",
        step: "1"
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  aliasSine: {
    planRole: "source",
    inputs: [],
    inputLabels: { },
    outputs: ["Out"],
    parameters: [
      { defaultValue: "0.1", key: "normFreq", label: "Norm Freq", max: "1.5", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "amplitude", label: "Amplitude", max: "1", mid: "1", min: "0", nonlinearSlider: false, step: "any" , modClamp: false },
    ]
  },
  // RS-MET rosic::SineOscillator — free-running 2nd-order recursive sine (no sin() per sample).
  robinSinusoid: {
    planRole: "source",
    defaultAlias: "Osc",
    displayType: "trace",
    inputs: ["Reset", "f"],
    inputLabels: {Reset: "Reset",
      f: "ƒ"},
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "440",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Oscillator frequency in Hz. Domain-add MOD on Frequency (set base 0 for absolute Hz sources). Recursive free-running sine (RS-MET)."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        linearSmoothing: true,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        smoothingType: "linear",
        step: "any",
        modClamp: false
      },
      {
        defaultValue: "0",
        hidden: true,
        key: "phase",
        kind: "phase",
        label: "Start Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true,
        tooltip: "Phase used when Reset is triggered (or on first sample)."
      },
    ]
  },
  phoneTone: {
    planRole: "source",
    planFreeRun: true,
    chrome: NodeGraphModuleChromeLayout.LayoutA,
    customDisplayArea: true,
    defaultWidthGu: 6,
    displayType: "phoneToneFace",
    displayHeightGu: 2,
    displayModes: [
      {
        key: "phoneToneFace",
        label: "ƒ",
        renderer: "phoneToneFace",
        source: { value: "Tone" },
      },
    ],
    displaySignals: [
      { key: "Tone", kind: "scalar" },
      { key: "ƒ1", kind: "scalar" },
      { key: "ƒ2", kind: "scalar" },
    ],
    digitalInputs: ["Digital", "Gate"],
    digitalOutputs: ["ƒ1", "ƒ2", "Digital Thru"],
    inputAliases: {A: "Analog",
      D: "Digital",
      G: "Gate",
      "0.1V": "0.1V/Oct",
      "0.1v": "0.1V/Oct"},
    inputLabels: { Analog: "Analog", Digital: "Digital", Gate: "Gate", "0.1V/Oct": "0.1V" },
    outputAliases: {
      Out: "Tone",
      M: "Tone",
      Mono: "Tone",
      L: "ToneL",
      R: "ToneR",
      Left: "ToneL",
      Right: "ToneR",
      X: "ToneL",
      Z: "ToneR",
      f1: "ƒ1",
      Df1: "ƒ1",
      f2: "ƒ2",
      Df2: "ƒ2",
    },
    inputs: ["Analog", "Digital", "Gate", "0.1V/Oct"],
    outputs: ["Tone", "ToneL", "ToneR", "ƒ1", "ƒ2", "Analog Thru", "Digital Thru"],
    outputLabels: {
      Tone: "Tone",
      ToneL: "ToneL",
      ToneR: "ToneR",
      "ƒ1": "ƒ1",
      "ƒ2": "ƒ2",
      "Analog Thru": "Analog Thru",
      "Digital Thru": "Digital Thru",
    },
    parameters: [
      {
        defaultValue: "0.5",
        key: "amplitude",
        label: "Amplitude",
        linearSmoothing: true,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        smoothingMode: "internal",
        smoothingSeconds: 0.1,
        smoothingType: "linear",
        step: "any",
        tooltip: "Peak of the summed DTMF sines (Tone). Two keys stay inside ±Amplitude.",
      },
      {
        bipolar: true,
        defaultValue: "0",
        key: "freqOffset",
        kind: "frequency",
        label: "Frequency Offset",
        linearSmoothing: true,
        max: "2000",
        mid: "0",
        min: "-2000",
        nonlinearSlider: false,
        smoothingMode: "internal",
        smoothingSeconds: 0.1,
        smoothingType: "linear",
        step: "any",
        unit: "Hz",
        tooltip: "Added to both DTMF frequencies (low X / high Z) before the Robin sinusoids.",
      },
      {
        bipolar: true,
        defaultValue: "0",
        key: "pitchOffset",
        label: "Pitch Offset",
        linearSmoothing: true,
        max: "4",
        mid: "0",
        min: "-4",
        nonlinearSlider: false,
        smoothingMode: "internal",
        smoothingSeconds: 0.1,
        smoothingType: "linear",
        step: "any",
        unit: "oct",
        tooltip:
          "Transpose both DTMF tones in octaves (1 = +1 octave). 0.1V/Oct tracks the same pair from the project pitch reference.",
      },
    ],
  },
  additiveOsc: {
    planRole: "source",
    graphInputs: ["Damping Graph", "Phase Graph"],
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ"},
    outputs: ["Out"],
    parameters: [
      {
        choices: ["Sine", "Sawtooth", "Square", "Triangle", "SawSquare", "DoubleSaw", "TriSaw", "Organ"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "7",
        mid: "3",
        min: "0",
        step: "1"
      },
      {
        defaultValue: "100",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides."
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      { defaultValue: "0.5", key: "modA", label: "Mod A", max: "1", mid: "0.5", min: "0", step: "any" },
      { defaultValue: "0", key: "harmonicPhaseAdd", kind: "phase", label: "Phase Add", max: "1", mid: "0.5", min: "0", step: "any", unit: "cycle" },
      { defaultValue: "0", key: "harmonicPhaseMultiply", label: "Phase Multiply", max: "4", mid: "1", min: "0", step: "any" },
      { constraint: "cpu", defaultValue: "32", key: "harmonics", label: "Harmonics", max: "1024", mid: "32", min: "1", step: "1" },
      { defaultValue: "20000", key: "dampingFilterFrequency", kind: "frequency", label: "Filter Frequency", max: "20000", mid: "2000", min: "20", step: "any", unit: "Hz" },
      { defaultValue: "0.35", key: "amplitude", label: "Amplitude", max: "1", mid: "1", min: "0", nonlinearSlider: false, step: "any" , modClamp: false },
    ]
  },
  gpuAdditiveOsc: {
    planRole: "source",
    graphInputs: ["Damping Graph", "Phase Graph"],
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ"},
    outputs: ["Out"],
    parameters: [
      {
        choices: ["Sine", "Sawtooth", "Square", "Triangle", "SawSquare", "DoubleSaw", "TriSaw", "Organ"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "7",
        mid: "3",
        min: "0",
        step: "1"
      },
      {
        defaultValue: "100",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides."
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      { defaultValue: "0.5", key: "modA", label: "Mod A", max: "1", mid: "0.5", min: "0", step: "any" },
      { defaultValue: "0", key: "harmonicPhaseAdd", kind: "phase", label: "Phase Add", max: "1", mid: "0.5", min: "0", step: "any", unit: "cycle" },
      { defaultValue: "0", key: "harmonicPhaseMultiply", label: "Phase Multiply", max: "4", mid: "1", min: "0", step: "any" },
      { constraint: "gpu", defaultValue: "256", key: "harmonics", label: "Harmonics", max: "4096", mid: "256", min: "1", step: "1" },
      { defaultValue: "20000", key: "dampingFilterFrequency", kind: "frequency", label: "Filter Frequency", max: "20000", mid: "2000", min: "20", step: "any", unit: "Hz" },
      { defaultValue: "0.35", key: "amplitude", label: "Amplitude", max: "1", mid: "1", min: "0", nonlinearSlider: false, step: "any" , modClamp: false },
    ]
  },
  // RoundShape — sine→square modulator (getSineToSquare). Separate from full Ellipsoid osc.
  // Face: cheap static orbit outline (filter-curve family), not phosphor trace.
  ellipsoid: {
    planRole: "source",
    layout: "roundShape",
    chrome: "LayoutA",
    customDisplayArea: true,
    displayType: "roundShapeFace",
    displayHeightGu: 4,
    spectrumCompanion: false,
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ"},
    // Legacy Mono/X/Y/Out → bipolar outs.
    outputAliases: {
      Mono: "Bi X",
      Out: "Bi X",
      Wave: "Bi X",
      "Wave Out": "Bi X",
      X: "Bi X",
      Y: "Bi Y"
    },
    outputLabels: {
      "Uni X": "Uni X",
      "Uni Y": "Uni Y",
      "Bi X": "Bi X",
      "Bi Y": "Bi Y"
    },
    // Uni 0..1, Bi −1..1 (quadrature pair). No Mono.
    outputs: ["Uni X", "Uni Y", "Bi X", "Bi Y"],
    parameters: [
      {
        choices: ["Clock(Ph)", "CounterClock(Ph)", "Clock(T)", "CounterClock(T)"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "motion",
        label: "Motion",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        step: "1",
        tooltip: "Ph = running phasor (CounterClock(Ph) is the original orbit). T = simulation time (sample count / sample rate), no stored phasor. Clock vs CounterClock flips direction.",
      },
      {
        defaultValue: "1",
        key: "frequency",
        kind: "frequency",
        label: "Clock",
        max: "20000",
        mid: "20",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Orbit rate in Hz. Slider 0…20 kHz. Negative values reverse the orbit.",
      },
      { defaultValue: "0", key: "phase", kind: "phase", label: "Phase", max: "1", mid: "0.5", min: "0", step: "0.01", unit: "cycle", wraparound: true },
      {
        defaultValue: "0",
        key: "shape",
        label: "Sine → Square",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        tooltip: "soemdsp Ellipsoid::getSineToSquare. 0 = sine, 1 = square. Limit AA always on (edge floor by f/sr)."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip: "Output scale. Domain min/max are slider guides only (type large values for absolute-Hz CV)."
      },
    ]
  },
  // Full multi-param ellipsoid oscillator (offset/shape/scale per axis).
  ellipsoidOsc: {
    planRole: "source",
    layout: "roundShape",
    chrome: "LayoutA",
    customDisplayArea: true,
    displayType: "roundShapeFace",
    displayHeightGu: 4,
    spectrumCompanion: false,
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "roundShapeFace",
        settingsSchema: "roundShapeFace",
      },
    ],
    defaultDisplayMode: "face",
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ"},
    outputAliases: {
      Out: "Mono",
      Wave: "Mono",
      "Wave Out": "Mono"
    },
    outputs: ["Mono", "X", "Y"],
    parameters: [
      // Limit AA always on (scale floor by f/sr) — no mode switch.
      { defaultValue: "100", key: "frequency", kind: "frequency", label: "Frequency", max: "20000", mid: "220", min: "0", step: "any", unit: "Hz" },
      { defaultValue: "0", key: "phase", kind: "phase", label: "Phase", max: "1", mid: "0.5", min: "0", step: "0.01", unit: "cycle", wraparound: true },
      { defaultValue: "0", key: "offsetX", label: "Offset X", max: "1", mid: "0", min: "-1", step: "0.01" },
      { defaultValue: "0", key: "offsetY", label: "Offset Y", max: "1", mid: "0", min: "-1", step: "0.01" },
      { defaultValue: "0", key: "shapeX", label: "Shape X", max: "1", mid: "0", min: "-1", step: "0.01" },
      { defaultValue: "0", key: "shapeY", label: "Shape Y", max: "1", mid: "0", min: "-1", step: "0.01" },
      { defaultValue: "1", key: "scaleX", label: "Scale X", max: "10", mid: "1", min: "0", step: "0.01" },
      { defaultValue: "1", key: "scaleY", label: "Scale Y", max: "10", mid: "1", min: "0", step: "0.01" },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: true,
        step: "any"
      },
    ]
  },
  // Naive sine/tri/saw/square modulator (no anti-aliasing). Type is basicShape
  // because `osc` is already the Open Sound Control module.
  // Face: cheap 1D one-cycle + phase dot (RoundShape family, not phosphor).
  basicShape: {
    planRole: "source",
    layout: "basicShape",
    chrome: "LayoutA",
    customDisplayArea: true,
    displayType: "basicShapeFace",
    displayHeightGu: 4,
    spectrumCompanion: false,
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "basicShapeFace",
        settingsSchema: "basicShapeFace",
      },
    ],
    defaultDisplayMode: "face",
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {
      "0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ",
    },
    outputAliases: {
      Out: "Wave Out",
      Wave: "Wave Out",
    },
    outputLabels: {
      "Wave Out": "Wave",
    },
    outputs: ["Sine", "Tri", "Saw", "Square", "Wave Out"],
    parameters: [
      {
        choices: ["Sine", "Triangle", "Saw", "Square"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        kind: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "3",
        mid: "0",
        min: "0",
        step: "1",
      },
      {
        choices: ["Clock(Ph)", "CounterClock(Ph)", "Clock(T)", "CounterClock(T)"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "motion",
        label: "Motion",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        step: "1",
        tooltip: "Ph = running phasor. T = simulation time. Clock vs CounterClock flips direction.",
      },
      {
        defaultValue: "1",
        key: "frequency",
        kind: "frequency",
        label: "Clock",
        max: "20000",
        mid: "20",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Rate in Hz. Slider 0…20 kHz. Negative values reverse.",
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true,
      },
      {
        defaultValue: "0.5",
        key: "shape",
        label: "PWM",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        tooltip: "Square pulse width. 0.5 = 50%. Other waves ignore this.",
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip: "Output scale.",
      },
    ],
  },
  spiral: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "Z", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    outputs: ["X", "Y", "Z"],
    parameters: [
      { key: "frequency", label: "Frequency", defaultValue: "440", min: "40", mid: "440", max: "2000", step: "any", unit: "Hz" },
      { constraint: "cpu", key: "density", label: "Density", defaultValue: "1", min: "0.1", mid: "1", max: "16", step: "0.01" },
      { key: "size", label: "Size", defaultValue: "0.5", min: "0.1", mid: "0.5", max: "4", step: "0.01" },
      { key: "sharp", label: "Sharp", defaultValue: "0.5", min: "0.01", mid: "0.5", max: "0.99", step: "0.01" },
      { key: "sharpCurve", label: "Sharp Curve", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "sharpCurveMult", label: "Sharp Curve Mult", defaultValue: "1", min: "0", mid: "1", max: "4", step: "0.01" },
      { key: "position", label: "Position", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01", kind: "phase", unit: "cycle", wraparound: true },
      { key: "morph", label: "Morph", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01", kind: "phase", wraparound: true },
      { key: "rotX", label: "Rot X", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01", kind: "phase", wraparound: true },
      { key: "rotY", label: "Rot Y", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01", kind: "phase", wraparound: true },
      { key: "zDepth", label: "Z Depth", defaultValue: "0", min: "0", mid: "0", max: "1", step: "0.01" },
      { key: "zAmount", label: "Z Amount", defaultValue: "0", min: "0", mid: "0", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  fractalSpiral: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "Z", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    outputs: ["X", "Y", "Z"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "1", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "size", label: "Size", defaultValue: "0.5", min: "0.01", mid: "0.5", max: "2", step: "0.01" },
      { key: "growth", label: "Growth", defaultValue: "1.5", min: "-6", mid: "0", max: "6", step: "0.01" },
      { key: "octaves", label: "Octaves", defaultValue: "5", min: "1", mid: "8", max: "16", step: "1" },
      { key: "gain", label: "Roughness (Gain)", defaultValue: "0.5", min: "0.05", mid: "0.5", max: "0.95", step: "0.01" },
      { key: "lacunarity", label: "Detail (Lacunarity)", defaultValue: "2", min: "1.1", mid: "4", max: "8", step: "0.01" },
      { key: "twist", label: "Golden Twist", defaultValue: "0.381966", min: "0", mid: "0.5", max: "1", step: "0.000001", kind: "phase", wraparound: true },
      { key: "spin", label: "Spin", defaultValue: "0.05", min: "-4", mid: "0", max: "4", step: "0.001" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  logSpiral: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "Z", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    outputs: ["X", "Y", "Z"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "1", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "turns", label: "Turns", defaultValue: "4", min: "0.1", mid: "4", max: "16", step: "0.01" },
      { key: "size", label: "Size", defaultValue: "0.5", min: "0.01", mid: "0.5", max: "2", step: "0.01" },
      { key: "growth", label: "Growth", defaultValue: "3", min: "-12", mid: "0", max: "12", step: "0.01" },
      { key: "spin", label: "Spin", defaultValue: "0.05", min: "-4", mid: "0", max: "4", step: "0.001" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  lorenzAttractor: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "Z", kind: "scalar" },
      { key: "DisplayX", kind: "scalar" },
      { key: "DisplayY", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    // Phosphor only — no Trace mode switch.
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "DisplayX", y: "DisplayY" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y", "Z"],
    parameters: [
      { key: "speed", label: "Speed", defaultValue: "1", min: "0", mid: "1", max: "1000", step: "0.01" },
      { key: "sigma", label: "Sigma", defaultValue: "10", min: "0", mid: "10", max: "30", step: "0.01" },
      { key: "rho", label: "Rho", defaultValue: "28", min: "0", mid: "28", max: "60", step: "0.01" },
      { key: "beta", label: "Beta", defaultValue: "2.6667", min: "0", mid: "2.6667", max: "10", step: "0.0001" },
      { key: "scale", label: "Scale", defaultValue: "1", min: "0", mid: "1", max: "4", step: "0.01" },
      { key: "rotate", label: "Rotate", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01", kind: "phase", unit: "cycle", wraparound: true },
      { key: "zDepth", label: "Z Depth", defaultValue: "0.4", min: "0", mid: "0.4", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  logisticMap: {
    planRole: "source",
    displayType: "trace",
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace", source: { value: "Out" } },
    ],
    defaultDisplayMode: "trace",
    inputs: ["Reset"],
    outputs: ["Out"],
    parameters: [
      { key: "rate", label: "Rate", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "r", label: "R", defaultValue: "3.9", min: "0", mid: "2", max: "4", step: "0.0001" },
      { key: "seed", label: "Seed", defaultValue: "0.5", min: "0.0001", mid: "0.5", max: "0.9999", step: "0.0001" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  antisaw: {
    planRole: "source",
    inputAliases: { Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { f: "ƒ" },
    inputs: ["f"],
    outputs: ["Out"],
    parameters: [
      { key: "fundamental", label: "Fundamental", kind: "frequency", defaultValue: "110", min: "0", mid: "1000", max: "20000", step: "any", unit: "Hz" },
      { key: "reflections", label: "Reflections", defaultValue: "64", min: "1", mid: "128", max: "256", step: "1" },
      { key: "tilt", label: "Tilt", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "any" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "any" , modClamp: false },
    ]
  },
  bradley2a: {
    planRole: "source",
    outputs: ["Out"],
    parameters: [
      { key: "carrierFreq", label: "Carrier", kind: "frequency", defaultValue: "1004", min: "0", mid: "1000", max: "20000", step: "any", unit: "Hz" },
      { key: "freqOffset", label: "Freq Translate", kind: "frequency", defaultValue: "0", min: "-500", mid: "0", max: "500", step: "any", unit: "Hz" },
      { key: "jitterDepth", label: "Phase Jitter", defaultValue: "0", min: "0", mid: "0.25", max: "3.141592653589793", step: "any" },
      { key: "jitterRate", label: "Jitter Rate", kind: "frequency", defaultValue: "60", min: "0", mid: "100", max: "300", step: "any", unit: "Hz" },
      { key: "ampDepth", label: "Amp Jitter", defaultValue: "0", min: "0", mid: "0.25", max: "1", step: "any" },
      { key: "ampRate", label: "Amp Rate", kind: "frequency", defaultValue: "40", min: "0", mid: "50", max: "300", step: "any", unit: "Hz" },
      { key: "interfLevel", label: "Interference", defaultValue: "0", min: "0", mid: "0.25", max: "1", step: "any" },
      { key: "interfFreq", label: "Interf Freq", kind: "frequency", defaultValue: "2600", min: "0", mid: "1000", max: "20000", step: "any", unit: "Hz" },
      { key: "harm2", label: "2nd Harm", defaultValue: "0", min: "0", mid: "0.25", max: "1", step: "any" },
      { key: "harm3", label: "3rd Harm", defaultValue: "0", min: "0", mid: "0.25", max: "1", step: "any" },
      { key: "hitRate", label: "Hit Rate", defaultValue: "1", min: "0", mid: "2", max: "20", step: "any", unit: "Hz" },
      { key: "hitDuration", label: "Hit Time", defaultValue: "0.005", min: "0", mid: "0.02", max: "0.2", step: "any", unit: "s" },
      { key: "hitGain", label: "Gain Hit", defaultValue: "1", min: "0", mid: "1", max: "4", step: "any" },
      { key: "hitPhase", label: "Phase Hit", defaultValue: "0", min: "-3.141592653589793", mid: "0", max: "3.141592653589793", step: "any" },
      { key: "impulseLevel", label: "Impulse", defaultValue: "0", min: "0", mid: "0.25", max: "1", step: "any" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "any" , modClamp: false },
    ]
  },
  henonMap: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "rate", label: "Rate", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "a", label: "A", defaultValue: "1.4", min: "0", mid: "1", max: "2", step: "0.0001" },
      { key: "b", label: "B", defaultValue: "0.3", min: "-1", mid: "0", max: "1", step: "0.0001" },
      { key: "seedX", label: "Seed X", defaultValue: "0.1", min: "-1", mid: "0", max: "1", step: "0.0001" },
      { key: "seedY", label: "Seed Y", defaultValue: "0.1", min: "-1", mid: "0", max: "1", step: "0.0001" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  // rayBouncer: solid chromeless registration (public/modules/rayBouncer/*-register.js).
  wirdoSpiral: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "sharp", label: "Sharp", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "cross", label: "Cross", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { constraint: "cpu", key: "density", label: "Density", defaultValue: "0.8", min: "0", mid: "1", max: "8", step: "0.01" },
      { key: "length", label: "Length", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01" },
      { key: "rotate", label: "Rotate", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "splashDepth", label: "Splash", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { constraint: "cpu", key: "splashDensity", label: "Splash Density", defaultValue: "0", min: "0", mid: "4", max: "16", step: "0.01" },
      { key: "cut", label: "Cut", defaultValue: "1000", min: "2", mid: "500", max: "1000", step: "1" },
      { key: "scrap", label: "Scrap", defaultValue: "1", min: "0.0001", mid: "0.5", max: "1", step: "0.0001" },
      { key: "ringCut", label: "Ring Cut", defaultValue: "10", min: "1", mid: "5", max: "10", step: "0.01" },
      { key: "splashSpeed", label: "Splash Speed", defaultValue: "0", min: "-20", mid: "0", max: "20", step: "0.01" },
      { key: "syncCut", label: "Sync Cut", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  blubb: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "shape", label: "Shape", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1", nonlinearSlider: false },
      { key: "rotX", label: "Rot X", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "rotY", label: "Rot Y", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "zDepth", label: "Z Depth", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  mushroom: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "phaseOffset", label: "Phase", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { constraint: "cpu", key: "numMushrooms", label: "Num Mushrooms", defaultValue: "1", min: "-5", mid: "1", max: "5", step: "1" },
      { key: "grow", label: "Grow", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { constraint: "cpu", key: "density", label: "Density", defaultValue: "3", min: "0", mid: "3", max: "100", step: "0.01" },
      { key: "capRotation", label: "Cap Rotation", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "stemRotationSpeed", label: "Stem Rotation Speed", defaultValue: "0", min: "-20", mid: "0", max: "20", step: "0.01" },
      { key: "head", label: "Head", defaultValue: "0.6667", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "spread", label: "Spread", defaultValue: "0.5", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "wobble", label: "Wobble", defaultValue: "0.0625", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "clusterRotation", label: "Cluster Rotation", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "clusterRotationSpeed", label: "Cluster Rotation Speed", defaultValue: "0", min: "-20", mid: "0", max: "20", step: "0.01" },
      { key: "sharp", label: "Sharp", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "width", label: "Width", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01" },
      { key: "stem", label: "Stem", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "apart", label: "Apart", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "capStemTransition", label: "Cap/Stem Transition", defaultValue: "0.1", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  boing: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { constraint: "cpu", key: "density", label: "Density", defaultValue: "1", min: "0", mid: "4", max: "16", step: "0.01" },
      { key: "sharpness", label: "Sharpness", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "rotX", label: "Rot X", defaultValue: "0", min: "-180", mid: "0", max: "180", step: "0.1" },
      { key: "rotY", label: "Rot Y", defaultValue: "0", min: "-180", mid: "0", max: "180", step: "0.1" },
      { key: "zDepth", label: "Z Depth", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "zAmount", label: "Z Amount", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "ends", label: "Ends", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "boing", label: "Boing", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "boingStrength", label: "Boing Strength", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "dir", label: "Direction", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "shape", label: "Shape", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "volume", label: "Volume", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01" },
      { key: "volumePreJump", label: "Volume Pre-Jump", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  torus: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { constraint: "cpu", key: "density", label: "Density", defaultValue: "1", min: "0", mid: "5", max: "50", step: "0.01" },
      { key: "quantizeDensity", label: "Quantize Density", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "1" },
      { constraint: "cpu", key: "subdensity", label: "Sub Density", defaultValue: "0", min: "0", mid: "1", max: "2", step: "0.01" },
      { key: "quantizeSubDensity", label: "Quantize Sub Density", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "sharp", label: "Sharp", defaultValue: "0.5", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "size", label: "Size", defaultValue: "1", min: "0.1", mid: "0.5", max: "1", step: "0.01" },
      { key: "length", label: "Length", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "balance", label: "Balance", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "wander", label: "Wander", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "darkAngle", label: "Dark Angle", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "darkIntensity", label: "Dark Intensity", defaultValue: "0", min: "0", mid: "5", max: "10", step: "1" },
      { key: "rotX", label: "Rot X", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "rotY", label: "Rot Y", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "rotZ", label: "Rot Z", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "zAngleX", label: "Z Angle X", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "zAngleY", label: "Z Angle Y", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "zDepth", label: "Z Depth", defaultValue: "0", min: "0", mid: "1", max: "2", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  keplerBouwkamp: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "8", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "start", label: "Start", defaultValue: "3", min: "3", mid: "10", max: "20", step: "1" },
      { key: "length", label: "Length", defaultValue: "1", min: "1", mid: "10", max: "20", step: "1" },
      { key: "circles", label: "Circles", defaultValue: "0.5", min: "0.0001", mid: "0.5", max: "0.9999", step: "0.0001" },
      { key: "zoom", label: "Zoom", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "rotation", label: "Rotation", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "tri", label: "Tri", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  nyquistShannon: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequencyA", label: "Frequency A", kind: "frequency", defaultValue: "440", min: "0", mid: "440", max: "2000", maxDigits: 5, step: "any" },
      { key: "midiNoteRaw", label: "Midi Note", defaultValue: "48", min: "0", mid: "64", max: "127", step: "1" },
      { key: "rate", label: "Rate", defaultValue: "20", min: "0.000001", mid: "20", max: "100", step: "0.01" },
      { key: "sampleDots", label: "Sample Dots", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "phaseOffset", label: "Phase", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "frequencyB", label: "Frequency B", defaultValue: "5", min: "0", mid: "50", max: "100", step: "0.01" },
      { key: "subPhase", label: "Sub Phase", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "subPhaseRotationSpeed", label: "Sub Phase Rotation Speed", defaultValue: "0", min: "-20", mid: "0", max: "20", step: "0.01" },
      { key: "tone", label: "Tone", defaultValue: "0", min: "-100", mid: "0", max: "100", step: "0.1" },
      { key: "toneSmoothTime", label: "Tone Smooth Time", defaultValue: "0.01", min: "0", mid: "0.5", max: "2", step: "0.01" },
      { key: "artifact", label: "Artifact", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "enableToneModPitch", label: "Tone Mod: Pitch", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "enableToneModFreq", label: "Tone Mod: Freq", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "enableToneModNote", label: "Tone Mod: Note", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  radar: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y"],
    parameters: [
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "1", min: "0", mid: "20", max: "2000", maxDigits: 5, step: "any" },
      { key: "phaseOffset", label: "Phase", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { constraint: "cpu", key: "density", label: "Density", defaultValue: "1", min: "0", mid: "50", max: "100", step: "0.01" },
      { key: "sharp", label: "Sharp", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "fade", label: "Fade", defaultValue: "1", min: "0.1", mid: "5", max: "10", step: "0.01" },
      { key: "rotation", label: "Rotation", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "direction", label: "Direction", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "shade", label: "Shade", defaultValue: "1", min: "0.1", mid: "5", max: "10", step: "0.01" },
      { key: "lap", label: "Lap", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "ringcut", label: "Ring Cut", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "pow1Up", label: "Up", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "pow1Down", label: "Down", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "pow2Bend", label: "Bend", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "phaseInv", label: "Phase Inv", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "tunnelInv", label: "Tunnel Inv", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "spiralReturn", label: "Return", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "1" },
      { key: "length", label: "Length", defaultValue: "1", min: "0.0001", mid: "0.5", max: "1", step: "0.0001" },
      { key: "ratio", label: "Ratio", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "frontring", label: "Front Ring", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "zoom", label: "Zoom", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "zDepth", label: "Z Depth", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "inner", label: "Inner", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "x", label: "X", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "y", label: "Y", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  chuaAttractor: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "Z", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["X", "Y", "Z"],
    parameters: [
      { key: "speed", label: "Speed", defaultValue: "1", min: "0", mid: "1", max: "8", step: "0.01", modClamp: false },
      { key: "alpha", label: "Alpha", defaultValue: "15.6", min: "0", mid: "15.6", max: "40", step: "0.01" },
      { key: "beta", label: "Beta", defaultValue: "28", min: "0", mid: "28", max: "60", step: "0.01" },
      { key: "m0", label: "M0", defaultValue: "-1.143", min: "-4", mid: "-1.143", max: "4", step: "0.001" },
      { key: "m1", label: "M1", defaultValue: "-0.714", min: "-4", mid: "-0.714", max: "4", step: "0.001" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  chordMemory: {
    planRole: "source",
    inputs: ["Pitch", "Latch", "Clear", "Advance"],
    outputs: ["Note 1", "Note 2", "Note 3", "Note 4", "Arp", "Gate", "Trigger"],
    parameters: [
      {
        choices: ["Order", "Shuffle Bag", "Mutate"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "walk",
        label: "Walk",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "How Advance walks latched notes: order, no-repeat shuffle bag, or mostly-order with random jumps."
      },
      { key: "leap", label: "Leap", defaultValue: "0.15", min: "0", mid: "0.25", max: "1", step: "0.01", tooltip: "Chance to jump instead of taking the next slot." },
      { key: "mutate", label: "Mutate", defaultValue: "0.2", min: "0", mid: "0.25", max: "1", step: "0.01", tooltip: "In Mutate walk: extra chance to pick a random active slot." },
      { key: "octaves", label: "Leap Octaves", defaultValue: "0", min: "0", mid: "1", max: "3", nonlinearSlider: false, step: "1", tooltip: "On leap, chance to shift Arp by ±octaves." },
    ]
  },
  turingMachine: {
    planRole: "source",
    displayType: "trace",
    displaySignals: [
      { key: "CV", kind: "scalar" },
      { key: "Pitch", kind: "scalar" },
    ],
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace", source: { value: "CV" } },
      { key: "pitchTrace", label: "Pitch", renderer: "trace", settingsSchema: "trace", source: { value: "Pitch" } },
    ],
    defaultDisplayMode: "trace",
    inputs: ["Clock", "Reset", "Scale", "Root"],
    outputs: ["CV", "Scale", "Gate", "Pitch", "Trigger"],
    parameters: [
      { key: "length", label: "Length", defaultValue: "8", min: "1", mid: "8", max: "16", nonlinearSlider: false, step: "1" },
      { key: "probability", label: "Probability", defaultValue: "0.25", min: "0", mid: "0.25", max: "1", step: "any" },
      { key: "octaves", label: "Octaves", defaultValue: "1", min: "0", mid: "1", max: "4", nonlinearSlider: false, step: "1", tooltip: "Pitch range in octaves when Scale is patched (degree span)." },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  degreeTuring: {
    planRole: "processor",
    planFreeRun: true,
    displayType: "trace",
    displaySignals: [
      { key: "0.1V/Oct", kind: "scalar" },
    ],
    displayModes: [
      { key: "trace", label: "Pitch", renderer: "trace", settingsSchema: "trace", source: { value: "0.1V/Oct" } },
    ],
    defaultDisplayMode: "trace",
    inputs: ["Clock", "Reset", "Scale", "Root"],
    outputs: ["0.1V/Oct", "Gate", "Trigger", "Degree", "CV"],
    parameters: [
      { key: "length", label: "Length", defaultValue: "8", min: "2", mid: "8", max: "16", nonlinearSlider: false, step: "1" },
      { key: "probability", label: "Probability", defaultValue: "0.18", min: "0", mid: "0.25", max: "1", step: "any" },
      { key: "octaves", label: "Octaves", defaultValue: "1", min: "0", mid: "1", max: "4", nonlinearSlider: false, step: "1" },
      { key: "level", label: "Level", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
      {
        choices: ["Chromatic", "Major", "Minor", "Major Pentatonic", "Minor Pentatonic", "Whole Tone"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "scale",
        label: "Scale",
        linearSmoothing: false,
        max: "5",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Used when Scale jack is empty."
      },
    ]
  },
  gravityWalker: {
    planRole: "processor",
    planFreeRun: true,
    displayType: "trace",
    displaySignals: [
      { key: "0.1V/Oct", kind: "scalar" },
    ],
    displayModes: [
      { key: "trace", label: "Pitch", renderer: "trace", settingsSchema: "trace", source: { value: "0.1V/Oct" } },
    ],
    defaultDisplayMode: "trace",
    inputs: ["Clock", "Reset", "Scale", "Root", "Leap"],
    outputs: ["0.1V/Oct", "Gate", "Trigger", "Degree"],
    parameters: [
      { key: "gravity", label: "Gravity", defaultValue: "0.65", min: "0", mid: "0.5", max: "1", step: "0.01", tooltip: "Stickiness of step direction (higher = more inertia)." },
      { key: "leap", label: "Leap", defaultValue: "0.15", min: "0", mid: "0.25", max: "1", step: "0.01", tooltip: "Base chance of a larger jump (added to Leap CV)." },
      { key: "octaves", label: "Octaves", defaultValue: "1", min: "0", mid: "1", max: "4", nonlinearSlider: false, step: "1" },
      { key: "level", label: "Level", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
      {
        choices: ["Chromatic", "Major", "Minor", "Major Pentatonic", "Minor Pentatonic", "Whole Tone"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "scale",
        label: "Scale",
        linearSmoothing: false,
        max: "5",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  degreePhrase: {
    planRole: "processor",
    planFreeRun: true,
    displayType: "trace",
    displaySignals: [
      { key: "0.1V/Oct", kind: "scalar" },
    ],
    displayModes: [
      { key: "trace", label: "Pitch", renderer: "trace", settingsSchema: "trace", source: { value: "0.1V/Oct" } },
    ],
    defaultDisplayMode: "trace",
    inputs: ["Clock", "Reset", "Scale", "Root"],
    outputs: ["0.1V/Oct", "Gate", "Trigger", "Phase"],
    parameters: [
      { key: "steps", label: "Steps", defaultValue: "8", min: "1", mid: "4", max: "8", nonlinearSlider: false, step: "1" },
      { key: "mutate", label: "Mutate", defaultValue: "0.08", min: "0", mid: "0.15", max: "1", step: "0.01", tooltip: "Chance each clock to corrode one step (degree flip or rest)." },
      { key: "octaves", label: "Octaves", defaultValue: "1", min: "0", mid: "1", max: "4", nonlinearSlider: false, step: "1" },
      { key: "level", label: "Level", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
      {
        choices: ["Chromatic", "Major", "Minor", "Major Pentatonic", "Minor Pentatonic", "Whole Tone"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "scale",
        label: "Scale",
        linearSmoothing: false,
        max: "5",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { key: "step1", label: "Deg 1", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "any" },
      { key: "step2", label: "Deg 2", defaultValue: "0.25", min: "0", mid: "0.5", max: "1", step: "any" },
      { key: "step3", label: "Deg 3", defaultValue: "0.5", min: "0", mid: "0.5", max: "1", step: "any" },
      { key: "step4", label: "Deg 4", defaultValue: "0.15", min: "0", mid: "0.5", max: "1", step: "any" },
      { key: "step5", label: "Deg 5", defaultValue: "0.75", min: "0", mid: "0.5", max: "1", step: "any" },
      { key: "step6", label: "Deg 6", defaultValue: "0.4", min: "0", mid: "0.5", max: "1", step: "any" },
      { key: "step7", label: "Deg 7", defaultValue: "0.6", min: "0", mid: "0.5", max: "1", step: "any" },
      { key: "step8", label: "Deg 8", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "any" },
      { key: "rest1", label: "Rest 1", defaultValue: "0", min: "0", mid: "0.5", max: "1", nonlinearSlider: false, step: "1" },
      { key: "rest2", label: "Rest 2", defaultValue: "0", min: "0", mid: "0.5", max: "1", nonlinearSlider: false, step: "1" },
      { key: "rest3", label: "Rest 3", defaultValue: "0", min: "0", mid: "0.5", max: "1", nonlinearSlider: false, step: "1" },
      { key: "rest4", label: "Rest 4", defaultValue: "1", min: "0", mid: "0.5", max: "1", nonlinearSlider: false, step: "1" },
      { key: "rest5", label: "Rest 5", defaultValue: "0", min: "0", mid: "0.5", max: "1", nonlinearSlider: false, step: "1" },
      { key: "rest6", label: "Rest 6", defaultValue: "0", min: "0", mid: "0.5", max: "1", nonlinearSlider: false, step: "1" },
      { key: "rest7", label: "Rest 7", defaultValue: "1", min: "0", mid: "0.5", max: "1", nonlinearSlider: false, step: "1" },
      { key: "rest8", label: "Rest 8", defaultValue: "0", min: "0", mid: "0.5", max: "1", nonlinearSlider: false, step: "1" },
    ]
  },
  noteGlide: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["0.1V/Oct"],
    outputs: ["0.1V/Oct"],
    parameters: [
      { key: "time", label: "Time", kind: "time", defaultValue: "0.05", min: "0", mid: "0.1", max: "2", maxDigits: 5, step: "any", unit: "s", tooltip: "Portamento time toward the input pitch." },
    ]
  },
  noteTranspose: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["0.1V/Oct"],
    outputs: ["0.1V/Oct"],
    parameters: [
      { key: "semitones", label: "Semitones", defaultValue: "0", min: "-24", mid: "0", max: "24", nonlinearSlider: false, step: "1" },
      { key: "octaves", label: "Octaves", defaultValue: "0", min: "-4", mid: "0", max: "4", nonlinearSlider: false, step: "1" },
    ]
  },
  pitchQuantizer: {
    planRole: "processor",
    planFreeRun: true,
    // Face: one-octave pitch-class keyboard (toggle keys → 12-bit mask).
    customDisplayArea: true,
    defaultWidthGu: 10,
    displayHeightGu: 5,
    inputs: ["0.1V/Oct", "Scale"],
    layout: "pitchQuantizer",
    outputs: ["0.1V/Oct"],
    parameters: [
      {
        choices: ["Chromatic", "Major", "Minor", "Major Pentatonic", "Minor Pentatonic", "Whole Tone", "Custom"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "scale",
        label: "Scale",
        linearSmoothing: false,
        max: "6",
        mid: "3",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      // Source of truth for quantization when Scale jack is empty.
      // Edited by the face keyboard; presets write this value too.
      {
        defaultValue: "2741",
        hidden: true,
        key: "scaleMask",
        label: "Scale Mask",
        linearSmoothing: false,
        max: "4095",
        mid: "2048",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  // Manual diatonic chord picker. Scale → Pitch Quantizer; Root → bass/voice.
  chordPad: {
    planRole: "processor",
    planFreeRun: true,
    customDisplayArea: true,
    defaultWidthGu: 14,
    displayHeightGu: 5,
    inputs: ["Select"],
    layout: "chordPad",
    outputs: ["Scale", "Root", "Gate"],
    parameters: [
      {
        choices: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "key",
        label: "Key",
        linearSmoothing: false,
        max: "11",
        mid: "5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        choices: ["Major", "Minor"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        choices: ["I", "ii", "iii", "IV", "V", "vi", "vii"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "degree",
        label: "Degree",
        linearSmoothing: false,
        max: "6",
        mid: "3",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { key: "level", label: "Level", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
    ]
  },
  surgeOscillator: {
    planRole: "source",
    inputs: ["0.1V/Oct", "Sync", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      f: "ƒ",
      f: "ƒ"},
    outputs: ["Out", "Saw", "Square", "Tri", "Sine", "Synced", "Internal Sync"],
    parameters: [
      {
        choices: ["Saw", "Square", "Tri", "Sine"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "3",
        mid: "1.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "100", min: "0", mid: "220", max: "20000", step: "any", unit: "Hz", tooltip: "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides." },
      { key: "syncFrequency", label: "Sync Freq", kind: "frequency", defaultValue: "50", min: "0", mid: "50", max: "20000", step: "any", unit: "Hz" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  // Port of soemdsp DistortionOscillator — soft-shaped multi-wave (Softwave).
  softwaveOsc: {
    planRole: "source",
    inputs: ["0.1V/Oct", "Morph", "Phase", "Amplitude", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Morph: "Morph",
      Phase: "Phase",
      Amplitude: "Amp",
      f: "ƒ"},
    outputs: ["Out"],
    parameters: [
      {
        choices: [
          "Analog Saw Sine",
          "Analog Saw Parabol",
          "Perfect Saw",
          "Analog Square",
          "Square",
          "Tri",
          "Bow Tri",
          "Soft Bow Tri",
          "Walter Wave",
          "Parabol Sine",
        ],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "9",
        mid: "4",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "100", min: "0", mid: "220", max: "20000", step: "any", unit: "Hz", tooltip: "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides." },
      {
        key: "morph",
        label: "Morph",
        defaultValue: "0.5",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "0.001",
        // Optimum-L order-3 (Π) — default smoother for shape morph.
        smoothingType: "papoulis"
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      { key: "antialias", label: "AA", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  // Parametric 2D math curves → mono Out via Project; X/Y always available for scopes.
  curveOsc: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "Out", kind: "scalar" },
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
      { key: "trace", label: "Out Trace", renderer: "trace", settingsSchema: "trace", source: { value: "Out" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["0.1V/Oct", "Phase", "Amplitude", "Reset", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Phase: "Phase",
      Amplitude: "Amp",
      Reset: "Reset",
      f: "ƒ"},
    outputs: ["Out", "X", "Y"],
    parameters: [
      {
        choices: [
          "Lissajous",
          "Rose",
          "Hypotrochoid",
          "Butterfly",
          "Superformula",
          "Harmonograph",
          "Cubic Novelty",
        ],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "curve",
        label: "Curve",
        linearSmoothing: false,
        max: "6",
        mid: "3",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Parametric family: phase θ walks a 2D path (X,Y). Out is not the curve itself — Project collapses that point to one number each sample."
      },
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "110", min: "0", mid: "220", max: "20000", step: "any", unit: "Hz" },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        key: "a",
        label: "A",
        defaultValue: "0.5",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "0.001",
        tooltip: "Shape parameter A (meaning depends on Curve: ratio, petal count, roll radius, etc.)."
      },
      {
        key: "b",
        label: "B",
        defaultValue: "0.5",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "0.001",
        tooltip: "Shape parameter B (second ratio, draw radius, superformula exponent, etc.)."
      },
      {
        key: "morph",
        label: "Morph",
        defaultValue: "0.35",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "0.001",
        tooltip: "Extra curve morph (phase offset, blend, petal fill, second system mix — per family)."
      },
      {
        choices: ["Y", "X", "Radius", "Angle", "Dot"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "project",
        label: "Project",
        linearSmoothing: false,
        max: "4",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "2D→1D: each sample the curve is a point (X,Y). Project picks the mono Out from that point — Y or X (axis), Radius (distance from origin), Angle (atan2/π), or Dot (shadow along a direction). X and Y outs still carry the full plane for scopes."
      },
      {
        defaultValue: "0",
        key: "projectAngle",
        kind: "phase",
        label: "Dot Angle",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true,
        tooltip:
          "Only for Project = Dot: direction of the projection line (0…1 cycles). Out = X·cosθ + Y·sinθ — the shadow of the 2D path onto that axis."
      },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  // L-system turtle path walked at Frequency → X/Y. Native WASM preferred.
  snowflake: {
    planRole: "source",
    displayType: "scope2d",
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "X", y: "Y" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "X", y: "Y" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["0.1V/Oct", "Amplitude", "Reset", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Amplitude: "Amp",
      Reset: "Reset",
      f: "ƒ"},
    outputs: ["X", "Y"],
    parameters: [
      {
        choices: [
          "Koch Curve",
          "Koch Snowflake",
          "Quadratic Koch",
          "Sierpinski",
          "Dragon",
          "Gosper",
          "Tree",
        ],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "pattern",
        label: "Pattern",
        linearSmoothing: false,
        max: "6",
        mid: "3",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "L-system axiom + rewrite rules. Path is rebuilt when Pattern, Iterations, or Angle change; Frequency walks arc length along the polyline."
      },
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "55", min: "0", mid: "220", max: "20000", step: "any", unit: "Hz" },
      {
        constraint: "cpu",
        key: "iterations",
        label: "Iterations",
        defaultValue: "3",
        min: "0",
        mid: "3",
        max: "7",
        step: "1",
        tooltip: "L-system rewrite depth (0–7). Higher = denser self-similar path; cost grows fast."
      },
      {
        key: "angle",
        label: "Angle",
        defaultValue: "60",
        min: "1",
        mid: "60",
        max: "180",
        step: "0.1",
        unit: "°",
        tooltip: "Turtle turn angle in degrees for +/− commands (overrides pattern catalog default at sample time)."
      },
      {
        key: "direction",
        label: "Direction",
        defaultValue: "1",
        min: "-1",
        mid: "0",
        max: "1",
        step: "0.01",
        tooltip:
          "Path walk morph (−1…1) via basic trisaw: −1 reverse at 1×, 0 bidirectional (triangle ping-pong), +1 forward loop. Continuous between those shapes."
      },
      {
        key: "spin",
        label: "Spin",
        defaultValue: "0",
        min: "-8",
        mid: "0",
        max: "8",
        step: "0.01",
        unit: "Hz",
        tooltip: "Rotate the whole figure continuously (cycles per second)."
      },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  dsfOscillator: {
    planRole: "source",
    // Left jacks (inputs[]) AND knobs (parameters[]) for pitch/phase/level:
    //   0.1V/Oct  → pitch CV (PolyBLEP-style; not a parameter)
    //   Phase     → CV jack that ADDS to the Phase knob
    //   Amplitude → CV jack that MULTIPLIES the Amplitude knob
    // First attempt only put phase/level in parameters[] — user looking at
    // the left IO column correctly saw only 0.1V. See MODULE_PATTERN_REFERENCE
    // "Three control surfaces".
    inputs: ["0.1V/Oct", "Phase", "Amplitude", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Phase: "Phase",
      Amplitude: "Amp",
      f: "ƒ"},
    outputs: ["Out"],
    parameters: [
      {
        choices: ["Sine", "Saw", "Square (PWM)", "Trimorph", "SquSaw"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "waveform",
        label: "Waveform",
        linearSmoothing: false,
        max: "4",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "100", min: "0", mid: "220", max: "20000", step: "any", unit: "Hz", tooltip: "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides." },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        key: "morph",
        label: "Harmonics",
        defaultValue: "1",
        min: "0",
        // Mid low so half the slider is the useful near-0 harmonic range.
        mid: "0.12",
        max: "1",
        nonlinearSlider: true,
        step: "0.001",
        tooltip:
          "DSF harmonic richness. Nonlinear slider: more sensitivity near 0 (where most of the useful range is)."
      },
      { key: "pulseWidth", label: "PWM", defaultValue: "0.5", min: "0.01", mid: "0.5", max: "0.99", step: "0.01" },
      { key: "blend", label: "SquSaw", defaultValue: "0.5", min: "0", mid: "0.5", max: "1", step: "0.01" },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  robinSupersaw: {
    planRole: "source",
    inputs: ["0.1V/Oct", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      f: "ƒ"},
    outputs: ["Mono", "Left", "Right"],
    parameters: [
      // "Frequency" is the pitch heard at the sandbox-wide "Pitch
      // Reference Note" (Patch Settings panel; defaults to C3), NOT the
      // pitch of whatever note you play. Set this equal to the master
      // "Pitch Reference Frequency" (defaults to 100Hz) and a MIDI
      // keyboard is automatically in tune; doubling it transposes the
      // whole instrument up exactly one octave. See
      // node-graph-patch-normalizers.js for the full explanation.
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "100", min: "0", mid: "220", max: "20000", step: "any", unit: "Hz", tooltip: "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides." },
      { key: "detuneCents", label: "Detune", defaultValue: "30", min: "0", mid: "50", max: "100", step: "0.1", unit: "cents" },
      { constraint: "cpu", key: "voices", label: "Voices", defaultValue: "7", min: "1", mid: "5", max: "9", step: "1" },
      { key: "amplitude", label: "Amplitude", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  hypersaw: {
    planRole: "source",
    displayType: "hypersawBurn",
    displayModes: [
      { key: "hypersawBurn", renderer: "hypersawBurn", source: { value: "Left" } },
    ],
    displaySignals: [
      { key: "Left", kind: "scalar" },
    ],
    inputs: ["Reset", "0.1V/Oct", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      f: "ƒ"},
    outputs: ["Left", "Right"],
    dataOutputs: ["Phases", "Amplitudes", "Pans"],
    parameters: [
      { constraint: "cpu", key: "voices", label: "Num Sawtooths", defaultValue: "8", min: "1", mid: "8", max: "32", step: "1" },
      { key: "phase", label: "Phase", kind: "phase", defaultValue: "0", min: "0", mid: "0.5", max: "1", step: "0.01", unit: "cycle", wraparound: true },
      { key: "frequency", label: "Frequency", kind: "frequency", defaultValue: "100", min: "0", mid: "220", max: "20000", step: "any", unit: "Hz", tooltip: "Default slider 0…20 kHz. Pitch MOD can run down through 0. Thru-zero: enable Bipolar on Frequency (domain-add MOD). Domain min/max are slider guides." },
      { key: "spread", label: "Spread", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "random", label: "Random", defaultValue: "0.15", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "drift", label: "Drift", defaultValue: "0.1", min: "0", mid: "0.5", max: "1", step: "0.01" },
      { key: "amplitude", label: "Amplitude", defaultValue: "0.35", min: "0", mid: "1", max: "1", step: "0.01" , modClamp: false },
    ]
  },
  chordSequencer: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["Clock", "Reset"],
    outputs: ["Scale", "Root", "Gate", "Step"],
    parameters: [
      {
        choices: [
          "I-V-vi-IV", "I-IV-V-I", "ii-V-I", "vi-IV-I-V", "I-vi-IV-V", "I-vi-ii-V",
          "I-IV-V7-I", "ii7-V7-I-vi", "I-bIII-IV-V", "I-V-ii-vi", "IV-V-vi-ii", "I-I-IV-V7",
        ],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "progression",
        label: "Progression",
        linearSmoothing: false,
        max: "11",
        mid: "5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        choices: ["Forward", "Reverse", "Ping-Pong"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "direction",
        label: "Direction",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        choices: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "key",
        label: "Key",
        linearSmoothing: false,
        max: "11",
        mid: "5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { key: "level", label: "Level", defaultValue: "1", min: "0", mid: "0.5", max: "1", step: "0.01" },
    ]
  },
  lutCell: {
    planRole: "source",
    inputs: ["A", "B", "C", "D", "Clock"],
    outputs: ["Out", "Q"],
    parameters: [
      { key: "truthTable", label: "Truth Table", defaultValue: "27030", min: "0", mid: "32767.5", max: "65535", step: "1" },
    ]
  },
  metallicRatio: {
    planRole: "source",
    outputs: ["Ratio"],
    parameters: [
      { key: "index", label: "Index", defaultValue: "1", min: "0", mid: "4", max: "8", step: "any" },
    ]
  },
  noiseGenerator: {
    planRole: "source",
    outputs: ["Left Out", "Right Out"],
    parameters: [
      {
        choices: ["Uniform", "Gaussian", "Brown", "Pink", "Crackle"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "4",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Uniform uses Shape (even ↔ Gaussian). Gaussian is pure normal. Brown/Pink/Crackle are spectral colors."
      },
      {
        defaultValue: "0",
        key: "shape",
        label: "Uniform → Gaussian",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "White (Uniform mode) only: 0 = even bipolar, 1 = Gaussian (normal). Smoothstep-blended full-range morph. Use for phase/amp noise (e.g. Softwave-style PM)."
      },
      {
        defaultValue: "0",
        key: "mean",
        label: "Mean",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "0.5",
        key: "deviation",
        label: "Deviation",
        max: "2",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "1",
        key: "seed",
        label: "Seed",
        linearSmoothing: false,
        max: "99999",
        maxDigits: 5,
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  randomWalk: {
    planRole: "source",
    outputs: ["Out"],
    parameters: [
      {
        choices: ["White", "Filtered", "Random Steps", "Fixed Steps"],
        defaultValue: "3",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "method",
        label: "Method",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "2",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "200",
        maxDigits: 5,
        mid: "2",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        defaultValue: "0.25",
        key: "jitter",
        kind: "frequency",
        label: "Jitter",
        max: "200",
        maxDigits: 5,
        mid: "0.25",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        defaultValue: "1",
        key: "seed",
        label: "Seed",
        linearSmoothing: false,
        max: "99999",
        maxDigits: 1,
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  piSpigotNoise: {
    planRole: "source",
    planFreeRun: true,
    displayType: "scope2d",
    defaultDisplayMode: "xyBurn",
    displaySignals: [
      { key: "Left Out", label: "Sum", kind: "scalar" },
      { key: "Right Out", label: "Term", kind: "scalar" },
      { key: "Hex", kind: "scalar" },
      { key: "N", kind: "scalar" },
    ],
    displayModes: [
      { key: "xyBurn", label: "Sum/Term", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "Left Out", y: "Right Out" } },
    ],
    outputs: ["Left Out", "Right Out", "Hex", "N", "T", "B3", "B2", "B1", "B0"],
    outputLabels: {
      "Left Out": "Sum",
      "Right Out": "Term",
    },
    outputTooltips: {
      "Left Out": "Running BBP fractional sum {S} as bipolar audio.",
      "Right Out": "This sample’s BBP term (one of the four series).",
      Hex: "Last finished hex digit of π (0…15 as 0…1).",
      N: "Current hex-digit index into π.",
      T: "Pulse when a hex digit finishes.",
      B3: "Latched hex bit 8 (first 16th of the beat).",
      B2: "Latched hex bit 4.",
      B1: "Latched hex bit 2.",
      B0: "Latched hex bit 1.",
    },
    digitalOutputs: ["T", "B3", "B2", "B1", "B0"],
    parameters: [
      {
        defaultValue: "0",
        key: "start",
        label: "Start",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Where in π the four-phase BBP walk begins (0 = first hex digits)."
      },
      {
        defaultValue: "1",
        key: "stride",
        label: "Stride",
        linearSmoothing: false,
        max: "16",
        mid: "4",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "How many hex places to skip after each finished digit."
      },
      {
        choices: ["White", "Pink", "Brown", "Blue", "Violet"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "color",
        label: "Color",
        linearSmoothing: false,
        max: "4",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "0",
        key: "smoothing",
        label: "Smoothing",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  fractalBrownianNoise: {
    planRole: "source",
    defaultAlias: "fBm",
    // Display sources reference the pre-level ("Out X Raw" etc.) signal so the
    // scope always shows the fractal noise at full volume, regardless of the
    // Level parameter -- the Level knob only affects the wired/audio output.
    displaySignals: [
      { key: "Out X Raw", label: "Out X", kind: "scalar" },
      { key: "Out Y Raw", label: "Out Y", kind: "scalar" },
      { key: "Out Z Raw", label: "Out Z", kind: "scalar" },
      { key: "X/Y", kind: "xy" },
    ],
    displayModes: [
      { key: "xyBurn", label: "X/Y Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "Out X Raw", y: "Out Y Raw" } },
      { key: "xyTrace", label: "X/Y Trace", renderer: "scope2dTrace", settingsSchema: "scope2dTrace", source: { x: "Out X Raw", y: "Out Y Raw" } },
      { key: "xTrace", label: "X Trace", renderer: "trace", settingsSchema: "trace", source: { value: "Out X Raw" } },
      { key: "yTrace", label: "Y Trace", renderer: "trace", settingsSchema: "trace", source: { value: "Out Y Raw" } },
      { key: "zTrace", label: "Z Trace", renderer: "trace", settingsSchema: "trace", source: { value: "Out Z Raw" } },
    ],
    defaultDisplayMode: "xyBurn",
    inputs: ["Reset"],
    outputs: ["Out X", "Out Y", "Out Z"],
    outputAliases: { X: "Out X", Y: "Out Y", Z: "Out Z" },
    parameters: [
      {
        defaultValue: "0.5",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "200",
        maxDigits: 5,
        mid: "0.5",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        defaultValue: "4",
        key: "octaves",
        label: "Octaves",
        max: "8",
        mid: "4",
        min: "1",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "0.5",
        key: "persistence",
        label: "Persistence",
        max: "0.99",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "1",
        key: "scale",
        label: "Scale",
        max: "10",
        mid: "1",
        min: "0.1",
        step: "any"
      },
      {
        defaultValue: "1",
        key: "seed",
        label: "Seed",
        linearSmoothing: false,
        max: "99999",
        maxDigits: 5,
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  clock: {
    planRole: "source",
    displayType: "vectorDot",
    displayRenderer: "vectorDot",
    displayModes: [
      { key: "vectorDot", label: "Vector Dot", renderer: "vectorDot", source: { value: "Digital Out" } },
    ],
    inputs: ["Reset"],
    outputAliases: {
      Out: "Digital Out",
      Pulse: "T",
      Trigger: "T",
    },
    outputLabels: {
      "Analog Out": "\u223F",
      "Digital Out": "\u25AE",
      T: "T",
    },
    outputs: ["Digital Out", "Analog Out", "T"],
    parameters: [
      {
        defaultValue: "2",
        key: "rate",
        kind: "frequency",
        label: "Rate",
        max: "40",
        maxDigits: 5,
        mid: "2",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "cycle",
        wraparound: true
      },
      {
        defaultValue: "0.5",
        key: "duty",
        label: "Duty",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: true,
        sliderCurve: "edges",
        curveAmount: "0.3",
        step: "any",
        tooltip: "High time as a fraction of the period. Quantized to whole samples at the current rate.",
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  transport: {
    planRole: "source",
    displayModes: [
      { key: "transportBpm", renderer: "transportBpm", source: { value: "bpm" } },
    ],
    displaySignals: [
      { key: "bpm", kind: "scalar" },
    ],
    digitalOutputs: ["0..1", "-1..1", "Trigger"],
    displayType: "transportBpm",
    inputs: [],
    outputLabels: {
      "-1..1": "-1..1",
      "0..1": "0..1",
      Trigger: "Trigger"
    },
    outputs: ["0..1", "-1..1", "Trigger"],
    parameters: [
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        maxDigits: 4,
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
      {
        defaultValue: "0",
        key: "divisions",
        label: "Divisions",
        max: "31",
        maxDigits: 3,
        mid: "0",
        min: "-31",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "120",
        key: "bpm",
        label: "BPM",
        max: "320",
        maxDigits: 3,
        mid: "160",
        min: "1",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  randomClock: {
    planRole: "processor",
    planFreeRun: true,
    // Trigger-rate module: the dot display reads far better than a trace
    // for something that is mostly flat with an occasional pulse.
    displayType: "dot",
    inputs: ["Reset"],
    outputs: ["Trigger", "Gate"],
    parameters: [
      { defaultValue: "0.25", key: "minSeconds", kind: "time", label: "Min", max: "60", maxDigits: 5, mid: "0.25", min: "0", step: "any", unit: "s", tooltip: "Shortest wait between random triggers." },
      { defaultValue: "1", key: "maxSeconds", kind: "time", label: "Max", max: "60", maxDigits: 5, mid: "1", min: "0", step: "any", unit: "s", tooltip: "Longest wait between random triggers. Changing Min/Max remaps the current wait immediately." },
      { defaultValue: "0.5", key: "duty", label: "Duty", max: "1", mid: "0.5", min: "0", nonlinearSlider: true, sliderCurve: "edges", curveAmount: "0.3", step: "any" },
      { defaultValue: "0.01", key: "triggerTime", kind: "time", label: "Trigger", max: "1", maxDigits: 5, mid: "0.01", min: "0", step: "any", unit: "s", tooltip: "How long the Trigger output stays high. Gate length is Duty × this interval." },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "seed", label: "Seed", linearSmoothing: false, max: "99999", maxDigits: 5, mid: "1", min: "0", nonlinearSlider: false, step: "1" },
      { defaultValue: "0", key: "threshold", label: "Reset Threshold", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any", tooltip: "Reset input rising-edge trip. When Reset crosses above this, a new interval is drawn and Trigger fires." },
    ]
  },
  clockDivider: {
    planRole: "processor",
    planFreeRun: true,
    // Trigger-rate module: the dot display reads far better than a trace
    // for something that is mostly flat with an occasional pulse.
    displayType: "dot",
    inputs: ["Clock", "Reset"],
    outputs: ["Out"],
    parameters: [
      { defaultValue: "0", key: "threshold", label: "Threshold", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "2", key: "division", label: "Division", max: "64", maxDigits: 3, mid: "2", min: "1", nonlinearSlider: false, step: "1" },
      { defaultValue: "0.5", key: "duty", label: "Duty", max: "1", mid: "0.5", min: "0.01", nonlinearSlider: true, sliderCurve: "edges", curveAmount: "0.3", step: "any" },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
    ]
  },
  delayedTrigger: {
    planRole: "processor",
    planFreeRun: true,
    // Trigger-rate module: the dot display reads far better than a trace
    // for something that is mostly flat with an occasional pulse.
    displayType: "dot",
    inputs: ["Trigger", "Reset"],
    outputs: ["Out"],
    parameters: [
      { defaultValue: "0", key: "threshold", label: "Threshold", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.1", key: "delay", kind: "time", label: "Delay", max: "5", maxDigits: 5, mid: "0.1", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.01", key: "pulseTime", kind: "time", label: "Pulse", max: "1", maxDigits: 5, mid: "0.01", min: "0", step: "any", unit: "s" },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
    ]
  },
  buttonEvents: {
    planRole: "source",
    outputs: ["Click", "Hover", "Down", "Up", "Enter", "Leave"],
    parameters: []
  },
  wireBreak: {
    planRole: "source",
    inputs: [],
    outputs: ["Pulse", "Gate"],
    parameters: []
  },
  wireConnect: {
    planRole: "source",
    inputs: [],
    outputs: ["Pulse"],
    parameters: []
  },
  wireDisconnect: {
    planRole: "source",
    inputs: [],
    outputs: ["Pulse"],
    parameters: []
  },
  windowReopen: {
    planRole: "source",
    inputs: [],
    outputs: ["Pulse", "Gate", "Sine"],
    parameters: []
  },
  shootingStarTail: {
    planRole: "source",
    inputs: [],
    outputs: ["Pulse"],
    parameters: []
  },
  shootingStarExplosion: {
    planRole: "source",
    inputs: [],
    outputs: ["Pulse"],
    parameters: [
      { defaultValue: "0", key: "lowRange", label: "Low Range", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any", tooltip: "Minimum explosion pulse amplitude (0-1 speed sends this)." },
      { defaultValue: "1", key: "highRange", label: "High Range", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any", tooltip: "Maximum explosion pulse amplitude (1 speed, or no speed data, sends this)." },
    ]
  },
  nextPatch: {
    planRole: "processor",
    layout: "patchCommand",
    inputs: ["Trigger"],
    outputs: [],
    parameters: [
      { defaultValue: "0", key: "threshold", label: "Threshold", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
    ]
  },
  previousPatch: {
    planRole: "processor",
    layout: "patchCommand",
    inputs: ["Trigger"],
    outputs: [],
    parameters: [
      { defaultValue: "0", key: "threshold", label: "Threshold", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
    ]
  },
  triggerCounter: {
    planRole: "processor",
    planFreeRun: true,
    // Trigger-rate module: the dot display reads far better than a trace
    // for something that is mostly flat with an occasional pulse.
    displayType: "dot",
    inputs: ["Trigger", "Reset"],
    outputs: ["Count", "Pulse"],
    parameters: [
      { defaultValue: "0", key: "threshold", label: "Threshold", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "8", key: "countMax", label: "Count Max", max: "64", maxDigits: 3, mid: "8", min: "1", nonlinearSlider: false, step: "1" },
      { defaultValue: "1", key: "increment", label: "Increment", max: "16", maxDigits: 3, mid: "1", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.01", key: "pulseTime", kind: "time", label: "Pulse", max: "1", maxDigits: 5, mid: "0.01", min: "0", step: "any", unit: "s" },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
    ]
  },
  stepSequencer: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["Trigger", "Reset"],
    outputs: ["Out", "Gate"],
    parameters: [
      {
        defaultValue: "0",
        key: "threshold",
        label: "Threshold",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "8",
        key: "steps",
        label: "Steps",
        max: "8",
        mid: "8",
        min: "1",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1",
        key: "level",
        label: "Level",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      { defaultValue: "0", key: "step1", label: "Step 1", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.25", key: "step2", label: "Step 2", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.5", key: "step3", label: "Step 3", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.75", key: "step4", label: "Step 4", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "step5", label: "Step 5", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.75", key: "step6", label: "Step 6", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.5", key: "step7", label: "Step 7", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.25", key: "step8", label: "Step 8", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
    ]
  },
  // stepGrid registers its own definition from public/modules/stepGrid/
  // step-grid-register.js -- see node-graph-chromeless-module-registry.js.
  triggerDivider: {
    planRole: "processor",
    planFreeRun: true,
    // Trigger-rate module: the dot display reads far better than a trace
    // for something that is mostly flat with an occasional pulse.
    displayType: "dot",
    inputs: ["Trigger", "Reset"],
    outputs: ["Out"],
    parameters: [
      { defaultValue: "0", key: "threshold", label: "Threshold", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "2", key: "division", label: "Division", max: "64", maxDigits: 3, mid: "2", min: "1", nonlinearSlider: false, step: "1" },
      { defaultValue: "0.01", key: "pulseTime", kind: "time", label: "Pulse", max: "1", maxDigits: 5, mid: "0.01", min: "0", step: "any", unit: "s" },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
    ]
  },
  minMax: {
    planRole: "processor",
    inputs: ["In 1", "In 2", "In 3", "In 4"],
    outputs: ["Max", "Min"],
    parameters: []
  },
  comparator: {
    planRole: "processor",
    // Edge detector: 1-sample history of In. Pulses are digital (exact 0/1).
    // Steady / Sign are continuous digital levels; Thru is the raw passthrough.
    digitalInputs: ["In"],
    digitalOutputs: ["Up", "Down", "Change", "Steady", "Sign"],
    inputs: ["In"],
    outputs: ["Up", "Down", "Change", "Steady", "Sign", "Thru"],
    parameters: []
  },
  sampleDelay: {
    planRole: "processor",
    // Pure delay: Thru = dry In, Delayed = wet (time * sr + samples).
    // Dry before wet (convention for space FX outlet order).
    // Max combined delay 4s (reserved ring). Both params can be 0.
    inputs: ["In"],
    outputs: ["Thru", "Delayed"],
    parameters: [
      {
        defaultValue: "0",
        key: "time",
        kind: "time",
        label: "Time",
        max: "4",
        maxDigits: 5,
        mid: "0.1",
        min: "0",
        step: "any",
        unit: "s"
      },
      {
        defaultValue: "0",
        key: "samples",
        label: "Samples",
        max: "192000",
        mid: "64",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  bitConverter: {
    planRole: "processor",
    // Full Scale carries a raw, exact integer (e.g. keyboardController's
    // Held Keys bitmask) -- must not be smoothed like a normal CV input,
    // same reasoning as Held Keys itself being a digital output. The two
    // "-> Full Scale" outputs are the same kind of raw value on the way
    // back out; the two "Full Scale ->" outputs are normal 0..1/-1..1 CV
    // and are left analog.
    digitalInputs: ["Full Scale"],
    digitalOutputs: ["Unipolar to Full Scale", "Bipolar to Full Scale"],
    inputs: ["Full Scale", "Unipolar", "Bipolar"],
    outputs: ["Full Scale to Unipolar", "Full Scale to Bipolar", "Unipolar to Full Scale", "Bipolar to Full Scale"],
    parameters: [
      {
        defaultValue: "53",
        key: "bits",
        label: "Bits",
        max: "53",
        mid: "27",
        min: "1",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  t: nodeGraphTSeriesSingleModuleDefinition(),
  t1: nodeGraphTSeriesModuleDefinition(1),
  t2: nodeGraphTSeriesModuleDefinition(2),
  t3: nodeGraphTSeriesModuleDefinition(3),
  t4: nodeGraphTSeriesModuleDefinition(4),
  t5: nodeGraphTSeriesModuleDefinition(5),
  t6: nodeGraphTSeriesModuleDefinition(6),
  t7: nodeGraphTSeriesModuleDefinition(7),
  t8: nodeGraphTSeriesModuleDefinition(8),
  t9: nodeGraphTSeriesModuleDefinition(9),
  t10: nodeGraphTSeriesModuleDefinition(10),
  gain: {
    planRole: "processor",
    displayType: "trace",
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    stereoTracePorts: { left: "Left", right: "Right" },
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "0",
        key: "leftDb",
        kind: "decibels",
        label: "Left",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        step: "any",
        unit: "dB",
        tooltip: "Extra gain on the Left path (−∞…+12 dB). 0 dB is unity."
      },
      {
        defaultValue: "0",
        key: "rightDb",
        kind: "decibels",
        label: "Right",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        step: "any",
        unit: "dB",
        tooltip: "Extra gain on the Right path (−∞…+12 dB). 0 dB is unity."
      },
      {
        choices: ["Average", "Power", "Sum", "Equal-power", "Peak", "Left", "Right"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "monoSum",
        label: "Mono Sum",
        linearSmoothing: false,
        max: "6",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "How Left and Right become Mono Out. Average = (L+R)/2 (unity for dual-mono). Power = RMS with mid sign. Sum = L+R. Equal-power = (L+R)/√2. Peak = larger-magnitude channel. Left / Right = that channel only."
      },
      {
        defaultValue: "0",
        key: "offset",
        label: "Offset",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "DC offset after scale."
      },
      {
        defaultValue: "0",
        key: "gainDb",
        kind: "decibels",
        label: "Amplitude",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        step: "any",
        unit: "dB",
        tooltip: "Master gain (−∞…+12 dB) applied to Mono/Left/Right. 0 dB is unity. Old patches that stored linear Amplitude are converted on load."
      },
    ]
  },
  // Shop-hidden legacy alias of gain (same surface).
  gainBias: {
    planRole: "processor",
    displayType: "trace",
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    stereoTracePorts: { left: "Left", right: "Right" },
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "0",
        key: "leftDb",
        kind: "decibels",
        label: "Left",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        step: "any",
        unit: "dB",
        tooltip: "Extra gain on the Left path (−∞…+12 dB). 0 dB is unity."
      },
      {
        defaultValue: "0",
        key: "rightDb",
        kind: "decibels",
        label: "Right",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        step: "any",
        unit: "dB",
        tooltip: "Extra gain on the Right path (−∞…+12 dB). 0 dB is unity."
      },
      {
        choices: ["Average", "Power", "Sum", "Equal-power", "Peak", "Left", "Right"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "monoSum",
        label: "Mono Sum",
        linearSmoothing: false,
        max: "6",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "How Left and Right become Mono Out. Average = (L+R)/2 (unity for dual-mono). Power = RMS with mid sign. Sum = L+R. Equal-power = (L+R)/√2. Peak = larger-magnitude channel. Left / Right = that channel only."
      },
      {
        defaultValue: "0",
        key: "offset",
        label: "Offset",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "DC offset after scale."
      },
      {
        defaultValue: "0",
        key: "gainDb",
        kind: "decibels",
        label: "Amplitude",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        step: "any",
        unit: "dB",
        tooltip: "Master gain (−∞…+12 dB) applied to Mono/Left/Right. 0 dB is unity. Old patches that stored linear Amplitude are converted on load."
      },
    ]
  },
  mix: {
    planRole: "processor",
    inputs: ["In1", "In2", "In3", "In4"],
    outputs: ["Out1", "Out2", "Out3", "Out4"],
    parameters: [
      { key: "bleed2to1", label: "2→1", defaultValue: "0", min: "0", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bleed3to1", label: "3→1", defaultValue: "0", min: "0", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bleed4to1", label: "4→1", defaultValue: "0", min: "0", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "volume1", label: "Volume 1", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01", maxDigits: 4 },
      { key: "volume2", label: "Volume 2", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01", maxDigits: 4 },
      { key: "volume3", label: "Volume 3", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01", maxDigits: 4 },
      { key: "volume4", label: "Volume 4", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01", maxDigits: 4 },
      { key: "bias1", label: "Bias 1", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bias2", label: "Bias 2", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bias3", label: "Bias 3", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bias4", label: "Bias 4", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
    ]
  },
  mixStereo: {
    planRole: "processor",
    displayType: "trace",
    stereoTracePorts: { left: "Left", right: "Right" },
    inputAliases: { In: "Mono" },
    inputLabels: { Mono: "Mono" },
    inputs: ["Mono", "L1", "R1", "L2", "R2", "L3", "R3", "L4", "R4"],
    outputAliases: { Out: "Mono", M: "Mono" },
    outputLabels: { Mono: "Mono" },
    outputs: ["Mono", "Left", "Right"],
    parameters: [
      {
        defaultValue: "0",
        key: "volume1",
        kind: "decibels",
        label: "Volume1",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        step: "any",
        unit: "dB",
        tooltip: "Pair 1 level (−∞…+12 dB). 0 dB is unity.",
      },
      {
        defaultValue: "0",
        key: "pan1",
        label: "Pan1",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Pair 1 stereo balance. 0 = unchanged. −1 = left only. +1 = right only.",
      },
      {
        defaultValue: "0",
        key: "volume2",
        kind: "decibels",
        label: "Volume2",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        step: "any",
        unit: "dB",
        tooltip: "Pair 2 level (−∞…+12 dB). 0 dB is unity.",
      },
      {
        defaultValue: "0",
        key: "pan2",
        label: "Pan2",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Pair 2 stereo balance. 0 = unchanged. −1 = left only. +1 = right only.",
      },
      {
        defaultValue: "0",
        key: "volume3",
        kind: "decibels",
        label: "Volume3",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        step: "any",
        unit: "dB",
        tooltip: "Pair 3 level (−∞…+12 dB). 0 dB is unity.",
      },
      {
        defaultValue: "0",
        key: "pan3",
        label: "Pan3",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Pair 3 stereo balance. 0 = unchanged. −1 = left only. +1 = right only.",
      },
      {
        defaultValue: "0",
        key: "volume4",
        kind: "decibels",
        label: "Volume4",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        step: "any",
        unit: "dB",
        tooltip: "Pair 4 level (−∞…+12 dB). 0 dB is unity.",
      },
      {
        defaultValue: "0",
        key: "pan4",
        label: "Pan4",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Pair 4 stereo balance. 0 = unchanged. −1 = left only. +1 = right only.",
      },
      {
        defaultValue: "0",
        key: "amplitude",
        kind: "decibels",
        label: "Amplitude (All)",
        max: "12",
        mid: "0",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        step: "any",
        unit: "dB",
        tooltip: "Master gain after all four pairs (−∞…+12 dB). 0 dB is unity.",
      },
    ],
  },
  // Legacy type id → same as mix (load alias until patches re-save).
  gainBiasMix: {
    planRole: "processor",
    inputs: ["In1", "In2", "In3", "In4"],
    outputs: ["Out1", "Out2", "Out3", "Out4"],
    parameters: [
      { key: "bleed2to1", label: "2→1", defaultValue: "0", min: "0", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bleed3to1", label: "3→1", defaultValue: "0", min: "0", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bleed4to1", label: "4→1", defaultValue: "0", min: "0", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "volume1", label: "Volume 1", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01", maxDigits: 4 },
      { key: "volume2", label: "Volume 2", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01", maxDigits: 4 },
      { key: "volume3", label: "Volume 3", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01", maxDigits: 4 },
      { key: "volume4", label: "Volume 4", defaultValue: "1", min: "0", mid: "1", max: "2", step: "0.01", maxDigits: 4 },
      { key: "bias1", label: "Bias 1", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bias2", label: "Bias 2", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bias3", label: "Bias 3", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
      { key: "bias4", label: "Bias 4", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "0.01", maxDigits: 4 },
    ]
  },
  bias: {
    planRole: "processor",
    inputAliases: { Mono: "In", Left: "In", Right: "In" },
    inputs: ["In"],
    outputAliases: { Mono: "Out", Left: "Out", Right: "Out" },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0",
        key: "offset",
        label: "Offset",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any"
      },
    ]
  },
  u2b: {
    planRole: "processor",
    defaultWidthGu: 3,
    defaultUi: {
      buttonsHidden: true,
      oscilloscopeHidden: true,
    },
    inputLabels: { In: "in" },
    outputLabels: { Out: "out" },
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [],
  },
  b2u: {
    planRole: "processor",
    defaultWidthGu: 3,
    defaultUi: {
      buttonsHidden: true,
      oscilloscopeHidden: true,
    },
    inputLabels: { In: "in" },
    outputLabels: { Out: "out" },
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [],
  },
  inv: {
    planRole: "processor",
    defaultWidthGu: 3,
    defaultUi: {
      buttonsHidden: true,
      oscilloscopeHidden: true,
    },
    inputLabels: { In: "in" },
    outputLabels: { Out: "out" },
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [],
  },
  attenuverter: {
    planRole: "processor",
    inputAliases: { Mono: "In", Left: "In", Right: "In" },
    inputs: ["In"],
    outputAliases: { Mono: "Out", Left: "Out", Right: "Out" },
    outputs: ["Out"],
    defaultUi: {
      buttonsHidden: true,
      oscilloscopeHidden: true,
    },
    parameters: [
      {
        curveAmount: "0.55",
        defaultValue: "0",
        spawnValue: "0.5",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: true,
        showSign: true,
        sliderCurve: "bipolarRational",
        step: "any",
        tooltip: "Scale and invert. 0 = mute, +1 = unity, −1 = invert. Bipolar rational is finer around 0.",
      },
      {
        defaultValue: "0",
        key: "offset",
        label: "Offset",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        showSign: true,
        step: "any",
        tooltip: "DC offset after scale.",
      },
    ]
  },
  softClipper: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "2",
        key: "width",
        label: "Width",
        max: "8",
        mid: "2",
        min: "0.0001",
        nonlinearSlider: true,
        step: "any"
      },
      {
        defaultValue: "0",
        key: "gainDb",
        kind: "decibels",
        label: "Gain",
        max: "60",
        mid: "12",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Input gain into the clipper. Raise this to drive the signal into the tanh curve."
      },
      {
        choices: ["x0", "x1", "x2"],
        defaultValue: "2",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "oversample",
        label: "Antialias",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "x0 = original tanh. x1 = first-order ADAA (the audible step). x2 = extra linear 2× around the same ADAA — usually inaudible vs x1."
      },
      {
        defaultValue: "0",
        hidden: true,
        key: "center",
        label: "Center",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any"
      },
    ]
  },
  clipperLimiter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["x0", "x1", "x2"],
        defaultValue: "2",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "oversample",
        label: "Antialias",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Soft Clipper modes on the last stage (the Min→Max knee). x0 original, x1 ADAA, x2 extra linear 2× (usually inaudible vs x1)."
      },
      {
        defaultValue: "0",
        key: "gainDb",
        kind: "decibels",
        label: "Gain",
        max: "60",
        mid: "12",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Input drive before the knee. Soft Clipper is the last stage — this is not make-up gain after clip."
      },
      {
        defaultValue: "-12",
        key: "minDb",
        kind: "decibels",
        label: "Min dB",
        max: "60",
        mid: "-12",
        min: "-120",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Level where the Soft Clipper starts. Below this the driven signal is unchanged."
      },
      {
        defaultValue: "0",
        hidden: true,
        key: "maxDb",
        kind: "decibels",
        label: "Max dB",
        max: "60",
        mid: "0",
        min: "-120",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Ceiling the tanh curve approaches. A wider Min→Max span makes a more gradual clip."
      },
    ]
  },
  // Airwindows Density3 — density soft-clip / anti-density + highpass + wet.
  airClipper: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "0",
        key: "density",
        label: "Density",
        max: "1",
        mid: "0.2",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "0",
        key: "highpass",
        label: "Highpass",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: true,
        step: "any"
      },
      {
        defaultValue: "1",
        key: "output",
        label: "Output",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "1",
        key: "wet",
        label: "Dry/Wet",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
    ]
  },
  rotate3dTo2d: {
    planRole: "processor",
    inputs: ["X", "Y", "Z"],
    outputs: ["X", "Y"],
    parameters: [
      { defaultValue: "0", key: "rotateX", kind: "phase", label: "Rotate X", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "0.01", unit: "cycle", wraparound: true },
      { defaultValue: "0", key: "rotateY", kind: "phase", label: "Rotate Y", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "0.01", unit: "cycle", wraparound: true },
      { defaultValue: "0", key: "rotateZ", kind: "phase", label: "Rotate Z", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "0.01", unit: "cycle", wraparound: true },
    ]
  },
  // Stereo L/R → goniometer axes for any X/Y scope. Classic 45° + Rotate.
  // No face (hasFace false): title, I/O, and the Rotate slider.
  vectorscopeTransform: {
    planRole: "processor",
    hasFace: false,
    inputs: ["L", "R"],
    inputLabels: { L: "Left", R: "Right" },
    // Legacy X/Y port names (and full Left/Right) still wire in.
    inputAliases: { X: "L", Y: "R", Left: "L", Right: "R" },
    outputs: ["X", "Y"],
    parameters: [
      {
        defaultValue: "0",
        key: "rotate",
        label: "Rotate",
        max: "180",
        mid: "0",
        min: "-180",
        nonlinearSlider: false,
        step: "any",
        unit: "°",
        tooltip: "Extra rotation after the classic 45° vectorscope (mono vertical). 0 = unchanged. Positive is counterclockwise.",
      },
    ],
    defaultWidthGu: 4,
    defaultHeightGu: 4,
    defaultAlias: "Rotate",
    defaultUi: {
      buttonsHidden: true,
      titleHidden: false,
    }
  },
  // |Δsample| speed → desaturation target + attack/release inertia (multimeter).
  // Sine → high Inertia (rich color); saw edges → Speed spike → Inertia drops (white).
  // Face is a solid color plate (not a trace): Hue/Lightness knobs + Inertia sat.
  speedColorInertia: {
    planRole: "monitor",
    planFreeRun: true,
    monitorSink: true,
    displayHeightGu: 2,
    displayType: "speedColorInertiaFace",
    defaultDisplayMode: "face",
    displayModes: [
      {
        key: "face",
        label: "Color",
        renderer: "speedColorInertiaFace",
        source: { value: "Inertia" }
      },
    ],
    visualInputs: [
      { key: "speedColorInertia", label: "In", port: "In" },
    ],
    visualSink: true,
    inputs: ["In"],
    inputAliases: { Mono: "In" },
    inputLabels: { In: "In" },
    outputs: ["Raw", "Speed", "Inertia"],
    outputLabels: {
      Raw: "Raw",
      Speed: "Speed",
      Inertia: "Inertia"
    },
    parameters: [
      {
        defaultValue: "8",
        key: "gain",
        label: "Gain",
        max: "64",
        mid: "8",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip: "Sensitivity of |Δsample| → Speed. Higher turns Inertia white faster on edges."
      },
      {
        defaultValue: "1",
        key: "attack",
        label: "Attack",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "How fast Inertia drops toward white when speed rises (1 = instant)."
      },
      {
        defaultValue: "0.005",
        key: "release",
        label: "Release",
        max: "1",
        mid: "0.05",
        min: "0",
        step: "any",
        tooltip: "How fast Inertia recovers toward full color when the wave is smooth."
      },
      {
        defaultValue: "0.667",
        key: "hue",
        kind: "phase",
        label: "Hue",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true,
        tooltip: "Base hue of the solid color face (0=red … ~0.67=blue). Not mixed into Speed/Inertia signal math."
      },
      {
        defaultValue: "0.5",
        key: "lightness",
        label: "Lightness",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Base lightness of the solid color face 0…1. Not mixed into Speed/Inertia signal math."
      },
    ]
  },
  // Plugin Knob (type id knob kept for patch compatibility).
  // Module-first: macro-dial face + Bias out; offset is hidden state.
  knob: {
    planRole: "source",
    chrome: NodeGraphModuleChromeLayout.LayoutB,
    defaultWidthGu: 5,
    displayHeightGu: 3,
    displayType: "knobFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "knobFace",
        settingsSchema: "knobFace",
        source: { value: "Bias" }
      },
    ],
    defaultDisplayMode: "face",
    layout: "sliderWidget",
    inputs: ["In"],
    inputLabels: {
      In: "In"
    },
    outputs: ["Bias"],
    outputLabels: {
      Bias: "Bias"
    },
    parameters: [
      {
        bipolar: false,
        defaultValue: "0",
        // Hidden control state — face is the only UI; no param-out twin of Bias.
        // Domain range follows Min/Max (synced at runtime).
        hidden: true,
        parameterOutput: false,
        key: "offset",
        label: "Offset",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        linearSmoothing: true,
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        smoothingType: "linear",
      },
      ...nodeGraphControllerRangeSmoothingParameters(),
      {
        choices: ["Unipolar", "Bipolar"],
        defaultValue: "0",
        hidden: true,
        key: "polarity",
        label: "Polarity",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        step: "1",
        tooltip: "Legacy. Bipolar with Min at 0 maps Bias to −Max…+Max.",
      },
    ],
  },
  pluginSlider: {
    planRole: "source",
    chrome: NodeGraphModuleChromeLayout.LayoutB,
    defaultWidthGu: 4,
    displayHeightGu: 2,
    // Module-first: face = control + Bias display; one Bias out; value is hidden state.
    displayType: "pluginSliderFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "pluginSliderFace",
        settingsSchema: "pluginSliderFace",
        source: { value: "Bias" }
      },
    ],
    defaultDisplayMode: "face",
    layout: "sliderWidget",
    inputs: ["In"],
    inputLabels: { In: "In" },
    outputs: ["Bias"],
    outputLabels: { Bias: "Bias" },
    parameters: [
      {
        bipolar: true,
        defaultValue: "0",
        // Hidden control state — face drag writes this; no body row / param-out.
        hidden: true,
        parameterOutput: false,
        key: "value",
        label: "Value",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Manual Bias offset (hidden). Face is the control; Bias out = In + value."
      },
    ]
  },
  toggleButton: {
    planRole: "source",
    chrome: NodeGraphModuleChromeLayout.LayoutB,
    defaultWidthGu: 3,
    displayHeightGu: 2,
    displayType: "toggleButtonFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "toggleButtonFace",
        settingsSchema: "toggleButtonFace",
        source: { value: "Out" }
      },
    ],
    defaultDisplayMode: "face",
    layout: "sliderWidget",
    outputs: ["Out"],
    outputLabels: { Out: "←" },
    parameters: [
      {
        defaultValue: "0",
        key: "value",
        label: "State",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        choices: ["Off", "On"],
        displayChoices: true,
        linearSmoothing: true,
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        smoothingType: "linear",
      },
      ...nodeGraphControllerRangeSmoothingParameters(),
    ]
  },
  momentaryButton: {
    planRole: "source",
    chrome: NodeGraphModuleChromeLayout.LayoutB,
    defaultWidthGu: 5,
    // Face 2gu + title row (22/28) ceils to 3gu outer — spawn 5×3.
    displayHeightGu: 2,
    displayType: "momentaryButtonFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "momentaryButtonFace",
        settingsSchema: "momentaryButtonFace",
        source: { value: "Out" }
      },
    ],
    defaultDisplayMode: "face",
    layout: "sliderWidget",
    outputs: ["Out"],
    outputLabels: { Out: "←" },
    parameters: [
      {
        defaultValue: "0",
        key: "value",
        label: "Gate",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        hidden: true,
        choices: ["Off", "On"],
        displayChoices: true,
        linearSmoothing: true,
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        smoothingType: "linear",
      },
      ...nodeGraphControllerRangeSmoothingParameters(),
    ]
  },
  pluginInput: {
    planRole: "source",
    outputAliases: { Out: "Mono", M: "Mono", L: "Left", R: "Right" },
    outputLabels: { Mono: "M", Left: "L", Right: "R" },
    outputs: ["Mono", "Left", "Right"],
    parameters: [
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        step: "0.01",
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        modClamp: false
      },
    ]
  },
  pluginOutput: {
    planRole: "sink",
    displayType: "trace",
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    bufferedInputs: ["Mono", "Left", "Right"],
    stereoTracePorts: { left: "Left", right: "Right" },
    inputs: ["Mono", "Left", "Right"],
    inputLabels: { Mono: "\u2192", Left: "\u2192", Right: "\u2192" },
    outputAliases: { Out: "Mono", M: "Mono", L: "Left", R: "Right" },
    outputLabels: {
      Mono: typeof NODE_GRAPH_THRU_SYMBOL === "string" ? NODE_GRAPH_THRU_SYMBOL : "\u2190",
      Left: typeof NODE_GRAPH_THRU_SYMBOL === "string" ? NODE_GRAPH_THRU_SYMBOL : "\u2190",
      Right: typeof NODE_GRAPH_THRU_SYMBOL === "string" ? NODE_GRAPH_THRU_SYMBOL : "\u2190",
    },
    outputs: ["Mono", "Left", "Right"],
    output: true,
    parameters: [
      {
        defaultValue: "-20",
        key: "volume",
        kind: "decibels",
        label: "Volume",
        max: "12",
        mid: "-20",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        step: "any",
        unit: "dB",
        tooltip: "Speaker level (−∞…+12 dB). 0 dB is unity. Old patches that stored 0…1 linear Volume are converted on load."
      },
      {
        defaultValue: "0",
        key: "pan",
        label: "Pan",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Stereo balance after Mono is summed in. 0 = unchanged. −1 = left only. +1 = right only."
      },
    ]
  },
  pluginMidiIn: {
    planRole: "source",
    outputs: ["Gate", "MIDI", "Velocity", "0.1V/Oct", "Frequency"],
    outputLabels: {
      "0.1V/Oct": "0.1V"
    },
    parameters: [
      {
        defaultValue: "60",
        key: "defaultNote",
        label: "Default Note",
        max: "127",
        maxDigits: 3,
        mid: "60",
        min: "0",
        step: "1",
        tooltip: "Note used when no live MIDI is active (sandbox preview)."
      },
    ]
  },
  pluginMidiOut: {
    planRole: "source",
    inputs: ["MIDI Number", "Gate"],
    outputs: ["Normalized", "Full Value", "Gate"],
    parameters: [
      {
        defaultValue: "60",
        key: "midiNumber",
        label: "MIDI Number",
        max: "127",
        maxDigits: 3,
        mid: "64",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  passiveFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["LP", "BP", "HP"],
        defaultValue: "0",
        displayChoices: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Real-pole stacks. LP / HP use High Cut / Low Cut. BP is HP then LP. Old LP6/BP6/HP6 values stay 0/1/2."
      },
      {
        choices: ["6", "12", "18", "24"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "slope",
        label: "Slope",
        linearSmoothing: false,
        max: "3",
        mid: "1.5",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Cascaded real 1-poles. 6 dB = one pole; 24 dB = four. No resonance."
      },
      {
        defaultValue: "200",
        key: "lowFrequency",
        kind: "frequency",
        label: "Low Cut",
        max: "20000",
        maxDigits: 5,
        mid: "200",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Highpass cutoff (HP and BP). Sweep moves this with High Cut in musical steps."
      },
      {
        defaultValue: "1000",
        key: "highFrequency",
        kind: "frequency",
        label: "High Cut",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Lowpass cutoff (LP and BP). Sweep moves this with Low Cut in musical steps."
      },
      {
        defaultValue: "1",
        key: "stagger",
        label: "Stagger",
        max: "4",
        mid: "1.6",
        min: "1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Pole spread ratio k. 1 = same freq; ~1.5 gentle spread; above ~2.2 a stair-step. No effect at 6 dB."
      },
      {
        defaultValue: "0",
        key: "sweep",
        label: "Sweep",
        max: "48",
        mid: "0",
        min: "-48",
        nonlinearSlider: false,
        showSign: true,
        step: "any",
        unit: "st",
        tooltip: "Shift used cutoffs in semitones. BP keeps the Low/High interval (ratio) constant."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "1",
        displayChoices: true,
        key: "gainCompensation",
        label: "Gain Comp",
        linearSmoothing: false,
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "On = scale poles so the labeled cutoff is −3 dB. Off = every pole sits on the staggered freqs. No effect at 6 dB."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // First-order spectral tilt (not a 1-pole HP). Credit: Robin Schmidt / RS-MET shelf BLT.
  tiltFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "0",
        key: "amount",
        label: "Amount",
        max: "12",
        mid: "0",
        min: "-12",
        nonlinearSlider: false,
        showSign: true,
        step: "any",
        unit: "dB",
        tooltip: "Spectral tilt. +dB = cut lows / boost highs; −dB = darker. Span is low↔high difference."
      },
      {
        defaultValue: "1000",
        key: "pivot",
        kind: "frequency",
        label: "Pivot",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Frequency the tilt balances around. When ƒ is wired, that Hz is the pivot. Unwired uses this knob. 0 allowed; circuit floors tiny values for stability only."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // ZDF SVF multi-mode EQ. Credit: Robin Schmidt / RS-MET rsStateVariableFilter.
  eqFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    displayHeightGu: 5,
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: [
          "Bypass",
          "HP12",
          "LP12",
          "BP12 Skirt",
          "BP12 Peak",
          "BR12",
          "AP12",
          "Peak",
          "LS12",
          "HS12",
        ],
        // 1 = HP12 (first usable mode after Bypass); 2-pole SVF → 12 dB/oct
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "9",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "ZDF state-variable EQ (Robin Schmidt / RS-MET). 2-pole modes use compact labels (HP12, LP12, …). Order: Bypass, HP12, LP12, then the rest. Min-phase, zero latency."
      },
      {
        // Metaparam defaults: full audio band 0…20 kHz (not 0…1 unit).
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Cutoff / center in Hz. When ƒ is wired, that Hz is the cutoff (Pitch Detector Frequency → ƒ). Unwired uses this knob. 0 allowed (frozen)."
      },
      {
        defaultValue: "0.707",
        key: "q",
        label: "Q",
        max: "20",
        mid: "0.707",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Resonance / bandwidth. ~0.707 is Butterworth-like for LP/HP."
      },
      {
        defaultValue: "0",
        key: "gain",
        label: "Gain",
        max: "24",
        mid: "0",
        min: "-24",
        nonlinearSlider: false,
        showSign: true,
        step: "any",
        unit: "dB",
        tooltip: "Used by Peak, LS12, and HS12 modes."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  papoulisFilter: {
    planRole: "processor",
    inputAliases: { Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { f: "ƒ" },
    inputs: ["In", "f"],
    layout: "filterCurve",
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "1000",
        key: "cutoff",
        kind: "frequency",
        label: "Cutoff",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "When ƒ is wired, that Hz is the cutoff. Unwired uses this knob. 0 allowed. DSP floors tiny values only when coefficients would blow up."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // Classical multipoles — shared scientific_iir cascade (native + JS).
  butterworth: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["LP", "HP", "BP", "BR"],
        defaultValue: "0",
        displayChoices: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Butterworth multipole (maximally flat). Fine for tone or a simple two-way LP+HP split; for 3+ bands use 3–6 Crossover."
      },
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Order",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        step: "2",
        tooltip: "Even order 2…8 (cascade of biquads)."
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Cutoff / center. When ƒ is wired, that Hz is the cutoff. Unwired uses this knob. 0 allowed (frozen)."
      },
      {
        defaultValue: "1",
        key: "bandwidth",
        label: "Bandwidth",
        max: "4",
        mid: "1",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        unit: "oct",
        tooltip: "BP/BR width in octaves."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  linkwitzRiley: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["LP", "HP", "BP", "BR"],
        defaultValue: "0",
        displayChoices: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "One Linkwitz–Riley-shaped LP or HP path—good for a manual two-way split. For 3+ bands with matched band outs, use 3–6 Crossover."
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Order",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        step: "2",
        tooltip: "Total even order (two Butterworth of order/2)."
      },
      {
        defaultValue: "1",
        key: "bandwidth",
        label: "Bandwidth",
        max: "4",
        mid: "1",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        unit: "oct"
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  bessel: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["LP", "HP", "BP", "BR"],
        defaultValue: "0",
        displayChoices: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Bessel multipole — maximally flat group delay."
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Order",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        step: "2"
      },
      {
        defaultValue: "1",
        key: "bandwidth",
        label: "Bandwidth",
        max: "4",
        mid: "1",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        unit: "oct"
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  chebyshev: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["LP", "HP", "BP", "BR"],
        defaultValue: "0",
        displayChoices: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Chebyshev Type I — equiripple passband, steeper roll-off."
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Order",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        step: "2"
      },
      {
        defaultValue: "1",
        key: "bandwidth",
        label: "Bandwidth",
        max: "4",
        mid: "1",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        unit: "oct"
      },
      {
        defaultValue: "1",
        key: "ripple",
        label: "Ripple",
        max: "6",
        mid: "1",
        min: "0.01",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Passband ripple in dB."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  elliptic: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["LP", "HP", "BP", "BR"],
        defaultValue: "0",
        displayChoices: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Elliptic (Cauer) — sharpest transition for a given order (freestanding SOS approx)."
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Order",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        step: "2"
      },
      {
        defaultValue: "1",
        key: "bandwidth",
        label: "Bandwidth",
        max: "4",
        mid: "1",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        unit: "oct"
      },
      {
        defaultValue: "1",
        key: "ripple",
        label: "Ripple",
        max: "6",
        mid: "1",
        min: "0.01",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Passband ripple in dB (elliptic approx)."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // True resonant 2nd-order BP — reuses EQ ZDF SVF Bandpass Peak (Robin Schmidt).
  bandpass: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", "0.1V/Oct": "0.1V", f: "ƒ" },
    inputs: ["In", "Left", "Right", "0.1V/Oct", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Center. When ƒ is wired, that Hz is the center (absolute). Unwired uses this knob, tracked by 0.1V/Oct."
      },
      {
        defaultValue: "1",
        key: "q",
        label: "Q",
        max: "50",
        mid: "1",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Resonance. True 2-pole constant-peak bandpass (EQ SVF Bandpass Peak)."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // True 2-pole allpass — EQ ZDF SVF Allpass (Robin Schmidt). Phase tool, not a delay line.
  allpass: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", "0.1V/Oct": "0.1V", f: "ƒ" },
    inputs: ["In", "Left", "Right", "0.1V/Oct", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Allpass transition frequency (phase curve center). When ƒ is wired, that Hz is the center. Unwired uses this knob, tracked by 0.1V/Oct."
      },
      {
        defaultValue: "0.707",
        key: "q",
        label: "Q",
        max: "20",
        mid: "0.707",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Phase slope sharpness around Frequency. Flat magnitude always."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // Softpop: Gaussian white / pink / brown → resonant Peak BP. Oscillator-dept noise voice.
  crossover2: {
    planRole: "processor",
    layout: "filterCurve",
    chrome: "LayoutA",
    displayHeightGu: 1,
    inputAliases: { Mono: "In", Left: "L", Right: "R", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", L: "Left", R: "Right", f: "ƒ" },
    inputs: ["In", "L", "R", "f"],
    outputs: ["LFL", "LFR", "HFL", "HFR"],




    outputAliases: {
      "Low Left": "LFL",
      "Low Right": "LFR",
      "Low L": "LFL",
      "Low R": "LFR",
      "Left Low": "LFL",
      "Right Low": "LFR",
      "LFL": "LFL",
      "LFR": "LFR",
      "High Left": "HFL",
      "High Right": "HFR",
      "High L": "HFL",
      "High R": "HFR",
      "Left High": "HFL",
      "Right High": "HFR",
      "HFL": "HFL",
      "HFR": "HFR",
      "0 L": "LFL",
      "0 R": "LFR",
      "0 Left": "LFL",
      "0 Right": "LFR",
      "1 L": "HFL",
      "1 R": "HFR",
      "1 Left": "HFL",
      "1 Right": "HFR"
    },




    parameters: [
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Slope",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        linearSmoothing: false,
        smoothingType: "none",
        step: "2",
        tooltip: "Linkwitz-Riley order: 2 / 4 / 8 (about 12 / 24 / 48 dB/oct). LR4 is the usual default. LR8 is heavier CPU."
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Freq L1",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Crossover split frequency. When ƒ is wired, that Hz is the split. Unwired uses this knob. Splits stay non-decreasing."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  crossover3: {
    planRole: "processor",
    layout: "filterCurve",
    chrome: "LayoutA",
    displayHeightGu: 1,
    inputAliases: { Mono: "In", Left: "L", Right: "R" },
    inputLabels: { In: "Mono", L: "Left", R: "Right" },
    inputs: ["In", "L", "R"],
    outputs: ["LFL", "LFR", "ML", "MR", "HFL", "HFR"],




    outputAliases: {
      "Low Left": "LFL",
      "Low Right": "LFR",
      "Low L": "LFL",
      "Low R": "LFR",
      "Left Low": "LFL",
      "Right Low": "LFR",
      "LFL": "LFL",
      "LFR": "LFR",
      "Mid Left": "ML",
      "Mid Right": "MR",
      "Mid L": "ML",
      "Mid R": "MR",
      "Left Mid": "ML",
      "Right Mid": "MR",
      "1 L": "ML",
      "1 R": "MR",
      "1 Left": "ML",
      "1 Right": "MR",
      "L 1": "ML",
      "R 1": "MR",
      "L1": "ML",
      "R1": "MR",
      "ML": "ML",
      "MR": "MR",
      "High Left": "HFL",
      "High Right": "HFR",
      "High L": "HFL",
      "High R": "HFR",
      "Left High": "HFL",
      "Right High": "HFR",
      "HFL": "HFL",
      "HFR": "HFR",
      "0 L": "LFL",
      "0 R": "LFR",
      "0 Left": "LFL",
      "0 Right": "LFR",
      "2 L": "HFL",
      "2 R": "HFR",
      "2 Left": "HFL",
      "2 Right": "HFR"
    },




    parameters: [
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Slope",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        linearSmoothing: false,
        smoothingType: "none",
        step: "2",
        tooltip: "Linkwitz-Riley order: 2 / 4 / 8 (about 12 / 24 / 48 dB/oct). LR4 is the usual default. LR8 is heavier CPU."
      },
      {
        defaultValue: "300",
        key: "frequency1",
        kind: "frequency",
        label: "Freq L1",
        max: "20000",
        maxDigits: 5,
        mid: "300",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Lower split (Low | mid). Wide 20 Hz–20 kHz range; non-decreasing with Frequency 2."
      },
      {
        defaultValue: "3000",
        key: "frequency2",
        kind: "frequency",
        label: "Freq L2",
        max: "20000",
        maxDigits: 5,
        mid: "3000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Upper split (mid | High). Wide 20 Hz–20 kHz range; non-decreasing with Frequency 1."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  crossover4: {
    planRole: "processor",
    layout: "filterCurve",
    chrome: "LayoutA",
    displayHeightGu: 1,
    inputAliases: { Mono: "In", Left: "L", Right: "R" },
    inputLabels: { In: "Mono", L: "Left", R: "Right" },
    inputs: ["In", "L", "R"],
    outputs: ["LFL", "LFR", "L1", "R1", "L2", "R2", "HFL", "HFR"],




    outputAliases: {
      "Low Left": "LFL",
      "Low Right": "LFR",
      "Low L": "LFL",
      "Low R": "LFR",
      "Left Low": "LFL",
      "Right Low": "LFR",
      "LFL": "LFL",
      "LFR": "LFR",
      "Low-Mid Left": "L1",
      "Low-Mid Right": "R1",
      "Low-Mid L": "L1",
      "Low-Mid R": "R1",
      "Left Low-Mid": "L1",
      "Right Low-Mid": "R1",
      "1 L": "L1",
      "1 R": "R1",
      "1 Left": "L1",
      "1 Right": "R1",
      "L 1": "L1",
      "R 1": "R1",
      "L1": "L1",
      "R1": "R1",
      "High-Mid Left": "L2",
      "High-Mid Right": "R2",
      "High-Mid L": "L2",
      "High-Mid R": "R2",
      "Left High-Mid": "L2",
      "Right High-Mid": "R2",
      "2 L": "L2",
      "2 R": "R2",
      "2 Left": "L2",
      "2 Right": "R2",
      "L 2": "L2",
      "R 2": "R2",
      "L2": "L2",
      "R2": "R2",
      "High Left": "HFL",
      "High Right": "HFR",
      "High L": "HFL",
      "High R": "HFR",
      "Left High": "HFL",
      "Right High": "HFR",
      "HFL": "HFL",
      "HFR": "HFR",
      "0 L": "LFL",
      "0 R": "LFR",
      "0 Left": "LFL",
      "0 Right": "LFR",
      "3 L": "HFL",
      "3 R": "HFR",
      "3 Left": "HFL",
      "3 Right": "HFR"
    },




    parameters: [
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Slope",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        linearSmoothing: false,
        smoothingType: "none",
        step: "2",
        tooltip: "Linkwitz-Riley order: 2 / 4 / 8 (about 12 / 24 / 48 dB/oct). LR4 is the usual default. LR8 is heavier CPU."
      },
      {
        defaultValue: "200",
        key: "frequency1",
        kind: "frequency",
        label: "Freq L1",
        max: "20000",
        maxDigits: 5,
        mid: "200",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split Low | 1. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "1000",
        key: "frequency2",
        kind: "frequency",
        label: "Freq L2",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 1 | 2. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "5000",
        key: "frequency3",
        kind: "frequency",
        label: "Freq L3",
        max: "20000",
        maxDigits: 5,
        mid: "5000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 2 | High. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  crossover5: {
    planRole: "processor",
    layout: "filterCurve",
    chrome: "LayoutA",
    displayHeightGu: 1,
    inputAliases: { Mono: "In", Left: "L", Right: "R" },
    inputLabels: { In: "Mono", L: "Left", R: "Right" },
    inputs: ["In", "L", "R"],
    outputs: ["LFL", "LFR", "L1", "R1", "L2", "R2", "L3", "R3", "HFL", "HFR"],




    outputAliases: {
      "Band 1 Left": "LFL",
      "Band 1 Right": "LFR",
      "Band 1 L": "LFL",
      "Band 1 R": "LFR",
      "Left Band 1": "LFL",
      "Right Band 1": "LFR",
      "LFL": "LFL",
      "LFR": "LFR",
      "Band 2 Left": "L1",
      "Band 2 Right": "R1",
      "Band 2 L": "L1",
      "Band 2 R": "R1",
      "Left Band 2": "L1",
      "Right Band 2": "R1",
      "1 L": "L1",
      "1 R": "R1",
      "1 Left": "L1",
      "1 Right": "R1",
      "L 1": "L1",
      "R 1": "R1",
      "L1": "L1",
      "R1": "R1",
      "Band 3 Left": "L2",
      "Band 3 Right": "R2",
      "Band 3 L": "L2",
      "Band 3 R": "R2",
      "Left Band 3": "L2",
      "Right Band 3": "R2",
      "2 L": "L2",
      "2 R": "R2",
      "2 Left": "L2",
      "2 Right": "R2",
      "L 2": "L2",
      "R 2": "R2",
      "L2": "L2",
      "R2": "R2",
      "Band 4 Left": "L3",
      "Band 4 Right": "R3",
      "Band 4 L": "L3",
      "Band 4 R": "R3",
      "Left Band 4": "L3",
      "Right Band 4": "R3",
      "3 L": "L3",
      "3 R": "R3",
      "3 Left": "L3",
      "3 Right": "R3",
      "L 3": "L3",
      "R 3": "R3",
      "L3": "L3",
      "R3": "R3",
      "Band 5 Left": "HFL",
      "Band 5 Right": "HFR",
      "Band 5 L": "HFL",
      "Band 5 R": "HFR",
      "Left Band 5": "HFL",
      "Right Band 5": "HFR",
      "HFL": "HFL",
      "HFR": "HFR",
      "Low L": "LFL",
      "Low R": "LFR",
      "Low Left": "LFL",
      "Low Right": "LFR",
      "High L": "HFL",
      "High R": "HFR",
      "High Left": "HFL",
      "High Right": "HFR",
      "0 L": "LFL",
      "0 R": "LFR",
      "0 Left": "LFL",
      "0 Right": "LFR",
      "4 L": "HFL",
      "4 R": "HFR",
      "4 Left": "HFL",
      "4 Right": "HFR"
    },




    parameters: [
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Slope",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        linearSmoothing: false,
        smoothingType: "none",
        step: "2",
        tooltip: "Linkwitz-Riley order: 2 / 4 / 8 (about 12 / 24 / 48 dB/oct). LR4 is the usual default. LR8 is heavier CPU."
      },
      {
        defaultValue: "150",
        key: "frequency1",
        kind: "frequency",
        label: "Freq L1",
        max: "20000",
        maxDigits: 5,
        mid: "150",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split Low | 1. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "500",
        key: "frequency2",
        kind: "frequency",
        label: "Freq L2",
        max: "20000",
        maxDigits: 5,
        mid: "500",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 1 | 2. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "2000",
        key: "frequency3",
        kind: "frequency",
        label: "Freq L3",
        max: "20000",
        maxDigits: 5,
        mid: "2000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 2 | 3. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "8000",
        key: "frequency4",
        kind: "frequency",
        label: "Freq L4",
        max: "20000",
        maxDigits: 5,
        mid: "8000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 3 | High. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  crossover6: {
    planRole: "processor",
    layout: "filterCurve",
    chrome: "LayoutA",
    displayHeightGu: 1,
    inputAliases: { Mono: "In", Left: "L", Right: "R" },
    inputLabels: { In: "Mono", L: "Left", R: "Right" },
    inputs: ["In", "L", "R"],
    outputs: ["LFL", "LFR", "L1", "R1", "L2", "R2", "L3", "R3", "L4", "R4", "HFL", "HFR"],




    outputAliases: {
      "Band 1 Left": "LFL",
      "Band 1 Right": "LFR",
      "Band 1 L": "LFL",
      "Band 1 R": "LFR",
      "Left Band 1": "LFL",
      "Right Band 1": "LFR",
      "LFL": "LFL",
      "LFR": "LFR",
      "Band 2 Left": "L1",
      "Band 2 Right": "R1",
      "Band 2 L": "L1",
      "Band 2 R": "R1",
      "Left Band 2": "L1",
      "Right Band 2": "R1",
      "1 L": "L1",
      "1 R": "R1",
      "1 Left": "L1",
      "1 Right": "R1",
      "L 1": "L1",
      "R 1": "R1",
      "L1": "L1",
      "R1": "R1",
      "Band 3 Left": "L2",
      "Band 3 Right": "R2",
      "Band 3 L": "L2",
      "Band 3 R": "R2",
      "Left Band 3": "L2",
      "Right Band 3": "R2",
      "2 L": "L2",
      "2 R": "R2",
      "2 Left": "L2",
      "2 Right": "R2",
      "L 2": "L2",
      "R 2": "R2",
      "L2": "L2",
      "R2": "R2",
      "Band 4 Left": "L3",
      "Band 4 Right": "R3",
      "Band 4 L": "L3",
      "Band 4 R": "R3",
      "Left Band 4": "L3",
      "Right Band 4": "R3",
      "3 L": "L3",
      "3 R": "R3",
      "3 Left": "L3",
      "3 Right": "R3",
      "L 3": "L3",
      "R 3": "R3",
      "L3": "L3",
      "R3": "R3",
      "Band 5 Left": "L4",
      "Band 5 Right": "R4",
      "Band 5 L": "L4",
      "Band 5 R": "R4",
      "Left Band 5": "L4",
      "Right Band 5": "R4",
      "4 L": "L4",
      "4 R": "R4",
      "4 Left": "L4",
      "4 Right": "R4",
      "L 4": "L4",
      "R 4": "R4",
      "L4": "L4",
      "R4": "R4",
      "Band 6 Left": "HFL",
      "Band 6 Right": "HFR",
      "Band 6 L": "HFL",
      "Band 6 R": "HFR",
      "Left Band 6": "HFL",
      "Right Band 6": "HFR",
      "HFL": "HFL",
      "HFR": "HFR",
      "Low L": "LFL",
      "Low R": "LFR",
      "Low Left": "LFL",
      "Low Right": "LFR",
      "High L": "HFL",
      "High R": "HFR",
      "High Left": "HFL",
      "High Right": "HFR",
      "0 L": "LFL",
      "0 R": "LFR",
      "0 Left": "LFL",
      "0 Right": "LFR",
      "5 L": "HFL",
      "5 R": "HFR",
      "5 Left": "HFL",
      "5 Right": "HFR"
    },




    parameters: [
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Slope",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        linearSmoothing: false,
        smoothingType: "none",
        step: "2",
        tooltip: "Linkwitz-Riley order: 2 / 4 / 8 (about 12 / 24 / 48 dB/oct). LR4 is the usual default. LR8 is heavier CPU."
      },
      {
        defaultValue: "100",
        key: "frequency1",
        kind: "frequency",
        label: "Freq L1",
        max: "20000",
        maxDigits: 5,
        mid: "100",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split Low | 1. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "300",
        key: "frequency2",
        kind: "frequency",
        label: "Freq L2",
        max: "20000",
        maxDigits: 5,
        mid: "300",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 1 | 2. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "1000",
        key: "frequency3",
        kind: "frequency",
        label: "Freq L3",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 2 | 3. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "3000",
        key: "frequency4",
        kind: "frequency",
        label: "Freq L4",
        max: "20000",
        maxDigits: 5,
        mid: "3000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 3 | 4. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
      {
        defaultValue: "10000",
        key: "frequency5",
        kind: "frequency",
        label: "Freq L5",
        max: "20000",
        maxDigits: 5,
        mid: "10000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Split 4 | High. Wide 20 Hz–20 kHz; non-decreasing across splits."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  softpopOscillator: {
    planRole: "source",
    inputs: ["Reset", "0.1V/Oct", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      f: "ƒ"},
    outputs: ["Out", "Left", "Right"],
    outputLabels: { Out: "Mono" },
    parameters: [
      {
        choices: ["White", "Pink", "Brown"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "color",
        label: "Color",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "White = Gaussian. Pink / Brown spectral colors, then resonant bandpass."
      },
      {
        choices: ["Stereo", "Mono"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "stereoMode",
        label: "Width",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Stereo = independent L/R noise (width). Mono = one noise path to both channels."
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Band center. 0.1V/Oct tracks pitch. When f is wired: Hz = f × Frequency."
      },
      {
        defaultValue: "4",
        key: "q",
        label: "Q",
        max: "50",
        mid: "4",
        min: "0.05",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Bandpass tightness (constant-peak 2-pole SVF). Mod via the Q slider’s CV port."
      },
      {
        defaultValue: "1",
        key: "seed",
        kind: "seed",
        label: "Seed",
        linearSmoothing: false,
        max: "99999",
        maxDigits: 5,
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Deterministic noise sequence. Reset jack restarts from this seed. (Seed widget UI: kind=seed hook for dedicated control later.)"
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
    ]
  },
  // One-shot analog envelope only (T → A). Sharpness is sine→square on the curve.
  kickEnvelope: {
    planRole: "source",
    layout: "roundShape",
    chrome: "LayoutA",
    customDisplayArea: true,
    displayType: "roundShapeFace",
    defaultWidthGu: 5,
    displayHeightGu: 5,
    spectrumCompanion: false,
    inputs: ["T"],
    inputLabels: {
      T: "T",
    },
    inputAliases: {Trigger: "T",
      Reset: "T",
      Gate: "T",
      Freq: "f", Frequency: "f", F: "f", "ƒ": "f"},
    outputs: ["A"],
    outputLabels: {
      A: "A",
    },
    outputAliases: {
      Amp: "A",
      Out: "A",
      Env: "A",
    },
    parameters: [
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        step: "any",
        tooltip: "Gain on A. 1 = full Low/High span. 0 = silence.",
      },
      {
        defaultValue: "0",
        key: "low",
        label: "Low",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Rest / floor of A (0–1). After the hit, A sits here.",
      },
      {
        defaultValue: "1",
        key: "high",
        label: "High",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Peak of A at trigger (0–1). The hit runs High → Low.",
      },
      {
        defaultValue: "0.2",
        key: "speed",
        kind: "time",
        label: "Speed",
        max: "4",
        maxDigits: 5,
        mid: "0.2",
        min: "0.001",
        step: "any",
        unit: "s",
        tooltip: "How long the envelope takes from High to Low (seconds).",
      },
      {
        defaultValue: "0",
        key: "sharpness",
        label: "Sharpness",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "0 = sine (round decay). 1 = square (hold, then snap). Face uses the same sine→square. Legacy key: roundness.",
      },
      {
        choices: ["Linear", "Exponential"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "curve",
        label: "Curve",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "How A travels High → Low. Linear = even mix. Exponential = pitch / octave (log2).",
      },
    ],
  },
  // Analog sine kick voice (T → Out audio, A envelope).
  sineKick: {
    planRole: "source",
    planFreeRun: true,
    layout: "roundShape",
    chrome: "LayoutA",
    customDisplayArea: true,
    displayType: "roundShapeFace",
    defaultWidthGu: 5,
    displayHeightGu: 5,
    spectrumCompanion: false,
    inputs: ["T", "0.1V/Oct", "f"],
    inputLabels: {T: "T",
      "0.1V/Oct": "0.1V",
      f: "ƒ"},
    inputAliases: {Trigger: "T",
      Reset: "T",
      Gate: "T",
      "0.1V": "0.1V/Oct",
      "0.1v": "0.1V/Oct",
      Freq: "f", Frequency: "f", F: "f", "ƒ": "f"},
    outputs: ["Out", "A"],
    outputLabels: {
      Out: "Out",
      A: "A",
    },
    outputAliases: {
      Amp: "A",
      Env: "A",
      Audio: "Out",
      Kick: "Out",
    },
    parameters: [
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        step: "any",
        tooltip: "Peak level of Out and A.",
      },
      {
        defaultValue: "52",
        key: "pitch",
        kind: "frequency",
        label: "Pitch",
        max: "400",
        maxDigits: 5,
        mid: "52",
        min: "8",
        step: "any",
        unit: "Hz",
        tooltip: "Rest frequency. The hit starts Punch octaves above this, then falls back. 0.1V/Oct tracks it.",
      },
      {
        defaultValue: "1.7",
        key: "punch",
        label: "Punch",
        max: "4",
        mid: "1.7",
        min: "0",
        step: "any",
        unit: "oct",
        tooltip: "Beater tension in octaves above Pitch. 0 = sine tom. ~1.7 = analog kick thump.",
      },
      {
        defaultValue: "0.28",
        key: "decay",
        kind: "time",
        label: "Decay",
        max: "4",
        maxDigits: 5,
        mid: "0.28",
        min: "0.01",
        step: "any",
        unit: "s",
        tooltip: "How long the boom lasts (seconds to about 1% amplitude). Pitch drop is faster than this.",
      },
      {
        defaultValue: "0",
        key: "sharpness",
        label: "Sharpness",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Sine→square on the oscillator (same ellipsoid curve as RoundShape). 0 = sine. 1 = square.",
      },
    ],
  },
  // Period-reset sine chirp: Frequency = rate; High/Low + Together; FreqCurve/AmpCurve bipolar.
  sinepulse: {
    planRole: "source",
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Reset", "0.1V/Oct", "Increment", "f"],
    inputLabels: {"0.1V/Oct": "0.1V",
      Increment: "Inc.",
      f: "ƒ"},
    // Out = audio; f = instant Hz; Amp/Freq = 0..1 curves for driving other modules.
    outputs: ["Out", "f", "Amp", "Freq"],
    outputLabels: {
      Out: "Out",
      Amp: "Amp",
      Freq: "Freq"
    },
    parameters: [
      {
        defaultValue: "1",
        key: "rate",
        kind: "frequency",
        label: "Rate",
        max: "20000",
        maxDigits: 5,
        mid: "8",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Master sweep rate: chirps per second (period = 1/Rate). Domain max = project Speed Limit. Pitch MOD / f as usual. Legacy key: frequency."
      },
      {
        defaultValue: "0",
        key: "lowFreq",
        kind: "frequency",
        label: "LowFreq",
        max: "20000",
        maxDigits: 5,
        mid: "40",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Lower end of the chirp (Hz). Up starts here; Down ends here. Max = project Speed Limit. Shift collapses LowFreq toward HighFreq. Legacy key: frequencyLow."
      },
      {
        defaultValue: "20000",
        key: "highFreq",
        kind: "frequency",
        label: "HighFreq",
        max: "20000",
        maxDigits: 5,
        mid: "8000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Upper end of the chirp (Hz). Up ends here; Down starts here. Max = project Speed Limit (never exceeded by Shift). Legacy key: frequencyHigh."
      },
      {
        defaultValue: "0",
        key: "shift",
        label: "Shift",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Range bias 0…1. 0 = full LowFreq…HighFreq span. 1 = LowFreq rises to meet HighFreq (single tone at HighFreq). Only shrinks the gap — never past HighFreq or project Speed Limit."
      },
      {
        defaultValue: "1",
        key: "sweep",
        label: "Sweep",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Active fraction of each Rate period. 0 = click; 1 = full HighFreq↔LowFreq. Rest is silence."
      },
      {
        choices: ["Up", "Down"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "direction",
        label: "Direction",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Up = LowFreq → HighFreq. Down = HighFreq → LowFreq. Flipping mid-sweep reflects progress so pitch continues the other way without a jump."
      },
      {
        defaultValue: "0.5",
        key: "freqCurve",
        label: "FreqCurve",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Frequency path shape (−1…+1): −1 super-log, −0.5 log, 0 linear, +0.5 exponential, +1 super-exponential."
      },
      {
        defaultValue: "0",
        key: "ampCurve",
        label: "AmpCurve",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Amplitude envelope shape (−1…+1), same map as FreqCurve: −1 super-log … 0 linear … +1 super-exponential. Independent of FreqCurve."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "hardReset",
        label: "Hard Reset",
        linearSmoothing: false,
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "On = zero the sine phase at each tooth (and Reset jack edge) for a sharper attack. Off = continuous phase across teeth."
      },
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false
      },
      {
        // Lo-fi → hi-fi (less high-frequency timing jitter). Default = Fine.
        choices: ["Off", "Soft Edge", "Adaptive", "Shaped", "Noise", "Fine"],
        defaultValue: "5",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "antialias",
        label: "Antialias",
        linearSmoothing: false,
        max: "5",
        mid: "5",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Rate-period AA, ordered lo-fi → hi-fi. Off = continuous Rate, no period AA. Soft Edge = continuous + PolyBLEP on tooth wrap / hard-reset (Cont+BLEP). Adaptive = Noise when periods are long, continuous when short (Noise+Blend). Shaped = noise-shaped integer lengths (Noise+Shape). Noise = classic Robin ±1-sample pitch dither. Fine (default) = same at half-sample resolution (Noise+½)."
      },
    ]
  },
  // Under construction: electro drum voice suite (Drum shelf).
  electroKick: {
    planRole: "source",
    planFreeRun: true,
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Trigger", "Accent"],
    inputLabels: {
      Trigger: "Trig",
      Accent: "Acc"
    },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "50",
        key: "pitch",
        kind: "frequency",
        label: "Pitch",
        max: "200",
        maxDigits: 4,
        mid: "50",
        min: "10",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — kick fundamental / start pitch."
      },
      {
        defaultValue: "0.35",
        key: "decay",
        label: "Decay",
        max: "2",
        mid: "0.35",
        min: "0.01",
        step: "any",
        unit: "s",
        tooltip: "Under construction — body decay time."
      },
      {
        defaultValue: "0.5",
        key: "punch",
        label: "Punch",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction — click / attack amount."
      },
      {
        defaultValue: "1",
        key: "level",
        label: "Level",
        max: "1",
        mid: "1",
        min: "0",
        step: "any",
        tooltip: "Under construction — output level."
      },
    ]
  },
  electroSnare: {
    planRole: "source",
    planFreeRun: true,
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Trigger", "Accent"],
    inputLabels: {
      Trigger: "Trig",
      Accent: "Acc"
    },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "180",
        key: "tone",
        kind: "frequency",
        label: "Tone",
        max: "2000",
        maxDigits: 4,
        mid: "180",
        min: "40",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — snare body / tone pitch."
      },
      {
        defaultValue: "0.2",
        key: "decay",
        label: "Decay",
        max: "2",
        mid: "0.2",
        min: "0.01",
        step: "any",
        unit: "s",
        tooltip: "Under construction — snare decay time."
      },
      {
        defaultValue: "0.65",
        key: "noise",
        label: "Noise",
        max: "1",
        mid: "0.65",
        min: "0",
        step: "any",
        tooltip: "Under construction — noise / snare-wire amount."
      },
      {
        defaultValue: "1",
        key: "level",
        label: "Level",
        max: "1",
        mid: "1",
        min: "0",
        step: "any",
        tooltip: "Under construction — output level."
      },
    ]
  },
  electroHat: {
    planRole: "source",
    planFreeRun: true,
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Trigger", "Accent"],
    inputLabels: {
      Trigger: "Trig",
      Accent: "Acc"
    },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0.08",
        key: "decay",
        label: "Decay",
        max: "2",
        mid: "0.08",
        min: "0.005",
        step: "any",
        unit: "s",
        tooltip: "Under construction — hat decay (closed short / open longer)."
      },
      {
        defaultValue: "0.7",
        key: "tone",
        label: "Tone",
        max: "1",
        mid: "0.7",
        min: "0",
        step: "any",
        tooltip: "Under construction — brightness / metal tone."
      },
      {
        defaultValue: "0",
        key: "open",
        label: "Open",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction — closed (0) ↔ open (1) character."
      },
      {
        defaultValue: "1",
        key: "level",
        label: "Level",
        max: "1",
        mid: "1",
        min: "0",
        step: "any",
        tooltip: "Under construction — output level."
      },
    ]
  },
  // Under construction
  formantFilter: {
    planRole: "processor",
    inputAliases: {Mono: "In",
      Freq: "f", Frequency: "f", F: "f", "ƒ": "f"},
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "500",
        key: "formant",
        kind: "frequency",
        label: "Formant",
        max: "5000",
        mid: "500",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — formant center (placeholder)."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // Under construction — distinct from the existing approximated Bessel filter.
  besselThomson: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — Bessel–Thomson cutoff / delay frequency.",
      },
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "order",
        label: "Order",
        max: "8",
        mid: "4",
        min: "2",
        nonlinearSlider: false,
        step: "2",
        tooltip: "Under construction — Bessel–Thomson order.",
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // Under construction — 2nd-order mass–spring–damper analog.
  massSpringDamper: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — natural frequency √(k/m).",
      },
      {
        defaultValue: "0.5",
        key: "damping",
        label: "Damping",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — damper / zeta.",
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  binaryClock: {
    planRole: "source",
    outputs: ["Out", "Bit0", "Bit1", "Bit2", "Bit3", "Gate"],
    parameters: [
      {
        defaultValue: "2",
        key: "rate",
        label: "Rate",
        max: "64",
        mid: "2",
        min: "0.01",
        nonlinearSlider: false,
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — binary counter clock rate."
      },
      {
        defaultValue: "4",
        key: "bits",
        label: "Bits",
        max: "4",
        mid: "4",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — number of bit outputs."
      },
    ]
  },
  // Under construction: space-controlled controller (Controller shelf).
  theremin: {
    planRole: "source",
    planFreeRun: true,
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    // Planned: proximity / hand CV in; audio + pitch/volume CV out.
    inputs: ["X", "Y", "Gate"],
    inputLabels: {
      X: "X",
      Y: "Y",
      Gate: "Gate"
    },
    outputs: ["Out", "Pitch", "Volume"],
    parameters: [
      {
        defaultValue: "440",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — base pitch / center of the theremin range."
      },
      {
        defaultValue: "1",
        key: "range",
        label: "Range",
        max: "4",
        mid: "1",
        min: "0.1",
        step: "any",
        unit: "oct",
        tooltip: "Under construction — playable pitch span in octaves."
      },
      {
        defaultValue: "0.8",
        key: "volume",
        label: "Volume",
        max: "1",
        mid: "0.8",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — output level (later driven by proximity / Y)."
      },
    ]
  },
  // Under construction: Open Sound Control bridge (Controller shelf).
  osc: {
    planRole: "source",
    planFreeRun: true,
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    // Planned: local CV / gate into network; receive path → CV outs.
    inputs: ["In", "Gate"],
    inputLabels: {
      In: "In",
      Gate: "Gate"
    },
    outputs: ["Out", "X", "Y", "Gate"],
    parameters: [
      {
        defaultValue: "9000",
        key: "port",
        label: "Port",
        max: "65535",
        mid: "9000",
        min: "1",
        step: "1",
        tooltip: "Under construction — UDP port for OSC send/receive."
      },
      {
        defaultValue: "0",
        key: "host",
        label: "Host",
        max: "1",
        mid: "0",
        min: "0",
        step: "1",
        tooltip: "Under construction — destination host index / local bind mode (placeholder)."
      },
      {
        defaultValue: "0.5",
        key: "value",
        label: "Value",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — manual float for send tests until network routing lands."
      },
    ]
  },
  // Under construction: multi-frame wavetable oscillators (Oscillator shelf).
  wavetable2d: {
    planRole: "source",
    planFreeRun: true,
    displayType: "trace",
    inputs: ["0.1V/Oct", "Freq", "Position"],
    inputLabels: {
      "0.1V/Oct": "0.1V"
    },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "100",
        key: "freq",
        kind: "frequency",
        label: "Freq",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — wavetable playback frequency."
      },
      {
        defaultValue: "0",
        key: "position",
        label: "Position",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — morph position across the 2D wavetable (frame / scan)."
      },
      {
        defaultValue: "1",
        key: "amp",
        label: "Amplitude",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — output level."
      },
    ]
  },
  wavetable3d: {
    planRole: "source",
    planFreeRun: true,
    displayType: "trace",
    inputs: ["0.1V/Oct", "Freq", "X", "Y"],
    inputLabels: {
      "0.1V/Oct": "0.1V"
    },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "100",
        key: "freq",
        kind: "frequency",
        label: "Freq",
        max: "20000",
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — 3D wavetable playback frequency."
      },
      {
        defaultValue: "0",
        key: "posX",
        label: "X",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — X morph across the 3D wavetable volume."
      },
      {
        defaultValue: "0",
        key: "posY",
        label: "Y",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — Y morph across the 3D wavetable volume."
      },
      {
        defaultValue: "1",
        key: "amp",
        label: "Amplitude",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — output level."
      },
    ]
  },
  // Under construction: RGB pixel-grid experiments (shelf card only for now).
  pixelGrid: {
    planRole: "monitor",
    visualSink: true,
    inputs: [],
    outputs: [],
    parameters: []
  },
  // Under construction: flexible multi-point control grid (Modulator shelf).
  flexGrid: {
    planRole: "source",
    planFreeRun: true,
    displayType: "trace",
    displayModes: [
      { key: "trace", renderer: "trace", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
    ],
    inputs: ["Clock", "Reset"],
    outputs: ["Out", "X", "Y"],
    parameters: [
      {
        defaultValue: "4",
        key: "cols",
        label: "Cols",
        max: "16",
        mid: "4",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — planned grid columns for multi-point control."
      },
      {
        defaultValue: "4",
        key: "rows",
        label: "Rows",
        max: "16",
        mid: "4",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — planned grid rows for multi-point control."
      },
      {
        defaultValue: "1",
        key: "rate",
        kind: "frequency",
        label: "Rate",
        max: "40",
        mid: "1",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — planned scan / morph rate across the flex grid."
      },
    ]
  },
  // Under construction: Chaosfly attractor (Chaos shelf).
  chaosfly: {
    planRole: "source",
    planFreeRun: true,
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { x: "X", y: "Y" } },
    ],
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "Z", kind: "scalar" },
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Rate"],
    outputs: ["Out", "X", "Y", "Z"],
    parameters: [
      {
        defaultValue: "1",
        key: "rate",
        label: "Rate",
        max: "20",
        mid: "1",
        min: "0",
        step: "any",
        tooltip: "Under construction — planned Chaosfly integration / fly speed."
      },
      {
        defaultValue: "0.5",
        key: "chaos",
        label: "Chaos",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — planned Chaosfly chaos / wing-spread amount."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip: "Under construction — output scale."
      },
    ]
  },
  // Under construction: few-body gravity (Chaos shelf). First Doppler piece.
  gravity: {
    planRole: "source",
    planFreeRun: true,
    displayType: "lineBurn",
    displayModes: [
      { key: "lineBurn", renderer: "lineBurn", source: { x: "X", y: "Y" } },
    ],
    displaySignals: [
      { key: "X", kind: "scalar" },
      { key: "Y", kind: "scalar" },
      { key: "Radial", kind: "scalar" },
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Reset"],
    outputs: ["Out", "X", "Y", "Radial"],
    outputTooltips: {
      Radial: "Planned signed radial velocity toward the listener — first Doppler puzzle piece.",
    },
    parameters: [
      {
        defaultValue: "8",
        key: "bodies",
        label: "Bodies",
        max: "64",
        mid: "8",
        min: "2",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — planned particle count (few bodies, phosphor orbits)."
      },
      {
        defaultValue: "1",
        key: "g",
        label: "G",
        max: "8",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — planned gravitational strength."
      },
      {
        defaultValue: "0.05",
        key: "soften",
        label: "Soften",
        max: "1",
        mid: "0.05",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — planned Plummer softening to avoid 1/r² blowups."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip: "Under construction — output scale."
      },
    ]
  },
  // Under construction: Drummer (Sequence shelf).
  drummer: {
    planRole: "source",
    planFreeRun: true,
    displayType: "trace",
    displayModes: [
      { key: "trace", renderer: "trace", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
      { key: "Kick", kind: "scalar" },
      { key: "Snare", kind: "scalar" },
      { key: "Hat", kind: "scalar" },
      { key: "Gate", kind: "scalar" },
    ],
    inputs: ["Clock", "Reset"],
    outputs: ["Out", "Kick", "Snare", "Hat", "Gate"],
    parameters: [
      {
        defaultValue: "120",
        key: "tempo",
        label: "Tempo",
        max: "300",
        mid: "120",
        min: "20",
        step: "any",
        unit: "BPM",
        tooltip: "Under construction — planned Drummer tempo (BPM)."
      },
      {
        defaultValue: "0.5",
        key: "swing",
        label: "Swing",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — planned groove / swing amount."
      },
      {
        defaultValue: "1",
        key: "density",
        label: "Density",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction — planned hit density / fill amount."
      },
    ]
  },
  // Under construction: Arp (Musical shelf).
  arp: {
    planRole: "source",
    planFreeRun: true,
    displayType: "trace",
    displayModes: [
      { key: "trace", renderer: "trace", source: { value: "Pitch" } },
    ],
    displaySignals: [
      { key: "Pitch", kind: "scalar" },
      { key: "Gate", kind: "scalar" },
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Pitch", "Gate", "Clock", "Reset"],
    outputs: ["Out", "Pitch", "Gate"],
    parameters: [
      {
        choices: ["Up", "Down", "Up/Down", "Order", "Random"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "4",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — planned arpeggiator pattern mode."
      },
      {
        defaultValue: "8",
        key: "rate",
        label: "Rate",
        max: "64",
        mid: "8",
        min: "0.25",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction — planned arp step rate (or clock divide)."
      },
      {
        defaultValue: "1",
        key: "octaves",
        label: "Octaves",
        max: "4",
        mid: "1",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — planned octave range of the arpeggio."
      },
    ]
  },
  // Under construction: GM Electric Piano 1 = program 5 (Sample Player).
  ePiano: {
    planRole: "source",
    planFreeRun: true,
    displayType: "trace",
    displayModes: [
      { key: "trace", renderer: "trace", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Pitch", "Gate", "Velocity"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "5",
        key: "program",
        label: "Program",
        max: "128",
        mid: "5",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — GM program (5 = Electric Piano 1)."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip: "Under construction — output level."
      },
    ]
  },
  // Under construction: GM percussion = channel 10 (Sample Player).
  percussion: {
    planRole: "source",
    planFreeRun: true,
    displayType: "trace",
    displayModes: [
      { key: "trace", renderer: "trace", source: { value: "Out" } },
    ],
    displaySignals: [
      { key: "Out", kind: "scalar" },
    ],
    inputs: ["Note", "Gate", "Velocity"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "10",
        key: "channel",
        label: "Channel",
        max: "16",
        mid: "10",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — GM MIDI channel (10 = percussion / drum kit)."
      },
      {
        defaultValue: "1",
        key: "kit",
        label: "Kit",
        max: "128",
        mid: "1",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Under construction — drum kit program on the percussion channel (1 = Standard Kit)."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip: "Under construction — output level."
      },
    ]
  },
  cookbookFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: nodeGraphCookbookFilterModes,
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "9",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "When ƒ is wired, that Hz is the cutoff. Unwired uses this knob. 0 allowed. Circuit floors tiny values for coefficient stability only."
      },
      {
        constraint: "cpu",
        defaultValue: "2",
        key: "stages",
        label: "Stages",
        max: "5",
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1",
        key: "q",
        label: "Q",
        max: "10",
        mid: "1",
        min: "0.1",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "0",
        key: "gain",
        label: "Gain",
        max: "24",
        mid: "0",
        min: "-24",
        nonlinearSlider: false,
        showSign: true,
        step: "any",
        unit: "dB"
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // Defacto active ladder (Robin Schmidt RS-MET). Real Hz cutoff — no FMD 0–1 map.
  activeFilter: nodeGraphActiveFilterDefinition,
  yellowjacketFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      { defaultValue: "0.5", key: "frequency", label: "Frequency", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.2", key: "resonance", label: "Resonance", max: "1", mid: "0.2", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "chaos", label: "Chaos", max: "1", mid: "0.1", min: "0", nonlinearSlider: false, step: "any" },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  superloveFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["LP18", "LP24", "HP6", "BP6"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "3",
        mid: "1.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { defaultValue: "0.5", key: "frequency", label: "Frequency", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.2", key: "resonance", label: "Resonance", max: "1", mid: "0.2", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.5", key: "chaos", label: "Chaos", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  chaoticPhaseLockingFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      { defaultValue: "0.5", key: "frequency", label: "Frequency", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.2", key: "resonance", label: "Resonance", max: "1", mid: "0.2", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "chaos", label: "Chaos", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // Complex 2-pole ring: ping-stable, decay in seconds, rings at Frequency. Not the character Resonator Filter.
  modeResonator: {
    planRole: "processor",
    inputAliases: { Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputs: ["In", "Trigger", "0.1V/Oct", "f"],
    inputLabels: { "0.1V/Oct": "0.1V", f: "ƒ" },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "440",
        key: "frequency",
        kind: "frequency",
        label: "Resonant Freq",
        max: "20000",
        maxDigits: 5,
        mid: "440",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Rings at this frequency: complex poles at r·e^{±jω} with ω = 2πf/fs. When ƒ is wired, that Hz is the ring (absolute). Unwired uses this knob, tracked by 0.1V/Oct."
      },
      {
        defaultValue: "1",
        key: "decay",
        kind: "time",
        label: "Decay",
        max: "60",
        maxDigits: 5,
        mid: "1",
        min: "0.001",
        step: "any",
        unit: "s",
        tooltip:
          "Time in seconds for the ring envelope to fall to 1/e (~37%). Meaningful seconds: 0.1 = short pluck, 1 = long metallic, 10 = very long. Hold forces undamped (r = 1)."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "hold",
        label: "Hold",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "On = undamped ring (r = 1): after excitation the mode holds a pure sinusoid forever."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip: "Impulse-normalized level: peak ring envelope stays roughly constant across Frequency × Decay."
      },
    ]
  },
  // Delay+feedback comb: pitch from delay D=fs/f0. Sibling of Mode Resonator (poles vs delay loop).
  combResonator: {
    planRole: "processor",
    inputAliases: { Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputs: ["In", "Trigger", "0.1V/Oct", "f"],
    inputLabels: { "0.1V/Oct": "0.1V", f: "ƒ" },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "110",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "110",
        min: "10",
        step: "any",
        unit: "Hz",
        tooltip:
          "Pitch of the comb: delay D = fs/f (fractional). When ƒ is wired, that Hz is the pitch (absolute). Unwired uses this knob, tracked by 0.1V/Oct."
      },
      {
        defaultValue: "1",
        key: "decay",
        kind: "time",
        label: "Decay",
        max: "60",
        maxDigits: 5,
        mid: "1",
        min: "0.001",
        step: "any",
        unit: "s",
        tooltip:
          "Feedback only: wall-clock seconds for the loop envelope to fall to 1/e. g = exp(−D/(τ·fs)) with D = fs/f. Hold ≈ undamped. Unused in Feedforward."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "hold",
        label: "Hold",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Feedback only: g ≈ 1 (sustained loop). No loop DC block (keeps Decay accurate). Positive polarity + DC input can accumulate — HP after if needed."
      },
      {
        defaultValue: "0",
        key: "damping",
        label: "Damping",
        max: "1",
        mid: "0.35",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Feedback only: one-pole lowpass in the loop (Karplus–Strong style). 0 = bright pure comb, 1 = dark / faster high-partial loss."
      },
      {
        choices: ["Feedback", "Feedforward"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "topology",
        label: "Topology",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Feedback = recursive comb (resonates / can sustain). Feedforward = FIR color only (notches/peaks, no self-resonance)."
      },
      {
        choices: ["+", "−"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "invert",
        label: "Polarity",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "+ = delayed term added (peaks at k·f). − = subtracted (peaks at odd half-multiples)."
      },
      {
        defaultValue: "1",
        key: "depth",
        label: "Depth",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Feedforward only: amount of delayed input mixed in (0 = dry, 1 = full comb color). Ignored in Feedback."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip: "Input scale before the comb (impulse / audio / Trigger)."
      },
    ]
  },
  // Under construction: classic modulation / spectral FX shells (dry passthrough).
  phaser: {
    planRole: "processor",
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0.2",
        key: "rate",
        label: "Rate",
        max: "20",
        mid: "0.2",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction. Planned: LFO rate for all-pass notch sweep."
      },
      {
        defaultValue: "0.5",
        key: "depth",
        label: "Depth",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction. Planned: modulation depth of center frequency."
      },
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "stages",
        label: "Stages",
        max: "16",
        mid: "4",
        min: "1",
        step: "1",
        tooltip: "Under construction. Planned: number of all-pass stages."
      },
      {
        defaultValue: "0.5",
        key: "feedback",
        label: "Feedback",
        max: "0.95",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction. Planned: regenerative feedback."
      },
      {
        defaultValue: "0.5",
        key: "mix",
        label: "Mix",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction. Planned: dry/wet."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  flanger: {
    planRole: "processor",
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0.2",
        key: "rate",
        label: "Rate",
        max: "20",
        mid: "0.2",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction. Planned: LFO rate for delay modulation."
      },
      {
        defaultValue: "0.5",
        key: "depth",
        label: "Depth",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction. Planned: delay-time modulation amount."
      },
      {
        defaultValue: "0.005",
        key: "delay",
        kind: "time",
        label: "Delay",
        max: "0.02",
        mid: "0.005",
        min: "0.0001",
        step: "any",
        unit: "s",
        tooltip: "Under construction. Planned: base delay (short comb region)."
      },
      {
        defaultValue: "0.5",
        key: "feedback",
        label: "Feedback",
        max: "0.95",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction. Planned: regenerative feedback."
      },
      {
        defaultValue: "0.5",
        key: "mix",
        label: "Mix",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction. Planned: dry/wet."
      },
    ]
  },
  chorus: {
    planRole: "processor",
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0.5",
        key: "rate",
        label: "Rate",
        max: "10",
        mid: "0.5",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction. Planned: LFO rate."
      },
      {
        defaultValue: "0.4",
        key: "depth",
        label: "Depth",
        max: "1",
        mid: "0.4",
        min: "0",
        step: "any",
        tooltip: "Under construction. Planned: delay modulation depth."
      },
      {
        constraint: "cpu",
        defaultValue: "2",
        key: "voices",
        label: "Voices",
        max: "8",
        mid: "2",
        min: "1",
        step: "1",
        tooltip: "Under construction. Planned: parallel modulated delay voices."
      },
      {
        defaultValue: "0.5",
        key: "mix",
        label: "Mix",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Under construction. Planned: dry/wet."
      },
    ]
  },
  bode: {
    planRole: "processor",
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0",
        key: "shift",
        label: "Shift",
        max: "5000",
        mid: "0",
        min: "-5000",
        step: "any",
        unit: "Hz",
        tooltip: "Frequency shift Δf in Hz (through-zero). Adds Δ to every partial — breaks harmonic ratios (not pitch shift)."
      },
      {
        defaultValue: "0",
        key: "fine",
        label: "Fine",
        max: "50",
        mid: "0",
        min: "-50",
        step: "any",
        unit: "Hz",
        tooltip: "Fine shift offset in Hz, added to Shift."
      },
      {
        defaultValue: "0",
        key: "feedback",
        label: "Feedback",
        max: "0.95",
        mid: "0",
        min: "0",
        step: "any",
        tooltip: "Regenerative feedback of the shifted signal into the input (classic Bode spice)."
      },
      {
        defaultValue: "1",
        key: "mix",
        label: "Mix",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Dry/wet blend. 1 = fully shifted."
      },
    ]
  },
  phaseDisperse: {
    planRole: "processor",
    inputAliases: { Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { f: "ƒ" },
    inputs: ["In", "f"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "100",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "100",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip:
          "Allpass corner (group-delay focus). When ƒ is wired, that Hz is the corner. Unwired uses this knob. Default slider 0…20 kHz — not hard-clamped."
      },
      {
        // Cascade depth: each step is one 2nd-order allpass (biquad). Cost is
        // O(filters) per sample on the audio thread — mark for CPU debug overlay.
        constraint: "cpu",
        defaultValue: "32",
        key: "filters",
        label: "Filters",
        max: "64",
        mid: "32",
        min: "1",
        step: "1",
        tooltip:
          "Number of cascaded 2nd-order allpass stages (1…64). More filters = deeper group-delay smear, higher CPU. Legacy patches with Amount 0…1 are remapped here."
      },
      {
        defaultValue: "0.5",
        key: "pinch",
        label: "Pinch",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Q of each allpass: high Pinch concentrates group delay in a narrow band around Frequency."
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  stftBlur: {
    planRole: "processor",
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0.5",
        key: "blurTime",
        label: "Blur Time",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Temporal spectral smear: holds magnitudes across STFT frames (0 = instant, 1 = long wash / freeze-ish)."
      },
      {
        defaultValue: "0",
        key: "blurFreq",
        label: "Blur Freq",
        max: "1",
        mid: "0",
        min: "0",
        step: "any",
        tooltip: "Smear energy across neighboring FFT bins (0 = sharp spectrum, 1 = wide frequency wash)."
      },
      {
        constraint: "cpu",
        defaultValue: "2048",
        key: "fftSize",
        label: "FFT Size",
        max: "4096",
        mid: "2048",
        min: "256",
        step: "1",
        tooltip: "STFT window length (snapped to power of two, 256–4096). Larger = finer freq, more latency/CPU."
      },
      {
        defaultValue: "1",
        key: "mix",
        label: "Mix",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        tooltip: "Dry/wet. Dry is delayed to match STFT latency so the blend stays time-aligned."
      },
    ]
  },
  // Under construction: physical waveguide model (beyond Comb). Passthrough until implemented.
  waveguide: {
    planRole: "processor",
    inputs: ["In", "Trigger", "0.1V/Oct"],
    inputLabels: { "0.1V/Oct": "0.1V" },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "110",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "110",
        min: "10",
        step: "any",
        unit: "Hz",
        tooltip: "Under construction. Planned: waveguide pitch from loop delay (like Comb, with physical loss/dispersion)."
      },
      {
        defaultValue: "1",
        key: "decay",
        kind: "time",
        label: "Decay",
        max: "60",
        maxDigits: 5,
        mid: "1",
        min: "0.001",
        step: "any",
        unit: "s",
        tooltip: "Under construction. Planned: wall-clock seconds to 1/e of the waveguide loop envelope."
      },
      {
        defaultValue: "0.25",
        key: "loss",
        label: "Loss",
        max: "1",
        mid: "0.25",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction. Planned: termination / loop lowpass loss (brightness vs sustain)."
      },
      {
        defaultValue: "0",
        key: "dispersion",
        label: "Dispersion",
        max: "1",
        mid: "0.25",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Under construction. Planned: stiffness / allpass dispersion (inharmonic partials, bars/stiff strings)."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip: "Under construction. Currently scales dry passthrough only."
      },
    ]
  },
  resonatorFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["Sinusoid", "Triangle", "Sawtooth"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { defaultValue: "0.5", key: "frequency", label: "Frequency", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.2", key: "resonance", label: "Resonance", max: "1", mid: "0.2", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "chaos", label: "Chaos", max: "1", mid: "0.1", min: "0", nonlinearSlider: false, step: "any" },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  humanFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["BP6", "LP6", "LP12"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { defaultValue: "0.5", key: "frequency", label: "Frequency", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.2", key: "resonance", label: "Resonance", max: "1", mid: "0.2", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "chaos", label: "Chaos", max: "1", mid: "0.1", min: "0", nonlinearSlider: false, step: "any" },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  pulseExplosion: {
    planRole: "processor",
    inputs: ["Trigger"],
    outputs: ["Out", "Curve"],
    layout: "pulseCurve",
    parameters: [
      { defaultValue: "0", key: "startTime", label: "Start Time", max: "10", mid: "1", min: "0", nonlinearSlider: false, step: "any", unit: "s" },
      { defaultValue: "0.5", key: "centerTime", label: "Center Time", max: "10", mid: "1", min: "0", nonlinearSlider: false, step: "any", unit: "s" },
      { defaultValue: "1", key: "endTime", label: "End Time", max: "10", mid: "1", min: "0", nonlinearSlider: false, step: "any", unit: "s" },
      { defaultValue: "0.3", key: "timeSpread", label: "Time Spread", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { constraint: "cpu", defaultValue: "20", key: "numberOfPulses", label: "Number of Pulses", max: "128", mid: "20", min: "1", nonlinearSlider: false, step: "1" },
      { defaultValue: "0.3", key: "lowAmplitude", label: "Low Amplitude", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "highAmplitude", label: "High Amplitude", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "seed", label: "Seed", max: "999999", mid: "1", min: "0", nonlinearSlider: false, step: "1" },
    ]
  },
  flowerChildFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: ["Clean", "Dirty", "Rev3", "Downsampled"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "3",
        mid: "1.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "0.5",
        key: "frequency",
        label: "Frequency",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "0.2",
        key: "resonance",
        label: "Resonance",
        max: "1",
        mid: "0.2",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "0",
        key: "chaos",
        label: "Chaos",
        max: "1",
        mid: "0.1",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  ladderFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: nodeGraphLadderFilterModes,
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "3",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1000",
        key: "frequency",
        kind: "frequency",
        label: "Frequency",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz"
      },
      {
        defaultValue: "0.2",
        key: "resonance",
        label: "Resonance",
        max: "0.999",
        maxDigits: 5,
        mid: "0.2",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        constraint: "cpu",
        defaultValue: "4",
        key: "stages",
        label: "Stages",
        max: "4",
        mid: "4",
        min: "1",
        nonlinearSlider: false,
        step: "1"
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  tb303Filter: {
    planRole: "processor",
    inputAliases: { Mono: "In", Freq: "f", Frequency: "f", F: "f", "ƒ": "f" },
    inputLabels: { In: "Mono", f: "ƒ" },
    inputs: ["In", "Left", "Right", "f"],
    layout: "filterCurve",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        choices: nodeGraphTb303FilterModes,
        defaultValue: "4",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "14",
        mid: "4",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1000",
        key: "cutoff",
        kind: "frequency",
        label: "Cutoff",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "When ƒ is wired, that Hz is the cutoff. Unwired uses this knob. 0 allowed (frozen). No hardware 200 Hz floor."
      },
      {
        defaultValue: "0",
        key: "resonance",
        label: "Resonance",
        max: "100",
        maxDigits: 5,
        mid: "50",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "%"
      },
      {
        defaultValue: "0",
        key: "drive",
        kind: "decibels",
        label: "Drive",
        max: "24",
        maxDigits: 5,
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "dB"
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  delayEffect: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    // Mix = Mix M mono sum of Mix L/R: (L+R)*0.5 (house convention).
    // Legacy Dry/Wet/Out map to Mix so old wires keep a dry/wet blend signal.
    outputAliases: {
      Mono: "Mix",
      Out: "Mix",
      Wet: "Mix",
      Dry: "Mix"
    },
    outputLabels: {
      Mix: "Mix M",
      Left: "Mix L",
      Right: "Mix R"
    },
    outputs: ["Mix", "Left", "Right"],
    parameters: [
      { defaultValue: "0.18", key: "time", kind: "time", label: "Time", max: "4", maxDigits: 5, mid: "0.18", min: "0.001", step: "any", unit: "s" },
      {
        defaultValue: "0.25",
        key: "feedback",
        label: "Feedback",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Regen into the delay line. Range 0–1 (clamped in DSP so tails stay stable)."
      },
      { defaultValue: "0.35", key: "mix", label: "Mix", max: "1", mid: "0.35", min: "0", nonlinearSlider: false, step: "any" },
      {
        choices: ["Parabol", "Random Walk", "FBM"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "modStyle",
        label: "Mod Style",
        linearSmoothing: false,
        max: "2",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Delay-time modulator shape (same family as Ping Pong / SoEmReverb). Parabol = smooth cyclic wow. Random Walk = filtered stepped drift. FBM = fractal Brownian organic flutter."
      },
      { defaultValue: "0.02", key: "modAmount", label: "Mod", max: "0.5", maxDigits: 5, mid: "0.02", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.1", key: "modRate", kind: "frequency", label: "Mod Rate", max: "90", maxDigits: 5, mid: "0.1", min: "0", step: "any", unit: "Hz" },
      { defaultValue: "0", key: "modVariation", label: "Variation", max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "any" },
      {
        choices: ["Linear", "Hermite"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "interpolation",
        label: "Interp",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Delay-line fractional read. Linear only for now (Hermite parked — CPU experiment)."
      },
      {
        defaultValue: "1",
        key: "inLevel",
        label: "InLevel",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Gain into the delay (before the delay line / feedback loop)."
      },
      {
        defaultValue: "1",
        key: "outLevel",
        label: "OutLevel",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Output gain after dry/wet mix (Mix M / Mix L / Mix R). Legacy patches with Level map here."
      },
    ]
  },
  pingPongDelay: {
    planRole: "processor",
    // Stereo Trace face (Output-style L/R colors): Mod L/R = delay tap times
    // normalized so ±1 spans the full max delay the module supports.
    displayType: "trace",
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    stereoTracePorts: { left: "Mod L", right: "Mod R" },
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    // Audio L/R + modulator traces (scope / dual-connect friendly names).
    outputs: ["Left", "Right", "Mod L", "Mod R"],
    outputLabels: {
      "Mod L": "Mod L",
      "Mod R": "Mod R"
    },
    parameters: [
      // Tap = Numer/Denom × whole note (4 beats). Numer=1 Denom=16 → 1/16 note.
      // Keys stay timeNumerator/timeDenominator (same math); labels were X/Y and hid that.
      {
        control: "number",
        defaultValue: "1",
        key: "timeNumerator",
        label: "Numer",
        linearSmoothing: false,
        max: "64",
        maxDigits: 2,
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Numerator of Numer/Denom × whole note. Numer=0 → no delay. Examples with Denom: 1/4 note = 1÷4, 1/8 = 1÷8, 1/16 = 1÷16, 1/32 = 1÷32."
      },
      {
        control: "number",
        defaultValue: "4",
        key: "timeDenominator",
        label: "Denom",
        linearSmoothing: false,
        max: "64",
        maxDigits: 2,
        mid: "8",
        min: "1",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Denominator of Numer/Denom × whole note. Denom=0 is treated as 1 in DSP. At Numer=1: Denom 4=¼, 8=⅛, 16=1/16, 32=1/32, 64=1/64."
      },
      {
        choices: ["Normal", "Dotted", "Triplet"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "timingMode",
        label: "Sync",
        linearSmoothing: false,
        max: "2",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Normal = Numer/Denom as written. Dotted = 1.5× that length. Triplet = 2/3× (three fit in two normals)."
      },
      {
        defaultValue: "0",
        key: "tapOffsetMs",
        kind: "time",
        label: "Offset",
        max: "500",
        maxDigits: 5,
        // Nonlinear: more throw near 0 (fine stereo skew / small time offsets).
        mid: "20",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        unit: "ms",
        tooltip:
          "Static stereo offset (ms): adds to the Right tap relative to the tempo base (Left stays on base + LFO). "
          + "0 = L/R share the same base time. Nonlinear near 0 for fine control."
      },
      {
        defaultValue: "0",
        key: "offsetMs",
        kind: "time",
        label: "LFO Amp",
        max: "500",
        maxDigits: 5,
        mid: "25",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "ms",
        tooltip:
          "LFO depth: max L/R delay drift (ms) around each side’s base (base + Offset on R). Independent LFO on each side swings −amp…+amp. 0 = no LFO motion."
      },
      {
        choices: ["Parabol", "Random Walk", "FBM"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "lfoStyle",
        label: "LFO Style",
        linearSmoothing: false,
        max: "2",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Independent L and R delay-time modulators. Parabol = smooth cyclic wow. Random Walk = filtered stepped drift. FBM = fractal Brownian organic flutter."
      },
      {
        defaultValue: "0.35",
        key: "lfoRate",
        kind: "frequency",
        label: "LFO Rate",
        max: "20",
        mid: "0.35",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "How fast each side’s delay drifts within Offset. 0 freezes current L/R times."
      },
      {
        defaultValue: "0.25",
        key: "lfoVariation",
        label: "LFO Vary",
        max: "1",
        mid: "0.25",
        min: "0",
        step: "any",
        tooltip: "Detunes L vs R LFO rates so the two delays don’t lock together."
      },
      {
        defaultValue: "1",
        key: "saturate",
        label: "Saturate",
        max: "4",
        mid: "1",
        min: "0.01",
        step: "any",
        tooltip:
          "SoEm-style soft clip in the feedback path (tape grunge). Lower = harder saturation; higher = cleaner."
      },
      {
        defaultValue: "8000",
        key: "lpfFrequency",
        kind: "frequency",
        label: "LPF Freq",
        max: "20000",
        mid: "8000",
        min: "20",
        step: "any",
        unit: "Hz",
        tooltip: "Passive one-pole lowpass in the feedback loop (darkens repeats)."
      },
      {
        defaultValue: "20",
        key: "hpfFrequency",
        kind: "frequency",
        label: "HPF Freq",
        max: "2000",
        mid: "20",
        min: "1",
        step: "any",
        unit: "Hz",
        tooltip: "Passive one-pole highpass in the feedback loop (thins mud / DC)."
      },
      // No code clamp below this — soft clip (Saturate) is the limiter. >1 = self-osc / tape cook.
      {
        defaultValue: "0.35",
        key: "feedback",
        label: "Feedback",
        max: "4",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip:
          "Feedback amount into the saturated tape loop. Not hard-capped in DSP — Saturate soft-clips the path. >1 can self-oscillate."
      },
      { defaultValue: "0.35", key: "mix", label: "Mix", max: "1", mid: "0.35", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      {
        choices: ["Linear", "Hermite"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "interpolation",
        label: "Interp",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Delay-line fractional read. Linear only for now (Hermite parked — CPU experiment)."
      },
    ]
  },
  wallDelay: {
    planRole: "processor",
    layout: "wallRoomDisplay",
    inputs: ["In"],
    outputs: ["Left", "Right"],
    parameters: [
      { choices: ["Squircle", "Random", "Fractal"], defaultValue: "0", displayChoices: true, divideChoicesVisibly: true, key: "roomPreset", label: "Room", linearSmoothing: false, max: "2", mid: "0", min: "0", nonlinearSlider: false, step: "1", tooltip: "Preset room shape sampled by the wireframe display below. Squircle blends continuously between an ellipsoid and a box via Roundness; Random and Fractal perturb that same elliptical base per direction using Seed." },
      { defaultValue: "1", key: "roomWidth", label: "Width", max: "2", mid: "1", min: "0.2", nonlinearSlider: false, step: "any", tooltip: "Room proportion along X/Z (the floor footprint), relative to Scale. Applies to all room presets, not just Squircle." },
      { defaultValue: "1", key: "roomHeight", label: "Height", max: "2", mid: "1", min: "0.2", nonlinearSlider: false, step: "any", tooltip: "Room proportion along Y (ceiling height), relative to Scale. Applies to all room presets, not just Squircle." },
      { defaultValue: "4", key: "roomScale", label: "Scale", max: "20", mid: "4", min: "0.5", nonlinearSlider: false, step: "any", unit: "m", tooltip: "Real-world size in meters: Width/Height are proportions (1.0 = default), multiplied by this to get the actual center-to-wall distance in meters that the delay taps' timing is computed from (distance / speed of sound)." },
      { defaultValue: "0.3", key: "roomRoundness", label: "Roundness", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any", tooltip: "0 = perfect ellipsoid (sphere at Width=Height), 1 = a box (cube at Width=Height). Superellipsoid blend, |x/a|^n+|y/b|^n+|z/c|^n=1, only affects the Squircle preset." },
      { defaultValue: "17", key: "earDistance", label: "Ear Distance", max: "60", mid: "17", min: "0", nonlinearSlider: false, step: "any", unit: "cm", tooltip: "Distance between the two listener ears in centimeters (17cm is a typical human head). Each ear samples the room from its own offset position along X, so Left/Right delay taps genuinely differ -- 0 collapses back to a single centered listener (mono)." },
      { control: "number", defaultValue: "0", key: "roomSeed", label: "Seed", linearSmoothing: false, max: "9999", maxDigits: 1, mid: "1", min: "0", nonlinearSlider: false, step: "1", tooltip: "Randomizes the Random/Fractal room shape and each bounce's scatter direction. Same seed always reproduces the same shape and echo pattern." },
      { constraint: "cpu", control: "number", defaultValue: "6", key: "rayCount", label: "Rays", linearSmoothing: false, max: "16", maxDigits: 1, mid: "6", min: "1", nonlinearSlider: false, step: "1", tooltip: "Number of initial directions sampled from each ear (X). Total delay taps = Rays x Bounces." },
      { constraint: "cpu", control: "number", defaultValue: "3", key: "bounceCount", label: "Bounces", linearSmoothing: false, max: "6", maxDigits: 1, mid: "3", min: "1", nonlinearSlider: false, step: "1", tooltip: "Number of wall bounces simulated per ray (Y). Total delay taps = Rays x Bounces." },
      { defaultValue: "0.6", key: "reflectivity", label: "Reflectivity", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any", tooltip: "1 = mirror-like: each bounce reflects off the room's real surface normal, stays coherent, and loses little energy. 0 = rough/absorptive: each bounce scatters into a random direction and energy drops fast -- reads as more diffusion. Also sets the shared diffusion cascade's feedback (1 - Reflectivity)." },
      { defaultValue: "0.5", key: "mix", label: "Mix", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
    ]
  },
  reverbEffect: {
    planRole: "processor",
    planFreeRun: true,
    displayType: "trace",
    // Dry = pure input; Mix = dry/wet blend (no wet-only jacks).
    stereoTracePorts: { left: "Mix L", right: "Mix R" },
    inputs: ["In", "Left", "Right"],
    // Legacy Wet / Left Mix / … → Mix L/R.
    outputAliases: {
      "Wet L": "Mix L",
      "Wet R": "Mix R",
      "Left Mix": "Mix L",
      "Right Mix": "Mix R",
      "Mono Mix": "Mix L",
      "Left Dry": "Dry L",
      "Right Dry": "Dry R",
      "Mono Dry": "Dry L"
    },
    // Dry before Mix (space FX outlet order).
    outputs: ["Dry L", "Dry R", "Mix L", "Mix R"],
    parameters: [
      { defaultValue: "0.43", key: "mix", label: "Mix", max: "1", mid: "0.43", min: "0", nonlinearSlider: false, step: "any", tooltip: "Dry/wet balance on the Mix outputs (not a wet-only path)." },
      { defaultValue: "0.35", key: "diffusionSize", label: "Size", max: "1", mid: "0.35", min: "0", nonlinearSlider: false, smoothingSeconds: 0.05, step: "any", tooltip: "Size of the diffusion network." },
      { defaultValue: "0.70", key: "diffusionAmount", label: "Diffusion", max: "0.98", mid: "0.70", min: "0", nonlinearSlider: false, step: "any", tooltip: "Strength of early diffusion." },
      { defaultValue: "0.02", key: "delaySize", label: "Tape Memry", max: "1", mid: "0.02", min: "0", nonlinearSlider: false, smoothingSeconds: 0.05, step: "any", tooltip: "Main reverb delay length." },
      { defaultValue: "0.70", key: "recycle", label: "Rec", max: "0.98", mid: "0.70", min: "0", nonlinearSlider: false, step: "any", tooltip: "Feedback amount for the reverb tail." },
      { defaultValue: "0.07", key: "lfoAmplitude", label: "Mod()Amp", max: "1", mid: "0.07", min: "0", nonlinearSlider: false, step: "any", tooltip: "Amount of delay modulation." },
      { defaultValue: "0.83", key: "lfoBaseSpeed", label: "Mod()Speed", max: "1", mid: "0.83", min: "0", nonlinearSlider: false, step: "any", tooltip: "Base speed of delay modulation." },
      { defaultValue: "0.001", key: "lfoVariation", label: "Mod()Vary", max: "1", mid: "0.001", min: "0", nonlinearSlider: false, step: "any", tooltip: "Randomized variation in delay modulation." },
      { control: "number", defaultValue: "0", key: "seed", label: "Seed", linearSmoothing: false, max: "99999", maxDigits: 1, mid: "1", min: "0", nonlinearSlider: false, step: "1", tooltip: "Randomizes the delay line pattern. Same seed always reproduces the same reverb character." },
    ]
  },
  soemReverb: {
    planRole: "processor",
    planFreeRun: true,
    // Same stereo Trace face as Output (L/R colors, syncChannel, stereoBlend).
    displayType: "trace",
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    stereoTracePorts: { left: "Mix L", right: "Mix R" },
    inputs: ["Mono", "Left", "Right"],
    // Dry = pure input; Mix = full dry/wet blend (no wet-only jacks).
    outputAliases: {
      "Wet L": "Mix L",
      "Wet R": "Mix R",
      "Left Mix": "Mix L",
      "Right Mix": "Mix R",
      "Mono Mix": "Mix L",
      "Left Dry": "Dry L",
      "Right Dry": "Dry R",
      "Mono Dry": "Dry L"
    },
    outputs: ["Dry L", "Dry R", "Mix L", "Mix R"],
    parameters: [
      { defaultValue: "0.43", key: "mix", label: "Mix", max: "1", mid: "0.43", min: "0", step: "any", tooltip: "Dry/wet balance on the Mix outputs." },
      { defaultValue: "1", key: "volume", label: "Volume", max: "4", mid: "1", min: "0", step: "any" },
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "echoTempoSync",
        label: "Tempo Sync",
        linearSmoothing: false,
        max: "1",
        min: "0",
        step: "1",
        tooltip: "Off = free Echo Time in seconds. On = one beat-derived echo base for both echo L/R (X/Y × Normal|Dotted|Triplet + offset). Diffusion stays free-time."
      },
      {
        defaultValue: "0.35",
        key: "echoTime",
        label: "Echo Time",
        max: "1",
        mid: "0.35",
        min: "0.0001",
        step: "any",
        unit: "s",
        tooltip: "Free-time echo base (seconds). Ignored when Tempo Sync is On."
      },
      {
        control: "number",
        defaultValue: "1",
        key: "timeNumerator",
        label: "X",
        linearSmoothing: false,
        max: "16",
        maxDigits: 1,
        mid: "1",
        min: "0",
        step: "1",
        tooltip: "Numerator of the tempo-synced echo fraction (X/Y of a whole note). Used when Tempo Sync is On."
      },
      {
        control: "number",
        defaultValue: "4",
        key: "timeDenominator",
        label: "Y",
        linearSmoothing: false,
        max: "16",
        maxDigits: 1,
        mid: "4",
        min: "0",
        step: "1",
        tooltip: "Denominator of the tempo-synced echo fraction. X/0 is treated as X/1."
      },
      {
        choices: ["Normal", "Dotted", "Triplet"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "timingMode",
        label: "Beat Mode",
        linearSmoothing: false,
        max: "2",
        min: "0",
        step: "1",
        tooltip: "Normal = X/Y. Dotted = 1.5×. Triplet = 2/3×. Used when Tempo Sync is On."
      },
      {
        defaultValue: "0",
        key: "offsetMs",
        kind: "time",
        label: "Offset",
        max: "500",
        mid: "0",
        min: "-500",
        step: "any",
        unit: "ms",
        tooltip: "Added on top of free or tempo-synced echo base (ms). Good LFO target for push/pull around the beat."
      },
      { defaultValue: "0.5", key: "recycle", label: "Recycle", max: "2", mid: "0.5", min: "0", step: "any" },
      { constraint: "cpu", control: "number", defaultValue: "10", key: "numDelays", label: "Num Delays", max: "12", min: "0", step: "1" },
      { defaultValue: "0.35", key: "diffusionSize", label: "Diffuse Size", max: "1", mid: "0.35", min: "0.0001", step: "any" },
      { defaultValue: "0.7", key: "diffusionAmount", label: "Diffuse Amt", max: "0.98", mid: "0.7", min: "0", step: "any" },
      { control: "number", defaultValue: "500", key: "seed", label: "Seed", max: "999", min: "0", step: "1" },
      { defaultValue: "0.002", key: "lfoAmp", label: "LFO Amp", max: "0.5", mid: "0.002", min: "0", step: "any" },
      { defaultValue: "0.5", key: "lfoFrequency", label: "LFO Speed", max: "90", mid: "0.5", min: "0.1", step: "any", unit: "Hz" },
      { defaultValue: "1", key: "lfoVariation", label: "LFO Vary", max: "10", mid: "1", min: "0", step: "any" },
      {
        choices: ["Parabol", "Random Walk", "FBM"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "lfoStyle",
        label: "LFO Style",
        linearSmoothing: false,
        max: "2",
        min: "0",
        step: "1",
        tooltip: "Delay-time modulator shape. Parabol = smooth cyclic pitch bend. Random Walk = filtered stepped drift. FBM = fractal Brownian motion (organic wow)."
      },
      { choices: ["PostDelay", "PreDelay", "Slapback"], defaultValue: "0", displayChoices: true, key: "echoMode", label: "Delay Mode", max: "2", min: "0", step: "1" },
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "pingPong",
        label: "Ping Pong",
        linearSmoothing: false,
        max: "1",
        min: "0",
        step: "1",
        tooltip: "Off = parallel echo L/R (same side). On = cross-feed delayed tails (L→R→L bounce). Same echo base time on both sides."
      },
      { choices: ["Mod Off", "Mod On"], defaultValue: "1", displayChoices: true, key: "doModulateEcho", label: "Mod Echo", max: "1", min: "0", step: "1" },
      { defaultValue: "1", key: "saturate", label: "Saturate", max: "4", mid: "1", min: "0.01", step: "any" },
      { defaultValue: "8000", key: "lpfFrequency", kind: "frequency", label: "LPF Freq", max: "20000", mid: "8000", min: "20", step: "any", unit: "Hz" },
      { defaultValue: "20", key: "hpfFrequency", kind: "frequency", label: "HPF Freq", max: "2000", mid: "20", min: "1", step: "any", unit: "Hz" },
      { defaultValue: "1000", key: "bandFrequency", kind: "frequency", label: "Band Freq", max: "20000", mid: "1000", min: "20", step: "any", unit: "Hz" },
      { defaultValue: "0", key: "bandDecibels", label: "Band dB", max: "24", mid: "0", min: "-24", step: "any" },
      { defaultValue: "1", key: "bandQ", label: "Band Q", max: "10", mid: "1", min: "0.1", step: "any" },
      { constraint: "cpu", defaultValue: "2", key: "lpfStages", label: "LPF Stages", max: "5", min: "0", step: "1" },
      { constraint: "cpu", defaultValue: "2", key: "bandStages", label: "Band Stages", max: "5", min: "0", step: "1" },
      { defaultValue: "1", key: "duckLimit", label: "Ducking", max: "1", mid: "1", min: "0.01", step: "any" },
      { defaultValue: "0.04", key: "duckRelease", label: "Duck Rel", max: "2", mid: "0.04", min: "0.001", step: "any", unit: "s" },
    ]
  },
  pll: {
    planRole: "processor",
    displaySignals: [
      { key: "VCO Out", kind: "scalar" },
      { key: "PC Out", kind: "scalar" },
      { key: "LPF Out", kind: "scalar" },
      { key: "VCO/PC", kind: "xy" },
    ],
    displayModes: [
      { key: "vcoTrace", label: "VCO Trace", renderer: "trace", settingsSchema: "trace", source: { value: "VCO Out" } },
      { key: "pcTrace", label: "PC Trace", renderer: "trace", settingsSchema: "trace", source: { value: "PC Out" } },
      { key: "lpfTrace", label: "LPF Trace", renderer: "trace", settingsSchema: "trace", source: { value: "LPF Out" } },
      { key: "vcoPcBurn", label: "VCO/PC Phosphor", renderer: "scope2d", settingsSchema: "scope2d", source: { x: "VCO Out", y: "PC Out" } },
    ],
    defaultDisplayMode: "vcoTrace",
    inputs: ["Signal In", "VCO CV In"],
    outputs: ["VCO Out", "PC Out", "LFP Out", "Locked"],
    parameters: [
      { choices: ["Low", "Mid", "High"], defaultValue: "1", displayChoices: true, divideChoicesVisibly: true, key: "range", label: "Range", linearSmoothing: false, max: "2", mid: "1", min: "0", nonlinearSlider: false, step: "1" },
      { defaultValue: "5", key: "offset", label: "Offset", max: "10", mid: "5", min: "0", nonlinearSlider: false, step: "0.01" },
      { choices: ["XOR", "RS Flip", "PFD"], defaultValue: "1", displayChoices: true, divideChoicesVisibly: true, key: "type", label: "PC Type", linearSmoothing: false, max: "2", mid: "1", min: "0", nonlinearSlider: false, step: "1" },
      { defaultValue: "10", key: "frequ", kind: "frequency", label: "LPF Cutoff", max: "200", mid: "10", min: "0.1", step: "any", unit: "Hz" },
    ]
  },
  helmholtzPitch: {
    planRole: "monitor",
    planFreeRun: true,
    // Hybrid face: Frequency = Number Readout LCD; Fidelity = plain text strip.
    layout: "pitchDetector",
    chrome: "LayoutA",
    customDisplayArea: true,
    displayHeightGu: 2,
    displayType: "numberReadout",
    displayModes: [
      {
        key: "numberReadout",
        renderer: "numberReadout",
        settingsSchema: "numberReadout",
        // Own Frequency out → LCD buffer (see capture buffer resolution).
        source: { value: "Frequency" }
      },
    ],
    displaySignals: [
      { key: "Frequency", kind: "scalar" },
      { key: "Fidelity", kind: "scalar" },
      { key: "Gate", kind: "scalar" },
      { key: "Detune", kind: "scalar" },
    ],
    inputs: ["In"],
    // Like badvalMonitor: an analysis/monitor tool should keep running and
    // updating its outputs as soon as something is wired into "In", even if
    // nothing downstream routes to Output -- that's the whole point of a
    // meter you read directly off the node.
    monitorSink: true,
    outputs: ["Frequency", "Fidelity", "Gate", "Detune"],
    parameters: [
      {
        constraint: "cpu",
        // 1024: at 48 kHz floor ≈ 94 Hz; 4096 ≈ 23 Hz. Larger = lower floor, slower updates.
        defaultValue: "1024",
        key: "windowSize",
        label: "Window",
        max: "4096",
        mid: "1024",
        min: "128",
        step: "1",
        tooltip: "Analysis window in samples (128–4096). Larger windows track lower frequencies but update more slowly. Min pitch ≈ 2×sampleRate/window (e.g. 1024 @ 48 kHz ≈ 94 Hz; 4096 ≈ 23 Hz)."
      },
      {
        defaultValue: "0.93",
        key: "threshold",
        label: "Threshold",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "0.001",
        nonlinearSlider: false,
        tooltip: "Fidelity (clarity) threshold 0…1. Below threshold Frequency/Gate report 0 (display shows —). 0 = accept everything; 1 = nearly never lock."
      },
    ]
  },
  noiseDetector: {
    planRole: "processor",
    planFreeRun: true,
    monitorSink: true,
    displayType: "trace",
    displaySignals: [
      { key: "Fidelity", kind: "scalar" },
      { key: "Gate", kind: "scalar" },
    ],
    visualInputs: [
      { key: "fid", label: "fid", port: "Fidelity" },
      { key: "gate", label: "g", port: "Gate" },
    ],
    inputAliases: { In: "Mono", L: "Left", R: "Right", M: "Mono" },
    inputLabels: { Left: "Left", Mono: "Mono", Right: "Right" },
    inputs: ["Mono", "Left", "Right"],
    outputAliases: { Out: "Mono", L: "Left", R: "Right", M: "Mono", fid: "Fidelity", g: "Gate" },
    outputLabels: { Left: "Left", Mono: "Mono", Right: "Right", Fidelity: "fid", Gate: "g" },
    outputs: ["Mono", "Left", "Right", "Fidelity", "Gate"],
    parameters: [
      {
        defaultValue: "0.9",
        key: "threshold",
        label: "Threshold",
        max: "1",
        mid: "0.9",
        min: "0",
        nonlinearSlider: true,
        step: "any",
        tooltip: "Gate goes high when fidelity ≥ threshold. Mid of the slider sits at 0.9 (Helmholtz lock is ~0.93).",
      },
    ],
  },
  // Hard rate limit: max |Δ| per sample from up/down times in seconds.
  // Shape: Lin (constant rate) / Log (fast start) / Exp (slow start) / Smooth (ease both ends).
  slewLimiter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "0.05",
        key: "upTime",
        kind: "time",
        label: "Up Time",
        max: "5",
        maxDigits: 5,
        mid: "0.05",
        min: "0",
        step: "any",
        unit: "s",
        tooltip: "Seconds to climb full scale (+1). 0 = unlimited rise rate."
      },
      {
        defaultValue: "0.20",
        key: "downTime",
        kind: "time",
        label: "Down Time",
        max: "5",
        maxDigits: 5,
        mid: "0.20",
        min: "0",
        step: "any",
        unit: "s",
        tooltip: "Seconds to fall full scale (−1). 0 = unlimited fall rate."
      },
      {
        choices: ["Lin", "Log", "Exp", "Smooth"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "shape",
        label: "Shape",
        linearSmoothing: false,
        max: "3",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "Lin = constant rate. Log = fast start, eases in. Exp = slow start, finishes quickly. Smooth = slow start and end."
      },
      {
        defaultValue: "0",
        hidden: true,
        key: "bias",
        label: "Bias",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Offset added before slew (0…1). Hidden by default — show it to step the target by hand.",
      },
    ]
  },
  // Mid/Side matrix (0.5 convention): M=(L+R)/2, S=(L−R)/2.
  midSideEncode: {
    planRole: "processor",
    inputLabels: { Left: "Left", Right: "Right" },
    inputs: ["Left", "Right"],
    outputs: ["Mid", "Side"],
    parameters: [
      {
        defaultValue: "0",
        key: "midGain",
        kind: "decibels",
        label: "Mid Gain",
        max: "12",
        mid: "0",
        min: "-24",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Mid level after encode. 0 dB = unity Mid for correlated L=R. Old linear 0…4 patches convert on load."
      },
      {
        defaultValue: "0",
        key: "sideGain",
        kind: "decibels",
        label: "Side Gain",
        max: "12",
        mid: "0",
        min: "-24",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Side level after encode. 0 dB = unity. Old linear 0…4 patches convert on load."
      },
    ]
  },
  // IIR Hilbert pair. In+Side → I (allpass, 1-sample align) + Q (~+90°).
  // Mid → MidI (allpass align only). SideQ is a copy of Q.
  quadrature: {
    planRole: "processor",
    inputLabels: { In: "In", Mid: "Mid", Side: "Side" },
    inputTooltips: {
      In: "Mixed with Side, then into I+S Allpass and I+S Hilbert.",
      Side: "Mixed with In, then into I+S Allpass and I+S Hilbert.",
      Mid: "Into MidI only (allpass + 1 sample). Not mixed with In or Side.",
    },
    inputs: ["In", "Mid", "Side"],
    outputLabels: { I: "I+S Allpass", Q: "I+S Hilbert", MidI: "M Allpass", SideQ: "I+S Hilbert (copy)" },
    outputTooltips: {
      I: "In+Side through the reference allpass. 1 sample delay so it lines up with I+S Hilbert.",
      Q: "In+Side through the Hilbert allpass. ~90° shift relative to I+S Allpass.",
      SideQ: "Copy of I+S Hilbert (same In+Side +90°). Extra jack for Mid/Side wiring.",
      MidI: "Mid only through the reference allpass. 1 sample delay. Not mixed with In or Side.",
    },
    outputs: ["I", "Q", "MidI", "SideQ"],
    parameters: [
      nodeGraphOutputAmplitudeParam,
    ]
  },
  // Mono Hilbert: +90°, −90°, or 0° (I of the IIR quadrature pair). One in, one out.
  hilbert: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "In" },
    inputs: ["In"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Out" },
    outputs: ["Out"],
    parameters: [
      {
        choices: ["+90°", "-90°", "0°"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "shift",
        label: "Shift",
        linearSmoothing: false,
        max: "2",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "+90° = Hilbert Q. −90° = inverted Q. 0° = I (same delay as Q, not a raw dry bypass). Use on Mid/Side Out Side, then add to Out Mid.",
      },
      nodeGraphOutputAmplitudeParam,
    ]
  },
  // Brickwall limiter. Look-ahead is optional (explicit delay, no host PDC).
  lookaheadLimiter: {
    planRole: "processor",
    displayHeightGu: 3,
    displayType: "trace",
    defaultDisplayMode: "gain",
    displayModes: [
      {
        key: "gain",
        label: "Gain",
        renderer: "trace",
        settingsSchema: "trace",
        source: { value: "Gain" },
      },
    ],
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right", "Gain"],
    parameters: [
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "gainCompensation",
        label: "Gain Comp",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "On = apply makeup of −Ceiling after the brickwall so limited peaks sit at 0 dBFS. Off = output stays at the Ceiling. Gain jack still reports the reduction.",
      },
      {
        defaultValue: "-1",
        key: "ceiling",
        label: "Ceiling",
        max: "0",
        mid: "-1",
        min: "-24",
        nonlinearSlider: false,
        step: "any",
        unit: "dB",
        tooltip: "Brickwall ceiling in dBFS. Peaks are held to this level."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "lookaheadEnabled",
        label: "Look-ahead",
        linearSmoothing: false,
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip:
          "On = delay audio by Look-ahead so gain can fall before peaks. Off = instantaneous limiting (no delay)."
      },
      {
        defaultValue: "5",
        key: "lookaheadMs",
        kind: "time",
        label: "LA Time",
        max: "50",
        maxDigits: 5,
        mid: "5",
        min: "0",
        step: "any",
        unit: "ms",
        tooltip:
          "Look-ahead delay in milliseconds (modulatable). Used only when Look-ahead is On. Audio is delayed by this amount so gain can fall before peaks — not host-compensated."
      },
      {
        defaultValue: "0",
        hidden: true,
        key: "lookaheadSamples",
        label: "LA Samples",
        max: "16384",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Extra look-ahead in samples (added to Look-ahead ms). Same idea as Sample Delay samples. Hidden by default — show it from Parameter Settings."
      },
      {
        defaultValue: "0.2",
        key: "attack",
        kind: "time",
        label: "Attack",
        max: "50",
        maxDigits: 5,
        mid: "0.2",
        min: "0",
        step: "any",
        unit: "ms",
        tooltip: "How fast gain reduces when over ceiling (0 = instant)."
      },
      {
        defaultValue: "100",
        key: "release",
        kind: "time",
        label: "Release",
        max: "2000",
        maxDigits: 5,
        mid: "100",
        min: "1",
        step: "any",
        unit: "ms",
        tooltip: "How fast gain returns to unity after a peak (slow enough not to pump bass)."
      },
      {
        defaultValue: "1",
        hidden: true,
        key: "dipGain",
        label: "Dip Gain",
        max: "3",
        mid: "1",
        min: "0.5",
        nonlinearSlider: false,
        step: "any",
        unit: "x",
        tooltip:
          "Over-reduction after the exact brickwall cut. 1× = just enough for the Ceiling. 2× = twice the dB of dip. Slider min/max are yours in Parameter Settings — DSP does not clamp this. Hidden by default.",
      },
    ]
  },
  // Exponential approach: out += (in − out) * k with separate rise/fall k (0…1).
  // Same family as Speed Color Inertia; compare with Up/Down Slew for hard ramps.
  inertialFilter: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "20000",
        key: "attack",
        kind: "frequency",
        label: "Attack",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Rise cutoff in Hz. 0 = freeze going up. 20 kHz = jump to target this sample."
      },
      {
        defaultValue: "20",
        key: "release",
        kind: "frequency",
        label: "Release",
        max: "20000",
        maxDigits: 5,
        mid: "1000",
        min: "0",
        step: "any",
        unit: "Hz",
        tooltip: "Fall cutoff in Hz. 0 = freeze going down. Lower = more inertia."
      },
    ]
  },
  sampleHold: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right", "Trigger"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "0",
        key: "threshold",
        label: "Threshold",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "0",
        key: "sampleFrequency",
        kind: "frequency",
        label: "Sample Freq",
        max: "20000",
        maxDigits: 5,
        mid: "10",
        min: "0",
        step: "any",
        unit: "Hz"
      },
    ]
  },
  midiOut: {
    planRole: "source",
    inputs: ["MIDI Number"],
    outputs: ["Normalized", "Full Value"],
    parameters: [
      {
        defaultValue: "60",
        key: "midiNumber",
        label: "MIDI Number",
        max: "127",
        maxDigits: 3,
        mid: "64",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  midiNotePitch: {
    planRole: "processor",
    inputs: ["MIDI Note", "Octave Offset", "Pitch Offset"],
    inputAliases: {
      Note: "MIDI Note",
      "Midi Note": "MIDI Note",
      "Semitone Offset": "Pitch Offset"
    },
    outputs: ["Pitch 0-1", "Pitch 0-127", "Frequency"],
    parameters: []
  },
  keyboardController: {
    planRole: "source",
    digitalOutputs: ["Held Keys"],
    inputs: ["MIDI Note", "Gate", "Velocity", "Octave", "Reset", "Hold", "X", "Y"],
    layout: "keyboardController",
    outputLabels: {
      "0.1V/Oct": "0.1V",
      Increment: "Inc."
    },
    outputs: ["Gate", "1 Sample Gate", "Key", "Q", "MIDI", "Double", "0.1V/Oct", "Increment", "Frequency", "Pitch", "X", "Y", "Held Keys"],
    parameters: []
  },
  samplePlayer: {
    planRole: "processor",
    displayType: "trace",
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    stereoTracePorts: { left: "Left", right: "Right" },
    inputs: ["Trigger", "Reset", "Pitch", "Start", "End"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono", Left: "Left", Right: "Right" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      { defaultValue: "0", key: "sample", label: "Sample", linearSmoothing: false, max: "4096", mid: "0", min: "0", step: "1" },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "pitch", label: "Pitch", max: "4", mid: "0", min: "-4", step: "any" },
      { defaultValue: "0", key: "start", label: "Start", max: "1", mid: "0", min: "0", step: "any" },
      { defaultValue: "1", key: "end", label: "End", max: "1", mid: "1", min: "0", step: "any" },
      { defaultValue: "0.002", key: "attack", kind: "time", label: "Attack", max: "1", maxDigits: 5, mid: "0.002", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.01", key: "release", kind: "time", label: "Release", max: "1", maxDigits: 5, mid: "0.01", min: "0", step: "any", unit: "s" },
      { choices: ["Off", "On"], defaultValue: "1", displayChoices: true, divideChoicesVisibly: true, key: "oneShot", label: "One Shot", linearSmoothing: false, max: "1", mid: "1", min: "0", nonlinearSlider: false, step: "1" },
    ]
  },
  sampleLooper: {
    planRole: "processor",
    displayType: "trace",
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    stereoTracePorts: { left: "Left", right: "Right" },
    inputs: ["Gate", "Reset", "Pitch", "Start", "End", "Loop Start", "Loop End"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono", Left: "Left", Right: "Right" },
    outputs: ["Out", "Left", "Right", "Phase"],
    parameters: [
      { defaultValue: "0", key: "sample", label: "Sample", linearSmoothing: false, max: "4096", mid: "0", min: "0", step: "1" },
      { defaultValue: "1", key: "level", label: "Level", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "pitch", label: "Pitch", max: "4", mid: "0", min: "-4", step: "any" },
      { defaultValue: "0", key: "start", label: "Start", max: "1", mid: "0", min: "0", step: "any" },
      { defaultValue: "1", key: "end", label: "End", max: "1", mid: "1", min: "0", step: "any" },
      { defaultValue: "0", key: "loopStart", label: "Loop Start", max: "1", mid: "0", min: "0", step: "any" },
      { defaultValue: "1", key: "loopEnd", label: "Loop End", max: "1", mid: "1", min: "0", step: "any" },
      { defaultValue: "0.005", key: "crossfade", kind: "time", label: "Crossfade", max: "0.25", maxDigits: 5, mid: "0.005", min: "0", step: "any", unit: "s" },
      { choices: ["Forward", "One Shot"], defaultValue: "0", displayChoices: true, divideChoicesVisibly: true, key: "mode", label: "Mode", linearSmoothing: false, max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "1" },
    ]
  },
  phosphillator: {
    planRole: "source",
    layout: "phosphillatorDraw",
    inputs: ["0.1V/Oct", "Reset", "f"],
    outputs: ["X", "Y"],
    parameters: [
      { defaultValue: "2", key: "frequency", kind: "frequency", label: "Frequency", max: "2000", maxDigits: 5, mid: "2", min: "0", step: "any", unit: "Hz" },
      { defaultValue: "0", key: "phase", kind: "phase", label: "Phase", max: "1", mid: "0.5", min: "0", step: "0.01", unit: "cycle", wraparound: true },
      {
        defaultValue: "0.5",
        key: "sharpness",
        label: "Sharpness",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "0.01",
        tooltip: "Path scan morph: 0% reverse-saw (end→start jump), 50% triangle (forward then reverse), 100% forward-saw (start→end jump)."
      },
      { defaultValue: "0.5", key: "smoothing", label: "Smoothing", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  audioPlayer: {
    planRole: "source",
    layout: "phosphorWaveform",
    defaultWidthGu: 11,
    defaultHeightGu: 22,
    displayType: "customDisplay",
    displayModes: [
      {
        key: "waveform",
        label: "Waveform",
        renderer: "customDisplay",
        settingsSchema: "phosphorWaveform",
      },
    ],
    defaultDisplayMode: "waveform",
    digitalInputs: ["Reset", "Start Time", "End Time"],
    digitalOutputs: ["Trigger"],
    inputTooltips: {
      "Start Time": "File time in seconds. Converted to 0…1 phase from the loaded sample length. Unconnected uses the [⇦ slider.",
      "End Time": "File time in seconds. Converted to 0…1 phase from the loaded sample length. Unconnected uses the ⇨] slider.",
    },
    inputs: ["Reset", "Start Time", "End Time", "Speed", "Phase"],
    outputs: ["Mono", "Left", "Right", "Phase", "Trigger"],
    parameters: [
      {
        choices: ["Off", "Hermite"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        hidden: true,
        key: "antialias",
        label: "Antialias",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Fractional sample read. Off = linear. Hermite = 4-point cubic (smoother varispeed, more CPU).",
      },
      { choices: ["Off (reset)", "Stop", "Pause", "Loop", "Play", "Loop All"], defaultValue: "4", displayChoices: true, divideChoicesVisibly: true, key: "transport", label: "Playmode", linearSmoothing: false, max: "5", mid: "2", min: "0", nonlinearSlider: false, step: "1" },
      { defaultValue: "1", key: "speed", label: "Speed", linearSmoothing: false, max: "8", maxDigits: 4, mid: "1", min: "0", step: "any", unit: "x" },
      // Slow reverse/forward nudge. No wrap. Internal 5 s linear (220500 samples @ 44.1 kHz).
      {
        defaultValue: "0",
        key: "phaseOffset",
        kind: "phase",
        label: "◀◀ ▶▶",
        max: "0.1",
        maxDigits: 5,
        mid: "0",
        min: "-0.1",
        nonlinearSlider: false,
        showSign: true,
        sliderCurve: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 220500,
        smoothingType: "linear",
        step: "any",
        unit: "cycle",
        wraparound: false,
        tooltip: "Slow reverse / forward nudge (−0.1…+0.1). No wrap. 5 s linear internal glide."
      },
      // Fine phase skip. Internal 0.156 s Papoulis.
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Scratch",
        max: "0.003",
        maxDigits: 5,
        mid: "0",
        min: "-0.003",
        nonlinearSlider: false,
        showSign: true,
        sliderCurve: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.156,
        smoothingType: "papoulis",
        step: "any",
        unit: "cycle",
        wraparound: false,
        tooltip: "Fine scratch skip (−0.003…+0.003). 0.156 s Papoulis internal glide."
      },
      { defaultValue: "0", key: "start", label: "[⇦", linearSmoothing: false, max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "end", label: "⇨]", linearSmoothing: false, max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "amplitude", label: "Amplitude", max: "1", mid: "1", min: "0", nonlinearSlider: false, step: "any" , modClamp: false },
      // Playlist / waveform scrub only — not a face slider.
      {
        defaultValue: "0",
        hidden: true,
        key: "playlistScrub",
        kind: "phase",
        label: "Playlist Scrub",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        wraparound: true,
      },
    ]
  },
  macroControls: {
    planRole: "source",
    // Knob bank is the module display (no title/status chrome).
    customDisplayArea: true,
    displayHeightGu: 5,
    displayType: "macroControlsFace",
    displayModes: [
      {
        key: "face",
        label: "Face",
        renderer: "macroControlsFace",
        settingsSchema: "macroControlsFace"
      },
    ],
    defaultDisplayMode: "face",
    inputs: ["M1 In", "M2 In", "M3 In", "M4 In", "M5 In", "M6 In", "M7 In", "M8 In", "Reset"],
    layout: "macroControls",
    outputs: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"],
    parameters: []
  },
  pitchModWheel: {
    planRole: "source",
    displayHeightGu: 5,
    inputs: ["Pitch", "Mod", "Reset"],
    layout: "pitchModWheel",
    outputs: ["Pitch Wheel", "Mod Wheel"],
    parameters: []
  },
  // Full shapeable DADSR — formerly "Exponential Envelope" / Exp ADSR.
  // For simple Attack/Decay only, use Attack Decay.
  expAdsr: {
    planRole: "processor",
    layout: "envelopeCurve",
    inputs: ["Gate"],
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0",
        key: "delay",
        kind: "time",
        label: "Delay",
        max: "5",
        maxDigits: 5,
        mid: "0.25",
        min: "0",
        step: "any",
        unit: "s"
      },
      {
        defaultValue: "0.08",
        key: "attack",
        kind: "time",
        label: "Attack",
        max: "10",
        maxDigits: 5,
        mid: "0.5",
        min: "0",
        step: "any",
        unit: "s"
      },
      {
        defaultValue: "0.22",
        key: "decay",
        kind: "time",
        label: "Decay",
        max: "10",
        maxDigits: 5,
        mid: "0.5",
        min: "0",
        step: "any",
        unit: "s"
      },
      {
        defaultValue: "0.55",
        key: "sustain",
        label: "Sustain",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
      {
        defaultValue: "0.45",
        key: "release",
        kind: "time",
        label: "Release",
        max: "10",
        maxDigits: 5,
        mid: "0.5",
        min: "0",
        step: "any",
        unit: "s"
      },
      {
        defaultValue: "0.3",
        key: "attackShape",
        label: "Attack Curve",
        max: "100",
        maxDigits: 5,
        mid: "0.3",
        min: "0.0001",
        step: "any",
        tooltip: "Target-ratio shape for the attack segment. For simple A/D only, use Attack Decay."
      },
      {
        defaultValue: "0.0001",
        key: "releaseShape",
        label: "Fall Curve",
        max: "100",
        maxDigits: 5,
        mid: "0.0001",
        min: "0.0001",
        step: "any",
        tooltip: "Target-ratio shape for decay/release segments. Prefer Attack Decay for easy envelopes."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "loop",
        label: "Loop",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        defaultValue: "1",
        key: "level",
        label: "Amplitude",
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "any"
      },
    ]
  },
  // Easy gate envelope: vactrol-style asymmetric one-pole A/D + curve.
  attackDecay: {
    planRole: "processor",
    layout: "envelopeCurve",
    inputs: ["Gate"],
    outputs: ["Out"],
    parameters: [
      {
        choices: ["Gate", "Trigger"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "inputMode",
        label: "Input",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Gate = follow high/low (vactrol AR). Trigger = rising edge fires one Attack→Decay."
      },
      {
        choices: ["Off", "Loop", "LFO"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "cycle",
        label: "Cycle",
        linearSmoothing: false,
        max: "2",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Off = one-shot (Trigger) or follow (Gate). Loop = auto-repeat AD. LFO = free-run AD; Gate rising edge hard-syncs."
      },
      {
        defaultValue: "0.01",
        key: "attack",
        kind: "time",
        label: "Attack",
        max: "5",
        maxDigits: 5,
        mid: "0.1",
        min: "0",
        step: "any",
        unit: "s",
        tooltip: "Rise time constant. ~63% of the way toward peak in this time."
      },
      {
        defaultValue: "0.25",
        key: "decay",
        kind: "time",
        label: "Decay",
        max: "10",
        maxDigits: 5,
        mid: "0.5",
        min: "0",
        step: "any",
        unit: "s",
        tooltip: "Fall time constant. Same family as vactrol release / photoconductive lag."
      },
      {
        defaultValue: "1",
        key: "curve",
        label: "Curve",
        max: "8",
        mid: "1",
        min: "0.001",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Power-law after the one-pole (raw^Curve). 1 = linear; >1 digs in (vactrol gamma); <1 expands the middle."
      },
      {
        defaultValue: "1",
        key: "amplitude",
        label: "Amplitude",
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        modClamp: false,
        tooltip: "Output scale after shape."
      },
    ]
  },
  linearEnvelope: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["Gate"],
    outputs: ["Out"],
    parameters: [
      { defaultValue: "0", key: "delay", kind: "time", label: "Delay", max: "5", maxDigits: 5, mid: "0.25", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.08", key: "attack", kind: "time", label: "Attack", max: "10", maxDigits: 5, mid: "0.5", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.22", key: "decay", kind: "time", label: "Decay", max: "10", maxDigits: 5, mid: "0.5", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.55", key: "sustain", label: "Sustain", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.45", key: "release", kind: "time", label: "Release", max: "10", maxDigits: 5, mid: "0.5", min: "0", step: "any", unit: "s" },
      { choices: ["Off", "On"], defaultValue: "0", displayChoices: true, divideChoicesVisibly: true, key: "loop", label: "Loop", linearSmoothing: false, max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "1" },
      { defaultValue: "1", key: "level", label: "Amplitude", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
    ]
  },
  pluckEnvelope: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["Trigger", "Release"],
    outputs: ["Out"],
    parameters: [
      { defaultValue: "0", key: "delayTime", kind: "time", label: "Delay", max: "1", maxDigits: 5, mid: "0", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.002", key: "attackFeedback", kind: "time", label: "Attack", max: "1", maxDigits: 5, mid: "0.002", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.35", key: "decay", label: "Decay", max: "1", mid: "0.35", min: "0.1", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.08", key: "decayModStart", label: "Attack Energy", max: "1.8", mid: "0.08", min: "0.001", step: "any" },
      { defaultValue: "0.55", key: "decayModEnd", label: "Decay Energy", max: "3", mid: "0.55", min: "0.01", step: "any" },
      { defaultValue: "0.8", key: "endingDecay", label: "Ending Decay", max: "1.4", mid: "0.8", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "decayModCurve", label: "Decay Curve", max: "1", mid: "0", min: "-1", nonlinearSlider: false, step: "any" },
      { defaultValue: "1.5", key: "decayModFrequency", kind: "frequency", label: "Decay Motion", max: "100", maxDigits: 5, mid: "1.5", min: "0", step: "any", unit: "Hz" },
      { defaultValue: "0.35", key: "releaseFeedback", label: "Release", max: "1", mid: "0.35", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.08", key: "autoReleaseTime", kind: "time", label: "Auto Release", max: "0.2", maxDigits: 5, mid: "0.08", min: "0", step: "any", unit: "s" },
      { defaultValue: "1", key: "velocity", label: "Velocity", max: "1", mid: "1", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0", key: "velocitySensitivity", label: "Velocity Sens", max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "1", key: "level", label: "Amplitude", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
    ]
  },
  // Knobs stay normalized 0..1 (or their existing native ranges) for patching/automation;
  // displayTransform only changes the readout text, mapping to real-world vactrol/LDR
  // physics (photoconductive gamma, illuminance, dark resistance) so the numbers on
  // screen mean something to a real vactrol datasheet reader. Reference assumptions:
  // normalized Light input 1.0 == 1000 lux (bright close-range LED, the usual vactrol
  // drive scenario).
  vactrolEnvelopeSeries: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["Light"],
    outputs: ["Env"],
    parameters: [
      {
        choices: nodeGraphVactrolSeriesSpecs.map((spec) => spec.label),
        defaultValue: "2",
        displayChoices: true,
        key: "part",
        label: "Part",
        max: String(nodeGraphVactrolSeriesSpecs.length - 1),
        mid: "2",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Selects which real VTL5C-series datasheet timing/resistance figures drive this envelope."
      },
      {
        defaultValue: "1", key: "curve", label: "Curve", max: "8", maxDigits: 5, mid: "1", min: "0.001", step: "any",
        displayTransform: (value) => ({ maxDigits: 3, unit: "γ (LDR gamma)", value })
      },
      {
        defaultValue: "1", key: "sensitivity", label: "Sensitivity", max: "4", maxDigits: 5, mid: "1", min: "0", nonlinearSlider: false, step: "any",
        displayTransform: (value) => ({ maxDigits: 1, unit: "lux full-drive", value: 1000 / Math.max(value, 0.001) })
      },
      {
        defaultValue: "0", key: "lightOffset", label: "Light Offset", max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "any",
        displayTransform: (value) => ({ maxDigits: 1, unit: "lux bias", value: value * 1000 })
      },
      {
        defaultValue: "0", key: "darkCurrent", label: "Dark Current", max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "any",
        displayTransform: (value, slider) => {
          const spec = nodeGraphVactrolSeriesSpec(nodeGraphParameterSiblingValue(slider, "part"));
          const leak = Math.max(0, Math.min(1, value));
          return { maxDigits: 1, unit: "kΩ dark R", value: spec.litKohm * Math.pow(spec.darkKohm / spec.litKohm, 1 - leak) };
        }
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // Same knobs as VTL5C Series (minus the part switch), same DSP, but not modeling
  // one named real part -- a blank-slate vactrol for dialing in your own attack/
  // release/curve/dark-resistance combination. Dark-current reference resistances
  // (10 ohm lit / 1 megohm dark) are a generic mid-range CdS-cell figure, not tied
  // to a specific datasheet.
  vactrolEnvelopeCustom: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["Light"],
    outputs: ["Env"],
    parameters: [
      {
        defaultValue: "0.01", key: "attack", kind: "time", label: "Attack", max: "2", maxDigits: 5, mid: "0.01", min: "0", step: "any", unit: "s",
        displayTransform: (value) => ({ maxDigits: 1, unit: "ms", value: value * 1000 })
      },
      {
        defaultValue: "0.1", key: "release", kind: "time", label: "Release", max: "5", maxDigits: 5, mid: "0.1", min: "0", step: "any", unit: "s",
        displayTransform: (value) => ({ maxDigits: 1, unit: "ms", value: value * 1000 })
      },
      {
        defaultValue: "1", key: "curve", label: "Curve", max: "8", maxDigits: 5, mid: "1", min: "0.001", step: "any",
        displayTransform: (value) => ({ maxDigits: 3, unit: "γ (LDR gamma)", value })
      },
      {
        defaultValue: "1", key: "sensitivity", label: "Sensitivity", max: "4", maxDigits: 5, mid: "1", min: "0", nonlinearSlider: false, step: "any",
        displayTransform: (value) => ({ maxDigits: 1, unit: "lux full-drive", value: 1000 / Math.max(value, 0.001) })
      },
      {
        defaultValue: "0", key: "lightOffset", label: "Light Offset", max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "any",
        displayTransform: (value) => ({ maxDigits: 1, unit: "lux bias", value: value * 1000 })
      },
      {
        defaultValue: "0", key: "darkCurrent", label: "Dark Current", max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "any",
        displayTransform: (value) => {
          const litKohm = 0.01;
          const darkKohm = 1000;
          const leak = Math.max(0, Math.min(1, value));
          return { maxDigits: 1, unit: "kΩ dark R", value: litKohm * Math.pow(darkKohm / litKohm, 1 - leak) };
        }
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  flowerChildEnvelopeFollower: {
    planRole: "processor",
    planFreeRun: true,
    inputs: ["In"],
    outputs: ["Out"],
    parameters: [
      { defaultValue: "0.001", key: "attack", kind: "time", label: "Attack", max: "2", maxDigits: 5, mid: "0.001", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.001", key: "hold", kind: "time", label: "Hold", max: "2", maxDigits: 5, mid: "0.001", min: "0", step: "any", unit: "s" },
      { defaultValue: "0.001", key: "decay", kind: "time", label: "Decay", max: "5", maxDigits: 5, mid: "0.001", min: "0", step: "any", unit: "s" },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  sandboxVisuals: {
    planRole: "monitor",
    bufferedInputs: ["Shake", "X", "Y", "Dim", "Red", "Green", "Blue", "Scope Off", "Pause"],
    displayType: "trace",
    inputs: ["Shake", "X", "Y", "Dim", "Red", "Green", "Blue", "Scope Off", "Pause", "Trace Image"],
    inputAliases: {"Screen Shake": "Shake",
      "Screen Dim": "Dim",
      "Turn Off Display Traces": "Scope Off",
      "Pause Displays": "Pause",
      "Trace Texture": "Trace Image",
      Freq: "f", Frequency: "f", F: "f", "ƒ": "f"},
    outputs: [],
    parameters: [],
    visualInputs: [
      {
        key: "screenShake",
        label: "Shake",
        port: "Shake"
      },
      {
        key: "x",
        label: "X",
        port: "X"
      },
      {
        key: "y",
        label: "Y",
        port: "Y"
      },
      {
        key: "screenDim",
        label: "Dim",
        port: "Dim"
      },
      {
        key: "red",
        label: "Red",
        port: "Red"
      },
      {
        key: "green",
        label: "Green",
        port: "Green"
      },
      {
        key: "blue",
        label: "Blue",
        port: "Blue"
      },
      {
        key: "scopeTracesOff",
        label: "Scope Off",
        port: "Scope Off"
      },
      {
        key: "scopePaused",
        label: "Pause",
        port: "Pause"
      },
      {
        key: "traceImage",
        label: "Trace Image",
        port: "Trace Image"
      },
    ],
    visualSink: true
  },
  screenSpaceShader: {
    planRole: "monitor",
    inputs: ["Shake", "X", "Y", "Dim", "Red", "Green", "Blue", "Scope Off", "Pause", "Trace Image"],
    layout: "screenSpaceShader",
    outputs: [],
    parameters: [],
    visualSink: true
  },
  bloomGlow: {
    planRole: "monitor",
    displayType: "dot",
    outputs: [],
    parameters: [
      { defaultValue: "0", key: "screenDim", label: "Dim", max: "1", mid: "0", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.55", key: "visualBrightness", label: "Brightness", max: "1", mid: "0.55", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.45", key: "visualBloom", label: "Bloom", max: "1", mid: "0.45", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.60", key: "visualGlow", label: "Glow", max: "1", mid: "0.6", min: "0", nonlinearSlider: false, step: "any" },
    ],
    visualSink: true
  },
  rgbaHsla: {
    planRole: "monitor",
    bufferedInputs: ["Red", "Green", "Blue", "Hue", "Saturation", "Lightness", "HSL Mix", "Alpha"],
    displayType: "trace",
    inputs: ["Red", "Green", "Blue", "Hue", "Saturation", "Lightness", "HSL Mix", "Alpha"],
    inputAliases: {
      R: "Red",
      G: "Green",
      B: "Blue",
      H: "Hue",
      S: "Saturation",
      L: "Lightness",
      A: "Alpha",
      "Screen Alpha": "Alpha"
    },
    outputs: [],
    parameters: [],
    visualInputs: [
      { key: "red", label: "Red", port: "Red" },
      { key: "green", label: "Green", port: "Green" },
      { key: "blue", label: "Blue", port: "Blue" },
      { key: "hue", label: "Hue", port: "Hue" },
      { key: "saturation", label: "Saturation", port: "Saturation" },
      { key: "lightness", label: "Lightness", port: "Lightness" },
      { key: "hslMix", label: "HSL Mix", port: "HSL Mix" },
      { key: "screenDim", label: "Alpha", port: "Alpha" },
    ],
    visualSink: true
  },
  chromaColor: {
    planRole: "monitor",
    displayType: "dot",
    outputs: [],
    parameters: [
      { defaultValue: "0.58", key: "chromaHue", label: "Hue", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any", wraparound: true },
      { defaultValue: "0.82", key: "chromaSaturation", label: "Chroma", max: "1", mid: "0.6", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.52", key: "chromaLightness", label: "Light", max: "1", mid: "0.5", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.35", key: "chromaAlpha", label: "Alpha", max: "1", mid: "0.35", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.25", key: "chromaDrift", label: "Drift", max: "1", mid: "0.25", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.40", key: "chromaSpread", label: "Spread", max: "1", mid: "0.4", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.55", key: "visualBrightness", label: "Trace Brightness", max: "1", mid: "0.55", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.45", key: "visualBloom", label: "Bloom", max: "1", mid: "0.45", min: "0", nonlinearSlider: false, step: "any" },
      { defaultValue: "0.60", key: "visualGlow", label: "Glow", max: "1", mid: "0.6", min: "0", nonlinearSlider: false, step: "any" },
    ],
    visualSink: true
  },
  image: {
    planRole: "source",
    layout: "image",
    outputAliases: {
      Image: "RGBA"
    },
    outputs: ["RGBA"],
    parameters: []
  },
  canvas: {
    planRole: "monitor",
    bufferedInputs: ["a_buffer"],
    displayHeightGu: 5,
    inputs: ["a_buffer", "a not buffer"],
    layout: "canvas",
    outputs: ["RGBA"],
    parameters: [],
    visualInputs: [
      { key: "canvasABuffer", label: "a_buffer", port: "a_buffer" },
      { key: "canvasANotBuffer", label: "a not buffer", port: "a not buffer" },
    ],
    visualSink: true
  },
  // led registers its own definition from public/modules/led/led-register.js
  // -- see node-graph-chromeless-module-registry.js.
  // Multi-mode Display sink: flip face family without swapping modules.
  // Default remains 2D Trace (X/Y). Mono modes use In; XY modes use X/Y.
  visualOscilloscope: {
    planRole: "monitor",
    bufferedInputs: ["In", "X", "Y"],
    displayType: "scope2dTrace",
    defaultDisplayMode: "xyTrace",
    displayModes: [
      {
        key: "xyTrace",
        label: "2D Trace",
        renderer: "scope2dTrace",
        settingsSchema: "scope2dTrace",
        source: { x: "X", y: "Y" }
      },
      {
        key: "xyBurn",
        label: "2D Phosphor",
        renderer: "scope2d",
        settingsSchema: "scope2d",
        source: { x: "X", y: "Y" }
      },
      {
        key: "monoTrace",
        label: "1D Waterfall",
        renderer: "trace",
        settingsSchema: "trace",
        source: { value: "In" }
      },
      {
        key: "monoDot",
        label: "Phosphor Dot",
        renderer: "dot",
        settingsSchema: "dot",
        source: { value: "In" }
      },
    ],
    inputAliases: { Mono: "In" },
    inputLabels: {In: "Mono",
      f: "ƒ"},
    inputs: ["In", "X", "Y"],
    layout: "visualScope",
    // Dry X/Y thrus so multi-mode Display can sit in-line on XY patches.
    outputs: ["X", "Y", "RGBA"],
    parameters: [],
    visualInputs: [
      { key: "visualOscilloscope", label: "Mono", port: "In" },
      { key: "visualOscilloscopeX", label: "X", port: "X" },
      { key: "visualOscilloscopeY", label: "Y", port: "Y" },
    ],
    visualSink: true
  },
  traceDisplay: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    displayType: "trace",
    inputs: ["In"],
    layout: "traceDisplay",
    // Dry passthrough so the face can sit in-line (In → face + Thru).
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "traceDisplay", label: "In", port: "In" },
    ],
    visualSink: true
  },
  // Same stereo waterfall face as Output (L/R colors, Meet in the pen, sync).
  traceDisplayStereo: {
    planRole: "monitor",
    bufferedInputs: ["Left", "Right"],
    displayType: "trace",
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    stereoTracePorts: { left: "Left", right: "Right" },
    inputAliases: { L: "Left", R: "Right", Mono: "Left" },
    inputs: ["Left", "Right"],
    layout: "traceDisplay",
    // Dry L/R thrus so the face can sit in-line on a stereo path.
    outputs: ["Left", "Right"],
    parameters: [],
    visualInputs: [
      { key: "traceDisplayStereoLeft", label: "Left", port: "Left" },
      { key: "traceDisplayStereoRight", label: "Right", port: "Right" },
    ],
    visualSink: true
  },
  vectorDot: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    displayType: "vectorDot",
    displayRenderer: "vectorDot",
    displayModes: [
      { key: "vectorDot", label: "Vector Dot", renderer: "vectorDot", source: { value: "In" } },
    ],
    inputs: ["In"],
    layout: "traceDisplay",
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "vectorDot", label: "In", port: "In" },
    ],
    visualSink: true,
  },
  dotOscilloscope: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    displayType: "dot",
    inputs: ["In"],
    layout: "traceDisplay",
    // Dry passthrough so the face can sit in-line (In → face + Thru).
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "dotOscilloscope", label: "In", port: "In" },
    ],
    visualSink: true
  },
  oscilloscopeBank: {
    planRole: "monitor",
    displayType: "oscilloscopeBankBurn",
    dataInputs: ["Phases", "Amplitudes", "Pans"],
    layout: "traceDisplay",
    outputs: [],
    parameters: [],
    visualSink: true
  },
  videoscope: {
    planRole: "processor",
    bufferedInputs: ["A", "B"],
    displayType: "videoscopeBurn",
    inputs: ["A", "B"],
    layout: "traceDisplay",
    // Dry passthrough of primary channel A so the face can sit in-line.
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [
      { key: "triggerLevel", label: "Trigger Level", defaultValue: "0", min: "-1", mid: "0", max: "1", step: "any" },
      {
        choices: ["A", "B"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "triggerSource",
        label: "Trigger Source",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        choices: ["Rising", "Falling"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "triggerPolarity",
        label: "Trigger Polarity",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { constraint: "ram", key: "timeDivSamples", label: "Window Size", defaultValue: "512", min: "8", mid: "512", max: "8192", step: "1" },
      {
        choices: ["Run", "Freeze"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "freeze",
        label: "Freeze",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      {
        choices: ["Dot", "Line", "XY"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "2",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
      { key: "columns", label: "Columns", defaultValue: "200", min: "16", mid: "200", max: "512", step: "1" },
      { key: "brightness", label: "Brightness", defaultValue: "1", min: "0", mid: "1", max: "1", step: "0.01", maxDigits: 4 },
    ],
    visualInputs: [
      { key: "videoscopeA", label: "A", port: "A" },
      { key: "videoscopeB", label: "B", port: "B" },
    ],
    visualSink: true
  },
  spectrogram: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    displayType: "spectrogramBurn",
    inputs: ["In"],
    layout: "traceDisplay",
    // Dry passthrough so the analyzer can sit in-line (In → face + Thru).
    // 📺 / rgba is reserved for a later video tap (silence until then).
    outputs: ["Thru", "rgba"],
    outputLabels: { Thru: "←", rgba: "📺" },
    outputTooltips: {
      rgba: "TV tap — unimplemented. Reserved for a later video/raster send.",
    },
    // Face knobs: Pixel Grid grade + view band + scroll window.
    // Analysis look (FFT / window / overlap / freq scale / gradient) stays in Display Settings.
    parameters: [
      {
        bipolar: true,
        defaultValue: "1",
        key: "contrast",
        label: "Contrast",
        max: "4",
        mid: "0",
        min: "-4",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Same S-curve as Pixel Grid. 1 = unity. Below 1 compresses highs so bins don’t clip as fast. 0 = mid grey. Negative inverts the curve.",
      },
      {
        bipolar: true,
        defaultValue: "0.2",
        key: "brightness",
        label: "Brightness",
        max: "4",
        mid: "0",
        min: "-4",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Same gain as Pixel Grid, after contrast. 1 = unity. 0 = black. Default 0.2 stays dim. Negative is the same gain, then invert.",
      },
      {
        key: "minFreq",
        kind: "frequency",
        label: "Min Freq",
        defaultValue: "20",
        min: "1",
        mid: "200",
        max: "24000",
        step: "any",
        maxDigits: 5,
        unit: "Hz",
        tooltip: "Lowest frequency at the bottom of the face. Zoom with Max Freq to spend vertical pixels on a band."
      },
      {
        key: "maxFreq",
        kind: "frequency",
        label: "Max Freq",
        defaultValue: "20000",
        min: "1",
        mid: "8000",
        max: "24000",
        step: "any",
        maxDigits: 5,
        unit: "Hz",
        tooltip: "Highest frequency at the top of the face (must stay above Min Freq)."
      },
      {
        key: "historySeconds",
        label: "History",
        defaultValue: "2",
        min: "0.1",
        mid: "2",
        max: "30",
        step: "any",
        maxDigits: 4,
        unit: "s",
        tooltip: "Seconds of audio across the face width. Longer = slower waterfall scroll."
      },
    ],
    visualInputs: [
      { key: "spectrogram", label: "In", port: "In" },
    ],
    visualSink: true
  },
  // Matrix Waterfall — pure parameter rain (Fall / Rise). No ports, no plate modes.
  // Glyph table + gradient live in Display Settings. Clean base for future work.
  matrixWaterfall: {
    planRole: "source",
    customDisplayArea: true,
    defaultWidthGu: 12,
    displayHeightGu: 10,
    displayType: "matrixWaterfallFace",
    bufferedInputs: ["Reset", "Spawn", "Speed"],
    digitalInputs: ["Reset"],
    inputs: ["Reset", "Spawn", "Speed"],
    inputLabels: { Reset: "Reset", Spawn: "Spawn", Speed: "Speed" },
    layout: "matrixWaterfall",
    outputs: [],
    parameters: [
      // min/mid/max are default metaparam ranges only — not engine hard limits.
      {
        constraint: "gpu",
        key: "density",
        label: "Density",
        defaultValue: "0.4",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        modClamp: false,
        tooltip: "Glyph field density. Low = bigger characters (fewer cells); high = smaller (more cells). One character per cell. Changing density remaps phosphor — does not wipe trails."
      },
      {
        defaultValue: "1",
        key: "speed",
        label: "Speed",
        max: "1",
        mid: "0.5",
        min: "0",
        step: "any",
        maxDigits: 4,
        tooltip: "Rain rate. 0 idle, 1 full fall. Expand min below 0 to rise."
      },
      {
        key: "charSpeed",
        label: "Char Speed",
        defaultValue: "1",
        min: "0",
        mid: "1",
        max: "8",
        step: "any",
        maxDigits: 4,
        tooltip: "Glyph flips per bin of travel. 0 = fixed char for the stream; 1 = change every bin; 2 = twice per bin; fractional (e.g. 1.5) free-runs vs bin edges."
      },
      {
        key: "spawn",
        label: "Spawn",
        defaultValue: "0.5",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        modClamp: false,
        tooltip: "How often new rain streams appear. 0 = none. 0.5 = original rain. 1 = downpour (overlapping streams fill the plate)."
      },
      {
        key: "streamDeath",
        label: "Stream Death",
        defaultValue: "0.5",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        modClamp: false,
        tooltip:
          "Mid-stream die-off. 0 = never die (wrap forever). 0.5 = original rain death. 1 = heavy short streams (still spawn)."
      },
      {
        key: "brightness",
        label: "Bright",
        defaultValue: "1",
        min: "0",
        mid: "1",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Live tip / present gain 0–1 (1 = full). Residual deposit peak is Bright × Burn ⨉. Hang is Ghost/Trail."
      },
      {
        key: "ghost",
        label: "Ghost",
        defaultValue: "0.45",
        min: "0",
        mid: "0.45",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Extreme analog (super-exp) residual hang 0…1 (not brightness). Long dim trails live here. Trail 0 = Ghost only (this control is the whole hang)."
      },
      {
        key: "trail",
        label: "Trail",
        defaultValue: "0.5",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Mix from Ghost-only toward linear, then freeze. 0 = Ghost only; 0.5 = half linear / half Ghost; 0.75 = full linear fade; 1 = freeze. Ghost is ignored above 0.75."
      },
      {
        key: "burn",
        label: "Burn",
        defaultValue: "0",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Sticky residual floor 0…1. 0 = no stick; 0.5 = once energy ≥ 0.5 the pixel freezes at that floor; 1 = freeze all residual. Off by default."
      },
      {
        key: "burnAmount",
        label: "Burn ⨉",
        defaultValue: "1",
        min: "0",
        mid: "1",
        max: "4",
        step: "any",
        maxDigits: 4,
        tooltip: "Residual deposit gain vs Bright (default 1). Deposit peak = Bright × this. 0.3 = dim long hang (with Ghost); 1 = deposit at Bright. Live tip stays Bright."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "freeze",
        label: "Freeze",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  // Matrix Display — Info plate + Serial Char+Trigger bins. No rain.
  // Message + gradient in Display Settings. In sample for Info value row.
  matrixDisplay: {
    planRole: "monitor",
    bufferedInputs: ["In", "Char", "Trigger", "Reset"],
    customDisplayArea: true,
    defaultWidthGu: 12,
    displayHeightGu: 8,
    digitalInputs: ["Char", "Trigger", "Reset"],
    displayType: "matrixDisplayFace",
    inputs: ["In", "Char", "Trigger", "Reset"],
    layout: "matrixPlate",
    // Dry passthrough so the face can sit in-line (In → face + Thru).
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [
      {
        choices: ["Info", "Serial"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "mode",
        label: "Mode",
        linearSmoothing: false,
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Info: message plate (+ optional In value). Serial: Char+Trigger bins (Text Stream)."
      },
      {
        constraint: "gpu",
        key: "density",
        label: "Density",
        defaultValue: "0.55",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Glyph field density. Low = bigger characters; high = smaller. One character per cell. Density change remaps phosphor (does not wipe)."
      },
      {
        key: "brightness",
        label: "Bright",
        defaultValue: "1",
        min: "0",
        mid: "1",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Live / present gain 0–1 (1 = full). Residual deposit peak is Bright × Burn ⨉."
      },
      {
        key: "ghost",
        label: "Ghost",
        defaultValue: "0.45",
        min: "0",
        mid: "0.45",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Extreme analog (super-exp) residual hang 0…1 (not brightness). Long dim trails live here."
      },
      {
        key: "trail",
        label: "Trail",
        defaultValue: "0.5",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Mix from Ghost-only toward linear, then freeze. 0 = Ghost only; 0.5 = half linear / half Ghost; 0.75 = full linear fade; 1 = freeze. Ghost is ignored above 0.75."
      },
      {
        key: "burn",
        label: "Burn",
        defaultValue: "0",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Sticky residual floor 0…1. 0 = no stick; 0.5 = once energy ≥ 0.5 freezes at that floor; 1 = freeze all residual. Off by default."
      },
      {
        key: "burnAmount",
        label: "Burn ⨉",
        defaultValue: "1",
        min: "0",
        mid: "1",
        max: "4",
        step: "any",
        maxDigits: 4,
        tooltip: "Residual deposit gain vs Bright (default 1). Deposit peak = Bright × this. Live plate light is unchanged."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "freeze",
        label: "Freeze",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ],
    visualInputs: [
      { key: "matrixDisplay", label: "In", port: "In" },
    ],
    visualSink: true
  },
  // Text Stream — type text, emit one character at a time (digital Char + Trigger).
  textStream: {
    planRole: "monitor",
    customDisplayArea: true,
    defaultWidthGu: 12,
    displayHeightGu: 6,
    digitalInputs: ["Clock", "Reset"],
    digitalOutputs: ["Char", "Trigger", "Index"],
    inputs: ["Clock", "Reset"],
    layout: "textStream",
    outputs: ["Char", "Trigger", "Index"],
    parameters: [
      {
        key: "rate",
        label: "Rate",
        defaultValue: "8",
        min: "0",
        mid: "8",
        max: "60",
        step: "any",
        maxDigits: 4,
        unit: "Hz",
        tooltip: "Free-run characters per second when Clock is unpatched. Ignored if Clock is wired."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "loop",
        label: "Loop",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ]
  },
  // Asciiscope — XY character-grid phosphor (standalone asciiscope console plot/fade).
  // Glyph ramp = phosphor tail; Decay / Burn = age memory. Layout id "matrixDisplay" is historical.
  // displayType selfPaintFace: same as Matrix — own rAF canvas, no Trace overlay.
  asciiscope: {
    planRole: "monitor",
    bufferedInputs: ["X", "Y"],
    customDisplayArea: true,
    defaultWidthGu: 14,
    displayHeightGu: 10,
    displayType: "selfPaintFace",
    inputs: ["X", "Y"],
    layout: "matrixDisplay",
    // Dry X/Y thrus so the face can sit in-line on XY patches.
    outputs: ["X", "Y"],
    parameters: [
      {
        constraint: "gpu",
        key: "density",
        label: "Density",
        defaultValue: "0.7",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Glyph field density. Low = bigger characters; high = smaller. One character per cell. Density change remaps ages (does not wipe)."
      },
      {
        key: "trail",
        label: "Trail",
        defaultValue: "0.78",
        min: "0",
        mid: "0.65",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "How long residual hangs. 0 = no trail (wipe); 1 ≈ freeze. Sticky floor is Burn."
      },
      {
        key: "ghost",
        label: "Ghost",
        defaultValue: "0.35",
        min: "0",
        mid: "0.35",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Extreme analog (super-exp) residual hang. Not brightness. Sticky floor is Burn."
      },
      {
        key: "burn",
        label: "Burn",
        defaultValue: "0",
        min: "0",
        mid: "0.5",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Sticky residual floor 0…1. 0 = none stick; 0.5 = once energy ≥ 0.5 freezes at that floor; 1 = all residual freezes. Off by default."
      },
      {
        key: "brightness",
        label: "Brightness",
        defaultValue: "1",
        min: "0",
        mid: "1",
        max: "1",
        step: "any",
        maxDigits: 4,
        tooltip: "Deposit + present gain 0–1 (1 = full). Residual hang is Ghost/Trail; sticky floor is Burn."
      },
      {
        key: "blackFloor",
        label: "Black Floor",
        defaultValue: "0",
        min: "0",
        mid: "2",
        max: "8",
        nonlinearSlider: false,
        step: "1",
        tooltip: "Ages at or below this draw blank (hides cold trail dust)."
      },
      {
        choices: ["Off", "On"],
        defaultValue: "0",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "freeze",
        label: "Freeze",
        linearSmoothing: false,
        max: "1",
        mid: "0.5",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
    ],
    visualInputs: [
      { key: "asciiX", label: "X", port: "X" },
      { key: "asciiY", label: "Y", port: "Y" },
    ],
    visualSink: true
  },
  valueOscilloscope: {
    planRole: "monitor",
    bufferedInputs: ["In"],
    displayHeightGu: 5,
    displayType: "value",
    inputs: ["In"],
    layout: "traceDisplay",
    // Dry passthrough so the face can sit in-line (In → face + Thru).
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "valueOscilloscope", label: "In", port: "In" },
    ],
    visualSink: true
  },
  // numberReadout (Value LED) + valueLcd: solid chromeless registration.
  lineBurnOscilloscope: {
    planRole: "monitor",
    bufferedInputs: ["In", "Reset"],
    displayType: "lineBurn",
    inputs: ["In", "Reset"],
    layout: "traceDisplay",
    // Dry passthrough so the face can sit in-line (In → face + Thru).
    outputs: ["Thru"],
    outputLabels: { Thru: "←" },
    parameters: [],
    visualInputs: [
      { key: "lineBurnOscilloscope", label: "In", port: "In" },
      { key: "lineBurnReset", label: "Reset", port: "Reset" },
    ],
    visualSink: true
  },
  scope2d: {
    planRole: "monitor",
    bufferedInputs: ["X", "Y"],
    displayHeightGu: 5,
    displayType: "scope2d",
    inputs: ["X", "Y"],
    layout: "traceDisplay",
    // Dry X/Y thrus so the face can sit in-line on XY patches.
    outputs: ["X", "Y"],
    parameters: [],
    visualInputs: [
      { key: "scope2dX", label: "X", port: "X" },
      { key: "scope2dY", label: "Y", port: "Y" },
    ],
    visualSink: true
  },
  // Legacy alias of scope2d (2D Phosphor). Hidden from shop; patches migrate
  // to type "scope2d" on load. Kept so mid-session / odd loaders still resolve.
  phosphorLight: {
    planRole: "monitor",
    bufferedInputs: ["X", "Y"],
    displayHeightGu: 5,
    displayType: "scope2d",
    inputs: ["X", "Y"],
    layout: "traceDisplay",
    // Dry X/Y thrus so the face can sit in-line on XY patches.
    outputs: ["X", "Y"],
    parameters: [],
    visualInputs: [
      { key: "scope2dX", label: "X", port: "X" },
      { key: "scope2dY", label: "Y", port: "Y" },
    ],
    visualSink: true
  },
  scope2dTrace: {
    planRole: "monitor",
    bufferedInputs: ["X", "Y"],
    displayHeightGu: 5,
    displayType: "scope2dTrace",
    inputs: ["X", "Y"],
    layout: "traceDisplay",
    // Dry X/Y thrus so the face can sit in-line on XY patches.
    outputs: ["X", "Y"],
    parameters: [],
    visualInputs: [
      { key: "scope2dTraceX", label: "X", port: "X" },
      { key: "scope2dTraceY", label: "Y", port: "Y" },
    ],
    visualSink: true
  },
  vectorRgb: {
    planRole: "monitor",
    bufferedInputs: ["X", "Y", "R", "G", "B", "Blank"],
    displayHeightGu: 5,
    displayType: "vectorRgbFace",
    displayModes: [
      {
        key: "vectorRgbFace",
        label: "RGB",
        renderer: "vectorRgbFace",
        settingsSchema: "vectorRgbFace",
        source: { x: "X", y: "Y" },
      },
    ],
    inputs: ["X", "Y", "R", "G", "B", "Blank"],
    inputLabels: { X: "X", Y: "Y", R: "R", G: "G", B: "B", Blank: "Blk" },
    layout: "traceDisplay",
    outputs: ["X", "Y", "R", "G", "B"],
    outputLabels: { X: "X", Y: "Y", R: "R", G: "G", B: "B" },
    parameters: [],
    visualInputs: [
      { key: "vectorRgbX", label: "X", port: "X" },
      { key: "vectorRgbY", label: "Y", port: "Y" },
      { key: "vectorRgbR", label: "R", port: "R" },
      { key: "vectorRgbG", label: "G", port: "G" },
      { key: "vectorRgbB", label: "B", port: "B" },
    ],
    visualSink: true,
  },
  rasterRgb: {
    planRole: "processor",
    bufferedInputs: ["R", "G", "B"],
    displayHeightGu: 5,
    displayType: "rasterRgbFace",
    displayModes: [
      {
        key: "rasterRgbFace",
        label: "RGB",
        renderer: "rasterRgbFace",
        settingsSchema: "rasterRgbFace",
        source: { value: "R" },
      },
    ],
    inputs: ["R", "G", "B"],
    inputLabels: { R: "R", G: "G", B: "B" },
    layout: "traceDisplay",
    outputs: ["R", "G", "B", "rgba"],
    outputLabels: { R: "R", G: "G", B: "B", rgba: "📺" },
    parameters: [
      {
        curveAmount: "0.55",
        defaultValue: "96",
        key: "width",
        label: "Width",
        max: "512",
        maxDigits: 0,
        mid: "96",
        min: "0",
        modClamp: false,
        nonlinearSlider: true,
        sliderCurve: "custom",
        step: "1",
        tooltip: "Grid width in pixels. Integer. Slider is finer near 0 (Parameter Settings → Sensitivity).",
      },
      {
        curveAmount: "0.55",
        defaultValue: "54",
        key: "height",
        label: "Height",
        max: "512",
        maxDigits: 0,
        mid: "54",
        min: "0",
        modClamp: false,
        nonlinearSlider: true,
        sliderCurve: "custom",
        step: "1",
        tooltip: "Grid height in pixels. Integer. Slider is finer near 0 (Parameter Settings → Sensitivity).",
      },
      {
        bipolar: true,
        defaultValue: "1",
        key: "contrast",
        label: "Contrast",
        max: "4",
        mid: "0",
        min: "-4",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Bipolar S-curve on R/G/B. 1 = unity. 0 = mid grey. Above 1 opens midtones. Negative is the same curve, photographically inverted (−1 = invert, −4 = inverted high contrast).",
      },
      {
        bipolar: true,
        defaultValue: "1",
        key: "brightness",
        label: "Brightness",
        max: "4",
        mid: "0",
        min: "-4",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Bipolar gain after contrast. 1 = unity. 0 = black. Above 1 lifts. Negative is the same gain, then photographic invert (−1 = invert).",
      },
      {
        defaultValue: "0",
        key: "hue",
        kind: "phase",
        label: "Hue",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        unit: "cycle",
        wraparound: true,
        tooltip: "Rotate processed RGB hue. 0 = unchanged. ±1 = full cycle. Applied after contrast/brightness/invert on the face and analog R/G/B/📺 outs.",
      },
      {
        defaultValue: "0",
        key: "blur",
        label: "Blur",
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Gaussian blur of the presented raster (canvas filter). 0 = hard pixels. Higher softens the picture.",
      },
      {
        defaultValue: "0",
        key: "glow",
        label: "Glow",
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Additive wider Gaussian bloom of the same raster. Works with or without Blur.",
      },
      {
        defaultValue: "0",
        key: "invert",
        label: "Invert",
        max: "1",
        mid: "0",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Dedicated 0…1 photographic invert mix (last). Contrast −1 or Brightness −1 already fully invert; this crossfades without moving those knobs.",
      },
    ],
    visualInputs: [
      { key: "rasterRgbR", label: "R", port: "R" },
      { key: "rasterRgbG", label: "G", port: "G" },
      { key: "rasterRgbB", label: "B", port: "B" },
    ],
    visualSink: true,
  },
  traceXyz: {
    planRole: "monitor",
    bufferedInputs: ["X", "Y", "Z"],
    displayHeightGu: 5,
    displayType: "traceXyz",
    displayModes: [
      {
        key: "traceXyz",
        label: "XYZ Trace",
        renderer: "traceXyz",
        settingsSchema: "traceXyz",
        source: { x: "X", y: "Y" },
      },
    ],
    defaultDisplayMode: "traceXyz",
    inputs: ["X", "Y", "Z"],
    inputLabels: { X: "X", Y: "Y", Z: "Z" },
    layout: "traceDisplay",
    outputs: ["X", "Y", "Z"],
    outputLabels: { X: "X", Y: "Y", Z: "Z" },
    parameters: [],
    visualInputs: [
      { key: "traceXyzX", label: "X", port: "X" },
      { key: "traceXyzY", label: "Y", port: "Y" },
      { key: "traceXyzZ", label: "Z", port: "Z" },
    ],
    visualSink: true,
  },
  gradientVectorscope: {
    planRole: "monitor",
    bufferedInputs: ["X", "Y"],
    displayHeightGu: 5,
    displayType: "gradientVectorscopeFace",
    displayModes: [
      {
        key: "gradientVectorscopeFace",
        label: "Trace",
        renderer: "gradientVectorscopeFace",
        settingsSchema: "gradientVectorscopeFace",
        source: { x: "X", y: "Y" },
      },
    ],
    inputs: ["X", "Y"],
    inputLabels: { X: "X", Y: "Y" },
    layout: "traceDisplay",
    outputs: ["X", "Y"],
    outputLabels: { X: "X", Y: "Y" },
    parameters: [],
    visualInputs: [
      { key: "gradientVectorscopeX", label: "X", port: "X" },
      { key: "gradientVectorscopeY", label: "Y", port: "Y" },
    ],
    visualSink: true,
  },
  badvalMonitor: {
    planRole: "monitor",
    // LayoutA + custom display face (resizable warning panel, ports under).
    chrome: NodeGraphModuleChromeLayout.LayoutA,
    customDisplayArea: true,
    displayHeightGu: 3,
    inputs: ["In"],
    layout: "badvalMonitor",
    monitorSink: true,
    outputs: ["Out"],
    // LayoutA status face: no param rows (even if parameters are added later).
    parameters: [],
    slidersAlwaysHidden: true
  },
  speakerProtection: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    layout: "speakerProtection",
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: []
  },
  speakerProtector2: {
    planRole: "processor",
    inputAliases: { Mono: "In" },
    inputLabels: { In: "Mono" },
    inputs: ["In", "Left", "Right"],
    outputAliases: { Mono: "Out" },
    outputLabels: { Out: "Mono" },
    outputs: ["Out", "Left", "Right"],
    parameters: [
      {
        defaultValue: "0.008",
        key: "dropSeconds",
        label: "Drop",
        max: "0.05",
        mid: "0.008",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "s",
        tooltip: "How fast gain slews to mute when the high-pass detector trips."
      },
      {
        defaultValue: "0.333",
        key: "holdSeconds",
        label: "Hold",
        max: "2",
        mid: "0.333",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "s",
        tooltip: "How long to stay muted after the last danger sample."
      },
      {
        defaultValue: "0.75",
        key: "riseSeconds",
        label: "Rise",
        max: "4",
        mid: "0.75",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "s",
        tooltip: "How slowly gain slews back to 1 after hold."
      },
    ]
  },
  textBox: {
    planRole: "processor",
    layout: "textBox",
    layoutOnly: true,
    displayType: "textBoxFace",
    defaultDisplayMode: "face",
    displayModes: [
      {
        key: "face",
        label: "Text Box",
        renderer: "textBoxFace",
        settingsSchema: "textBoxFace",
      },
    ],
    parameters: []
  },
  animatedTextBox: {
    planRole: "processor",
    layout: "textBox",
    layoutOnly: true,
    displayType: "textBoxFace",
    defaultDisplayMode: "face",
    displayModes: [
      {
        key: "face",
        label: "Text Box",
        renderer: "textBoxFace",
        settingsSchema: "textBoxFace",
      },
    ],
    dataInputs: ["Title", "Text"],
    dataOutputs: ["Text Out"],
    parameters: []
  },
  output: {
    planRole: "sink",
    displayType: "trace",
    // Capture Mono/Left/Right for stereo Trace (scope rings). Without this the
    // worklet only stored a scalar 0 for the speaker sink and the face stayed blank.
    visualSink: true,
    visualInputs: [
      { key: "outputMono", label: "Mono", port: "Mono" },
      { key: "outputLeft", label: "Left", port: "Left" },
      { key: "outputRight", label: "Right", port: "Right" },
    ],
    // Single fixed face — no Trace/Spectrum Mode dropdown in Display Settings.
    spectrumCompanion: false,
    displayModes: [
      { key: "trace", label: "Waterfall", renderer: "trace", settingsSchema: "trace" },
    ],
    defaultDisplayMode: "trace",
    bufferedInputs: ["Mono", "Left", "Right"],
    stereoTracePorts: { left: "Left", right: "Right" },
    inputs: ["Mono", "Left", "Right"],
    inputLabels: { Mono: "Mono", Left: "Left", Right: "Right" },
    outputAliases: { Out: "Mono", M: "Mono", L: "Left", R: "Right" },
    outputLabels: { Mono: "Mono", Left: "Left", Right: "Right" },
    outputs: ["Mono", "Left", "Right"],
    output: true,
    parameters: [
      {
        defaultValue: "-3",
        key: "volume",
        kind: "decibels",
        label: "Volume",
        max: "0",
        mid: "-3",
        min: "-140",
        minusInf: true,
        nonlinearSlider: true,
        linearSmoothing: true,
        smoothingType: "linear",
        smoothingMode: "internal",
        smoothingSeconds: 0.0333,
        step: "any",
        unit: "dB",
        tooltip: "Speaker level (−∞…0 dB). 0 dB is unity. Default −3 dB. Old patches that stored 0…1 linear Volume are converted on load. Type a dB value (or −inf)."
      },
      {
        defaultValue: "0",
        key: "pan",
        label: "Pan",
        max: "1",
        mid: "0",
        min: "-1",
        nonlinearSlider: false,
        step: "any",
        tooltip: "Stereo balance after Mono is summed in. 0 = unchanged (Mono to both). −1 = left only. +1 = right only."
      },
    ]
  },
  sinc: {
    planRole: "processor",
    displayType: "trace",
    inputs: ["0.1V/Oct", "Freq", "Phase"],
    inputAliases: {
      "0.1V": "0.1V/Oct",
      freq: "Freq",
      phase: "Phase",
      f: "Freq",
      Frequency: "Freq",
      F: "Freq",
      "ƒ": "Freq",
    },
    inputLabels: { "0.1V/Oct": "0.1V", Freq: "ƒ" },
    outputs: ["Out"],
    parameters: [
      {
        defaultValue: "0",
        key: "phase",
        kind: "phase",
        label: "Phase",
        max: "1",
        min: "0",
        step: "0.01",
        unit: "cycle",
        wraparound: true
      },
      {
        defaultValue: "100",
        key: "freq",
        kind: "frequency",
        label: "Freq",
        max: "20000",
        mid: "100",
        min: "0",
        nonlinearSlider: false,
        step: "any",
        unit: "Hz"
      },
      {
        defaultValue: "4",
        key: "lobes",
        kind: "count",
        label: "Lobes",
        max: "16",
        min: "1",
        step: "1"
      },
      {
        choices: ["Ideal", "Band Limit"],
        defaultValue: "1",
        displayChoices: true,
        divideChoicesVisibly: true,
        key: "bandLimit",
        label: "Kernel",
        linearSmoothing: false,
        max: "1",
        mid: "1",
        min: "0",
        nonlinearSlider: false,
        step: "1"
      },
        nodeGraphOutputAmplitudeParam,
    ]
  },
  // Chromeless / fully-custom-UI modules (stepGrid, led, ...) register
  // their own definition instead of it being hardcoded here -- see
  // node-graph-chromeless-module-registry.js. Each entry is sealed with
  // explicit chrome (LayoutB if solidModule, else LayoutA).
  ...nodeGraphChromelessModuleDefinitionEntries(),
});

// Text Box and Animated Text Box share the isolated widget (modules/textBox)
// and layout/sizing rules. Animated Text Box only adds Title/Text/Text Out.
function nodeGraphNodeTypeHasTextBoxLayout(type) {
  return nodeGraphModuleDefinitions[type]?.layout === "textBox";
}

const nodeGraphOutputInputPorts = Object.freeze(["Mono", "Left", "Right"]);
const nodeGraphAudioBlockSize = 512;
const nodeGraphOutputClipLimit = 0.95;
const nodeGraphTau = Math.PI * 2;
const nodeGraphPiOver2 = Math.PI / 2;
const nodeGraphPiOver4 = Math.PI / 4;

const nodeGraphGrid = Object.freeze({
  heightPx: 28,
  sizePx: 28,
  widthPx: 28
});

const nodeGraphModuleLayout = Object.freeze({
  bodyRowGapGu: 2 / 28,
  fitCushionGu: 2 / 28,
  headerHeightGu: 88 / 28,
  headerTitleRowHeightGu: 34 / 28,
  /* IO strip hugs jack rows. Extra air is only UIDEV io-to-screen / io-to-sliders. */
  ioPaddingYGu: 0,
  ioRowGapGu: 0,
  /* Match --node-signal-port-height at default --node-port-size-ratio (0.52). */
  ioRowHeightGu: 0.52,
  ioSectionMinHeightGu: 0.52,
  /* Side/top plate air vs grid (CSS --node-module-grid-inset). Bottom is half. */
  moduleGridInsetGu: 6 / 28,
  moduleScopeHeightGu: 2,
  sliderRowHeightGu: 30 / 28,
  textBoxBodyMinGu: 4
});

const nodeGraphPatchFormat = Object.freeze({
  kind: "soemdsp-sandbox-node-patch",
  version: 2
});

function nodeGraphModuleVisualInputs(type) {
  const inputs = nodeGraphModuleDefinitions[type]?.visualInputs;
  return Array.isArray(inputs) ? inputs.map((input) => ({ ...input })) : [];
}

function nodeGraphPatchNodeVisualInputs(node) {
  const patchNode = typeof node === "string" ? nodeGraphPatchNode(node) : node;
  if (patchNode?.type === "canvas") {
    return nodeGraphPatchNodeInputPorts(patchNode).map((port) => ({
      key: `canvas:${port}`,
      label: port,
      port
    }));
  }
  if (patchNode?.type === "screenSpaceShader") {
    return normalizeNodeGraphScreenSpaceShader(patchNode.screenSpaceShader).visualInputs;
  }
  return nodeGraphModuleVisualInputs(patchNode?.type);
}

function nodeGraphModuleBufferedInputs(type) {
  const inputs = nodeGraphModuleDefinitions[type]?.bufferedInputs;
  const ports = nodeGraphModuleDefinitions[type]?.inputs || [];
  return normalizeNodeGraphBufferedInputList(Array.isArray(inputs) ? inputs : [], ports);
}

function nodeGraphPatchNodeBufferedInputs(node) {
  const metadataInputs = nodeGraphModuleBufferedInputs(node?.type);
  const scriptInputs = node?.type === "canvas"
    ? normalizeNodeGraphCanvasScript(node.canvasScript).bufferedInputs
    : node?.type === "screenSpaceShader"
      ? normalizeNodeGraphScreenSpaceShader(node.screenSpaceShader).bufferedInputs
    : [];
  return normalizeNodeGraphBufferedInputList([...metadataInputs, ...scriptInputs], nodeGraphPatchNodeInputPorts(node));
}

function nodeGraphModuleGraphInputs(type) {
  const inputs = nodeGraphModuleDefinitions[type]?.graphInputs;
  return Array.isArray(inputs)
    ? inputs.map((input) => String(input || "").trim()).filter(Boolean)
    : [];
}

function nodeGraphModuleIsGraphType(type) {
  return nodeGraphModuleDefinitions[type]?.layout === "graph";
}

function nodeGraphModuleIsRealtimeOscillatorType(type) {
  return type === "osc" || type === "polyBlep" || type === "sineWavetable" || type === "sinCos" || type === "blit";
}

/**
 * True if a module may emit while its signal inputs are unconnected.
 * Declaration-first: planRole source/always/monitor/sink, planFreeRun,
 * visualSink/monitorSink, or empty inputs[].
 */
function nodeGraphModuleProducesOutputWithoutSignalInput(type) {
  const definition = nodeGraphModuleDefinitions[type];
  if (!definition) {
    return false;
  }
  if (definition.visualSink || definition.monitorSink || definition.planFreeRun === true) {
    return true;
  }
  // No declared inputs → pure free-runner / source shell.
  if (!Array.isArray(definition.inputs) || definition.inputs.length === 0) {
    return true;
  }
  const role = String(definition.planRole || "").trim();
  // Sources, monitors, sinks (Output with unwired mono), and always-evaluate shells.
  if (
    role === "source"
    || role === "always"
    || role === "monitor"
    || role === "sink"
  ) {
    return true;
  }
  if (typeof nodeGraphModuleIsPlanSourceType === "function" && nodeGraphModuleIsPlanSourceType(type)) {
    return true;
  }
  return false;
}

function nodeGraphCanonicalInputPort(type, port) {
  const value = String(port || "").trim();
  return nodeGraphModuleDefinitions[type]?.inputAliases?.[value] || value;
}

function nodeGraphCanonicalOutputPort(type, port) {
  const value = String(port || "").trim();
  return nodeGraphModuleDefinitions[type]?.outputAliases?.[value] || value;
}

function nodeGraphModuleVisualInputKey(type, port) {
  const canonicalPort = nodeGraphCanonicalInputPort(type, port);
  const match = nodeGraphModuleVisualInputs(type).find((input) => input.port === canonicalPort);
  return match?.key || "";
}
