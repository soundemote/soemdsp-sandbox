// Single source of truth for "what modules exist": every type registered in
// nodeGraphModuleDefinitions is automatically discoverable in the Module
// Browser. There used to be a second, hand-maintained array here that had
// to be kept in sync by hand -- it silently drifted out of sync more than
// once (a real, dispatchable module could sit fully wired and totally
// invisible in the UI with no error anywhere, since nothing here checked
// against nodeGraphModuleDefinitions). Deriving this list removes that
// failure mode entirely: if a module is in the files, it shows up, no
// second registration step to forget.
const nodeGraphModuleStoreTypes = Object.freeze(Object.keys(nodeGraphModuleDefinitions));

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
  { id: "plugin",       emoji: "🔌", label: "Plugin",       symbol: "⧉",   title: "CLAP",     pitch: "Host a real installed CLAP plugin from a local companion process and run your patch's audio through it." },
  { id: "controller",   emoji: "🕹️", label: "Controller",   symbol: "⌘",   title: "Controllers", pitch: "Input devices and control bridges for keyboards, MIDI, gamepads, and external gestures." },
  { id: "gametrigger",  emoji: "♟️", label: "Game Trigger",  symbol: "",    title: "Game Triggers", pitch: "" },
  { id: "portal",       emoji: "🌐", label: "Portal",       symbol: "IO",  title: "Portals",   pitch: "Patch boundary portals for moving left, right, and mono signal lanes between rooms, templates, and larger circuits." },
  { id: "drum",         emoji: "🥁", label: "Drum",         symbol: "▥",   title: "Drum",      pitch: "Rhythm machines, drum voices, pattern engines, and percussion control surfaces." },
  { id: "dynamics",     emoji: "⚡", label: "Dynamics",     symbol: "⚡",   title: "Dynamics",  pitch: "Power routing, level control, offsets, and response shaping for keeping a circuit alive under pressure." },
  { id: "envelope",     emoji: "📐", label: "Envelope",     symbol: "⌒",   title: "Envelope",  pitch: "Attack, decay, sustain, release, and gate-shaped motion. Make sound and visuals breathe on command." },
  { id: "filter",       emoji: "💧", label: "Filter",       symbol: "◫",   title: "Filter",    pitch: "Shape the airframe. Carve mass, reveal brightness, and teach a signal where it is allowed to fly." },
  { id: "space",        emoji: "⛪", label: "Space",        symbol: "FX",  title: "Delay",     pitch: "Delay, reverb, distortion, and performance processors for shaping finished sound." },
  { id: "digital",      emoji: "🔬", label: "Digital",      symbol: "{ }", title: "Digital",   pitch: "Patch-local code surfaces, exact value conversion, and digital/visual programming tools inside the sandbox." },
  { id: "clock",        emoji: "⌚", label: "Clock",        symbol: "♪",   title: "Clock",     pitch: "Clocks, dividers, counters, and trigger timing -- everything that decides WHEN the rest of the patch fires." },
  { id: "modulator",    emoji: "♾️", label: "Modulator",    symbol: "⇄",   title: "Modulator", pitch: "Motion sources for pitch, amplitude, time, and texture. Small control engines that make patches move." },
  { id: "oscillator",   emoji: "⚪", label: "Oscillator",   symbol: "∿",   title: "Oscillator", pitch: "Start with a voice. Tone generators, phase motion, and the raw signal that everything else learns to orbit." },
  { id: "chaos",        emoji: "🌌", label: "Chaos",        symbol: "∞",   title: "Chaos",     pitch: "All the various attractors and strange motion systems. The wild shelf where math starts looking back." },
  { id: "jerobeam",     emoji: "♻️", label: "Jerobeam",     symbol: "JRB", title: "Jerobeam",  pitch: "Jerobeam spiral and orbit motion systems. Spiral Generator lives here." },
  { id: "noise",        emoji: "🌧️", label: "Noise",        symbol: "✦",   title: "Noise",     pitch: "Noise, dust, instability, sparks, and all the useful mess a clean machine secretly needs." },
  { id: "music",        emoji: "🎶", label: "Music",        symbol: "OUT", title: "Music",     pitch: "Music playback, audio sinks, and listening endpoints for turning patch signal into rendered or live sound." },
  { id: "sample",       emoji: "🔊", label: "Sample",       symbol: "▣",   title: "Samples",   pitch: "Audio-file shelf. Empty by default until sandbox has a real file-library flow." },
  { id: "grains",       emoji: "⏳", label: "Grains",       symbol: "",    title: "Grains",    pitch: "" },
  { id: "media",        emoji: "🎞️", label: "Media",        symbol: "",    title: "Media",     pitch: "" },
  { id: "object",       emoji: "🧊", label: "Object",       symbol: "●",   title: "Object",    pitch: "Things you place in the world rather than wire into the signal path -- indicator lights, label plates, and other in-world props." },
  { id: "rgb",          emoji: "🌈", label: "RGB",          symbol: "◍",   title: "RGB",       pitch: "Color sinks for the screen wash — precise RGB/HSL channels or stylized chroma drift, alpha, bloom, and glow." },
  { id: "oscilloscope", emoji: "📺", label: "Oscilloscope", symbol: "OSC", title: "Oscilloscope", pitch: "Dedicated display testbeds for trace, line burn, 2D scope, videoscope, and canvas-style waveform inspection." },
  { id: "multimeter",   emoji: "📟", label: "Multimeter",   symbol: "0D",  title: "Multimeter", pitch: "Single-value readouts. Burn, line, or text display for the latest value on a signal — no waveform, just the number." },
  { id: "debug",        emoji: "🐞", label: "Debug",        symbol: "DBG", title: "Debug",     pitch: "Inspection tools, sentinels, and safety monitors for catching bad values while a patch is under test." },
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
  Audio:             "music",
  "Audio Player":    "music",
  Chaos:             "chaos",
  CLAP:              "plugin",
  Controllers:       "controller",
  Debug:             "debug",
  Delay:             "space",
  Digital:           "digital",
  Drum:              "drum",
  Dynamics:          "dynamics",
  Envelope:          "envelope",
  Filter:            "filter",
  "Game Triggers":   "gametrigger",
  Grains:            "grains",
  Jerobeam:          "jerobeam",
  // "LED" was this department's own name before it widened to Object; keep the
  // alias so stored settings and old patches still resolve.
  LED:               "object",
  Object:            "object",
  Loops:             "sample",
  Modulator:         "modulator",
  Modulators:        "modulator",
  Multimeter:        "multimeter",
  Noise:             "noise",
  Oscillator:        "oscillator",
  Oscilloscope:      "oscilloscope",
  Other:             "digital",
  Portals:           "portal",
  RGB:               "rgb",
  Samples:           "sample",
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
  sinc: {
    category: "oscillator",
    description: "Sinc (sin(x)/x) oscillator. Band Limit mode uses the Dirichlet kernel (periodic sinc) with its harmonic count clamped to Nyquist, so it cannot alias; Ideal mode draws the literal sin(x)/x window, which is the textbook shape but aliases as an oscillator. Useful as a modulation source and for resampling theory demos.",
    label: "Sinc",
    notes: ["sinc", "sin(x)/x", "impulse", "oscillator"],
  },
  osc: {
    category: "modulator",
    description: "Multi-waveform oscillator (saw, ramp, square, triangle, sine, noise) with 0.1V/Oct and increment CV inputs.",
    label: "LFO",
    notes: ["multi-waveform", "cv input"],
  },
  aliasSine: {
    category: "oscillator",
    description: "Bare sine generator with a 0..1.5 normalized-frequency input (fraction of sample rate) that wraps naturally past Nyquist -- aliasing as an explicit, unhidden design choice rather than something to correct for.",
    label: "Alias Sine",
    notes: ["sine", "aliasing", "native"],
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
    category: "oscillator",
    description: "A 3D ellipsoid-orbit oscillator deriving multiple correlated outputs from one elliptical motion path. Native C++/WASM.",
    label: "Ellipsoid",
    notes: ["orbit motion", "multi-output", "native"],
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
    description: "One threshold, eight views of it: continuous Gate/Inverted Gate, a Hold output for steady (unchanging) signal, Up Trig/Down Trig/UpDn Trig pulse outputs on every rising and falling edge, and Last High/Last Low holding the signal's last value on each side of the threshold.",
    label: "Comparator",
    notes: ["gate", "edge detect", "native"],
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
  chordSequencer: {
    category: "clock",
    description: "Steps through a built-in diatonic chord progression on each Clock. Scale outputs the current chord as a 12-bit pitch-class mask (feed it straight into Pitch Quantizer), Root outputs the chord's root as 0.1V/Oct.",
    label: "Chord Sequencer",
    notes: ["chord progression", "digital signal", "scale mask output", "root output"],
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
    category: "clock",
    description: "Latches up to 4 notes from a mono Pitch input one at a time (Latch trigger), then outputs them as stacked simultaneous pitches or arpeggiated in sequence.",
    label: "Chord Memory",
    notes: ["latch", "mono to chord", "step record", "arpeggio output"],
  },
  turingMachine: {
    category: "digital",
    description: "Classic mutating shift-register sequencer: each Clock, the pattern shifts and the new bit is randomly flipped with a set Probability, giving evolving, semi-repeating loops. Also outputs a 12-bit Scale mask.",
    label: "Turing Machine",
    notes: ["generative", "shift register", "mutating pattern", "scale mask output"],
  },
  pitchQuantizer: {
    category: "clock",
    description: "Snaps a 0.1V/Oct pitch signal to the nearest note in a scale. Pick a preset (Major, Minor, Pentatonic...) or feed a 12-bit pitch-class mask into the Scale input.",
    label: "Pitch Quantizer",
    notes: ["quantizer", "scale", "0.1v/oct", "melody from chaos"],
  },
  surgeOscillator: {
    category: "oscillator",
    description: "Anti-aliased Saw/Square/Tri/Sine oscillator with hard sync: a rising zero-crossing on the Sync input forces the phase back near 0, sub-sample-interpolated and PolyBLEP-corrected so the sync reset doesn't alias like a naive hard sync would. Native C++/WASM.",
    label: "Surge Oscillator",
    notes: ["oscillator", "hard sync", "polyblep", "anti-aliasing", "native"],
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
    description: "Stereo noise source with independent left/right channels and selectable uniform, gaussian, brown, pink, and crackle flavors.",
    notes: ["stereo output", "distribution choices", "seed control"],
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
  clapPlugin: {
    category: "plugin",
    description: "Browser-side shell for a local CLAP host plugin. Stores plugin identity and can use a host instance during bounded Render Sample.",
    label: "CLAP Plugin",
    notes: ["local host", "native plugin", "offline render"],
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
    description: "Signal booster and throttle. Use it to push, tame, or route engine power.",
    notes: ["multiplication", "level control", "headroom"],
  },
  gainBias: {
    category: "dynamics",
    description: "Gain and Bias in one module: scale the signal, then offset it. Saves wiring the pair together every time you need to fit a signal into a range.",
    label: "Gain Bias",
    notes: ["multiplication", "offset", "scale and shift", "utility"],
  },
  gainBiasMix: {
    category: "dynamics",
    description: "4-channel utility mixer with per-channel volume and bias, plus 3 bleed sends into output 1. Clean signal routing for multi-voice patches.",
    label: "GainBiasMix",
    notes: ["mixer", "bias", "bleed", "4-channel", "utility"],
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
  rotate3dTo2d: {
    category: "dynamics",
    description: "Rotates an X/Y/Z signal point in 3D and projects the result back to X/Y.",
    label: "Rotation 3D to 2D",
    notes: ["3D rotation", "2D projection", "signal transform"],
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
  valueSlider: {
    category: "controller",
    description: "Resizable bias-output slider for manual control in the modular view and UI view. Search keywords: slider, knob, macro, fader, pot.",
    label: "Value Slider",
    notes: [
      "bias output",
      "resizable widget",
      "manual control",
      "slider",
      "knob",
      "macro",
      "fader",
      "pot",
      "potentiometer",
      "value",
    ],
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
    description: "Reads the ten macro knobs under the modular view and emits M1 through M10 as live 0..1 control signals.",
    label: "Macro Controls",
    notes: ["macro row", "manual control", "ten outputs", "knob", "slider", "macro", "pot"],
  },
  pitchModWheel: {
    category: "controller",
    description: "Reads the separate pitch and mod wheel controls beside the keyboard. Pitch emits -1..1, while mod emits 0..1.",
    label: "Pitch / Mod Wheel",
    notes: ["pitch wheel", "mod wheel", "performance control"],
  },
  samplePlayer: {
    category: "music",
    description: "Patch-local one-shot sample playback. Trigger starts from Start and plays to End with simple click ramps.",
    label: "Sample Player",
    notes: ["sample playback", "one shot", "audio source"],
  },
  audioPlayer: {
    category: "music",
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
    category: "music",
    description: "Patch-local gated sample loop playback with loop bounds, pitch control, and seam crossfade.",
    label: "Sample Looper",
    notes: ["sample playback", "loop", "audio source"],
  },
  passiveFilter: {
    category: "filter",
    description: "1-pole RC filter with LP, HP, and BP modes. Low Cut is the HP edge; High Cut is the LP edge. BP chains HP then LP.",
    notes: ["lowpass", "highpass", "bandpass", "1-pole"],
  },
  papoulisFilter: {
    category: "filter",
    description: "3rd-order Papoulis (Optimum-L) lowpass: monotonic, ripple-free passband like Butterworth but with a faster roll-off for the same order.",
    label: "Papoulis Filter",
    notes: ["lowpass", "optimum-l", "legendre", "monotonic", "3-pole"],
  },
  cookbookFilter: {
    category: "filter",
    description: "RSMET cookbook biquad cascade with mode, frequency, stages, Q, and gain controls plus an in-module response curve.",
    label: "Multi Stage Filter",
    notes: ["mode selection", "biquad stages", "curve display"],
  },
  rsmetFilter: {
    category: "filter",
    description: "A ladder filter preceded by a tanh soft clipper and noise injection stage, with exponential frequency/resonance response curves. 10 modes: LP6/12/18/24, HP6/12/18/24, BP6, BP12.",
    label: "RSMET Filter",
    notes: ["ladder + soft clip", "exponential curves", "10 modes"],
  },
  yellowjacketFilter: {
    category: "filter",
    description: "A feedback-modulated ellipse-oscillator filter through a one-pole stage, with a resonance-vs-frequency curve shaping both the oscillator waveshape and feedback gain. Grindy, easily produces square-wave-like output.",
    label: "Yellowjacket Filter",
    notes: ["ellipse oscillator", "feedback FM", "grindy"],
  },
  superloveFilter: {
    category: "filter",
    description: "A trisaw-oscillator feedback resonator through a multi-pole ladder tap. 4 modes: LP18, LP24, HP6, BP6. Warm, bass-heavy, stably self-oscillating.",
    label: "SuperLove Filter",
    notes: ["trisaw oscillator", "4 modes", "stable self-oscillation"],
  },
  chaoticPhaseLockingFilter: {
    category: "filter",
    description: "A feedback ellipse-waveshaper resonator (no oscillator phasor) through a 12dB lowpass and a DC-blocking highpass. The chaos control drives the ellipse waveshape directly, producing phase-locked chaotic textures.",
    label: "Chaotic Phase Locking Filter",
    notes: ["ellipse waveshaper", "direct feedback", "phase locking"],
  },
  resonatorFilter: {
    category: "filter",
    description: "A dual-phasor FM feedback resonator through a one-pole lowpass and a DC-blocking highpass. 3 modes: Sinusoid, Triangle, Sawtooth -- each a chaotic variation on its namesake waveform.",
    label: "Resonator Filter",
    notes: ["dual-phasor FM", "3 waveform modes", "chaotic"],
  },
  humanFilter: {
    category: "filter",
    description: "A dual-phasor feedback network shaped by a bell/peak filter in the feedback path, with a DC-blocking highpass on the output. 3 modes: BP6, LP6, LP12, differing only in which oscillator combination reaches the output.",
    label: "Human Filter",
    notes: ["dual-phasor feedback", "bell-shaped feedback path", "3 modes"],
  },
  flowerChildFilter: {
    category: "filter",
    description: "Resonant self-oscillating filter built from a feedback-modulated phasor through two cascaded one-pole stages. 4 modes: Clean (sine oscillator), Dirty (reshaped oscillator, hotter output), Rev3 (ellipsoid oscillator with richer resonance shaping), Downsampled (Clean's architecture with a sample-and-hold aliasing stage).",
    label: "Flower Child Filter",
    notes: ["self-oscillating", "4 modes", "feedback FM"],
  },
  pulseExplosion: {
    category: "clock",
    description: "On a rising-edge trigger, schedules a burst of single-sample pulses distributed over Start/Center/End Time, concentrated toward Center by Time Spread (0 = tight, 1 = wide). Each pulse gets its own randomized amplitude between Low and High Amplitude.",
    label: "Pulse Explosion",
    notes: ["trigger burst", "skewed distribution", "randomized amplitude"],
  },
  ladderFilter: {
    category: "filter",
    description: "RSMET ladder filter using the gain-compensated getSample path with frequency, resonance, stage depth, and mode controls.",
    label: "Ladder Filter",
    notes: ["RSMET ladder", "gain compensated", "resonant stages"],
  },
  tb303Filter: {
    category: "filter",
    description: "TB-303 style ladder filter with feedback highpass, resonance skewing, and 15 output modes (LP/HP/BP at 6/12/18/24 dB per octave). Based on Robin Schmidt's TeeBeeFilter.",
    label: "TB-303 Filter",
    notes: ["feedback highpass", "resonance skewed", "15 modes"],
  },
  slewLimiter: {
    category: "filter",
    description: "Limits rising and falling motion independently, turning abrupt changes into shaped ramps.",
    notes: ["up time", "down time", "asymmetric glide"],
  },
  delayEffect: {
    category: "space",
    description: "SOEMDSP-style modulated fractional delay with feedback, wet/dry mix, and diffuse mode. Native C++/WASM.",
    label: "Delay",
    notes: ["modulated delay", "fractional echo", "diffuse mode", "native"],
  },
  pingPongDelay: {
    category: "space",
    description: "Basic stereo ping-pong delay, tempo-synced to the patch transport as a free X/Y fraction of a whole note (with Normal/Dotted/Triplet), plus a millisecond offset as a modulation entry.",
    label: "Ping Pong Delay",
    notes: ["ping pong", "tempo sync", "X/Y division", "dotted/triplet"],
  },
  wallDelay: {
    category: "space",
    description: "Under construction. Geometric room delay / wall verb from a superellipsoid (Rays × Bounces taps per ear). JS prototype only for now — native engine is a placeholder stub.",
    label: "Wall Delay",
    notes: ["under construction", "wall geometry", "binaural", "wall verb"],
  },
  reverbEffect: {
    category: "space",
    description: "Raw Sabrina reverb port: serial diffusion stages with cross-feedback delay, modulation, recycle, and wet/dry mix. Seed randomizes the delay line pattern.",
    label: "Sabrina Reverb",
    notes: ["Sabrina", "serial diffusion", "cross feedback", "seed"],
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
  sampleHold: {
    category: "modulator",
    description: "Captures an input value when a trigger rises and holds it until the next trigger.",
    notes: ["triggered capture", "held output", "stepped motion"],
  },
  expAdsr: {
    category: "envelope",
    description: "Soundemote-style exponential ADSR. Gate it with a clock or pulse and shape the rise and fall curves. Native C++/WASM.",
    label: "Exponential Envelope",
    notes: ["gate input", "target-ratio curves", "loopable envelope", "native"],
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
  // led registers its own catalog entry from public/modules/led/led-register.js
  // -- see node-graph-chromeless-module-registry.js.
  visualOscilloscope: {
    category: "oscilloscope",
    description: "Multi-mode Display sink. Modes: 2D Trace / 2D Phosphor (X/Y), 1D Trace / Phosphor Dot (Mono). Same face settings as the dedicated modules.",
    label: "Display",
    notes: ["multi-mode", "2D Trace", "2D Phosphor", "1D Trace", "Phosphor Dot", "visual sink"],
  },
  traceDisplay: {
    category: "oscilloscope",
    description: "Focused 1D waveform display testbed. Patch any signal into In and inspect the current trace without the full prettyscope renderer.",
    notes: ["1D waveform", "display testbed", "input trace"],
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
  spectrogram: {
    category: "oscilloscope",
    description: "Regular STFT spectrogram. Module: Brightness, Min/Max Thresh. Display: History, FFT size, Window, Overlap, Freq Scale, Smooth, gradient presets.",
    label: "Spectrogram",
    notes: ["fft", "spectrum", "frequency waterfall", "spectral display"],
  },
  valueOscilloscope: {
    category: "oscilloscope",
    description: "Single-value oscilloscope that draws the latest input as one horizontal line across the display.",
    label: "0D Value",
    notes: ["value display", "horizontal line", "latest value"],
  },
  numberReadout: {
    category: "multimeter",
    description: "Phosphor LCD readout (DSEG7 Classic): 0–1 energy burn + gradient colormap, soft trails, hard plate/live digits. Shows the latest input value.",
    label: "Number Readout",
    notes: [
      "numeric display",
      "digital readout",
      "DSEG7 Classic",
      "seven-segment",
      "energy phosphor",
      "gradient map",
      "burn",
      "decay",
      "LCD plate",
      "latest value",
    ],
  },
  lineBurnOscilloscope: {
    category: "oscilloscope",
    description: "Heart-monitor phosphor: pen takes Sweep (s) to cross left→right. Rising-edge Reset (≥0.5) snaps back to the left. Burn, decay, pixel density.",
    label: "1D Burn Dot",
    notes: ["heart monitor", "phosphor sweep", "reset", "burn", "decay"],
  },
  scope2d: {
    category: "oscilloscope",
    description: "XY phosphor scope (mono energy + gradient LUT). Soft/hard stamps, burn, decay, and dwell bleed — the path Lorenz and other attractors use.",
    label: "2D Phosphor",
    notes: ["xy phosphor", "energy drawer", "burn", "decay", "2D scope"],
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
    description: "Circuit sentinel. Watches for invalid values before they spread through the machine.",
    notes: ["NaN guard", "infinity guard", "debug safety"],
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
    nodeGraphModuleStoreTypes.map((type) => [
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
    nodeGraphModuleStoreTypes.map((type) => {
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
const nodeGraphJsSourceEntriesByType = Object.freeze({
  sineWavetable: {
    source: "public/node-graph-oscillator-runtime.js",
    sourceUrl: "https://github.com/soundemote/soemdsp-sandbox/blob/master/public/node-graph-oscillator-runtime.js",
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
  return nodeGraphModuleStoreTypes
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
  if (!nodeGraphModuleStoreTypes.includes(type)) {
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
  const haystack = [
    entry.label,
    entry.type,
    entry.category,
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

function nodeGraphModuleStoreSearchResultOrder(a, b) {
  const implementedDelta = Number(Boolean(b?.implemented)) - Number(Boolean(a?.implemented));
  if (implementedDelta) {
    return implementedDelta;
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
  maxHeight: 760,
});

function normalizeNodeGraphModuleShopWindowSize(size = {}) {
  if (typeof normalizeNodeGraphFloatingWindowSize === "function") {
    return normalizeNodeGraphFloatingWindowSize(size, nodeGraphModuleShopWindowDefaultSize);
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
      Math.min(
        nodeGraphModuleShopWindowDefaultSize.maxHeight,
        Math.round(Number(source.height) || nodeGraphModuleShopWindowDefaultSize.height),
      ),
    ),
  };
}

function applyNodeGraphModuleShopWindowSize(size = {}) {
  const panel = document.getElementById("nodeModuleShopView");
  const normalized = normalizeNodeGraphModuleShopWindowSize(size);
  if (panel) {
    if (typeof applyNodeGraphFloatingWindowSizeVars === "function") {
      applyNodeGraphFloatingWindowSizeVars(panel, "node-module-shop", nodeGraphModuleShopWindowDefaultSize, normalized);
    } else {
      panel.style.setProperty("--node-module-shop-width", `${normalized.width}px`);
      panel.style.setProperty("--node-module-shop-height", `${normalized.height}px`);
    }
    // Same inline-box lock as Command Center after unified seating.
    if (typeof syncNodeGraphFloatingWindowInlineBox === "function") {
      syncNodeGraphFloatingWindowInlineBox(panel, normalized);
    }
  }
  requestAnimationFrame(updateNodeGraphModuleStoreScrollAffordance);
  return normalized;
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
    ? [...publicEntries].sort(nodeGraphModuleStoreSearchResultOrder)
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
