// Single source of truth for "what modules exist": every type registered in
// nodeGraphModuleDefinitions is automatically discoverable in the Module
// Browser. Live list (not freeze-at-parse) so load order / late chromeless
// registration never leaves a real module invisible to search.
function nodeGraphModuleStoreTypesList() {
  const defs = (typeof nodeGraphModuleDefinitions === "object" && nodeGraphModuleDefinitions)
    ? nodeGraphModuleDefinitions
    : {};
  return Object.keys(defs);
}

let nodeGraphNativeModuleEntries = Object.freeze([]);
let nodeGraphNativeModuleEntriesByTarget = Object.freeze({});
let nodeGraphNativeModuleCatalogLoadStarted = false;

// Module types that appear in the Module Browser as disabled
// "under construction" cards (not spawnable from the shop). Also the
// single source of truth for suppressing expected native-engine noise:
// placeholder native shells (e.g. wall_delay) must not spam
// module-diagnostics when Live Audio loads the combined wasm.
//
// When you mark a module UC here, diagnostics + native wasm send both
// consult nodeGraphModuleTypeIsUnderConstruction / 
// nodeGraphNativeModuleRefIsUnderConstruction automatically.
const nodeGraphModuleStoreUnderConstructionTypes = Object.freeze(new Set([
  "canvas",
  "humanFilter",
  "oscilloscopeBank",
  "shootingStarTail",
  // Geometric room delay / "wall verb" — JS prototype only; native is a
  // version stub that the worklet does not wire (unsupported native module).
  "wallDelay",
  // Full-plate noise flow field experiment (not Julia / kaleidoscope).
  // Placeholder only until the flow-field design is ready.
  "output",
  "audioInput",
  "pluginInput",
  "pluginOutput",
  "pluginMidiIn",
  "pluginMidiOut",
  "groupInput",
  "groupOutput",
  "evolveField",
  // Classical formant bank (vowel / vocal tract) — placeholder until design lands.
  "formantFilter",
  // Binary counter clock (bit outs + gate) — placeholder until design lands.
  "binaryClock",
  // Space-controlled pitch object / performance controller — placeholder.
  "theremin",
  // Open Sound Control I/O bridge (Controller shelf) — placeholder.
  "osc",
  // Multi-frame wavetable oscillators — placeholders until table engine lands.
  "wavetable2d",
  "wavetable3d",
  // RGB pixel-grid experiments (stroke split, bevels, etc.) — placeholder.
  "pixelGrid",
  "chromaColor",
  "image",
  "rgbaHsla",
  "screenSpaceShader",
  // Waveguide physical model — shell exists (passthrough); full engine later.
  "waveguide",
  // Classic modulation FX
  "phaser",
  "flanger",
  "chorus",
  // Electro drum voice suite (placeholders until synthesis design lands).
  "electroKick",
  "electroSnare",
  "electroHat",
  // Flexible multi-point control grid (Modulator shelf) — placeholder.
  "flexGrid",
  // Airwindows Density-style clipper — withdrawn; do not spawn or use.
  "airClipper",
  // Chaosfly attractor / fly-like chaos (Chaos shelf) — placeholder.
  "chaosfly",
  // Sequence shelf: pattern drummer engine — placeholder.
  "drummer",
  // Musical shelf: arpeggiator — placeholder.
  "arp",
  // Sample Player: GM soundfont voices — placeholders until player/font lands.
  // GM program 5 = Electric Piano 1; GM channel 10 = percussion/drums.
  "ePiano",
  "percussion",
]));

function nodeGraphModuleTypeIsUnderConstruction(type) {
  return nodeGraphModuleStoreUnderConstructionTypes.has(String(type || "").trim());
}

/** native catalog name (snake_case) → module type (camelCase). */
function nodeGraphNativeModuleNameToType(name) {
  const raw = String(name || "").trim();
  if (!raw) {
    return "";
  }
  // wall_delay → wallDelay, human_filter → humanFilter
  return raw.replace(/_([a-z0-9])/g, (_, ch) => String(ch).toUpperCase());
}

/**
 * True when a native-module status/fault refers to an under-construction
 * module type (by targetType, moduleType, or snake_case native name).
 */
function nodeGraphNativeModuleRefIsUnderConstruction(ref = {}) {
  const targetType = String(
    ref?.targetType || ref?.moduleType || ref?.type || "",
  ).trim();
  if (targetType && nodeGraphModuleTypeIsUnderConstruction(targetType)) {
    return true;
  }
  const name = String(ref?.name || ref?.moduleName || "").trim();
  if (!name) {
    return false;
  }
  const fromName = nodeGraphNativeModuleNameToType(name);
  return Boolean(fromName && nodeGraphModuleTypeIsUnderConstruction(fromName));
}

const nodeGraphModuleGroupStorageKey = "soemdsp-sandbox.moduleGroups.v1";
const nodeGraphModuleCatalogVisibilityStorageKey = "soemdsp-sandbox.moduleCatalogVisibility.v2";

// Unified module department definitions — single source of truth for
// emoji, display label, ad copy, and backward-compatible alias resolution.
// Previously split across three separate structures (Departments array,
// DepartmentAliases map, DepartmentAds map) with emoji baked into identity
// strings and mismatched keys between them.
const nodeGraphModuleStoreDepartments = Object.freeze([
  { id: "controller",   emoji: "🕹️", label: "Controller",   symbol: "⌘",   title: "Controllers", pitch: "Input devices and control bridges for keyboards, MIDI, gamepads, and external gestures." },
  { id: "gametrigger",  emoji: "♟️", label: "Game Trigger",  symbol: "",    title: "Game Triggers", pitch: "" },
  { id: "portal",       emoji: "🌐", label: "Portal",       symbol: "IO",  title: "Portals",   pitch: "Patch boundary portals for moving left, right, and mono signal lanes between rooms, templates, and larger circuits." },
  { id: "drum",         emoji: "🥁", label: "Drum",         symbol: "▥",   title: "Drum",      pitch: "Rhythm machines, drum voices, pattern engines, and percussion control surfaces." },
  { id: "dynamics",     emoji: "⚡", label: "Dynamics",     symbol: "⚡",   title: "Dynamics",  pitch: "Power routing, level control, offsets, and response shaping for keeping a circuit alive under pressure." },
  { id: "envelope",     emoji: "📐", label: "Envelope",     symbol: "⌒",   title: "Envelope",  pitch: "Attack, decay, sustain, release, and gate-shaped motion. Make sound and visuals breathe on command." },
  // Spectral filters split by intent: textbook toolbox vs character engines.
  // Temporary names only if we rename later — these are the hard-won labels.
  { id: "scientificFilter", emoji: "💧", label: "Scientific Filter", symbol: "🔬", title: "Scientific Filter", pitch: "Textbook responses. Hz, order, clean controls — Passive, Active, EQ, Tilt, and other predictable spectral tools." },
  { id: "analogFilter",     emoji: "🎛️", label: "Analog Filter",     symbol: "≈",  title: "Analog Filter",     pitch: "Named character circuits. Timbre first — 303, Flower Child, SuperLove, and other engines with personality." },
  { id: "space",        emoji: "⛪", label: "Space",        symbol: "FX",  title: "Delay",     pitch: "Delay, reverb, distortion, and performance processors for shaping finished sound." },
  { id: "digital",      emoji: "🔬", label: "Digital",      symbol: "{ }", title: "Digital",   pitch: "Patch-local code surfaces, exact value conversion, and digital/visual programming tools inside the sandbox." },
  { id: "clock",        emoji: "⌚", label: "Sequence",     symbol: "♪",   title: "Sequence",  pitch: "Clocks, sequencers, dividers, counters, and trigger timing — everything that decides WHEN the rest of the patch fires." },
  // Pitch, scale, chord — not sample playback (that's Sample Player) and not
  // "when" (that's Sequence). G-clef mark keeps Musical distinct from 🎶 Sample Player.
  { id: "musical",      emoji: "🎼", label: "Musical",      symbol: "𝄞",  title: "Musical",  pitch: "Pitch, scale, and harmony tools: quantizers, chord pickers, progressions, and other note-theory building blocks." },
  { id: "modulator",    emoji: "♾️", label: "Modulator",    symbol: "⇄",   title: "Modulator", pitch: "Motion sources for pitch, amplitude, time, and texture. Small control engines that make patches move." },
  { id: "additive",     emoji: "📊", label: "Additive",     symbol: "∑",   title: "Additive",   pitch: "Additive voices and oscillators: harmonic stacks, table tones, and the raw signal that everything else learns to orbit." },
  { id: "chaos",        emoji: "🌌", label: "Chaos",        symbol: "∞",   title: "Chaos",     pitch: "All the various attractors and strange motion systems. The wild shelf where math starts looking back." },
  { id: "jerobeam",     emoji: "♻️", label: "Jerobeam",     symbol: "JRB", title: "Jerobeam",  pitch: "Jerobeam spiral and orbit motion systems. Spiral Generator lives here." },
  { id: "noise",        emoji: "🌧️", label: "Noise",        symbol: "✦",   title: "Noise",     pitch: "Noise, dust, instability, sparks, and all the useful mess a clean machine secretly needs." },
  // Was "Music" (playback only). Sample Player holds Music Player / sample modules.
  // 🎶 reused so the shelf still reads as the audio-file family, not theory.
  // Samples / Grains / Media shelves stay offline until file storage exists.
  { id: "sample",       emoji: "🎶", label: "Sample Player", symbol: "▣", title: "Sample Player", pitch: "Sample and music-file playback: one-shots, loops, and scrubbable players that turn stored audio into patch signal." },
  { id: "object",       emoji: "🧊", label: "Object",       symbol: "●",   title: "Object",    pitch: "Things you place in the world rather than wire into the signal path -- indicator lights, label plates, and other in-world props." },
  { id: "rgb",          emoji: "🌈", label: "RGB",          symbol: "◍",   title: "RGB",       pitch: "RGB analog picture and vector faces — Raster RGB, Vector RGB, and other color-path scopes." },
  { id: "rgba",         emoji: "🖼️", label: "RGBA",         symbol: "▣",   title: "RGBA",      pitch: "Color-space, image, and screen-wash modules — RGBA/HSLA, chroma, stills, and screen-space shaders." },
  { id: "oscilloscope", emoji: "📺", label: "Oscilloscope", symbol: "OSC", title: "Oscilloscope", pitch: "Dedicated display testbeds for trace, line burn, 2D scope, videoscope, and canvas-style waveform inspection." },
  { id: "multimeter",   emoji: "📟", label: "Multimeter",   symbol: "0D",  title: "Multimeter", pitch: "Readouts that are not waveforms: numbers, character grids, and other value/message faces for what the signal is saying right now." },
  { id: "debug",        emoji: "🐞", label: "Debug",        symbol: "DBG", title: "Debug",     pitch: "Inspection tools, sentinels, and safety monitors for catching bad values while a patch is under test." },
  { id: "plugin",       emoji: "🔌", label: "Plugin",       symbol: "PLG", title: "Plugin",    pitch: "Performance controls and boundary ports: knobs, sliders, buttons, dedicated audio I/O, and MIDI I/O for building clear patch front-ends." },
]);

// Fast lookup: department ID → definition object.
const nodeGraphModuleStoreDepartmentById = Object.freeze(
  nodeGraphModuleStoreDepartments.reduce((map, dep) => {
    map[dep.id] = dep;
    return map;
  }, {}),
);

// Set of valid department IDs — used by settings persistence validation.
const nodeGraphModuleStoreDepartmentIds = Object.freeze(
  new Set(nodeGraphModuleStoreDepartments.map((dep) => dep.id)),
);

// Backward-compatible: maps old bare-name category strings (from the catalog
// entries and from the previous DepartmentAliases map) to canonical IDs.
const nodeGraphModuleStoreDepartmentAliasToId = Object.freeze({
  Arpeggiator:       "clock",
  Audio:             "sample",
  "Audio Player":    "sample",
  Chaos:             "chaos",
  Controllers:       "controller",
  Debug:             "debug",
  Delay:             "space",
  Digital:           "digital",
  Drum:              "drum",
  Dynamics:          "dynamics",
  Envelope:          "envelope",
  Filter:            "scientificFilter",
  filter:            "scientificFilter",
  "Scientific Filter": "scientificFilter",
  scientificFilter:  "scientificFilter",
  "Analog Filter":   "analogFilter",
  analogFilter:      "analogFilter",
  Analog:            "analogFilter",
  "Game Triggers":   "gametrigger",
  // grains / media / samples shelves hidden until file storage — aliases no-op to sample if seen.
  Grains:            "sample",
  grains:            "sample",
  Harmony:           "musical",
  Media:             "sample",
  media:             "sample",
  Jerobeam:          "jerobeam",
  // "LED" was this department's own name before it widened to Object; keep the
  // alias so stored settings and old patches still resolve.
  LED:               "object",
  Object:            "object",
  Loops:             "sample",
  Modulator:         "modulator",
  Modulators:        "modulator",
  Multimeter:        "multimeter",
  // Retired shelf id "music" (playback) → Sample Player. Theory tools → Musical.
  Music:             "sample",
  music:             "sample",
  Musical:           "musical",
  Noise:             "noise",
  Additive:          "additive",
  additive:          "additive",
  Oscillator:        "additive",
  oscillator:        "additive",
  Oscilloscope:      "oscilloscope",
  Other:             "digital",
  Portals:           "portal",
  Plugin:            "plugin",
  plugin:            "plugin",
  RGB:               "rgb",
  RGBA:              "rgba",
  rgba:              "rgba",
  Sample:            "sample",
  "Sample Player":   "sample",
  Samples:           "sample",
  samples:           "sample",
  Sequence:          "clock",
  sequence:          "clock",
  Sequencer:         "clock",
  Clock:             "clock",
  clock:             "clock",
  Time:              "clock",
  // Category id stays "clock" (persistence); shelf label is Sequence.
  // Renamed 2026-07-25 from Time; label Clock→Sequence 2026-08.
  time:              "clock",
  Visual:            "digital",
});

