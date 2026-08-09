// Pure settings default constants extracted from node-graph-module-scopes.js
// (Phase D). Load BEFORE node-graph-module-scopes.js. No functions.

const nodeGraphTraceDisplayMaxZoomSeconds = 10;

const nodeGraphModuleScopeDefaultSettings = Object.freeze({
  blinkLightShape: "circle",
  brightness: 1,
  cycles: 2,
  gain: 1,
  lineThickness: 1,
  offset: 0,
  oscillatorTraceMode: "frequencyReset",
  pan: 0,
  sync: true,
  timeMs: 20,
});

const nodeGraphModuleScopeDefaultDotCores = Object.freeze({
  dot1: Object.freeze({
    brightness: 4.5,
    color: "#ffffff",
    size: 3.18,
  }),
  traceColor: "#3de0ff",
});

const nodeGraphModuleScopeMinCycles = 1;

const nodeGraphModuleScopeDiscontinuityThreshold = 0.85;

const nodeGraphModuleScopeUnipolarTypes = new Set([
  "badvalMonitor",
  "clock",
  "clockDivider",
  "delayedTrigger",
  "expAdsr",
  "attackDecay",
  "modeResonator",
  "combResonator",
  "waveguide",
  "phaseDisperse",
  "bode",
  "stftBlur",
  "sinepulse",
  "linearEnvelope",
  "midiNotePitch",
  "midiOut",
  "pluckEnvelope",
  "bloomGlow",
  "chromaColor",
  "rgbaHsla",
  "sandboxVisuals",
  "stepSequencer",
  "triggerCounter",
  "triggerDivider",
  "vactrolEnvelopeSeries",
  "vactrolEnvelopeCustom",
]);


/**
 * Shared phosphor stamp defaults for all 1D + 2D phosphor faces
 * (line burn, scope2d, XY pad, value, attractors, …).
 * Bright / Size / Ghost / Trail / Scale / Pixel density / Dot budget.
 */
const nodeGraphScopePhosphorLookDefaults = Object.freeze({
  // Face / gradient floor (stop 0).
  background: "#000004",
  // Peak / tip (stop 1 + dot1Color).
  peakColor: "#fcfdbf",
  // Multi-stop energy→color LUT.
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000004" }),
    Object.freeze({ t: 0.2, color: "#3b0f70" }),
    Object.freeze({ t: 0.4, color: "#8c2981" }),
    Object.freeze({ t: 0.6, color: "#de4968" }),
    Object.freeze({ t: 0.8, color: "#fe9f6d" }),
    Object.freeze({ t: 1, color: "#fcfdbf" }),
  ]),
  // Bright 0…1 (deposit / tip).
  brightness: 0.08,
  // Ghost = dim scorched floor; Trail = hot residual length (0 = no trail).
  ghost: 0.45,
  trail: 0,
  // Size 0…1 diameter map (0 → 1px floor, 1 → full face min side).
  size: 0.02,
  // Stamp blur 0 hard … 1 soft.
  blur: 0.35,
  // Max phosphor stamps / frame (economy spreads when over).
  dotBudget: 2048,
  // Face buffer scale (1 = native layout×dpr; <1 pixelated; 2–4 supersample).
  pixelDensity: 1,
  // Amplitude zoom.
  scale: 1,
  // Thrifty packing by default (Full Dot Economy ON for dense).
  fullDotEconomy: false,
});


const nodeGraphTraceDisplaySettingsDefaults = Object.freeze({
  // Face plate under the stroke (same family as 2D Trace / Phosphor).
  background: nodeGraphScopePhosphorLookDefaults.background,
  brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  // Mono / primary stroke peak (stereo Output still uses L/R identity colors).
  color: nodeGraphScopePhosphorLookDefaults.peakColor,
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  // Output stereo: combine (Meet) | lighter | screen | source-over | multiply | …
  stereoBlend: "combine",
  // Meet always auto from Left/Right (complement + soft screen lift).
  meetColor: "auto",
  secondaryBrightness: nodeGraphScopePhosphorLookDefaults.brightness,
  secondaryColor: "#0000ff",
  secondaryEnabled: true,
  secondarySize: nodeGraphScopePhosphorLookDefaults.size,
  secondaryLineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  cycles: 2,
  // Instant Trace: blur continuum (0 hard … 1 soft).
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // Vector stroke into a density-scaled face buffer (lo-fi look when < 1).
  // Not a phosphor energy grid — still one polyline; density only sets buffer size.
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  padding: 0,
  // Amplitude zoom for quieter signals (1 = full-scale ±1 fills the face).
  scale: nodeGraphScopePhosphorLookDefaults.scale,
  skipDiscontinuities: false,
  // off | left | right | mono — Output stereo chooses which channel triggers the shared window.
  // Non-output single traces treat any non-off as "sync on" for that buffer.
  sourceSync: false,
  syncChannel: "off",
  zoomSeconds: 0.05,
});


