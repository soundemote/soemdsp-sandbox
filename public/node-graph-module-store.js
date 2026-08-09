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
  { id: "clock",        emoji: "⌚", label: "Clock",        symbol: "♪",   title: "Clock",     pitch: "Clocks, dividers, counters, and trigger timing -- everything that decides WHEN the rest of the patch fires." },
  // Pitch, scale, chord — not sample playback (that's Sample Player) and not
  // "when" (that's Clock). G-clef mark keeps Musical distinct from 🎶 Sample Player.
  { id: "musical",      emoji: "🎼", label: "Musical",      symbol: "𝄞",  title: "Musical",  pitch: "Pitch, scale, and harmony tools: quantizers, chord pickers, progressions, and other note-theory building blocks." },
  { id: "modulator",    emoji: "♾️", label: "Modulator",    symbol: "⇄",   title: "Modulator", pitch: "Motion sources for pitch, amplitude, time, and texture. Small control engines that make patches move." },
  { id: "oscillator",   emoji: "⚪", label: "Oscillator",   symbol: "∿",   title: "Oscillator", pitch: "Start with a voice. Tone generators, phase motion, and the raw signal that everything else learns to orbit." },
  { id: "chaos",        emoji: "🌌", label: "Chaos",        symbol: "∞",   title: "Chaos",     pitch: "All the various attractors and strange motion systems. The wild shelf where math starts looking back." },
  { id: "jerobeam",     emoji: "♻️", label: "Jerobeam",     symbol: "JRB", title: "Jerobeam",  pitch: "Jerobeam spiral and orbit motion systems. Spiral Generator lives here." },
  { id: "noise",        emoji: "🌧️", label: "Noise",        symbol: "✦",   title: "Noise",     pitch: "Noise, dust, instability, sparks, and all the useful mess a clean machine secretly needs." },
  // Was "Music" (playback only). Sample Player holds Music Player / sample modules.
  // 🎶 reused so the shelf still reads as the audio-file family, not theory.
  // Samples / Grains / Media shelves stay offline until file storage exists.
  { id: "sample",       emoji: "🎶", label: "Sample Player", symbol: "▣", title: "Sample Player", pitch: "Sample and music-file playback: one-shots, loops, and scrubbable players that turn stored audio into patch signal." },
  { id: "object",       emoji: "🧊", label: "Object",       symbol: "●",   title: "Object",    pitch: "Things you place in the world rather than wire into the signal path -- indicator lights, label plates, and other in-world props." },
  { id: "rgb",          emoji: "🌈", label: "RGB",          symbol: "◍",   title: "RGB",       pitch: "Color sinks for the screen wash — precise RGB/HSL channels or stylized chroma drift, alpha, bloom, and glow." },
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
  Oscillator:        "oscillator",
  Oscilloscope:      "oscilloscope",
  Other:             "digital",
  Portals:           "portal",
  Plugin:            "plugin",
  plugin:            "plugin",
  RGB:               "rgb",
  Sample:            "sample",
  "Sample Player":   "sample",
  Samples:           "sample",
  samples:           "sample",
  Sequence:          "clock",
  Sequencer:         "clock",
  Time:              "clock",
  // Category id renamed 2026-07-25; keeps stored settings and old catalog
  // strings resolving instead of silently falling back to "no department".
  time:              "clock",
  Visual:            "digital",
});