const nodeGraphModuleStoreCatalog = Object.freeze({
  polyBlep: {
    category: "additive",
    description: "Clean multi-wave oscillator when you want saw/square/tri/sine without harsh aliasing.",
    label: "PolyBLEP",
    notes: ["anti-aliasing", "polyblep", "realtime oscillator"],
  },
  blit: {
    category: "additive",
    description: "Band-limited impulse-train tones for classic digital waves that stay sharp but controlled.",
    label: "BLIT",
    notes: ["anti-aliasing", "blit", "realtime oscillator"],
  },
  archimedes: {
    category: "additive",
    description: "Cheap quadrature sine/cosine pair (and a novelty π readout) for modulation and math demos.",
    label: "Archimedes",
    notes: ["quadrature", "fixed-point", "realtime oscillator"],
  },
  bradley2a: {
    category: "object",
    description: "Broken-line test tone: add jitter, hits, dropouts, and interference for character and stress tests.",
    label: "Bradley 2A Jitter/Hit Synth",
    notes: ["test-tone impairment", "jitter", "frequency translation", "native"],
  },
  antisaw: {
    category: "additive",
    description: "Cooked “aliasing on purpose” saw color—fold Nyquist junk into musical in-band grit.",
    label: "Antisaw",
    notes: ["simulated aliasing", "additive resynthesis", "reflections", "native"],
  },
  sineWavetable: {
    category: "additive",
    description: "Straightforward pitchable sin/cos voice when you need a clean table sine with amplitude control.",
    label: "SinCos",
    notes: ["implemented", "wavetable", "sin/cos", "native"],
  },
  wavetable2d: {
    category: "additive",
    description: "Placeholder: multi-frame 2D wavetable morph—use later for evolving table tones.",
    label: "Wavetable2D",
    notes: ["under construction", "wavetable", "2d", "morph", "oscillator", "frame"],
  },
  wavetable3d: {
    category: "additive",
    description: "Placeholder: dual-axis morph wavetable—use later for deep table morphs.",
    label: "Wavetable3D",
    notes: ["under construction", "wavetable", "3d", "morph", "volume", "oscillator"],
  },
  sinc: {
    category: "additive",
    description: "Impulse-like sinc tones for modulation sources or teaching resampling / band-limit ideas.",
    label: "Sinc",
    notes: ["sinc", "sin(x)/x", "impulse", "oscillator"],
  },
  osc: {
    category: "additive",
    description: "Everyday multi-wave starter oscillator with pitch CV—default voice for quick patches.",
    label: "BasicShape",
    notes: ["BasicShape", "multi-waveform", "cv input", "LFO"],
  },
  aliasSine: {
    category: "additive",
    description: "Raw sine that intentionally wraps past Nyquist—hear aliasing as a feature, not a bug.",
    label: "Alias Sine",
    notes: ["sine", "aliasing", "native"],
  },
  robinSinusoid: {
    category: "additive",
    description: "Ultra-cheap recursive sine when you want steady tone with almost no CPU cost.",
    label: "RobinSinusoid",
    notes: ["RS-MET", "rosic", "recursive sine", "self-oscillating", "sinusoid"],
  },
  additiveOsc: {
    category: "additive",
    description: "Build timbres from harmonics—use for organ-ish, bell-ish, or carefully voiced spectra.",
    label: "Additive Osc",
    notes: ["additive synthesis", "harmonics", "native"],
  },
  gpuAdditiveOsc: {
    category: "additive",
    description: "GPU additive voice when you want heavy harmonic stacks without maxing the audio thread.",
    label: "GPU Additive",
    notes: ["additive synthesis", "gpu"],
  },
  ellipsoid: {
    category: "modulator",
    description: "Sine→square ellipse shapes for soft-to-hard tones and dual uni/bi X/Y outs.",
    label: "RoundShape",
    notes: ["RoundShape", "getSineToSquare", "Uni X", "Uni Y", "Bi X", "Bi Y", "Limit AA", "f", "native"],
  },
  ellipsoidOsc: {
    category: "additive",
    description: "Full parametric ellipsoid path for rich 2D-scope-friendly oscillators.",
    label: "Ellipsoid",
    notes: ["ellipsoid", "offset", "shape", "scale", "Limit AA", "X/Y", "native"],
  },
  clock: {
    category: "clock",
    description: "Free-running pulse clock to drive sequencers, envelopes, and rhythmic events.",
    notes: ["rate and phase control", "duty cycle", "reset input"],
  },
  transport: {
    category: "clock",
    description: "BPM-locked square clocks so everything stays in time with the project tempo.",
    label: "Transport",
    notes: ["project BPM", "beat divisions", "engine-start phase"],
  },
  clockDivider: {
    category: "clock",
    description: "Slow a clock down for subdivisions—half-time gates, bar pulses, lazy LFOs.",
    notes: ["clock input", "division control", "reset input"],
  },
  delayedTrigger: {
    category: "clock",
    description: "Wait after a hit, then fire—post-roll triggers, delayed envelopes, timed one-shots.",
    notes: ["delayed pulse", "reset input", "one-shot timing"],
  },
  randomClock: {
    category: "clock",
    description: "Irregular triggers with duty control—organic rhythm, humanized gates, surprise hits.",
    notes: ["random timing", "trigger and gate outputs", "reset input"],
  },
  triggerCounter: {
    category: "clock",
    description: "Count pulses and wrap—use for bars, loops, or stepped modulation from rhythm.",
    notes: ["count pulses", "wrap output", "reset input"],
  },
  triggerDivider: {
    category: "clock",
    description: "Divide incoming triggers into slower clocks for sequences and envelopes.",
    notes: ["trigger division", "reset input", "pulse width"],
  },
  minMax: {
    category: "dynamics",
    description: "Pick the highest and lowest of several signals—peak tracking, dual-range CV, or selector logic.",
    label: "Min/Max",
    notes: ["Doepfer A-172", "voltage selector", "native"],
  },
  comparator: {
    category: "digital",
    description: "Detect rises/falls and polarity—edge triggers, change detect, and sign gates.",
    label: "Comparator",
    notes: ["edge detect", "up", "down", "change", "steady", "sign", "native"],
  },
  sampleDelay: {
    category: "utility",
    description: "Precise dry/wet delay in time or samples for comb, predelay, or synced echos.",
    label: "Sample Delay",
    notes: ["delay", "samples", "time", "thru", "delayed", "native"],
  },
  bitConverter: {
    category: "digital",
    description: "Bridge integer bitmasks ↔ CV so digital key masks can modulate audio-rate paths.",
    label: "BitConverter",
    notes: ["normalize", "0..1", "-1..1", "bitmask"],
  },
  gate12: {
    category: "digital",
    description: "Decode Analog and Digital into analog 0–1 gates 0–12. A and D can each light one outlet.",
    label: "12Gate",
    notes: ["decoder", "gate", "12gate", "keypad", "0-12"],
  },
  gate8: {
    category: "digital",
    description: "Decode Analog and Digital into analog 0–1 gates 0–8. A and D can each light one outlet.",
    label: "8Gate",
    notes: ["decoder", "gate", "8gate", "0-8"],
  },
  gate6: {
    category: "digital",
    description: "Decode Analog and Digital into analog 0–1 gates 0–6. A and D can each light one outlet.",
    label: "6Gate",
    notes: ["decoder", "gate", "6gate", "0-6"],
  },
  gate4: {
    category: "digital",
    description: "Decode Analog and Digital into analog 0–1 gates 0–4. A and D can each light one outlet.",
    label: "4Gate",
    notes: ["decoder", "gate", "4gate", "0-4"],
  },
  gate3: {
    category: "digital",
    description: "Decode Analog and Digital into analog 0–1 gates 0–3. A and D can each light one outlet.",
    label: "3Gate",
    notes: ["decoder", "gate", "3gate", "0-3"],
  },
  gate2: {
    category: "digital",
    description: "Decode Analog and Digital into analog 0–1 gates 0–2. A and D can each light one outlet.",
    label: "2Gate",
    notes: ["decoder", "gate", "2gate", "0-2"],
  },
  stepSequencer: {
    category: "clock",
    description: "Classic stepped values under clock—melodies, parameter automation, and rhythmic CV.",
    notes: ["trigger input", "reset input", "stepped modulation"],
  },
  // stepGrid registers its own catalog entry from public/modules/stepGrid/
  // step-grid-register.js -- see node-graph-chromeless-module-registry.js.
  chordPad: {
    category: "musical",
    description: "Pick diatonic chords fast and feed Scale/Root/Gate into quantizers and musical engines.",
    label: "Chord Pad",
    notes: ["chord", "diatonic", "scale mask", "root", "pitch quantizer", "pads"],
  },
  chordSequencer: {
    category: "musical",
    description: "Clock through progressions for automatic harmony that drives the rest of the pitch chain.",
    label: "Chord Sequencer",
    notes: ["chord progression", "scale mask", "root", "ping-pong", "key"],
  },
  lutCell: {
    category: "digital",
    description: "FPGA-style truth table + flip-flop—build custom digital logic and weird gate patterns.",
    label: "LUT Cell",
    notes: ["FPGA logic slice", "lookup table", "flip-flop", "digital signal"],
  },
  metallicRatio: {
    category: "modulator",
    description: "Golden/silver/bronze ratios for detune spreads, delay lengths, or harmonic spacing.",
    label: "Metallic Ratio",
    notes: ["RS-MET tribute", "metallic mean", "golden ratio", "Robin Schmidt"],
  },
  chordMemory: {
    category: "musical",
    description: "Capture a chord stack from monophonic pitch and walk or mutate the latched notes.",
    label: "Chord Memory",
    notes: ["latch", "mono to chord", "shuffle bag", "mutate walk", "trigger"],
  },
  turingMachine: {
    category: "digital",
    description: "Evolving CV/melody register—semi-random sequences that slowly corrode over time.",
    label: "Turing Machine",
    notes: ["generative", "shift register", "scale mask", "pitch from scale"],
  },
  pitchQuantizer: {
    category: "musical",
    description: "Snap free pitch CV to a scale so walkers and LFOs land on musical notes.",
    label: "Pitch Quantizer",
    notes: ["quantizer", "scale keyboard", "0.1v/oct", "pitch class mask", "melody from chaos"],
  },
  degreeTuring: {
    category: "musical",
    description: "Scale-degree Turing melody—mutate within a key instead of raw voltage.",
    label: "Degree Turing",
    notes: ["generative melody", "scale degrees", "mutating loop", "mono"],
  },
  gravityWalker: {
    category: "musical",
    description: "Stepwise scale walker with occasional leaps—melodies that prefer neighbors but escape ruts.",
    label: "Gravity Walker",
    notes: ["melodic walker", "gravity", "leap", "mono", "scale"],
  },
  degreePhrase: {
    category: "musical",
    description: "Loop an 8-step degree phrase that can slowly mutate—aging riffs, not classic arps.",
    label: "Degree Phrase",
    notes: ["phrase", "degrees", "rests", "mutate", "mono"],
  },
  noteGlide: {
    category: "musical",
    description: "Portamento/slew on 0.1V/oct so pitch moves slide instead of jump.",
    label: "Note Glide",
    notes: ["portamento", "slew", "0.1v/oct"],
  },
  noteTranspose: {
    category: "musical",
    description: "Shift pitch by semitones/octaves after quantizers or before oscillators.",
    label: "Note Transpose",
    notes: ["transpose", "octave", "semitone"],
  },
  surgeOscillator: {
    category: "additive",
    description: "Hard-sync multi-wave oscillator for aggressive locked-tone leads and bass.",
    label: "Surge Oscillator",
    notes: ["oscillator", "hard sync", "polyblep", "anti-aliasing", "native"],
  },
  softwaveOsc: {
    category: "additive",
    description: "Soft-shaped multi-wave voice when you want warm morphing waves, not a distortion box.",
    label: "Softwave Oscillator",
    notes: ["softwave", "tube", "tanh", "morph", "analog waves", "walter"],
  },
  curveOsc: {
    category: "additive",
    description: "Play math curves (rose, Lissajous, etc.) as mono audio or X/Y scope art.",
    label: "Curve Oscillator",
    notes: ["2d to 1d", "project", "lissajous", "rose", "butterfly", "superformula", "parametric", "xy"],
  },
  snowflake: {
    category: "additive",
    description: "Fractal turtle paths as stereo X/Y—ornamental motion and strange stereo voices.",
    label: "Snowflake",
    notes: ["L-system", "turtle", "Koch", "fractal pattern synthesis", "RS-MET", "X/Y", "native", "wasm"],
  },
  dsfOscillator: {
    category: "additive",
    description: "Alias-free DSF kit (sine/saw/PWM/etc.) for clean digital tones with classic PWM tools.",
    label: "DSF Oscillator",
    notes: ["oscillator", "dsf", "discrete summation formula", "anti-aliasing", "0.1V/Oct", "phase CV", "amplitude CV", "native"],
  },
  robinSupersaw: {
    category: "additive",
    description: "Detuned multi-saw wall with pitch dither—huge pads and trance supersaws.",
    label: "RobinSupersaw",
    notes: ["oscillator", "supersaw", "pitch dithering", "anti-aliasing", "native"],
  },
  hypersaw: {
    category: "additive",
    description: "Massive phase-spread saw bank for dense stereo supersaw beds and visual phase columns.",
    label: "Hypersaw",
    notes: ["oscillator", "supersaw", "polyblep", "anti-aliasing", "native", "phosphor display"],
  },
  spiral: {
    category: "jerobeam",
    description: "Jerobeam spiral X/Y/Z motion for scopes, lasers, and audiovisual flight paths.",
    label: "Jerobeam Spiral",
    notes: ["attractor motion", "rotation", "density and morph controls", "native"],
  },
  fractalSpiral: {
    category: "jerobeam",
    description: "Self-similar fractal spiral motion when plain spirals feel too simple.",
    label: "Fractal Spiral",
    notes: ["fractal", "self-similar", "logarithmic spiral", "Weierstrass function", "native"],
  },
  logSpiral: {
    category: "jerobeam",
    description: "Perfect equiangular spiral—constant growth look for clean geometric motion.",
    label: "Logarithmic Spiral",
    notes: ["logarithmic spiral", "equiangular spiral", "self-similar", "native"],
  },
  blubb: {
    category: "jerobeam",
    description: "Placeholder Jerobeam Blubb motion—reserved for future curve engine.",
    label: "Jerobeam Blubb",
    notes: ["placeholder", "jerobeam"],
  },
  boing: {
    category: "jerobeam",
    description: "Placeholder Jerobeam Boing motion—reserved for future bounce/curve engine.",
    label: "Jerobeam Boing",
    notes: ["placeholder", "jerobeam"],
  },
  keplerBouwkamp: {
    category: "jerobeam",
    description: "Nested polygon spiral for structured X/Y geometric patterns.",
    label: "Jerobeam Kepler-Bouwkamp",
    notes: ["nested polygons", "spiral", "jerobeam"],
  },
  mushroom: {
    category: "jerobeam",
    description: "Placeholder Jerobeam Mushroom motion—reserved for future curve engine.",
    label: "Jerobeam Mushroom",
    notes: ["placeholder", "jerobeam"],
  },
  nyquistShannon: {
    category: "jerobeam",
    description: "Placeholder Jerobeam Nyquist-Shannon motion—reserved for future curve engine.",
    label: "Jerobeam NyquistShannon",
    notes: ["placeholder", "jerobeam"],
  },
  radar: {
    category: "jerobeam",
    description: "Placeholder Jerobeam Radar motion—reserved for future sweep/curve engine.",
    label: "Jerobeam Radar",
    notes: ["placeholder", "jerobeam"],
  },
  torus: {
    category: "jerobeam",
    description: "Placeholder Jerobeam Torus motion—reserved for future 3D-path engine.",
    label: "Jerobeam Torus",
    notes: ["placeholder", "jerobeam"],
  },
  wirdoSpiral: {
    category: "jerobeam",
    description: "Placeholder Jerobeam WirdoSpiral—reserved for future wild spiral engine.",
    label: "Jerobeam WirdoSpiral",
    notes: ["placeholder", "jerobeam"],
  },
  lorenzAttractor: {
    category: "chaos",
    description: "Butterfly chaos for organic X/Y trails, modulation, and never-quite-repeating motion.",
    label: "Lorenz Attractor",
    notes: ["butterfly attractor", "3D chaos", "X/Y/Z motion", "native"],
  },
  logisticMap: {
    category: "chaos",
    description: "One-knob chaos (R): steady → periodic → wild—great for CV and teaching chaos.",
    label: "Logistic Map",
    notes: ["chaos", "bifurcation", "one parameter chaos", "discrete map"],
  },
  henonMap: {
    category: "chaos",
    description: "Angular 2D digital chaos for spikier, more “computery” motion than continuous attractors.",
    label: "Henon Map",
    notes: ["chaos", "discrete map", "2D attractor"],
  },
  // rayBouncer: chromeless catalog (public/modules/rayBouncer/*-register.js).
  chuaAttractor: {
    category: "chaos",
    description: "Double-scroll chaos with a different lobe feel than Lorenz—another chaotic CV palette.",
    label: "Chua Attractor",
    notes: ["double scroll", "circuit chaos", "3D attractor"],
  },
  chaosfly: {
    category: "chaos",
    description: "Placeholder Chaosfly attractor—fly-like chaotic X/Y/Z motion (under construction).",
    label: "Chaosfly",
    notes: ["under construction", "chaos", "attractor", "fly", "X/Y/Z", "modulation"],
  },
  noiseGenerator: {
    category: "noise",
    description: "Stereo noise colors (white/pink/brown/etc.) for texture, percussion, and dither.",
    notes: ["stereo output", "uniform to gaussian", "seed control", "native"],
  },
  randomWalk: {
    category: "modulator",
    description: "Controlled wander CV—smooth drift, steps, or filtered noise motion for parameters.",
    notes: ["bounded walk", "jitter curve", "one-pole smoothing", "native"],
  },
  fractalBrownianNoise: {
    category: "noise",
    description: "Layered fBm drift for natural multi-scale organic modulation.",
    label: "Fractal Brownian Motion",
    notes: ["out x/y/z", "seeded value noise", "slow terrain motion"],
  },
  piSpigotNoise: {
    category: "noise",
    description: "Noise from π digits with color shaping—quirky stereo texture that never hard-loops.",
    label: "Pi Spigot Noise",
    notes: ["real pi digits", "stereo independent seeds", "noise color", "gaussian smoothing", "native"],
  },
  codeblock: {
    category: "digital",
    description: "Write JS DSP inline when no stock module does the exact math you need.",
    notes: ["dynamic ports", "JavaScript body", "local patch code"],
  },
  customDisplay: {
    category: "oscilloscope",
    description: "Draw a custom face with JS for patch-specific meters, art, or debug visuals.",
    notes: ["custom draw", "JavaScript display", "visual sink"],
  },
  graph2: {
    category: "modulator",
    description: "Shape a control curve by points—map phasors/LFOs into custom response shapes.",
    label: "Smooth Graph",
    notes: ["per-point shape", "contour", "Input · LFO · Phasor", "rate without jumps in Phasor"],
  },
  graphCopy: {
    category: "modulator",
    description: "Stepped or free control graph when you want quantized X and shared curve tools.",
    label: "Step Graph",
    notes: ["step grid (0 = free)", "global shape", "per-node curve", "Input · LFO · Phasor"],
  },
  flexGrid: {
    category: "modulator",
    description: "Placeholder flexible multi-point control grid for morphing CV shapes (under construction).",
    label: "Flex Grid",
    notes: ["under construction", "modulator", "grid", "multi-point", "control surface", "morph"],
  },
  gain: {
    category: "dynamics",
    description: "Scale and offset signals—level matching, bias shifts, and simple VCA-style control.",
    label: "Gain",
    notes: ["multiplication", "offset", "scale and shift", "utility", "gain bias", "level control"],
  },
  // Retired shop entry — type still loads as alias of gain.
  gainBias: {
    category: "dynamics",
    description: "Retired alias of Gain—use Gain (it already has offset).",
    hidden: true,
    label: "Gain Bias",
    notes: ["legacy", "hidden"],
  },
  mix: {
    category: "dynamics",
    description: "Sum several voices with per-channel level and bias—utility multivoice summing.",
    label: "Mix",
    notes: ["mixer", "bias", "bleed", "4-channel", "utility"],
  },
  // Legacy id for Mix.
  gainBiasMix: {
    category: "dynamics",
    description: "Retired alias of Mix—use Mix.",
    hidden: true,
    label: "Mix",
    notes: ["legacy", "hidden"],
  },
  bias: {
    category: "dynamics",
    description: "Nudge a signal off center—steer bipolar CV into a new range.",
    notes: ["addition", "offset", "control lane shift"],
  },
  softClipper: {
    category: "dynamics",
    description: "Gentle saturation/limiting when peaks need taming without hard digital clip.",
    label: "Soft Clipper",
    notes: ["soft clipping", "tanh", "gain", "ADAA", "dynamics"],
  },
  clipperLimiter: {
    category: "dynamics",
    description: "Soft-clip limiter: below Min dB is dry; Min→Max is the shared Soft Clipper tanh knee (wider span = more gradual).",
    label: "Clipper Limiter",
    notes: ["soft clip", "limiter", "dB", "tanh", "ADAA", "dynamics"],
  },
  airClipper: {
    category: "dynamics",
    description: "Under construction. Not available.",
    label: "AirClipper",
    notes: ["under construction", "airwindows", "Density3", "density", "soft clip", "dynamics"],
  },
  rotate3dTo2d: {
    category: "dynamics",
    description: "Spin X/Y/Z points then project to 2D for scope art and stereo transforms.",
    label: "Rotation 3D to 2D",
    notes: ["3D rotation", "2D projection", "signal transform"],
  },
  vectorscopeTransform: {
    category: "dynamics",
    description: "Rotate stereo so mono stands vertical—classic vectorscope / balance view.",
    label: "Vectorscope Rotation",
    notes: [
      "vectorscope",
      "vectorscope rotation",
      "goniometer",
      "phase scope",
      "stereo image",
      "mid side",
      "L R",
      "X Y",
      "signal transform",
    ],
  },
  output: {
    category: "portal",
    description: "Final stereo sink—patch here to hear (and meter) the mix.",
    label: "Output",
    notes: ["audio sink", "left right inputs", "render target"],
  },
  audioInput: {
    category: "portal",
    description: "Bring the live mic/line into the patch as Left/Right.",
    label: "Input",
    notes: ["audio source", "left right outputs", "live input"],
  },
  knob: {
    category: "controller",
    description: "Macro face control for one Bias value you want always visible and tweakable.",
    label: "Knob",
    notes: [
      "plugin",
      "bias output",
      "in plus knob",
      "control",
      "additive cv input",
      "resizable widget",
      "manual control",
      "knob",
      "pot",
      "potentiometer",
      "macro",
      "value slider",
    ],
  },
  pluginSlider: {
    category: "controller",
    description: "Vertical Bias control on the face—performance levels and slow rides.",
    label: "Slider",
    notes: ["plugin", "fader", "slider", "bias", "display", "control"],
  },
  toggleButton: {
    category: "controller",
    description: "Latching on/off for mutes, mode switches, and held gates.",
    label: "Toggle",
    notes: ["plugin", "toggle", "latch", "button", "switch"],
  },
  momentaryButton: {
    category: "controller",
    description: "Press-and-hold gate for triggers, rolls, and temporary enables.",
    label: "Momentary",
    notes: ["plugin", "momentary", "gate", "button"],
  },
  pluginInput: {
    category: "portal",
    description: "Clear stereo audio entry point when designing a plugin-style front end.",
    label: "Plugin Input",
    notes: ["plugin", "audio input", "stereo"],
  },
  pluginOutput: {
    category: "portal",
    description: "Clear stereo exit next to classic Output for host/plugin boundaries.",
    label: "Plugin Output",
    notes: ["plugin", "audio output", "stereo"],
  },
  pluginMidiIn: {
    category: "portal",
    description: "Keyboard/MIDI → gate, note, velocity, and 0.1V/oct for playable patches.",
    label: "Plugin MIDI In",
    notes: ["plugin", "midi input", "note", "gate"],
  },
  pluginMidiOut: {
    category: "portal",
    description: "Send/monitor MIDI note+gate for external gear or host MIDI outs.",
    label: "Plugin MIDI Out",
    notes: ["plugin", "midi output"],
  },
  midiOut: {
    category: "controller",
    description: "Dial a fixed MIDI number as CV—static note sources and test pitches.",
    notes: ["midi number", "normalized output", "full value output"],
  },
  midiNotePitch: {
    category: "controller",
    description: "Convert MIDI with octave/offset into pitch CV and frequency Hz.",
    notes: ["midi note input", "frequency output", "pitch conversion"],
  },
  buttonEvents: {
    category: "gametrigger",
    description: "Website/UI clicks as patch pulses—hook page UX into the graph.",
    label: "Button Events",
    notes: ["external UI", "button triggers", "music page bridge"],
  },
  wireBreak: {
    category: "gametrigger",
    description: "Fire when a wire snaps—FX hits, animations, or chaos when the patch breaks.",
    label: "Wire Break",
    notes: ["game trigger", "wire break", "physics violation"],
  },
  wireConnect: {
    category: "gametrigger",
    description: "Pulse on new connections—acknowledge patches or start one-shots on plug-in.",
    label: "Wire Connect",
    notes: ["game trigger", "wire connect", "patch editing"],
  },
  wireDisconnect: {
    category: "gametrigger",
    description: "Pulse on disconnects—cleanup gates or “unplug” sounds.",
    label: "Wire Disconnect",
    notes: ["game trigger", "wire disconnect", "patch editing"],
  },
  windowReopen: {
    category: "gametrigger",
    description: "Pulse when a floating window is re-opened—attention/glow feedback hooks.",
    label: "Window Reopen",
    notes: ["game trigger", "window attention", "green glow"],
  },
  shootingStarTail: {
    category: "gametrigger",
    description: "Placeholder for shooting-star trail events.",
    label: "Shooting Star Tail",
    notes: ["placeholder", "game trigger", "shooting star"],
  },
  shootingStarExplosion: {
    category: "gametrigger",
    description: "Website shooting-star hits as scaled triggers for FX or visuals.",
    label: "Shooting Star Explosion",
    notes: ["game trigger", "shooting star", "website bridge", "power scaled pulse", "low/high range"],
  },
  nextPatch: {
    category: "gametrigger",
    description: "Trigger to load the next saved patch—setlist / kiosk navigation.",
    label: "Next Patch",
    notes: ["patch navigation", "trigger input", "music player"],
  },
  previousPatch: {
    category: "gametrigger",
    description: "Trigger to load the previous saved patch—setlist / kiosk navigation.",
    label: "Previous Patch",
    notes: ["patch navigation", "trigger input", "music player"],
  },
  keyboardController: {
    category: "controller",
    description: "Hardware MIDI in: pick a device and listen channel. Gate, note, velocity, and pitch CV.",
    label: "MIDI",
    notes: ["midi input", "midi channel", "note", "gate", "velocity"],
  },
  macroControls: {
    category: "controller",
    description: "Eight always-on macros (M1–M8) for performance control of a whole patch.",
    label: "Macro Controls",
    notes: ["macro row", "manual control", "eight outputs", "knob", "slider", "macro", "pot", "display"],
  },
  pitchModWheel: {
    category: "controller",
    description: "Read pitch bend and mod wheel next to the keyboard for expression.",
    label: "Pitch Mod Wheel",
    notes: ["pitch wheel", "mod wheel", "performance control"],
  },
  samplePlayer: {
    category: "sample",
    description: "One-shot stereo samples on trigger—hits, stabs, and short clips.",
    label: "Sample Player",
    notes: ["sample playback", "one shot", "audio source", "stereo"],
  },
  audioPlayer: {
    category: "sample",
    description: "Play music files with scrub/phasor control—loops, stems, and timelines.",
    label: "Music Player",
    notes: ["music playback", "scrubbable", "phasor", "audio source"],
  },
  phosphillator: {
    category: "additive",
    description: "Draw a closed shape with the mouse and play it back as X/Y motion.",
    label: "Phosphillator",
    notes: ["freehand draw", "phosphor", "xy oscillator", "papoulis smoothing"],
  },
  sampleLooper: {
    category: "sample",
    description: "Gated stereo looping sample player with bounds, pitch, and seam crossfade.",
    label: "Sample Looper",
    notes: ["sample playback", "loop", "audio source", "stereo"],
  },
  // --- Scientific Filter: textbook / predictable spectral tools ---
  passiveFilter: {
    category: "scientificFilter",
    description: "Gentle 6 dB LP/HP/BP for soft cleanup and light tone shaping.",
    label: "Passive Filter",
    notes: ["lowpass", "highpass", "bandpass", "1-pole", "6 dB/oct", "tame", "rumble", "scientific"],
  },
  tiltFilter: {
    category: "scientificFilter",
    description: "Pivot bright/dark balance without a hard cut—quick spectral posture.",
    label: "Tilt Filter",
    notes: ["tilt", "shelf", "tone balance", "first order", "Robin Schmidt", "RS-MET", "scientific"],
  },
  eqFilter: {
    category: "scientificFilter",
    description: "Zero-latency multipurpose EQ band (LP/HP/peak/shelf…) for clean tone fixes.",
    label: "EQ Filter",
    notes: [
      "eq",
      "eq filter",
      "equalizer",
      "equaliser",
      "EQ",
      "SVF",
      "ZDF",
      "lowpass",
      "highpass",
      "bandpass",
      "shelf",
      "peak",
      "notch",
      "Robin Schmidt",
      "RS-MET",
      "min-phase",
      "scientific",
      "scientific filter",
    ],
  },
  papoulisFilter: {
    category: "scientificFilter",
    description: "Smooth lowpass with steeper roll-off than Butterworth for the same order.",
    label: "Papoulis Filter",
    notes: ["lowpass", "optimum-l", "legendre", "monotonic", "3-pole", "scientific"],
  },
  cookbookFilter: {
    category: "scientificFilter",
    description: "Stack RBJ biquads for steeper multi-stage slopes when one band isn’t enough.",
    label: "Multi Stage Filter",
    notes: ["mode selection", "biquad stages", "curve display", "RBJ", "cascade", "scientific"],
  },
  activeFilter: {
    category: "scientificFilter",
    description: "Scientific multipole ladder with optional drive—precise slopes plus bite.",
    label: "Active Filter",
    notes: [
      "active",
      "multipole",
      "Hz cutoff",
      "resonance 0-1",
      "feedback circuit",
      "gain compensation",
      "LP HP BP",
      "Robin Schmidt",
      "RS-MET",
      "scientific",
    ],
  },
  ladderFilter: {
    category: "scientificFilter",
    description: "Lab ladder Mode×Stages surface—same multipole family, different UI.",
    label: "Ladder Filter",
    notes: ["lab", "stages", "flat", "multipole", "scientific", "RS-MET"],
  },
  butterworth: {
    category: "scientificFilter",
    description: "Clean multipole LP/HP/BP/BR. Fine for a simple two-way split (pair LP+HP yourself); for 3+ bands use 3–6 Crossover.",
    label: "Butterworth Filter",
    notes: ["butterworth", "multipole", "flat passband", "scientific", "two-way ok", "use Crossover for 3+ bands"],
  },
  linkwitzRiley: {
    category: "scientificFilter",
    description: "One LR-shaped LP or HP path—good for a manual two-way split. For 3+ bands with matched band outs, use 3–6 Crossover.",
    label: "Linkwitz-Riley Filter",
    notes: ["linkwitz-riley", "single path", "scientific", "two-way ok", "use Crossover for 3+ bands"],
  },
  bessel: {
    category: "scientificFilter",
    description: "Soft Bessel multipole when you want less ringing and gentler time smear.",
    label: "Bessel Filter",
    notes: ["bessel", "thomson", "group delay", "musical accuracy", "approximated", "classical"],
  },
  chebyshev: {
    category: "scientificFilter",
    description: "Steeper multipole with musical edge—more bite than Butterworth.",
    label: "Chebyshev Filter",
    notes: ["chebyshev", "approximated", "equiripple-style", "steep", "musical", "classical"],
  },
  elliptic: {
    category: "scientificFilter",
    description: "Aggressive multipole tone color (approx elliptic)—sharp, not lab-true Cauer.",
    label: "Elliptic Filter",
    notes: ["elliptic", "cauer", "approximated", "sharp", "not true zeros", "classical", "RS-MET later"],
  },
  bandpass: {
    category: "scientificFilter",
    description: "Resonant pitched bandpass for formants, peaks, and ringing filters.",
    label: "Bandpass Filter",
    notes: ["bandpass", "resonant", "2-pole", "SVF", "ZDF", "scientific", "Robin Schmidt", "RS-MET", "0.1V"],
  },
  allpass: {
    category: "scientificFilter",
    description: "Phase-only filtering for phasers, correction, and delay-ish lag without EQ.",
    label: "Allpass Filter",
    notes: ["allpass", "phase", "SVF", "ZDF", "scientific", "Robin Schmidt", "RS-MET", "not a delay line"],
  },
  crossover2: {
    category: "scientificFilter",
    description: "Dedicated 2-way Linkwitz–Riley split (low/high outs that recombine flat). LR/Butterworth alone also work for a simple two-way; prefer this for matched band outs.",
    label: "2-Crossover",
    notes: ["crossover", "linkwitz-riley", "2-way", "stereo", "scientific", "RS-MET"],
  },
  crossover3: {
    category: "scientificFilter",
    description: "Dedicated 3-way Linkwitz–Riley multiband split—use this (not hand-wired filters) for three or more bands.",
    label: "3-Crossover",
    notes: ["crossover", "linkwitz-riley", "3-way", "stereo", "scientific", "RS-MET"],
  },
  crossover4: {
    category: "scientificFilter",
    description: "Dedicated 4-way Linkwitz–Riley multiband split—use the Crossover modules for anything beyond a simple two-way.",
    label: "4-Crossover",
    notes: ["crossover", "linkwitz-riley", "4-way", "stereo", "scientific", "RS-MET"],
  },
  crossover5: {
    category: "scientificFilter",
    description: "Dedicated 5-way Linkwitz–Riley multiband split—prefer Crossover over stacking LR/Butterworth for multi-way work.",
    label: "5-Crossover",
    notes: ["crossover", "linkwitz-riley", "5-way", "stereo", "scientific", "RS-MET"],
  },
  crossover6: {
    category: "scientificFilter",
    description: "Dedicated 6-way Linkwitz–Riley multiband split—the full multi-band path when two-way LR/Butterworth is not enough.",
    label: "6-Crossover",
    notes: ["crossover", "linkwitz-riley", "6-way", "stereo", "scientific", "RS-MET"],
  },
  softpopOscillator: {
    category: "additive",
    description: "Noise through a resonant peak BP—softpop-style pitchable noise voice.",
    label: "Softpop Oscillator",
    notes: [
      "softpop",
      "noise oscillator",
      "band noise",
      "gaussian",
      "pink",
      "brown",
      "bandpass",
      "resonant",
      "seed",
      "reset",
      "stereo",
      "mono",
    ],
  },
  kickEnvelope: {
    category: "drum",
    description: "One-shot analog envelope: T trigger, A 0–1. Low/High range, Sharpness sine→square, Linear/Exponential curve.",
    label: "Kick Envelope",
    notes: [
      "drum",
      "kick",
      "envelope",
      "trigger",
      "sharpness",
      "sine",
      "square",
      "percussion",
    ],
  },
  sineKick: {
    category: "drum",
    description: "Analog sine kick: T fires a decaying sine. Pitch, Punch, Decay, Sharpness (sine→square). Out is audio; A is the envelope.",
    label: "Sine Kick",
    notes: [
      "drum",
      "kick",
      "sine",
      "thump",
      "trigger",
      "punch",
      "sharpness",
      "percussion",
    ],
  },
  sinepulse: {
    category: "drum",
    description: "Sine zap/chirp drum—electro kicks, risers, and swept sine hits.",
    label: "Sinepulse",
    notes: [
      "drum",
      "percussion",
      "chirp",
      "sine sweep",
      "period reset",
      "sweep",
      "kick",
      "zap",
      "pulse",
      "sine",
      "high low",
      "antialias",
      "pitch dither",
    ],
  },
  electroKick: {
    category: "drum",
    description: "Placeholder classic electro kick voice.",
    label: "ElectroKick",
    notes: ["under construction", "drum", "kick", "electro", "percussion", "bass drum"],
  },
  electroSnare: {
    category: "drum",
    description: "Placeholder classic electro snare voice.",
    label: "ElectroSnare",
    notes: ["under construction", "drum", "snare", "electro", "percussion"],
  },
  electroHat: {
    category: "drum",
    description: "Placeholder classic electro hi-hat voice.",
    label: "ElectroHat",
    notes: ["under construction", "drum", "hi-hat", "hat", "electro", "percussion", "cymbal"],
  },
  formantFilter: {
    category: "scientificFilter",
    description: "Placeholder formant/vocal filter bank.",
    label: "Formant Filter",
    notes: ["under construction", "formant", "vowel", "scientific"],
  },
  binaryClock: {
    category: "clock",
    description: "Placeholder binary counter with bit outs.",
    label: "Binary Clock",
    notes: ["under construction", "binary", "counter", "clock", "sequence", "bits"],
  },
  drummer: {
    category: "clock",
    description: "Placeholder Drummer — pattern/rhythm engine for the Sequence shelf (under construction).",
    label: "Drummer",
    notes: ["under construction", "drummer", "sequence", "pattern", "drums", "rhythm", "groove"],
  },
  arp: {
    category: "musical",
    description: "Placeholder Arp — classic note arpeggiator for held chords / pitch CV (under construction).",
    label: "Arp",
    notes: ["under construction", "arp", "arpeggiator", "musical", "sequence", "pitch", "hold"],
  },
  ePiano: {
    category: "sample",
    description: "Placeholder GM Electric Piano 1 (program 5) sample/MIDI voice (under construction).",
    label: "E.Piano (5)",
    notes: ["under construction", "sample", "e.piano", "electric piano", "GM", "program 5", "midi", "soundfont"],
  },
  percussion: {
    category: "sample",
    description: "Placeholder GM percussion / drum kit on channel 10 (under construction).",
    label: "Percussion (10)",
    notes: ["under construction", "sample", "percussion", "drums", "GM", "channel 10", "midi", "soundfont"],
  },
  theremin: {
    category: "controller",
    description: "Placeholder space-controlled pitch/volume controller.",
    label: "Theremin",
    notes: ["under construction", "theremin", "controller", "proximity", "pitch", "performance"],
  },
  osc: {
    category: "controller",
    description: "Placeholder Open Sound Control bridge—network CV I/O when the protocol layer lands.",
    label: "OSC",
    notes: ["under construction", "osc", "open sound control", "controller", "network", "midi-alternative", "cv"],
  },
  // --- Analog Filter: character / named circuits ---
  yellowjacketFilter: {
    category: "analogFilter",
    description: "Grindy feedback ellipse filter—square-ish harsh resonance colors.",
    label: "Yellowjacket Filter",
    notes: ["ellipse oscillator", "feedback FM", "grindy", "analog"],
  },
  superloveFilter: {
    category: "analogFilter",
    description: "Warm self-oscillating ladder-ish resonator for bass-heavy love tones.",
    label: "SuperLove Filter",
    notes: ["trisaw oscillator", "4 modes", "stable self-oscillation", "analog"],
  },
  chaoticPhaseLockingFilter: {
    category: "analogFilter",
    description: "Phase-locked chaotic feedback textures through LP/HP stages.",
    label: "Chaotic Phase Locking Filter",
    notes: ["ellipse waveshaper", "direct feedback", "phase locking", "analog"],
  },
  modeResonator: {
    category: "scientificFilter",
    description: "Ping a clean decaying mode—metallic rings and predictable resonance tails.",
    label: "Mode Resonator",
    notes: [
      "mode",
      "ping",
      "ring",
      "complex pole",
      "decay seconds",
      "hold",
      "stable",
      "scientific",
      "metallic",
    ],
  },
  combResonator: {
    category: "scientificFilter",
    description: "Pitch-tuned comb/KS-style resonance for plucks, hollow bodies, and harmonic peaks.",
    label: "Comb Resonator",
    notes: [
      "comb",
      "delay feedback",
      "fractional delay",
      "thiran",
      "karplus-strong",
      "pitch",
      "decay seconds",
      "damping",
      "feedforward",
      "scientific",
      "harmonic",
    ],
  },
  waveguide: {
    category: "scientificFilter",
    description: "Placeholder full waveguide (use Comb/Mode resonators for working resonance now).",
    label: "Waveguide",
    notes: [
      "under construction",
      "waveguide",
      "placeholder",
      "physical modeling",
      "dispersion",
      "scientific",
    ],
  },
  phaseDisperse: {
    category: "scientificFilter",
    description: "Cascade allpass smear—group-delay wash without changing magnitude.",
    label: "Phase Disperse",
    notes: ["allpass", "group delay", "disperser", "scientific", "phase", "cpu"],
  },
  phaser: {
    category: "analogFilter",
    description: "Placeholder classic modulated phaser FX.",
    label: "Phaser",
    notes: ["under construction", "phaser", "allpass", "modulation", "analog"],
  },
  flanger: {
    category: "space",
    description: "Placeholder classic short-delay flanger FX.",
    label: "Flanger",
    notes: ["under construction", "flanger", "delay", "modulation", "space"],
  },
  chorus: {
    category: "space",
    description: "Placeholder multi-voice chorus thickening.",
    label: "Chorus",
    notes: ["under construction", "chorus", "delay", "modulation", "space"],
  },
  bode: {
    category: "space",
    description: "Frequency shift (not pitch shift)—metallic, inharmonic, bubbly spectra.",
    label: "Bode Shifter",
    notes: ["bode", "frequency shifter", "SSB", "Hilbert", "space"],
  },
  stftBlur: {
    category: "space",
    description: "Spectral blur wash—clouds and smears in time/frequency.",
    label: "STFT Blur",
    notes: ["STFT", "spectral", "blur", "FFT", "space"],
  },
  resonatorFilter: {
    category: "analogFilter",
    description: "Chaotic dual-phasor resonator for wild FM-ish filter voices.",
    label: "Resonator Filter",
    notes: ["dual-phasor FM", "3 waveform modes", "chaotic", "analog"],
  },
  humanFilter: {
    category: "analogFilter",
    description: "Bell-in-feedback dual-phasor network for vocal-ish, human filter colors.",
    label: "Human Filter",
    notes: ["dual-phasor feedback", "bell-shaped feedback path", "3 modes", "analog"],
  },
  flowerChildFilter: {
    category: "analogFilter",
    description: "Character self-osc filter (clean/dirty/rev/downsample modes).",
    label: "Flower Child Filter",
    notes: ["self-oscillating", "4 modes", "feedback FM", "analog"],
  },
  pulseExplosion: {
    category: "clock",
    description: "On trigger, spray many micro-pulses over time—glitch rain and density hits.",
    label: "Pulse Explosion",
    notes: ["trigger burst", "skewed distribution", "randomized amplitude"],
  },
  tb303Filter: {
    category: "analogFilter",
    description: "303-style acid ladder character for squelchy basses and leads.",
    label: "TB-303 Filter",
    notes: ["feedback highpass", "resonance skewed", "15 modes", "character", "Robin Schmidt", "analog"],
  },
  // Rate limiters live with Dynamics (not spectral filters).
  slewLimiter: {
    category: "dynamics",
    description: "Hard up/down rate limit with Lin / Log / Exp / Smooth curves for steps and CV glides.",
    label: "Slew",
    notes: ["up time", "down time", "asymmetric glide", "rate limit", "slew", "portamento", "dynamics", "log", "exp", "smooth"],
  },
  midSideEncode: {
    category: "dynamics",
    description: "Stereo → Mid/Side encode (0.5 matrix) for M/S processing and dual-bus routing.",
    label: "Mid/Side Encoder",
    notes: [
      "mid/side",
      "ms",
      "encode",
      "matrix",
      "stereo",
      "side",
      "mid",
      "dynamics",
      "utility",
    ],
  },
  quadrature: {
    category: "scientificFilter",
    description:
      "IIR quadrature pair (I / +90° Q). Low-latency Hilbert-class phase tool — no host delay compensation.",
    label: "Quadrature",
    notes: [
      "quadrature",
      "hilbert",
      "90",
      "phase",
      "iir",
      "side",
      "mid",
      "scientific",
      "allpass pair",
    ],
  },
  lookaheadLimiter: {
    category: "dynamics",
    description:
      "Brickwall limiter with optional look-ahead delay (modulatable). No host delay compensation.",
    label: "Limiter",
    notes: [
      "limiter",
      "look-ahead",
      "lookahead",
      "brickwall",
      "ceiling",
      "dynamics",
      "peak",
      "compressor",
    ],
  },
  inertialFilter: {
    category: "dynamics",
    description: "Exponential attack/release approach in Hz—smooth catch-up without hard slew corners.",
    label: "Inertial Filter",
    notes: [
      "inertia",
      "attack",
      "release",
      "frequency",
      "Hz",
      "exponential",
      "one pole",
      "asymmetric",
      "slew",
      "smooth",
      "dynamics",
    ],
  },
  delayEffect: {
    category: "space",
    description: "Modulated feedback delay for echoes, slap, and diffuse trails.",
    label: "Delay",
    notes: ["modulated delay", "fractional echo", "diffuse mode", "native"],
  },
  pingPongDelay: {
    category: "space",
    description: "Stereo bouncing delay with tempo tools and independent L/R motion.",
    label: "Ping Pong Delay",
    notes: [
      "ping pong",
      "tempo sync",
      "numer/denom",
      "parabol",
      "random walk",
      "fbm",
      "tape",
      "soft clip",
      "passive filter",
    ],
  },
  wallDelay: {
    category: "space",
    description: "Placeholder geometric room/wall delay from superellipsoid rays.",
    label: "Wall Delay",
    notes: ["under construction", "wall geometry", "binaural", "wall verb"],
  },
  reverbEffect: {
    category: "space",
    description: "Sabrina reverb wash—diffusion, recycle, and mix for space.",
    label: "Sabrina Reverb",
    notes: ["Sabrina", "serial diffusion", "cross feedback", "seed", "Dry L", "Dry R", "Wet L", "Wet R"],
  },
  soemReverb: {
    category: "space",
    description: "Full SoEm reverb with echo modes, filters, ducking, and dry/wet stereo outs.",
    label: "SoEmReverb",
    notes: ["soemdsp", "ModulatedDelay", "tempo sync", "PostDelay", "PreDelay", "Slapback", "native", "trace", "Dry L", "Dry R", "Wet L", "Wet R"],
  },
  pll: {
    category: "clock",
    description: "Lock a VCO to an input (Doepfer-style PLL)—tracking tones and lock gates.",
    label: "PLL",
    notes: ["phase locked loop", "A-196", "vco", "frequency tracking"],
  },
  helmholtzPitch: {
    category: "multimeter",
    description: "Track monophonic pitch: Hz, fidelity, and lock gate for analysis or follow.",
    label: "Pitch Detector",
    notes: ["pitch tracking", "pitch detector", "mcleod", "autocorrelation", "frequency follower", "gate"],
  },
  noiseDetector: {
    category: "multimeter",
    description: "Pitch-detector fidelity only: how tonal vs noisy the averaged L/M/R mix is, plus a threshold gate.",
    label: "Noise Detector",
    notes: ["multimeter", "fidelity", "nsdf", "mcleod", "noise", "gate", "threshold"],
  },
  speedColorInertia: {
    category: "multimeter",
    description: "Turn signal speed into color desaturation—visual edge energy meters.",
    label: "Speed Color Inertia",
    notes: [
      "multimeter",
      "speed",
      "slope",
      "inertia",
      "saturation",
      "color",
      "solid face",
      "audiovisual",
      "sine red",
      "saw white",
    ],
  },
  sampleHold: {
    category: "modulator",
    description: "Grab a value on trigger and freeze it—stepped random, stepped automation.",
    notes: ["triggered capture", "held output", "stepped motion"],
  },
  expAdsr: {
    category: "envelope",
    description: "Full DADSR curve envelope for long articulations and looped contours.",
    label: "Curve Envelope",
    notes: ["gate input", "target-ratio curves", "loopable envelope", "curve shape", "native", "DADSR", "prefer Attack Decay for simple AD"],
  },
  attackDecay: {
    category: "envelope",
    description: "Simple A/D envelope (loop/LFO options)—default easy amp/mod shape.",
    label: "Attack Decay",
    notes: [
      "attack",
      "decay",
      "curve",
      "gamma",
      "gate",
      "trigger",
      "loop",
      "lfo",
      "easy envelope",
      "default envelope",
      "vactrol style",
      "one-pole",
      "exponential",
      "RC",
    ],
  },
  flowerChildEnvelopeFollower: {
    category: "envelope",
    description: "Follow input loudness into CV—sidechain shapes and dynamics rides.",
    label: "Envelope Follower",
    notes: ["audio input", "attack hold decay", "signed follower port"],
  },
  linearEnvelope: {
    category: "envelope",
    description: "Predictable linear ramps for fades, gates, and simple motion.",
    label: "Linear Envelope",
    notes: ["gate input", "linear DADSR", "loopable ramp", "native"],
  },
  pluckEnvelope: {
    category: "envelope",
    description: "Fast pluck contour for picks, pings, and percussive decays.",
    label: "Pluck Envelope",
    notes: ["trigger input", "decay energy", "auto release", "native"],
  },
  vactrolEnvelopeSeries: {
    category: "envelope",
    description: "Named vactrol timings—optical lag character from real VTL parts.",
    notes: ["light input", "part switch", "dark current", "native"],
  },
  vactrolEnvelopeCustom: {
    category: "envelope",
    description: "Roll-your-own optical lag envelope when no stock vactrol fits.",
    notes: ["light input", "custom vactrol", "dark current", "native"],
  },
  sandboxVisuals: {
    category: "rgb",
    description: "Drive screen shake, dim, color, and scope pause from the patch.",
    notes: ["visual sink", "shake input", "scope pause"],
  },
  screenSpaceShader: {
    category: "rgba",
    description: "Script custom screen effects from declared inputs.",
    notes: ["under construction", "scripted visual sink", "custom inputs", "screen shader controls"],
  },
  bloomGlow: {
    category: "rgb",
    description: "Drive bloom/glow/dim of the screen wash from control signals.",
    notes: ["visual sink", "dim input", "bloom and glow"],
  },
  rgbaHsla: {
    category: "rgba",
    description: "Precise RGB/HSL screen wash color for intentional lighting.",
    notes: ["under construction", "visual sink", "rgb channels", "hsla control"],
  },
  chromaColor: {
    category: "rgba",
    description: "Stylized chroma wash with drift/spread for mood lighting.",
    notes: ["under construction", "visual sink", "chroma wash", "moving color"],
  },
  image: {
    category: "rgba",
    description: "Hold a patch image asset for textures (e.g. phosphor dots).",
    notes: ["under construction", "load image", "save image", "trace texture"],
  },
  canvas: {
    category: "rgb",
    description: "Layer images, scopes, and shaders into one composite surface.",
    notes: ["layer compositor", "RGBA output", "shader script"],
  },
  pixelGrid: {
    category: "rgb",
    description: "Play with pixel-grid looks—strokes, bevels, and lo-fi screen craft.",
    label: "PixelGrid",
    notes: [
      "under construction",
      "pixel grid",
      "rgb",
      "bevel",
      "stroke",
      "3d pixel",
      "pixel experiments",
    ],
  },
  // led registers its own catalog entry from public/modules/led/led-register.js
  // -- see node-graph-chromeless-module-registry.js.
  visualOscilloscope: {
    category: "oscilloscope",
    description: "One multi-mode display face (1D/2D trace or phosphor) for quick inspection.",
    label: "Display",
    notes: ["multi-mode", "2D Trace", "2D Phosphor", "1D Trace", "1D Phosphor", "Phosphor Dot", "visual sink"],
  },
  traceDisplay: {
    category: "oscilloscope",
    description: "Clean 1D vector waveform—see the signal shape without phosphor hang.",
    label: "1D Trace",
    notes: ["1D Trace", "waveform", "display testbed", "input trace"],
  },
  traceDisplayStereo: {
    category: "oscilloscope",
    description: "Output-style stereo 1D Trace—Left/Right colors, Meet blend, and sync on their own face.",
    label: "1D Trace Stereo",
    notes: [
      "1D Trace",
      "stereo",
      "left",
      "right",
      "meet",
      "output display",
      "waveform",
      "display testbed",
    ],
  },
  dotOscilloscope: {
    category: "oscilloscope",
    description: "Single soft phosphor dot for sparse, efficient level/position light.",
    label: "Phosphor Dot",
    notes: ["phosphor", "single dot", "sub-frame brightness", "energy drawer"],
  },
  oscilloscopeBank: {
    category: "oscilloscope",
    description: "Phase/amplitude bank view for multi-voice sources like Hypersaw.",
    label: "Oscilloscope Bank",
    notes: ["work in progress", "voice bank scope", "phase vs amplitude", "under construction"],
  },
  videoscope: {
    category: "rgb",
    description: "Triggered dual-channel scope (A/B) with freeze—stable waveforms of audio.",
    label: "Videoscope",
    notes: ["oscilloscope", "trigger", "dot", "line", "xy", "native", "phosphor display"],
  },
  matrixWaterfall: {
    category: "rgb",
    description: "Self-running matrix rain face—atmosphere and glyph aesthetics.",
    label: "Matrix Waterfall",
    notes: ["rain", "fall", "rise", "parameter only", "glyph table", "gradient", "rgb"],
  },
  matrixDisplay: {
    category: "multimeter",
    description: "Character plate for info/serial text with LCD-style residual.",
    label: "Matrix Display",
    notes: ["info plate", "serial", "lcd residual", "text stream", "multimeter"],
  },
  textStream: {
    category: "digital",
    description: "Type once, emit characters over time—serial text into matrix faces.",
    label: "Text Stream",
    notes: ["serial", "character", "digital", "text box"],
  },
  asciiscope: {
    category: "oscilloscope",
    description: "XY into a character-grid phosphor—ASCII scope art from two signals.",
    label: "Asciiscope",
    notes: ["xy", "glyph ramp", "phosphor decay", "character trail", "oscilloscope"],
  },
  spectrogram: {
    category: "oscilloscope",
    description: "See frequency content over time (STFT) while passing audio through.",
    label: "Spectrogram",
    notes: ["fft", "spectrum", "frequency waterfall", "spectral display", "thru"],
  },
  valueOscilloscope: {
    category: "oscilloscope",
    description: "Latest sample as one horizontal line—ultra-simple level glance.",
    label: "0D Value",
    notes: ["value display", "horizontal line", "latest value"],
  },
  numberReadout: {
    category: "multimeter",
    description: "Lit LED digits for the latest value—meters with phosphor residual hang.",
    label: "Value LED",
    notes: [
      "value",
      "value led",
      "value readout",
      "number readout",
      "value display",
      "latest value",
      "numeric display",
      "numeric value",
      "digital readout",
      "DSEG7 Classic",
      "seven-segment",
      "energy phosphor",
      "ghost",
      "trail",
      "burn",
      "burnAmount",
      "LED",
    ],
  },
  valueLcd: {
    category: "multimeter",
    description: "Reflective LCD-style digits—cheap multimeter look for numbers.",
    label: "Value LCD",
    notes: [
      "value",
      "value lcd",
      "lcd",
      "value display",
      "numeric display",
      "digital readout",
      "DSEG7",
      "seven-segment",
      "ghost",
      "trail",
      "reflective",
      "multimeter",
    ],
  },
  lineBurnOscilloscope: {
    category: "oscilloscope",
    description: "Heart-monitor 1D phosphor sweep—persistence trail for mono signals.",
    label: "1D Phosphor",
    notes: ["1D Phosphor", "heart monitor", "phosphor sweep", "reset", "brightness", "trail", "burn"],
  },
  scope2d: {
    category: "oscilloscope",
    description: "X/Y phosphor energy trail—the standard attractor/laser-style path face.",
    label: "2D Phosphor",
    notes: ["2D Phosphor", "xy phosphor", "energy drawer", "brightness", "trail", "burn"],
  },
  phosphorLight: {
    category: "oscilloscope",
    // Hidden + load-migrated to scope2d. Do not re-enable in shop.
    hidden: true,
    description: "Legacy alias of 2D Phosphor—use scope2d for new patches.",
    label: "2D Phosphor (legacy)",
    notes: ["legacy", "migrates to scope2d", "hidden"],
  },
  scope2dTrace: {
    category: "oscilloscope",
    description: "Instant X/Y vector history without phosphor—crisp 2D traces.",
    label: "2D Trace",
    notes: ["xy trace", "sample history", "2D oscilloscope"],
  },
  vectorRgb: {
    category: "rgb",
    description: "X/Y phosphor path colored by analog R/G/B — three-channel beam, no brightness LUT.",
    label: "Vector RGB",
    notes: ["xy", "rgb", "phosphor", "beam", "blank"],
  },
  rasterRgb: {
    category: "rgb",
    description: "Analog RGB color-corrector and rolling framebuffer. Invert, contrast, brightness, and hue land on R/G/B/📺 outs.",
    label: "Raster RGB",
    notes: ["raster", "framebuffer", "rgb", "hue", "color correct", "tv"],
  },
  gradientVectorscope: {
    category: "rgb",
    description: "2D trace with color along path length (not phosphor brightness). Optional 90° mid/side rotation.",
    label: "Gradient Vectorscope",
    notes: ["vectorscope", "gradient", "xy trace", "90"],
  },
  traceXyz: {
    category: "oscilloscope",
    description: "Three history traces: X red, Y blue, Z green. Stack on one plot or split the face into three bands.",
    label: "XYZ Trace",
    notes: ["xyz", "rgb", "trace", "history", "stack", "separate", "x red", "y blue", "z green"],
  },
  badvalMonitor: {
    category: "debug",
    description: "Watch for NaN/inf/explosions—show when the circuit goes invalid.",
    notes: ["NaN guard", "infinity guard", "warning face", "debug safety"],
  },
  speakerProtection: {
    category: "debug",
    description: "Hard trip if |sample| > 1—protect ears/speakers while debugging.",
    notes: ["speaker safety", "ear protection", "hard limit"],
  },
  speakerProtector2: {
    category: "debug",
    description: "Slew mute: trip → drop to 0 → hold 0.333 s → slow rise. Same circuit as the Output bus protector.",
    label: "Speaker Protector 2.0",
    notes: ["speaker protection", "slew", "mute", "hold", "VCA", "safety"],
  },
  textBox: {
    category: "object",
    description: "Static in-world label for notes, lore, and instructions on the patch.",
    notes: ["annotation", "layout", "field notes"],
  },
  animatedTextBox: {
    category: "object",
    description: "Wireable title/text plate so messages can be driven by the patch.",
    notes: ["data-plane ports", "port scripts", "wired label"],
  },
  phoneTone: {
    category: "object",
    description: "DTMF phone tones from Analog 0–1 and/or Digital slot (same 12-key map as Keypad). Gate opens the tone. Pitch Offset + 0.1V/Oct transpose both tones. X = low sine, Z = high sine, M = sum.",
    label: "Phone Tone",
    notes: ["dtmf", "phone", "tone", "keypad", "robin", "object", "pitch", "0.1v"],
  },
  // Chromeless / fully-custom-UI modules (stepGrid, led, ...) register
  // their own catalog entry instead of it being hardcoded here -- see
  // node-graph-chromeless-module-registry.js.
  ...nodeGraphChromelessModuleCatalogEntries(),
});