const nodeGraphLineBurnSettingsDefaults = Object.freeze({
  // 1D phosphor — same stamp residual stack as 2D phosphor look defaults.
  background: "#000000",
  // Legacy mirrors (burn≡ghost, decay≡1−trail).
  burn: nodeGraphScopePhosphorLookDefaults.ghost,
  decay: 1 - nodeGraphScopePhosphorLookDefaults.trail,
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  // Stamp only real sample hits (no path packing / connective lines).
  dotsOnly: false,
  // Seconds for one full left→right pass (default 2 s).
  sweepSeconds: 2,
});


const nodeGraphTraceDisplayRenderPointBudgetDefault = 4096;


const nodeGraphZeroDBurnSettingsDefaults = Object.freeze({
  background: nodeGraphScopePhosphorLookDefaults.background,
  bipolarBrightness: false,
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  dot1Color: nodeGraphScopePhosphorLookDefaults.peakColor,
  dot1Enabled: true,
  // Phosphor Dot only: large single stamp (~2/3 face min side). Not shared with 2D Phosphor.
  dot1Size: 0.6667,
  // Blur 0 hard … 1 soft (same as 2D Phosphor stamps).
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // 0 = 1×1 pixel … 1 layout×dpr … 4 AA.
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
});


const nodeGraphValueOscilloscopeSettingsDefaults = Object.freeze({
  background: nodeGraphScopePhosphorLookDefaults.background,
  brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  capEnabled: true,
  capLength: 0.16,
  capSize: nodeGraphScopePhosphorLookDefaults.size,
  color: nodeGraphScopePhosphorLookDefaults.peakColor,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  lineLength: 0.88,
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // 0 = 1×1 pixel … 1 layout×dpr … 4 AA.
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  // Amplitude zoom (Y).
  scale: nodeGraphScopePhosphorLookDefaults.scale,
});


const nodeGraphNumberReadoutSettingsDefaults = Object.freeze({
  background: nodeGraphScopePhosphorLookDefaults.background,
  // Bright 0…1: 0 = mid grey, 0.5 = full Hue, 1 = white (never black).
  brightness: 0.5,
  // Live digit “light” — single solid color (not the residual gradient).
  color: nodeGraphScopePhosphorLookDefaults.peakColor,
  // Deposit hang 0…1 (high = long super-exponential hang of previous digits).
  residual: 0.72,
  // Constant 8-skeleton floor energy 0…1 (= gradient stop). Deposits sit on top.
  ghostBrightness: 0.2,
  decimals: 2,
  // How live Light composites over residual gradient (canvas blend / occlude).
  lightBlend: "occlude",
  // Energy → color LUT for ghost floor + deposits (live digits use solid Light).
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
});


/** Knob module face: macro-dial look; colors + rotation are per-node Display Settings. */
const nodeGraphKnobFaceDisplaySettingsDefaults = Object.freeze({
  decimals: 2,
  background: "#000000",
  arcFill: "#f1b84b",
  arcTrack: "#3a3428",
  showLabel: true,
  showReadout: true,
  // Centered arc span (degrees Bias 0→1). Start is always −span/2 (no Offset).
  rotationDegrees: 270,
  // Dial ring size 0…1 (1 = fill available dial cell; label/value unchanged).
  dialSize: 1,
  // Hole size 0…1 (0 = solid disk, ~0.7 default, 1 = thin outer ring).
  innerRadius: 0.7,
});


const nodeGraphSpectrogramFftSizes = Object.freeze([
  128, 256, 512, 1024, 2048, 4096, 8192, 16384,
]);

const nodeGraphSpectrogramSettingsDefaults = Object.freeze({
  fftSize: 1024,
  historySeconds: 2,
  // Choice indices (match worklet tables).
  window: 1, // Hann
  // Time hop index into [1,2,4,8]: default 4× (hop N/4). 0 = none (hop N).
  overlap: 2,
  // Frequency overlap = zero-pad factor on the analysis window (denser Hz grid).
  // 0→1× (no pad), 1→2×, 2→4×. FFT length = min(window×factor, 32768).
  freqOverlap: 0,
  freqScale: 1, // Mel
  // Vertical face maps this Hz band (bottom→top). Zooming the range uses more
  // face pixels on the band of interest (better detail than full Nyquist).
  minFreq: 20,
  maxFreq: 20000,
  // Lowest gradient stop is the face/history "background" — analog pixel burn LUT.
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
});


