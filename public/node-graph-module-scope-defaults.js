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
 * Shared scope “analog pixel burn” display — full numbers + colors from
 * snowflake 2D Phosphor (Desktop/patches/analog pixel burn snowflake).
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
  // Bright 0…1 (1 = full deposit / tip).
  brightness: 1,
  // Ghost = dim scorched hang; Trail = main residual (hot path length).
  ghost: 0.55,
  trail: 0.5175,
  // Size 0…1 (linear diameter = size × face min side). ~2/3 fills a solid beam.
  size: 0.6667,
  // Stamp blur 0 hard … 1 soft.
  blur: 0.1062,
  // Max phosphor stamps / frame (economy spreads when over).
  dotBudget: 2048,
  // Face buffer supersample (1 = layout×dpr).
  pixelDensity: 1,
  // Amplitude zoom.
  scale: 1,
  fullDotEconomy: true,
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
  background: nodeGraphScopePhosphorLookDefaults.background,
  // Ghost = dim scorched hang; Trail = main residual (1 ≈ freeze).
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  // Amplitude zoom (Y).
  scale: nodeGraphScopePhosphorLookDefaults.scale,
  // Bright 0…1 (1 = full deposit energy).
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  dot1Color: nodeGraphScopePhosphorLookDefaults.peakColor,
  dot1Enabled: true,
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // 0 = 1×1 pixel … 1 layout×dpr … 4 AA (same as 2D Phosphor / Trace).
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
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
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
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
  brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  color: nodeGraphScopePhosphorLookDefaults.peakColor,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  decimals: 2,
  // Unlit segment ink — mid gradient stop for plate contrast.
  ghostColor: "#8c2981",
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
});


const nodeGraphKnobFaceDisplaySettingsDefaults = Object.freeze({
  decimals: 2,
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
  // Lowest gradient stop is the face/history "background" — analog pixel burn LUT.
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
});


const nodeGraphScope2dSettingsDefaults = Object.freeze({
  // Face plate follows gradient floor (t≈0); kept for plate CSS / migration.
  background: nodeGraphScopePhosphorLookDefaults.background,
  // Ghost = dim scorched floor; Trail = main residual (1 ≈ freeze).
  ghost: nodeGraphScopePhosphorLookDefaults.ghost,
  trail: nodeGraphScopePhosphorLookDefaults.trail,
  dot1Brightness: nodeGraphScopePhosphorLookDefaults.brightness,
  // Peak color = last gradient stop (migration + puck/overlays).
  dot1Color: nodeGraphScopePhosphorLookDefaults.peakColor,
  dot1Enabled: true,
  // Exp size map 0…1 (snowflake analog pixel burn).
  dot1Size: nodeGraphScopePhosphorLookDefaults.size,
  // Soft stamp budget (ceiling). Under load, dots spread evenly (skips), not head-only.
  dotBudget: nodeGraphScopePhosphorLookDefaults.dotBudget,
  fullDotEconomy: nodeGraphScopePhosphorLookDefaults.fullDotEconomy,
  // Multi-stop energy→color LUT (shared gradient editor).
  gradientStops: nodeGraphScopePhosphorLookDefaults.gradientStops,
  // Stamp blur 0–1: 0 hard disc, 1 full soft bleed.
  lineThickness: nodeGraphScopePhosphorLookDefaults.blur,
  // 0 = single pixel, 1 = layout×dpr, 4 = 4× AA.
  pixelDensity: nodeGraphScopePhosphorLookDefaults.pixelDensity,
  scale: nodeGraphScopePhosphorLookDefaults.scale,
});

/**
 * Per-module overrides for 2D Phosphor (scope2d) display defaults.
 * Only fields listed here differ from nodeGraphScope2dSettingsDefaults.
 * Lorenz needs a larger beam so the butterfly reads clearly at default scale.
 */
const nodeGraphModuleScope2dDisplayDefaultOverrides = Object.freeze({
  lorenzAttractor: Object.freeze({
    // Exp size map 0…1 — larger than global snowflake default (0.0385).
    dot1Size: 0.2748,
  }),
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