function defaultNodeGraphModuleCatalogVisibility() {
  return Object.fromEntries(
    nodeGraphModuleStoreTypesList().map((type) => [
      type,
      {
        developer: true,
        home: false,
      },
    ]),
  );
}

function normalizeNodeGraphModuleCatalogVisibility(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    nodeGraphModuleStoreTypesList().map((type) => {
      const entry = source[type];
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        return [
          type,
          {
            developer: entry.developer !== false && entry.shop !== false,
            home: entry.home === true,
          },
        ];
      }
      return [
        type,
        {
          developer: entry !== false,
          home: false,
        },
      ];
    }),
  );
}

function nodeGraphModuleCatalogVisibility() {
  return normalizeNodeGraphModuleCatalogVisibility(nodeGraphMvp.moduleCatalogVisibility);
}

function nodeGraphModuleIsStoreVisible(type, shelf = "shop") {
  const visibility = nodeGraphModuleCatalogVisibility()[type];
  if (shelf === "developer") {
    return visibility?.developer !== false;
  }
  if (shelf === "home") {
    return visibility?.home === true;
  }
  return true;
}

function applyNodeGraphModuleCatalogVisibility(value = {}) {
  nodeGraphMvp.moduleCatalogVisibility = normalizeNodeGraphModuleCatalogVisibility(value);
  renderNodeGraphModuleStoreCatalog();
}

