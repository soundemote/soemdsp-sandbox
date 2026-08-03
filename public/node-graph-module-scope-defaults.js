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


const nodeGraphTraceDisplaySettingsDefaults = Object.freeze({
  // Face plate under the stroke (same family as 2D Trace / Phosphor).
  background: "#000000",
  brightness: 0.92,
  color: "#ff0000",
  dot1Enabled: true,
  dot1Size: 0.08,
  // Output stereo: combine (Meet) | lighter | screen | source-over | multiply | …
  stereoBlend: "combine",
  // Meet always auto from Left/Right (complement + soft screen lift).
  meetColor: "auto",
  secondaryBrightness: 0.92,
  secondaryColor: "#0000ff",
  secondaryEnabled: true,
  secondarySize: 0.08,
  secondaryLineThickness: 0,
  cycles: 2,
  // Trace blur unused (hard stroke only); kept for schema compat / phosphor forms.
  lineThickness: 0,
  // Vector stroke into a density-scaled face buffer (lo-fi look when < 1).
  // Not a phosphor energy grid — still one polyline; density only sets buffer size.
  pixelDensity: 1,
  padding: 0,
  // Amplitude zoom for quieter signals (1 = full-scale ±1 fills the face).
  scale: 1,
  skipDiscontinuities: false,
  // off | left | right | mono — Output stereo chooses which channel triggers the shared window.
  // Non-output single traces treat any non-off as "sync on" for that buffer.
  sourceSync: false,
  syncChannel: "off",
  zoomSeconds: 0.05,
});


const nodeGraphLineBurnSettingsDefaults = Object.freeze({
  background: "#000000",
  // Ghost = dim scorched hang; Trail = main residual (1 ≈ freeze).
  ghost: 0.35,
  trail: 0.7,
  // Amplitude zoom (Y).
  scale: 1,
  // Bright 0…1 (1 = full deposit energy).
  dot1Brightness: 1,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: 0.07,
  lineThickness: 0.2,
  // 0 = 1×1 pixel … 1 layout×dpr … 4 AA (same as 2D Phosphor / Trace).
  pixelDensity: 1,
  // Seconds for one full left→right pass (default 2 s).
  sweepSeconds: 2,
});


const nodeGraphTraceDisplayRenderPointBudgetDefault = 4096;


const nodeGraphZeroDBurnSettingsDefaults = Object.freeze({
  background: "#000000",
  bipolarBrightness: false,
  ghost: 0.4,
  trail: 0.78,
  dot1Brightness: 0.92,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: 0.35,
  // Blur 0 hard … 1 soft (same as 2D Phosphor stamps).
  lineThickness: 0.25,
  // 0 = 1×1 pixel … 1 layout×dpr … 4 AA.
  pixelDensity: 1,
});


const nodeGraphValueOscilloscopeSettingsDefaults = Object.freeze({
  background: "#000000",
  brightness: 0.92,
  ghost: 0.25,
  capEnabled: true,
  capLength: 0.16,
  capSize: 0.08,
  color: "#75ebff",
  trail: 1,
  dot1Enabled: true,
  dot1Size: 0.08,
  lineLength: 0.88,
  lineThickness: 0.2,
  // 0 = 1×1 pixel … 1 layout×dpr … 4 AA.
  pixelDensity: 1,
  // Amplitude zoom (Y).
  scale: 1,
});


const nodeGraphNumberReadoutSettingsDefaults = Object.freeze({
  background: "#000000",
  brightness: 1,
  color: "#75ebff",
  trail: 0.45,
  decimals: 2,
  ghostColor: "#1a4a55",
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.18, color: "#0a2a33" }),
    Object.freeze({ t: 0.55, color: "#3a9aab" }),
    Object.freeze({ t: 1, color: "#75ebff" }),
  ]),
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
  // Lowest gradient stop is the face/history "background" — no separate color.
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.25, color: "#000080" }),
    Object.freeze({ t: 0.5, color: "#00c0ff" }),
    Object.freeze({ t: 0.75, color: "#ffff00" }),
    Object.freeze({ t: 1, color: "#ffffff" }),
  ]),
});


const nodeGraphScope2dSettingsDefaults = Object.freeze({
  // Face plate follows gradient floor (t≈0); kept for plate CSS / migration.
  background: "#000000",
  // Ghost = dim scorched floor; Trail = main residual (1 ≈ freeze).
  ghost: 0.45,
  trail: 0.88,
  dot1Brightness: 0.92,
  // Peak color = last gradient stop (migration + puck/overlays).
  dot1Color: "#75ebff",
  dot1Enabled: true,
  // 0–1 of face min side: 1 = diameter fills the square (same as PhosphorLight).
  dot1Size: 0.08,
  // Soft stamp budget (ceiling). Under load, dots spread evenly (skips), not head-only.
  dotBudget: 2048,
  // Multi-stop energy→color LUT (shared gradient editor).
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.18, color: "#0a2a33" }),
    Object.freeze({ t: 0.55, color: "#3a9aab" }),
    Object.freeze({ t: 1, color: "#75ebff" }),
  ]),
  // Stamp blur 0–1: 0 hard disc, 1 full soft bleed.
  lineThickness: 0.35,
  // 0 = single pixel, 1 = layout×dpr, 4 = 4× AA.
  pixelDensity: 1,
  scale: 1,
});


const nodeGraphXyPadDisplaySettingsDefaults = Object.freeze({
  background: "#000000",
  // Ghost = dim scorched floor; Trail = main residual (1 ≈ freeze).
  ghost: 0.45,
  trail: 0.65,
  // Phosphor beam brightness 0..1.
  dot1Brightness: 0.78,
  // Peak = last gradient stop (UI overlay tints from this).
  dot1Color: "#7fc7d9",
  // Phosphor beam diameter as fraction of face min side (scope stamp size).
  dot1Size: 0.07,
  // Soft-stamp budget ceiling.
  dotBudget: 2048,
  // Default ON: always spend dense packing up to Dot budget (hard solid trails).
  fullDotEconomy: true,
  gradientStops: Object.freeze([
    Object.freeze({ t: 0, color: "#000000" }),
    Object.freeze({ t: 0.18, color: "#0a2830" }),
    Object.freeze({ t: 0.55, color: "#3a8899" }),
    Object.freeze({ t: 1, color: "#7fc7d9" }),
  ]),
  // Stamp blur 0–1: 0 hard disc, 1 full soft bleed.
  lineThickness: 0.42,
  // 0 = single pixel, 1 = layout×dpr, 4 = 4× AA (phosphor face only).
  pixelDensity: 1,
  // UI puck radius as fraction of face min side (vector overlay, not energy).
  puckSize: 0.045,
});


const nodeGraphScope2dTraceSettingsDefaults = Object.freeze({
  // Same family as PhosphorLight / Number Readout face plate.
  background: "#000000",
  dot1Brightness: 0.92,
  dot1Color: "#75ebff",
  dot1Enabled: true,
  dot1Size: 0.08,
  historySeconds: 0.05,
  lineThickness: 0.2,
  // Vector stroke; density scales face buffer for lo-fi/chunky look (default 1).
  pixelDensity: 1,
  scale: 1,
});