const nodeGraphScope2dSettingsDefaults = Object.freeze({
  // 2D phosphor — shared look defaults (Bright/Size/Ghost/Trail/Scale/AA/Budget).
  background: "#000000",
  // Ghost/Trail are the Display Settings knobs (UI truth).
  // burn/decay are legacy mirrors (burn≡ghost, decay≡1−trail).
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  burn: nodeGraphScopePhosphorLookDefaults.ghost,
  decay: 1 - nodeGraphScopePhosphorLookDefaults.trail,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  // Peak color = last gradient stop (migration + puck/overlays).
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  // Stamp only real sample hits — never path-pack chords (no connective lines).
  dotsOnly: false,
  // Multi-stop energy→color LUT (site cyan burn ramp).
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.18, color: "#0a2a33" }),
    Object.freeze({ t: 0.55, color: "#3a9aab" }),
    Object.freeze({ t: 1, color: "#75ebff" }),
  ]),
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
});

/**
 * Per-module overrides for 2D Phosphor (scope2d) display defaults.
 * Only fields listed here differ from nodeGraphScope2dSettingsDefaults.
 * (Empty: Lorenz used to force a giant stamp; it inherits Size 0.01 now.)
 */
const nodeGraphModuleScope2dDisplayDefaultOverrides = Object.freeze({
});

/** Full scope2d defaults for a module type (global + optional overrides). */
function nodeGraphScope2dSettingsDefaultsForModuleType(type) {
  const overrides = type
    ? nodeGraphModuleScope2dDisplayDefaultOverrides[type]
    : null;
  if (!overrides) {
    return nodeGraphScope2dSettingsDefaults;
  }
  return Object.freeze({
    ...nodeGraphScope2dSettingsDefaults,
    ...overrides,
  });
}


const nodeGraphXyPadDisplaySettingsDefaults = Object.freeze({
  background: nodeGraphScopePhosphorLookDefaults.background,
  // Ghost = dim scorched floor; Trail = main residual (1 ≈ freeze).
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  // Phosphor beam brightness 0..1.
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  // Peak = last gradient stop (UI overlay tints from this).
  dot1Color: nodeGraphScopePhosphorLookDefaults.peakColor,
  // Phosphor beam diameter (exp size map).
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  // Soft-stamp budget ceiling.
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  // Default ON: always spend dense packing up to Dot budget (hard solid trails).
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  dotsOnly: false,
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
  // Stamp blur 0–1: 0 hard disc, 1 full soft bleed.
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // 0 = single pixel, 1 = layout×dpr, 4 = 4× AA (phosphor face only).
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  // UI puck radius as fraction of face min side (vector overlay, not energy).
  puckSize: 0.045,
});


const nodeGraphScope2dTraceSettingsDefaults = Object.freeze({
  // Same family as PhosphorLight / Number Readout face plate.
  background: nodeGraphScopePhosphorLookDefaults.background,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  dot1Color: nodeGraphScopePhosphorLookDefaults.peakColor,
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  // Closed X/Y orbits (RoundShape, attractors) need ≥1 period on screen.
  // 0.05s only drew a sliver of a 1 Hz Lissajous and looked “broken up”.
  historySeconds: 1,
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // Vector stroke; density scales face buffer for lo-fi/chunky look (default 1).
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
});

/** Optional per-type 2D Trace defaults (e.g. longer history for closed shapes). */
const nodeGraphModuleScope2dTraceDisplayDefaultOverrides = Object.freeze({
  // RoundShape: full closed sine→square orbit; keep a couple of cycles.
  ellipsoid: Object.freeze({
    historySeconds: 2,
  }),
  ellipsoidOsc: Object.freeze({
    historySeconds: 2,
  }),
});

function nodeGraphScope2dTraceSettingsDefaultsForModuleType(type) {
  const overrides = type
    ? nodeGraphModuleScope2dTraceDisplayDefaultOverrides[type]
    : null;
  if (!overrides) {
    return nodeGraphScope2dTraceSettingsDefaults;
  }
  return Object.freeze({
    ...nodeGraphScope2dTraceSettingsDefaults,
    ...overrides,
  });
}