function loadNodeGraphModuleCatalogVisibilityLocal() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return null;
  }
  try {
    const text = window.localStorage.getItem(nodeGraphModuleCatalogVisibilityStorageKey);
    if (!text) {
      return null;
    }
    return normalizeNodeGraphModuleCatalogVisibility(JSON.parse(text));
  } catch {
    return null;
  }
}

function saveNodeGraphModuleCatalogVisibilityLocal(value = nodeGraphModuleCatalogVisibility()) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  try {
    window.localStorage.setItem(
      nodeGraphModuleCatalogVisibilityStorageKey,
      JSON.stringify(normalizeNodeGraphModuleCatalogVisibility(value)),
    );
    return true;
  } catch {
    return false;
  }
}

function normalizeNodeGraphNativeModuleEntry(entry = {}) {
  const name = String(entry.name || "").trim();
  const targetType = String(entry.targetType || entry.target || name || "").trim();
  if (!name || !targetType) {
    return null;
  }
  return Object.freeze({
    kind: String(entry.kind || ""),
    label: String(entry.label || name),
    libUrl: String(entry.libUrl || ""),
    name,
    source: String(entry.source || ""),
    sourceUrl: String(entry.sourceUrl || ""),
    targetType,
    wasm: String(entry.wasm || ""),
    wasmAvailable: Boolean(entry.wasmAvailable),
    wasmUrl: String(entry.wasmUrl || ""),
  });
}