const nodeGraphModuleStoreCatalog = Object.freeze({
  polyBlep: {
    category: "oscillator",
    description: "Anti-aliased PolyBLEP oscillator for clean saw, ramp, square, triangle, sine, and noise waveform outputs.",
    label: "PolyBLEP",
    notes: ["anti-aliasing", "polyblep", "realtime oscillator"],
  },
  blit: {
    category: "oscillator",
    description: "Band-Limited Impulse Train oscillator (Stilson/Smith style) -- alias-suppressed saw, ramp, square, triangle, and sine, derived from a closed-form impulse train instead of PolyBLEP correction polynomials.",
    label: "BLIT",
    notes: ["anti-aliasing", "blit", "realtime oscillator"],
  },
  archimedes: {
    category: "oscillator",
    description: "A 2-cycle integer symplectic sine/cosine engine that also extracts pi from its own dithered clock -- a self-oscillating quadrature pair with a bonus pi-estimation output.",
    label: "Archimedes",
    notes: ["quadrature", "fixed-point", "realtime oscillator"],
  },
  bradley2a: {
    category: "oscillator",
    description: "Naive digitization of the Bradley Telcom Jitter and Hit Synthesizer: a test tone impaired by phase/amp jitter, frequency translation, harmonic distortion, single-frequency interference, and periodic gain/dropout/phase/impulse hits. Intentionally aliases -- character first, band-limiting later. Native C++/WASM.",
    label: "Bradley 2A Jitter/Hit Synth",
    notes: ["test-tone impairment", "jitter", "frequency translation", "native"],
  },
  antisaw: {
    category: "oscillator",
    description: "Additive resynthesis of only the aliased partials of an ideal sawtooth: keeps just the harmonics that would exceed Nyquist, computes exactly where each folds to, and resynthesizes each as a clean, controllable in-band sine there -- simulated aliasing, not real aliasing. Tilt reshapes the 1/n curve toward dark/low or harsh/high folded partials. Native C++/WASM.",
    label: "Antisaw",
    notes: ["simulated aliasing", "additive resynthesis", "reflections", "native"],
  },
  sineWavetable: {
    category: "oscillator",
    description: "Table-driven sine/cosine oscillator with pitch, frequency, amplitude, and Nyquist-edge fade. Native C++/WASM.",
    label: "SinCos",
    notes: ["implemented", "wavetable", "sin/cos", "native"],
  },
  wavetable2d: {
    category: "oscillator",
    description:
      "Under construction. Wavetable2D — multi-frame 2D wavetable oscillator (frame morph / scan). Placeholder until the table engine lands.",
    label: "Wavetable2D",
    notes: ["under construction", "wavetable", "2d", "morph", "oscillator", "frame"],
  },
  wavetable3d: {
    category: "oscillator",
    description:
      "Under construction. Wavetable3D — volumetric / dual-axis morph wavetable oscillator. Placeholder until the table engine lands.",
    label: "Wavetable3D",
    notes: ["under construction", "wavetable", "3d", "morph", "volume", "oscillator"],
  },
  sinc: {
    category: "oscillator",
    description: "Sinc (sin(x)/x) oscillator. Band Limit mode uses the Dirichlet kernel (periodic sinc) with its harmonic count clamped to Nyquist, so it cannot alias; Ideal mode draws the literal sin(x)/x window, which is the textbook shape but aliases as an oscillator. Useful as a modulation source and for resampling theory demos.",
    label: "Sinc",
    notes: ["sinc", "sin(x)/x", "impulse", "oscillator"],
  },
  osc: {
    category: "modulator",
    description: "Basic multi-waveform oscillator (saw, ramp, square, triangle, sine, noise) with 0.1V/Oct and increment CV inputs.",
    label: "BasicShape",
    notes: ["BasicShape", "multi-waveform", "cv input", "LFO"],
  },
  aliasSine: {
    category: "oscillator",
    description: "Bare sine generator with a 0..1.5 normalized-frequency input (fraction of sample rate) that wraps naturally past Nyquist -- aliasing as an explicit, unhidden design choice rather than something to correct for.",
    label: "Alias Sine",
    notes: ["sine", "aliasing", "native"],
  },
  robinSinusoid: {
    category: "oscillator",
    description:
      "RS-MET recursive free-running sine (rosic::SineOscillator): y[n]=2·cos(ω)·y[n-1]−y[n-2]. No per-sample sin(). Cheap steady tones; Reset reseeds phase.",
    label: "RobinSinusoid",
    notes: ["RS-MET", "rosic", "recursive sine", "self-oscillating", "sinusoid"],
  },
  additiveOsc: {
    category: "oscillator",
    description: "Additive-synthesis oscillator building a waveform from summed harmonics. Native C++/WASM.",
    label: "Additive Osc",
    notes: ["additive synthesis", "harmonics", "native"],
  },
  gpuAdditiveOsc: {
    category: "oscillator",
    description: "GPU-accelerated additive oscillator variant.",
    label: "GPU Additive",
    notes: ["additive synthesis", "gpu"],
  },
  ellipsoid: {
    category: "modulator",
    description: "RoundShape — sine→square ellipse (getSineToSquare). Outs: Uni X/Y (0…A) and Bi X/Y (−A…A). Limit AA always on. f + 0.1V/Oct. Native C++/WASM.",
    label: "RoundShape",
    notes: ["RoundShape", "getSineToSquare", "Uni X", "Uni Y", "Bi X", "Bi Y", "Limit AA", "f", "native"],
  },
  ellipsoidOsc: {
    category: "source",
    description: "Full multi-param ellipsoid oscillator: Offset/Shape/Scale per axis + Frequency/Phase/Amplitude. Limit AA always on. X/Y face. Native C++/WASM.",
    label: "Ellipsoid",
    notes: ["ellipsoid", "offset", "shape", "scale", "Limit AA", "X/Y", "native"],
  },
  clock: {
    category: "clock",
    description: "Timer pulse source. Emits a steady gate for triggering samplers, sequencers, and motion events.",
    notes: ["rate and phase control", "duty cycle", "reset input"],
  },
  transport: {
    category: "clock",
    description: "Project-synced beat clock source. Emits in-phase square waves derived from patch BPM.",
    label: "Transport",
    notes: ["project BPM", "beat divisions", "engine-start phase"],
  },
  clockDivider: {
    category: "clock",
    description: "Clock-aware divider. Count incoming clock edges and emit a slower gate for rhythmic subdivision.",
    notes: ["clock input", "division control", "reset input"],
  },
  delayedTrigger: {
    category: "clock",
    description: "One-shot timer. Catch a trigger, wait a precise delay, then emit a pulse for downstream events.",
    notes: ["delayed pulse", "reset input", "one-shot timing"],
  },
  randomClock: {
    category: "clock",
    description: "Seeded random interval clock. Emits a short trigger and a duty-controlled gate between minimum and maximum seconds.",
    notes: ["random timing", "trigger and gate outputs", "reset input"],
  },
  triggerCounter: {
    category: "clock",
    description: "Pulse counter. Count incoming triggers, emit a wrap pulse, and expose the count as modulation.",
    notes: ["count pulses", "wrap output", "reset input"],
  },
  triggerDivider: {
    category: "clock",
    description: "Divides incoming trigger pulses into slower clocks for envelopes, sequencers, and rhythmic patches.",
    notes: ["trigger division", "reset input", "pulse width"],
  },
  minMax: {
    category: "dynamics",
    description: "Port of the Doepfer A-172 Maximum/Minimum Selector. Four inputs, two continuous outputs: Max is the highest of whatever's patched, Min is the lowest. Unpatched inputs are ignored (not read as 0), matching the original's \"leave unused inputs open\" behavior -- patch in as few as 2 or as many as all 4.",
    label: "Min/Max",
    notes: ["Doepfer A-172", "voltage selector", "native"],
  },
  comparator: {
    category: "digital",
    description: "1-sample history edge detector. Up/Down/Change are 1-sample pulses on rise/fall/any change; Steady is high while unchanged; Sign is a continuous In>0 gate; Thru passes In through. First sample seeds history only.",
    label: "Comparator",
    notes: ["edge detect", "up", "down", "change", "steady", "sign", "native"],
  },
  sampleDelay: {
    category: "utility",
    description: "Sample-accurate delay line. Thru is dry passthrough; Delayed is In delayed by Time (seconds) + Samples. Outlets dry (Thru) then wet (Delayed). Combined delay 0…4s, ring fully reserved so Time can be modulated without reallocation. Native C++/WASM.",
    label: "Sample Delay",
    notes: ["delay", "samples", "time", "thru", "delayed", "native"],
  },
  bitConverter: {
    category: "digital",
    description: "Converts a raw full-scale integer (e.g. keyboardController's Held Keys bitmask) to and from normalized 0..1 (unipolar) and -1..1 (bipolar) CV, using 2^bits - 1 as the ceiling. Patch a digital wire's exact value into audio-rate CV, or reconstruct the original integer from a CV signal on the way back.",
    label: "BitConverter",
    notes: ["normalize", "0..1", "-1..1", "bitmask"],
  },
  stepSequencer: {
    category: "clock",
    description: "Eight-step trigger sequencer. Advance it with Clock and route stepped control values anywhere.",
    notes: ["trigger input", "reset input", "stepped modulation"],
  },
  // stepGrid registers its own catalog entry from public/modules/stepGrid/
  // step-grid-register.js -- see node-graph-chromeless-module-registry.js.
  chordPad: {
    category: "musical",
    description: "Pick a diatonic chord with seven pads (Key + Major/Minor). Scale is a 12-bit pitch-class mask for Pitch Quantizer; Root is 0.1V/Oct; Gate follows Level. Optional Select CV chooses the pad.",
    label: "Chord Pad",
    notes: ["chord", "diatonic", "scale mask", "root", "pitch quantizer", "pads"],
  },
  chordSequencer: {
    category: "musical",
    description: "Clocked chord progressions → Scale mask + Root (0.1V/Oct). Extra progressions, Key transpose, Forward/Reverse/Ping-Pong, Step CV.",
    label: "Chord Sequencer",
    notes: ["chord progression", "scale mask", "root", "ping-pong", "key"],
  },
  lutCell: {
    category: "digital",
    description: "An FPGA logic slice, modeled directly: a 4-input lookup table (A/B/C/D) feeding a clocked D flip-flop. Truth Table is a 16-bit digital signal -- bit i is the cell's output for input combination i. Out is the combinational result, Q is the registered result that only updates on a Clock rising edge. Unwired Clock and A free-run at 220 Hz so a bare cell demonstrates itself immediately -- wire either one for real to take over.",
    label: "LUT Cell",
    notes: ["FPGA logic slice", "lookup table", "flip-flop", "digital signal"],
  },
  metallicRatio: {
    category: "modulator",
    description: "A tribute to Robin Schmidt's RS-MET library: RAPT::rsRatioGenerator::metallic() ported directly. Ratio = (Index + sqrt(Index^2 + 4)) / 2 -- the metallic mean family. Index 0 = unity, 1 = the golden ratio, 2 = silver, 3 = bronze. Useful as an oscillator frequency ratio or a feedback-delay length, per the original library's own doc comment.",
    label: "Metallic Ratio",
    notes: ["RS-MET tribute", "metallic mean", "golden ratio", "Robin Schmidt"],
  },
  chordMemory: {
    category: "musical",
    description: "Latches up to 4 notes from a mono Pitch input (Latch), Clear wipes, Advance walks active slots. Walk modes: Order, Shuffle Bag (no-repeat), Mutate — plus Leap / Leap Octaves. Trigger pulses on each Advance step; Note 1–4 still hold the stack.",
    label: "Chord Memory",
    notes: ["latch", "mono to chord", "shuffle bag", "mutate walk", "trigger"],
  },
  turingMachine: {
    category: "digital",
    description: "Mutating shift-register. CV/Scale/Gate as before; patch Scale+Root to get melodic Pitch (degree in scale). Trigger on each clock step.",
    label: "Turing Machine",
    notes: ["generative", "shift register", "scale mask", "pitch from scale"],
  },
  pitchQuantizer: {
    category: "musical",
    description: "Snaps a 0.1V/Oct pitch signal to the nearest note in a scale. Toggle pitch classes on the one-octave keyboard (applies across every octave), pick a preset, or feed a 12-bit pitch-class mask into the Scale input.",
    label: "Pitch Quantizer",
    notes: ["quantizer", "scale keyboard", "0.1v/oct", "pitch class mask", "melody from chaos"],
  },
  degreeTuring: {
    category: "musical",
    description: "Turing-style mutating register that picks scale degrees (not up/down arp). Wire Scale+Root from Chord Pad/Seq, Clock it, take 0.1V/Oct. Probability corrodes the loop; Length sets period.",
    label: "Degree Turing",
    notes: ["generative melody", "scale degrees", "mutating loop", "mono"],
  },
  gravityWalker: {
    category: "musical",
    description: "Mono degree walker with inertia (Gravity) and Leap chance/CV. Prefers stepwise motion in Scale+Root; leaps keep it from looping a tiny stair forever.",
    label: "Gravity Walker",
    notes: ["melodic walker", "gravity", "leap", "mono", "scale"],
  },
  degreePhrase: {
    category: "musical",
    description: "Eight degree knobs + rest toggles as a phrase in Scale+Root. Mutate slowly corrodes steps. Not a classic arp — a looping phrase that ages.",
    label: "Degree Phrase",
    notes: ["phrase", "degrees", "rests", "mutate", "mono"],
  },
  noteGlide: {
    category: "musical",
    description: "Portamento / slew on 0.1V/Oct. Put after quantizers, walkers, or phrase engines.",
    label: "Note Glide",
    notes: ["portamento", "slew", "0.1v/oct"],
  },
  noteTranspose: {
    category: "musical",
    description: "Offset 0.1V/Oct by semitones and octaves.",
    label: "Note Transpose",
    notes: ["transpose", "octave", "semitone"],
  },
  surgeOscillator: {
    category: "oscillator",
    description: "Anti-aliased Saw/Square/Tri/Sine oscillator with hard sync: a rising zero-crossing on the Sync input forces the phase back near 0, sub-sample-interpolated and PolyBLEP-corrected so the sync reset doesn't alias like a naive hard sync would. Native C++/WASM.",
    label: "Surge Oscillator",
    notes: ["oscillator", "hard sync", "polyblep", "anti-aliasing", "native"],
  },
  softwaveOsc: {
    category: "oscillator",
    description: "Softwave Oscillator — soft-shaped multi-wave voice (tanh / morph) ported from soemdsp DistortionOscillator. Waves: analog saw/square, perfect saw, tri, bow tri, soft bow tri, Walter wave, parabol sine. Morph drives softness; not a distortion FX module.",
    label: "Softwave Oscillator",
    notes: ["softwave", "tube", "tanh", "morph", "analog waves", "walter"],
  },
  curveOsc: {
    category: "oscillator",
    description:
      "Novel parametric math curves drawn in 2D (Lissajous, rose, hypotrochoid, butterfly, superformula, harmonograph, cubic). Phase walks the path → point (X,Y). Project collapses that point to mono Out (Y, X, Radius, Angle, or Dot along Dot Angle). X/Y outs keep the full plane for 2D scopes while Out is the 1D audio/mod signal.",
    label: "Curve Oscillator",
    notes: ["2d to 1d", "project", "lissajous", "rose", "butterfly", "superformula", "parametric", "xy"],
  },
  snowflake: {
    category: "oscillator",
    description:
      "RS-MET-style fractal pattern synthesis: L-system rewrite (Koch, snowflake, Sierpinski, dragon, Gosper, tree) + turtle graphics polyline, walked at Frequency into stereo X/Y. Native C++/WASM (JS fallback). Iterations deepen self-similarity; Angle is the turtle turn; Direction (−1…1) morphs path walk with a basic trisaw (reverse / bidirectional / forward). Scale with Amplitude.",
    label: "Snowflake",
    notes: ["L-system", "turtle", "Koch", "fractal pattern synthesis", "RS-MET", "X/Y", "native", "wasm"],
  },
  dsfOscillator: {
    category: "oscillator",
    description: "The DSF starter kit: Sine, a bandlimited Saw built from pureSawEng (Walter H. Hackett, Extended DSF Oscillators.cxx), a PWM Square derived from two phase-offset Saws, Trimorph (a second leaky integration on the Square), and SquSaw (a Saw crossfaded with a fixed 50%-duty square, landing on a saw-to-triangle-like character). Alias-free by construction: the maximum harmonic count is always Nyquist/frequency. CV jacks: 0.1V/Oct (pitch), Phase (adds to Phase knob), Amplitude (scales Amplitude knob). Native C++/WASM.",
    label: "DSF Oscillator",
    notes: ["oscillator", "dsf", "discrete summation formula", "anti-aliasing", "0.1V/Oct", "phase CV", "amplitude CV", "native"],
  },
  robinSupersaw: {
    category: "oscillator",
    description: "A proof-of-concept supersaw built on Robin Schmidt's pitch dithering technique (RobinSchmidt/RS-MET, rsPitchDitherOsc) -- see this repo's README for the full explanation. Instead of correcting or avoiding the aliasing edge, each voice dithers its own cycle length between 3 neighboring integer sample-counts so every individual cycle rendered is exactly periodic (alias-free), trading aliasing for a small amount of pitch-jitter noise. Stacks up to 9 independently-dithered, detuned voices (Detune spreads them symmetrically in cents around a centered anchor voice) and sums them into a classic wall-of-saws supersaw. Native C++/WASM.",
    label: "RobinSupersaw",
    notes: ["oscillator", "supersaw", "pitch dithering", "anti-aliasing", "native"],
  },
  hypersaw: {
    category: "oscillator",
    description: "A proof-of-concept port of soundemote's own HypersawUnit/HypersawMaster (see docs/reference/Hypersaw.hpp) -- a bank of up to 32 bandlimited (PolyBLEP) sawtooths spread across the phase cycle. Each voice's phase is dispersed three ways: Spread (scales the voice's fixed even position i/N across the cycle), Random (a fixed per-voice random offset), and Drift (a slow, continuously wandering per-voice offset). Center voices sum to both channels; the rest alternate Left/Right. The display burns one vertical phosphor line per voice at its current phase position (0..1 across the width). Native C++/WASM.",
    label: "Hypersaw",
    notes: ["oscillator", "supersaw", "polyblep", "anti-aliasing", "native", "phosphor display"],
  },
  spiral: {
    category: "jerobeam",
    description: "Jerobeam spiral engine. Emits X/Y/Z motion-signal for alien curves and audiovisual flight paths. Native C++/WASM.",
    label: "Jerobeam Spiral",
    notes: ["attractor motion", "rotation", "density and morph controls", "native"],
  },
  fractalSpiral: {
    category: "jerobeam",
    description: "Self-affine Weierstrass-style fractal spiral: N rotating copies of itself, each spun faster and scaled down, summed into one curve with a real, tunable Hausdorff dimension. Native C++/WASM.",
    label: "Fractal Spiral",
    notes: ["fractal", "self-similar", "logarithmic spiral", "Weierstrass function", "native"],
  },
  logSpiral: {
    category: "jerobeam",
    description: "Pure logarithmic (equiangular) spiral: the one curve that looks identical after any rotation+rescaling. Sweeps a constant per-turn growth ratio, no fractal texture layer. Native C++/WASM.",
    label: "Logarithmic Spiral",
    notes: ["logarithmic spiral", "equiangular spiral", "self-similar", "native"],
  },
  blubb: {
    category: "jerobeam",
    description: "Placeholder for the Jerobeam Blubb motion engine.",
    label: "Jerobeam Blubb",
    notes: ["placeholder", "jerobeam"],
  },
  boing: {
    category: "jerobeam",
    description: "Placeholder for the Jerobeam Boing motion engine.",
    label: "Jerobeam Boing",
    notes: ["placeholder", "jerobeam"],
  },
  keplerBouwkamp: {
    category: "jerobeam",
    description: "Jerobeam Kepler-Bouwkamp engine. Nested polygon spiral emitting X/Y motion signal.",
    label: "Jerobeam Kepler-Bouwkamp",
    notes: ["nested polygons", "spiral", "jerobeam"],
  },
  mushroom: {
    category: "jerobeam",
    description: "Placeholder for the Jerobeam Mushroom motion engine.",
    label: "Jerobeam Mushroom",
    notes: ["placeholder", "jerobeam"],
  },
  nyquistShannon: {
    category: "jerobeam",
    description: "Placeholder for the Jerobeam Nyquist-Shannon motion engine.",
    label: "Jerobeam NyquistShannon",
    notes: ["placeholder", "jerobeam"],
  },
  radar: {
    category: "jerobeam",
    description: "Placeholder for the Jerobeam Radar motion engine.",
    label: "Jerobeam Radar",
    notes: ["placeholder", "jerobeam"],
  },
  torus: {
    category: "jerobeam",
    description: "Placeholder for the Jerobeam Torus motion engine.",
    label: "Jerobeam Torus",
    notes: ["placeholder", "jerobeam"],
  },
  wirdoSpiral: {
    category: "jerobeam",
    description: "Placeholder for the Jerobeam WirdoSpiral motion engine.",
    label: "Jerobeam WirdoSpiral",
    notes: ["placeholder", "jerobeam"],
  },
  lorenzAttractor: {
    category: "chaos",
    description: "Classic butterfly attractor motion for turbulent curls and folding trajectories. Native C++/WASM.",
    label: "Lorenz Attractor",
    notes: ["butterfly attractor", "3D chaos", "X/Y/Z motion", "native"],
  },
  logisticMap: {
    category: "chaos",
    description: "Simplest possible chaotic system: x = R * x * (1 - x), repeated at a clocked Rate. Sweep R from steady to periodic to fully chaotic.",
    label: "Logistic Map",
    notes: ["chaos", "bifurcation", "one parameter chaos", "discrete map"],
  },
  henonMap: {
    category: "chaos",
    description: "Discrete 2D chaotic map: (x, y) = (1 - a*x^2 + y, b*x), stepped at a clocked Rate. More angular/digital-feeling than the continuous attractors.",
    label: "Henon Map",
    notes: ["chaos", "discrete map", "2D attractor"],
  },
  // rayBouncer: chromeless catalog (public/modules/rayBouncer/*-register.js).
  chuaAttractor: {
    category: "chaos",
    description: "Chua's Circuit double-scroll attractor: a classic chaotic circuit with a different lobe/scroll character than Lorenz.",
    label: "Chua Attractor",
    notes: ["double scroll", "circuit chaos", "3D attractor"],
  },
  noiseGenerator: {
    category: "noise",
    description: "Stereo noise: Uniform (with continuous Uniform→Gaussian shape), Gaussian, Brown, Pink, Crackle. Independent L/R seeds. Native C++/WASM.",
    notes: ["stereo output", "uniform to gaussian", "seed control", "native"],
  },
  randomWalk: {
    category: "modulator",
    description: "Flexible soemdsp-style random walk with white, filtered, random-step, and fixed-step motion modes. Native C++/WASM.",
    notes: ["bounded walk", "jitter curve", "one-pole smoothing", "native"],
  },
  fractalBrownianNoise: {
    category: "noise",
    description: "Three-axis layered fBm motion source with octave, persistence, scale, and seed controls for rough organic drift.",
    notes: ["out x/y/z", "seeded value noise", "slow terrain motion"],
  },
  piSpigotNoise: {
    category: "noise",
    description: "Stereo noise source built from real digits of pi (fetched once, embedded), read via an irrational playback-rate drift so a tiny buffer never sounds like a hard loop. Independent seed per channel, White/Pink/Brown/Blue/Violet color, and a 4-stage one-pole Gaussian-smoothing cascade. Native C++/WASM.",
    label: "Pi Spigot Noise",
    notes: ["real pi digits", "stereo independent seeds", "noise color", "gaussian smoothing", "native"],
  },
  codeblock: {
    category: "digital",
    description: "Patch-local JavaScript signal processor with editable input and output ports.",
    notes: ["dynamic ports", "JavaScript body", "local patch code"],
  },
  customDisplay: {
    category: "oscilloscope",
    description: "Patch-local JavaScript display surface. Define inputs and draw custom visuals inside the module face.",
    notes: ["custom draw", "JavaScript display", "visual sink"],
  },
  graph2: {
    category: "controller",
    description: "Point-to-point graph: each control point’s outgoing segment has a shape (linear / rational / exponential / log / hold) and contour. Input, LFO, or Phasor-driven readout with range mapping.",
    label: "Smooth Graph",
    notes: ["per-point shape", "contour", "Input · LFO · Phasor", "rate without jumps in Phasor"],
  },
  graphCopy: {
    category: "controller",
    description: "Point-to-point graph with optional step grid (Steps 0 = free X / no quantize). Global Shape + Curve Offset; per-node curve. Input, LFO, or Phasor timing.",
    label: "Step Graph",
    notes: ["step grid (0 = free)", "global shape", "per-node curve", "Input · LFO · Phasor"],
  },
  gain: {
    category: "dynamics",
    description:
      "Scale then offset: out = in × Amplitude + Offset. Replaces the old Gain Bias module (same math). Mono sums into L/R before scale.",
    label: "Gain",
    notes: ["multiplication", "offset", "scale and shift", "utility", "gain bias", "level control"],
  },
  // Retired shop entry — type still loads as alias of gain.
  gainBias: {
    category: "dynamics",
    description: "Retired: use Gain (now has Offset). Load alias only.",
    hidden: true,
    label: "Gain Bias",
    notes: ["legacy", "hidden"],
  },
  mix: {
    category: "dynamics",
    description:
      "4-channel utility mixer with per-channel volume and bias, plus 3 bleed sends into output 1. Clean signal routing for multi-voice patches.",
    label: "Mix",
    notes: ["mixer", "bias", "bleed", "4-channel", "utility"],
  },
  // Legacy id for Mix.
  gainBiasMix: {
    category: "dynamics",
    description: "Retired name: use Mix. Load alias only.",
    hidden: true,
    label: "Mix",
    notes: ["legacy", "hidden"],
  },
  bias: {
    category: "dynamics",
    description: "Offsets a signal away from center. Useful for steering modulation and shifting control lanes.",
    notes: ["addition", "offset", "control lane shift"],
  },
  softClipper: {
    category: "dynamics",
    description: "Native soft clipper with center bias and clipping width controls.",
    label: "Soft Clipper",
    notes: ["soft clipping", "tanh", "dynamics"],
  },
  airClipper: {
    category: "dynamics",
    description:
      "Airwindows Density3: density soft-saturation / anti-density, optional highpass, output and dry/wet. MIT (airwindows).",
    label: "AirClipper",
    notes: ["airwindows", "Density3", "density", "soft clip", "highpass", "dynamics"],
  },
  rotate3dTo2d: {
    category: "dynamics",
    description: "Rotates an X/Y/Z signal point in 3D and projects the result back to X/Y.",
    label: "Rotation 3D to 2D",
    notes: ["3D rotation", "2D projection", "signal transform"],
  },
  vectorscopeTransform: {
    category: "dynamics",
    description:
      "Goniometer / vectorscope rotation: rotate stereo L/R by 45° so mono is vertical and anti-phase is horizontal. Wire outs into any X/Y scope.",
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
    description: "Stereo audio sink. Route Left and Right signals here to hear the patch.",
    label: "Output",
    notes: ["audio sink", "left right inputs", "render target"],
  },
  audioInput: {
    category: "portal",
    description: "Stereo audio source. Emits Left and Right signals from the live microphone/audio input device.",
    label: "Input",
    notes: ["audio source", "left right outputs", "live input"],
  },
  knob: {
    category: "plugin",
    description:
      "Knob — module-first control. Face is control + display of live Bias (In + offset). Single Bias outlet. No body param row / param-out twin.",
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
    category: "plugin",
    description:
      "Slider — module-first control. Face is control + display of live Bias (In + value). Single Bias outlet. No body param row / param-out twin.",
    label: "Slider",
    notes: ["plugin", "fader", "slider", "bias", "display", "control"],
  },
  toggleButton: {
    category: "plugin",
    description:
      "Toggle — press to latch Out to 1, press again for 0. Simple on/off control for patches.",
    label: "Toggle",
    notes: ["plugin", "toggle", "latch", "button", "switch"],
  },
  momentaryButton: {
    category: "plugin",
    description:
      "Momentary — mouse/touch down = Out 1, up = 0. Gate-style button for patches.",
    label: "Momentary",
    notes: ["plugin", "momentary", "gate", "button"],
  },
  pluginInput: {
    category: "plugin",
    description:
      "Plugin Audio Input — stereo audio in (Left/Right/Out), clear patch front-end boundary.",
    label: "Plugin Input",
    notes: ["plugin", "audio input", "stereo"],
  },
  pluginOutput: {
    category: "plugin",
    description:
      "Plugin Audio Output — stereo audio out (Mono/Left/Right). Clear patch end-point alongside classic Output.",
    label: "Plugin Output",
    notes: ["plugin", "audio output", "stereo"],
  },
  pluginMidiIn: {
    category: "plugin",
    description:
      "Plugin MIDI In — keyboard/MIDI as Gate, MIDI note, velocity, and 0.1V/Oct.",
    label: "Plugin MIDI In",
    notes: ["plugin", "midi input", "note", "gate"],
  },
  pluginMidiOut: {
    category: "plugin",
    description:
      "Plugin MIDI Out — MIDI number / gate in; normalized + full-value outs for monitoring.",
    label: "Plugin MIDI Out",
    notes: ["plugin", "midi output"],
  },
  midiOut: {
    category: "controller",
    description: "Manual MIDI-number source. Outputs the selected note as a normalized 0..1 signal and as the full 0..127 value.",
    notes: ["midi number", "normalized output", "full value output"],
  },
  midiNotePitch: {
    category: "controller",
    description: "MIDI note converter. Applies octave and pitch offsets, then emits normalized pitch, full MIDI pitch, and frequency in Hz.",
    notes: ["midi note input", "frequency output", "pitch conversion"],
  },
  buttonEvents: {
    category: "gametrigger",
    description: "External page button event source. Emits short pulses for explicit click, hover, down, up, enter, and leave events sent into sandbox.",
    label: "Button Events",
    notes: ["external UI", "button triggers", "music page bridge"],
  },
  wireBreak: {
    category: "gametrigger",
    description: "Universe-physics wire break event source. Emits a one-sample pulse and an animation-length gate when a wire breaks.",
    label: "Wire Break",
    notes: ["game trigger", "wire break", "physics violation"],
  },
  wireConnect: {
    category: "gametrigger",
    description: "Wire connect event source. Emits a one-sample pulse when a new wire connection happens.",
    label: "Wire Connect",
    notes: ["game trigger", "wire connect", "patch editing"],
  },
  wireDisconnect: {
    category: "gametrigger",
    description: "Wire disconnect event source. Emits a one-sample pulse when a normal wire disconnect happens.",
    label: "Wire Disconnect",
    notes: ["game trigger", "wire disconnect", "patch editing"],
  },
  windowReopen: {
    category: "gametrigger",
    description: "Window attention event source. Emits a pulse, animation gate, and glow-shaped sine when an already-open window is requested again.",
    label: "Window Reopen",
    notes: ["game trigger", "window attention", "green glow"],
  },
  shootingStarTail: {
    category: "gametrigger",
    description: "Placeholder trigger for a shooting star tail event.",
    label: "Shooting Star Tail",
    notes: ["placeholder", "game trigger", "shooting star"],
  },
  shootingStarExplosion: {
    category: "gametrigger",
    description: "Website shooting-star collision event source. Emits a one-sample pulse when a star hits the sandbox frame, scaled 0 to 1 by the incoming star's random speed mapped between Low Range and High Range.",
    label: "Shooting Star Explosion",
    notes: ["game trigger", "shooting star", "website bridge", "power scaled pulse", "low/high range"],
  },
  nextPatch: {
    category: "gametrigger",
    description: "Patch command receiver. A trigger edge loads the next saved patch through the main UI patch explorer path.",
    label: "Next Patch",
    notes: ["patch navigation", "trigger input", "music player"],
  },
  previousPatch: {
    category: "gametrigger",
    description: "Patch command receiver. A trigger edge loads the previous saved patch through the main UI patch explorer path.",
    label: "Previous Patch",
    notes: ["patch navigation", "trigger input", "music player"],
  },
  keyboardController: {
    category: "controller",
    description: "Mouse-playable keyboard source. Emits sustained gate, one-sample gate, key index, quantized key, MIDI pitch, normalized double, phase increment, frequency, numeric pitch, and X/Y gesture values.",
    label: "MIDI Keyboard",
    notes: ["keyboard input", "midi pitch", "gesture signals"],
  },
  macroControls: {
    category: "controller",
    description: "Eight macro knobs as the module display. Emits M1–M8 as live 0..1 control signals (optional M* In / Reset).",
    label: "Macro Controls",
    notes: ["macro row", "manual control", "eight outputs", "knob", "slider", "macro", "pot", "display"],
  },
  pitchModWheel: {
    category: "controller",
    description: "Reads the separate pitch and mod wheel controls beside the keyboard. Pitch emits -1..1, while mod emits 0..1.",
    label: "Pitch / Mod Wheel",
    notes: ["pitch wheel", "mod wheel", "performance control"],
  },
  samplePlayer: {
    category: "sample",
    description: "Patch-local one-shot sample playback. Trigger starts from Start and plays to End with simple click ramps.",
    label: "Sample Player",
    notes: ["sample playback", "one shot", "audio source"],
  },
  audioPlayer: {
    category: "sample",
    description: "Patch-local music file player with stereo outputs and a phasor-driven scrub input for sample-accurate playback head control.",
    label: "Music Player",
    notes: ["music playback", "scrubbable", "phasor", "audio source"],
  },
  phosphillator: {
    category: "oscillator",
    description: "Draw a shape freehand with the mouse (smoothed live with a Papoulis lowpass) and it becomes a closed-loop X/Y drawing you can play back.",
    label: "Phosphillator",
    notes: ["freehand draw", "phosphor", "xy oscillator", "papoulis smoothing"],
  },
  sampleLooper: {
    category: "sample",
    description: "Patch-local gated sample loop playback with loop bounds, pitch control, and seam crossfade.",
    label: "Sample Looper",
    notes: ["sample playback", "loop", "audio source"],
  },
  // --- Scientific Filter: textbook / predictable spectral tools ---
  passiveFilter: {
    category: "scientificFilter",
    description:
      "Cheap 1-pole (~6 dB/oct) LP / HP / BP for gentle taming. HP Low Cut knocks rumble without a brick-wall. Not a tilt (see Tilt Filter) and not a steep EQ (see EQ Filter).",
    label: "Passive Filter",
    notes: ["lowpass", "highpass", "bandpass", "1-pole", "6 dB/oct", "tame", "rumble", "scientific"],
  },
  tiltFilter: {
    category: "scientificFilter",
    description:
      "First-order spectral tilt around a pivot. +Amount brightens (cut lows / boost highs); −Amount darkens. Gentle balance — not a hard HP. Formulas after Robin Schmidt (RS-MET) shelf BLT.",
    label: "Tilt Filter",
    notes: ["tilt", "shelf", "tone balance", "first order", "Robin Schmidt", "RS-MET", "scientific"],
  },
  eqFilter: {
    category: "scientificFilter",
    description:
      "Zero-latency ZDF state-variable EQ: LP, HP, BP, notch, allpass, peak, low/high shelf. Direct from Robin Schmidt's rsStateVariableFilter (RS-MET). Prefer this for single-band EQ; Multi Stage Filter cascades RBJ biquads for steeper slopes.",
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
    description: "3rd-order Papoulis (Optimum-L) lowpass: monotonic, ripple-free passband like Butterworth but with a faster roll-off for the same order.",
    label: "Papoulis Filter",
    notes: ["lowpass", "optimum-l", "legendre", "monotonic", "3-pole", "scientific"],
  },
  cookbookFilter: {
    category: "scientificFilter",
    description:
      "RBJ cookbook biquad cascade (LP/HP/BP/shelf/peak/…) with up to 5 stages for steeper slopes. For a single best-behaved EQ band prefer EQ Filter (Robin Schmidt ZDF SVF).",
    label: "Multi Stage Filter",
    notes: ["mode selection", "biquad stages", "curve display", "RBJ", "cascade", "scientific"],
  },
  activeFilter: {
    category: "scientificFilter",
    description:
      "Scientific multipole (RS-MET ladder core): LP/HP/BP slopes, Hz cutoff, Feedback Circuit (Off / Res / Clip / both), Gain Comp on/off. Digital-perfect multipole with optional drive — not a full analog ladder model.",
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
    description:
      "Lab-style RS-MET ladder surface: Flat / LP / HP / BP plus Stages 1–4. Same multipole family as Active Filter; Mode×Stages instead of named slopes. Prefer Active Filter for the defacto path.",
    label: "Ladder Filter",
    notes: ["lab", "stages", "flat", "multipole", "scientific", "RS-MET"],
  },
  butterworth: {
    category: "scientificFilter",
    description:
      "Butterworth multipole — maximally flat passband. Accuracy: high (classic section-Q SOS + RBJ). Issue only when matching a specific lab/MATLAB prototype bit-for-bit. Best use: transparent LP/HP/BP/BR, teaching slopes, general clean filtering. Not a speaker crossover product (use dedicated Crossover modules when those land).",
    label: "Butterworth Filter",
    notes: ["butterworth", "multipole", "flat passband", "scientific", "high accuracy", "classical", "approximated digital SOS"],
  },
  linkwitzRiley: {
    category: "scientificFilter",
    description:
      "Linkwitz-Riley multipole (cascaded Butterworth halves). Accuracy: good for single-filter LR character. Accuracy issue: pairing this module’s LP with another HP by hand is NOT a guaranteed flat-sum crossover — phase/order must match; use a dedicated Crossover module for that job. Best use: LR-shaped single path, soft steepness.",
    label: "Linkwitz-Riley Filter",
    notes: ["linkwitz-riley", "crossover character", "butterworth cascade", "scientific", "not a multi-band crossover product"],
  },
  bessel: {
    category: "scientificFilter",
    description:
      "Bessel (Thomson) multipole — flat group-delay character, gentler roll-off. Accuracy: musical/table Qs (not full analog Bessel redesign). Issue only for matching published Bessel transfer functions or delay specs. Best use: soft filtering with less ring / time-smear.",
    label: "Bessel Filter",
    notes: ["bessel", "thomson", "group delay", "musical accuracy", "approximated", "classical"],
  },
  chebyshev: {
    category: "scientificFilter",
    description:
      "Chebyshev-style multipole — steeper wall via Q lift + Ripple (dB). Accuracy: approximated (not exact equiripple poles). Issue when you need guaranteed passband ripple bounds or a scientific Cheby-I match. Best use: musical steeper LP/HP with a bit more edge than Butterworth.",
    label: "Chebyshev Filter",
    notes: ["chebyshev", "approximated", "equiripple-style", "steep", "musical", "classical"],
  },
  elliptic: {
    category: "scientificFilter",
    description:
      "Elliptic-named multipole — sharp SOS approx (elevated Q). Accuracy: low vs true Cauer (no Jacobi zeros). Issue whenever “true elliptic / stopband zeros” matter. Best use: aggressive multipole tone only; not for lab elliptic or anti-alias claims. Full elliptic would need PrototypeDesigner-class poles/zeros later.",
    label: "Elliptic Filter",
    notes: ["elliptic", "cauer", "approximated", "sharp", "not true zeros", "classical", "RS-MET later"],
  },
  bandpass: {
    category: "scientificFilter",
    description:
      "True resonant 2-pole bandpass (EQ ZDF SVF Bandpass Peak, Robin Schmidt). Accuracy: high for constant-peak BP. Best use: pitched resonance, formant-ish peaks, Softpop’s filter core. 0.1V/Oct + f for center.",
    label: "Bandpass Filter",
    notes: ["bandpass", "resonant", "2-pole", "SVF", "ZDF", "scientific", "Robin Schmidt", "RS-MET", "0.1V"],
  },
  allpass: {
    category: "scientificFilter",
    description:
      "True 2-pole allpass (EQ ZDF SVF Allpass, Robin Schmidt). Flat magnitude, frequency-dependent phase. Accuracy: high (same SVF core as EQ). Best use: phase correction, phaser building blocks, delay-ish phase lag without EQ. Not a time delay line (use Sample Delay / delay FX for echo).",
    label: "Allpass Filter",
    notes: ["allpass", "phase", "SVF", "ZDF", "scientific", "Robin Schmidt", "RS-MET", "not a delay line"],
  },
  crossover2: {
    category: "scientificFilter",
    description:
      "Stereo Linkwitz-Riley 2-way crossover (RS-MET-style successive LR splits + branch compensation allpass). Mono+L/R in; per-band L/R outs only (no mono out). Sum of bands is approximately flat/allpass of the input when slopes match. Best for multiband processing where recombination matters.",
    label: "2-Crossover",
    notes: ["crossover", "linkwitz-riley", "2-way", "stereo", "scientific", "RS-MET"],
  },
  crossover3: {
    category: "scientificFilter",
    description:
      "Stereo Linkwitz-Riley 3-way crossover (RS-MET-style successive LR splits + branch compensation allpass). Mono+L/R in; per-band L/R outs only (no mono out). Sum of bands is approximately flat/allpass of the input when slopes match. Best for multiband processing where recombination matters.",
    label: "3-Crossover",
    notes: ["crossover", "linkwitz-riley", "3-way", "stereo", "scientific", "RS-MET"],
  },
  crossover4: {
    category: "scientificFilter",
    description:
      "Stereo Linkwitz-Riley 4-way crossover (RS-MET-style successive LR splits + branch compensation allpass). Mono+L/R in; per-band L/R outs only (no mono out). Sum of bands is approximately flat/allpass of the input when slopes match. Best for multiband processing where recombination matters.",
    label: "4-Crossover",
    notes: ["crossover", "linkwitz-riley", "4-way", "stereo", "scientific", "RS-MET"],
  },
  crossover5: {
    category: "scientificFilter",
    description:
      "Stereo Linkwitz-Riley 5-way crossover (RS-MET-style successive LR splits + branch compensation allpass). Mono+L/R in; per-band L/R outs only (no mono out). Sum of bands is approximately flat/allpass of the input when slopes match. Best for multiband processing where recombination matters.",
    label: "5-Crossover",
    notes: ["crossover", "linkwitz-riley", "5-way", "stereo", "scientific", "RS-MET"],
  },
  crossover6: {
    category: "scientificFilter",
    description:
      "Stereo Linkwitz-Riley 6-way crossover (RS-MET-style successive LR splits + branch compensation allpass). Mono+L/R in; per-band L/R outs only (no mono out). Sum of bands is approximately flat/allpass of the input when slopes match. Best for multiband processing where recombination matters.",
    label: "6-Crossover",
    notes: ["crossover", "linkwitz-riley", "6-way", "stereo", "scientific", "RS-MET"],
  },
  softpopOscillator: {
    category: "oscillator",
    description:
      "Softpop: Gaussian white / pink / brown through resonant Peak BP. 0.1V + f pitch, Q, Amplitude, Seed + Reset, Stereo|Mono width.",
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
  sinepulse: {
    category: "drum",
    description:
      "Sine chirp / zap drum voice. Rate = sweep rate. LowFreq/HighFreq = pitch endpoints (capped by project Speed Limit). Shift collapses LowFreq toward HighFreq. Sweep = fill. FreqCurve/AmpCurve bipolar (−1…+1). Antialias lo→hi: Off, Soft Edge, Adaptive, Shaped, Noise, Fine (default). CV: f, Amp, Freq. Up/Down. 0.1V/Oct + f + Reset + Increment.",
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
    description:
      "Under construction. Electro kick — classic electronic kick voice (placeholder until the synthesis design lands).",
    label: "ElectroKick",
    notes: ["under construction", "drum", "kick", "electro", "percussion", "bass drum"],
  },
  electroSnare: {
    category: "drum",
    description:
      "Under construction. Electro snare — classic electronic snare voice (placeholder until the synthesis design lands).",
    label: "ElectroSnare",
    notes: ["under construction", "drum", "snare", "electro", "percussion"],
  },
  electroHat: {
    category: "drum",
    description:
      "Under construction. Electro hat — classic electronic hi-hat voice (placeholder until the synthesis design lands).",
    label: "ElectroHat",
    notes: ["under construction", "drum", "hi-hat", "hat", "electro", "percussion", "cymbal"],
  },
  formantFilter: {
    category: "scientificFilter",
    description: "Under construction. Formant / vocal-tract style filter bank (placeholder).",
    label: "Formant Filter",
    notes: ["under construction", "formant", "vowel", "scientific"],
  },
  binaryClock: {
    category: "clock",
    description: "Under construction. Binary counter clock with bit outputs and gate (placeholder).",
    label: "Binary Clock",
    notes: ["under construction", "binary", "counter", "clock", "bits"],
  },
  theremin: {
    category: "controller",
    description:
      "Under construction. Theremin — space-controlled pitch/volume controller (hand / proximity CV planned). Placeholder until the interaction and voice design land.",
    label: "Theremin",
    notes: ["under construction", "theremin", "controller", "proximity", "pitch", "performance"],
  },
  osc: {
    category: "controller",
    description:
      "Under construction. OSC — Open Sound Control send/receive bridge (network ports, address paths, float/int/blob CV planned). Placeholder until the protocol and routing UI land.",
    label: "OSC",
    notes: ["under construction", "osc", "open sound control", "controller", "network", "midi-alternative", "cv"],
  },
  // --- Analog Filter: character / named circuits ---
  yellowjacketFilter: {
    category: "analogFilter",
    description: "A feedback-modulated ellipse-oscillator filter through a one-pole stage, with a resonance-vs-frequency curve shaping both the oscillator waveshape and feedback gain. Grindy, easily produces square-wave-like output.",
    label: "Yellowjacket Filter",
    notes: ["ellipse oscillator", "feedback FM", "grindy", "analog"],
  },
  superloveFilter: {
    category: "analogFilter",
    description: "A trisaw-oscillator feedback resonator through a multi-pole ladder tap. 4 modes: LP18, LP24, HP6, BP6. Warm, bass-heavy, stably self-oscillating.",
    label: "SuperLove Filter",
    notes: ["trisaw oscillator", "4 modes", "stable self-oscillation", "analog"],
  },
  chaoticPhaseLockingFilter: {
    category: "analogFilter",
    description: "A feedback ellipse-waveshaper resonator (no oscillator phasor) through a 12dB lowpass and a DC-blocking highpass. The chaos control drives the ellipse waveshape directly, producing phase-locked chaotic textures.",
    label: "Chaotic Phase Locking Filter",
    notes: ["ellipse waveshaper", "direct feedback", "phase locking", "analog"],
  },
  modeResonator: {
    category: "scientificFilter",
    description:
      "Complex 2-pole mode for predictable ping resonance: rings at Frequency, Decay in seconds (to 1/e), Hold = forever. Impulse-normalized gain. Digital accuracy / stability — not analog howl. Feed impulses or Trigger for metallic ring. Resonator Filter remains the character/chaos engine.",
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
    description:
      "Delay+feedback (or feedforward) comb: Frequency sets fractional delay D=fs/f (integer ring + Thiran allpass) so Feedback+ peaks at k·f. Decay in seconds, Hold, loop Damping (KS-style), Polarity +/−, Feedforward Depth. Trigger or audio in. Scientific pitch comb — not a waveguide network, not Delay FX.",
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
    description:
      "Under construction. Planned digital waveguide (physical delay-loop model): Frequency + Decay, loop Loss, Dispersion — beyond Comb Resonator (termination filters, stiffness, later dual-rail). Currently mono dry passthrough so patches stay safe. Use Comb Resonator / Mode Resonator for working resonance now.",
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
    description:
      "Cascaded 2nd-order allpass group-delay (Disperser class). Frequency = APF corner, Filters = cascade depth (1…64, CPU), Pinch = Q (concentrates delay). Flat magnitude — smears when frequencies arrive. Sibling of Allpass; not Bode, not STFT Blur.",
    label: "Phase Disperse",
    notes: ["allpass", "group delay", "disperser", "scientific", "phase", "cpu"],
  },
  phaser: {
    category: "analogFilter",
    description:
      "Under construction. Classic phaser: modulated all-pass stages + feedback + mix. Character modulation FX (not the scientific single Allpass or Phase Disperse stack).",
    label: "Phaser",
    notes: ["under construction", "phaser", "allpass", "modulation", "analog"],
  },
  flanger: {
    category: "space",
    description:
      "Under construction. Classic flanger: short modulated delay + feedback + mix (comb-in-time). Lives with Delay / Space FX.",
    label: "Flanger",
    notes: ["under construction", "flanger", "delay", "modulation", "space"],
  },
  chorus: {
    category: "space",
    description:
      "Under construction. Classic chorus: multi-voice modulated delays + mix. Lives with Delay / Space FX.",
    label: "Chorus",
    notes: ["under construction", "chorus", "delay", "modulation", "space"],
  },
  bode: {
    category: "space",
    description:
      "Bode frequency shifter (SSB via Hilbert FIR): shift spectrum by Δ Hz (through-zero), Fine, Feedback, Mix. Breaks harmonic ratios for metallic/bubbly spectra. Not pitch shift, not Phase Disperse.",
    label: "Bode Shifter",
    notes: ["bode", "frequency shifter", "SSB", "Hilbert", "space"],
  },
  stftBlur: {
    category: "space",
    description:
      "STFT spectral blur: smear magnitudes across frames (Blur Time) and/or neighboring bins (Blur Freq). Hann overlap-add, FFT Size 256–4096 (power of two). Mix dry/wet. Washes / clouds spectra — not Phase Disperse, not Bode.",
    label: "STFT Blur",
    notes: ["STFT", "spectral", "blur", "FFT", "space"],
  },
  resonatorFilter: {
    category: "analogFilter",
    description: "A dual-phasor FM feedback resonator through a one-pole lowpass and a DC-blocking highpass. 3 modes: Sinusoid, Triangle, Sawtooth -- each a chaotic variation on its namesake waveform.",
    label: "Resonator Filter",
    notes: ["dual-phasor FM", "3 waveform modes", "chaotic", "analog"],
  },
  humanFilter: {
    category: "analogFilter",
    description: "A dual-phasor feedback network shaped by a bell/peak filter in the feedback path, with a DC-blocking highpass on the output. 3 modes: BP6, LP6, LP12, differing only in which oscillator combination reaches the output.",
    label: "Human Filter",
    notes: ["dual-phasor feedback", "bell-shaped feedback path", "3 modes", "analog"],
  },
  flowerChildFilter: {
    category: "analogFilter",
    description: "Resonant self-oscillating filter built from a feedback-modulated phasor through two cascaded one-pole stages. 4 modes: Clean (sine oscillator), Dirty (reshaped oscillator, hotter output), Rev3 (ellipsoid oscillator with richer resonance shaping), Downsampled (Clean's architecture with a sample-and-hold aliasing stage).",
    label: "Flower Child Filter",
    notes: ["self-oscillating", "4 modes", "feedback FM", "analog"],
  },
  pulseExplosion: {
    category: "clock",
    description: "On a rising-edge trigger, schedules a burst of single-sample pulses distributed over Start/Center/End Time, concentrated toward Center by Time Spread (0 = tight, 1 = wide). Each pulse gets its own randomized amplitude between Low and High Amplitude.",
    label: "Pulse Explosion",
    notes: ["trigger burst", "skewed distribution", "randomized amplitude"],
  },
  tb303Filter: {
    category: "analogFilter",
    description:
      "TB-303 style ladder (Robin Schmidt TeeBeeFilter / Open303): feedback highpass, resonance skew, drive, 15 LP/HP/BP taps. Strong character — not a transparent scientific EQ.",
    label: "TB-303 Filter",
    notes: ["feedback highpass", "resonance skewed", "15 modes", "character", "Robin Schmidt", "analog"],
  },
  // Rate limiters live with Dynamics (not spectral filters).
  slewLimiter: {
    category: "dynamics",
    description:
      "Up/Down Slew — hard rate limit. Caps how fast the signal may rise or fall (seconds for full-scale). Linear ramps to steps. Compare with Inertial Filter (exponential approach).",
    label: "Up/Down Slew",
    notes: ["up time", "down time", "asymmetric glide", "rate limit", "slew", "portamento", "dynamics"],
  },
  inertialFilter: {
    category: "dynamics",
    description:
      "Inertial Filter — exponential approach with separate Attack/Release (0…1 mix per sample). Not a hard slew rate. Same family as Speed Color Inertia; put next to Up/Down Slew to hear the difference.",
    label: "Inertial Filter",
    notes: [
      "inertia",
      "attack",
      "release",
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
    description: "SOEMDSP-style modulated fractional delay with feedback, wet/dry mix, and diffuse mode. Native C++/WASM.",
    label: "Delay",
    notes: ["modulated delay", "fractional echo", "diffuse mode", "native"],
  },
  pingPongDelay: {
    category: "space",
    description:
      "Tape-style stereo ping-pong. Tempo base Numer/Denom × Sync; Offset = static R-tap skew (ms); LFO Amp = max L/R drift from independent Parabol/Random Walk/FBM LFOs; passive HPF/LPF + soft clip in feedback. Stereo Trace face shows Mod L/R (delay times, ±1 = full max delay).",
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
    description: "Under construction. Geometric room delay / wall verb from a superellipsoid (Rays × Bounces taps per ear). JS prototype only for now — native engine is a placeholder stub.",
    label: "Wall Delay",
    notes: ["under construction", "wall geometry", "binaural", "wall verb"],
  },
  reverbEffect: {
    category: "space",
    description:
      "Sabrina reverb: serial diffusion, cross-feedback, modulation, recycle, mix. "
      + "Stereo outs Dry L/R then Wet L/R (same scheme as SoEmReverb). Seed randomizes delay pattern.",
    label: "Sabrina Reverb",
    notes: ["Sabrina", "serial diffusion", "cross feedback", "seed", "Dry L", "Dry R", "Wet L", "Wet R"],
  },
  soemReverb: {
    category: "space",
    description: "SoEmReverb: soemdsp::delay::Reverb (ModulatedDelay diffusion + echo modes Post/Pre/Slapback), soft-clip feedback, LPF/HPF/peak, ducking. Echo base free or tempo-synced (one time for both echo L/R). Stereo Trace face (Wet L/R) like Output. Outlets Dry L/R then Wet L/R. Native C++/WASM.",
    label: "SoEmReverb",
    notes: ["soemdsp", "ModulatedDelay", "tempo sync", "PostDelay", "PreDelay", "Slapback", "native", "trace", "Dry L", "Dry R", "Wet L", "Wet R"],
  },
  pll: {
    category: "clock",
    description: "Phase-locked loop based on the Doepfer A-196. VCO tracks an incoming signal via a phase comparator (XOR, RS flip-flop, or PFD) and one-pole loop filter. Outputs VCO, PC, LPF CV, and lock gate.",
    label: "PLL",
    notes: ["phase locked loop", "A-196", "vco", "frequency tracking"],
  },
  helmholtzPitch: {
    category: "multimeter",
    description: "Monophonic pitch detector using the McLeod Pitch Method (normalized square difference function with parabolic interpolation). Outputs detected frequency and a fidelity score; rejects noisy/non-periodic frames.",
    label: "Pitch Detector",
    notes: ["pitch tracking", "pitch detector", "mcleod", "autocorrelation", "frequency follower"],
  },
  speedColorInertia: {
    category: "multimeter",
    description:
      "Signal speed → color inertia. Face is a solid color plate (Hue/Lightness + Inertia sat), not a trace. Smooth sines stay saturated; saw edges desaturate toward white. Outs: Raw, Speed, Inertia.",
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
    description: "Captures an input value when a trigger rises and holds it until the next trigger.",
    notes: ["triggered capture", "held output", "stepped motion"],
  },
  expAdsr: {
    category: "envelope",
    description:
      "Curve Envelope (full DADSR): delay, attack, decay, sustain, release, Attack/Fall curve shapes, loop. Prefer Attack Decay when you only need A/D + curve. Face shows the gated contour preview.",
    label: "Curve Envelope",
    notes: ["gate input", "target-ratio curves", "loopable envelope", "curve shape", "native", "DADSR", "prefer Attack Decay for simple AD"],
  },
  attackDecay: {
    category: "envelope",
    description:
      "Default easy envelope: Attack, Decay, Curve, Amplitude. Input Gate|Trigger; Cycle Off|Loop|LFO. One-pole vactrol-style slew + γ curve. Canvas face preview.",
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
    description: "FlowerChild-style rectified envelope follower with attack, hold, and decay slew behavior.",
    label: "Envelope Follower",
    notes: ["audio input", "attack hold decay", "signed follower port"],
  },
  linearEnvelope: {
    category: "envelope",
    description: "Straight-line envelope for predictable ramps, fades, gates, and simple motion. Native C++/WASM.",
    label: "Linear Envelope",
    notes: ["gate input", "linear DADSR", "loopable ramp", "native"],
  },
  pluckEnvelope: {
    category: "envelope",
    description: "Fast feedback pluck contour for struck, picked, pinged, and percussive behaviors. Native C++/WASM.",
    label: "Pluck Envelope",
    notes: ["trigger input", "decay energy", "auto release", "native"],
  },
  vactrolEnvelopeSeries: {
    category: "envelope",
    description: "Optical-style control shaper with a 10-way Part switch selecting PerkinElmer VTL5C-series datasheet timing and resistance figures (VTL5C1 through VTL5C10), from the classic fast VTL5C3 to the ~40x-slower VTL5C4. Native C++/WASM.",
    notes: ["light input", "part switch", "dark current", "native"],
  },
  vactrolEnvelopeCustom: {
    category: "envelope",
    description: "Optical-style control shaper with the same attack/release/curve/sensitivity/light offset/dark current knobs as the VTL5C module, but not tied to a named real part -- roll your own hypothetical vactrol. Native C++/WASM.",
    notes: ["light input", "custom vactrol", "dark current", "native"],
  },
  sandboxVisuals: {
    category: "rgb",
    description: "Sink module for routing patch signals into the screen view. Drive shake, dim, color, scope pause/shutoff, or patch X/Y for direct visual motion.",
    notes: ["visual sink", "shake input", "scope pause"],
  },
  screenSpaceShader: {
    category: "rgb",
    description: "Scripted screen-space visual sink. Declare custom inputs and map them into screen shake, dim, color, scope pause, and offset controls.",
    notes: ["scripted visual sink", "custom inputs", "screen shader controls"],
  },
  bloomGlow: {
    category: "rgb",
    description: "Visual sink for routing patch signals into screen dimming, brightness, bloom, and glow response.",
    notes: ["visual sink", "dim input", "bloom and glow"],
  },
  rgbaHsla: {
    category: "rgb",
    description: "Precise color sink with RGB channels, HSL channels, an HSL mix control, and alpha for the screen wash.",
    notes: ["visual sink", "rgb channels", "hsla control"],
  },
  chromaColor: {
    category: "rgb",
    description: "Stylized color sink for chroma-driven screen washes with hue drift, spread, alpha, trace brightness, bloom, and glow.",
    notes: ["visual sink", "chroma wash", "moving color"],
  },
  image: {
    category: "rgb",
    description: "Patch-local image asset node. Route it into Screen Visuals Trace Image to texture phosphor trace dots.",
    notes: ["load image", "save image", "trace texture"],
  },
  canvas: {
    category: "rgb",
    description: "Layered RGBA compositor for images, scopes, shader passes, transforms, and future game-engine surfaces.",
    notes: ["layer compositor", "RGBA output", "shader script"],
  },
  pixelGrid: {
    category: "rgb",
    description:
      "various pixel grid experiments such as splitting pixels via 1 black stroke, creating 3d pixel effects with bevels, etc.",
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
    description: "Multi-mode Display sink. Modes: 2D Trace / 2D Phosphor (X/Y), 1D Trace / Phosphor Dot (Mono). Same face settings as the dedicated modules.",
    label: "Display",
    notes: ["multi-mode", "2D Trace", "2D Phosphor", "1D Trace", "1D Phosphor", "Phosphor Dot", "visual sink"],
  },
  traceDisplay: {
    category: "oscilloscope",
    description: "1D Trace: focused waveform display. Patch any signal into In and inspect the current vector stroke (no phosphor persistence).",
    label: "1D Trace",
    notes: ["1D Trace", "waveform", "display testbed", "input trace"],
  },
  dotOscilloscope: {
    category: "oscilloscope",
    description: "Efficient single-dot phosphor: one soft stamp on the mono energy drawer. Intensity is averaged over the latest capture window (sub-frame brightness), not a single sample snap.",
    label: "Phosphor Dot",
    notes: ["phosphor", "single dot", "sub-frame brightness", "energy drawer"],
  },
  oscilloscopeBank: {
    category: "oscilloscope",
    description: "Work in progress. Phase-vs-amplitude scope for voice-bank sources (Hypersaw today). Wire Phases/Amplitudes/Pans — not polished with the core face stack yet.",
    label: "Oscilloscope Bank",
    notes: ["work in progress", "voice bank scope", "phase vs amplitude", "under construction"],
  },
  videoscope: {
    category: "rgb",
    description: "A triggered oscilloscope for two audio-rate signals (A/B). Ring-buffers both channels, triggers on a configurable level crossing (source A or B, rising or falling), and captures a window around the trigger point. Dot and Line modes draw per-pixel-column min/max stems so brief spikes survive zoomed-out windows; XY mode plots A against B directly. Freeze holds the last captured window. Native C++/WASM.",
    label: "Videoscope",
    notes: ["oscilloscope", "trigger", "dot", "line", "xy", "native", "phosphor display"],
  },
  matrixWaterfall: {
    category: "rgb",
    description: "Self-running matrix rain. Parameter-only (no ports). Fall or Rise. Glyph table + gradient in Display Settings. Clean base for future matrix work.",
    label: "Matrix Waterfall",
    notes: ["rain", "fall", "rise", "parameter only", "glyph table", "gradient", "rgb"],
  },
  matrixDisplay: {
    category: "multimeter",
    description: "Matrix character plate: Info message and Serial Char+Trigger bins (Text Stream). LCD residual on change. No rain. Gradient in Display Settings.",
    label: "Matrix Display",
    notes: ["info plate", "serial", "lcd residual", "text stream", "multimeter"],
  },
  textStream: {
    category: "digital",
    description: "Type a message, emit one character at a time. Char = Unicode code point (integer). Trigger pulses on each new char. Clock advances one char; free-run uses Rate (Hz). Filter Char if you want to mangle the stream.",
    label: "Text Stream",
    notes: ["serial", "character", "digital", "text box"],
  },
  asciiscope: {
    category: "oscilloscope",
    description: "XY character-grid phosphor (standalone asciiscope instrument). Plots X/Y into a cell age map; glyph ramp string is the trail (cold→hot). Decay and Burn are phosphor memory and write hardness.",
    label: "Asciiscope",
    notes: ["xy", "glyph ramp", "phosphor decay", "character trail", "oscilloscope"],
  },
  spectrogram: {
    category: "oscilloscope",
    description: "Regular STFT spectrogram with Thru passthrough (In → face + Thru). Module: Brightness, Min/Max Thresh, Min/Max Freq, History. Display: FFT size, Window, Time/Freq overlap, Freq Scale, gradient presets.",
    label: "Spectrogram",
    notes: ["fft", "spectrum", "frequency waterfall", "spectral display", "thru"],
  },
  valueOscilloscope: {
    category: "oscilloscope",
    description: "Single-value oscilloscope that draws the latest input as one horizontal line across the display.",
    label: "0D Value",
    notes: ["value display", "horizontal line", "latest value"],
  },
  numberReadout: {
    category: "multimeter",
    description: "Phosphor LCD readout (DSEG7 Classic): energy residual + gradient colormap, soft trails, hard plate/live digits. Shows the latest input value.",
    label: "Number Readout",
    notes: [
      "value",
      "value display",
      "latest value",
      "numeric display",
      "numeric value",
      "digital readout",
      "DSEG7 Classic",
      "seven-segment",
      "energy phosphor",
      "gradient map",
      "brightness",
      "decay",
      "LCD plate",
    ],
  },
  lineBurnOscilloscope: {
    category: "oscilloscope",
    description: "1D Phosphor: heart-monitor energy trail. Pen takes Sweep (s) left→right; rising-edge Reset (≥0.5) snaps left. Soft dots fuse into a beam when budget allows.",
    label: "1D Phosphor",
    notes: ["1D Phosphor", "heart monitor", "phosphor sweep", "reset", "brightness", "trail"],
  },
  scope2d: {
    category: "oscilloscope",
    description: "2D Phosphor: XY energy trail (mono energy + gradient LUT). Soft/hard stamps, brightness, trail/ghost residual — the path Lorenz and other attractors use.",
    label: "2D Phosphor",
    notes: ["2D Phosphor", "xy phosphor", "energy drawer", "brightness", "trail"],
  },
  phosphorLight: {
    category: "oscilloscope",
    // Hidden + load-migrated to scope2d. Do not re-enable in shop.
    hidden: true,
    description: "Retired. Opens as 2D Phosphor (scope2d). Use the 2D Phosphor module for new patches.",
    label: "2D Phosphor (legacy)",
    notes: ["legacy", "migrates to scope2d", "hidden"],
  },
  scope2dTrace: {
    category: "oscilloscope",
    description: "Sample-history X/Y oscilloscope for inspecting deterministic 2D traces (instant RGB stroke, no phosphor persistence).",
    label: "2D Trace",
    notes: ["xy trace", "sample history", "2D oscilloscope"],
  },
  badvalMonitor: {
    category: "debug",
    description: "Circuit sentinel. Watches for invalid values (NaN, inf, explode, denormal) and shows a warning on its face when they hit the In jack.",
    notes: ["NaN guard", "infinity guard", "warning face", "debug safety"],
  },
  speakerProtection: {
    category: "debug",
    description: "Hard safety fuse. Trips ear and speaker protection immediately if a wired sample exceeds absolute 1.0.",
    notes: ["speaker safety", "ear protection", "hard limit"],
  },
  textBox: {
    category: "object",
    description: "In-world label plate for prompts, lore, instructions, and electric annotations.",
    notes: ["annotation", "layout", "field notes"],
  },
  animatedTextBox: {
    category: "object",
    description: "Text Box with data-plane Title/Text inputs and a Text Out -- wire it to another Animated Text Box instead of typing it by hand.",
    notes: ["data-plane ports", "port scripts", "wired label"],
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
    source: "public/modules/combResonator/comb-resonator-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/combResonator/comb-resonator-math.js",
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
    source: "public/modules/crossover/crossover-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/crossover/crossover-math.js",
  },
  crossover2: {
    source: "public/modules/crossover/crossover-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/crossover/crossover-math.js",
  },
  crossover3: {
    source: "public/modules/crossover/crossover-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/crossover/crossover-math.js",
  },
  crossover4: {
    source: "public/modules/crossover/crossover-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/crossover/crossover-math.js",
  },
  crossover5: {
    source: "public/modules/crossover/crossover-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/crossover/crossover-math.js",
  },
  crossover6: {
    source: "public/modules/crossover/crossover-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/crossover/crossover-math.js",
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
    source: "public/modules/modeResonator/mode-resonator-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/modeResonator/mode-resonator-math.js",
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
  noiseGenerator: {
    source: "public/modules/noiseGenerator/noise-generator-math.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/noiseGenerator/noise-generator-math.js",
  },
  numberReadout: {
    source: "public/modules/numberReadout/number-readout-register.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/modules/numberReadout/number-readout-register.js",
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
    setNodeGraphViewMode("modular-only");
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
  card.title = entry.visible && entry.implemented
    ? `${spawnLabel}. ${entry.description || "Module reference entry."}`
    : `${entry.label}: ${entry.description || "Module reference entry."}`;
  card.setAttribute("aria-label", entry.visible && entry.implemented
    ? spawnLabel
    : `${entry.label} module unavailable`);
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
  button.className = "scene-context-store-department-card node-module-category-row";
  button.type = "button";
  button.dataset.storeDepartment = departmentId;
  button.title = `${titleText}: module department`;
  button.setAttribute("aria-label", `Open ${titleText} module department.`);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setNodeGraphModuleStoreDepartment(departmentId);
  });

  const title = document.createElement("strong");
  title.className = "scene-context-store-department-title";
  title.textContent = `${emoji}${titleText}`;

  const count = document.createElement("span");
  count.className = "scene-context-store-department-count";
  const workingCount = entries.filter((entry) => entry.visible && entry.implemented).length;
  count.textContent = String(workingCount);

  button.append(title, count);
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

function updateNodeGraphModuleStoreScrollAffordance() {
  const available = document.getElementById("nodeModuleDepartmentList");
  if (!available) {
    return;
  }
  const maxScrollTop = Math.max(0, available.scrollHeight - available.clientHeight);
  const scrollTop = Math.max(0, available.scrollTop);
  available.classList.toggle("can-scroll-up", scrollTop > 1);
  available.classList.toggle("can-scroll-down", scrollTop < maxScrollTop - 1);
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