function applyNodeGraphNativeModuleCatalog(entries = []) {
  const normalized = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeNodeGraphNativeModuleEntry(entry))
    .filter(Boolean);
  const byTarget = {};
  for (const entry of normalized) {
    if (!byTarget[entry.targetType]) {
      byTarget[entry.targetType] = [];
    }
    byTarget[entry.targetType].push(entry);
  }
  nodeGraphNativeModuleEntries = Object.freeze(normalized);
  nodeGraphNativeModuleEntriesByTarget = Object.freeze(byTarget);
  renderNodeGraphModuleStoreCatalog();
}

async function fetchNodeGraphNativeModuleCatalogFallback() {
  try {
    const response = await fetch("native-modules-catalog.json", { cache: "no-store" });
    return response.ok ? response.json() : null;
  } catch (_error) {
    return null;
  }
}

async function loadNodeGraphNativeModuleCatalog() {
  if (nodeGraphNativeModuleCatalogLoadStarted || typeof fetch !== "function") {
    return nodeGraphNativeModuleEntries;
  }
  nodeGraphNativeModuleCatalogLoadStarted = true;
  try {
    let payload = null;
    const response = await fetch("/api/native-modules", { cache: "no-store" });
    if (response.ok) {
      payload = await response.json();
    } else {
      payload = await fetchNodeGraphNativeModuleCatalogFallback();
    }
    applyNodeGraphNativeModuleCatalog(payload?.modules || []);
  } catch (_error) {
    // No server behind the page (e.g. static export) -- fall back to the
    // pre-generated catalog shipped alongside index.html.
    const fallback = await fetchNodeGraphNativeModuleCatalogFallback();
    if (fallback?.modules) {
      applyNodeGraphNativeModuleCatalog(fallback.modules);
    }
  }
  return nodeGraphNativeModuleEntries;
}

function nodeGraphNativeModulesForType(type) {
  return nodeGraphNativeModuleEntriesByTarget[String(type || "")] || [];
}

// "Code" button entries for modules that stay JavaScript on purpose (not
// backed by a native_modules/*.cpp entry). Points at the file where the
// module's DSP is actually implemented, not just where it's dispatched.
// JS / pure-browser modules: Code button targets the primary DSP source file.
// Regenerated-ish via scripts/_gen_js_source_entries.py when module folders grow.
const nodeGraphJsSourceEntriesByType = Object.freeze({
  activeFilter: {
    source: "public/modules/activeFilter/active-filter-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/activeFilter/active-filter-math.js",
  },
  additiveOsc: {
    source: "public/modules/additiveOsc/additive-osc-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/additiveOsc/additive-osc-worklet-evaluator.js",
  },
  aliasSine: {
    source: "public/modules/aliasSine/alias-sine-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/aliasSine/alias-sine-worklet-evaluator.js",
  },
  robinSinusoid: {
    source: "public/modules/robinSinusoid/robin-sinusoid-math.js",
    sourceUrl: "https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rosic/generators/rosic_SineOscillator.h",
  },
  allpass: {
    source: "public/modules/scientificIir/scientific-iir-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/scientificIir/scientific-iir-math.js",
  },
  antisaw: {
    source: "public/modules/antisaw/antisaw-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/antisaw/antisaw-worklet-evaluator.js",
  },
  asciiscope: {
    source: "public/modules/asciiscope/asciiscope-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/asciiscope/asciiscope-live-evaluator.js",
  },
  attackDecay: {
    source: "public/modules/attackDecay/attack-decay-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/attackDecay/attack-decay-math.js",
  },
  audioInput: {
    source: "public/modules/audioInput/audio-input-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/audioInput/audio-input-live-evaluator.js",
  },
  audioPlayer: {
    source: "public/modules/audioPlayer/audio-player-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/audioPlayer/audio-player-worklet-evaluator.js",
  },
  badvalMonitor: {
    source: "public/modules/badvalMonitor/badval-monitor-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/badvalMonitor/badval-monitor-worklet-evaluator.js",
  },
  bandpass: {
    source: "public/modules/scientificIir/scientific-iir-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/scientificIir/scientific-iir-math.js",
  },
  bessel: {
    source: "public/modules/scientificIir/scientific-iir-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/scientificIir/scientific-iir-math.js",
  },
  bias: {
    source: "public/modules/bias/bias-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/bias/bias-math.js",
  },
  bitConverter: {
    source: "public/modules/bitConverter/bit-converter-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/bitConverter/bit-converter-math.js",
  },
  bloomGlow: {
    source: "public/modules/bloomGlow/bloom-glow-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/bloomGlow/bloom-glow-live-evaluator.js",
  },
  blubb: {
    source: "public/modules/blubb/blubb-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/blubb/blubb-worklet-evaluator.js",
  },
  bode: {
    source: "public/modules/bode/bode-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/bode/bode-math.js",
  },
  boing: {
    source: "public/modules/boing/boing-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/boing/boing-worklet-evaluator.js",
  },
  bradley2a: {
    source: "public/modules/bradley2a/bradley-2a-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/bradley2a/bradley-2a-worklet-evaluator.js",
  },
  bugButton: {
    source: "public/modules/bugButton/bug-button-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/bugButton/bug-button-worklet-evaluator.js",
  },
  butterworth: {
    source: "public/modules/scientificIir/scientific-iir-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/scientificIir/scientific-iir-math.js",
  },
  buttonEvents: {
    source: "public/modules/buttonEvents/button-events-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/buttonEvents/button-events-live-evaluator.js",
  },
  chaoticPhaseLockingFilter: {
    source: "public/modules/chaoticPhaseLockingFilter/chaotic-phase-locking-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/chaoticPhaseLockingFilter/chaotic-phase-locking-filter-worklet-evaluator.js",
  },
  chebyshev: {
    source: "public/modules/scientificIir/scientific-iir-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/scientificIir/scientific-iir-math.js",
  },
  chordMemory: {
    source: "public/modules/chordMemory/chord-memory-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/chordMemory/chord-memory-worklet-evaluator.js",
  },
  chordPad: {
    source: "public/modules/chordPad/chord-pad-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/chordPad/chord-pad-worklet-evaluator.js",
  },
  chordSequencer: {
    source: "public/modules/chordSequencer/chord-sequencer-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/chordSequencer/chord-sequencer-worklet-evaluator.js",
  },
  chromaColor: {
    source: "public/modules/chromaColor/chroma-color-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/chromaColor/chroma-color-live-evaluator.js",
  },
  chuaAttractor: {
    source: "public/modules/chuaAttractor/chua-attractor-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/chuaAttractor/chua-attractor-math.js",
  },
  classicFxStubs: {
    source: "public/modules/classicFxStubs/classic-fx-stubs-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/classicFxStubs/classic-fx-stubs-worklet-evaluator.js",
  },
  clock: {
    source: "public/modules/clock/clock-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/clock/clock-math.js",
  },
  clockDivider: {
    source: "public/modules/clockDivider/clock-divider-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/clockDivider/clock-divider-live-evaluator.js",
  },
  codeblock: {
    source: "public/modules/codeblock/codeblock-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/codeblock/codeblock-worklet-evaluator.js",
  },
  combResonator: {
    source: "native_modules/comb_resonator/comb_resonator.cpp",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/native_modules/comb_resonator/comb_resonator.cpp",
  },
  comparator: {
    source: "public/modules/comparator/comparator-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/comparator/comparator-math.js",
  },
  cookbookFilter: {
    source: "public/modules/cookbookFilter/cookbook-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/cookbookFilter/cookbook-filter-worklet-evaluator.js",
  },
  crossover: {
    source: "native_modules/crossover/crossover.cpp",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/native_modules/crossover/crossover.cpp",
  },
  crossover2: {
    source: "native_modules/crossover/crossover.cpp",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/native_modules/crossover/crossover.cpp",
  },
  crossover3: {
    source: "native_modules/crossover/crossover.cpp",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/native_modules/crossover/crossover.cpp",
  },
  crossover4: {
    source: "native_modules/crossover/crossover.cpp",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/native_modules/crossover/crossover.cpp",
  },
  crossover5: {
    source: "native_modules/crossover/crossover.cpp",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/native_modules/crossover/crossover.cpp",
  },
  crossover6: {
    source: "native_modules/crossover/crossover.cpp",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/native_modules/crossover/crossover.cpp",
  },
  curveOsc: {
    source: "public/modules/curveOsc/curve-osc-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/curveOsc/curve-osc-math.js",
  },
  delayEffect: {
    source: "public/modules/delayEffect/delay-effect-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/delayEffect/delay-effect-worklet-evaluator.js",
  },
  delayedTrigger: {
    source: "public/modules/delayedTrigger/delayed-trigger-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/delayedTrigger/delayed-trigger-math.js",
  },
  dsfOscillator: {
    source: "public/modules/dsfOscillator/dsf-oscillator-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/dsfOscillator/dsf-oscillator-worklet-evaluator.js",
  },
  ellipsoid: {
    source: "public/modules/ellipsoid/ellipsoid-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/ellipsoid/ellipsoid-worklet-evaluator.js",
  },
  ellipsoidOsc: {
    source: "public/modules/ellipsoid/ellipsoid-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/ellipsoid/ellipsoid-worklet-evaluator.js",
  },
  elliptic: {
    source: "public/modules/scientificIir/scientific-iir-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/scientificIir/scientific-iir-math.js",
  },
  eqFilter: {
    source: "public/modules/eqFilter/eq-filter-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/eqFilter/eq-filter-math.js",
  },
  evolveField: {
    source: "public/modules/evolveField/evolve-field-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/evolveField/evolve-field-live-evaluator.js",
  },
  expAdsr: {
    source: "public/modules/expAdsr/exp-adsr-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/expAdsr/exp-adsr-math.js",
  },
  fbmField: {
    source: "public/modules/fbmField/fbm-field-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/fbmField/fbm-field-worklet-evaluator.js",
  },
  flowerChildEnvelopeFollower: {
    source: "public/modules/flowerChildEnvelopeFollower/flower-child-envelope-follower-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/flowerChildEnvelopeFollower/flower-child-envelope-follower-worklet-evaluator.js",
  },
  flowerChildFilter: {
    source: "public/modules/flowerChildFilter/flower-child-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/flowerChildFilter/flower-child-filter-worklet-evaluator.js",
  },
  fractalBrownianNoise: {
    source: "public/modules/fractalBrownianNoise/fractal-brownian-noise-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/fractalBrownianNoise/fractal-brownian-noise-worklet-evaluator.js",
  },
  fractalSpiral: {
    source: "public/modules/fractalSpiral/fractal-spiral-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/fractalSpiral/fractal-spiral-worklet-evaluator.js",
  },
  gain: {
    source: "public/modules/gain/gain-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/gain/gain-math.js",
  },
  gainBias: {
    source: "public/modules/gainBias/gain-bias-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/gainBias/gain-bias-math.js",
  },
  gainBiasMix: {
    source: "public/modules/gainBiasMix/gain-bias-mix-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/gainBiasMix/gain-bias-mix-worklet-evaluator.js",
  },
  graph: {
    source: "public/modules/graph/graph-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/graph/graph-live-evaluator.js",
  },
  groupInput: {
    source: "public/modules/groupInput/group-input-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/groupInput/group-input-live-evaluator.js",
  },
  portalInlet: {
    source: "public/modules/portal/portal-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/portal/portal-live-evaluator.js",
  },
  portalOutlet: {
    source: "public/modules/portal/portal-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/portal/portal-live-evaluator.js",
  },
  groupOutput: {
    source: "public/modules/groupOutput/group-output-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/groupOutput/group-output-live-evaluator.js",
  },
  helmholtzPitch: {
    source: "public/modules/helmholtzPitch/helmholtz-pitch-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/helmholtzPitch/helmholtz-pitch-worklet-evaluator.js",
  },
  henonMap: {
    source: "public/modules/henonMap/henon-map-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/henonMap/henon-map-math.js",
  },
  humanFilter: {
    source: "public/modules/humanFilter/human-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/humanFilter/human-filter-worklet-evaluator.js",
  },
  hypersaw: {
    source: "public/modules/hypersaw/hypersaw-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/hypersaw/hypersaw-worklet-evaluator.js",
  },
  inertialFilter: {
    source: "public/modules/inertialFilter/inertial-filter-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/inertialFilter/inertial-filter-math.js",
  },
  keplerBouwkamp: {
    source: "public/modules/keplerBouwkamp/kepler-bouwkamp-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/keplerBouwkamp/kepler-bouwkamp-worklet-evaluator.js",
  },
  keyboardController: {
    source: "public/modules/keyboardController/keyboard-controller-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/keyboardController/keyboard-controller-live-evaluator.js",
  },
  knob: {
    source: "public/modules/knob/knob-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/knob/knob-live-evaluator.js",
  },
  ladderFilter: {
    source: "public/modules/ladderFilter/ladder-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/ladderFilter/ladder-filter-worklet-evaluator.js",
  },
  led: {
    source: "public/modules/led/led-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/led/led-live-evaluator.js",
  },
  linearEnvelope: {
    source: "public/modules/linearEnvelope/linear-envelope-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/linearEnvelope/linear-envelope-math.js",
  },
  linkwitzRiley: {
    source: "public/modules/scientificIir/scientific-iir-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/scientificIir/scientific-iir-math.js",
  },
  logSpiral: {
    source: "public/modules/logSpiral/log-spiral-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/logSpiral/log-spiral-worklet-evaluator.js",
  },
  logisticMap: {
    source: "public/modules/logisticMap/logistic-map-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/logisticMap/logistic-map-math.js",
  },
  lorenzAttractor: {
    source: "public/modules/lorenzAttractor/lorenz-attractor-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/lorenzAttractor/lorenz-attractor-math.js",
  },
  lutCell: {
    source: "public/modules/lutCell/lut-cell-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/lutCell/lut-cell-worklet-evaluator.js",
  },
  macroControls: {
    source: "public/modules/macroControls/macro-controls-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/macroControls/macro-controls-live-evaluator.js",
  },
  matrixDisplay: {
    source: "public/modules/matrixDisplay/matrix-display-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/matrixDisplay/matrix-display-live-evaluator.js",
  },
  metallicRatio: {
    source: "public/modules/metallicRatio/metallic-ratio-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/metallicRatio/metallic-ratio-math.js",
  },
  midiNotePitch: {
    source: "public/modules/midiNotePitch/midi-note-pitch-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/midiNotePitch/midi-note-pitch-live-evaluator.js",
  },
  midiOut: {
    source: "public/modules/midiOut/midi-out-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/midiOut/midi-out-live-evaluator.js",
  },
  minMax: {
    source: "public/modules/minMax/min-max-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/minMax/min-max-math.js",
  },
  modeResonator: {
    source: "native_modules/mode_resonator/mode_resonator.cpp",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/native_modules/mode_resonator/mode_resonator.cpp",
  },
  moduleGroup: {
    source: "public/modules/moduleGroup/module-group-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/moduleGroup/module-group-worklet-evaluator.js",
  },
  mushroom: {
    source: "public/modules/mushroom/mushroom-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/mushroom/mushroom-worklet-evaluator.js",
  },
  musicalEngines: {
    source: "public/modules/musicalEngines/musical-engines-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/musicalEngines/musical-engines-worklet-evaluator.js",
  },
  nextPatch: {
    source: "public/modules/nextPatch/next-patch-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/nextPatch/next-patch-worklet-evaluator.js",
  },
  noiseDetector: {
    source: "public/modules/noiseDetector/noise-detector-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/noiseDetector/noise-detector-math.js",
  },
  noiseGenerator: {
    source: "public/modules/noiseGenerator/noise-generator-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/noiseGenerator/noise-generator-math.js",
  },
  numberReadout: {
    source: "public/modules/numberReadout/number-readout-register.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/numberReadout/number-readout-register.js",
  },
  valueLcd: {
    source: "public/modules/valueLcd/value-lcd-register.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/valueLcd/value-lcd-register.js",
  },
  nyquistShannon: {
    source: "public/modules/nyquistShannon/nyquist-shannon-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/nyquistShannon/nyquist-shannon-worklet-evaluator.js",
  },
  osc: {
    source: "public/node-graph-oscillator-runtime.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/node-graph-oscillator-runtime.js",
  },
  oscilloscopeBank: {
    source: "public/modules/oscilloscopeBank/oscilloscope-bank-display.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/oscilloscopeBank/oscilloscope-bank-display.js",
  },
  output: {
    source: "public/modules/output/output-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/output/output-live-evaluator.js",
  },
  papoulisFilter: {
    source: "public/modules/papoulisFilter/papoulis-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/papoulisFilter/papoulis-filter-worklet-evaluator.js",
  },
  passiveFilter: {
    source: "public/modules/passiveFilter/passive-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/passiveFilter/passive-filter-worklet-evaluator.js",
  },
  patchCommand: {
    source: "public/modules/patchCommand/patch-command-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/patchCommand/patch-command-live-evaluator.js",
  },
  phaseDisperse: {
    source: "public/modules/phaseDisperse/phase-disperse-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/phaseDisperse/phase-disperse-math.js",
  },
  phosphillator: {
    source: "public/modules/phosphillator/phosphillator-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/phosphillator/phosphillator-worklet-evaluator.js",
  },
  phosphorLight: {
    source: "public/modules/phosphorLight/phosphor-light-display.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/phosphorLight/phosphor-light-display.js",
  },
  piSpigotNoise: {
    source: "public/modules/piSpigotNoise/pi-spigot-noise-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/piSpigotNoise/pi-spigot-noise-worklet-evaluator.js",
  },
  pingPongDelay: {
    source: "public/modules/pingPongDelay/ping-pong-delay-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/pingPongDelay/ping-pong-delay-worklet-evaluator.js",
  },
  pitchModWheel: {
    source: "public/modules/pitchModWheel/pitch-mod-wheel-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/pitchModWheel/pitch-mod-wheel-live-evaluator.js",
  },
  pitchQuantizer: {
    source: "public/modules/pitchQuantizer/pitch-quantizer-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/pitchQuantizer/pitch-quantizer-worklet-evaluator.js",
  },
  pll: {
    source: "public/modules/pll/pll-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/pll/pll-worklet-evaluator.js",
  },
  pluckEnvelope: {
    source: "public/modules/pluckEnvelope/pluck-envelope-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/pluckEnvelope/pluck-envelope-worklet-evaluator.js",
  },
  plugin: {
    source: "public/modules/plugin/plugin-controls-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/plugin/plugin-controls-live-evaluator.js",
  },
  polyBlep: {
    source: "public/modules/polyBlep/poly-blep-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/polyBlep/poly-blep-worklet-evaluator.js",
  },
  pulseExplosion: {
    source: "public/modules/pulseExplosion/pulse-explosion-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/pulseExplosion/pulse-explosion-worklet-evaluator.js",
  },
  radar: {
    source: "public/modules/radar/radar-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/radar/radar-worklet-evaluator.js",
  },
  randomClock: {
    source: "public/modules/randomClock/random-clock-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/randomClock/random-clock-math.js",
  },
  randomWalk: {
    source: "public/modules/randomWalk/random-walk-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/randomWalk/random-walk-math.js",
  },
  rayBouncer: {
    source: "public/modules/rayBouncer/ray-bouncer-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/rayBouncer/ray-bouncer-worklet-evaluator.js",
  },
  resonatorFilter: {
    source: "public/modules/resonatorFilter/resonator-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/resonatorFilter/resonator-filter-worklet-evaluator.js",
  },
  reverbEffect: {
    source: "public/modules/reverbEffect/reverb-effect-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/reverbEffect/reverb-effect-worklet-evaluator.js",
  },
  rgbFractal: {
    source: "public/modules/rgbFractal/rgb-fractal-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/rgbFractal/rgb-fractal-math.js",
  },
  rgbPicture: {
    source: "public/modules/rgbPicture/rgb-picture-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/rgbPicture/rgb-picture-live-evaluator.js",
  },
  rgbShape: {
    source: "public/modules/rgbShape/rgb-shape-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/rgbShape/rgb-shape-live-evaluator.js",
  },
  rgbaHsla: {
    source: "public/modules/rgbaHsla/rgba-hsla-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/rgbaHsla/rgba-hsla-worklet-evaluator.js",
  },
  robinSupersaw: {
    source: "public/modules/robinSupersaw/robin-supersaw-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/robinSupersaw/robin-supersaw-worklet-evaluator.js",
  },
  rotate3dTo2d: {
    source: "public/modules/rotate3dTo2d/rotate-3d-to-2d-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/rotate3dTo2d/rotate-3d-to-2d-math.js",
  },
  sampleDelay: {
    source: "public/modules/sampleDelay/sample-delay-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/sampleDelay/sample-delay-math.js",
  },
  sampleHold: {
    source: "public/modules/sampleHold/sample-hold-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/sampleHold/sample-hold-math.js",
  },
  sandboxVisuals: {
    source: "public/modules/sandboxVisuals/sandbox-visuals-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/sandboxVisuals/sandbox-visuals-live-evaluator.js",
  },
  scientificIir: {
    source: "public/modules/scientificIir/scientific-iir-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/scientificIir/scientific-iir-math.js",
  },
  screenSpaceShader: {
    source: "public/modules/screenSpaceShader/screen-space-shader-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/screenSpaceShader/screen-space-shader-worklet-evaluator.js",
  },
  shootingStarExplosion: {
    source: "public/modules/shootingStarExplosion/shooting-star-explosion-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/shootingStarExplosion/shooting-star-explosion-live-evaluator.js",
  },
  sinc: {
    source: "public/modules/sinc/sinc-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/sinc/sinc-worklet-evaluator.js",
  },
  sineWavetable: {
    source: "public/node-graph-oscillator-runtime.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/node-graph-oscillator-runtime.js",
  },
  kickEnvelope: {
    source: "public/modules/kickEnvelope/kick-envelope-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/kickEnvelope/kick-envelope-math.js",
  },
  sineKick: {
    source: "public/modules/sineKick/sine-kick-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/sineKick/sine-kick-math.js",
  },
  sinepulse: {
    source: "public/modules/sinepulse/sinepulse-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/sinepulse/sinepulse-math.js",
  },
  slewLimiter: {
    source: "public/modules/slewLimiter/slew-limiter-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/slewLimiter/slew-limiter-math.js",
  },
  snowflake: {
    source: "public/modules/snowflake/snowflake-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/snowflake/snowflake-math.js",
  },
  soemReverb: {
    source: "public/modules/soemReverb/soem-reverb-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/soemReverb/soem-reverb-worklet-evaluator.js",
  },
  softClipper: {
    source: "public/modules/softClipper/soft-clipper-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/softClipper/soft-clipper-math.js",
  },
  clipperLimiter: {
    source: "public/modules/clipperLimiter/clipper-limiter-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/clipperLimiter/clipper-limiter-math.js",
  },
  airClipper: {
    source: "public/modules/airClipper/air-clipper-math.js",
    sourceUrl: "https://github.com/airwindows/airwindows/blob/master/plugins/WinVST/Density3/Density3Proc.cpp",
  },
  softpopOscillator: {
    source: "public/modules/softpopOscillator/softpop-oscillator-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/softpopOscillator/softpop-oscillator-math.js",
  },
  softwaveOsc: {
    source: "public/modules/softwaveOsc/softwave-osc-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/softwaveOsc/softwave-osc-worklet-evaluator.js",
  },
  speakerProtection: {
    source: "public/modules/speakerProtection/speaker-protection-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/speakerProtection/speaker-protection-worklet-evaluator.js",
  },
  speakerProtector2: {
    source: "public/modules/speakerProtector2/speaker-protector-2-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/speakerProtector2/speaker-protector-2-math.js",
  },
  spectrogram: {
    source: "public/modules/spectrogram/spectrogram-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/spectrogram/spectrogram-worklet-evaluator.js",
  },
  speedColorInertia: {
    source: "public/modules/speedColorInertia/speed-color-inertia-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/speedColorInertia/speed-color-inertia-math.js",
  },
  spiral: {
    source: "public/modules/spiral/spiral-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/spiral/spiral-worklet-evaluator.js",
  },
  stepGrid: {
    source: "public/modules/stepGrid/step-grid-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/stepGrid/step-grid-worklet-evaluator.js",
  },
  stepSequencer: {
    source: "public/modules/stepSequencer/step-sequencer-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/stepSequencer/step-sequencer-math.js",
  },
  stftBlur: {
    source: "public/modules/stftBlur/stft-blur-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/stftBlur/stft-blur-math.js",
  },
  superloveFilter: {
    source: "public/modules/superloveFilter/superlove-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/superloveFilter/superlove-filter-worklet-evaluator.js",
  },
  surgeOscillator: {
    source: "public/modules/surgeOscillator/surge-oscillator-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/surgeOscillator/surge-oscillator-worklet-evaluator.js",
  },
  tb303Filter: {
    source: "public/modules/tb303Filter/tb303-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/tb303Filter/tb303-filter-worklet-evaluator.js",
  },
  textStream: {
    source: "public/modules/textStream/text-stream-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/textStream/text-stream-worklet-evaluator.js",
  },
  tiltFilter: {
    source: "public/modules/tiltFilter/tilt-filter-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/tiltFilter/tilt-filter-math.js",
  },
  torus: {
    source: "public/modules/torus/torus-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/torus/torus-worklet-evaluator.js",
  },
  transport: {
    source: "public/modules/transport/transport-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/transport/transport-math.js",
  },
  triggerCounter: {
    source: "public/modules/triggerCounter/trigger-counter-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/triggerCounter/trigger-counter-math.js",
  },
  triggerDivider: {
    source: "public/modules/triggerDivider/trigger-divider-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/triggerDivider/trigger-divider-math.js",
  },
  turingMachine: {
    source: "public/modules/turingMachine/turing-machine-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/turingMachine/turing-machine-worklet-evaluator.js",
  },
  vactrolEnvelope: {
    source: "public/modules/vactrolEnvelope/vactrol-envelope-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/vactrolEnvelope/vactrol-envelope-live-evaluator.js",
  },
  vactrolEnvelopeSeries: {
    source: "public/modules/vactrolEnvelopeSeries/vactrol-envelope-series-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/vactrolEnvelopeSeries/vactrol-envelope-series-worklet-evaluator.js",
  },
  vectorscopeTransform: {
    source: "public/modules/vectorscopeTransform/vectorscope-transform-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/vectorscopeTransform/vectorscope-transform-math.js",
  },
  videoscope: {
    source: "public/modules/videoscope/videoscope-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/videoscope/videoscope-worklet-evaluator.js",
  },
  wallDelay: {
    source: "public/modules/wallDelay/wall-delay-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/wallDelay/wall-delay-worklet-evaluator.js",
  },
  waveguide: {
    source: "public/modules/waveguide/waveguide-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/waveguide/waveguide-math.js",
  },
  wirdoSpiral: {
    source: "public/modules/wirdoSpiral/wirdo-spiral-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/wirdoSpiral/wirdo-spiral-worklet-evaluator.js",
  },
  wireEvents: {
    source: "public/modules/wireEvents/wire-events-live-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/wireEvents/wire-events-live-evaluator.js",
  },
  xyPad: {
    source: "public/modules/xyPad/xy-pad-dsp.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/xyPad/xy-pad-dsp.js",
  },
  yellowjacketFilter: {
    source: "public/modules/yellowjacketFilter/yellowjacket-filter-worklet-evaluator.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/yellowjacketFilter/yellowjacket-filter-worklet-evaluator.js",
  },
});

function nodeGraphJsSourceEntryForType(type) {
  return nodeGraphJsSourceEntriesByType[String(type || "")] || null;
}

function nodeGraphCodeEntryForType(type) {
  return nodeGraphNativeModulesForType(type).find((entry) => entry?.sourceUrl) ||
    nodeGraphJsSourceEntryForType(type);
}

function nodeGraphLibEntryForType(type) {
  return nodeGraphNativeModulesForType(type).find((entry) => entry?.libUrl) || null;
}

function nodeGraphModuleStoreEntries() {
  return nodeGraphModuleStoreTypesList()
    .map((type) => {
      const nativeModules = nodeGraphNativeModulesForType(type);
      const implemented =
        Object.hasOwn(nodeGraphModuleDefinitions, type) &&
        !nodeGraphModuleStoreUnderConstructionTypes.has(type);
      const developerVisible = nodeGraphModuleIsStoreVisible(type, "developer");
      const developerOnly = nodeGraphModuleStoreCatalog[type]?.developerOnly === true;
      const catalogHidden = nodeGraphModuleStoreCatalog[type]?.hidden === true;
      const publicVisible = !developerOnly && !catalogHidden;
      return {
        ...(nodeGraphModuleStoreCatalog[type] || {}),
        category: normalizeNodeGraphModuleStoreDepartment(nodeGraphModuleStoreCatalog[type]?.category || ""),
        type,
        demoPatch: nodeGraphModuleStoreDemoPatchAvailable(type),
        demoListen: nodeGraphModuleStoreDemoListenAvailable(type),
        developerOnly,
        developerVisible: developerVisible && !catalogHidden,
        homeVisible: nodeGraphModuleIsStoreVisible(type, "home") && implemented && !catalogHidden,
        implemented,
        label: nodeGraphModuleStoreCatalog[type]?.label || nodeGraphNodeLabels[type] || type,
        nativeAvailable: nativeModules.some((entry) => entry.wasmAvailable),
        nativeModules,
        shopVisible: publicVisible,
        visible: publicVisible,
      };
    });
}

function setNodeGraphModuleCatalogVisibility(type, visible, shelf = "shop") {
  if (!Object.hasOwn(nodeGraphModuleDefinitions || {}, type)) {
    return;
  }
  const key = shelf === "home" ? "home" : "developer";
  const current = nodeGraphModuleCatalogVisibility();
  nodeGraphMvp.moduleCatalogVisibility = {
    ...current,
    [type]: {
      ...(current[type] || { developer: true, home: false }),
      [key]: Boolean(visible),
    },
  };
  saveNodeGraphModuleCatalogVisibilityLocal();
  renderNodeGraphModuleStoreCatalog();
}

function normalizeNodeGraphModuleStoreDepartment(department = "") {
  const value = String(department || "").trim();
  if (!value) return "";
  // Direct ID match — all catalog entries now use canonical IDs.
  if (nodeGraphModuleStoreDepartmentById[value]) return value;
  // Backward-compat: old bare-name strings from stored settings.
  return nodeGraphModuleStoreDepartmentAliasToId[value] || "";
}

// Every path that a USER CLICK takes to change page goes through here (the
// category cards and the back button), which is exactly what makes this the
// right place to record the anchor: the page the browser returns to next time
// it opens. Pages the browser moves to on its own -- the all-categories view a
// search drops you into -- never touch it.
function setNodeGraphModuleStoreDepartment(department = "") {
  nodeGraphMvp.moduleStoreDepartment = normalizeNodeGraphModuleStoreDepartment(department);
  nodeGraphMvp.moduleStoreDepartmentAnchor = nodeGraphMvp.moduleStoreDepartment;
  renderNodeGraphModuleStoreCatalog();
  if (typeof saveNodeGraphModuleStoreStateToUserSettings === "function") {
    saveNodeGraphModuleStoreStateToUserSettings();
  }
}

function saveNodeGraphModuleStoreStateToUserSettings() {
  if (
    typeof serializeNodeUiDevSettings === "function" &&
    typeof saveNodeUiDevLocalDefaultSettings === "function"
  ) {
    saveNodeUiDevLocalDefaultSettings(serializeNodeUiDevSettings());
  }
}

function nodeGraphNormalizeModuleDepartmentSearch(value = "") {
  return String(value || "").trim().toLowerCase();
}

function nodeGraphModuleStoreEntryMatchesSearch(entry, query) {
  const needle = nodeGraphNormalizeModuleDepartmentSearch(query);
  if (!needle) {
    return true;
  }
  // Include department display name (e.g. "Scientific Filter") so shelf labels match.
  const depId = String(entry.category || "");
  const depLabel = nodeGraphModuleStoreDepartmentById[depId]?.label
    || nodeGraphModuleStoreDepartmentById[depId]?.title
    || "";
  const haystack = [
    entry.label,
    entry.type,
    entry.category,
    depLabel,
    entry.description,
    ...(entry.notes || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // All whitespace-separated tokens must appear (order-independent).
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return true;
  }
  return tokens.every((token) => haystack.includes(token));
}

/** Lower score = better match (label/type prefix beats loose substring). */
function nodeGraphModuleStoreSearchRank(entry, query) {
  const needle = nodeGraphNormalizeModuleDepartmentSearch(query);
  if (!needle) {
    return 0;
  }
  const label = String(entry?.label || "").toLowerCase();
  const type = String(entry?.type || "").toLowerCase();
  const notes = (Array.isArray(entry?.notes) ? entry.notes : [])
    .map((note) => String(note || "").toLowerCase().trim())
    .filter(Boolean);
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return 0;
  }
  // Exact label / type
  if (label === needle || type === needle) {
    return -100;
  }
  // Label starts with full query ("eq" → "eq filter")
  if (label.startsWith(needle) || type.startsWith(needle)) {
    return -80;
  }
  // Catalog notes used as search aliases (e.g. "value" → Number Readout).
  // Prefer an exact note match over a loose description substring.
  if (tokens.every((t) => notes.some((n) => n === t))) {
    return -70;
  }
  if (tokens.every((t) => notes.some((n) => {
    const words = n.split(/[^a-z0-9]+/).filter(Boolean);
    return words.some((w) => w === t || w.startsWith(t));
  }))) {
    return -65;
  }
  // Every token is a word-start in the label (e.g. "eq" in "EQ Filter")
  const labelWords = label.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.every((t) => labelWords.some((w) => w.startsWith(t)))) {
    return -60;
  }
  // Token sits inside a label/type word ("pad" → Keypad)
  if (tokens.every((t) => label.includes(t) || type.includes(t)
    || labelWords.some((w) => w.includes(t)))) {
    return -50;
  }
  // Type camelCase starts (eqFilter)
  if (tokens.every((t) => type.includes(t))) {
    return -40;
  }
  return 0;
}

function nodeGraphModuleStoreDepartmentMatchesSearch(department, entries, query) {
  const needle = nodeGraphNormalizeModuleDepartmentSearch(query);
  if (!needle) {
    return true;
  }
  const haystack = [
    department,
    ...(entries || []).flatMap((entry) => [
      entry.label,
      entry.type,
      entry.description,
      ...(entry.notes || []),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function nodeGraphModuleStoreSearchResultOrder(a, b, query = "") {
  const implementedDelta = Number(Boolean(b?.implemented)) - Number(Boolean(a?.implemented));
  if (implementedDelta) {
    return implementedDelta;
  }
  const q = query
    || (typeof nodeGraphMvp !== "undefined" && (nodeGraphMvp.moduleStoreDepartmentSearch || nodeGraphMvp.commandCenterModuleSearch))
    || "";
  const rankDelta = nodeGraphModuleStoreSearchRank(a, q) - nodeGraphModuleStoreSearchRank(b, q);
  if (rankDelta) {
    return rankDelta;
  }
  return String(a?.label || "").localeCompare(String(b?.label || ""));
}

function nodeGraphModuleStorePublicEntriesByDepartment(entries = []) {
  const groups = new Map();
  for (const dep of nodeGraphModuleStoreDepartments) {
    groups.set(dep.id, []);
  }
  entries
    .filter((entry) => entry.visible)
    .forEach((entry) => {
      const rawCategory = entry.category || "Other";
      const departmentId = nodeGraphModuleStoreDepartmentAliasToId[rawCategory]
        || rawCategory;
      if (!groups.has(departmentId)) {
        groups.set(departmentId, []);
      }
      groups.get(departmentId).push(entry);
    });
  return [...groups.entries()]
    .filter(([, departmentEntries]) => departmentEntries.length > 0)
    .map(([departmentId, departmentEntries]) => [
      departmentId,
      departmentEntries.sort((a, b) => a.label.localeCompare(b.label)),
    ])
    .sort(([a], [b]) => {
      const aIndex = nodeGraphModuleStoreDepartments.findIndex((dep) => dep.id === a);
      const bIndex = nodeGraphModuleStoreDepartments.findIndex((dep) => dep.id === b);
      const normalizedA = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
      const normalizedB = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;
      return normalizedA - normalizedB || a.localeCompare(b);
    });
}

const nodeGraphModuleShopWindowDefaultSize = Object.freeze({
  width: 180,
  height: 620,
  minWidth: 96,
  maxWidth: 980,
  minHeight: 120,
  // Height max = available view from window top (no fixed ceiling).
});

function normalizeNodeGraphModuleShopWindowSize(size = {}, element = null) {
  if (typeof normalizeNodeGraphFloatingWindowSize === "function") {
    return normalizeNodeGraphFloatingWindowSize(
      size,
      nodeGraphModuleShopWindowDefaultSize,
      element ? { element } : {},
    );
  }
  const source = size && typeof size === "object" ? size : {};
  return {
    width: Math.max(
      nodeGraphModuleShopWindowDefaultSize.minWidth,
      Math.min(
        nodeGraphModuleShopWindowDefaultSize.maxWidth,
        Math.round(Number(source.width) || nodeGraphModuleShopWindowDefaultSize.width),
      ),
    ),
    height: Math.max(
      nodeGraphModuleShopWindowDefaultSize.minHeight,
      Math.round(Number(source.height) || nodeGraphModuleShopWindowDefaultSize.height),
    ),
  };
}

function applyNodeGraphModuleShopWindowSize(size = {}, element = null) {
  const panel = element || document.getElementById("nodeModuleShopView");
  const previous = nodeGraphMvp?.moduleShopWindowSize
    || nodeGraphMvp?.unifiedWindowSize
    || nodeGraphMvp?.workspaceWindowStates?.moduleBrowser?.size
    || null;
  const merged = typeof mergeNodeGraphFloatingWindowSize === "function"
    ? mergeNodeGraphFloatingWindowSize(previous, size, nodeGraphModuleShopWindowDefaultSize)
    : { ...(previous || nodeGraphModuleShopWindowDefaultSize), ...(size || {}) };
  const normalized = normalizeNodeGraphModuleShopWindowSize(merged, panel);
  const stored = {
    width: normalized.width,
    ...(Number.isFinite(normalized.height) ? { height: normalized.height } : {}),
  };
  if (nodeGraphMvp) {
    nodeGraphMvp.moduleShopWindowSize = stored;
  }
  if (panel) {
    if (typeof applyNodeGraphFloatingWindowSizeVars === "function") {
      applyNodeGraphFloatingWindowSizeVars(panel, "node-module-shop", nodeGraphModuleShopWindowDefaultSize, stored);
    } else {
      panel.style.setProperty("--node-module-shop-width", `${stored.width}px`);
      if (Number.isFinite(stored.height)) {
        panel.style.setProperty("--node-module-shop-height", `${stored.height}px`);
      }
    }
    // Always pin inline box so height stretch is not lost to CSS auto/max caps.
    if (typeof syncNodeGraphFloatingWindowInlineBox === "function") {
      syncNodeGraphFloatingWindowInlineBox(panel, stored);
    }
    if (Number.isFinite(normalized._maxHeight)) {
      panel.style.setProperty("--node-module-shop-max-height", `${normalized._maxHeight}px`);
    }
    if (Number.isFinite(normalized._maxWidth)) {
      panel.style.setProperty("--node-module-shop-max-width", `${normalized._maxWidth}px`);
    }
  }
  requestAnimationFrame(updateNodeGraphModuleStoreScrollAffordance);
  return stored;
}

function nodeGraphModuleShopWindowSizeFromElement(panel = document.getElementById("nodeModuleShopView")) {
  const rect = panel?.getBoundingClientRect?.();
  return normalizeNodeGraphModuleShopWindowSize({
    width: rect?.width,
    height: rect?.height,
  });
}

function saveNodeGraphModuleShopWindowSizeToUserSettings() {
  const panel = document.getElementById("nodeModuleShopView");
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "moduleBrowser",
      panel,
      { open: !panel?.hidden, size: nodeGraphModuleShopWindowSizeFromElement(panel) },
      { status: false },
    );
  }
}

function handleNodeGraphModuleDepartmentSearchInput(event) {
  nodeGraphMvp.moduleStoreDepartmentSearch = String(event?.currentTarget?.value || "");
  renderNodeGraphModuleStoreCatalog();
}

function handleNodeGraphModuleDepartmentSearchKeydown(event) {
  if (event?.key !== "Escape") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  nodeGraphMvp.moduleStoreDepartmentSearch = "";
  event.currentTarget.value = "";
  renderNodeGraphModuleStoreCatalog();
}

/**
 * Command Center module search — same catalog matching as the Module Browser,
 * but lives on the Command Center page so you don't have to switch tabs.
 */
function handleNodeGraphCommandCenterModuleSearchInput(event) {
  nodeGraphMvp.commandCenterModuleSearch = String(event?.currentTarget?.value || "");
  renderNodeGraphCommandCenterModuleSearch();
}

function handleNodeGraphCommandCenterModuleSearchKeydown(event) {
  if (event?.key !== "Escape") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  nodeGraphMvp.commandCenterModuleSearch = "";
  if (event.currentTarget) {
    event.currentTarget.value = "";
  }
  renderNodeGraphCommandCenterModuleSearch();
}

function renderNodeGraphCommandCenterModuleSearch() {
  const shell = document.getElementById("nodeCommandCenterModuleSearch");
  const field = document.getElementById("nodeCommandCenterModuleSearchInput");
  const results = document.getElementById("nodeCommandCenterModuleSearchResults");
  if (!shell || !field || !results) {
    return;
  }
  // Only meaningful while Command Center itself is open (not Module Actions).
  const commandCenter = document.getElementById("nodeSceneContextMenu");
  if (commandCenter?.hidden) {
    return;
  }

  const query = String(nodeGraphMvp.commandCenterModuleSearch || "");
  if (document.activeElement !== field && field.value !== query) {
    field.value = query;
  }

  const needle = typeof nodeGraphNormalizeModuleDepartmentSearch === "function"
    ? nodeGraphNormalizeModuleDepartmentSearch(query)
    : String(query || "").trim().toLowerCase();

  results.replaceChildren();
  if (!needle) {
    results.hidden = true;
    shell.classList.remove("has-results");
    return;
  }

  const entries = typeof nodeGraphModuleStoreEntries === "function"
    ? nodeGraphModuleStoreEntries()
    : [];
  const matches = entries
    .filter((entry) => entry.visible && entry.implemented
      && (typeof nodeGraphModuleStoreEntryMatchesSearch === "function"
        ? nodeGraphModuleStoreEntryMatchesSearch(entry, query)
        : true))
    .sort(typeof nodeGraphModuleStoreSearchResultOrder === "function"
      ? (a, b) => nodeGraphModuleStoreSearchResultOrder(a, b, query)
      : () => 0);

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "scene-context-store-empty";
    empty.textContent = "No modules match this search.";
    results.append(empty);
    results.hidden = false;
    shell.classList.add("has-results");
    return;
  }

  for (const entry of matches) {
    if (typeof createNodeGraphModuleStoreButton === "function") {
      results.append(createNodeGraphModuleStoreButton(entry));
    }
  }
  results.hidden = false;
  shell.classList.add("has-results");
}

function nodeGraphModuleStoreDemoPatchAvailable(type) {
  return Boolean(
    Object.hasOwn(nodeGraphModuleDefinitions, type) &&
    !["audioInput", "groupInput", "groupOutput", "moduleGroup", "output"].includes(type)
  );
}

function nodeGraphModuleStoreDemoListenAvailable(type) {
  if (!nodeGraphModuleStoreDemoPatchAvailable(type)) {
    return false;
  }
  return nodeGraphPatchNodeOutputPorts(createNodeGraphPatchNode(type, { id: "demo" })).length > 0;
}

function nodeGraphModuleStoreDemoPatch(type) {
  if (!nodeGraphModuleStoreDemoPatchAvailable(type)) {
    return null;
  }
  const definition = nodeGraphModuleDefinitions[type];
  const outputPorts = nodeGraphPatchNodeOutputPorts(createNodeGraphPatchNode(type, { id: "demo" }));
  const sourcePort = outputPorts.find((port) => port !== "Gate") || outputPorts[0] || "";
  const nodes = [
    createNodeGraphPatchNode(type, { gx: 3, gy: 5, id: "demo" }),
    createNodeGraphPatchNode("output", { gx: 16, gy: 5, id: "output" }),
  ];
  const connections = [];
  if (sourcePort) {
    connections.push({
      destinationNode: "output",
      destinationPort: "Left",
      sourceNode: "demo",
      sourcePort,
    });
    connections.push({
      destinationNode: "output",
      destinationPort: "Right",
      sourceNode: "demo",
      sourcePort,
    });
  }
  return validateNodeGraphPatch({
    audio: { targetSampleRate: 44100 },
    bypassedNodes: [],
    connections,
    format: { ...nodeGraphPatchFormat },
    grid: { ...nodeGraphGrid },
    info: {
      author: "Soundemote",
      description: `Demo patch for ${nodeGraphNodeLabels[type] || type}.`,
      name: `${nodeGraphNodeLabels[type] || type} demo`,
      tags: `${definition?.category || "module"}, demo`,
    },
    modulations: [],
    monitors: [],
    nodes,
    timing: {
      tempoBpm: 120,
      timeSignatureDenominator: 4,
      timeSignatureNumerator: 4,
    },
    uiItems: [],
    view: { widthGu: 22, heightGu: 13 },
    visual: normalizeNodeGraphPatchVisual(nodeGraphMvp.patch?.visual),
    windows: normalizeNodeGraphPatchWindows({}),
  });
}

function playNodeGraphRenderedAudioElement() {
  const audio = document.getElementById("audioPlayer");
  if (!audio?.src) {
    return;
  }
  audio.currentTime = 0;
  audio.play?.().catch?.((_error) => {});
}

function withNodeGraphModuleStoreDemoPatch(entry, callback) {
  const userPatch = cloneNodeGraphPatch(nodeGraphMvp.patch);
  const demoPatch = nodeGraphModuleStoreDemoPatch(entry.type);
  if (!demoPatch) {
    setNodeGraphScriptStatus(`${entry.label} demo unavailable`, false);
    return;
  }
  commitNodeGraphPatch(demoPatch, {
    record: false,
    status: `${entry.label} demo loaded`,
  });
  callback({ demoPatch, userPatch });
}

function listenToNodeGraphModuleStoreDemo(entry) {
  withNodeGraphModuleStoreDemoPatch(entry, ({ userPatch }) => {
    renderNodeGraphAudio();
    const rendered = nodeGraphMvp.rendered ? { ...nodeGraphMvp.rendered } : null;
    const statusText = rendered ? `${entry.label} demo rendered` : `${entry.label} demo render blocked`;
    commitNodeGraphPatch(userPatch, {
      record: false,
      status: "returned to your patch",
    });
    if (rendered) {
      nodeGraphMvp.rendered = rendered;
      syncNodeGraphRenderedAudioElement();
      playNodeGraphRenderedAudioElement();
      setNodeGraphScriptStatus(statusText, true);
    } else {
      markNodeGraphRenderPending(statusText);
      setNodeGraphScriptStatus(statusText, false);
    }
  });
}

function watchNodeGraphModuleStoreDemo(entry) {
  withNodeGraphModuleStoreDemoPatch(entry, () => {
    setNodeGraphViewMode("modular");
  });
}

function editNodeGraphModuleStoreDemo(entry) {
  withNodeGraphModuleStoreDemoPatch(entry, () => {
    setNodeGraphViewMode("modular-windowed");
  });
}

function createNodeGraphModuleStoreButton(entry) {
  const card = document.createElement(entry.visible && entry.implemented ? "button" : "div");
  const spawnLabel = `Drag into scene to spawn ${entry.label} module`;
  card.className = "scene-context-store-card";
  card.dataset.moduleEnabled = String(entry.visible);
  card.dataset.homeEnabled = String(entry.homeVisible);
  card.dataset.developerEnabled = String(entry.developerVisible);
  card.dataset.moduleImplemented = String(entry.implemented);
  // Hover tooltip: use-case first (short sentence from catalog description).
  const useCase = String(entry.description || "").trim()
    || "Module reference entry.";
  card.title = entry.visible && entry.implemented
    ? `${useCase} — drag into the scene to spawn.`
    : `${entry.label}: ${useCase}`;
  card.setAttribute(
    "aria-label",
    entry.visible && entry.implemented
      ? `${entry.label}. ${useCase} Drag into scene to spawn.`
      : `${entry.label} module unavailable. ${useCase}`,
  );
  if (entry.visible && entry.implemented) {
    card.dataset.contextModule = entry.type;
    card.type = "button";
    card.role = "button";
    card.tabIndex = 0;
  } else {
    card.classList.add("under-construction");
    card.setAttribute("aria-disabled", "true");
  }

  const label = document.createElement("strong");
  label.textContent = entry.label;
  const nativeStatus = entry.nativeAvailable ? document.createElement("small") : null;
  if (nativeStatus) {
    nativeStatus.textContent = "Native C++";
    nativeStatus.className = "node-module-store-native-status";
  }

  if (entry.implemented) {
    card.append(label);
    if (nativeStatus) {
      card.append(nativeStatus);
    }
  } else {
    const status = document.createElement("small");
    status.textContent = "Under construction";
    card.append(label);
    if (nativeStatus) {
      card.append(nativeStatus);
    }
    card.append(status);
  }
  return card;
}

function createNodeGraphModuleDepartmentButton(departmentId, entries) {
  const dep = nodeGraphModuleStoreDepartmentById[departmentId];
  const emoji = dep ? dep.emoji : "";
  const titleText = dep ? dep.label : departmentId;
  const button = document.createElement("button");
  button.className = "scene-context-store-department-card";
  button.type = "button";
  button.dataset.storeDepartment = departmentId;
  button.title = `${titleText}: module department`;
  button.setAttribute("aria-label", `Open ${titleText} module department.`);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setNodeGraphModuleStoreDepartment(departmentId);
  });

  const symbol = document.createElement("span");
  symbol.className = "scene-context-store-department-symbol";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = emoji || "";

  const title = document.createElement("strong");
  title.className = "scene-context-store-department-title";
  title.textContent = titleText;

  const count = document.createElement("span");
  count.className = "scene-context-store-department-count";
  const workingCount = entries.filter((entry) => entry.visible && entry.implemented).length;
  count.textContent = String(workingCount);

  button.append(symbol, title, count);
  return button;
}

function createNodeGraphModuleStoreVisualGroupHeader(groupLabel) {
  const header = document.createElement("div");
  header.className = "scene-context-store-visual-group";
  header.textContent = groupLabel;
  return header;
}

function renderNodeGraphModuleStoreDepartmentGroup(target, groupLabel, departmentEntries, departmentSearch) {
  const matchingDepartments = departmentEntries.filter(([department, entries]) =>
    nodeGraphModuleStoreDepartmentMatchesSearch(department, entries, departmentSearch)
  );
  if (!matchingDepartments.length) {
    return;
  }
  target.append(createNodeGraphModuleStoreVisualGroupHeader(groupLabel));
  for (const [department, entries] of matchingDepartments) {
    target.append(createNodeGraphModuleDepartmentButton(department, entries));
  }
}

function loadNodeGraphModuleGroupsLocal() {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return {};
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(nodeGraphModuleGroupStorageKey) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function saveNodeGraphModuleGroupsLocal(groups) {
  if (!nodeGraphLocalDefaultPresetAllowed()) {
    return false;
  }
  try {
    window.localStorage.setItem(nodeGraphModuleGroupStorageKey, JSON.stringify(groups));
    return true;
  } catch {
    return false;
  }
}

function createNodeGraphModuleGroupButton(name, group) {
  // A real <button>, not a <div> -- nodeGraphDialogDragTargetIsInteractive
  // (node-graph-view-controls.js) only recognizes button/[role='button']/
  // [data-context-module]/etc. as "don't start dragging the panel" targets.
  // A bare div here meant every click's pointerdown got captured by the
  // floating-window drag handler first, which retargets the resulting
  // click event's target away from this card -- so clicks silently never
  // reached handleNodeGraphModuleStoreClick's [data-context-group] lookup,
  // even though that handler and this card's dataset already matched.
  const card = document.createElement("button");
  card.type = "button";
  card.className = "scene-context-store-card";
  card.dataset.moduleGroup = name;
  card.dataset.contextGroup = name;
  card.title = `Add "${name}" to the scene`;
  card.setAttribute("aria-label", `Add module group ${name} to the scene`);
  const label = document.createElement("strong");
  label.textContent = name;
  card.append(label);

  // Separate sibling button, not nested inside `card` -- a <button> can't
  // contain another interactive <button> (invalid HTML, unreliable click
  // targeting), so a wrapping, non-interactive container holds both.
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "scene-context-store-card-delete";
  deleteButton.textContent = "×";
  deleteButton.title = `Delete saved group "${name}"`;
  deleteButton.setAttribute("aria-label", `Delete saved module group ${name}`);
  deleteButton.dataset.deleteGroup = name;

  const wrap = document.createElement("div");
  wrap.className = "scene-context-store-card-wrap";
  wrap.append(card, deleteButton);
  return wrap;
}

function renderNodeGraphModuleGroupCatalog() {
  const shell = document.getElementById("nodeModuleGroups");
  const target = document.getElementById("nodeModuleGroupList");
  if (!shell || !target) {
    return;
  }
  const groups = loadNodeGraphModuleGroupsLocal();
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  target.innerHTML = "";
  for (const name of names) {
    target.append(createNodeGraphModuleGroupButton(name, groups[name]));
  }
  shell.hidden = names.length === 0;
}

function nodeGraphModuleStoreScrollFrame(available = document.getElementById("nodeModuleDepartmentList")) {
  return available?.closest?.(".node-module-shop-scroll-frame") || available || null;
}

function updateNodeGraphModuleStoreScrollAffordance() {
  const available = document.getElementById("nodeModuleDepartmentList");
  const frame = nodeGraphModuleStoreScrollFrame(available);
  if (!available || !frame) {
    return;
  }
  const maxScrollTop = Math.max(0, available.scrollHeight - available.clientHeight);
  const scrollTop = Math.max(0, available.scrollTop);
  frame.classList.toggle("can-scroll-up", scrollTop > 1);
  frame.classList.toggle("can-scroll-down", scrollTop < maxScrollTop - 1);
}

function bindNodeGraphModuleStoreScrollAffordance() {
  const available = document.getElementById("nodeModuleDepartmentList");
  if (!available || available.dataset.scrollAffordanceBound === "true") {
    return;
  }
  available.dataset.scrollAffordanceBound = "true";
  available.addEventListener("scroll", updateNodeGraphModuleStoreScrollAffordance, { passive: true });
  available.addEventListener("pointerenter", updateNodeGraphModuleStoreScrollAffordance);
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => updateNodeGraphModuleStoreScrollAffordance());
    observer.observe(available);
    available.nodeModuleStoreScrollAffordanceObserver = observer;
  }
}

function renderNodeGraphModuleStoreCatalog() {
  const available = document.getElementById("nodeModuleDepartmentList");
  const homeShell = document.getElementById("nodeModuleHomeShelfShell");
  const homeShelf = document.getElementById("nodeModuleHomeShelf");
  const shopView = document.getElementById("nodeModuleShopView");
  const backButton = document.getElementById("nodeModuleDepartmentBack");
  const departmentTitle = document.getElementById("nodeModuleDepartmentTitle");
  if (!available || !homeShell || !homeShelf || !shopView) {
    return;
  }

  available.innerHTML = "";
  homeShelf.innerHTML = "";
  const entries = nodeGraphModuleStoreEntries();
  const selectedDepartment = normalizeNodeGraphModuleStoreDepartment(nodeGraphMvp.moduleStoreDepartment || "");
  if (nodeGraphMvp.moduleStoreDepartment !== selectedDepartment) {
    nodeGraphMvp.moduleStoreDepartment = selectedDepartment;
  }
  const departmentSearch = nodeGraphMvp.moduleStoreDepartmentSearch || "";
  const hasDepartmentSearchText = Boolean(nodeGraphNormalizeModuleDepartmentSearch(departmentSearch));
  // Typing a search query always searches every module across every category,
  // even while a specific category tab is selected -- previously search text
  // was silently restricted to whatever category tab happened to be open.
  const searchingAllModules = hasDepartmentSearchText;
  const departmentSearchField = document.getElementById("nodeModuleDepartmentSearch");
  if (departmentSearchField && departmentSearchField.value !== departmentSearch) {
    departmentSearchField.value = departmentSearch;
  }

  const publicDepartmentEntries = nodeGraphModuleStorePublicEntriesByDepartment(entries);
  const publicDepartmentNames = new Set(publicDepartmentEntries.map(([department]) => department));
  if (selectedDepartment && !publicDepartmentNames.has(selectedDepartment)) {
    nodeGraphMvp.moduleStoreDepartment = "";
    renderNodeGraphModuleStoreCatalog();
    if (typeof saveNodeGraphModuleStoreStateToUserSettings === "function") {
      saveNodeGraphModuleStoreStateToUserSettings();
    }
    return;
  }
  const matchingEntries = entries.filter((item) => nodeGraphModuleStoreEntryMatchesSearch(item, departmentSearch));
  const publicEntries = matchingEntries.filter((entry) =>
    entry.visible &&
    // Once there's search text, match against every category -- only fall
    // back to restricting by the selected category tab when the search box
    // is empty (plain category browsing).
    (!selectedDepartment || hasDepartmentSearchText || entry.category === selectedDepartment)
  );
  const visibleModuleEntries = selectedDepartment || departmentSearch
    ? [...publicEntries].sort((a, b) => nodeGraphModuleStoreSearchResultOrder(a, b, departmentSearch))
    : publicEntries;
  const homeEntries = entries.filter((entry) => entry.implemented && entry.homeVisible);

  shopView.classList.toggle("department-selected", Boolean(selectedDepartment));
  if (backButton) {
    backButton.hidden = !selectedDepartment;
  }
  if (departmentTitle) {
    departmentTitle.hidden = !selectedDepartment;
    departmentTitle.textContent = selectedDepartment || "";
  }
  available.classList.add("scene-context-store-department-list");
  available.classList.toggle("node-module-store-list", Boolean(selectedDepartment || searchingAllModules));

  for (const entry of homeEntries) {
    homeShelf.append(createNodeGraphModuleStoreButton(entry));
  }
  homeShell.hidden = homeEntries.length === 0;

  if (selectedDepartment || searchingAllModules) {
    for (const entry of visibleModuleEntries) {
      available.append(createNodeGraphModuleStoreButton(entry));
    }
  } else {
    for (const [department, departmentEntries] of publicDepartmentEntries) {
      if (!nodeGraphModuleStoreDepartmentMatchesSearch(department, departmentEntries, departmentSearch)) {
        continue;
      }
      available.append(createNodeGraphModuleDepartmentButton(department, departmentEntries));
    }
  }
  if (!available.children.length) {
    const empty = document.createElement("div");
    empty.className = "scene-context-store-empty";
    empty.textContent = departmentSearch
      ? "No modules match this search."
      : selectedDepartment
        ? "No modules are available in this category."
        : "No categories are available.";
    available.append(empty);
  }
  renderNodeGraphModuleGroupCatalog();
  bindNodeGraphModuleStoreScrollAffordance();
  requestAnimationFrame(updateNodeGraphModuleStoreScrollAffordance);
  if (typeof installNodeGraphModuleTitleTextFitObserver === "function") {
    installNodeGraphModuleTitleTextFitObserver();
  } else if (typeof scheduleNodeGraphModuleTitleTextFit === "function") {
    scheduleNodeGraphModuleTitleTextFit();
  }
}

function positionNodeGraphModuleShopView(x, y) {
  const panel = document.getElementById("nodeModuleShopView");
  if (!panel) {
    return;
  }
  panel.style.position = "fixed";
  panel.style.margin = "0";
  const { left, top } = nodeGraphFloatingWindowPosition(panel, x, y);
  if (typeof setNodeGraphFloatingWindowViewportPosition === "function") {
    setNodeGraphFloatingWindowViewportPosition(panel, left, top);
  } else {
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
  }
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState(
      "moduleBrowser",
      panel,
      { open: !panel.hidden, position: { left, top } },
      { persist: false },
    );
  }
}

function positionNodeGraphModuleShopViewNearPoint(point = null) {
  const panel = document.getElementById("nodeModuleShopView");
  if (!panel) {
    return;
  }
  const x = Number(point?.x);
  const y = Number(point?.y);
  panel.hidden = false;
  const rect = panel.getBoundingClientRect();
  positionNodeGraphModuleShopView(
    Number.isFinite(x) ? x : Math.max(12, (window.innerWidth - rect.width) * 0.5),
    Number.isFinite(y) ? y : 72,
  );
}

function beginNodeGraphModuleShopViewDrag(event) {
  const panel = document.getElementById("nodeModuleShopView");
  if (!panel || panel.hidden) {
    return;
  }
  beginNodeGraphFloatingWindowDrag(event, panel, "moduleShopDragging");
}

function dragNodeGraphModuleShopView(event) {
  dragNodeGraphFloatingWindow(
    event,
    "moduleShopDragging",
    document.getElementById("nodeModuleShopView"),
    (next) => {
      if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
        rememberNodeGraphWorkspaceWindowState(
          "moduleBrowser",
          document.getElementById("nodeModuleShopView"),
          { open: true, position: next },
          { persist: false },
        );
      }
    },
  );
}

function endNodeGraphModuleShopViewDrag(event) {
  endNodeGraphFloatingWindowDrag(event, "moduleShopDragging", () => {
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "moduleBrowser",
        document.getElementById("nodeModuleShopView"),
        { open: true },
        { status: false },
      );
    }
  });
}

function beginNodeGraphModuleShopViewResize(event) {
  const panel = document.getElementById("nodeModuleShopView");
  beginNodeGraphFloatingWindowResize(event, panel, "moduleShopResizing");
}

function dragNodeGraphModuleShopViewResize(event) {
  dragNodeGraphFloatingWindowResize(event, "moduleShopResizing", applyNodeGraphModuleShopWindowSize);
}

function endNodeGraphModuleShopViewResize(event) {
  endNodeGraphFloatingWindowResize(event, "moduleShopResizing", () => {
    saveNodeGraphModuleShopWindowSizeToUserSettings();
    if (typeof rememberNodeGraphUnifiedWindowSizeFromElement === "function") {
      rememberNodeGraphUnifiedWindowSizeFromElement(document.getElementById("nodeModuleShopView"));
    }
  });
}

// Opening the browser is always a fresh start to type into: the search box is
// emptied and focused, and the page goes back to the last category the user
// clicked (nodeGraphMvp.moduleStoreDepartmentAnchor) rather than wherever the
// previous search left it. Applies to an already-open browser too -- a second
// right-click is a "give me a clean browser" gesture, not a no-op.
function resetNodeGraphModuleShopSearch() {
  nodeGraphMvp.moduleStoreDepartmentSearch = "";
  const anchor = normalizeNodeGraphModuleStoreDepartment(nodeGraphMvp.moduleStoreDepartmentAnchor || "");
  nodeGraphMvp.moduleStoreDepartmentAnchor = anchor;
  nodeGraphMvp.moduleStoreDepartment = anchor;
  const field = document.getElementById("nodeModuleDepartmentSearch");
  if (field) {
    field.value = "";
  }
}

// Focus lands after the panel is unhidden AND positioned: focusing a hidden or
// mid-move element is what makes browsers scroll the page to chase it.
function focusNodeGraphModuleShopSearch() {
  const field = document.getElementById("nodeModuleDepartmentSearch");
  if (!field) {
    return;
  }
  window.requestAnimationFrame(() => {
    if (document.getElementById("nodeModuleShopView")?.hidden) {
      return;
    }
    field.focus({ preventScroll: true });
    field.select?.();
  });
}

function ensureNodeGraphModuleShopIsFloating(panel = document.getElementById("nodeModuleShopView")) {
  if (!panel) {
    return null;
  }
  // Must be fixed so it never expands #nodeWiringPanel / blocks workspace resize.
  panel.style.position = "fixed";
  panel.style.margin = "0";
  panel.style.right = "auto";
  if (typeof markNodeGraphFloatingWindowSurface === "function") {
    markNodeGraphFloatingWindowSurface(panel);
  }
  return panel;
}

function openNodeGraphModuleShop(point = null, windowPoint = null) {
  const panel = ensureNodeGraphModuleShopIsFloating(document.getElementById("nodeModuleShopView"));
  if (!panel) {
    return;
  }

  const unifiedDriving = Boolean(nodeGraphMvp._unifiedWindowSwitching);

  // Already open: refresh content. Seat/displacement is the unified switcher's job
  // when navigating; independent re-open still notes for sibling close.
  if (!panel.hidden && !unifiedDriving) {
    resetNodeGraphModuleShopSearch();
    renderNodeGraphModuleStoreCatalog();
    pulseNodeGraphFloatingWindowAttention(panel);
    focusNodeGraphModuleShopSearch();
    if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
      noteNodeGraphUnifiedWindowOpened("moduleBrowser", panel);
    }
    if (typeof syncNodeGraphUnifiedWindowNavBars === "function") {
      syncNodeGraphUnifiedWindowNavBars();
    }
    return;
  }

  resetNodeGraphModuleShopSearch();
  nodeGraphMvp.sceneContextPoint = point;
  nodeGraphMvp.sceneContextTargetNode = null;
  nodeGraphMvp.sceneContextTargetWire = null;
  // Floating window — never changes the main view mode.
  panel.hidden = false;
  document.getElementById("nodeModuleShopButton")?.classList.toggle("active", true);
  document.getElementById("nodeModuleShopButton")?.setAttribute("aria-pressed", "true");
  renderNodeGraphModuleStoreCatalog();

  const seat = nodeGraphMvp._unifiedWindowPendingPosition
    || (!unifiedDriving ? nodeGraphMvp.unifiedWindowPosition : null)
    || null;
  const hasSeat = seat
    && Number.isFinite(Number(seat.left))
    && Number.isFinite(Number(seat.top));

  if (unifiedDriving && hasSeat) {
    // Shared seat applied once by openNodeGraphUnifiedWindowPage after return.
    // Do not restore this browser's own saved offset (that spawned a second window).
    if (typeof markNodeGraphFloatingWindowSurface === "function") {
      markNodeGraphFloatingWindowSurface(panel);
    }
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "moduleBrowser",
        panel,
        { open: true },
        { capturePosition: false, status: false },
      );
    }
  } else if (hasSeat) {
    if (typeof seatNodeGraphUnifiedWindow === "function") {
      seatNodeGraphUnifiedWindow(panel, "moduleBrowser", {
        left: Number(seat.left),
        top: Number(seat.top),
        ...(nodeGraphMvp.unifiedWindowSize || {}),
      });
    } else {
      positionNodeGraphModuleShopView(Number(seat.left), Number(seat.top));
      if (nodeGraphMvp.unifiedWindowSize && typeof applyNodeGraphModuleShopWindowSize === "function") {
        applyNodeGraphModuleShopWindowSize(nodeGraphMvp.unifiedWindowSize);
      }
    }
    if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
      rememberNodeGraphWorkspaceWindowState(
        "moduleBrowser",
        panel,
        {
          open: true,
          position: { left: Number(seat.left), top: Number(seat.top) },
          ...(nodeGraphMvp.unifiedWindowSize ? { size: nodeGraphMvp.unifiedWindowSize } : {}),
        },
        { status: false },
      );
    }
  } else {
    // Cold open: restore this browser's own seat, or spawn near the pointer.
    if (typeof applyNodeGraphModuleShopWindowSize === "function") {
      applyNodeGraphModuleShopWindowSize(
        nodeGraphMvp.unifiedWindowSize
        || nodeGraphMvp.workspaceWindowStates?.moduleBrowser?.size,
      );
    }
    openNodeGraphFloatingWindowAtPosition("moduleBrowser", panel, () => {
      positionNodeGraphModuleShopViewNearPoint(windowPoint || point);
    });
    if (typeof rememberNodeGraphUnifiedWindowSizeFromElement === "function") {
      rememberNodeGraphUnifiedWindowSizeFromElement(panel);
    }
  }

  focusNodeGraphModuleShopSearch();
  if (typeof noteNodeGraphUnifiedWindowOpened === "function") {
    noteNodeGraphUnifiedWindowOpened("moduleBrowser", panel);
  }
  if (typeof syncNodeGraphUnifiedWindowNavBars === "function") {
    syncNodeGraphUnifiedWindowNavBars();
  }
}

function closeNodeGraphModuleShop() {
  nodeGraphMvp.sceneContextPoint = null;
  const panel = document.getElementById("nodeModuleShopView");
  if (panel) {
    panel.hidden = true;
  }
  document.getElementById("nodeModuleShopButton")?.classList.toggle("active", false);
  document.getElementById("nodeModuleShopButton")?.setAttribute("aria-pressed", "false");
  if (typeof rememberNodeGraphWorkspaceWindowState === "function") {
    rememberNodeGraphWorkspaceWindowState("moduleBrowser", panel, { open: false }, { status: false });
  }
}

function loadNodeGraphModuleStoreStateLocal() {
  renderNodeGraphModuleStoreCatalog();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadNodeGraphNativeModuleCatalog, { once: true });
} else {
  loadNodeGraphNativeModuleCatalog();
}
